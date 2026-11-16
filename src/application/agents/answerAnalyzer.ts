import { flatRequirements, type AnswerAnalysis, type Decision, type Job, type PlannedQuestion, type Turn } from "@/domain/types";
import { isGroundedQuote } from "@/domain/quoteGrounding";
import type { StructuredLLM } from "@/ports";
import { analyzerPrompt } from "../prompts";
import { AnalysisOutput } from "./schemas";

export interface AnalyzerResult {
  analysis: AnswerAnalysis;
  /** The analyser's suggestion; FollowUpPolicy has the final say. */
  decision: Decision;
  decision_reason: string;
  injection_attempt: boolean;
  follow_up_question: string | null;
  acknowledgement: string;
  /** True when the model's key quote wasn't in the answer and was removed. */
  dropped_quote: boolean;
}

/**
 * Requirement 3: analyse each answer (relevance, depth, requirement evidence
 * with a key quote, 1–5 score + note) and suggest follow-up / move on / end.
 */
export class AnswerAnalyzer {
  constructor(private readonly llm: StructuredLLM) {}

  async analyze(args: {
    job: Job;
    planned: PlannedQuestion;
    thread: Turn[];
    answer: string;
    followUpsSoFar: number;
    candidateSummary?: string;
  }): Promise<AnalyzerResult> {
    const out = await this.llm.generate({
      name: "answer_analysis",
      schema: AnalysisOutput,
      system: analyzerPrompt.system,
      user: analyzerPrompt.user(args),
      context: {
        job_id: args.job.job_id,
        question_id: args.planned.question_id,
        planned_question: args.planned.question,
        answer: args.answer,
        follow_ups: args.followUpsSoFar,
        is_follow_up: args.thread[args.thread.length - 1]?.is_follow_up ? 1 : 0,
      },
    });

    const valid = new Set(flatRequirements(args.job).map((r) => r.id));
    const grounded = out.key_quote && isGroundedQuote(out.key_quote, args.answer) ? out.key_quote.trim() : null;

    return {
      analysis: {
        relevance: out.relevance,
        depth: out.depth,
        requirement_ids: [...new Set(out.requirement_ids.filter((id) => valid.has(id)))],
        key_quote: grounded,
        score: clampScore(out.score),
        note: out.note.trim(),
      },
      decision: out.wants_to_end ? "end" : out.decision,
      decision_reason: out.decision_reason.trim(),
      injection_attempt: out.injection_attempt,
      follow_up_question: out.follow_up_question?.trim() || null,
      acknowledgement: out.acknowledgement.trim(),
      dropped_quote: Boolean(out.key_quote) && !grounded,
    };
  }
}

/** 1–5, or null when the model had nothing to score. */
export const clampScore = (n: number | null | undefined): number | null =>
  n === null || n === undefined || !Number.isFinite(n) ? null : Math.min(5, Math.max(1, Math.round(n)));
