import { describe, expect, it } from "vitest";
import { providerErrorMessage, canRetryAI, aiFailureStatus } from "../../supabase/functions/_shared/ai-error-policy";

describe("AI provider errors", () => {
  it("maps the observed unpurchased denial to an actionable safe error", () => {
    const raw = JSON.stringify({ error: { type: "AccessDenied.Unpurchased", message: "Access to model denied", id: "private-request-id" } });
    const message = providerErrorMessage(403, raw);
    expect(message).toContain("尚未开通当前模型的调用权限");
    expect(message).not.toContain("private-request-id");
  });
  it("never retries access denial", () => { expect(canRetryAI(403)).toBe(false); });
  it("preserves provider 403 through every analysis error exit", () => { expect(aiFailureStatus(403)).toBe(403); });
  it("retains the actionable denial rather than replacing it", () => {
    const message = "AI 模型服务尚未开通当前模型的调用权限";
    expect(providerErrorMessage(403, message)).toBe(message);
  });
  it("does not retry invalid requests", () => { expect(canRetryAI(400)).toBe(false); });
  it("allows user retry for transient failures", () => { expect(canRetryAI(503)).toBe(true); });
});