import type { z } from "zod";
import type { StructuredGenerationRequest, StructuredLLM } from "@/ports";
import analyses from "../../../fixtures/llm/analyses.json";
import jobDrafts from "../../../fixtures/llm/job_drafts.json";
import plans from "../../../fixtures/llm/plans.json";
import rolePlans from "../../../fixtures/llm/role_plans.json";

const norm = (s: string) => s.toLowerCase().replace(/\s+/g, " ").trim();

const ANALYSES = new Map(
  Object.entries(analyses as Record<string, unknown>)
    .filter(([k]) => k !== "_about")
    .map(([k, v]) => [norm(k), v as Record<string, unknown>]),
);
const DRAFTS = new Map(jobDrafts.examples.map((e) => [norm(e.brief), e.output]));

/** Example briefs the "New role" screen can offer (they have hand-written answers). */
export const EXAMPLE_BRIEFS = jobDrafts.examples.map((e) => ({ label: e.label, brief: e.brief }));

/**
 * Local "LLM" that replays outputs Claude wrote for the official demo data
 * (fixtures/llm/*.json): plans for the four intended job/candidate pairs, an
 * analysis for every scripted answer, and example job drafts. Costs nothing.
 * Anything without a fixture (a new role, a typed answer, the report) goes
 * to the fallback, the offline heuristic by default.
 */
export class FixtureLLM implements StructuredLLM {
  constructor(private readonly fallback: StructuredLLM) {}

  async generate<T extends z.ZodType>(req: StructuredGenerationRequest<T>): Promise<z.infer<T>> {
    const hit = this.lookup(req);
    console.info(`[llm] ${req.name} · ${hit ? "fixture (Claude-written, free)" : "no fixture → offline heuristic (free)"}`);
    if (hit) return req.schema.parse(hit) as z.infer<T>;
    return this.fallback.generate(req);
  }

  private lookup(req: StructuredGenerationRequest<z.ZodType>): unknown {
    const ctx = req.context ?? {};
    switch (req.name) {
      case "interview_plan": {
        // Only the first draft; a repair round means the fixture didn't fit.
        if (Number(ctx.repair ?? 0) !== 0) return undefined;
        const plan = (ctx.candidate_id
          ? (plans as Record<string, unknown>)[`${ctx.job_id}__${ctx.candidate_id}`]
          : (rolePlans as Record<string, unknown>)[String(ctx.job_id)]) as { candidate_summary: string; questions: unknown[] } | undefined;
        const count = Number(ctx.count ?? 0);
        if (!plan || (count && plan.questions.length < count)) return undefined;
        return count ? { ...plan, questions: plan.questions.slice(0, count) } : plan;
      }
      case "job_draft":
        return DRAFTS.get(norm(String(ctx.brief ?? "")));
      case "answer_analysis": {
        const found = ANALYSES.get(norm(String(ctx.answer ?? "")));
        if (!found) return undefined;
        const question = String(ctx.planned_question ?? "");
        const followUp = found.follow_up_question;
        return typeof followUp === "string" ? { ...found, follow_up_question: followUp.replace("{question}", question) } : found;
      }
      default:
        return undefined;
    }
  }
}
