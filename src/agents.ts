import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Agent, AgentStatus, AgentsListOptions } from "./types";

const CLAUDE_DIR = path.join(os.homedir(), ".claude");
const SESSIONS_DIR = path.join(CLAUDE_DIR, "sessions");
const PROJECTS_DIR = path.join(CLAUDE_DIR, "projects");

// Encodes a filesystem path the way Claude Code does for project directory names.
// e.g. /home/user/osman → -home-user-osman
export function encodeProjectPath(dir: string): string {
  return dir.replace(/\//g, "-");
}

interface JsonlMessage {
  type: "user" | "assistant";
  uuid: string;
  parentUuid?: string;
  isSidechain?: boolean;
  sessionId: string;
  timestamp: string;
  entrypoint?: string;
  gitBranch?: string;
}

// Reads all messages from a .jsonl file, silently skipping malformed lines.
function readJsonlMessages(filePath: string): JsonlMessage[] {
  const messages: JsonlMessage[] = [];
  try {
    const lines = fs.readFileSync(filePath, "utf8").split("\n").filter(Boolean);
    for (const line of lines) {
      try {
        messages.push(JSON.parse(line) as JsonlMessage);
      } catch {
        // skip malformed line
      }
    }
  } catch {
    // skip unreadable file
  }
  return messages;
}

function inferStatusFromTimestamp(lastTimestamp: string): AgentStatus {
  const age = Date.now() - new Date(lastTimestamp).getTime();
  return age < 10 * 60 * 1000 ? "running" : "done";
}

// Reads real Claude Code sessions from
// ~/.claude/projects/<project>/<uuid>.jsonl
export function readClaudeCodeSessions(projectFilter?: string): Agent[] {
  if (!fs.existsSync(PROJECTS_DIR)) return [];

  const agents: Agent[] = [];

  for (const project of fs.readdirSync(PROJECTS_DIR)) {
    if (projectFilter && project !== projectFilter) continue;
    const projectPath = path.join(PROJECTS_DIR, project);
    if (!fs.statSync(projectPath).isDirectory()) continue;

    for (const file of fs.readdirSync(projectPath)) {
      if (!file.endsWith(".jsonl")) continue;
      const filePath = path.join(projectPath, file);
      const messages = readJsonlMessages(filePath);
      if (messages.length === 0) continue;

      const first = messages[0];
      const last = messages[messages.length - 1];
      const sessionId = file.replace(/\.jsonl$/, "");

      agents.push({
        id: sessionId,
        parent_id: null,
        agentType: first.entrypoint ?? "unknown",
        status: inferStatusFromTimestamp(last.timestamp),
        model: "unknown",
        session_id: sessionId,
        started_at: first.timestamp,
        description: `${project} @ ${first.gitBranch ?? "unknown"}`,
      });
    }
  }

  return agents;
}

// Reads legacy sessions from ~/.claude/sessions/*.json
export function readLegacySessions(): Agent[] {
  if (!fs.existsSync(SESSIONS_DIR)) return [];

  const sessions: Agent[] = [];
  for (const entry of fs.readdirSync(SESSIONS_DIR)) {
    const sessionPath = path.join(SESSIONS_DIR, entry);
    try {
      const raw = fs.readFileSync(sessionPath, "utf8");
      const data = JSON.parse(raw) as Partial<Agent>;
      if (data.id && data.status) {
        sessions.push({
          id: data.id,
          parent_id: data.parent_id ?? null,
          agentType: data.agentType ?? "unknown",
          status: data.status,
          model: data.model ?? "unknown",
          session_id: data.session_id ?? entry.replace(/\.json$/, ""),
          started_at: data.started_at ?? new Date().toISOString(),
          description: data.description,
        });
      }
    } catch {
      // skip malformed session files
    }
  }
  return sessions;
}

// Merges both sources; Claude Code sessions take priority.
export function readLiveSessions(): Agent[] {
  return [...readClaudeCodeSessions(), ...readLegacySessions()];
}

// Returns agents belonging to the current working directory's project.
export function readSessionAgents(cwd: string = process.cwd()): Agent[] {
  const encoded = encodeProjectPath(cwd);
  return readClaudeCodeSessions(encoded);
}

export function listAgents(options: AgentsListOptions): void {
  const agents = readLiveSessions();
  const visible = options.all
    ? agents
    : agents.filter((a) => a.status === "running" || a.status === "idle" || a.status === "waiting");

  if (options.json) {
    process.stdout.write(JSON.stringify(visible, null, 2) + "\n");
    return;
  }

  if (visible.length === 0) {
    console.log("No active Claude sessions.");
    return;
  }

  console.log(["ID", "TYPE", "STATUS", "STARTED"].join("\t"));
  for (const agent of visible) {
    console.log([agent.id, agent.agentType, agent.status, agent.started_at].join("\t"));
  }
}

export function listSessionAgents(cwd: string, options: AgentsListOptions): void {
  const agents = readSessionAgents(cwd);
  const visible = options.all
    ? agents
    : agents.filter((a) => a.status === "running" || a.status === "idle" || a.status === "waiting");

  if (options.json) {
    process.stdout.write(JSON.stringify(visible, null, 2) + "\n");
    return;
  }

  if (visible.length === 0) {
    console.log(`No active agents for project: ${cwd}`);
    return;
  }

  console.log(["ID", "TYPE", "STATUS", "DESCRIPTION"].join("\t"));
  for (const agent of visible) {
    console.log(
      [agent.id, agent.agentType, agent.status, agent.description ?? "-"].join("\t")
    );
  }
}
