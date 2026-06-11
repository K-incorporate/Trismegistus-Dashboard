import { test, expect } from "bun:test";
import { parseTranscriptUsage, estimateCost } from "../src/enrichment";

test("parseTranscriptUsage sums assistant usage blocks", async () => {
  const path = `${import.meta.dir}/fixtures/transcript.jsonl`;
  await Bun.write(path, [
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 100, output_tokens: 40, cache_read_input_tokens: 10 } } }),
    JSON.stringify({ type: "user", message: { content: "hi" } }),
    JSON.stringify({ type: "assistant", message: { model: "claude-opus-4-8", usage: { input_tokens: 50, output_tokens: 20 } } }),
  ].join("\n"));
  const usage = await parseTranscriptUsage(path);
  expect(usage?.input_tokens).toBe(150);
  expect(usage?.output_tokens).toBe(60);
  expect(usage?.cache_read_tokens).toBe(10);
  expect(usage?.total_tokens).toBe(220);
});

test("parseTranscriptUsage returns undefined for missing file (never throws)", async () => {
  const usage = await parseTranscriptUsage("/no/such/file.jsonl");
  expect(usage).toBeUndefined();
});

test("estimateCost is monotonic in tokens", () => {
  const a = estimateCost("claude-opus-4-8", { input_tokens: 1000, output_tokens: 1000 });
  const b = estimateCost("claude-opus-4-8", { input_tokens: 2000, output_tokens: 2000 });
  expect(b).toBeGreaterThan(a);
});
