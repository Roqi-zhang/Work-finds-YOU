import { createOpenAI } from "npm:@ai-sdk/openai@3";
import { streamText, Output, jsonSchema, type ModelMessage } from "npm:ai@6";
import { accessScope, blockedAccess, blockAccess } from "./ai-access.ts";
import { providerErrorMessage } from "./ai-error-policy.ts";

import {
  createLovableAiGatewayRunIdFetch,
  getLovableAiGatewayRunId,
  withLovableAiGatewayRunIdHeader,
} from "./role-run-id.ts";

export function createResponsesCall(
  request: Request,
  config: { baseURL: string; apiKey: string; model: string },
  messages: ModelMessage[],
  instructions?: string,
  schema?: Record<string, unknown>,
) {
  const runIdFetch = createLovableAiGatewayRunIdFetch(getLovableAiGatewayRunId(request));
  const provider = createOpenAI({
    baseURL: `${config.baseURL.replace(/\/+$/, "").replace(/\/v1$/, "")}/v1`,
    apiKey: config.apiKey,
    headers: { "Lovable-API-Key": config.apiKey, "X-Lovable-AIG-SDK": "vercel-ai-sdk" },
    fetch: async (input, init) => {
      const scope = await accessScope(`${config.baseURL.replace(/\/+$/, "")}/responses`, config.model);
      const denied = await blockedAccess(scope);
      if (denied) return new Response(JSON.stringify({ error: { message: denied } }), { status: 403, headers: { "Content-Type": "application/json" } });
      const response = await runIdFetch.fetch(input, init);
      if (response.status !== 403) return response;
      const message = providerErrorMessage(403, await response.text());
      await blockAccess(scope, message);
      return new Response(JSON.stringify({ error: { message } }), { status: 403, headers: response.headers });
    },
  });
  const reasoning = config.model !== "openai/chat-latest";
  const result = streamText({
    model: provider.responses(config.model),
    // AI SDK 6 lacks `instructions`: rename this key to `system` there.
    ...(instructions ? { system: instructions } : {}),
    messages,
    abortSignal: request.signal,
    ...(schema ? { output: Output.object({ schema: jsonSchema(schema) }) } : {}),
    providerOptions: {
      openai: {
        store: false,
        ...(reasoning
          ? {
              forceReasoning: true,
              reasoningEffort: "low",
              reasoningSummary: "auto",
              include: ["reasoning.encrypted_content"],
            }
          : {}),
      },
    },
  });
  return {
    result,
    getRunId: runIdFetch.getRunId,
    response: () =>
      withLovableAiGatewayRunIdHeader(result.toUIMessageStreamResponse({ sendReasoning: true }), runIdFetch),
  };
}
