import { Database } from "bun:sqlite";
import type { HookEvent, FilterOptions, Theme, ThemeSearchQuery, AgentTokenUsage } from "./types";

export let db: Database;

export function initDatabase(): void {
  db = new Database(process.env.OBS_DB_PATH || "events.db");

  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA synchronous = NORMAL");

  db.exec(`
    CREATE TABLE IF NOT EXISTS events (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      source_app TEXT NOT NULL,
      session_id TEXT NOT NULL,
      hook_event_type TEXT NOT NULL,
      payload TEXT NOT NULL,
      chat TEXT,
      summary TEXT,
      timestamp INTEGER NOT NULL,
      humanInTheLoop TEXT,
      humanInTheLoopStatus TEXT,
      model_name TEXT,
      agent_id TEXT,
      agent_type TEXT,
      parent_session_id TEXT,
      agent_transcript_path TEXT,
      input_tokens INTEGER,
      output_tokens INTEGER,
      cache_creation_tokens INTEGER,
      cache_read_tokens INTEGER,
      total_tokens INTEGER,
      cost REAL
    )
  `);

  // Idempotent migrations for pre-existing DBs
  const cols = db.prepare("PRAGMA table_info(events)").all() as Array<{ name: string }>;
  const has = (name: string) => cols.some((c) => c.name === name);
  const alters: string[] = [];
  if (!has("chat")) alters.push("ADD COLUMN chat TEXT");
  if (!has("summary")) alters.push("ADD COLUMN summary TEXT");
  if (!has("humanInTheLoop")) alters.push("ADD COLUMN humanInTheLoop TEXT");
  if (!has("humanInTheLoopStatus")) alters.push("ADD COLUMN humanInTheLoopStatus TEXT");
  if (!has("model_name")) alters.push("ADD COLUMN model_name TEXT");
  if (!has("agent_id")) alters.push("ADD COLUMN agent_id TEXT");
  if (!has("agent_type")) alters.push("ADD COLUMN agent_type TEXT");
  if (!has("parent_session_id")) alters.push("ADD COLUMN parent_session_id TEXT");
  if (!has("agent_transcript_path")) alters.push("ADD COLUMN agent_transcript_path TEXT");
  if (!has("input_tokens")) alters.push("ADD COLUMN input_tokens INTEGER");
  if (!has("output_tokens")) alters.push("ADD COLUMN output_tokens INTEGER");
  if (!has("cache_creation_tokens")) alters.push("ADD COLUMN cache_creation_tokens INTEGER");
  if (!has("cache_read_tokens")) alters.push("ADD COLUMN cache_read_tokens INTEGER");
  if (!has("total_tokens")) alters.push("ADD COLUMN total_tokens INTEGER");
  if (!has("cost")) alters.push("ADD COLUMN cost REAL");
  for (const a of alters) db.exec(`ALTER TABLE events ${a}`);

  db.exec("CREATE INDEX IF NOT EXISTS idx_source_app ON events(source_app)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_session_id ON events(session_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_hook_event_type ON events(hook_event_type)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_timestamp ON events(timestamp)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_agent_id ON events(agent_id)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_parent_session_id ON events(parent_session_id)");

  db.exec(`
    CREATE TABLE IF NOT EXISTS themes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL UNIQUE,
      displayName TEXT NOT NULL,
      description TEXT,
      colors TEXT NOT NULL,
      isPublic INTEGER NOT NULL DEFAULT 0,
      authorId TEXT,
      authorName TEXT,
      createdAt INTEGER NOT NULL,
      updatedAt INTEGER NOT NULL,
      tags TEXT,
      downloadCount INTEGER DEFAULT 0,
      rating REAL DEFAULT 0,
      ratingCount INTEGER DEFAULT 0
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_shares (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      shareToken TEXT NOT NULL UNIQUE,
      expiresAt INTEGER,
      isPublic INTEGER NOT NULL DEFAULT 0,
      allowedUsers TEXT,
      createdAt INTEGER NOT NULL,
      accessCount INTEGER DEFAULT 0,
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS theme_ratings (
      id TEXT PRIMARY KEY,
      themeId TEXT NOT NULL,
      userId TEXT NOT NULL,
      rating INTEGER NOT NULL,
      comment TEXT,
      createdAt INTEGER NOT NULL,
      UNIQUE(themeId, userId),
      FOREIGN KEY (themeId) REFERENCES themes (id) ON DELETE CASCADE
    )
  `);
  db.exec("CREATE INDEX IF NOT EXISTS idx_themes_name ON themes(name)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_themes_isPublic ON themes(isPublic)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_themes_createdAt ON themes(createdAt)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_theme_shares_token ON theme_shares(shareToken)");
  db.exec("CREATE INDEX IF NOT EXISTS idx_theme_ratings_theme ON theme_ratings(themeId)");
}

function tokensToColumns(t?: AgentTokenUsage) {
  return {
    input_tokens: t?.input_tokens ?? null,
    output_tokens: t?.output_tokens ?? null,
    cache_creation_tokens: t?.cache_creation_tokens ?? null,
    cache_read_tokens: t?.cache_read_tokens ?? null,
    total_tokens: t?.total_tokens ?? null,
    cost: t?.cost ?? null,
  };
}

function columnsToTokens(row: Record<string, unknown>): AgentTokenUsage | undefined {
  const keys = ["input_tokens", "output_tokens", "cache_creation_tokens", "cache_read_tokens", "total_tokens", "cost"] as const;
  if (keys.every((k) => row[k] == null)) return undefined;
  const t: AgentTokenUsage = {};
  for (const k of keys) {
    if (row[k] != null) (t as Record<string, number>)[k] = row[k] as number;
  }
  return t;
}

export function insertEvent(event: HookEvent): HookEvent {
  const timestamp = event.timestamp ?? Date.now();
  let humanInTheLoopStatus = event.humanInTheLoopStatus;
  if (event.humanInTheLoop && !humanInTheLoopStatus) {
    humanInTheLoopStatus = { status: "pending" };
  }
  const tc = tokensToColumns(event.tokens);
  const stmt = db.prepare(`
    INSERT INTO events (
      source_app, session_id, hook_event_type, payload, chat, summary, timestamp,
      humanInTheLoop, humanInTheLoopStatus, model_name,
      agent_id, agent_type, parent_session_id, agent_transcript_path,
      input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  const result = stmt.run(
    event.source_app, event.session_id, event.hook_event_type,
    JSON.stringify(event.payload),
    event.chat ? JSON.stringify(event.chat) : null,
    event.summary ?? null, timestamp,
    event.humanInTheLoop ? JSON.stringify(event.humanInTheLoop) : null,
    humanInTheLoopStatus ? JSON.stringify(humanInTheLoopStatus) : null,
    event.model_name ?? null,
    event.agent_id ?? null, event.agent_type ?? null,
    event.parent_session_id ?? null, event.agent_transcript_path ?? null,
    tc.input_tokens, tc.output_tokens, tc.cache_creation_tokens,
    tc.cache_read_tokens, tc.total_tokens, tc.cost
  );
  return { ...event, id: result.lastInsertRowid as number, timestamp, humanInTheLoopStatus };
}

export function updateEventTokens(id: number, tokens: AgentTokenUsage): void {
  const tc = tokensToColumns(tokens);
  db.prepare(`
    UPDATE events SET
      input_tokens = ?, output_tokens = ?, cache_creation_tokens = ?,
      cache_read_tokens = ?, total_tokens = ?, cost = ?
    WHERE id = ?
  `).run(tc.input_tokens, tc.output_tokens, tc.cache_creation_tokens,
         tc.cache_read_tokens, tc.total_tokens, tc.cost, id);
}

function rowToEvent(row: Record<string, unknown>): HookEvent {
  return {
    id: row["id"] as number,
    source_app: row["source_app"] as string,
    session_id: row["session_id"] as string,
    hook_event_type: row["hook_event_type"] as string,
    payload: JSON.parse(row["payload"] as string) as Record<string, unknown>,
    chat: row["chat"] ? JSON.parse(row["chat"] as string) as unknown[] : undefined,
    summary: row["summary"] as string | undefined ?? undefined,
    timestamp: row["timestamp"] as number,
    humanInTheLoop: row["humanInTheLoop"] ? JSON.parse(row["humanInTheLoop"] as string) : undefined,
    humanInTheLoopStatus: row["humanInTheLoopStatus"] ? JSON.parse(row["humanInTheLoopStatus"] as string) : undefined,
    model_name: row["model_name"] as string | undefined ?? undefined,
    agent_id: row["agent_id"] as string | undefined ?? undefined,
    agent_type: row["agent_type"] as string | undefined ?? undefined,
    parent_session_id: row["parent_session_id"] as string | undefined ?? undefined,
    agent_transcript_path: row["agent_transcript_path"] as string | undefined ?? undefined,
    tokens: columnsToTokens(row),
  };
}

export function getFilterOptions(): FilterOptions {
  const sourceApps = db.prepare("SELECT DISTINCT source_app FROM events ORDER BY source_app").all() as Array<{ source_app: string }>;
  const sessionIds = db.prepare("SELECT DISTINCT session_id FROM events ORDER BY session_id DESC LIMIT 300").all() as Array<{ session_id: string }>;
  const hookEventTypes = db.prepare("SELECT DISTINCT hook_event_type FROM events ORDER BY hook_event_type").all() as Array<{ hook_event_type: string }>;
  return {
    source_apps: sourceApps.map((r) => r.source_app),
    session_ids: sessionIds.map((r) => r.session_id),
    hook_event_types: hookEventTypes.map((r) => r.hook_event_type),
  };
}

export function getRecentEvents(limit = 300): HookEvent[] {
  const rows = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp,
           humanInTheLoop, humanInTheLoopStatus, model_name,
           agent_id, agent_type, parent_session_id, agent_transcript_path,
           input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost
    FROM events ORDER BY timestamp DESC LIMIT ?
  `).all(limit) as Array<Record<string, unknown>>;
  return rows.map(rowToEvent).reverse();
}

export function insertTheme(theme: Theme): Theme {
  db.prepare(`
    INSERT INTO themes (id, name, displayName, description, colors, isPublic, authorId, authorName,
                        createdAt, updatedAt, tags, downloadCount, rating, ratingCount)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    theme.id, theme.name, theme.displayName, theme.description ?? null,
    JSON.stringify(theme.colors), theme.isPublic ? 1 : 0,
    theme.authorId ?? null, theme.authorName ?? null,
    theme.createdAt, theme.updatedAt, JSON.stringify(theme.tags),
    theme.downloadCount ?? 0, theme.rating ?? 0, theme.ratingCount ?? 0
  );
  return theme;
}

export function updateTheme(id: string, updates: Partial<Theme>): boolean {
  const allowed = ["displayName", "description", "colors", "isPublic", "updatedAt", "tags"] as const;
  type AllowedKey = (typeof allowed)[number];
  const keys = (Object.keys(updates) as string[]).filter((k): k is AllowedKey => (allowed as readonly string[]).includes(k));
  if (!keys.length) return false;
  const setClause = keys.map((k) => `${k} = ?`).join(", ");
  const values = keys.map((k) => {
    const v = updates[k as keyof Theme];
    if (k === "colors" || k === "tags") return JSON.stringify(v);
    if (k === "isPublic") return v ? 1 : 0;
    return v;
  });
  const bindValues = [...values, id].filter((v) => v !== undefined) as import("bun:sqlite").SQLQueryBindings[];
  const result = db.prepare(`UPDATE themes SET ${setClause} WHERE id = ?`).run(...bindValues);
  return (result.changes as number) > 0;
}

export function getTheme(id: string): Theme | null {
  const row = db.prepare("SELECT * FROM themes WHERE id = ?").get(id) as Record<string, unknown> | null;
  if (!row) return null;
  return {
    id: row["id"] as string, name: row["name"] as string,
    displayName: row["displayName"] as string, description: row["description"] as string | undefined,
    colors: JSON.parse(row["colors"] as string) as import("./types").ThemeColors,
    isPublic: Boolean(row["isPublic"]),
    authorId: row["authorId"] as string | undefined, authorName: row["authorName"] as string | undefined,
    createdAt: row["createdAt"] as number, updatedAt: row["updatedAt"] as number,
    tags: JSON.parse((row["tags"] as string) || "[]") as string[],
    downloadCount: row["downloadCount"] as number | undefined,
    rating: row["rating"] as number | undefined, ratingCount: row["ratingCount"] as number | undefined,
  };
}

export function getThemes(query: ThemeSearchQuery = {}): Theme[] {
  let sql = "SELECT * FROM themes WHERE 1=1";
  const params: import("bun:sqlite").SQLQueryBindings[] = [];
  if (query.isPublic !== undefined) { sql += " AND isPublic = ?"; params.push(query.isPublic ? 1 : 0); }
  if (query.authorId) { sql += " AND authorId = ?"; params.push(query.authorId); }
  if (query.query) {
    sql += " AND (name LIKE ? OR displayName LIKE ? OR description LIKE ?)";
    const s = `%${query.query}%`; params.push(s, s, s);
  }
  const sortCol: Record<string, string> = { name: "name", created: "createdAt", updated: "updatedAt", downloads: "downloadCount", rating: "rating" };
  sql += ` ORDER BY ${sortCol[query.sortBy ?? "created"] ?? "createdAt"} ${(query.sortOrder ?? "desc").toUpperCase()}`;
  if (query.limit) { sql += " LIMIT ?"; params.push(query.limit); if (query.offset) { sql += " OFFSET ?"; params.push(query.offset); } }
  return (db.prepare(sql).all(...params) as Array<Record<string, unknown>>).map((row) => ({
    id: row["id"] as string, name: row["name"] as string, displayName: row["displayName"] as string,
    description: row["description"] as string | undefined,
    colors: JSON.parse(row["colors"] as string) as import("./types").ThemeColors,
    isPublic: Boolean(row["isPublic"]),
    authorId: row["authorId"] as string | undefined, authorName: row["authorName"] as string | undefined,
    createdAt: row["createdAt"] as number, updatedAt: row["updatedAt"] as number,
    tags: JSON.parse((row["tags"] as string) || "[]") as string[],
    downloadCount: row["downloadCount"] as number | undefined,
    rating: row["rating"] as number | undefined, ratingCount: row["ratingCount"] as number | undefined,
  }));
}

export function deleteTheme(id: string): boolean {
  return ((db.prepare("DELETE FROM themes WHERE id = ?").run(id)).changes as number) > 0;
}

export function incrementThemeDownloadCount(id: string): boolean {
  return ((db.prepare("UPDATE themes SET downloadCount = downloadCount + 1 WHERE id = ?").run(id)).changes as number) > 0;
}

export function updateEventHITLResponse(id: number, response: unknown): HookEvent | null {
  const status = { status: "responded", respondedAt: (response as Record<string, unknown>).respondedAt, response };
  db.prepare("UPDATE events SET humanInTheLoopStatus = ? WHERE id = ?").run(JSON.stringify(status), id);
  const row = db.prepare(`
    SELECT id, source_app, session_id, hook_event_type, payload, chat, summary, timestamp,
           humanInTheLoop, humanInTheLoopStatus, model_name,
           agent_id, agent_type, parent_session_id, agent_transcript_path,
           input_tokens, output_tokens, cache_creation_tokens, cache_read_tokens, total_tokens, cost
    FROM events WHERE id = ?
  `).get(id) as Record<string, unknown> | null;
  return row ? rowToEvent(row) : null;
}
