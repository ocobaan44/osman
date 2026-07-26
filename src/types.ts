export type AgentStatus = "running" | "idle" | "waiting" | "done" | "error";

export interface Agent {
  id: string;
  parent_id: string | null;
  agentType: string;
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

export interface VideoInfo {
  title: string;
  extractor: string;
  duration: number | null;
  filesize: number | null;
  ext: string;
  webpage_url: string;
}

export interface DownloadOptions {
  cookiesFile?: string;
  maxFilesize?: string;
  maxHeight?: number;
  timeoutMs?: number;
}

/**
 * "stream" = tek parça H.264/mp4 var, yt-dlp stdout'u doğrudan HTTP yanıtına akar.
 * "file"   = birleştirme/remux gerekiyor, önce geçici dosyaya inilir.
 */
export interface FormatChoice {
  mode: "stream" | "file";
  formatId?: string;
  height?: number | null;
  reason: string;
}

export interface DownloadResult {
  dir: string;
  filePath: string;
  filename: string;
  size: number;
}

export interface IndirOptions {
  json: boolean;
  out?: string;
}

export interface SunucuOptions {
  port: number;
  token: string;
  maxConcurrent?: number;
}
