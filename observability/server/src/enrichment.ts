import type { AgentTokenUsage } from "./types";

const RATES: Record<string, { in: number; out: number; cacheRead: number }> = {
  "claude-opus-4-8": { in: 15, out: 75, cacheRead: 1.5 },
  "claude-sonnet-4-6": { in: 3, out: 15, cacheRead: 0.3 },
  "claude-haiku-4-5": { in: 1, out: 5, cacheRead: 0.1 },
};

function rateFor(model: string) {
  const key = Object.keys(RATES).find((k) => model.includes(k));
  return RATES[key ?? "claude-opus-4-8"] ?? RATES["claude-opus-4-8"]!;
}

export function estimateCost(model: string, t: AgentTokenUsage): number {
  const r = rateFor(model || "");
  const input = (t.input_tokens ?? 0) / 1_000_000;
  const output = (t.output_tokens ?? 0) / 1_000_000;
  const cacheRead = (t.cache_read_tokens ?? 0) / 1_000_000;
  return input * r.in + output * r.out + cacheRead * r.cacheRead;
}

export async function parseTranscriptUsage(transcriptPath: string): Promise<AgentTokenUsage | undefined> {
  let text: string;
  try {
    const file = Bun.file(transcriptPath);
    if (!(await file.exists())) return undefined;
    text = await file.text();
  } catch {
    return undefined;
  }
  let input = 0, output = 0, cacheCreate = 0, cacheRead = 0, sawAny = false, model = "";
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try {
      const entry = JSON.parse(trimmed) as Record<string, unknown>;
      const msg = entry?.message as Record<string, unknown> | undefined;
      const usage = msg?.usage as Record<string, number> | undefined;
      if (entry?.type === "assistant" && usage) {
        sawAny = true;
        input += usage.input_tokens ?? 0;
        output += usage.output_tokens ?? 0;
        cacheCreate += usage.cache_creation_input_tokens ?? 0;
        cacheRead += usage.cache_read_input_tokens ?? 0;
        if (typeof msg?.model === "string") model = msg.model;
      }
    } catch {
      // tolerate malformed lines
    }
  }
  if (!sawAny) return undefined;
  const total = input + output + cacheCreate + cacheRead;
  const usage: AgentTokenUsage = {
    input_tokens: input,
    output_tokens: output,
    cache_creation_tokens: cacheCreate,
    cache_read_tokens: cacheRead,
    total_tokens: total,
  };
  usage.cost = estimateCost(model, usage);
  return usage;
}
