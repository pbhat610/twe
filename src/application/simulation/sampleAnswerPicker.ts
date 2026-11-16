/**
 * Simulated candidate mode (bonus). data/sample_answers.json maps answers by
 * topic, because the agent's questions differ per run. We pick:
 *   1. on a follow-up, the "<topic>_probed" answer for the topic just asked, else "vague_follow_up";
 *   2. on a main question, an unused edge case (injection, off-topic, rude, empty) on questions 3, 5 and 7,
 *      so every run exercises the guardrails;
 *   3. otherwise the unused topic whose keywords best match the question;
 *   4. else "fallback".
 * Pure keyword matching: free, deterministic and easy to explain.
 */
export type SampleAnswers = Record<string, string>;

const TOPIC_KEYWORDS: Record<string, string[]> = {
  intro: ["yourself", "introduce", "background", "walk me through your", "tell me about you"],
  react: ["react", "component", "frontend", "front-end", "state", "re-render", "ui"],
  backend_api: ["api", "endpoint", "backend", "back-end", "rest", "express", "node", "server", "firebase"],
  sql: ["sql", "database", "schema", "query", "queries", "postgres", "table", "index", "join", "window function"],
  payments: ["payment", "stripe", "fintech", "checkout", "webhook"],
  ownership: ["ownership", "own", "production", "outage", "went down", "deadline", "launch", "idea to", "responsib"],
  testing: ["test", "jest", "playwright", "coverage"],
  communication: ["communicat", "explain", "non-engineer", "non-technical", "stakeholder", "trade-off", "tradeoff"],
  git: ["git", "pull request", "branch", "code review", "review others", "collaborat"],
  weakness: ["weak", "improve", "learning", "growth", "gap", "least confident"],
  social_media: ["social", "instagram", "tiktok", "content", "followers", "reels", "media club"],
  analytics: ["analytic", "metric", "reach", "engagement", "ctr", "conversion", "insight", "measure", "numbers", "post was working"],
  campaign_idea: ["campaign", "gen z", "idea", "creative", "creativity", "pitch", "concept"],
  organisation: ["organis", "organiz", "deadline", "juggl", "priorit", "multiple", "calendar"],
  python: ["python", "pandas", "r ", "clean", "notebook", "missing values"],
  statistics: ["statistic", "median", "average", "mean", "distribution", "skew", "percentile", "significan"],
  storytelling: ["story", "present", "recommendation", "dashboard", "power bi", "convince", "finding"],
  ab_testing: ["a/b", "ab test", "experiment", "split test", "control group"],
};

const EDGE_CASES = ["injection_answer", "off_topic", "rude", "empty"] as const;
const EDGE_QUESTION_NUMBERS = new Set([3, 5, 7]);

export interface PickContext {
  question: string;
  competency: string;
  isFollowUp: boolean;
  questionNumber: number;
  /** Answers already given in this interview (to avoid repeats). */
  used: string[];
  previousAnswer?: string;
}

export function pickSampleAnswer(answers: SampleAnswers, ctx: PickContext): { topic: string; text: string } {
  const used = new Set(ctx.used);
  const unused = (key: string) => key in answers && !used.has(answers[key]);
  const pick = (topic: string) => ({ topic, text: answers[topic] });

  if (ctx.isFollowUp) {
    const lastTopic = Object.keys(answers).find((k) => answers[k] === ctx.previousAnswer);
    if (lastTopic && unused(`${lastTopic}_probed`)) return pick(`${lastTopic}_probed`);
    if (unused("vague_follow_up")) return pick("vague_follow_up");
  } else if (EDGE_QUESTION_NUMBERS.has(ctx.questionNumber)) {
    const edge = EDGE_CASES.find(unused);
    if (edge) return pick(edge);
  }

  const haystack = `${ctx.question} ${ctx.competency}`.toLowerCase();
  let best: { topic: string; score: number } | null = null;
  for (const [topic, words] of Object.entries(TOPIC_KEYWORDS)) {
    if (!unused(topic)) continue;
    const score = words.reduce((n, w) => n + (haystack.includes(w) ? 1 : 0), 0);
    if (score > 0 && (!best || score > best.score)) best = { topic, score };
  }
  if (best) return pick(best.topic);
  return pick("fallback" in answers ? "fallback" : Object.keys(answers)[0]);
}
