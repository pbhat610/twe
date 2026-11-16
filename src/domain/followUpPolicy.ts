import type { Decision } from "./types";

export interface PolicyVerdict {
  decision: Decision;
  /** Set when the policy overrode the analyser's suggestion. */
  override_reason?: string;
}

/**
 * Hard business rule from the brief: at most N follow-ups per planned question.
 * Kept in code (not in the prompt) so the LLM can never exceed it.
 * "end" (the candidate asked to stop) always passes through.
 */
export class FollowUpPolicy {
  constructor(private readonly maxFollowUps = 2) {}

  decide(suggested: Decision, followUpsSoFar: number, hasFollowUpQuestion: boolean): PolicyVerdict {
    if (suggested !== "follow_up") return { decision: suggested };

    if (followUpsSoFar >= this.maxFollowUps) {
      return {
        decision: "move_on",
        override_reason: `Follow-up cap reached (${this.maxFollowUps} per question).`,
      };
    }
    if (!hasFollowUpQuestion) {
      return {
        decision: "move_on",
        override_reason: "Analyser asked to follow up but produced no approved follow-up question.",
      };
    }
    return { decision: "follow_up" };
  }
}
