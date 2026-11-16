import { AnswerAnalyzer } from "@/application/agents/answerAnalyzer";
import { JobWriter } from "@/application/agents/jobWriter";
import { QuestionPlanner } from "@/application/agents/questionPlanner";
import { ReportWriter } from "@/application/agents/reportWriter";
import { ResumeParser } from "@/application/agents/resumeParser";
import { AssessmentService } from "@/application/assessmentService";
import { CandidateService } from "@/application/candidateService";
import { PromptInjectionDetector } from "@/application/guardrails/promptInjection";
import { ProtectedTopicGuard } from "@/application/guardrails/protectedTopicGuard";
import { InterviewService } from "@/application/interviewService";
import { FollowUpPolicy } from "@/domain/followUpPolicy";
import { SEED_ASSESSMENTS, SEED_CANDIDATES } from "@/infrastructure/data/demoData";
import { FileTextExtractor } from "@/infrastructure/documents/documentTextExtractor";
import { FixtureLLM } from "@/infrastructure/fakes/fixtureLLM";
import { HeuristicLLM, noopModerator } from "@/infrastructure/fakes/heuristicLLM";
import { InMemoryAssessmentRepository } from "@/infrastructure/memory/inMemoryAssessmentRepository";
import { InMemoryCandidateRepository } from "@/infrastructure/memory/inMemoryCandidateRepository";
import { InMemoryProctoringRepository } from "@/infrastructure/memory/inMemoryProctoringRepository";
import { InMemoryRecordingStore } from "@/infrastructure/memory/inMemoryRecordingStore";
import { InMemorySessionRepository } from "@/infrastructure/memory/inMemorySessionRepository";
import { systemClock, uuidIds } from "@/infrastructure/system";
import { AjvSchemaValidator } from "@/infrastructure/validation/ajvSchemaValidator";
import type { Clock, StructuredLLM } from "@/ports";

/**
 * The real services wired with free, in-memory adapters, pre-filled with the
 * official demo assessments (ids job_001…) and candidates (cand_001…).
 * Default brain: Claude-written fixtures → heuristic.
 */
export async function buildService(llm: StructuredLLM = new FixtureLLM(new HeuristicLLM()), clock: Clock = systemClock) {
  const validator = new AjvSchemaValidator();
  const topicGuard = new ProtectedTopicGuard();
  const sessions = new InMemorySessionRepository();
  const assessmentRepo = new InMemoryAssessmentRepository(SEED_ASSESSMENTS);
  const candidateRepo = new InMemoryCandidateRepository(SEED_CANDIDATES);
  const service = new InterviewService({
    assessments: assessmentRepo,
    candidates: candidateRepo,
    sessions,
    proctoring: new InMemoryProctoringRepository(),
    recordings: new InMemoryRecordingStore(),
    analyzer: new AnswerAnalyzer(llm),
    reporter: new ReportWriter(llm, validator, clock),
    policy: new FollowUpPolicy(2),
    topicGuard,
    injection: new PromptInjectionDetector(),
    moderator: noopModerator,
    validator,
    clock,
    ids: uuidIds,
  });
  const assessments = new AssessmentService({
    assessments: assessmentRepo,
    jobWriter: new JobWriter(llm, topicGuard),
    planner: new QuestionPlanner(llm, topicGuard),
    topicGuard,
    clock,
    ids: uuidIds,
  });
  const candidates = new CandidateService({
    candidates: candidateRepo,
    resumeParser: new ResumeParser(llm),
    extractor: new FileTextExtractor(),
    clock,
    ids: uuidIds,
  });
  return { service, assessments, candidates, sessions, validator };
}
