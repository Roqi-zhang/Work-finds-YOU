// Global document library + analysis cache.
// Same document uploaded again → reuse the stored analysis instead of calling the model.
//
// Privacy rule: JD analyses are shared across users (`scope_key = 'global'`),
// resume analyses are scoped to their owner (`scope_key = <user_id>`).

// deno-lint-ignore no-explicit-any
type Admin = any;

export type AnalysisKey = {
  contentHash: string;
  kind: "resume" | "jd";
  stage: string;
  promptVersion: string;
  schemaVersion: string;
  /** 'global' for JDs, the user id for resumes. */
  scopeKey?: string;
};

export async function getAnalysis<T>(admin: Admin, k: AnalysisKey): Promise<T | null> {
  const { data, error } = await admin
    .from("document_analyses")
    .select("payload")
    .eq("content_hash", k.contentHash)
    .eq("kind", k.kind)
    .eq("stage", k.stage)
    .eq("prompt_version", k.promptVersion)
    .eq("schema_version", k.schemaVersion)
    .eq("scope_key", k.scopeKey ?? "global")
    .maybeSingle();
  if (error) {
    console.warn("docstore read failed", error.message);
    return null;
  }
  return (data?.payload as T) ?? null;
}

export async function putAnalysis(admin: Admin, k: AnalysisKey, payload: unknown, model?: string) {
  const { error } = await admin.from("document_analyses").upsert(
    {
      content_hash: k.contentHash,
      kind: k.kind,
      stage: k.stage,
      prompt_version: k.promptVersion,
      schema_version: k.schemaVersion,
      scope_key: k.scopeKey ?? "global",
      model: model ?? null,
      payload,
    },
    { onConflict: "content_hash,kind,stage,prompt_version,schema_version,scope_key" },
  );
  if (error) console.warn("docstore write failed", error.message);
}

/** Register the document itself once; bump `seen_count` on every repeat upload. */
export async function recordDocument(
  admin: Admin,
  d: {
    contentHash: string;
    kind: "resume" | "jd";
    ownerId?: string | null;
    textLen?: number;
    storagePath?: string | null;
    fileName?: string | null;
  },
) {
  const { data: existing } = await admin
    .from("documents")
    .select("id, seen_count")
    .eq("content_hash", d.contentHash)
    .eq("kind", d.kind)
    .maybeSingle();
  if (existing) {
    await admin.from("documents").update({ seen_count: (existing.seen_count ?? 1) + 1 }).eq("id", existing.id);
    return;
  }
  const { error } = await admin.from("documents").insert({
    content_hash: d.contentHash,
    kind: d.kind,
    owner_id: d.ownerId ?? null,
    text_len: d.textLen ?? null,
    storage_path: d.storagePath ?? null,
    file_name: d.fileName ?? null,
  });
  if (error) console.warn("documents insert failed", error.message);
}
