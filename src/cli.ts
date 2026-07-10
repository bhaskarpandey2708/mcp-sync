#!/usr/bin/env node
import { parseArgs } from "node:util";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { getClients, loadClientState } from "./clients.js";
import {
  applyPlans,
  diffAll,
  listBackups,
  planSync,
  restoreBackup,
  validateStates,
} from "./core.js";
import type { ClientState, McpServer, ValidationIssue } from "./types.js";

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

let jsonMode = false;

function emitJson(payload: unknown): void {
  console.log(JSON.stringify(payload, null, 2));
}

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
  const rows = detected.length > 1 ? diffAll(states) : [];
  const drifted = rows.filter((r) => !r.inSync);

  if (jsonMode) {
    emitJson({
      clients: states.map((s) => ({
        id: s.def.id,
        name: s.def.name,
        path: s.def.configPath,
        exists: s.exists,
        serverCount: Object.keys(s.servers).length,
        error: s.error ?? null,
        warnings: s.warnings ?? [],
      })),
      servers: rows.map((r) => ({
        name: r.name,
        inSync: r.inSync,
        missingFrom: r.missingFrom,
        variants: [...r.groups.values()].map((g) => ({
          clientIds: g.clientIds,
          summary: describe(g.server),
        })),
      })),
      drifted: drifted.map((r) => r.name),
    });
    return drifted.length > 0 ? 1 : 0;
  }

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
    if (s.warnings?.length) {
      for (const w of s.warnings) {
        console.log(dim(`      ⚠ ${w}`));
      }
    }
  }

  if (detected.length > 1) {
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
      console.log(
        dim("  Run `mcp-sync diff` for details, `mcp-sync sync --from <client>` to fix."),
      );
    }
  }
  return drifted.length > 0 ? 1 : 0;
}

function cmdList(): number {
  const states = loadAll();
  const rows = diffAll(states);
  if (jsonMode) {
    emitJson({
      servers: rows.map((r) => ({
        name: r.name,
        inSync: r.inSync,
        missingFrom: r.missingFrom,
        variants: [...r.groups.values()].map((g) => ({
          clientIds: g.clientIds,
          server: g.server,
        })),
      })),
    });
    return 0;
  }
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
  if (jsonMode) {
    emitJson({
      drifted: rows.map((r) => ({
        name: r.name,
        missingFrom: r.missingFrom,
        variants: [...r.groups.values()].map((g) => ({
          clientIds: g.clientIds,
          server: g.server,
        })),
      })),
    });
    return rows.length > 0 ? 1 : 0;
  }
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
  const clients = getClients();
  if (jsonMode) {
    emitJson({
      clients: clients.map((c) => ({
        id: c.id,
        name: c.name,
        path: c.configPath,
        serversKey: c.serversKey,
        style: c.style,
        supportsRemote: c.supportsRemote,
        docsUrl: c.docsUrl,
      })),
    });
    return 0;
  }
  console.log(bold("Supported clients"));
  for (const def of clients) {
    console.log(`  ${def.id.padEnd(16)} ${def.name.padEnd(20)} ${dim(def.configPath)}`);
  }
  return 0;
}

function cmdValidate(): number {
  const states = loadAll();
  const issues = validateStates(states);
  if (jsonMode) {
    emitJson({
      ok: !issues.some((i) => i.severity === "error"),
      issues,
    });
  } else {
    if (issues.length === 0) {
      console.log(green("✓ No issues found."));
      return 0;
    }
    const icon = (s: ValidationIssue["severity"]) =>
      s === "error" ? red("✗") : s === "warning" ? yellow("⚠") : dim("·");
    console.log(bold("Validation"));
    for (const i of issues) {
      const where = i.serverName ? `${i.clientId}/${i.serverName}` : i.clientId;
      console.log(`  ${icon(i.severity)} ${where.padEnd(28)} ${i.message}`);
    }
    const errors = issues.filter((i) => i.severity === "error").length;
    const warnings = issues.filter((i) => i.severity === "warning").length;
    console.log();
    console.log(
      dim(
        `  ${errors} error(s), ${warnings} warning(s), ${issues.length - errors - warnings} info`,
      ),
    );
  }
  return issues.some((i) => i.severity === "error") ? 1 : 0;
}

function cmdBackups(): number {
  const list = listBackups();
  if (jsonMode) {
    emitJson({ backups: list });
    return 0;
  }
  if (list.length === 0) {
    console.log(dim("No backups yet. They appear after the first sync write."));
    return 0;
  }
  console.log(bold("Backups") + dim("  (~/.mcp-sync/backups/)"));
  for (const b of list) {
    const meta = b.hasManifest
      ? `${b.entryCount} file(s)${b.createdAt ? `, ${b.createdAt}` : ""}`
      : `${b.entryCount} file(s), no manifest`;
    console.log(`  ${b.stamp}  ${dim(meta)}`);
  }
  console.log();
  console.log(dim("Restore: mcp-sync restore --stamp <stamp> [--dry-run]"));
  return 0;
}

interface RestoreFlags {
  stamp?: string;
  latest: boolean;
  to?: string;
  dryRun: boolean;
}

function cmdRestore(flags: RestoreFlags): number {
  let stamp = flags.stamp;
  if (flags.latest) {
    const list = listBackups();
    if (list.length === 0) {
      if (jsonMode) emitJson({ ok: false, error: "No backups available" });
      else console.error(red("No backups available to restore."));
      return 2;
    }
    stamp = list[0]!.stamp;
  }
  if (!stamp) {
    if (jsonMode) emitJson({ ok: false, error: "Missing --stamp or --latest" });
    else {
      console.error(red("Missing --stamp <id> or --latest."));
      console.error(dim("List stamps with: mcp-sync backups"));
    }
    return 2;
  }
  const clientIds = flags.to
    ? flags.to.split(",").map((t) => t.trim()).filter(Boolean)
    : undefined;
  const result = restoreBackup({
    stamp,
    clientIds,
    dryRun: flags.dryRun,
  });
  if (jsonMode) {
    emitJson({ stamp, ...result });
    return result.ok ? 0 : 2;
  }
  if (!result.ok) {
    console.error(red(result.error ?? "Restore failed"));
    return 2;
  }
  console.log(
    `${flags.dryRun ? bold("[dry-run] ") : ""}Restore from ${bold(stamp)}:`,
  );
  for (const r of result.restored) {
    console.log(`  ${green("→")} ${r.to}`);
    console.log(dim(`      from ${r.from}`));
  }
  for (const s of result.skipped) {
    console.log(`  ${yellow("skipped")} ${s}`);
  }
  if (flags.dryRun) {
    console.log();
    console.log(dim("Dry run — nothing written. Re-run without --dry-run to apply."));
  } else if (result.restored.length > 0) {
    console.log();
    console.log(green("Done. A pre-restore safety backup was also written."));
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
    const msg = "Missing --from <client>. Which client is the source of truth?";
    if (jsonMode) emitJson({ ok: false, error: msg, available: ids });
    else {
      console.error(red(msg));
      console.error(`Available: ${ids.join(", ")}`);
    }
    return 2;
  }
  const source = states.find((s) => s.def.id === flags.from);
  if (!source) {
    const msg = `Unknown client "${flags.from}". Available: ${ids.join(", ")}`;
    if (jsonMode) emitJson({ ok: false, error: msg });
    else console.error(red(msg));
    return 2;
  }
  if (!source.exists) {
    const msg = `${source.def.name} has no config file at ${source.def.configPath}`;
    if (jsonMode) emitJson({ ok: false, error: msg });
    else console.error(red(msg));
    return 2;
  }
  if (source.error) {
    const msg = `Cannot read ${source.def.name} config: ${source.error}`;
    if (jsonMode) emitJson({ ok: false, error: msg });
    else console.error(red(msg));
    return 2;
  }
  if (Object.keys(source.servers).length === 0 && !flags.replace) {
    const msg = `${source.def.name} has no MCP servers configured — nothing to sync.`;
    if (jsonMode) emitJson({ ok: false, error: msg });
    else console.error(yellow(msg));
    return 2;
  }

  // Destructive modes require explicit --yes (or dry-run).
  if ((flags.replace || flags.prune) && !flags.yes && !flags.dryRun) {
    const mode = flags.replace ? "--replace" : "--prune";
    const msg = `${mode} can delete servers. Re-run with --yes to confirm, or use --dry-run first.`;
    if (jsonMode) emitJson({ ok: false, error: msg, requiresConfirmation: true });
    else {
      console.error(red(msg));
      console.error(dim(`Example: mcp-sync sync --from ${flags.from} ${mode} --yes`));
    }
    return 2;
  }

  let targets: ClientState[];
  if (flags.to) {
    const wanted = flags.to.split(",").map((t) => t.trim());
    const unknown = wanted.filter((w) => !ids.includes(w));
    if (unknown.length > 0) {
      const msg = `Unknown client(s): ${unknown.join(", ")}. Available: ${ids.join(", ")}`;
      if (jsonMode) emitJson({ ok: false, error: msg });
      else console.error(red(msg));
      return 2;
    }
    targets = states.filter((s) => wanted.includes(s.def.id) && s.def.id !== source.def.id);
  } else {
    targets = states.filter((s) => s.exists && !s.error && s.def.id !== source.def.id);
  }

  if (targets.length === 0) {
    if (jsonMode) {
      emitJson({
        ok: true,
        from: source.def.id,
        plans: [],
        message: "No target clients detected",
      });
    } else {
      console.log(
        "No target clients detected. Use --to <client>[,client] to create configs explicitly.",
      );
    }
    return 0;
  }

  const plans = targets.map((t) =>
    planSync(source.servers, t, { replace: flags.replace, prune: flags.prune }),
  );

  if (jsonMode && flags.dryRun) {
    emitJson({
      ok: true,
      dryRun: true,
      from: source.def.id,
      serverCount: Object.keys(source.servers).length,
      plans: plans.map((p) => ({
        clientId: p.target.def.id,
        changed: p.changed,
        added: p.added,
        updated: p.updated,
        removed: p.removed,
        skippedRemote: p.skippedRemote,
      })),
    });
    return 0;
  }

  if (!jsonMode) {
    console.log(
      `${flags.dryRun ? bold("[dry-run] ") : ""}Syncing ${bold(String(Object.keys(source.servers).length))} servers from ${bold(source.def.name)}:`,
    );
  }

  if (flags.dryRun) {
    for (const plan of plans) {
      const label = plan.target.def.name.padEnd(20);
      if (!plan.changed) {
        console.log(`  ${green("✓")} ${label} already in sync`);
        continue;
      }
      const parts: string[] = [];
      if (plan.added.length)
        parts.push(green(`+${plan.added.length} added (${plan.added.join(", ")})`));
      if (plan.updated.length)
        parts.push(yellow(`~${plan.updated.length} updated (${plan.updated.join(", ")})`));
      if (plan.removed.length)
        parts.push(red(`-${plan.removed.length} removed (${plan.removed.join(", ")})`));
      console.log(`  ${yellow("→")} ${label} ${parts.join("  ")}`);
      if (plan.skippedRemote.length > 0) {
        console.log(
          dim(
            `      skipped remote server(s) not supported by this client: ${plan.skippedRemote.join(", ")}`,
          ),
        );
      }
    }
    console.log();
    console.log(dim("Dry run — nothing written. Re-run without --dry-run to apply."));
    return 0;
  }

  // Human preview of what will change, then apply under lock.
  for (const plan of plans) {
    if (jsonMode) break;
    const label = plan.target.def.name.padEnd(20);
    if (!plan.changed) {
      console.log(`  ${green("✓")} ${label} already in sync`);
      continue;
    }
    const parts: string[] = [];
    if (plan.added.length)
      parts.push(green(`+${plan.added.length} added (${plan.added.join(", ")})`));
    if (plan.updated.length)
      parts.push(yellow(`~${plan.updated.length} updated (${plan.updated.join(", ")})`));
    if (plan.removed.length)
      parts.push(red(`-${plan.removed.length} removed (${plan.removed.join(", ")})`));
    console.log(`  ${yellow("→")} ${label} ${parts.join("  ")}`);
    if (plan.skippedRemote.length > 0) {
      console.log(
        dim(
          `      skipped remote server(s) not supported by this client: ${plan.skippedRemote.join(", ")}`,
        ),
      );
    }
  }

  let stamp: string;
  let results: ReturnType<typeof applyPlans>["results"];
  try {
    ({ stamp, results } = applyPlans(plans.filter((p) => p.changed)));
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (jsonMode) emitJson({ ok: false, error: msg });
    else console.error(red(msg));
    return 2;
  }

  if (jsonMode) {
    emitJson({
      ok: results.every((r) => r.ok),
      from: source.def.id,
      stamp,
      results,
      plans: plans.map((p) => ({
        clientId: p.target.def.id,
        changed: p.changed,
        added: p.added,
        updated: p.updated,
        removed: p.removed,
        skippedRemote: p.skippedRemote,
      })),
    });
  } else {
    for (const r of results) {
      if (r.ok && r.backupPath) {
        console.log(dim(`      backup (${r.clientId}): ${r.backupPath}`));
      } else if (!r.ok) {
        console.log(red(`      failed (${r.clientId}): ${r.error}`));
      }
    }
    if (results.some((r) => r.ok)) {
      console.log();
      console.log(
        green(
          `Done (backup stamp ${stamp}). Restart the affected apps to pick up the new servers.`,
        ),
      );
    }
  }

  return results.every((r) => r.ok) ? 0 : 2;
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
  validate                   Check configs for errors and warnings
  backups                    List timestamped backups
  restore --stamp <id>       Restore configs from a backup
  clients                    List supported clients and config paths

${bold("Sync options")}
  --from <client>            Source of truth (required)
  --to <a,b,...>             Only sync to these clients (default: all detected)
  --dry-run                  Preview changes without writing
  --replace                  Make targets exactly match the source (needs --yes)
  --prune                    Also delete target servers missing from source (needs --yes)
  --yes, -y                  Confirm destructive --replace / --prune

${bold("Restore options")}
  --stamp <id>               Backup stamp to restore
  --latest                   Restore the most recent backup
  --to <a,b,...>             Only restore these clients (needs manifest)
  --dry-run                  Preview restore without writing

${bold("Global")}
  --json                     Machine-readable JSON output (for scripts/CI)
  --help, -h                 Show this help
  --version, -v              Print version

${bold("Examples")}
  npx mcp-sync status
  npx mcp-sync validate
  npx mcp-sync sync --from claude-desktop --dry-run
  npx mcp-sync sync --from cursor --to vscode,claude-code
  npx mcp-sync sync --from cursor --replace --yes
  npx mcp-sync backups
  npx mcp-sync restore --latest --dry-run
  npx mcp-sync status --json

Safety: every write is atomic, locked, and backed up under ~/.mcp-sync/backups/
`;

export function main(argv: string[]): number {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      from: { type: "string" },
      to: { type: "string" },
      stamp: { type: "string" },
      latest: { type: "boolean", default: false },
      "dry-run": { type: "boolean", default: false },
      replace: { type: "boolean", default: false },
      prune: { type: "boolean", default: false },
      yes: { type: "boolean", short: "y", default: false },
      json: { type: "boolean", default: false },
      help: { type: "boolean", short: "h", default: false },
      version: { type: "boolean", short: "v", default: false },
    },
  });

  jsonMode = values.json ?? false;

  if (values.version) {
    if (jsonMode) emitJson({ version: version() });
    else console.log(version());
    return 0;
  }
  const command = positionals[0] ?? "status";
  if (values.help || command === "help") {
    if (jsonMode) {
      emitJson({
        name: "mcp-sync",
        version: version(),
        commands: [
          "status",
          "list",
          "diff",
          "sync",
          "validate",
          "backups",
          "restore",
          "clients",
        ],
      });
    } else {
      console.log(HELP);
    }
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
    case "validate":
      return cmdValidate();
    case "backups":
      return cmdBackups();
    case "restore":
      return cmdRestore({
        stamp: values.stamp,
        latest: values.latest ?? false,
        to: values.to,
        dryRun: values["dry-run"] ?? false,
      });
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
      if (jsonMode) emitJson({ ok: false, error: `Unknown command "${command}"` });
      else {
        console.error(red(`Unknown command "${command}".`));
        console.log(HELP);
      }
      return 2;
  }
}

// Only auto-run when this file is the process entrypoint (not when imported by tests).
// Compare resolved paths so a repo folder named "mcp-sync" cannot false-trigger.
function isExecutedAsCli(): boolean {
  const entry = process.argv[1];
  if (!entry) return false;
  try {
    const entryUrl = pathToFileURL(resolve(entry)).href;
    return entryUrl === import.meta.url;
  } catch {
    return false;
  }
}

if (isExecutedAsCli()) {
  process.exitCode = main(process.argv.slice(2));
}
