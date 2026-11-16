import { describe, expect, it } from "vitest";
import { FollowUpPolicy } from "@/domain/followUpPolicy";
import { isGroundedQuote } from "@/domain/quoteGrounding";

describe("FollowUpPolicy", () => {
  const policy = new FollowUpPolicy(2);

  it("allows follow-ups below the cap", () => {
    expect(policy.decide("follow_up", 0, true).decision).toBe("follow_up");
    expect(policy.decide("follow_up", 1, true).decision).toBe("follow_up");
  });

  it("forces move_on at the cap and explains why", () => {
    const v = policy.decide("follow_up", 2, true);
    expect(v.decision).toBe("move_on");
    expect(v.override_reason).toMatch(/cap/);
  });

  it("moves on when no approved follow-up text exists", () => {
    expect(policy.decide("follow_up", 0, false).decision).toBe("move_on");
  });
});

describe("quote grounding", () => {
  it("accepts verbatim quotes with punctuation/case differences", () => {
    expect(isGroundedQuote("page load dropped about 40 percent", "…Page load dropped about 40 percent, and…")).toBe(true);
  });
  it("rejects fabricated quotes", () => {
    expect(isGroundedQuote("I led a team of 20", "I worked alone on the project")).toBe(false);
  });
});
