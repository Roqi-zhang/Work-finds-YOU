// Lovable AI Gateway helper (server only)
const GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
export const MODEL = "openai/gpt-5.6-sol";

export type ContentBlock =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } }
  | { type: "file"; file: { filename: string; file_data: string } };

export type ChatMessage = { role: "system" | "user"; content: string | ContentBlock[] };

export class AIError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

/** Call the gateway with a strict JSON schema and return the parsed object. */
export async function callAIJson<T>(opts: {
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  schemaName: string;
  model?: string;
}): Promise<{ data: T; usage: Record<string, number>; model: string; latencyMs: number }> {
  const key = Deno.env.get("LOVABLE_API_KEY");
  if (!key) throw new AIError(500, "Missing LOVABLE_API_KEY");
  const model = opts.model || MODEL;
  const started = Date.now();

  const res = await fetch(GATEWAY, {
    method: "POST",
    headers: { "Content-Type": "application/json", "Lovable-API-Key": key },
    body: JSON.stringify({
      model,
      reasoning_effort: "none",
      messages: opts.messages,
      response_format: {
        type: "json_schema",
        json_schema: { name: opts.schemaName, strict: true, schema: opts.schema },
      },
    }),
  });

  if (!res.ok) {
    const body = await res.text();
    console.error(`AI gateway failed [${res.status}]: ${body}`);
    throw new AIError(res.status, body);
  }

  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  let data: T;
  try {
    data = JSON.parse(text) as T;
  } catch {
    throw new AIError(502, "Model returned non-JSON output");
  }
  return {
    data,
    usage: {
      prompt_tokens: json?.usage?.prompt_tokens ?? 0,
      completion_tokens: json?.usage?.completion_tokens ?? 0,
    },
    model,
    latencyMs: Date.now() - started,
  };
}
