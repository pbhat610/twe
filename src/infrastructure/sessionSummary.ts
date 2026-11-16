import type { InterviewSession } from "@/domain/types";
import type { SessionSummary } from "@/ports";

export const toSummary = (s: InterviewSession): SessionSummary => ({
  id: s.id,
  assessment_id: s.assessment_id,
  invite_token: s.invite_token,
  status: s.status,
  job_title: s.job.title,
  candidate_name: s.candidate.name,
  recommendation: s.report?.overall.recommendation,
  created_at: s.created_at,
});
