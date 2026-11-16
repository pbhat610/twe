import type { Candidate } from "@/domain/types";
import type { StructuredLLM } from "@/ports";
import { resumePrompt } from "../prompts";
import { ResumeOutput } from "./schemas";

const MAX_RESUME_CHARS = 20_000;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE = /(\+?\d[\d\s().-]{7,}\d)/;

/** Candidate draft from resume text; the recruiter reviews it before saving. */
export type CandidateDraft = Omit<Candidate, "candidate_id">;

/**
 * Reads a resume and drafts a candidate profile: name, email, phone, current
 * title and a short summary, plus experience and skills. Contact details are
 * only kept if they literally appear in the resume (no invented emails), and
 * a regex fills them in if the model missed them.
 */
export class ResumeParser {
  constructor(private readonly llm: StructuredLLM) {}

  async parse(text: string): Promise<CandidateDraft> {
    const clipped = text.slice(0, MAX_RESUME_CHARS);
    const out = await this.llm.generate({
      name: "resume_profile",
      schema: ResumeOutput,
      system: resumePrompt.system,
      user: resumePrompt.user(clipped),
      context: { resume: clipped },
    });

    const inText = (v: string | null) => (v && clipped.replace(/\s/g, "").includes(v.replace(/\s/g, "")) ? v.trim() : null);
    const email = inText(out.email) ?? clipped.match(EMAIL)?.[0] ?? undefined;
    const phone = inText(out.phone) ?? clipped.match(PHONE)?.[1]?.trim() ?? undefined;

    return {
      name: out.name.trim() || "Unnamed candidate",
      headline: out.headline.trim(),
      location: out.location?.trim() || "",
      education: out.education.map((e) => ({ institution: e.institution, degree: e.degree, ...(e.graduation_year ? { graduation_year: e.graduation_year } : {}) })),
      experience: out.experience.map((e) => ({ title: e.title, company: e.company, start: e.start ?? undefined, end: e.end ?? undefined, summary: e.summary })),
      projects: out.projects,
      skills: out.skills,
      bio: out.summary.trim(),
      email,
      phone,
      current_title: out.current_title?.trim() || undefined,
      summary: out.summary.trim(),
      source: "resume",
    };
  }
}
