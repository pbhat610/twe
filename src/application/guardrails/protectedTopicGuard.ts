/**
 * Requirement 5: the interviewer must never ask about age, religion, nationality,
 * marital status, health or family plans. Every question (planned or follow-up)
 * passes through this guard *before* it can be spoken.
 *
 * Deterministic and dependency-free so it is fast, testable and can't be
 * talked out of its job by a prompt.
 */
export type ProtectedTopic =
  | "age"
  | "religion"
  | "nationality"
  | "marital_status"
  | "health"
  | "family_plans";

const RULES: Record<ProtectedTopic, RegExp[]> = {
  age: [/\bhow old\b/i, /\byour age\b/i, /\bage\b(?! group)/i, /\bdate of birth\b/i, /\bwhen were you born\b/i, /\byear of birth\b/i],
  religion: [/\breligio(n|us)\b/i, /\bfaith\b/i, /\bpray(er|ing)?\b/i, /\bchurch\b/i, /\bmosque\b/i, /\btemple\b/i, /\bramadan\b/i, /\bfasting\b/i],
  nationality: [/\bnationality\b/i, /\bcitizen(ship)?\b/i, /\bpassport\b/i, /\bwhere are you (originally )?from\b/i, /\bethnic(ity)?\b/i, /\brace\b(?! conditions?)/i, /\bnative country\b/i, /\bhome country\b/i],
  marital_status: [/\bmarried\b/i, /\bmarital\b/i, /\bspouse\b/i, /\bhusband\b/i, /\bwife\b/i, /\bdivorce/i, /\bboyfriend\b/i, /\bgirlfriend\b/i, /\bengaged to\b/i],
  health: [/\b(your|any) health\b/i, /\bhealth (issues?|conditions?|problems?)\b/i, /\bmedical\b/i, /\bdisabilit(y|ies)\b/i, /\billness\b/i, /\bsick\b/i, /\bmedication\b/i, /\bdiagnos/i, /\bmental health\b/i],
  family_plans: [/\bpregnan/i, /\bchildren\b/i, /\bkids\b/i, /\bstart(ing)? a family\b/i, /\bfamily plans?\b/i, /\bmaternity\b/i, /\bpaternity\b/i, /\bchildcare\b/i],
};

export interface TopicCheck {
  ok: boolean;
  topics: ProtectedTopic[];
}

export class ProtectedTopicGuard {
  check(text: string): TopicCheck {
    const topics = (Object.keys(RULES) as ProtectedTopic[]).filter((t) =>
      RULES[t].some((re) => re.test(text)),
    );
    return { ok: topics.length === 0, topics };
  }

  /** Text injected into prompts so the model avoids the topics up front. */
  static readonly promptRule =
    "Never ask about, hint at, or reference the candidate's age, date of birth, religion, nationality, ethnicity, citizenship, marital status, partner, health, disability, pregnancy, children or family plans. Avoid those words entirely.";
}
