import { buildStatusLineInput } from "../statusline";

jest.mock("child_process", () => ({
  execSync: jest.fn((cmd: string) => {
    if (cmd.includes("rev-parse")) return "main\n";
    if (cmd.includes("remote get-url")) return "git@github.com:ocobaan44/osman.git\n";
    if (cmd.includes("gh pr view")) return "42\n";
    return "";
  }),
}));

describe("buildStatusLineInput", () => {
  it("includes agent_id", () => {
    const result = buildStatusLineInput("agent-xyz", null);
    expect(result.agent_id).toBe("agent-xyz");
  });

  it("includes parent_agent_id when provided", () => {
    const result = buildStatusLineInput("child-123", "parent-456");
    expect(result.parent_agent_id).toBe("parent-456");
  });

  it("sets parent_agent_id to null when not provided", () => {
    const result = buildStatusLineInput("agent-xyz", null);
    expect(result.parent_agent_id).toBeNull();
  });

  it("includes github.repo from remote URL", () => {
    const result = buildStatusLineInput("agent-xyz", null);
    expect(result.github.repo).toBe("ocobaan44/osman");
  });

  it("includes github.pr from gh cli output", () => {
    const result = buildStatusLineInput("agent-xyz", null);
    expect(result.github.pr).toBe(42);
  });

  it("includes git_branch", () => {
    const result = buildStatusLineInput("agent-xyz", null);
    expect(result.git_branch).toBe("main");
  });

  it("includes cwd", () => {
    const result = buildStatusLineInput("agent-xyz", null);
    expect(result.cwd).toBe(process.cwd());
  });
});
