// Presentation Adapter — the single place where the rich internal V2 structures
// are narrowed down to the legacy UI contract the React pages already consume.
// The frontend must never see ExperienceRecord / CapabilitySignal / RequirementSignal.

import { DIMS, type DimInput, type Level } from "./scoring.ts";
import type {
  CandidateDimension,
  CandidateProfile,
  DecisionFactor,
  DimensionMatch,
  EvidenceItem,
  IdealCandidateProfile,
  IdealDimension,
} from "./schemas.ts";

/** Legacy per-dimension shape consumed by Profile.tsx / JobProfile.tsx / Match.tsx. */
export type LegacyDim = DimInput;

const quoteById = (evidence: EvidenceItem[]) => {
  const m = new Map(evidence.map((e) => [e.id, e.rawQuote]));
  return (ids: string[] = []) => ids.map((id) => m.get(id)).filter(Boolean) as string[];
};

/** Guarantee all 8 dimensions in canonical order — a missing key would blank the UI. */
function fill(dims: LegacyDim[]): LegacyDim[] {
  const by = new Map(dims.map((d) => [d.key, d]));
  return DIMS.map((meta) => {
    const d = by.get(meta.key);
    return (
      d ?? { key: meta.key, level: "missing" as Level, evidence: "", why: "", action: "", note: "" }
    );
  });
}

/* ------------------------------------------------------------------ *
 * Candidate profile → legacy dimensions
 * ------------------------------------------------------------------ */

function summariseGroups(d: CandidateDimension, resolve: (ids?: string[]) => string[]): string {
  const groups = d.evidenceGroups ?? [];
  if (groups.length === 0) return "";
  const primary = groups.filter((g) => g.evidenceRole === "primary");
  const lead = (primary[0] ?? groups[0]);
  const labels = groups.map((g) => g.experienceLabel).filter(Boolean);
  const head = lead.claim || resolve(lead.evidenceIds)[0] || "";
  if (groups.length === 1) return head;
  return `${head}（${labels.slice(0, 3).join(" + ")} 等 ${groups.length} 段经历）`;
}

export function candidateProfileToDims(
  profile: Pick<CandidateProfile, "dimensions">,
  evidence: EvidenceItem[] = [],
): LegacyDim[] {
  const resolve = quoteById(evidence);
  return fill(
    (profile.dimensions ?? []).map((d) => ({
      key: d.key,
      level: d.level,
      evidence: summariseGroups(d, resolve),
      why: d.why,
      // `evidenceAction` is intentionally mapped onto the legacy `action` field.
      action: d.evidenceAction,
      note: d.note,
    })),
  );
}

/* ------------------------------------------------------------------ *
 * Ideal candidate profile → legacy dimensions
 * The legacy `level` on the JD side means "requirement strength", so
 * `requiredLevel` maps straight onto it.
 * ------------------------------------------------------------------ */

export function idealProfileToDims(
  profile: Pick<IdealCandidateProfile, "dimensions">,
): LegacyDim[] {
  return fill(
    (profile.dimensions ?? []).map((d: IdealDimension) => ({
      key: d.key,
      level: d.requiredLevel,
      evidence: d.evidence,
      why: d.why,
      action: d.action,
      note: d.note,
    })),
  );
}

/* ------------------------------------------------------------------ *
 * Gap analysis → legacy dimensions + legacy reasoning_trace
 * ------------------------------------------------------------------ */

type MatchDimInput = DimensionMatch & { evidence?: string; why?: string; note?: string };

export function dimensionMatchesToDims(matches: MatchDimInput[]): LegacyDim[] {
  return fill(
    (matches ?? []).map((m) => ({
      key: m.dimensionKey,
      level: m.candidateLevel,
      evidence: m.evidence ?? "",
      why: m.why ?? "",
      action: m.developmentAction ?? "",
      note: m.note ?? "",
    })),
  );
}

/** Match.tsx parses `reasoning_trace` as `[{step, detail}]` — keep that shape. */
export function decisionFactorsToTrace(
  factors: DecisionFactor[] = [],
  rationaleSummary?: string,
): string {
  const trace = factors.map((f) => ({ step: f.step, detail: f.detail }));
  if (rationaleSummary) trace.push({ step: "结论", detail: rationaleSummary });
  return JSON.stringify(trace);
}
