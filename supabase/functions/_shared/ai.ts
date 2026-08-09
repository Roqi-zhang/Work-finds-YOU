// AI helper (server only).
// Default: the user's own OpenAI-compatible endpoint (Qwen / 阿里云百炼 MaaS).
// Fallback: Lovable AI Gateway when no custom key is configured.

const LOVABLE_GATEWAY = "https://ai.gateway.lovable.dev/v1/chat/completions";
const LOVABLE_MODEL = "openai/gpt-5.6-sol";
export const OCR_MODEL = "google/gemini-3.6-flash";

function customBase() {
  const base = Deno.env.get("CUSTOM_AI_BASE_URL");
  if (!base) return "";
  // Aliyun MaaS exposes the OpenAI-compatible route under /compatible-mode/v1.
  return base.replace(/\/+$/, "").replace(/\/api\/v1$/, "/compatible-mode/v1");
}

export const MODEL = Deno.env.get("CUSTOM_AI_MODEL") || LOVABLE_MODEL;

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

/** Lightweight completion for OCR/transcription tasks that do not need a JSON grammar. */
export async function callAIText(opts: {
  messages: ChatMessage[];
  model?: string;
  /** OCR and other multimodal calls can bypass a configured text-only endpoint. */
  gateway?: "default" | "lovable";
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<{ text: string; usage: Record<string, number>; model: string; latencyMs: number }> {
  const ep = endpoint(opts.gateway === "lovable");
  const model = opts.model || ep.model;
  const started = Date.now();
  const body: Record<string, unknown> = {
    model,
    messages: opts.messages,
    max_tokens: opts.maxTokens ?? 2500,
  };
  if (!ep.custom) {
    body.reasoning_effort = "none";
  } else {
    body.enable_thinking = false;
    body.temperature = 0;
    body.top_p = 1;
    body.seed = 7;
  }

  let res: Response;
  try {
    res = await fetch(ep.url, {
      method: "POST",
      headers: ep.headers,
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(opts.timeoutMs ?? 30_000),
    });
  } catch (e) {
    if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
      throw new AIError(504, "图片文字识别超时，请改为粘贴 JD 文本或上传清晰截图后重试");
    }
    throw e;
  }

  if (!res.ok) {
    const responseBody = await res.text();
    console.error(`AI text call failed [${res.status}]: ${responseBody}`);
    throw new AIError(res.status, responseBody);
  }

  const json = await res.json();
  return {
    text: String(json?.choices?.[0]?.message?.content ?? "").trim(),
    usage: {
      prompt_tokens: json?.usage?.prompt_tokens ?? 0,
      completion_tokens: json?.usage?.completion_tokens ?? 0,
    },
    model,
    latencyMs: Date.now() - started,
  };
}

function endpoint(forceLovable = false) {
  const key = Deno.env.get("CUSTOM_AI_API_KEY");
  if (!forceLovable && key && customBase()) {
    return {
      url: `${customBase()}/chat/completions`,
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
      model: Deno.env.get("CUSTOM_AI_MODEL") || "qwen3.7-plus",
      custom: true,
    };
  }
  const lk = Deno.env.get("LOVABLE_API_KEY");
  if (!lk) throw new AIError(500, "Missing AI credentials");
  return {
    url: LOVABLE_GATEWAY,
    headers: { "Content-Type": "application/json", "Lovable-API-Key": lk },
    model: LOVABLE_MODEL,
    custom: false,
  };
}

/** Some OpenAI-compatible providers wrap JSON in ```json fences. */
function stripFence(s: string) {
  const m = s.match(/```(?:json)?\s*([\s\S]*?)```/);
  return (m ? m[1] : s).trim();
}

/** Call the model with a strict JSON schema and return the parsed object. */
export async function callAIJson<T>(opts: {
  messages: ChatMessage[];
  schema: Record<string, unknown>;
  schemaName: string;
  model?: string;
  /** Hard wall-clock budget for this call. Keeps us under the 150s gateway limit. */
  timeoutMs?: number;
  maxTokens?: number;
}): Promise<{ data: T; usage: Record<string, number>; model: string; latencyMs: number }> {
  const ep = endpoint();
  const model = opts.model || ep.model;
  const started = Date.now();
  const budget = opts.timeoutMs ?? 55_000;

  const post = async (mode: "json_schema" | "json_object") => {
    const messages =
      mode === "json_object"
        ? [
            {
              role: "system" as const,
              content:
                `只输出一个合法 JSON 对象，不要任何解释或 Markdown 代码块。必须严格符合以下 JSON Schema：\n` +
                JSON.stringify(opts.schema),
            },
            ...opts.messages,
          ]
        : opts.messages;

    const body: Record<string, unknown> = {
      model,
      messages,
      max_tokens: opts.maxTokens ?? 4000,
      response_format:
        mode === "json_schema"
          ? { type: "json_schema", json_schema: { name: opts.schemaName, strict: true, schema: opts.schema } }
          : { type: "json_object" },
    };
    if (!ep.custom) {
      body.reasoning_effort = "none";
    } else {
      body.enable_thinking = false;
      // Deterministic decoding: the same document must always yield the same grading.
      body.temperature = 0;
      body.top_p = 1;
      body.seed = 7;
    }

    const left = budget - (Date.now() - started);
    if (left <= 1000) throw new AIError(504, "AI 响应超时，请稍后重试");
    try {
      return await fetch(ep.url, {
        method: "POST",
        headers: ep.headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(left),
      });
    } catch (e) {
      if ((e as Error).name === "TimeoutError" || (e as Error).name === "AbortError") {
        throw new AIError(504, "AI 响应超时，请稍后重试");
      }
      throw e;
    }
  };


  // Aliyun/OpenAI-compatible endpoints can advertise json_schema support while
  // spending most of the request budget compiling a large strict grammar.
  // json_object keeps the same schema contract in the system prompt and is
  // substantially faster for the multi-layer JD schemas used by this app.
  let res = await post(ep.custom ? "json_object" : "json_schema");
  if (!ep.custom && !res.ok && res.status === 400) {
    // Providers that don't implement json_schema — retry with json_object + inline schema.
    console.warn("json_schema rejected, retrying with json_object");
    res = await post("json_object");
  }

  if (!res.ok) {
    const body = await res.text();
    console.error(`AI call failed [${res.status}]: ${body}`);
    throw new AIError(res.status, body);
  }

  const json = await res.json();
  const text: string = json?.choices?.[0]?.message?.content ?? "";
  let data: T;
  try {
    data = JSON.parse(stripFence(text)) as T;
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
