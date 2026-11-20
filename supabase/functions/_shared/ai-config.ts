// Models verified against the authenticated workspace catalog and actual calls.
export const AI_MODELS = {
  analysis: "openai/gpt-5.6-sol",
  ocr: "google/gemini-3.8-flash",
  research: "openai/gpt-6-astra",
} as const;

export function textRequestOptions(model: string, maxTokens: number) {
  return model.startsWith("openai/")
    ? { max_completion_tokens: maxTokens, reasoning_effort: "none" }
    : { max_tokens: maxTokens };
}