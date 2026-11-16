/**
 * Ports: the interfaces the application layer depends on (Dependency Inversion).
 * Infrastructure adapters implement these; use cases never import a vendor SDK.
 * Each port is deliberately small (Interface Segregation).
 */
import type { z } from "zod";
import type { Candidate, InterviewSession } from "@/domain/types";
import type { Assessment } from "@/domain/assessment";
import type { ProctoringEvent } from "@/domain/proctoring";
import type { RecordingChunk, RecordingContentType } from "@/domain/recording";

export interface StructuredGenerationRequest<T extends z.ZodType> {
  /** Stable name for the output schema (used by the provider for strict JSON). */
  name: string;
  schema: T;
  /** Trusted instructions. Never contains candidate-provided text. */
  system: string;
  /** Task input. Untrusted text must already be fenced by the caller. */
  user: string;
  /**
   * Structured facts about the request (ids, the raw answer). Ignored by real
   * models; lets the local fixture/heuristic providers answer without parsing prompts.
   */
  context?: Record<string, string | number | undefined>;
}

/**
 * `name` identifies the task ("job_draft", "interview_plan", "answer_analysis",
 * "interview_report"); adapters may use it to pick a model or a fixture.
 */
export interface StructuredLLM {
  generate<T extends z.ZodType>(req: StructuredGenerationRequest<T>): Promise<z.infer<T>>;
}

export interface SpeechSynthesizer {
  synthesize(text: string): Promise<{ audio: ArrayBuffer; contentType: string }>;
}

export interface SpeechTranscriber {
  transcribe(audio: Blob, opts?: { keywords?: string[] }): Promise<string>;
}

export interface ModerationResult {
  flagged: boolean;
  categories: string[];
}

export interface ContentModerator {
  moderate(text: string): Promise<ModerationResult>;
}

export interface SessionSummary {
  id: string;
  assessment_id?: string;
  invite_token: string;
  status: InterviewSession["status"];
  job_title: string;
  candidate_name: string;
  recommendation?: string;
  created_at: string;
}

export interface SessionRepository {
  /** Inserts or updates; throws ConflictError if `version` is stale (concurrent write). */
  save(session: InterviewSession): Promise<void>;
  get(id: string): Promise<InterviewSession | undefined>;
  getByInviteToken(token: string): Promise<InterviewSession | undefined>;
  list(limit?: number): Promise<SessionSummary[]>;
}

/**
 * Append-only integrity log, separate from the session row so high-frequency
 * events never conflict with the answer flow's optimistic locking.
 */
export interface ProctoringRepository {
  append(interviewId: string, events: ProctoringEvent[]): Promise<void>;
  list(interviewId: string): Promise<ProctoringEvent[]>;
}

/**
 * Interview video store: ordered chunks per interview, private by default.
 * `list` returns URLs the recruiter's browser can fetch directly
 * (short-lived signed URLs, or our own authenticated route).
 */
export interface RecordingStore {
  putChunk(interviewId: string, seq: number, data: ArrayBuffer, contentType: RecordingContentType): Promise<void>;
  list(interviewId: string): Promise<{ content_type: RecordingContentType | null; chunks: RecordingChunk[] }>;
  /** Raw bytes of one chunk (used when the store has no public/signed URL). */
  read(interviewId: string, seq: number): Promise<{ data: ArrayBuffer; contentType: string } | undefined>;
}

/** Candidates: imported from JSON, created from a resume, or the demo set. */
export interface CandidateRepository {
  list(): Promise<Candidate[]>;
  get(candidateId: string): Promise<Candidate | undefined>;
  /** Insert or replace by candidate_id. */
  save(candidates: Candidate[]): Promise<void>;
}

/** Video assessments (JD + approved questions + settings). */
export interface AssessmentRepository {
  list(): Promise<Assessment[]>;
  get(assessmentId: string): Promise<Assessment | undefined>;
  save(assessment: Assessment): Promise<void>;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export interface SchemaValidator {
  validatePlan(plan: unknown): ValidationResult;
  validateReport(report: unknown): ValidationResult;
}

export type AvatarSession = { provider: "simli"; token: string } | { provider: "local" };

/** Issues short-lived sessions for a hosted avatar so its API key never reaches the browser. */
export interface AvatarSessionIssuer {
  issue(): Promise<AvatarSession>;
}

/** Plain text from an uploaded document (resume): PDF, DOCX or plain text. */
export interface DocumentTextExtractor {
  extract(file: Blob, fileName: string): Promise<string>;
}

export interface Clock {
  now(): Date;
}

export interface IdGenerator {
  next(prefix: string): string;
  /** Unguessable, URL-safe secret (for candidate links). */
  secret(): string;
}
