import { initDatabase, insertEvent, getFilterOptions, getRecentEvents, updateEventHITLResponse } from "./db";
import type { HookEvent, HumanInTheLoopResponse } from "./types";
import {
  createTheme, updateThemeById, getThemeById, searchThemes,
  deleteThemeById, exportThemeById, importTheme, getThemeStats,
} from "./theme";

initDatabase();

const wsClients = new Set<import("bun").ServerWebSocket<unknown>>();

async function sendResponseToAgent(wsUrl: string, response: HumanInTheLoopResponse): Promise<void> {
  return new Promise((resolve, reject) => {
    let ws: WebSocket | null = null;
    let done = false;
    const finish = (fn: () => void) => { if (!done) { done = true; try { ws?.close(); } catch { /* ignore */ } fn(); } };

    try {
      ws = new WebSocket(wsUrl);
      ws.onopen = () => {
        try {
          ws!.send(JSON.stringify(response));
          setTimeout(() => finish(resolve), 500);
        } catch (e) { finish(() => reject(e)); }
      };
      ws.onerror = (e) => finish(() => reject(e));
      ws.onclose = () => { /* handled above */ };
      setTimeout(() => finish(() => reject(new Error("Timeout sending response to agent"))), 5000);
    } catch (e) { finish(() => reject(e)); }
  });
}

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

function json(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...CORS, "Content-Type": "application/json" },
  });
}

const server = Bun.serve({
  port: parseInt(process.env.SERVER_PORT ?? "4000"),
  hostname: "127.0.0.1",

  async fetch(req: Request) {
    const url = new URL(req.url);

    if (req.method === "OPTIONS") return new Response(null, { headers: CORS });

    // POST /events
    if (url.pathname === "/events" && req.method === "POST") {
      try {
        const event = (await req.json()) as HookEvent;
        if (!event.source_app || !event.session_id || !event.hook_event_type || !event.payload) {
          return json({ error: "Missing required fields" }, 400);
        }

        const savedEvent = insertEvent(event);

        const msg = JSON.stringify({ type: "event", data: savedEvent });
        wsClients.forEach((c) => { try { c.send(msg); } catch { wsClients.delete(c); } });

        return json(savedEvent);
      } catch {
        return json({ error: "Invalid request" }, 400);
      }
    }

    // GET /events/filter-options
    if (url.pathname === "/events/filter-options" && req.method === "GET") {
      return json(getFilterOptions());
    }

    // GET /events/recent
    if (url.pathname === "/events/recent" && req.method === "GET") {
      const limit = parseInt(url.searchParams.get("limit") ?? "300");
      return json(getRecentEvents(limit));
    }

    // POST /events/:id/respond
    if (/^\/events\/\d+\/respond$/.test(url.pathname) && req.method === "POST") {
      const id = parseInt(url.pathname.split("/")[2]!);
      try {
        const response = (await req.json()) as HumanInTheLoopResponse;
        response.respondedAt = Date.now();
        const updatedEvent = updateEventHITLResponse(id, response);
        if (!updatedEvent) return json({ error: "Event not found" }, 404);

        if (updatedEvent.humanInTheLoop?.responseWebSocketUrl) {
          try { await sendResponseToAgent(updatedEvent.humanInTheLoop.responseWebSocketUrl, response); }
          catch { /* don't fail request */ }
        }

        const msg = JSON.stringify({ type: "event", data: updatedEvent });
        wsClients.forEach((c) => { try { c.send(msg); } catch { wsClients.delete(c); } });

        return json(updatedEvent);
      } catch {
        return json({ error: "Invalid request" }, 400);
      }
    }

    // POST /api/themes
    if (url.pathname === "/api/themes" && req.method === "POST") {
      try {
        const data = (await req.json()) as Record<string, unknown>;
        const result = await createTheme(data);
        return json(result, result.success ? 201 : 400);
      } catch { return json({ success: false, error: "Invalid request body" }, 400); }
    }

    // GET /api/themes
    if (url.pathname === "/api/themes" && req.method === "GET") {
      const q = {
        query: url.searchParams.get("query") ?? undefined,
        isPublic: url.searchParams.has("isPublic") ? url.searchParams.get("isPublic") === "true" : undefined,
        authorId: url.searchParams.get("authorId") ?? undefined,
        sortBy: (url.searchParams.get("sortBy") ?? undefined) as import("./types").ThemeSearchQuery["sortBy"],
        sortOrder: (url.searchParams.get("sortOrder") ?? undefined) as import("./types").ThemeSearchQuery["sortOrder"],
        limit: url.searchParams.has("limit") ? parseInt(url.searchParams.get("limit")!) : undefined,
        offset: url.searchParams.has("offset") ? parseInt(url.searchParams.get("offset")!) : undefined,
      };
      return json(await searchThemes(q));
    }

    // GET /api/themes/stats
    if (url.pathname === "/api/themes/stats" && req.method === "GET") {
      return json(await getThemeStats());
    }

    // POST /api/themes/import
    if (url.pathname === "/api/themes/import" && req.method === "POST") {
      try {
        const data = (await req.json()) as Record<string, unknown>;
        const authorId = url.searchParams.get("authorId") ?? undefined;
        const result = await importTheme(data, authorId);
        return json(result, result.success ? 201 : 400);
      } catch { return json({ success: false, error: "Invalid import data" }, 400); }
    }

    // /api/themes/:id routes
    if (url.pathname.startsWith("/api/themes/") && !url.pathname.endsWith("/import")) {
      const parts = url.pathname.split("/");
      const id = parts[3];
      if (!id) return json({ success: false, error: "Theme ID is required" }, 400);

      // GET /api/themes/:id/export
      if (parts[4] === "export" && req.method === "GET") {
        const result = await exportThemeById(id);
        if (!result.success) return json(result, result.error?.includes("not found") ? 404 : 400);
        return new Response(JSON.stringify(result.data), {
          headers: { ...CORS, "Content-Type": "application/json", "Content-Disposition": `attachment; filename="${id}.json"` },
        });
      }

      if (req.method === "GET") {
        const result = await getThemeById(id);
        return json(result, result.success ? 200 : 404);
      }

      if (req.method === "PUT") {
        try {
          const data = (await req.json()) as Record<string, unknown>;
          const result = await updateThemeById(id, data);
          return json(result, result.success ? 200 : 400);
        } catch { return json({ success: false, error: "Invalid request body" }, 400); }
      }

      if (req.method === "DELETE") {
        const authorId = url.searchParams.get("authorId") ?? undefined;
        const result = await deleteThemeById(id, authorId);
        return json(result, result.success ? 200 : (result.error?.includes("not found") ? 404 : 403));
      }
    }

    // WebSocket upgrade
    if (url.pathname === "/stream") {
      if (server.upgrade(req)) return undefined as unknown as Response;
    }

    return new Response("Multi-Agent Observability Server", {
      headers: { ...CORS, "Content-Type": "text/plain" },
    });
  },

  websocket: {
    open(ws) {
      wsClients.add(ws);
      const events = getRecentEvents(300);
      ws.send(JSON.stringify({ type: "initial", data: events }));
    },
    message(_ws, _message) { /* client messages not used */ },
    close(ws, _code, _reason) { wsClients.delete(ws); },
  },
});

console.log(`🚀 Server running on http://127.0.0.1:${server.port}`);
console.log(`📊 WebSocket endpoint: ws://127.0.0.1:${server.port}/stream`);
console.log(`📮 POST events to: http://127.0.0.1:${server.port}/events`);
