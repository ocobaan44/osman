#!/usr/bin/env node
import { Command } from "commander";
import { listAgents, listSessionAgents } from "./agents";
import { printStatusLine } from "./statusline";

const program = new Command();

program
  .name("claude")
  .description("Claude Code CLI utilities")
  .version("1.0.0");

program
  .command("agents")
  .description("List live Claude agent sessions")
  .option("--json", "Output as JSON", false)
  .option("--all", "Include completed/errored sessions", false)
  .action((opts) => {
    listAgents({ json: opts.json as boolean, all: opts.all as boolean });
  });

program
  .command("statusline")
  .description("Print status line JSON for the current session")
  .requiredOption("--agent-id <id>", "Current agent ID")
  .option("--parent-agent-id <id>", "Parent agent ID")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    printStatusLine(
      opts.agentId as string,
      (opts.parentAgentId as string | undefined) ?? null,
      opts.json as boolean
    );
  });

program
  .command("session")
  .description("List agents for the current project session")
  .option("--json", "Output as JSON", false)
  .option("--all", "Include completed agents", false)
  .option("--cwd <path>", "Project directory (default: current directory)")
  .action((opts) => {
    const cwd = (opts.cwd as string | undefined) ?? process.cwd();
    listSessionAgents(cwd, { json: opts.json as boolean, all: opts.all as boolean });
  });

program.parse(process.argv);
