#!/usr/bin/env node
import { Command } from "commander";
import { listAgents } from "./agents";
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

program.parse(process.argv);
