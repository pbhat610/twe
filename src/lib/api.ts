/** Typed browser client for the backend API. The only place the UI calls fetch. */
import type { CandidateView, RecruiterView } from "@/application/views";
import type { Candidate, InterviewReport, Job, PlannedQuestion } from "@/domain/types";
import type { AssessmentDraft } from "@/application/assessmentService";
import type { CandidateDraft } from "@/application/agents/resumeParser";
import type { QuestionInput } from "@/application/planRules";
import type { Assessment, AssessmentConfig } from "@/domain/assessment";
import type { RecordingManifest } from "@/domain/recording";
import type { SessionSummary } from "@/ports";

export type { Assessment, AssessmentConfig, AssessmentDraft, CandidateDraft, CandidateView, PlannedQuestion, QuestionInput, RecordingManifest, RecruiterView, SessionSummary };

const put = (body: unknown): RequestInit => ({
  method: "PUT",
  headers: { "content-type": "application/json" },
  body: JSON.stringify(body),
});

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? `Request failed (${res.status})`);
  }
  return res.json() as Promise<T>;
}

const post = (body?: unknown): RequestInit => ({
  method: "POST",
  headers: { "content-type": "application/json" },
  body: body === undefined ? undefined : JSON.stringify(body),
});

export type SpeechSource = { kind: "audio"; data: ArrayBuffer } | { kind: "browser"; text: string };

/** Recruiter-side calls. */
export const recruiterApi = {
  // Interviews
  list: () => request<SessionSummary[]>("/api/interviews", { cache: "no-store" }),
  get: (id: string) => request<RecruiterView>(`/api/interviews/${id}`, { cache: "no-store" }),
  report: (id: string) => request<InterviewReport>(`/api/interviews/${id}/report`),
  recording: (id: string) => request<RecordingManifest>(`/api/interviews/${id}/recording`, { cache: "no-store" }),
  updatePlan: (id: string, plan: { candidate_summary?: string; questions: QuestionInput[] }) =>
    request<RecruiterView>(`/api/interviews/${id}/plan`, put(plan)),

  // Assessments
  assessments: () => request<Assessment[]>("/api/assessments", { cache: "no-store" }),
  draftAssessment: (input: { title: string; jd_text: string; max_questions: number; assessment_id?: string }) =>
    request<AssessmentDraft>("/api/assessments/draft", post(input)),
  saveAssessment: (input: {
    assessment_id?: string;
    title: string;
    jd_text: string;
    job: Job;
    questions: QuestionInput[];
    config: AssessmentConfig;
  }, isNew: boolean) =>
    request<Assessment>(isNew ? "/api/assessments" : `/api/assessments/${input.assessment_id}`, isNew ? post(input) : put(input)),
  invite: (assessmentId: string, candidateIds: string[]) => request<RecruiterView[]>(`/api/assessments/${assessmentId}/invite`, post({ candidateIds })),

  // Candidates
  candidates: () => request<Candidate[]>("/api/candidates", { cache: "no-store" }),
  saveCandidate: (c: Partial<Candidate> & { name: string }) => request<Candidate>("/api/candidates", post(c)),
  importCandidates: (json: unknown) => request<{ imported: number }>("/api/candidates/import", post(json)),
  loadExampleCandidates: () => request<{ imported: number }>("/api/candidates/examples", post({})),
  async parseResume(file: File): Promise<CandidateDraft> {
    const form = new FormData();
    form.append("file", file);
    return request<CandidateDraft>("/api/candidates/resume", { method: "POST", body: form });
  },
};

/** Candidate-side calls (by invite token). Only ever receives the redacted view. */
export const candidateApi = (token: string) => {
  const base = `/api/i/${encodeURIComponent(token)}`;
  return {
    view: () => request<CandidateView>(base),
    join: (recordingConsent: boolean) => request<CandidateView>(`${base}/join`, post({ recordingConsent })),
    answer: (turnId: string, answer: string, via: "voice" | "text" | "simulated") =>
      request<CandidateView>(`${base}/answers`, post({ turnId, answer, via })),
    finish: () => request<CandidateView>(`${base}/finish`, post()),
    simulatedAnswer: () => request<{ style: string; text: string }>(`${base}/simulated-answer`),

    async transcribe(audio: Blob): Promise<string> {
      const form = new FormData();
      form.append("audio", audio);
      const { text } = await request<{ text: string }>(`${base}/transcribe`, { method: "POST", body: form });
      return text;
    },

    /** Upload one ordered recording slice. Throws with the HTTP status on failure. */
    async uploadChunk(seq: number, chunk: Blob): Promise<void> {
      const res = await fetch(`${base}/recording?seq=${seq}`, {
        method: "POST",
        headers: { "content-type": chunk.type || "video/webm" },
        body: chunk,
      });
      if (!res.ok) throw Object.assign(new Error(`Upload failed (${res.status})`), { status: res.status });
    },

    async speech(utteranceId: string, fallbackText: string): Promise<SpeechSource> {
      const res = await fetch(`${base}/speech/${utteranceId}`);
      if (res.status === 204 || !res.ok) return { kind: "browser", text: fallbackText };
      return { kind: "audio", data: await res.arrayBuffer() };
    },
  };
};

export const inviteUrl = (token: string) =>
  `${typeof window !== "undefined" ? window.location.origin : ""}/i/${token}`;
