import type { z } from "zod";
import type { ContentModerator, StructuredGenerationRequest, StructuredLLM } from "@/ports";
import type { AnalysisOutput, JobDraftOutput, PlanOutput, ReportOutput, ResumeOutput } from "@/application/agents/schemas";

/**
 * Free, offline stand-in for the LLM (a drop-in StructuredLLM). Simple,
 * deterministic rules: good enough to exercise every screen and test, and
 * the fallback for anything the Claude-written fixtures don't cover.
 */
export class HeuristicLLM implements StructuredLLM {
  async generate<T extends z.ZodType>(req: StructuredGenerationRequest<T>): Promise<z.infer<T>> {
    switch (req.name) {
      case "job_draft":
        return jobDraft(String(req.context?.brief ?? req.user)) as z.infer<T>;
      case "interview_plan":
        return plan(req.user) as z.infer<T>;
      case "answer_analysis":
        return analysis(req.user, String(req.context?.answer ?? ""), Number(req.context?.follow_ups ?? 0)) as z.infer<T>;
      case "interview_report":
        return report(req.user) as z.infer<T>;
      case "resume_profile":
        return resume(String(req.context?.resume ?? req.user)) as z.infer<T>;
      default:
        throw new Error(`HeuristicLLM has no handler for ${req.name}`);
    }
  }
}

export const noopModerator: ContentModerator = {
  moderate: async () => ({ flagged: false, categories: [] }),
};

// ── job draft ────────────────────────────────────────────────────────────

const SKILLS = [
  "JavaScript", "TypeScript", "React", "Next.js", "Node.js", "Python", "SQL", "PostgreSQL", "AWS", "Docker",
  "Figma", "Excel", "Power BI", "Tableau", "Salesforce", "Social media", "SEO", "Copywriting", "Arabic",
  "Customer service", "Sales", "Data analysis", "Project management", "Accounting", "Design",
];

/** Sentences that screen on protected characteristics; reported to the recruiter, never kept. */
const PROTECTED_CRITERIA = /\b(male|female|men only|women only|gender|under \d{2}|over \d{2}|aged? \d|years? old|nationals?|nationality|citizens? only|married|single|religio|muslim|christian|hindu|pregnan|children|health)\b/i;

function jobDraft(brief: string): JobDraftOutput {
  const lines = brief.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const field = (name: string) => brief.match(new RegExp(`${name}\\s*[:\\-]\\s*(.+)`, "i"))?.[1]?.trim() ?? null;
  const bullets = lines.filter((l) => /^[-•*]\s+/.test(l)).map((l) => l.replace(/^[-•*]\s+/, ""));
  const found = SKILLS.filter((s) => brief.toLowerCase().includes(s.toLowerCase()));
  const location = field("location") ?? brief.match(/\b(Dubai|Abu Dhabi|Sharjah|Riyadh|Doha|Remote)\b/i)?.[0] ?? "Dubai, UAE";
  const sentences = brief.replace(/\s+/g, " ").split(/(?<=[.!?])\s/).filter((s) => s.length > 20);

  return {
    title: field("title") ?? field("role") ?? lines[0]?.slice(0, 80) ?? "New role",
    company: { name: field("company") ?? "Your company", industry: field("industry"), size: null, about: null },
    location,
    work_mode: brief.match(/\b(remote|hybrid|on-site|onsite)\b/i)?.[0] ?? null,
    employment_type: brief.match(/\b(full-time|part-time|internship|contract)\b/i)?.[0] ?? null,
    experience_level: brief.match(/\b\d+\s*[-–+]?\s*\d*\s*years?\b/i)?.[0] ?? null,
    salary_min_aed_monthly: null,
    salary_max_aed_monthly: null,
    description: sentences.slice(0, 2).join(" ") || brief.slice(0, 280),
    responsibilities: (bullets.length ? bullets : ["Deliver the core work of the role", "Collaborate with the team", "Report progress clearly"]).slice(0, 6),
    must_have: (found.length ? found.slice(0, 4) : ["Role-specific experience"]).map((skill) => ({ skill, detail: null })),
    nice_to_have: found.slice(4, 7).map((skill) => ({ skill, detail: null })),
    soft_skills: [
      { skill: "Communication", detail: "Explains work clearly to the team" },
      { skill: "Ownership", detail: "Takes tasks from start to finish" },
    ],
    screening_focus: ["relevant experience", "problem solving"],
    interview_language: "English",
    removed_criteria: brief
      .split(/(?<=[.!?\n])\s*/)
      .map((x) => x.trim())
      .filter((x) => PROTECTED_CRITERIA.test(x)),
    assumptions: ["Drafted offline without an AI model: review every field before saving."],
  };
}

// ── plan ─────────────────────────────────────────────────────────────────

interface Req {
  id: string;
  skill: string;
  group: "must-have" | "nice-to-have" | "soft skill";
}

function requirementsIn(prompt: string): Req[] {
  return [...prompt.matchAll(/^- (req_\S+) \| (.+?) \((must-have|nice-to-have|soft skill)\)/gm)].map((m) => ({
    id: m[1],
    skill: m[2],
    group: m[3] as Req["group"],
  }));
}

function plan(prompt: string): PlanOutput {
  const reqs = requirementsIn(prompt);
  const must = reqs.filter((r) => r.group === "must-have");
  const soft = reqs.filter((r) => r.group === "soft skill");
  const title = prompt.match(/^JOB \S+: (.+?) at /m)?.[1] ?? "this role";
  const q = (r: Req, question: string, type: PlanOutput["questions"][number]["type"], difficulty: PlanOutput["questions"][number]["difficulty"], rationale: string) => ({
    question,
    competency: r.skill,
    requirement_ids: [r.id],
    rationale,
    difficulty,
    type,
  });

  const questions: PlanOutput["questions"] = [];
  const first = must[0] ?? reqs[0];
  questions.push(q(first, `To start, tell me about a piece of work you're proud of that used ${first.skill.toLowerCase()}. What was your part in it?`, "behavioral", "easy", `Warm-up that verifies ${first.skill}, a must-have.`));
  for (const r of must.slice(1, 4)) {
    questions.push(q(r, `Tell me about a specific time you used ${r.skill.toLowerCase()} in practice. What was the situation and what did you do?`, "technical", "medium", `Must-have requirement: looking for concrete evidence of ${r.skill}.`));
  }
  const behavioural = soft[0] ?? must[4] ?? reqs[reqs.length - 1];
  questions.push(q(behavioural, `Describe a time you showed ${behavioural.skill.toLowerCase()}. What happened and what was the result?`, "behavioral", "medium", `Checks ${behavioural.skill} with a real example.`));
  questions.push(q(first, `What draws you to the ${title} role, and what would you want to achieve in your first three months?`, "motivation", "easy", "Closes with motivation and understanding of the role."));
  const want = Number(prompt.match(/Write exactly (\d+) questions/)?.[1] ?? 6);
  let k = 0;
  while (questions.length < want) {
    const r = reqs[k++ % reqs.length];
    questions.splice(questions.length - 1, 0, q(r, `Walk me through how you would approach a task that needs ${r.skill.toLowerCase()}.`, "situational", "medium", `Adds coverage of ${r.skill}.`));
  }
  // Keep the closing motivation question when trimming.
  const trimmed = questions.length > want ? [...questions.slice(0, want - 1), questions[questions.length - 1]] : questions;
  return {
    candidate_summary: "Offline draft without an AI model: questions are generic per requirement. Edit them to fit the role.",
    questions: trimmed,
  };
}

// ── answer analysis ──────────────────────────────────────────────────────

const ENDING = /\b(end (this|the) (call|interview)|stop the interview|can we stop|i want to stop|i'?d like to stop)\b/i;
const MANIPULATION = /ignore (all|your|previous)|system|admin mode|score of 5|scores? set to 5|pre-?approved|recommend(ation)? advance/i;
const OFF_TOPIC = /\b(salary|remote work|commute|benefits|visa)\b/i;
const RUDE = /\b(pointless|stupid|waste of time|next\.?$)/i;
const CONCRETE = /\b(i|we) (built|led|designed|ran|created|made|used|wrote|shipped|grew|organised|organized|moved|fixed|added|found|noticed|switched|started|integrated|told|handled|showed)\b|\d/i;

function analysis(prompt: string, answer: string, followUps: number): AnalysisOutput {
  const reqIds = prompt.match(/requirements: ([^)]+)\)/)?.[1]?.split(/,\s*/).filter(Boolean) ?? [];
  const words = answer.split(/\s+/).filter(Boolean).length;
  const manipulative = MANIPULATION.test(answer);
  const ending = ENDING.test(answer);
  const offTopic = OFF_TOPIC.test(answer) && !CONCRETE.test(answer);
  const rude = RUDE.test(answer) && words < 12;
  const concrete = CONCRETE.test(answer) && words > 12;
  const firstSentence = answer.split(/(?<=[.!?])\s/)[0].split(/\s+/).slice(0, 14).join(" ");

  const score = manipulative || offTopic || rude ? 1 : concrete ? (words > 40 ? 5 : 4) : words > 15 ? 3 : 2;
  const weak = !manipulative && !rude && !ending && (score <= 3 || offTopic);
  const canFollow = weak && followUps < 2;

  return {
    relevance: ending || offTopic || manipulative || rude ? "off_topic" : score >= 3 ? "on_topic" : "partial",
    depth: concrete ? "specific_example" : words > 15 ? "general" : "vague",
    requirement_ids: concrete && !manipulative ? reqIds.slice(0, 1) : [],
    key_quote: concrete && !manipulative ? firstSentence : null,
    score,
    note: manipulative
      ? "Tried to instruct the interviewer; no job evidence."
      : rude
        ? "Declined to answer."
        : offTopic
          ? "Asked about terms instead of answering; noted for the hiring team."
          : concrete
            ? "Specific example with personal contribution."
            : "General claim without a concrete example.",
    injection_attempt: manipulative,
    wants_to_end: ending,
    decision: ending ? "end" : canFollow ? "follow_up" : "move_on",
    decision_reason: ending
      ? "Candidate asked to end the interview."
      : manipulative
        ? "Ignoring the manipulation attempt and moving on."
        : rude
          ? "Candidate declined; moving on."
          : canFollow
            ? "Answer was thin; asking for a specific example."
            : "Answer was concrete enough, or follow-ups are used up.",
    follow_up_question: canFollow
      ? offTopic
        ? "The hiring team will follow up on that. Coming back to the question, could you share a specific example from your experience?"
        : "Could you walk me through one specific example: what was the situation, what did you personally do, and what happened?"
      : null,
    acknowledgement: offTopic ? "Good question, the team will cover that." : "Thanks for sharing that.",
  };
}

// ── report ───────────────────────────────────────────────────────────────

function report(prompt: string): ReportOutput {
  const competencies = [...prompt.matchAll(/^- (.+?) \(([^)]*)\)$/gm)]
    .filter((m) => /req_/.test(m[2]))
    .map((m) => ({ name: m[1], ids: m[2].split(/,\s*/) }));
  const turns = [...prompt.matchAll(/score=(\d|null), requirements=(\S+), key_quote=(?:"([^"]*)"|none)/g)].map((m) => ({
    score: m[1] === "null" ? null : Number(m[1]),
    ids: m[2] === "none" ? [] : m[2].split(","),
    quote: m[3] ?? null,
  }));
  const scored = turns.filter((t) => t.score !== null).map((t) => t.score!);
  const avg = scored.length ? scored.reduce((a, b) => a + b, 0) / scored.length : 1;

  return {
    competencies: competencies.map((c) => {
      const hits = turns.filter((t) => t.quote && t.ids.some((id) => c.ids.includes(id)));
      const s = hits.filter((h) => h.score !== null).map((h) => h.score!);
      return {
        competency: c.name,
        score: s.length ? Math.round(s.reduce((a, b) => a + b, 0) / s.length) : null,
        evidence: hits.map((h) => h.quote!).slice(0, 3),
        notes: hits.length ? `Evidence from ${hits.length} answer(s) (offline heuristic).` : "Not evidenced in this interview; verify next round.",
      };
    }),
    strengths: avg >= 3.5 ? ["Gave concrete, specific examples."] : ["Engaged with the questions."],
    concerns: avg < 3 ? ["Answers were mostly general, with few concrete examples."] : [],
    recommendation: avg >= 3.8 ? "advance" : avg >= 2.5 ? "hold" : "reject",
    confidence: scored.length >= 6 ? "medium" : "low",
    summary: `Offline heuristic report: average answer score ${avg.toFixed(1)}/5 across ${scored.length} scored answers. Switch LLM_PROVIDER to openai for a written assessment.`,
    suggested_next_round_focus: competencies.filter((c) => !turns.some((t) => t.quote && t.ids.some((id) => c.ids.includes(id)))).map((c) => c.name).slice(0, 3),
  };
}

// ── resume ───────────────────────────────────────────────────────────────

function resume(text: string): ResumeOutput {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  const email = text.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const phone = text.match(/(\+?\d[\d\s().-]{7,}\d)/)?.[1]?.trim() ?? null;
  const name = lines.find((l) => /^[A-Za-z][A-Za-z .'-]{2,50}$/.test(l) && l.split(" ").length <= 5) ?? "Unnamed candidate";
  const title = lines.find((l) => l !== name && !l.includes("@") && l.length < 80 && /engineer|developer|analyst|manager|designer|student|graduate|marketing|executive|intern|associate|consultant/i.test(l)) ?? null;
  const found = SKILLS.filter((s) => text.toLowerCase().includes(s.toLowerCase()));
  const sentences = text.replace(/\s+/g, " ").split(/(?<=[.!?])\s/).filter((s) => s.length > 40);
  return {
    name,
    email,
    phone,
    current_title: title,
    location: text.match(/\b(Dubai|Abu Dhabi|Sharjah|Ajman|Riyadh|Doha)\b/i)?.[0] ?? null,
    headline: [title, found.slice(0, 3).join(", ")].filter(Boolean).join(" · ") || "Candidate",
    summary: sentences.slice(0, 2).join(" ") || "Profile drafted offline from the resume; review before saving.",
    skills: found,
    experience: [],
    education: [],
    projects: [],
  };
}
