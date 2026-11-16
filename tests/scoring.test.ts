import { describe, expect, it } from "vitest";
import { SEED_JOBS } from "@/infrastructure/data/demoData";
import { scoreInterview } from "@/domain/scoring";
import type { CompetencyScore } from "@/domain/types";

const job = SEED_JOBS[2];
const [must] = job.requirements.must_have;
const nice = job.requirements.nice_to_have[0] ?? must;
const c = (competency: string, ids: string[], score: number | null): CompetencyScore => ({ competency, requirement_ids: ids, score, evidence: [], notes: "" });

describe("overall score (src/domain/scoring.ts)", () => {
  it("weights must-haves above nice-to-haves", () => {
    const strongMust = scoreInterview(job, [c("A", [must.id], 5), c("B", [nice.id], 1)]);
    const strongNice = scoreInterview(job, [c("A", [must.id], 1), c("B", [nice.id], 5)]);
    expect(strongMust.value).toBeGreaterThan(strongNice.value);
  });

  it("advances high scores, rejects low ones", () => {
    expect(scoreInterview(job, [c("A", [must.id], 5)]).recommendation).toBe("advance");
    expect(scoreInterview(job, [c("A", [must.id], 1)]).recommendation).toBe("reject");
    expect(scoreInterview(job, [c("A", [must.id], 3)]).recommendation).toBe("hold");
  });

  it("holds instead of advancing when a must-have has no evidence", () => {
    const s = scoreInterview(job, [c("A", [nice.id], 5), c("B", [must.id], null)]);
    expect(s.recommendation).not.toBe("advance");
    expect(s.confidence).not.toBe("high");
  });
});
