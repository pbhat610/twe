/** Request-body schemas shared by the recruiter API routes. */
import { z } from "zod";
import { DIFFICULTIES, QUESTION_TYPES } from "@/domain/types";

const Requirement = z.object({
  id: z.string().max(60).optional(),
  skill: z.string().max(120),
  detail: z.string().max(400).optional(),
});

export const JobBody = z.object({
  title: z.string().max(160),
  company: z.object({
    name: z.string().max(160),
    industry: z.string().max(160).optional(),
    size: z.string().max(80).optional(),
    about: z.string().max(1000).optional(),
  }),
  location: z.string().max(160),
  work_mode: z.string().max(80).optional(),
  employment_type: z.string().max(120).optional(),
  experience_level: z.string().max(120).optional(),
  salary_range_aed_monthly: z.object({ min: z.number().nonnegative(), max: z.number().nonnegative() }).nullable().optional(),
  description: z.string().max(3000),
  responsibilities: z.array(z.string().max(400)).max(15),
  requirements: z.object({
    must_have: z.array(Requirement).max(12),
    nice_to_have: z.array(Requirement).max(12),
    soft_skills: z.array(Requirement).max(8),
  }),
  screening_focus: z.array(z.string().max(80)).max(8).optional(),
  interview_language: z.string().max(40).optional(),
});

export const QuestionBody = z.object({
  question_id: z.string().max(20).optional(),
  question: z.string().max(600),
  competency: z.string().max(120),
  requirement_ids: z.array(z.string().max(60)).max(6),
  rationale: z.string().max(1000),
  difficulty: z.enum(DIFFICULTIES),
  type: z.enum(QUESTION_TYPES),
});

export const PlanBody = z.object({
  candidate_summary: z.string().max(2000).optional(),
  questions: z.array(QuestionBody).max(12),
});

export const AssessmentBody = z.object({
  assessment_id: z.string().max(80).optional(),
  title: z.string().max(160),
  jd_text: z.string().max(20_000),
  job: JobBody,
  questions: z.array(QuestionBody).max(12),
  config: z.object({ max_questions: z.number().int(), duration_minutes: z.number().int() }).partial(),
});

export const DraftBody = z.object({
  assessment_id: z.string().max(80).optional(),
  title: z.string().max(160),
  jd_text: z.string().max(20_000),
  max_questions: z.number().int().optional(),
});

export const CandidateBody = z
  .object({
    candidate_id: z.string().max(80).optional(),
    name: z.string().min(1).max(160),
    headline: z.string().max(300).optional(),
    location: z.string().max(160).optional(),
    email: z.string().max(200).optional(),
    phone: z.string().max(60).optional(),
    current_title: z.string().max(160).optional(),
    summary: z.string().max(2000).optional(),
    skills: z.array(z.string().max(80)).max(60).optional(),
  })
  .passthrough();
