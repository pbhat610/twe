import { z } from "zod";
import type { Candidate } from "@/domain/types";
import type { CandidateRepository, Clock, DocumentTextExtractor, IdGenerator } from "@/ports";
import type { CandidateDraft, ResumeParser } from "./agents/resumeParser";
import { BadRequestError, NotFoundError } from "./errors";

const MAX_IMPORT = 500;

/** Shape accepted on import: the official candidates.json, with extra fields tolerated. */
const ImportedCandidate = z
  .object({
    candidate_id: z.string().max(80).optional(),
    name: z.string().min(1).max(160),
    headline: z.string().max(300).optional(),
    location: z.string().max(160).optional(),
    education: z.array(z.any()).optional(),
    experience: z.array(z.any()).optional(),
    projects: z.array(z.any()).optional(),
    extracurriculars: z.array(z.any()).optional(),
    skills: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    bio: z.string().max(4000).optional(),
    persona_note: z.string().optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(60).optional(),
    current_title: z.string().max(160).optional(),
    summary: z.string().max(2000).optional(),
  })
  .passthrough();

/** Candidates: import a JSON file, or upload a resume the AI reads; the recruiter reviews and saves. */
export class CandidateService {
  constructor(
    private readonly d: {
      candidates: CandidateRepository;
      resumeParser: ResumeParser;
      extractor: DocumentTextExtractor;
      clock: Clock;
      ids: IdGenerator;
    },
  ) {}

  async list(): Promise<Candidate[]> {
    return (await this.d.candidates.list()).sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? "") || a.name.localeCompare(b.name));
  }

  async get(id: string): Promise<Candidate> {
    const c = await this.d.candidates.get(id);
    if (!c) throw new NotFoundError("Candidate");
    return c;
  }

  /** Import an array like data/candidates.json. Existing ids are updated, new ones added. */
  async importJson(raw: unknown, source: "import" | "seed" = "import"): Promise<{ imported: number }> {
    const list = Array.isArray(raw) ? raw : (raw as { candidates?: unknown })?.candidates;
    if (!Array.isArray(list) || list.length === 0) throw new BadRequestError("Expected a JSON array of candidates (like candidates.json).");
    if (list.length > MAX_IMPORT) throw new BadRequestError(`Import at most ${MAX_IMPORT} candidates at a time.`);

    const now = this.d.clock.now().toISOString();
    const parsed = list.map((item, i) => {
      const r = ImportedCandidate.safeParse(item);
      if (!r.success) throw new BadRequestError(`Candidate ${i + 1}: ${r.error.issues[0]?.path.join(".")} ${r.error.issues[0]?.message}`);
      return this.complete({ ...(r.data as Partial<Candidate>), source }, now);
    });
    await this.d.candidates.save(parsed);
    return { imported: parsed.length };
  }

  /** Read a resume file and draft a profile (name, email, phone, title, summary…). Not saved. */
  async parseResume(file: Blob, fileName: string): Promise<CandidateDraft> {
    const text = await this.d.extractor.extract(file, fileName);
    return this.d.resumeParser.parse(text);
  }

  /** Save a new or edited candidate (e.g. after reviewing a parsed resume). */
  async save(input: Partial<Candidate> & { name: string }): Promise<Candidate> {
    if (!input.name?.trim()) throw new BadRequestError("Add the candidate's name.");
    const existing = input.candidate_id ? await this.d.candidates.get(input.candidate_id) : undefined;
    const candidate = this.complete({ ...existing, ...input }, existing?.created_at ?? this.d.clock.now().toISOString());
    await this.d.candidates.save([candidate]);
    return candidate;
  }

  /** Fill required fields so every candidate has the same shape as the demo data. */
  private complete(c: Partial<Candidate>, createdAt: string): Candidate {
    const summary = c.summary?.trim() || c.bio?.trim() || "";
    return {
      ...c,
      candidate_id: c.candidate_id?.trim() || this.d.ids.next("cand"),
      name: (c.name ?? "").trim(),
      headline: c.headline?.trim() || c.current_title?.trim() || "",
      location: c.location ?? "",
      education: c.education ?? [],
      experience: c.experience ?? [],
      projects: c.projects ?? [],
      skills: c.skills ?? [],
      bio: c.bio ?? summary,
      summary: summary || undefined,
      created_at: c.created_at ?? createdAt,
    };
  }
}
