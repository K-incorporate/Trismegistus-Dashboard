// Pure routing logic for team-commit. No git, no process side effects.
// Runs under Bun (uses Bun.Glob). Imported by team-commit.ts and tests.

export type RoleKey = "captain" | "coder-a" | "coder-b" | "auditor" | "orchestrator";
export type RouteRole = "captain" | "coder" | "auditor" | "orchestrator";

export interface RoleDef {
  login: string;
  id: number;
  name: string;
  label: string;
}

export interface Route {
  role: RouteRole;
  globs: string[];
  rotate?: RoleKey[];
}

export interface Roster {
  version: number;
  roles: Record<RoleKey, RoleDef>;
  routes: Route[];
}

export interface ChangedFile {
  path: string; // new/current path, /-normalized
  oldPath?: string; // rename source, /-normalized
}

export interface Author {
  roleKey: RoleKey;
  name: string;
  email: string;
  label: string;
}

export function normalize(p: string): string {
  return p.replace(/\\/g, "/");
}

export function authorEmail(role: RoleDef): string {
  return `${role.id}+${role.login}@users.noreply.github.com`;
}

export function authorOf(roleKey: RoleKey, roster: Roster): Author {
  const r = roster.roles[roleKey];
  if (!r) throw new Error(`roster.roles missing "${roleKey}"`);
  return { roleKey, name: r.name, email: authorEmail(r), label: r.label };
}

export async function loadRoster(path: string): Promise<Roster> {
  const file = Bun.file(path);
  if (!(await file.exists())) {
    throw new Error(`no roster at ${path} — run team-init in this repo`);
  }
  return (await file.json()) as Roster;
}

// First-match-wins route resolution on a /-normalized path.
export function routeFile(path: string, routes: Route[]): RouteRole {
  const p = normalize(path);
  for (const route of routes) {
    for (const g of route.globs) {
      if (new Bun.Glob(g).match(p)) return route.role;
    }
  }
  return "orchestrator"; // defensive; routes always end with a ** catch-all
}

export interface Bucket {
  routeRole: RouteRole;
  author: Author;
  paths: string[]; // includes rename oldPath entries
}

export interface CommitPlan {
  buckets: Bucket[]; // in commit (dependency) order
  nextLastCoder?: RoleKey;
}

export interface PlanOpts {
  coderPin?: "a" | "b";
  lastCoder?: RoleKey;
}

// Commit (dependency) order — decoupled from match precedence so an
// intermediate commit is more likely to build.
const COMMIT_ORDER: RouteRole[] = ["orchestrator", "coder", "auditor", "captain"];

// Tie-break order for --solo dominant selection (match precedence).
const PRECEDENCE: RouteRole[] = ["auditor", "captain", "coder", "orchestrator"];

function resolveCoder(rotate: RoleKey[], pin: "a" | "b" | undefined, lastCoder: RoleKey | undefined): RoleKey {
  if (pin === "a") return "coder-a";
  if (pin === "b") return "coder-b";
  if (lastCoder && rotate.includes(lastCoder)) {
    return rotate[(rotate.indexOf(lastCoder) + 1) % rotate.length];
  }
  return rotate[0];
}

export function planCommits(files: ChangedFile[], roster: Roster, opts: PlanOpts = {}): CommitPlan {
  const groups = new Map<RouteRole, string[]>();
  for (const f of files) {
    const role = routeFile(f.path, roster.routes);
    const arr = groups.get(role) ?? [];
    arr.push(f.path);
    if (f.oldPath) arr.push(f.oldPath);
    groups.set(role, arr);
  }

  const coderRoute = roster.routes.find((r) => r.role === "coder");
  const rotate = coderRoute?.rotate ?? ["coder-a", "coder-b"];

  let nextLastCoder: RoleKey | undefined;
  const buckets: Bucket[] = [];
  for (const routeRole of COMMIT_ORDER) {
    const paths = groups.get(routeRole);
    if (!paths || paths.length === 0) continue;
    let author: Author;
    if (routeRole === "coder") {
      const coderKey = resolveCoder(rotate, opts.coderPin, opts.lastCoder);
      author = authorOf(coderKey, roster);
      nextLastCoder = coderKey;
    } else {
      author = authorOf(routeRole as RoleKey, roster);
    }
    buckets.push({ routeRole, author, paths });
  }
  return { buckets, nextLastCoder };
}

export function dominantBucket(buckets: Bucket[]): Bucket {
  if (buckets.length === 0) throw new Error("no buckets");
  return [...buckets].sort((a, b) => {
    if (b.paths.length !== a.paths.length) return b.paths.length - a.paths.length;
    return PRECEDENCE.indexOf(a.routeRole) - PRECEDENCE.indexOf(b.routeRole);
  })[0];
}
