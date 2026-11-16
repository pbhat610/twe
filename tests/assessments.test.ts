import { describe, expect, it } from "vitest";
import { jdTextOf, SEED_JOBS } from "@/infrastructure/data/demoData";
import { HeuristicLLM } from "@/infrastructure/fakes/heuristicLLM";
import candidatesJson from "../data/candidates.json";
import { buildService } from "./helpers";

const EXAMPLE_JD =
  "Customer Success Associate at +twe, Dubai, hybrid, full-time. You'd onboard university career centres and employers onto the platform, run training calls, answer support tickets and turn feedback into product requests for the product team. Need 1-2 years in a customer-facing role, great written English, comfortable with HubSpot or Intercom. Arabic is a plus. Salary around AED 9,000-11,000 a month. Ideally under 28 and a UAE national.";

describe("video assessments (title + JD → questions)", () => {
  it.each([5, 6, 7])("drafts exactly %i questions mapped to requirements extracted from the JD", async (n) => {
    const { assessments } = await buildService();
    const draft = await assessments.draft({ title: "Customer Success Associate", jd_text: EXAMPLE_JD, max_questions: n });
    expect(draft.questions).toHaveLength(n);
    const ids = new Set([...draft.job.requirements.must_have, ...draft.job.requirements.nice_to_have, ...draft.job.requirements.soft_skills].map((r) => r.id));
    for (const q of draft.questions) expect(q.requirement_ids.every((id) => ids.has(id))).toBe(true);
  });

  it("removes discriminatory criteria from a pasted JD and says so", async () => {
    const { assessments } = await buildService();
    const draft = await assessments.draft({ title: "CSA", jd_text: EXAMPLE_JD });
    expect(draft.removed_criteria.join(" ")).toMatch(/under 28/);
    expect(draft.removed_criteria.join(" ")).toMatch(/national/i);
  });

  it("saves the recruiter's edits, and rejects a question about a protected topic", async () => {
    const { assessments } = await buildService(new HeuristicLLM());
    const draft = await assessments.draft({ title: "Data Analyst Intern", jd_text: jdTextOf(SEED_JOBS[2]), max_questions: 5 });
    const edited = [...draft.questions.slice(0, 4), { ...draft.questions[4], question: "What would you do in your first week with our data team?" }];
    const saved = await assessments.save({ assessment_id: draft.assessment_id, title: "Data Analyst Intern", jd_text: "jd", job: draft.job, questions: edited, config: { max_questions: 5, duration_minutes: 20 } });
    expect(saved.questions[4].question).toMatch(/first week/);
    expect(saved.config).toEqual({ max_questions: 5, duration_minutes: 20 });

    const bad = [{ ...edited[0], question: "Are you married, and do you plan to have children soon?" }, ...edited.slice(1)];
    await expect(assessments.save({ title: "x", jd_text: "jd", job: draft.job, questions: bad, config: {} })).rejects.toThrow(/protected topic/);
  });

  it("keeps demo assessments read-only", async () => {
    const { assessments } = await buildService();
    const demo = await assessments.get("job_001");
    await expect(assessments.save({ ...demo, config: demo.config })).rejects.toThrow(/read-only/);
  });
});

describe("candidates", () => {
  it("imports the official candidates.json", async () => {
    const { candidates } = await buildService();
    expect(await candidates.importJson(candidatesJson)).toEqual({ imported: 4 });
    expect((await candidates.get("cand_003")).source).toBe("import");
  });

  it("rejects JSON that isn't a list of candidates", async () => {
    const { candidates } = await buildService();
    await expect(candidates.importJson({ hello: "world" })).rejects.toThrow(/array of candidates/);
  });

  it("reads a resume: name, email, phone, title and a summary, without inventing contact details", async () => {
    const { candidates } = await buildService();
    const resume = `Aisha Rahman
Junior Data Analyst
aisha.rahman@example.com | +971 50 123 4567 | Dubai
I build dashboards in Power BI and write SQL every day for an e-commerce operations team. I reduced report preparation time by 40% by automating weekly exports with Python.`;
    const draft = await candidates.parseResume(new Blob([resume], { type: "text/plain" }), "aisha.txt");
    expect(draft).toMatchObject({ name: "Aisha Rahman", email: "aisha.rahman@example.com", phone: "+971 50 123 4567", current_title: "Junior Data Analyst" });
    expect(draft.summary?.length).toBeGreaterThan(20);
    expect(draft.skills).toEqual(expect.arrayContaining(["SQL", "Power BI", "Python"]));
    const saved = await candidates.save({ ...draft, name: draft.name });
    expect(saved.candidate_id).toMatch(/^cand_/);
  });

  it("rejects unsupported files", async () => {
    const { candidates } = await buildService();
    await expect(candidates.parseResume(new Blob(["x"], { type: "image/png" }), "photo.png")).rejects.toThrow(/PDF, Word/);
  });
});

describe("call time limit", () => {
  it("counts down from join and wraps up after the answer given once time is up", async () => {
    let now = Date.parse("2026-11-16T10:00:00Z");
    const clock = { now: () => new Date(now) };
    const { service } = await buildService(undefined, clock);
    const created = await service.create("job_003", "cand_004");
    let cv = await service.join(created.invite_token, { recordingConsent: true });
    expect(cv.duration_seconds).toBe(15 * 60);
    expect(Date.parse(cv.deadline_at!) - now).toBe(15 * 60 * 1000);

    now += 16 * 60 * 1000; // time runs out mid-interview
    cv = await service.submitAnswer(created.invite_token, cv.current_turn!.turn_id, "At the internship I wrote weekly order reports.");
    expect(cv.status).toBe("completed");
    expect(cv.closing_text).toMatch(/end of our time/);
    const report = await service.report(created.id);
    expect(report.flags.some((f) => /time limit/.test(f.detail))).toBe(true);
  });
});
