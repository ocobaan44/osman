import * as fs from "fs";
import * as os from "os";
import * as path from "path";
import { Agent, AgentsListOptions } from "./types";

const SESSIONS_DIR = path.join(os.homedir(), ".claude", "sessions");

export function readLiveSessions(): Agent[] {
  if (!fs.existsSync(SESSIONS_DIR)) {
    return [];
  }

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

  const header = ["ID", "PARENT", "STATUS", "MODEL", "STARTED"].join("\t");
  console.log(header);
  for (const agent of visible) {
    const row = [
      agent.id,
      agent.parent_id ?? "-",
      agent.status,
      agent.model,
      agent.started_at,
    ].join("\t");
    console.log(row);
  }
}
