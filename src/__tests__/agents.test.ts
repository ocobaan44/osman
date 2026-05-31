import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { readLiveSessions, listAgents } from "../agents";
import { Agent } from "../types";

const SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");

function writeSession(name: string, data: Partial<Agent>): void {
  fs.mkdirSync(SESSIONS_DIR, { recursive: true });
  fs.writeFileSync(path.join(SESSIONS_DIR, `${name}.json`), JSON.stringify(data));
}

function cleanSessions(): void {
  if (fs.existsSync(SESSIONS_DIR)) {
    for (const f of fs.readdirSync(SESSIONS_DIR)) {
      fs.unlinkSync(path.join(SESSIONS_DIR, f));
    }
  }
}

describe("readLiveSessions", () => {
  beforeEach(cleanSessions);
  afterEach(cleanSessions);

  it("returns empty array when sessions dir does not exist", () => {
    fs.rmSync(SESSIONS_DIR, { recursive: true, force: true });
    expect(readLiveSessions()).toEqual([]);
  });

  it("parses a valid session file", () => {
    const session: Agent = {
      id: "agent-abc",
      parent_id: null,
      status: "running",
      model: "claude-sonnet-4-6",
      session_id: "sess-abc",
      started_at: "2026-05-31T10:00:00Z",
    };
    writeSession("sess-abc", session);
    const result = readLiveSessions();
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe("agent-abc");
    expect(result[0].parent_id).toBeNull();
  });

  it("carries parent_id when set", () => {
    const session: Agent = {
      id: "child-agent",
      parent_id: "parent-agent",
      status: "idle",
      model: "claude-sonnet-4-6",
      session_id: "sess-child",
      started_at: "2026-05-31T10:00:00Z",
    };
    writeSession("sess-child", session);
    const result = readLiveSessions();
    expect(result[0].parent_id).toBe("parent-agent");
  });

  it("skips malformed JSON files", () => {
    fs.mkdirSync(SESSIONS_DIR, { recursive: true });
    fs.writeFileSync(path.join(SESSIONS_DIR, "bad.json"), "not-json");
    expect(readLiveSessions()).toHaveLength(0);
  });

  it("skips files missing required fields", () => {
    writeSession("incomplete", { id: "only-id" });
    expect(readLiveSessions()).toHaveLength(0);
  });
});

describe("listAgents --json", () => {
  beforeEach(cleanSessions);
  afterEach(cleanSessions);

  it("outputs valid JSON array when --json is set", () => {
    writeSession("s1", {
      id: "a1",
      parent_id: null,
      status: "running",
      model: "claude-sonnet-4-6",
      session_id: "s1",
      started_at: "2026-05-31T10:00:00Z",
    });

    const chunks: string[] = [];
    const originalWrite = process.stdout.write.bind(process.stdout);
    jest.spyOn(process.stdout, "write").mockImplementation((chunk) => {
      chunks.push(chunk as string);
      return true;
    });

    listAgents({ json: true, all: false });

    process.stdout.write = originalWrite;
    const parsed = JSON.parse(chunks.join("")) as Agent[];
    expect(Array.isArray(parsed)).toBe(true);
    expect(parsed[0].id).toBe("a1");
  });

  it("filters out done/error sessions without --all", () => {
    writeSession("done-sess", {
      id: "done-agent",
      parent_id: null,
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
    writeSession("done-sess", {
      id: "done-agent",
      parent_id: null,
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
