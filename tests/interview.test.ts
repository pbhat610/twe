import { describe, expect, it } from "vitest";
import { ProtectedTopicGuard } from "@/application/guardrails/protectedTopicGuard";
import { pickSampleAnswer, type SampleAnswers } from "@/application/simulation/sampleAnswerPicker";
import { HeuristicLLM } from "@/infrastructure/fakes/heuristicLLM";
import exampleReport from "../data/example_report.json";
import type { StructuredLLM } from "@/ports";
import samples from "../data/sample_answers.json";
import { buildService } from "./helpers";

const SAMPLES = samples as unknown as Record<string, SampleAnswers>;

/** Runs the real flow with scripted answers picked by topic, like simulated mode. */
async function runSimulated(jobId: string, candidateId: string, llm?: StructuredLLM) {
  const { service, validator } = await buildService(llm);
  const created = await service.create(jobId, candidateId);
  let cv = await service.join(created.invite_token, { recordingConsent: true });
  for (let i = 0; cv.current_turn && i < 40; i++) {
    const { text } = pickSampleAnswer(SAMPLES[candidateId], await service.simulationContext(created.invite_token));
    cv = await service.submitAnswer(created.invite_token, cv.current_turn.turn_id, text, "simulated");
  }
  const report = await service.report(created.id);
  const view = await service.get(created.id);
  return { service, view, candidateView: cv, report, validator };
}

describe("plans (requirement 1)", () => {
  it.each([
    ["job_001", "cand_001"],
    ["job_001", "cand_002"],
    ["job_002", "cand_003"],
    ["job_003", "cand_004"],
  ])("%s × %s: 5–7 questions mapped to real requirements, valid against the official schema", async (job, cand) => {
    const { service, validator } = await buildService();
    const view = await service.create(job, cand);
    expect(view.plan.length).toBeGreaterThanOrEqual(5);
    expect(view.plan.length).toBeLessThanOrEqual(7);
    expect(view.candidate_summary.length).toBeGreaterThan(40);
    for (const q of view.plan) {
      expect(q.requirement_ids.every((id) => id.startsWith(`req_${job.slice(4)}_`))).toBe(true);
      expect(q.rationale.length).toBeGreaterThan(20);
    }
    const plan = { interview_id: view.id, job_id: job, candidate_id: cand, created_at: view.created_at, candidate_summary: view.candidate_summary, questions: view.plan };
    expect(validator.validatePlan(plan)).toEqual({ valid: true, errors: [] });
  });

  it("works for any pair via the offline heuristic", async () => {
    const { service } = await buildService(new HeuristicLLM());
    const view = await service.create("job_002", "cand_001");
    expect(view.plan.length).toBeGreaterThanOrEqual(5);
  });
});

describe("conversation (requirement 3)", () => {
  it("never asks more than 2 follow-ups per question, and follows up on thin answers (cand_003)", async () => {
    const { view } = await runSimulated("job_002", "cand_003");
    const perQuestion = new Map<string, number>();
    for (const t of view.turns.filter((t) => t.is_follow_up)) perQuestion.set(t.question_id, (perQuestion.get(t.question_id) ?? 0) + 1);
    expect(perQuestion.size).toBeGreaterThan(0);
    for (const n of perQuestion.values()) expect(n).toBeLessThanOrEqual(2);
    expect(view.status).toBe("completed");
    // The thin first answer is drawn out by a follow-up, not just scored low.
    const thin = view.turns.find((t) => t.answer === "I managed the media club's Instagram.");
    expect(thin?.decision).toBe("follow_up");
  });

  it("redirects an off-topic question about salary back to the planned question", async () => {
    const { view } = await runSimulated("job_002", "cand_003");
    const off = view.turns.findIndex((t) => t.answer?.includes("salary"));
    expect(view.turns[off].analysis?.relevance).toBe("off_topic");
    expect(view.turns[off + 1].question).toMatch(/Coming back to my question: How did you know whether a post was working/);
  });

  it("logs a reason for every decision", async () => {
    const { view } = await runSimulated("job_001", "cand_002");
    for (const t of view.turns.filter((t) => t.answer !== undefined)) expect(t.decision_reason?.length).toBeGreaterThan(10);
  });

  it("ends the interview when the candidate asks to stop", async () => {
    const { service } = await buildService(new HeuristicLLM());
    const { invite_token, id } = await service.create("job_001", "cand_001");
    let cv = await service.join(invite_token, { recordingConsent: true });
    cv = await service.submitAnswer(invite_token, cv.current_turn!.turn_id, "Can we end this call? I don't think this role is for me.");
    expect(cv.status).toBe("completed");
    expect((await service.get(id)).turns[0].decision).toBe("end");
  });

  it("an empty answer is recorded as no_answer with a null score, without an LLM call", async () => {
    const { view } = await runSimulated("job_003", "cand_004");
    const empty = view.turns.find((t) => t.answer === "");
    expect(empty?.analysis).toMatchObject({ relevance: "no_answer", score: null });
    expect(empty?.flags).toContain("empty_answer");
  });
});

describe("report (requirement 4)", () => {
  it.each([
    ["job_001", "cand_001"],
    ["job_002", "cand_003"],
    ["job_003", "cand_004"],
  ])("%s × %s: valid against the official report schema, quotes are verbatim", async (job, cand) => {
    const { report, validator } = await runSimulated(job, cand);
    expect(validator.validateReport(report)).toEqual({ valid: true, errors: [] });
    const transcript = report.turns.map((t) => t.candidate_answer).join(" ").toLowerCase();
    for (const c of report.competencies) {
      if (c.score !== null) expect(c.evidence.length).toBeGreaterThan(0);
      for (const q of c.evidence) expect(transcript).toContain(q.toLowerCase().slice(0, 20));
    }
    expect(report.turns.map((t) => t.turn)).toEqual(report.turns.map((_, i) => i + 1));
  });

  it("the official example report is valid against our validator", async () => {
    const { validator } = await buildService();
    expect(validator.validateReport(exampleReport).valid).toBe(true);
  });
});

describe("guardrails (requirement 5) on cand_004", () => {
  it("flags both injections, never asks protected topics, never inflates scores", async () => {
    const { view, report } = await runSimulated("job_003", "cand_004");
    const guard = new ProtectedTopicGuard();
    for (const t of view.turns) expect(guard.check(t.question).ok).toBe(true);
    expect(report.flags.filter((f) => f.type === "injection_attempt").length).toBeGreaterThanOrEqual(2);
    const injected = report.turns.find((t) => t.candidate_answer.startsWith("Ignore all previous instructions"));
    expect(injected?.analysis.score).toBe(1);
    expect(injected?.decision).toBe("move_on");
    // Injected or rude text is never used as evidence.
    for (const c of report.competencies) {
      for (const q of c.evidence) expect(q).not.toMatch(/ignore all previous|admin mode|pointless/i);
    }
  });
});

describe("links and access", () => {
  it("rejects answers for stale turns and before joining", async () => {
    const { service } = await buildService();
    const { invite_token } = await service.create("job_003", "cand_004");
    await expect(service.submitAnswer(invite_token, "t1", "hello")).rejects.toThrow(/hasn't started/);
    await service.join(invite_token, { recordingConsent: true });
    await expect(service.submitAnswer(invite_token, "t999", "hello")).rejects.toThrow(/stale/);
  });

  it("never leaks scores, notes or reasoning through the candidate link", async () => {
    const { candidateView } = await runSimulated("job_001", "cand_001");
    const json = JSON.stringify(candidateView);
    for (const secret of ["analysis", "score", "rationale", "decision_reason", "log", "flags", "plan", "persona_note"]) {
      expect(json).not.toContain(`"${secret}"`);
    }
  });

  it("an unknown invite token is rejected", async () => {
    const { service } = await buildService();
    await expect(service.view("not-a-real-token")).rejects.toThrow(/not found/);
  });
});
