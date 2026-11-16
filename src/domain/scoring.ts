import type { CompetencyScore, Confidence, Job, Recommendation } from "./types";

/**
 * ─────────────────────────────────────────────────────────────────────────
 *  SCORING RULES: change the weightage here.
 * ─────────────────────────────────────────────────────────────────────────
 * The AI scores each competency 1-5, and only with a verbatim quote as
 * evidence. Code (not the AI) turns those scores into the overall 0-100
 * score, the recommendation and the confidence, so the same answers always
 * give the same result and the rules are easy to audit.
 */
export const SCORING = {
  /**
   * How much a competency counts, by the kind of JD requirement it assesses.
   * A competency that covers several kinds uses the highest weight.
   */
  categoryWeights: {
    must_have: 3,
    soft_skills: 2,
    nice_to_have: 1,
  },
  /** Weight for a competency that isn't linked to any JD requirement. */
  unlinkedWeight: 1,

  /**
   * A competency with no evidence (score null), for example because the
   * question was never reached or the answer was empty.
   *   1    → counts as the lowest score (0 points). The default; missing evidence costs points.
   *   null → left out of the average (only what was covered is scored).
   */
  unscoredCountsAs: 1 as 1 | 2 | 3 | 4 | 5 | null,

  /** Overall score (0-100) → recommendation. */
  thresholds: {
    advance: 70, // at or above → advance (about 3.8/5 on average)
    reject: 35, //  below → reject (about 2.4/5 on average); in between → hold
  },
  /** Advance only when every must-have competency has a score backed by evidence. */
  advanceRequiresAllMustHaves: true,

  /** Confidence = share of the total weight that has evidence. */
  confidence: { high: 0.8, medium: 0.5 },
} as const;

export const SCORING_VERSION = "v1";

type Category = keyof typeof SCORING.categoryWeights;

export interface ScoreLine {
  competency: string;
  category: Category | "unlinked";
  weight: number;
  /** The competency's 1-5 score, or null when there was no evidence. */
  score: number | null;
  /** 0-100 contribution before weighting; null when left out. */
  points: number | null;
}

export interface OverallScore {
  /** Weighted 0-100. */
  value: number;
  out_of: 100;
  /** Share (0-1) of the total weight backed by evidence. */
  coverage: number;
  recommendation: Recommendation;
  confidence: Confidence;
  /** Why the recommendation came out this way, in one sentence. */
  reason: string;
  breakdown: ScoreLine[];
  rules_version: string;
}

/** 1→0, 2→25, 3→50, 4→75, 5→100. */
const toPoints = (score: number) => ((score - 1) / 4) * 100;

export function scoreInterview(job: Job, competencies: CompetencyScore[]): OverallScore {
  const categoryOf = new Map<string, Category>();
  for (const cat of Object.keys(SCORING.categoryWeights) as Category[]) {
    for (const r of job.requirements[cat] ?? []) categoryOf.set(r.id, cat);
  }

  const breakdown: ScoreLine[] = competencies.map((c) => {
    const cats = c.requirement_ids.map((id) => categoryOf.get(id)).filter((x): x is Category => Boolean(x));
    const category = cats.length ? cats.reduce((a, b) => (SCORING.categoryWeights[b] > SCORING.categoryWeights[a] ? b : a)) : "unlinked";
    const weight = category === "unlinked" ? SCORING.unlinkedWeight : SCORING.categoryWeights[category];
    const effective = c.score ?? SCORING.unscoredCountsAs;
    return { competency: c.competency, category, weight, score: c.score, points: effective === null ? null : Math.round(toPoints(effective)) };
  });

  const counted = breakdown.filter((l) => l.points !== null);
  const countedWeight = counted.reduce((s, l) => s + l.weight, 0);
  const totalWeight = breakdown.reduce((s, l) => s + l.weight, 0);
  const evidencedWeight = breakdown.filter((l) => l.score !== null).reduce((s, l) => s + l.weight, 0);

  const value = countedWeight ? Math.round(counted.reduce((s, l) => s + l.weight * l.points!, 0) / countedWeight) : 0;
  const coverage = totalWeight ? Math.round((evidencedWeight / totalWeight) * 100) / 100 : 0;

  const missingMustHaves = breakdown.filter((l) => l.category === "must_have" && l.score === null).map((l) => l.competency);
  const { advance, reject } = SCORING.thresholds;

  let recommendation: Recommendation;
  let reason: string;
  if (!evidencedWeight) {
    recommendation = "reject";
    reason = "No competency had verbatim evidence in the answers.";
  } else if (value >= advance && SCORING.advanceRequiresAllMustHaves && missingMustHaves.length) {
    recommendation = "hold";
    reason = `Score ${value} reaches the advance bar (${advance}), but these must-haves have no evidence yet: ${missingMustHaves.join(", ")}.`;
  } else if (value >= advance) {
    recommendation = "advance";
    reason = `Score ${value} is at or above the advance bar (${advance}).`;
  } else if (value < reject) {
    recommendation = "reject";
    reason = `Score ${value} is below the reject bar (${reject}).`;
  } else {
    recommendation = "hold";
    reason = `Score ${value} is between the reject bar (${reject}) and the advance bar (${advance}).`;
  }

  const confidence: Confidence = coverage >= SCORING.confidence.high ? "high" : coverage >= SCORING.confidence.medium ? "medium" : "low";

  return { value, out_of: 100, coverage, recommendation, confidence, reason, breakdown, rules_version: SCORING_VERSION };
}

/**
 * Re-applies the current SCORING rules to a report. Runs every time a report
 * is served, so changing the weights above also updates existing reports
 * (no AI call needed: it only reuses the saved competency scores).
 */
export function applyScoring<R extends { competencies: CompetencyScore[]; overall: { recommendation: Recommendation; confidence: Confidence; score?: OverallScore } }>(job: Job, report: R): R {
  const score = scoreInterview(job, report.competencies);
  return { ...report, overall: { ...report.overall, recommendation: score.recommendation, confidence: score.confidence, score } };
}
