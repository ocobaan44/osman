export type AgentStatus = "running" | "idle" | "waiting" | "done" | "error";

export interface Agent {
  id: string;
  parent_id: string | null;
  status: AgentStatus;
  model: string;
  session_id: string;
  started_at: string;
  description?: string;
}

export interface GitHubContext {
  repo: string | null;
  pr: number | null;
  branch: string | null;
}

export interface StatusLineInput {
  cwd: string;
  git_branch: string | null;
  agent_id: string;
  parent_agent_id: string | null;
  github: GitHubContext;
}

export interface AgentsListOptions {
  json: boolean;
  all: boolean;
}
