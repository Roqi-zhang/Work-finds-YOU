// Internal V2 schemas for the Evidence-First dual-profile pipeline.
// These types never reach the frontend — `adapter.ts` narrows them down to the
// legacy UI contract. Bump the version constants whenever a shape or prompt changes;
// they take part in the cache fingerprints.

import { DIMS, type Level } from "./scoring.ts";

export const SCHEMA_VERSION = "v2";
export const RUBRIC_VERSION = "rubric-v1";

export const PROMPT_VERSIONS = {
  jdExtraction: "jd-extract-v1",
  jdProfiling: "jd-profile-v3",
  resumeExtraction: "resume-extract-v1",
  resumeProfiling: "resume-profile-v2",
  match: "match-v2",
} as const;


export const DIM_KEYS = DIMS.map((d) => d.key) as unknown as string[];

/* ------------------------------------------------------------------ *
 * Layer 1 — Document Evidence (both pipelines)
 * ------------------------------------------------------------------ */

export type EvidenceItem = {
  id: string;
  section?: string;
  page?: number;
  /** Verbatim quote from the source document. Never a paraphrase. */
  rawQuote: string;
  confidence?: number;
};

/* ------------------------------------------------------------------ *
 * Layer 2 — Context
 * ------------------------------------------------------------------ */

export type RequirementType =
  | "responsibility"
  | "qualification"
  | "must_have"
  | "nice_to_have"
  | "other";

export type RequirementRecord = {
  id: string;
  section?: string;
  text: string;
  type: RequirementType;
  evidenceIds: string[];
};

export type ExperienceRecord = {
  id: string;
  type: string;
  organization?: string;
  role?: string;
  project?: string;
  dateRange?: string;
  context?: string;
  objective?: string;
  responsibilities: string[];
  actions: string[];
  outcomes: string[];
  metrics: string[];
  tools: string[];
  collaboration: string[];
  evidenceIds: string[];
};

/* ------------------------------------------------------------------ *
 * Evaluation Rubric — derived from the JD itself in this release.
 * `benchmark_ref` is the extension point for future preset role packs.
 * ------------------------------------------------------------------ */

export type RubricDimension = {
  definition: string;
  subdimensions: string[];
  anchors: { strong: string; medium: string; weak: string };
  validEvidence: string[];
  invalidInferences: string[];
};

export type EvaluationRubric = {
  version: string;
  source: "jd_derived";
  benchmark_ref: string | null;
  roleSummary: string;
  dimensions: Record<string, RubricDimension>;
};

/* ------------------------------------------------------------------ *
 * Layer 3 — Signals
 * ------------------------------------------------------------------ */

export type Importance = "critical" | "high" | "medium" | "low";
export type Explicitness = "explicit" | "implied";

export type RequirementSignal = {
  id: string;
  requirementIds: string[];
  dimensionKey: string;
  subdimensionKey?: string;
  requiredLevel: Level;
  importance: Importance;
  hard: boolean;
  explicitness: Explicitness;
  confidence: number;
};

export type CapabilitySignal = {
  id: string;
  experienceId: string;
  dimensionKey: string;
  subdimensionKey?: string;
  claim: string;
  evidenceIds: string[];
  ownership?: string;
  complexity?: string;
  scope?: string;
  impact?: string;
  confidence: number;
};

/* ------------------------------------------------------------------ *
 * Layer 4 — Profiles
 * ------------------------------------------------------------------ */

export type EvidenceRole = "primary" | "supporting";

export type DimensionEvidenceGroup = {
  experienceId: string;
  experienceLabel: string;
  claim: string;
  evidenceIds: string[];
  outcome?: string;
  evidenceRole: EvidenceRole;
};

/** Candidate side: what this resume has proven, judged against the rubric only. */
export type CandidateDimension = {
  key: string;
  level: Level;
  why: string;
  note: string;
  /** "How should this resume evidence itself better" — NOT a skill-building action. */
  evidenceAction: string;
  evidenceGroups: DimensionEvidenceGroup[];
  signalIds: string[];
  /** motive may legitimately have no resume-side source. */
  sourceStatus?: "ok" | "evidence_missing" | "not_applicable_source";
};

/** Three headline capabilities summarised on top of a profile. */
export type KeyPoint = { title: string; detail: string };

export type CandidateProfile = {
  schemaVersion: string;
  rubricVersion: string;
  rubricHash: string;
  dimensions: CandidateDimension[];
  keyPoints?: KeyPoint[];
  sections: { experience: string; skills: string; motivation: string; risks: string };
};

/** JD side: what an ideal candidate would look like for this posting. */
export type IdealDimension = {
  key: string;
  requiredLevel: Level;
  importance: Importance;
  hard: boolean;
  /** Verbatim-backed JD requirement for this dimension. */
  evidence: string;
  /** Professional read of the requirement — never an action for the candidate. */
  analysis: string;
  signalIds: string[];
};

export type IdealCandidateProfile = {
  schemaVersion: string;
  rubricVersion: string;
  rubricHash: string;
  roleSummary: string;
  keyPoints?: KeyPoint[];
  dimensions: IdealDimension[];
};


/* ------------------------------------------------------------------ *
 * Match — Gap Analysis
 * ------------------------------------------------------------------ */

export type GapType = "met" | "proven_gap" | "evidence_gap" | "transfer_gap" | "uncertain";

export type DimensionMatch = {
  dimensionKey: string;
  candidateLevel: Level;
  requiredLevel: Level;
  importance: Importance;
  hard: boolean;
  gapType: GapType;
  candidateEvidenceIds: string[];
  requirementIds: string[];
  confidence: number;
  /** "What capability to actually build" — only produced here, never on the profile. */
  developmentAction?: string;
};

export type DecisionFactor = {
  step: string;
  detail: string;
  weight?: Importance;
  evidenceIds?: string[];
};

export type EvidenceLink = {
  id: string;
  side: "resume" | "jd";
  rawQuote: string;
};

/* ------------------------------------------------------------------ *
 * JSON Schema fragments for strict structured output
 * ------------------------------------------------------------------ */

const str = { type: "string" } as const;
const strArr = { type: "array", items: str } as const;
const levelEnum = { type: "string", enum: ["strong", "medium", "weak", "missing"] } as const;
const importanceEnum = { type: "string", enum: ["critical", "high", "medium", "low"] } as const;
const dimKeyEnum = { type: "string", enum: DIM_KEYS } as const;
const num = { type: "number" } as const;

function obj(props: Record<string, unknown>, required?: string[]) {
  return {
    type: "object",
    additionalProperties: false,
    required: required ?? Object.keys(props),
    properties: props,
  } as const;
}

function arr(items: unknown, maxItems?: number, minItems?: number) {
  return { type: "array", items, ...(maxItems ? { maxItems } : {}), ...(minItems ? { minItems } : {}) } as const;
}

export const evidenceItemSchema = obj({
  id: str,
  section: str,
  rawQuote: str,
});

/* ---- JD Call A: evidence + requirement records ---- */
export const jdExtractionSchema = obj({
  title: str,
  company: str,
  location: str,
  salary: str,
  evidence_items: arr(evidenceItemSchema, 60),
  requirement_records: arr(
    obj({
      id: str,
      section: str,
      text: str,
      type: {
        type: "string",
        enum: ["responsibility", "qualification", "must_have", "nice_to_have", "other"],
      },
      evidenceIds: strArr,
    }),
    30,
  ),
});

/* ---- JD Call B: rubric + requirement signals + ideal profile ---- */
export const jdProfilingSchema = obj({
  role_summary: str,
  key_points: arr(obj({ title: str, detail: str }), 3, 3),

  rubric_dimensions: arr(
    obj({
      key: dimKeyEnum,
      definition: str,
      subdimensions: strArr,
      strong_anchor: str,
      medium_anchor: str,
      weak_anchor: str,
      valid_evidence: strArr,
      invalid_inferences: strArr,
    }),
    8,
    8,
  ),
  requirement_signals: arr(
    obj({
      id: str,
      requirementIds: strArr,
      dimensionKey: dimKeyEnum,
      subdimensionKey: str,
      requiredLevel: levelEnum,
      importance: importanceEnum,
      hard: { type: "boolean" },
      explicitness: { type: "string", enum: ["explicit", "implied"] },
      confidence: num,
    }),
    24,
  ),
  ideal_dimensions: arr(
    obj({
      key: dimKeyEnum,
      requiredLevel: levelEnum,
      importance: importanceEnum,
      hard: { type: "boolean" },
      evidence: str,
      analysis: str,
      signalIds: strArr,
    }),
    8,
    8,
  ),
});

/* ---- Resume Call A: evidence + experience records (job-agnostic) ---- */
export const resumeExtractionSchema = obj({
  evidence_items: arr(evidenceItemSchema, 80),
  experience_records: arr(
    obj({
      id: str,
      type: str,
      organization: str,
      role: str,
      project: str,
      dateRange: str,
      context: str,
      objective: str,
      responsibilities: strArr,
      actions: strArr,
      outcomes: strArr,
      metrics: strArr,
      tools: strArr,
      collaboration: strArr,
      evidenceIds: strArr,
    }),
    20,
  ),
});

/* ---- Resume Call B: capability signals + candidate profile ---- */
export const resumeProfilingSchema = obj({
  capability_signals: arr(
    obj({
      id: str,
      experienceId: str,
      dimensionKey: dimKeyEnum,
      subdimensionKey: str,
      claim: str,
      evidenceIds: strArr,
      ownership: str,
      complexity: str,
      scope: str,
      impact: str,
      confidence: num,
    }),
    40,
  ),
  candidate_dimensions: arr(
    obj({
      key: dimKeyEnum,
      level: levelEnum,
      why: str,
      note: str,
      evidenceAction: str,
      sourceStatus: { type: "string", enum: ["ok", "evidence_missing", "not_applicable_source"] },
      signalIds: strArr,
      evidenceGroups: arr(
        obj({
          experienceId: str,
          experienceLabel: str,
          claim: str,
          evidenceIds: strArr,
          outcome: str,
          evidenceRole: { type: "string", enum: ["primary", "supporting"] },
        }),
        6,
      ),
    }),
    8,
    8,
  ),
  sections: obj({ experience: str, skills: str, motivation: str, risks: str }),
});

/* ---- Match: gap analysis ---- */
export const matchSchema = obj({
  overview: str,
  dimension_matches: arr(
    obj({
      dimensionKey: dimKeyEnum,
      candidateLevel: levelEnum,
      requiredLevel: levelEnum,
      importance: importanceEnum,
      hard: { type: "boolean" },
      gapType: {
        type: "string",
        enum: ["met", "proven_gap", "evidence_gap", "transfer_gap", "uncertain"],
      },
      candidateEvidenceIds: strArr,
      requirementIds: strArr,
      confidence: num,
      developmentAction: str,
      evidence: str,
      why: str,
      note: str,
    }),
    8,
    8,
  ),
  judgements: arr(
    obj({
      kind: { type: "string", enum: ["最大优势", "最大缺口", "最大风险"] },
      title: str,
      desc: str,
      tags: arr(str, 3),
      evidence: obj({ mine: str, required: str, reasoning: str, impact: str }),
    }),
    3,
    3,
  ),
  steps: arr(
    obj({
      kind: { type: "string", enum: ["resume", "interview", "portfolio"] },
      title: str,
      desc: str,
      applicable: { type: "boolean" },
      items: arr(obj({ point: str, suggestion: str, evidence: str }), 3, 1),
      mindset: str,
    }),
    3,
    3,
  ),

  decision_factors: arr(obj({ step: str, detail: str }), 6),
  rationale_summary: str,
});
