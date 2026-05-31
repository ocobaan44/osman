import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import {
  readLiveSessions,
  readClaudeCodeSessions,
  readSessionAgents,
  encodeProjectPath,
  listAgents,
} from "../agents";
import { Agent } from "../types";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

// ── helpers ─────────────────────────────────────────────────────────────────

function writeLegacySession(name: string, data: Partial<Agent>): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SESSIONS_DIR, `${name}.json`), JSON.stringify(data));
}

function writeJsonlSession(
  project: string,
  sessionId: string,
  messages: object[]
): void {
  const dir = path.join(PROJECTS_DIR, project);
  fs.mkdirSync(dir, { recursive: true });
  const lines = messages.map((m) => JSON.stringify(m)).join("\n");
  fs.writeFileSync(path.join(dir, `${sessionId}.jsonl`), lines);
}

function cleanDir(dir: string): void {
  fs.rmSync(dir, { recursive: true, force: true });
}

function recentTimestamp(): string {
  return new Date(Date.now() - 60_000).toISOString(); // 1 minute ago
}

function oldTimestamp(): string {
  return new Date(Date.now() - 20 * 60_000).toISOString(); // 20 minutes ago
}

// ── readClaudeCodeSessions ───────────────────────────────────────────────────

describe("readClaudeCodeSessions", () => {
  beforeEach(() => cleanDir(PROJECTS_DIR));
  afterEach(() => cleanDir(PROJECTS_DIR));

  it("returns empty array when projects dir does not exist", () => {
    expect(readClaudeCodeSessions()).toEqual([]);
  });

  it("parses a real .jsonl session file", () => {
    const ts = recentTimestamp();
    writeJsonlSession("-home-user-osman", "sess-uuid-1", [
      { type: "user", uuid: "u1", sessionId: "sess-uuid-1", timestamp: ts, entrypoint: "remote_mobile", gitBranch: "main" },
      { type: "assistant", uuid: "a1", sessionId: "sess-uuid-1", timestamp: ts },
    ]);
    const result = readClaudeCodeSessions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("sess-uuid-1");
    expect(result[0].agentType).toBe("remote_mobile");
    expect(result[0].session_id).toBe("sess-uuid-1");
    expect(result[0].started_at).toBe(ts);
  });

  it("marks recent session as running", () => {
    writeJsonlSession("-home-user-osman", "s1", [
      { type: "user", uuid: "u1", sessionId: "s1", timestamp: recentTimestamp(), entrypoint: "remote_mobile" },
    ]);
    expect(readClaudeCodeSessions()[0].status).toBe("running");
  });

  it("marks old session as done", () => {
    writeJsonlSession("-home-user-osman", "s1", [
      { type: "user", uuid: "u1", sessionId: "s1", timestamp: oldTimestamp(), entrypoint: "remote_mobile" },
    ]);
    expect(readClaudeCodeSessions()[0].status).toBe("done");
  });

  it("filters by project when projectFilter is given", () => {
    writeJsonlSession("-home-user-foo", "s1", [
      { type: "user", uuid: "u1", sessionId: "s1", timestamp: recentTimestamp(), entrypoint: "cli" },
    ]);
    writeJsonlSession("-home-user-bar", "s2", [
      { type: "user", uuid: "u2", sessionId: "s2", timestamp: recentTimestamp(), entrypoint: "cli" },
    ]);
    const result = readClaudeCodeSessions("-home-user-foo");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });

  it("skips empty jsonl files", () => {
    const dir = path.join(PROJECTS_DIR, "-proj");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "empty.jsonl"), "");
    expect(readClaudeCodeSessions()).toHaveLength(0);
  });

  it("skips malformed jsonl lines but keeps valid ones", () => {
    const dir = path.join(PROJECTS_DIR, "-proj");
    fs.mkdirSync(dir, { recursive: true });
    const ts = recentTimestamp();
    fs.writeFileSync(path.join(dir, "mixed.jsonl"),
      `not-json\n{"type":"user","uuid":"u1","sessionId":"mixed","timestamp":"${ts}","entrypoint":"cli"}`
    );
    const result = readClaudeCodeSessions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("mixed");
  });
});

// ── encodeProjectPath ────────────────────────────────────────────────────────

describe("encodeProjectPath", () => {
  it("replaces slashes with dashes", () => {
    expect(encodeProjectPath("/home/user/osman")).toBe("-home-user-osman");
  });
});

// ── readSessionAgents ────────────────────────────────────────────────────────

describe("readSessionAgents", () => {
  beforeEach(() => cleanDir(PROJECTS_DIR));
  afterEach(() => cleanDir(PROJECTS_DIR));

  it("returns agents matching encoded cwd", () => {
    const ts = recentTimestamp();
    writeJsonlSession("-home-user-osman", "s1", [
      { type: "user", uuid: "u1", sessionId: "s1", timestamp: ts, entrypoint: "remote_mobile" },
    ]);
    writeJsonlSession("-other-project", "s2", [
      { type: "user", uuid: "u2", sessionId: "s2", timestamp: ts, entrypoint: "cli" },
    ]);
    const result = readSessionAgents("/home/user/osman");
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("s1");
  });
});

// ── readLiveSessions (legacy format) ────────────────────────────────────────

describe("readLiveSessions — legacy format", () => {
  beforeEach(() => {
    cleanDir(SESSIONS_DIR);
    cleanDir(PROJECTS_DIR);
  });
  afterEach(() => {
    cleanDir(SESSIONS_DIR);
    cleanDir(PROJECTS_DIR);
  });

  it("returns empty array when both dirs do not exist", () => {
    expect(readLiveSessions()).toEqual([]);
  });

  it("parses a valid legacy session file", () => {
    writeLegacySession("sess-abc", {
      id: "agent-abc",
      parent_id: null,
      agentType: "claude",
      status: "running",
      model: "claude-sonnet-4-6",
      session_id: "sess-abc",
      started_at: "2026-05-31T10:00:00Z",
    });
    const result = readLiveSessions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("agent-abc");
    expect(result[0].parent_id).toBeNull();
  });

  it("carries parent_id when set", () => {
    writeLegacySession("sess-child", {
      id: "child-agent",
      parent_id: "parent-agent",
      agentType: "claude",
      status: "idle",
      model: "claude-sonnet-4-6",
      session_id: "sess-child",
      started_at: "2026-05-31T10:00:00Z",
    });
    expect(readLiveSessions()[0].parent_id).toBe("parent-agent");
  });

  it("skips malformed JSON files", () => {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SESSIONS_DIR, "bad.json"), "not-json");
    expect(readLiveSessions()).toHaveLength(0);
  });

  it("skips files missing required fields", () => {
    writeLegacySession("incomplete", { id: "only-id" });
    expect(readLiveSessions()).toHaveLength(0);
  });
});

// ── listAgents --json ────────────────────────────────────────────────────────

describe("listAgents --json", () => {
  beforeEach(() => {
    cleanDir(SESSIONS_DIR);
    cleanDir(PROJECTS_DIR);
  });
  afterEach(() => {
    cleanDir(SESSIONS_DIR);
    cleanDir(PROJECTS_DIR);
  });

  it("outputs valid JSON array when --json is set", () => {
    writeLegacySession("s1", {
      id: "a1",
      parent_id: null,
      agentType: "claude",
      status: "running",
      model: "claude-sonnet-4-6",
      session_id: "s1",
      started_at: "2026-05-31T10:00:00Z",
    });

    const chunks: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(chunk as string);
      return true;
    });
    listAgents({ json: true, all: false });
    jest.restoreAllMocks();

    const parsed = JSON.parse(chunks.join("")) as Agent[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe("a1");
  });

  it("filters out done/error sessions without --all", () => {
    writeLegacySession("done-sess", {
      id: "done-agent",
      parent_id: null,
      agentType: "claude",
      status: "done",
      model: "claude-haiku-4-5-20251001",
      session_id: "done-sess",
      started_at: "2026-05-31T09:00:00Z",
    });

    const chunks: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(chunk as string);
      return true;
    });
    listAgents({ json: true, all: false });
    jest.restoreAllMocks();

    const parsed = JSON.parse(chunks.join("")) as Agent[];
    expect(parsed).toHaveLength(0);
  });

  it("includes done sessions with --all", () => {
    writeLegacySession("done-sess", {
      id: "done-agent",
      parent_id: null,
      agentType: "claude",
      status: "done",
      model: "claude-haiku-4-5-20251001",
      session_id: "done-sess",
      started_at: "2026-05-31T09:00:00Z",
    });

    const chunks: string[] = [];
    jest.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(chunk as string);
      return true;
    });
    listAgents({ json: true, all: true });
    jest.restoreAllMocks();

    const parsed = JSON.parse(chunks.join("")) as Agent[];
    expect(parsed).toHaveLength(1);
  });
});
