#!/usr/bin/env node
// PostToolUse(Write|Edit) lint-on-edit hook: runs ESLint on the file Claude just
// edited and feeds any findings back as model context. Non-blocking by design —
// it never fails the edit; it only surfaces lint output so Claude can self-correct.
import { readFileSync } from "node:fs";
import { execSync } from "node:child_process";

let filePath;
try {
  const data = JSON.parse(readFileSync(0, "utf8") || "{}");
  filePath = (data.tool_input || {}).file_path || (data.tool_response || {}).filePath;
} catch {
  process.exit(0);
}

// Only lint TypeScript sources; ignore everything else (json, css, md, ...).
if (!filePath || !/\.tsx?$/i.test(filePath)) process.exit(0);

try {
  execSync(`npx eslint "${filePath}"`, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  // exit 0 from eslint => clean; stay silent.
} catch (e) {
  const text = `${e.stdout || ""}${e.stderr || ""}`.trim();
  if (text) {
    process.stdout.write(
      JSON.stringify({
        hookSpecificOutput: {
          hookEventName: "PostToolUse",
          additionalContext: `ESLint reported issues on ${filePath}:\n${text}`,
        },
      }),
    );
  }
}
process.exit(0);
