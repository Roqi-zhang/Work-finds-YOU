// Deterministic scoring — the model only supplies evidence + level.
// Version this string whenever the formula changes.
export const SCORING_VERSION = "score-v1";

export const DIMS = [
  { key: "skill", label: "专业技能", weight: 1.4, core: true },
  { key: "business", label: "业务理解", weight: 1.0, core: false },
  { key: "analysis", label: "问题分析", weight: 1.2, core: true },
  { key: "delivery", label: "执行交付", weight: 1.4, core: true },
  { key: "comm", label: "沟通表达", weight: 0.9, core: false },
  { key: "collab", label: "协作影响", weight: 0.9, core: false },
  { key: "learning", label: "学习适应", weight: 0.8, core: false },
  { key: "motive", label: "动机匹配", weight: 1.0, core: false },
] as const;

export type Level = "strong" | "medium" | "weak" | "missing";
export const LEVEL_SCORE: Record<Level, number | null> = {
  strong: 5,
  medium: 3,
  weak: 1,
  missing: null,
};

export type DimInput = {
  key: string;
  level: Level;
  evidence?: string;
  /** JD side only: professional read of this requirement (replaces why/action there). */
  analysis?: string;
  why?: string;
  action?: string;
  note?: string;
  evidenceDetail?: { label: string; claim: string; quotes: string[]; role: string }[];
};

export type DimScored = DimInput & { label: string; score: number | null; core: boolean };

/** Weighted average of the graded dimensions, missing ones excluded from the mean
 *  but penalised when the dimension is a core one. */
export function computeScore(dims: DimInput[]) {
  const byKey = new Map(dims.map((d) => [d.key, d]));
  const scored: DimScored[] = DIMS.map((meta) => {
    const d = byKey.get(meta.key) || { key: meta.key, level: "missing" as Level };
    const level = (LEVEL_SCORE[d.level as Level] === undefined ? "missing" : d.level) as Level;
    return { ...d, key: meta.key, level, label: meta.label, core: meta.core, score: LEVEL_SCORE[level] };
  });

  let sum = 0;
  let weight = 0;
  const missingCore: string[] = [];
  for (let i = 0; i < scored.length; i++) {
    const meta = DIMS[i];
    const s = scored[i].score;
    if (s == null) {
      if (meta.core) missingCore.push(meta.label);
      continue;
    }
    sum += (s / 5) * meta.weight;
    weight += meta.weight;
  }
  const base = weight > 0 ? (sum / weight) * 100 : 0;
  const penalty = missingCore.length * 8;
  const score = Math.max(0, Math.min(99, Math.round(base - penalty)));

  return { score, dimensions: scored, missingCore, scoringVersion: SCORING_VERSION };
}

export function decisionFlag(score: number) {
  if (score >= 85) return { flag: "优先投", win: "高", rank: "Top 1" };
  if (score >= 70) return { flag: "改完再投", win: "中高", rank: "Top 3" };
  if (score >= 55) return { flag: "可投不优先", win: "中", rank: "备选" };
  return { flag: "暂不建议", win: "低", rank: "备选" };
}
