import * as child_process from "child_process";
import { GitHubContext, StatusLineInput } from "./types";

function execSync(cmd: string): string {
  try {
    return child_process.execSync(cmd, { encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim();
  } catch {
    return "";
  }
}

function detectGitBranch(): string | null {
  const branch = execSync("git rev-parse --abbrev-ref HEAD");
  return branch || null;
}

function detectGitHubContext(): GitHubContext {
  const remoteUrl = execSync("git remote get-url origin");
  if (!remoteUrl) {
    return { repo: null, pr: null, branch: detectGitBranch() };
  }

  // Parse owner/repo from SSH or HTTPS remote URLs
  const sshMatch = remoteUrl.match(/github\.com[:/]([^/]+\/[^/]+?)(?:\.git)?$/);
  const httpsMatch = remoteUrl.match(/github\.com\/([^/]+\/[^/]+?)(?:\.git)?$/);
  const repo = (sshMatch ?? httpsMatch)?.[1] ?? null;

  const branch = detectGitBranch();

  // Try to find associated PR number from branch name or gh cli
  let pr: number | null = null;
  const prOutput = execSync(`gh pr view --json number --jq .number 2>/dev/null`);
  if (prOutput && /^\d+$/.test(prOutput)) {
    pr = parseInt(prOutput, 10);
  }

  return { repo, pr, branch };
}

export function buildStatusLineInput(agentId: string, parentAgentId: string | null): StatusLineInput {
  const cwd = process.cwd();
  const gitBranch = detectGitBranch();
  const github = detectGitHubContext();

  return {
    cwd,
    git_branch: gitBranch,
    agent_id: agentId,
    parent_agent_id: parentAgentId,
    github,
  };
}

export function printStatusLine(agentId: string, parentAgentId: string | null, json: boolean): void {
  const input = buildStatusLineInput(agentId, parentAgentId);

  if (json) {
    process.stdout.write(JSON.stringify(input, null, 2) + "\n");
    return;
  }

  const parts: string[] = [];
  if (input.github.repo) {
    parts.push(input.github.repo);
    if (input.github.pr != null) {
      parts.push(`PR#${input.github.pr}`);
    }
  }
  if (input.git_branch) {
    parts.push(input.git_branch);
  }
  parts.push(`agent:${agentId}`);
  if (parentAgentId) {
    parts.push(`parent:${parentAgentId}`);
  }

  console.log(parts.join(" | "));
}
