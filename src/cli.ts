#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { getClients, loadClientState } from "./clients.js";
import { applyPlan, diffAll, planSync } from "./core.js";
import type { ClientState, McpServer } from "./types.js";

// ---------- output helpers ----------

const useColor =
  process.stdout.isTTY && !("NO_COLOR" in process.env) && process.env.TERM !== "dumb";
const paint = (code: number) => (s: string) =>
  useColor ? `\x1b[${code}m${s}\x1b[0m` : s;
const green = paint(32);
const yellow = paint(33);
const red = paint(31);
const dim = paint(2);
const bold = paint(1);

function describe(server: McpServer): string {
  if (server.type === "stdio") {
    return [server.command, ...(server.args ?? [])].join(" ");
  }
  return `${server.type} ${server.url}`;
}

function version(): string {
  try {
    const pkg = JSON.parse(
      readFileSync(new URL("../package.json", import.meta.url), "utf8"),
    ) as { version: string };
    return pkg.version;
  } catch {
    return "unknown";
  }
}

// ---------- commands ----------

function loadAll(): ClientState[] {
  return getClients().map(loadClientState);
}

function cmdStatus(): number {
  const states = loadAll();
  const detected = states.filter((s) => s.exists);
  console.log(bold("MCP clients"));
  for (const s of states) {
    const count = Object.keys(s.servers).length;
    let line: string;
    if (s.error) {
      line = `${red("✗")} ${s.def.name.padEnd(20)} config error: ${s.error}`;
    } else if (s.exists) {
      line = `${green("●")} ${s.def.name.padEnd(20)} ${count} server${count === 1 ? "" : "s"}  ${dim(s.def.configPath)}`;
    } else {
      line = `${dim("○")} ${dim(s.def.name.padEnd(20))} ${dim("not detected")}`;
    }
    console.log("  " + line);
  }

  if (detected.length > 1) {
    const rows = diffAll(states);
    const drifted = rows.filter((r) => !r.inSync);
    console.log();
    if (rows.length === 0) {
      console.log(dim("  No MCP servers configured anywhere yet."));
    } else if (drifted.length === 0) {
      console.log(green(`  ✓ All ${rows.length} servers in sync across detected clients.`));
    } else {
      console.log(
        yellow(
          `  ⚠ ${drifted.length} of ${rows.length} servers out of sync: ${drifted
            .map((r) => r.name)
            .join(", ")}`,
        ),
      );
      console.log(dim("  Run `mcp-sync diff` for details, `mcp-sync sync --from <client>` to fix."));
    }
  }
  return 0;
}

function cmdList(): number {
  const states = loadAll();
  const rows = diffAll(states);
  if (rows.length === 0) {
    console.log("No MCP servers found in any detected client.");
    return 0;
  }
  for (const row of rows) {
    const marker = row.inSync ? green("✓") : yellow("⚠");
    console.log(`${marker} ${bold(row.name)}`);
    for (const { server, clientIds } of row.groups.values()) {
      console.log(`    ${clientIds.join(", ")}: ${dim(describe(server))}`);
    }
    if (row.missingFrom.length > 0) {
      console.log(`    ${red("missing from")}: ${row.missingFrom.join(", ")}`);
    }
  }
  return 0;
}

function cmdDiff(): number {
  const states = loadAll();
  const rows = diffAll(states).filter((r) => !r.inSync);
  if (rows.length === 0) {
    console.log(green("✓ Everything in sync — no differences across detected clients."));
    return 0;
  }
  for (const row of rows) {
    console.log(yellow(`⚠ ${bold(row.name)}`));
    for (const { server, clientIds } of row.groups.values()) {
      console.log(`    ${clientIds.join(", ")}:`);
      console.log(`      ${describe(server)}`);
    }
    if (row.missingFrom.length > 0) {
      console.log(`    missing from: ${red(row.missingFrom.join(", "))}`);
    }
  }
  console.log();
  console.log(dim("Fix with: mcp-sync sync --from <client> [--dry-run]"));
  return 1;
}

function cmdClients(): number {
  console.log(bold("Supported clients"));
  for (const def of getClients()) {
    console.log(`  ${def.id.padEnd(16)} ${def.name.padEnd(20)} ${dim(def.configPath)}`);
  }
  return 0;
}

interface SyncFlags {
  from?: string;
  to?: string;
  dryRun: boolean;
  replace: boolean;
  prune: boolean;
  yes: boolean;
}

function cmdSync(flags: SyncFlags): number {
  const states = loadAll();
  const ids = getClients().map((c) => c.id);

  if (!flags.from) {
    console.error(red("Missing --from <client>. Which client is the source of truth?"));
    console.error(`Available: ${ids.join(", ")}`);
    return 2;
  }
  const source = states.find((s) => s.def.id === flags.from);
  if (!source) {
    console.error(red(`Unknown client "${flags.from}". Available: ${ids.join(", ")}`));
    return 2;
  }
  if (!source.exists) {
    console.error(red(`${source.def.name} has no config file at ${source.def.configPath}`));
    return 2;
  }
  if (source.error) {
    console.error(red(`Cannot read ${source.def.name} config: ${source.error}`));
    return 2;
  }
  if (Object.keys(source.servers).length === 0 && !flags.replace) {
    console.error(yellow(`${source.def.name} has no MCP servers configured — nothing to sync.`));
    return 2;
  }

  let targets: ClientState[];
  if (flags.to) {
    const wanted = flags.to.split(",").map((t) => t.trim());
    const unknown = wanted.filter((w) => !ids.includes(w));
    if (unknown.length > 0) {
      console.error(red(`Unknown client(s): ${unknown.join(", ")}. Available: ${ids.join(", ")}`));
      return 2;
    }
    targets = states.filter((s) => wanted.includes(s.def.id) && s.def.id !== source.def.id);
  } else {
    targets = states.filter((s) => s.exists && !s.error && s.def.id !== source.def.id);
  }

  if (targets.length === 0) {
    console.log("No target clients detected. Use --to <client>[,client] to create configs explicitly.");
    return 0;
  }

  const plans = targets.map((t) =>
    planSync(source.servers, t, { replace: flags.replace, prune: flags.prune }),
  );

  console.log(
    `${flags.dryRun ? bold("[dry-run] ") : ""}Syncing ${bold(String(Object.keys(source.servers).length))} servers from ${bold(source.def.name)}:`,
  );
  let wroteAnything = false;
  for (const plan of plans) {
    const label = plan.target.def.name.padEnd(20);
    if (!plan.changed) {
      console.log(`  ${green("✓")} ${label} already in sync`);
      continue;
    }
    const parts: string[] = [];
    if (plan.added.length) parts.push(green(`+${plan.added.length} added (${plan.added.join(", ")})`));
    if (plan.updated.length) parts.push(yellow(`~${plan.updated.length} updated (${plan.updated.join(", ")})`));
    if (plan.removed.length) parts.push(red(`-${plan.removed.length} removed (${plan.removed.join(", ")})`));
    console.log(`  ${yellow("→")} ${label} ${parts.join("  ")}`);
    if (plan.skippedRemote.length > 0) {
      console.log(
        dim(
          `      skipped remote server(s) not supported by this client: ${plan.skippedRemote.join(", ")}`,
        ),
      );
    }
    if (!flags.dryRun) {
      const { backupPath } = applyPlan(plan);
      wroteAnything = true;
      if (backupPath) console.log(dim(`      backup: ${backupPath}`));
    }
  }
  if (flags.dryRun) {
    console.log();
    console.log(dim("Dry run — nothing written. Re-run without --dry-run to apply."));
  } else if (wroteAnything) {
    console.log();
    console.log(green("Done. Restart the affected apps to pick up the new servers."));
  }
  return 0;
}

// ---------- entry ----------

const HELP = `${bold("mcp-sync")} — keep MCP server configs in sync across your AI tools

${bold("Usage")}
  mcp-sync <command> [options]

${bold("Commands")}
  status                     Show detected clients and sync state (default)
  list                       List every MCP server across all clients
  diff                       Show servers that differ between clients
  sync --from <client>       Copy servers from one client to the others
  clients                    List supported clients and config paths

${bold("Sync options")}
  --from <client>            Source of truth (required)
  --to <a,b,...>             Only sync to these clients (default: all detected)
  --dry-run                  Preview changes without writing
  --replace                  Make targets exactly match the source
  --prune                    Also delete target servers missing from source

${bold("Examples")}
  npx mcp-sync status
  npx mcp-sync sync --from claude-desktop --dry-run
  npx mcp-sync sync --from cursor --to vscode,claude-code

Backups of every modified file are stored in ~/.mcp-sync/backups/
`;

export function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      "dry-run": { type: "boolean", default: false },
      replace: { type: "boolean", default: false },
      prune: { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  if (values.version) {
    console.log(version());
    return 0;
  }
  const command = positionals[0] ?? "status";
  if (values.help || command === "help") {
    console.log(HELP);
    return 0;
  }

  switch (command) {
    case "status":
      return cmdStatus();
    case "list":
      return cmdList();
    case "diff":
      return cmdDiff();
    case "clients":
      return cmdClients();
    case "sync":
      return cmdSync({
        from: values.from,
        to: values.to,
        dryRun: values["dry-run"] ?? false,
        replace: values.replace ?? false,
        prune: values.prune ?? false,
        yes: values.yes ?? false,
      });
    default:
      console.error(red(`Unknown command "${command}".`));
      console.log(HELP);
      return 2;
  }
}

process.exitCode = main(process.argv.slice(2));
