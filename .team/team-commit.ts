import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import process from "node:process";
import {
  loadRoster,
  planCommits,
  dominantBucket,
  normalize,
  type Author,
  type ChangedFile,
  type RoleKey,
} from "./routing.ts";

interface GitResult { code: number; out: string; err: string; }

function git(args: string[], input?: Uint8Array): GitResult {
  const p = spawnSync("git", args, { input });
  return { code: p.status ?? 0, out: p.stdout ? p.stdout.toString() : "", err: p.stderr ? p.stderr.toString() : "" };
}

export function parseStatus(z: string): ChangedFile[] {
  const tokens = z.split("\0");
  const files: ChangedFile[] = [];
  for (let i = 0; i < tokens.length; i++) {
    const entry = tokens[i];
    if (!entry) continue;
    const xy = entry.slice(0, 2);
    const path = normalize(entry.slice(3));
    let oldPath: string | undefined;
    if (xy[0] === "R" || xy[0] === "C") {
      const next = tokens[++i];
      oldPath = next ? normalize(next) : undefined;
    }
    files.push({ path, oldPath });
  }
  return files;
}

export interface Args {
  msg?: string;
  solo: boolean;
  coder?: "a" | "b";
  push: boolean;
  dryRun: boolean;
  all: boolean;
}

export function parseArgs(argv: string[]): Args {
  const a: Args = { solo: false, push: false, dryRun: false, all: false };
  for (let i = 0; i < argv.length; i++) {
    const t = argv[i];
    if (t === "--solo") a.solo = true;
    else if (t === "--push") a.push = true;
    else if (t === "--dry-run" || t === "--status") a.dryRun = true;
    else if (t === "--all") a.all = true;
    else if (t === "--coder") a.coder = argv[++i] as "a" | "b";
    else if (!t.startsWith("--") && a.msg === undefined) a.msg = t;
  }
  return a;
}

function hasHead(): boolean {
  return git(["rev-parse", "--verify", "-q", "HEAD"]).code === 0;
}

function hasStagedChanges(): boolean {
  return git(["diff", "--cached", "--quiet"]).code !== 0;
}

function assertNoDirtySubmodules(): void {
  if (!existsSync(".gitmodules")) return;
  const r = git(["submodule", "status", "--recursive"]);
  const dirty = r.out.split("\n").filter((l) => /^[+U-]/.test(l));
  if (dirty.length) {
    throw new Error(`unsynced submodule(s):\n${dirty.join("\n")}\ncommit/sync submodule content first`);
  }
}

function changedFiles(): ChangedFile[] {
  const r = git(["status", "--porcelain=v1", "-z", "--untracked-files=all", "--renames"]);
  if (r.code !== 0) throw new Error(`git status failed: ${r.err}`);
  return parseStatus(r.out);
}

function emptyIndex(): void {
  if (hasHead()) git(["reset", "-q"]);
  else git(["read-tree", "--empty"]);
}

function stage(paths: string[]): void {
  const input = new TextEncoder().encode(paths.join("\0"));
  const r = git(["--literal-pathspecs", "add", "-A", "--pathspec-from-file=-", "--pathspec-file-nul"], input);
  if (r.code !== 0) throw new Error(`git add failed: ${r.err}`);
}

function commit(author: Author, msg: string): void {
  const r = git(["commit", "-q", `--author=${author.name} <${author.email}>`, "-m", `[${author.label}] ${msg}`]);
  if (r.code !== 0) throw new Error(`git commit failed: ${r.err}`);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const roster = await loadRoster(".team/roster.json");
  const files = changedFiles();
  if (files.length === 0) {
    console.log("team-commit: nothing to commit");
    return;
  }

  const lastCoder = (git(["config", "--local", "--get", "team.last-coder"]).out.trim() || undefined) as RoleKey | undefined;
  const plan = planCommits(files, roster, { coderPin: args.coder, lastCoder });

  if (args.dryRun) {
    console.log("team-commit plan (no changes made):");
    for (const b of plan.buckets) {
      console.log(`  [${b.author.label}] ${b.author.name} <${b.author.email}>`);
      for (const p of b.paths) console.log(`      ${p}`);
    }
    return;
  }

  if (args.msg === undefined) throw new Error('commit message required, e.g. team-commit "msg"');
  if (hasHead() && hasStagedChanges() && !args.all) {
    throw new Error("index has staged changes; rerun with --all to commit the whole working tree");
  }
  assertNoDirtySubmodules();

  if (args.solo) {
    const dom = dominantBucket(plan.buckets);
    const all = plan.buckets.flatMap((b) => b.paths);
    emptyIndex();
    stage(all);
    commit(dom.author, args.msg);
  } else {
    emptyIndex();
    for (const b of plan.buckets) {
      stage(b.paths);
      commit(b.author, args.msg);
    }
    if (plan.nextLastCoder) git(["config", "--local", "team.last-coder", plan.nextLastCoder]);
  }

  if (args.push) {
    const r = git(["push"]);
    if (r.code !== 0) throw new Error(`git push failed: ${r.err}`);
  }
  console.log("team-commit: done");
}

const isMain = process.argv[1] && (
  process.argv[1].endsWith("team-commit.ts") ||
  process.argv[1].endsWith("team-commit.js") ||
  process.argv[1].endsWith("team-commit")
);

if (isMain) {
  main().catch((e: Error) => {
    console.error(`team-commit: ${e.message}`);
    process.exit(1);
  });
}
