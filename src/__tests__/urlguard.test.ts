import * as dns from "dns";
import {
  checkUrl,
  extractUrl,
  isBlockedHostname,
  isPrivateIpv4,
  isPrivateIpv6,
  normalizeUrl,
} from "../urlguard";

jest.mock("dns", () => ({
  promises: { lookup: jest.fn() },
}));

const lookupMock = dns.promises.lookup as unknown as jest.Mock;

/** DNS'i taklit et: hostname verilen adreslere çözülsün. */
function mockLookup(...addresses: { address: string; family: number }[]): void {
  lookupMock.mockResolvedValue(addresses);
}

beforeEach(() => {
  lookupMock.mockReset();
  mockLookup({ address: "93.184.216.34", family: 4 });
});

// ── extractUrl ──────────────────────────────────────────────────

describe("extractUrl", () => {
  it("pulls the URL out of shared text", () => {
    expect(extractUrl("Şu videoya bak https://x.com/i/status/123 harika")).toBe(
      "https://x.com/i/status/123"
    );
  });

  it("returns a bare URL unchanged", () => {
    expect(extractUrl("https://example.com/v")).toBe("https://example.com/v");
  });

  it("returns null when there is no URL", () => {
    expect(extractUrl("merhaba dünya")).toBeNull();
    expect(extractUrl("")).toBeNull();
  });
});

// ── normalizeUrl ────────────────────────────────────────────────

describe("normalizeUrl", () => {
  it("drops the whole query string on LinkedIn", () => {
    expect(normalizeUrl("https://www.linkedin.com/posts/abc-123/?utm_source=share&rcm=x")).toBe(
      "https://www.linkedin.com/posts/abc-123/"
    );
  });

  it("keeps meaningful query params on YouTube", () => {
    const result = normalizeUrl("https://www.youtube.com/watch?v=abc123&utm_source=share");
    expect(result).toContain("v=abc123");
    expect(result).not.toContain("utm_source");
  });

  it("strips tracking params but keeps the rest", () => {
    const result = normalizeUrl("https://example.com/v?id=7&fbclid=xyz&igshid=q");
    expect(result).toContain("id=7");
    expect(result).not.toContain("fbclid");
    expect(result).not.toContain("igshid");
  });

  it("drops the fragment", () => {
    expect(normalizeUrl("https://example.com/v#t=30")).toBe("https://example.com/v");
  });

  it("rejects non-http schemes", () => {
    expect(normalizeUrl("file:///etc/passwd")).toBeNull();
    expect(normalizeUrl("ftp://example.com/v")).toBeNull();
  });

  it("returns null for garbage", () => {
    expect(normalizeUrl("merhaba")).toBeNull();
    expect(normalizeUrl("")).toBeNull();
  });
});

// ── IP aralıkları ───────────────────────────────────────────────

describe("isPrivateIpv4", () => {
  it("flags loopback, private and cloud-metadata ranges", () => {
    expect(isPrivateIpv4("127.0.0.1")).toBe(true);
    expect(isPrivateIpv4("10.1.2.3")).toBe(true);
    expect(isPrivateIpv4("172.16.0.1")).toBe(true);
    expect(isPrivateIpv4("192.168.1.1")).toBe(true);
    expect(isPrivateIpv4("169.254.169.254")).toBe(true);
    expect(isPrivateIpv4("0.0.0.0")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateIpv4("93.184.216.34")).toBe(false);
    expect(isPrivateIpv4("8.8.8.8")).toBe(false);
    expect(isPrivateIpv4("172.32.0.1")).toBe(false);
  });
});

describe("isPrivateIpv6", () => {
  it("flags loopback, unique-local and link-local", () => {
    expect(isPrivateIpv6("::1")).toBe(true);
    expect(isPrivateIpv6("fd00::1")).toBe(true);
    expect(isPrivateIpv6("fe80::1")).toBe(true);
  });

  it("flags IPv4-mapped private addresses", () => {
    expect(isPrivateIpv6("::ffff:127.0.0.1")).toBe(true);
    expect(isPrivateIpv6("::ffff:169.254.169.254")).toBe(true);
  });

  it("allows public addresses", () => {
    expect(isPrivateIpv6("2606:2800:220:1:248:1893:25c8:1946")).toBe(false);
  });
});

// ── isBlockedHostname ───────────────────────────────────────────

describe("isBlockedHostname", () => {
  it("blocks localhost and internal names", () => {
    expect(isBlockedHostname("localhost")).toBe(true);
    expect(isBlockedHostname("metadata.google.internal")).toBe(true);
    expect(isBlockedHostname("printer.local")).toBe(true);
  });

  it("blocks private IP literals", () => {
    expect(isBlockedHostname("169.254.169.254")).toBe(true);
    expect(isBlockedHostname("127.0.0.1")).toBe(true);
  });

  it("allows normal hosts", () => {
    expect(isBlockedHostname("www.linkedin.com")).toBe(false);
    expect(isBlockedHostname("youtube.com")).toBe(false);
  });
});

// ── checkUrl ────────────────────────────────────────────────────

describe("checkUrl", () => {
  it("accepts a public LinkedIn post and returns the normalized URL", async () => {
    const result = await checkUrl("https://www.linkedin.com/posts/abc-123/?utm_source=share");
    expect(result.ok).toBe(true);
    expect(result.url).toBe("https://www.linkedin.com/posts/abc-123/");
  });

  it("rejects cloud metadata by literal without a DNS lookup", async () => {
    const result = await checkUrl("http://169.254.169.254/latest/meta-data/");
    expect(result.ok).toBe(false);
    expect(lookupMock).not.toHaveBeenCalled();
  });

  it("rejects a public hostname that resolves to a private address", async () => {
    mockLookup({ address: "127.0.0.1", family: 4 });
    const result = await checkUrl("https://evil.example.com/v");
    expect(result.ok).toBe(false);
  });

  it("rejects when any resolved address is private", async () => {
    mockLookup({ address: "93.184.216.34", family: 4 }, { address: "10.0.0.5", family: 4 });
    expect((await checkUrl("https://mixed.example.com/v")).ok).toBe(false);
  });

  it("rejects when DNS resolution fails", async () => {
    lookupMock.mockRejectedValue(new Error("ENOTFOUND"));
    expect((await checkUrl("https://nope.example.com/v")).ok).toBe(false);
  });

  it("rejects non-http schemes with a Turkish message", async () => {
    const result = await checkUrl("file:///etc/passwd");
    expect(result.ok).toBe(false);
    expect(result.error).toContain("bağlantı");
  });
});
