import { describe, expect, it } from "vitest";
import { AI_MODELS, textRequestOptions } from "../../supabase/functions/_shared/ai-config";

describe("verified AI routing", () => {
  it("uses the verified GPT model for core analysis", () => { expect(AI_MODELS.analysis).toBe("openai/gpt-5.6-sol"); });
  it("uses the verified Gemini model for image reading", () => { expect(AI_MODELS.ocr).toBe("google/gemini-3.8-flash"); });
  it("uses the verified research model", () => { expect(AI_MODELS.research).toBe("openai/gpt-6-astra"); });
  it("preserves text budgets using the GPT-supported parameter", () => { expect(textRequestOptions(AI_MODELS.analysis, 600)).toEqual({ max_completion_tokens: 600, reasoning_effort: "none" }); });
  it("does not send OpenAI reasoning parameters to Gemini", () => { expect(textRequestOptions(AI_MODELS.ocr, 2500)).toEqual({ max_tokens: 2500 }); });
});