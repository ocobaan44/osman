import * as dns from "dns";
import * as http from "http";
import { EventEmitter } from "events";
import { PassThrough } from "stream";
import { createServer } from "../server";
import * as downloader from "../downloader";

jest.mock("dns", () => ({ promises: { lookup: jest.fn() } }));

jest.mock("../downloader", () => ({
  cookiesStatus: jest.fn(() => ({ present: false, ageDays: null })),
  probe: jest.fn(),
  pickFormat: jest.fn(),
  streamVideo: jest.fn(),
  downloadVideo: jest.fn(),
  cleanupDownload: jest.fn(),
  toVideoInfo: jest.fn((raw: Record<string, unknown>) => ({
    title: (raw?.title as string) ?? "video",
    extractor: "Test",
    duration: (raw?.duration as number) ?? null,
    filesize: null,
    ext: "mp4",
    webpage_url: "https://example.com/v",
  })),
  safeFilename: jest.fn((title: string, ext: string) => ({
    ascii: `${title}.${ext}`,
    utf8: `${title}.${ext}`,
  })),
  translateError: jest.fn(() => "Video indirilemedi."),
}));

const lookupMock = dns.promises.lookup as unknown as jest.Mock;
const probeMock = downloader.probe as unknown as jest.Mock;
const pickFormatMock = downloader.pickFormat as unknown as jest.Mock;
const streamVideoMock = downloader.streamVideo as unknown as jest.Mock;

const TOKEN = "gizli-test-tokeni";

interface Response {
  status: number;
  body: string;
  headers: http.IncomingHttpHeaders;
}

function get(port: number, path: string, headers: Record<string, string> = {}): Promise<Response> {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: "127.0.0.1", port, path, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on("data", (c: Buffer) => chunks.push(c));
      res.on("end", () =>
        resolve({
          status: res.statusCode ?? 0,
          body: Buffer.concat(chunks).toString("utf8"),
          headers: res.headers,
        })
      );
    });
    req.on("error", reject);
    req.end();
  });
}

/** yt-dlp alt sürecini taklit eden sahte ChildProcess. */
function fakeChild(): { child: EventEmitter & { stdout: PassThrough; stderr: PassThrough; kill: jest.Mock } } {
  const child = new EventEmitter() as EventEmitter & {
    stdout: PassThrough;
    stderr: PassThrough;
    kill: jest.Mock;
  };
  child.stdout = new PassThrough();
  child.stderr = new PassThrough();
  child.kill = jest.fn();
  return { child };
}

let server: http.Server;
let port: number;

function listen(maxConcurrent = 2): Promise<void> {
  return new Promise((resolve) => {
    server = createServer({ port: 0, token: TOKEN, maxConcurrent });
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      port = typeof address === "object" && address ? address.port : 0;
      resolve();
    });
  });
}

beforeEach(async () => {
  jest.clearAllMocks();
  lookupMock.mockResolvedValue([{ address: "93.184.216.34", family: 4 }]);
  await listen();
});

afterEach(() => {
  server?.close();
});

// ── /health ─────────────────────────────────────────────────────

describe("GET /health", () => {
  it("answers without a token so uptime pings stay cheap", async () => {
    const res = await get(port, "/health");
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).ok).toBe(true);
  });

  it("never invokes yt-dlp", async () => {
    await get(port, "/health");
    expect(probeMock).not.toHaveBeenCalled();
  });
});

// ── kurulum sayfası ─────────────────────────────────────────────

describe("GET /", () => {
  it("serves the setup page with the token already filled in", async () => {
    const res = await get(port, `/?t=${encodeURIComponent(TOKEN)}`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toContain(`/indir?t=${encodeURIComponent(TOKEN)}`);
  });

  it("is also reachable at /kestirme", async () => {
    expect((await get(port, `/kestirme?t=${encodeURIComponent(TOKEN)}`)).status).toBe(200);
  });

  // Sayfa token'ı ekrana bastığı için korunmazsa token koruması tümden anlamsızlaşır:
  // Render alt alan adları CT loglarında herkese açık, yani adres sır değil.
  it("never leaks the token to an unauthenticated visitor", async () => {
    const res = await get(port, "/");
    expect(res.status).toBe(401);
    expect(res.body).not.toContain(TOKEN);
  });

  it("rejects a wrong token on the setup page too", async () => {
    const res = await get(port, "/?t=yanlis");
    expect(res.status).toBe(401);
    expect(res.body).not.toContain(TOKEN);
  });

  it("keeps the setup page out of caches and search engines", async () => {
    const res = await get(port, `/?t=${encodeURIComponent(TOKEN)}`);
    expect(res.headers["cache-control"]).toBe("no-store");
    expect(res.headers["x-robots-tag"]).toBe("noindex");
  });
});

// ── kimlik doğrulama ────────────────────────────────────────────

describe("auth", () => {
  it("rejects a request with no token", async () => {
    const res = await get(port, "/indir?url=https://example.com/v");
    expect(res.status).toBe(401);
  });

  it("rejects a wrong token", async () => {
    const res = await get(port, `/indir?t=yanlis&url=https://example.com/v`);
    expect(res.status).toBe(401);
  });

  it("accepts the token via header instead of query string", async () => {
    probeMock.mockResolvedValue({ raw: { title: "x" }, stderr: "" });
    const res = await get(port, "/bilgi?url=https://example.com/v", { "x-indir-token": TOKEN });
    expect(res.status).toBe(200);
  });

  it("does not run yt-dlp for an unauthorized request", async () => {
    await get(port, "/indir?url=https://example.com/v");
    expect(probeMock).not.toHaveBeenCalled();
  });
});

// ── URL doğrulama ───────────────────────────────────────────────

describe("URL validation", () => {
  it("rejects a missing URL", async () => {
    const res = await get(port, `/indir?t=${TOKEN}`);
    expect(res.status).toBe(400);
  });

  it("rejects cloud metadata addresses", async () => {
    const res = await get(port, `/indir?t=${TOKEN}&url=${encodeURIComponent("http://169.254.169.254/")}`);
    expect(res.status).toBe(400);
    expect(probeMock).not.toHaveBeenCalled();
  });

  it("rejects a host that resolves to a private address", async () => {
    lookupMock.mockResolvedValue([{ address: "127.0.0.1", family: 4 }]);
    const res = await get(port, `/indir?t=${TOKEN}&url=${encodeURIComponent("https://evil.example.com/v")}`);
    expect(res.status).toBe(400);
  });
});

// ── /bilgi ──────────────────────────────────────────────────────

describe("GET /bilgi", () => {
  it("returns metadata as JSON", async () => {
    probeMock.mockResolvedValue({ raw: { title: "Bir Video", duration: 42 }, stderr: "" });
    const res = await get(port, `/bilgi?t=${TOKEN}&url=https://example.com/v`);
    expect(res.status).toBe(200);
    expect(JSON.parse(res.body).title).toBe("Bir Video");
  });

  it("reports a Turkish error when yt-dlp fails", async () => {
    probeMock.mockResolvedValue({ raw: null, stderr: "ERROR: Unsupported URL" });
    const res = await get(port, `/bilgi?t=${TOKEN}&url=https://example.com/v`);
    expect(res.status).toBe(502);
    expect(JSON.parse(res.body).ok).toBe(false);
  });
});

// ── /indir akış modu ────────────────────────────────────────────

describe("GET /indir (stream mode)", () => {
  it("streams mp4 with a download filename", async () => {
    probeMock.mockResolvedValue({ raw: { title: "Test Video" }, stderr: "" });
    pickFormatMock.mockReturnValue({ mode: "stream", formatId: "22", reason: "t" });

    const { child } = fakeChild();
    streamVideoMock.mockImplementation(() => {
      setTimeout(() => {
        child.stdout.write(Buffer.from("mp4-bytes"));
        child.stdout.end();
        child.emit("close", 0);
      }, 10);
      return child;
    });

    const res = await get(port, `/indir?t=${TOKEN}&url=https://example.com/v`);
    expect(res.status).toBe(200);
    expect(res.headers["content-type"]).toBe("video/mp4");
    expect(res.headers["content-disposition"]).toContain(".mp4");
    expect(res.body).toBe("mp4-bytes");
  });

  it("returns a JSON error when yt-dlp dies before producing any bytes", async () => {
    probeMock.mockResolvedValue({ raw: { title: "x" }, stderr: "" });
    pickFormatMock.mockReturnValue({ mode: "stream", formatId: "22", reason: "t" });

    const { child } = fakeChild();
    streamVideoMock.mockImplementation(() => {
      setTimeout(() => {
        child.stderr.write("ERROR: video unavailable");
        child.emit("close", 1);
      }, 10);
      return child;
    });

    const res = await get(port, `/indir?t=${TOKEN}&url=https://example.com/v`);
    expect(res.status).toBe(502);
    expect(JSON.parse(res.body).ok).toBe(false);
  });
});

// ── uzun video koruması ─────────────────────────────────────────

describe("GET /indir (file mode)", () => {
  it("refuses very long videos instead of risking an iOS idle timeout", async () => {
    probeMock.mockResolvedValue({ raw: { title: "Uzun", duration: 7200 }, stderr: "" });
    pickFormatMock.mockReturnValue({ mode: "file", reason: "birleştirme gerekli" });

    const res = await get(port, `/indir?t=${TOKEN}&url=https://example.com/v`);
    expect(res.status).toBe(413);
    expect(JSON.parse(res.body).error).toContain("hizli");
  });

  it("rejects fast mode when no progressive format exists", async () => {
    probeMock.mockResolvedValue({ raw: { title: "x" }, stderr: "" });
    pickFormatMock.mockReturnValue({ mode: "file", reason: "yok" });

    const res = await get(port, `/indir?t=${TOKEN}&k=hizli&url=https://example.com/v`);
    expect(res.status).toBe(415);
  });
});

// ── eşzamanlılık ────────────────────────────────────────────────

describe("concurrency limit", () => {
  it("returns 429 once the worker slots are busy", async () => {
    server.close();
    await listen(1);

    let releaseProbe: () => void = () => undefined;
    probeMock.mockImplementation(
      () => new Promise((resolve) => {
        releaseProbe = () => resolve({ raw: { title: "x" }, stderr: "" });
      })
    );
    pickFormatMock.mockReturnValue({ mode: "file", reason: "x" });

    const first = get(port, `/bilgi?t=${TOKEN}&url=https://example.com/v`);
    await new Promise((r) => setTimeout(r, 50));
    const second = await get(port, `/bilgi?t=${TOKEN}&url=https://example.com/v`);

    expect(second.status).toBe(429);

    releaseProbe();
    await first;
  });
});

// ── bilinmeyen adres ────────────────────────────────────────────

describe("unknown routes", () => {
  it("returns 404 as JSON", async () => {
    const res = await get(port, "/olmayan");
    expect(res.status).toBe(404);
    expect(JSON.parse(res.body).ok).toBe(false);
  });
});
