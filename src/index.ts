#!/usr/bin/env node
import { Command } from "commander";
import { listAgents, listSessionAgents } from "./agents";
import { indirVideo } from "./downloader";
import { startServer } from "./server";
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

program
  .command("indir")
  .description("Bir video bağlantısını indir (LinkedIn, Instagram, X, YouTube, ...)")
  .requiredOption("--url <url>", "Video bağlantısı")
  .option("--out <dir>", "Çıktı klasörü", "indirilenler")
  .option("--json", "Output as JSON", false)
  .action((opts) => {
    void indirVideo(opts.url as string, {
      json: opts.json as boolean,
      out: opts.out as string | undefined,
    });
  });

program
  .command("sunucu")
  .description("iPhone kestirmesinin kullandığı indirme sunucusunu başlat")
  .option("--port <n>", "Port (varsayılan: PORT değişkeni veya 8080)")
  .action((opts) => {
    const token = process.env.INDIR_TOKEN ?? "";
    if (!token) {
      // Kimliksiz bir yt-dlp servisi internete açıldığında açık proxy'ye dönüşür.
      console.log("INDIR_TOKEN tanımlı değil. Sunucu başlatılmadı.");
      console.log("Örnek: INDIR_TOKEN=$(openssl rand -base64 32) npm run sunucu");
      process.exit(1);
    }

    const port =
      parseInt((opts.port as string | undefined) ?? process.env.PORT ?? "", 10) || 8080;
    startServer({ port, token });
  });

program.parse(process.argv);
