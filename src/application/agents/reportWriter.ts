import type { CompetencyScore, InterviewReport, InterviewSession, ReportFlagType, ReportTurn } from "@/domain/types";
import { isGroundedQuote } from "@/domain/quoteGrounding";
import { scoreInterview } from "@/domain/scoring";
import { PROCTORING_EVENTS, summarizeProctoring, type ProctoringEvent } from "@/domain/proctoring";
import type { Clock, SchemaValidator, StructuredLLM } from "@/ports";
import { competenciesOf, reporterPrompt } from "../prompts";
import { clampScore } from "./answerAnalyzer";
import { ReportOutput } from "./schemas";

/**
 * Requirement 4: build the report from the saved answer analyses, in the
 * official interview_report schema.
 *
 * The LLM writes the judgement (scores, strengths, concerns, recommendation);
 * code assembles everything factual (turns, flags, ids) and enforces that a
 * competency score exists only when a verbatim quote backs it.
 */
export class ReportWriter {
  constructor(
    private readonly llm: StructuredLLM,
    private readonly validator: SchemaValidator,
    private readonly clock: Clock,
  ) {}

  async write(session: InterviewSession, proctoring: ProctoringEvent[] = []): Promise<InterviewReport> {
    const answered = session.turns.filter((t) => t.analysis && t.answer !== undefined && t.decision);
    const flags = this.flags(session, proctoring);

    const out = await this.llm.generate({
      name: "interview_report",
      schema: ReportOutput,
      system: reporterPrompt.system,
      user: reporterPrompt.user(session.job, session.plan, answered, flags.map((f) => `${f.type}: ${f.detail}`)),
      context: { job_id: session.job.job_id, candidate_id: session.candidate.candidate_id, interview_id: session.id },
    });

    const transcript = answered.map((t) => t.answer!).join("\n");
    const competencies = this.ground(session, out, transcript);

    const concerns = [...out.concerns];
    if (flags.some((f) => f.type === "injection_attempt")) {
      concerns.push("Candidate content contained instructions aimed at the AI interviewer; they were ignored and did not affect scoring.");
    }

    // Overall score, recommendation and confidence come from code (src/domain/scoring.ts),
    // not the LLM, so they're consistent and the weights are easy to change.
    const score = scoreInterview(session.job, competencies);

    const report: InterviewReport = {
      interview_id: session.id,
      job_id: session.job.job_id,
      candidate_id: session.candidate.candidate_id,
      completed_at: session.completed_at ?? this.clock.now().toISOString(),
      competencies,
      overall: {
        strengths: out.strengths,
        concerns: [...new Set(concerns)],
        recommendation: score.recommendation,
        confidence: score.confidence,
        score,
        summary: out.summary.trim(),
        suggested_next_round_focus: out.suggested_next_round_focus,
      },
      flags,
      turns: answered.map<ReportTurn>((t, i) => ({
        turn: i + 1,
        question_id: t.question_id,
        // The first line also carries the intro; the report keeps the question itself.
        agent_message: t.turn_id === "t1" ? t.question : t.spoken_text,
        candidate_answer: t.answer!,
        analysis: t.analysis!,
        decision: t.decision!,
        decision_reason: t.decision_reason ?? "",
      })),
    };

    const result = this.validator.validateReport(report);
    if (!result.valid) throw new Error(`Report failed schema validation: ${result.errors.join("; ")}`);
    return report;
  }

  /** Every planned competency, quotes verified against the transcript; no quote → no score. */
  private ground(session: InterviewSession, out: ReportOutput, transcript: string): CompetencyScore[] {
    const byName = new Map(out.competencies.map((c) => [c.competency.trim().toLowerCase(), c]));
    return competenciesOf(session.plan).map(({ competency, requirement_ids }) => {
      const c = byName.get(competency.toLowerCase());
      const evidence = [...new Set((c?.evidence ?? []).map((q) => q.trim()).filter((q) => isGroundedQuote(q, transcript)))];
      let score = clampScore(c?.score);
      let notes = c?.notes?.trim() || "Not covered in this interview.";
      if (score !== null && evidence.length === 0) {
        score = null;
        notes += " (No verbatim evidence in the transcript, so no score.)";
      }
      return { competency, requirement_ids, score, evidence, notes };
    });
  }

  /** Recruiter-facing flags in the schema's categories, built from what actually happened. */
  private flags(session: InterviewSession, proctoring: ProctoringEvent[]): InterviewReport["flags"] {
    const out: InterviewReport["flags"] = [];
    const add = (type: ReportFlagType, detail: string) => out.push({ type, detail });

    if (session.flags.includes("prompt_injection:candidate_profile")) {
      add("injection_attempt", "Candidate profile (bio) contained instructions to the AI interviewer; ignored.");
    }
    for (const t of session.turns) {
      for (const f of t.flags) {
        if (f.startsWith("prompt_injection")) add("injection_attempt", `${t.turn_id}: answer tried to instruct the interviewer; ignored and scored on content.`);
        else if (f.startsWith("moderation")) add("inappropriate", `${t.turn_id}: answer flagged by content moderation (${f.split(":")[2] ?? "unspecified"}).`);
        else if (f === "empty_answer") add("empty_answer", `${t.turn_id}: no answer given.`);
      }
      if (t.analysis?.relevance === "off_topic" && !t.flags.some((f) => f.startsWith("prompt_injection"))) {
        add("off_topic", `${t.turn_id}: ${t.analysis.note}`);
      }
    }
    if (session.turns.some((t) => t.decision === "end")) add("other", "Candidate asked to end the interview early.");
    if (session.flags.includes("time_limit_reached")) add("other", "The call reached its time limit before every question was asked.");

    const integrity = summarizeProctoring(proctoring);
    for (const [type, n] of Object.entries(integrity.counts)) {
      add("other", `Integrity: ${PROCTORING_EVENTS[type as keyof typeof PROCTORING_EVENTS].label} (${n}×). Review; not used in scoring.`);
    }
    return out;
  }
}
