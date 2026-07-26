import * as child_process from "child_process";
import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  buildFormatArgs,
  cleanupDownload,
  downloadVideo,
  pickFormat,
  resolveVideo,
  safeFilename,
  streamVideo,
  translateError,
  ytdlpVersion,
} from "../downloader";

jest.mock("child_process", () => ({
  execFile: jest.fn(),
  spawn: jest.fn(() => ({ stdout: {}, stderr: {}, kill: jest.fn() })),
}));

const execFileMock = child_process.execFile as unknown as jest.Mock;
const spawnMock = child_process.spawn as unknown as jest.Mock;

type ExecFileCb = (err: unknown, stdout: string, stderr: string) => void;

function mockSuccess(stdout: string): void {
  execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
    cb(null, stdout, "");
  });
}

function mockFailure(stderr: string): void {
  execFileMock.mockImplementation((_bin: string, _args: string[], _opts: unknown, cb: ExecFileCb) => {
    cb(new Error("exit 1"), "", stderr);
  });
}

/** İndirmeyi taklit et: -o şablonundaki klasöre gerçek bir dosya bırak. */
function mockDownloadWritingFile(name: string, contents: string): void {
  execFileMock.mockImplementation((_bin: string, args: string[], _opts: unknown, cb: ExecFileCb) => {
    const template = args[args.indexOf("-o") + 1];
    fs.writeFileSync(path.join(path.dirname(template), name), contents);
    cb(null, "", "");
  });
}

const lastExecArgs = (): string[] => execFileMock.mock.calls[execFileMock.mock.calls.length - 1][1];
const tempDirs = (): string[] =>
  fs.readdirSync(os.tmpdir()).filter((d) => d.startsWith("video-indir-"));

beforeEach(() => {
  execFileMock.mockReset();
  spawnMock.mockReset();
  spawnMock.mockReturnValue({ stdout: {}, stderr: {}, kill: jest.fn() });
});

// ── buildFormatArgs ─────────────────────────────────────────────

describe("buildFormatArgs", () => {
  it("forces H.264/AAC so the file is saveable to iPhone Photos", () => {
    const args = buildFormatArgs("500M");
    expect(args[args.indexOf("-S") + 1]).toContain("vcodec:h264");
    expect(args[args.indexOf("-S") + 1]).toContain("acodec:aac");
  });

  it("merges and remuxes to mp4", () => {
    const args = buildFormatArgs("500M");
    expect(args[args.indexOf("--merge-output-format") + 1]).toBe("mp4");
    expect(args[args.indexOf("--remux-video") + 1]).toBe("mp4");
  });

  it("passes through size and resolution limits", () => {
    const args = buildFormatArgs("250M", 720);
    expect(args[args.indexOf("--max-filesize") + 1]).toBe("250M");
    expect(args[args.indexOf("-S") + 1]).toContain("res:720");
  });

  it("never re-encodes", () => {
    expect(buildFormatArgs("500M")).not.toContain("--recode-video");
  });
});

// ── pickFormat ──────────────────────────────────────────────────

describe("pickFormat", () => {
  const progressive = {
    format_id: "22",
    ext: "mp4",
    vcodec: "avc1.64001F",
    acodec: "mp4a.40.2",
    protocol: "https",
    height: 720,
  };

  it("picks stream mode when a progressive H.264 mp4 exists", () => {
    const choice = pickFormat({ formats: [progressive] });
    expect(choice.mode).toBe("stream");
    expect(choice.formatId).toBe("22");
  });

  it("picks the highest resolution under the cap", () => {
    const choice = pickFormat({
      formats: [progressive, { ...progressive, format_id: "18", height: 360 }],
    });
    expect(choice.formatId).toBe("22");
  });

  it("ignores formats above the resolution cap", () => {
    const choice = pickFormat({ formats: [{ ...progressive, height: 2160 }] }, 1080);
    expect(choice.mode).toBe("file");
  });

  it("falls back to file mode for video-only DASH formats", () => {
    const choice = pickFormat({ formats: [{ ...progressive, acodec: "none" }] });
    expect(choice.mode).toBe("file");
  });

  it("falls back to file mode for VP9/WebM", () => {
    const choice = pickFormat({
      formats: [{ ...progressive, ext: "webm", vcodec: "vp9", acodec: "opus" }],
    });
    expect(choice.mode).toBe("file");
  });

  it("never streams HLS — Photos rejects the .ts container", () => {
    const choice = pickFormat({ formats: [{ ...progressive, protocol: "m3u8_native" }] });
    expect(choice.mode).toBe("file");
  });

  it("falls back to file mode when there is no format list", () => {
    expect(pickFormat({}).mode).toBe("file");
    expect(pickFormat(null).mode).toBe("file");
  });
});

// ── translateError ──────────────────────────────────────────────

describe("translateError", () => {
  it("explains bot detection in Turkish", () => {
    expect(translateError("ERROR: Sign in to confirm you're not a bot")).toContain("çerez");
  });

  it("explains private content", () => {
    expect(translateError("ERROR: This video is private")).toContain("gizli");
  });

  it("explains the size limit", () => {
    expect(translateError("File is larger than max-filesize")).toContain("boyut");
  });

  it("falls back to a generic Turkish message", () => {
    expect(translateError("something totally unexpected")).toBe("Video indirilemedi.");
  });

  it("does not throw on empty input", () => {
    expect(translateError("")).toBe("Video indirilemedi.");
  });
});

// ── safeFilename ────────────────────────────────────────────────

describe("safeFilename", () => {
  it("transliterates Turkish characters for the latin-1 header", () => {
    const { ascii } = safeFilename("Çağrı Şöleni ığüö", "mp4");
    expect(ascii).toBe("Cagri Soleni iguo.mp4");
    // eslint-disable-next-line no-control-regex
    expect(/^[\x20-\x7e]+$/.test(ascii)).toBe(true);
  });

  it("keeps the original for the RFC 5987 header", () => {
    expect(safeFilename("Çağrı", "mp4").utf8).toBe("Çağrı.mp4");
  });

  it("strips path separators", () => {
    expect(safeFilename("a/b\\c:d", "mp4").ascii).toBe("a-b-c-d.mp4");
  });

  it("falls back to 'video' for an empty or non-latin title", () => {
    expect(safeFilename("", "mp4").ascii).toBe("video.mp4");
    expect(safeFilename("日本語", "mp4").ascii).toBe("video.mp4");
  });

  it("truncates very long titles", () => {
    expect(safeFilename("a".repeat(300), "mp4").ascii.length).toBeLessThanOrEqual(84);
  });
});

// ── resolveVideo ────────────────────────────────────────────────

describe("resolveVideo", () => {
  it("parses yt-dlp -J output", async () => {
    mockSuccess(
      JSON.stringify({
        title: "Bir LinkedIn Videosu",
        extractor_key: "LinkedIn",
        duration: 95,
        filesize: 12345678,
        ext: "mp4",
        webpage_url: "https://www.linkedin.com/posts/abc/",
      })
    );

    const info = await resolveVideo("https://www.linkedin.com/posts/abc/");
    expect(info?.title).toBe("Bir LinkedIn Videosu");
    expect(info?.extractor).toBe("LinkedIn");
    expect(info?.duration).toBe(95);
  });

  it("falls back to filesize_approx", async () => {
    mockSuccess(JSON.stringify({ title: "x", filesize_approx: 999 }));
    expect((await resolveVideo("https://example.com/v"))?.filesize).toBe(999);
  });

  it("requests single-video metadata, not a playlist", async () => {
    mockSuccess(JSON.stringify({ title: "x" }));
    await resolveVideo("https://example.com/v");
    expect(lastExecArgs()).toContain("--no-playlist");
    expect(lastExecArgs()).toContain("-J");
  });

  it("returns null when yt-dlp exits non-zero", async () => {
    mockFailure("ERROR: Unsupported URL");
    expect(await resolveVideo("https://example.com/v")).toBeNull();
  });

  it("returns null on malformed JSON instead of throwing", async () => {
    mockSuccess("{ this is not json");
    expect(await resolveVideo("https://example.com/v")).toBeNull();
  });
});

// ── streamVideo ─────────────────────────────────────────────────

describe("streamVideo", () => {
  it("writes to stdout so bytes can be piped straight to the response", () => {
    streamVideo("https://example.com/v", "22");
    const args = spawnMock.mock.calls[0][1] as string[];
    expect(args[args.indexOf("-o") + 1]).toBe("-");
    expect(args[args.indexOf("-f") + 1]).toBe("22");
  });

  it("passes the URL as a single argv entry, never through a shell", () => {
    const hostile = "https://example.com/v; rm -rf /";
    streamVideo(hostile, "22");
    const [, args, opts] = spawnMock.mock.calls[0];
    expect(args).toContain(hostile);
    expect((opts as { shell?: boolean }).shell).toBeUndefined();
  });
});

// ── downloadVideo ───────────────────────────────────────────────

describe("downloadVideo", () => {
  it("returns the file produced in the temp directory", async () => {
    mockDownloadWritingFile("Örnek Video.mp4", "fake-mp4-bytes");

    const result = await downloadVideo("https://www.linkedin.com/posts/abc/");
    expect(result).not.toBeNull();
    expect(result!.filename).toBe("Örnek Video.mp4");
    expect(result!.size).toBe(Buffer.byteLength("fake-mp4-bytes"));

    cleanupDownload(result!.dir);
    expect(fs.existsSync(result!.dir)).toBe(false);
  });

  it("applies the iPhone-compatible format args", async () => {
    mockDownloadWritingFile("v.mp4", "x");
    const result = await downloadVideo("https://example.com/v");
    expect(lastExecArgs()).toContain("--merge-output-format");
    expect(lastExecArgs()).toContain("--max-filesize");
    cleanupDownload(result!.dir);
  });

  it("leaves no temp directory behind when yt-dlp fails", async () => {
    const before = tempDirs();
    mockFailure("ERROR: video unavailable");
    expect(await downloadVideo("https://example.com/v")).toBeNull();
    expect(tempDirs()).toEqual(before);
  });

  it("returns null when yt-dlp exits cleanly but writes nothing", async () => {
    mockSuccess("");
    expect(await downloadVideo("https://example.com/v")).toBeNull();
  });

  it("ignores partial .part files", async () => {
    mockDownloadWritingFile("video.mp4.part", "partial");
    expect(await downloadVideo("https://example.com/v")).toBeNull();
  });
});

// ── ytdlpVersion ────────────────────────────────────────────────

describe("ytdlpVersion", () => {
  it("returns the trimmed version string", async () => {
    mockSuccess("2026.07.01\n");
    expect(await ytdlpVersion()).toBe("2026.07.01");
  });

  it("returns null when yt-dlp is missing", async () => {
    mockFailure("ENOENT");
    expect(await ytdlpVersion()).toBeNull();
  });
});
