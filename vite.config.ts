import { defineConfig, type Plugin } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "path";
import fs from "fs";

const BACKEND = process.env.HERMES_DASHBOARD_URL ?? "http://127.0.0.1:9119";

/**
 * Custom file middleware to allow reading/writing files under Coding workspace.
 */
function customFileMiddleware(): Plugin {
  return {
    name: "custom-file-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (!req.url) return next();

        // Parse URL
        const parsedUrl = new URL(req.url, "http://localhost:5173");
        const pathname = parsedUrl.pathname;

        if (pathname === "/api/custom/projects") {
          try {
            const codingPath = "C:\\Users\\Ivonne\\Documents\\Coding";
            if (!fs.existsSync(codingPath)) {
              res.writeHead(200, { "Content-Type": "application/json" });
              res.end(JSON.stringify(["Trismegistus-Dashboard"]));
              return;
            }
            const items = fs.readdirSync(codingPath);
            const subdirs = items.filter(item => {
              try {
                return fs.statSync(path.join(codingPath, item)).isDirectory();
              } catch {
                return false;
              }
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(subdirs));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
          return;
        }

        if (pathname === "/api/custom/docs") {
          try {
            const docsPath = "C:\\Users\\Ivonne\\Documents\\Coding\\docs";
            if (!fs.existsSync(docsPath)) {
              fs.mkdirSync(docsPath, { recursive: true });
            }
            interface DocItem {
              name: string;
              type: "directory" | "file";
              children?: DocItem[];
              size?: number;
              path?: string;
            }
            function getFiles(dir: string): DocItem[] {
              const items = fs.readdirSync(dir);
              const results: DocItem[] = [];
              items.forEach(item => {
                const fullPath = path.join(dir, item);
                const stat = fs.statSync(fullPath);
                if (stat.isDirectory()) {
                  results.push({
                    name: item,
                    type: "directory",
                    children: getFiles(fullPath)
                  });
                } else if (stat.isFile()) {
                  results.push({
                    name: item,
                    type: "file",
                    size: stat.size,
                    path: path.relative(docsPath, fullPath).replace(/\\/g, "/")
                  });
                }
              });
              return results;
            }
            const files = getFiles(docsPath);
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(files));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
          return;
        }

        if (pathname === "/api/custom/docs/read") {
          try {
            const fileQuery = parsedUrl.searchParams.get("file");
            if (!fileQuery) {
              res.writeHead(400, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "Missing 'file' parameter" }));
              return;
            }
            const safePath = path.normalize(fileQuery).replace(/^(\.\.[/\\])+/, "");
            const fullPath = path.join("C:\\Users\\Ivonne\\Documents\\Coding\\docs", safePath);
            if (!fs.existsSync(fullPath)) {
              res.writeHead(404, { "Content-Type": "application/json" });
              res.end(JSON.stringify({ error: "File not found" }));
              return;
            }
            const content = fs.readFileSync(fullPath, "utf-8");
            res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
            res.end(content);
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
          return;
        }

        if (pathname === "/api/custom/agents") {
          try {
            const codingPath = "C:\\Users\\Ivonne\\Documents\\Coding";
            const workspacePath = path.join(codingPath, "Trismegistus-Dashboard");
            
            const results: Record<string, string> = {};
            const filesToCheck = ["AGENTS.md", "CLAUDE.md", "GEMINI.md"];
            filesToCheck.forEach(file => {
              const fullPath = path.join(workspacePath, file);
              if (fs.existsSync(fullPath)) {
                results[file] = fs.readFileSync(fullPath, "utf-8");
              } else {
                results[file] = `# ${file}\nNo content found at ${fullPath}.`;
              }
            });
            res.writeHead(200, { "Content-Type": "application/json" });
            res.end(JSON.stringify(results));
          } catch (err) {
            res.writeHead(500, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ error: (err as Error).message }));
          }
          return;
        }

        next();
      });
    }
  };
}

/**
 * In production the Python `hermes dashboard` server injects a one-shot
 * session token into `index.html` (see `hermes_cli/web_server.py`). The
 * Vite dev server serves its own `index.html`, so unless we forward that
 * token, every protected `/api/*` call 401s.
 *
 * This plugin fetches the running dashboard's `index.html` on each dev page
 * load, scrapes the `window.__HERMES_SESSION_TOKEN__` assignment, and
 * re-injects it into the dev HTML. No-op in production builds.
 */
function hermesDevToken(): Plugin {
  const TOKEN_RE = /window\.__HERMES_SESSION_TOKEN__\s*=\s*"([^"]+)"/;
  const EMBEDDED_RE =
    /window\.__HERMES_DASHBOARD_EMBEDDED_CHAT__\s*=\s*(true|false)/;

  return {
    name: "hermes:dev-session-token",
    apply: "serve",
    async transformIndexHtml() {
      try {
        const res = await fetch(BACKEND, { headers: { accept: "text/html" } });
        const html = await res.text();
        const match = html.match(TOKEN_RE);
        if (!match) {
          console.warn(
            `[hermes] Could not find session token in ${BACKEND} — ` +
              `is \`hermes dashboard\` running? /api calls will 401.`,
          );
          return;
        }
        const embeddedMatch = html.match(EMBEDDED_RE);
        const embeddedJs = embeddedMatch ? embeddedMatch[1] : "true";
        return [
          {
            tag: "script",
            injectTo: "head",
            children:
              `window.__HERMES_SESSION_TOKEN__="${match[1]}";` +
              `window.__HERMES_DASHBOARD_EMBEDDED_CHAT__=${embeddedJs};`,
          },
        ];
      } catch (err) {
        console.warn(
          `[hermes] Dashboard at ${BACKEND} unreachable — ` +
            `start it with \`hermes dashboard\` or set HERMES_DASHBOARD_URL. ` +
            `(${(err as Error).message})`,
        );
      }
    },
  };
}

export default defineConfig({
  plugins: [react(), tailwindcss(), hermesDevToken(), customFileMiddleware()],

  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: [
      "react",
      "react-dom",
    ],
  },
  build: {
    outDir: "dist",
    emptyOutDir: true,
  },
  server: {
    port: 5173,
    proxy: {
      "/api": {
        target: BACKEND,
        ws: true,
      },
      "/dashboard-plugins": BACKEND,
      "/obs": { target: "http://127.0.0.1:4000", ws: true, rewrite: (p: string) => p.replace(/^\/obs/, "") },
    },
  },
});
