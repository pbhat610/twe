import OpenAI from "openai";
import { AnswerAnalyzer } from "@/application/agents/answerAnalyzer";
import { JobWriter } from "@/application/agents/jobWriter";
import { QuestionPlanner } from "@/application/agents/questionPlanner";
import { ReportWriter } from "@/application/agents/reportWriter";
import { PromptInjectionDetector } from "@/application/guardrails/promptInjection";
import { ProtectedTopicGuard } from "@/application/guardrails/protectedTopicGuard";
import { InterviewService } from "@/application/interviewService";
import { FollowUpPolicy } from "@/domain/followUpPolicy";
import { SEED_ASSESSMENTS, SEED_CANDIDATES } from "@/infrastructure/data/demoData";
import { AssessmentService } from "@/application/assessmentService";
import { CandidateService } from "@/application/candidateService";
import { ResumeParser } from "@/application/agents/resumeParser";
import { FileTextExtractor } from "@/infrastructure/documents/documentTextExtractor";
import { InMemoryAssessmentRepository } from "@/infrastructure/memory/inMemoryAssessmentRepository";
import { SupabaseAssessmentRepository } from "@/infrastructure/supabase/supabaseAssessmentRepository";
import { InMemoryCandidateRepository } from "@/infrastructure/memory/inMemoryCandidateRepository";
import { SupabaseCandidateRepository } from "@/infrastructure/supabase/supabaseCandidateRepository";
import { FixtureLLM } from "@/infrastructure/fakes/fixtureLLM";
import { HeuristicLLM, noopModerator } from "@/infrastructure/fakes/heuristicLLM";
import { SimliSessionIssuer, localAvatarIssuer } from "@/infrastructure/simli/simliSessionIssuer";
import { SupabaseSessionRepository } from "@/infrastructure/supabase/supabaseSessionRepository";
import { InMemoryProctoringRepository } from "@/infrastructure/memory/inMemoryProctoringRepository";
import { SupabaseProctoringRepository } from "@/infrastructure/supabase/supabaseProctoringRepository";
import { InMemorySessionRepository } from "@/infrastructure/memory/inMemorySessionRepository";
import { InMemoryRecordingStore } from "@/infrastructure/memory/inMemoryRecordingStore";
import { SupabaseRecordingStore } from "@/infrastructure/supabase/supabaseRecordingStore";
import { ElevenLabsSpeechSynthesizer } from "@/infrastructure/elevenlabs/elevenLabsSpeechSynthesizer";
import { CachingSpeechSynthesizer } from "@/infrastructure/openai/cachingSpeechSynthesizer";
import { FallbackSpeechSynthesizer } from "@/infrastructure/openai/fallbackSpeechSynthesizer";
import {
  OpenAIModerator,
  OpenAISpeechSynthesizer,
  OpenAIStructuredLLM,
  OpenAITranscriber,
} from "@/infrastructure/openai/openaiAdapters";
import { systemClock, uuidIds } from "@/infrastructure/system";
import { AjvSchemaValidator } from "@/infrastructure/validation/ajvSchemaValidator";
import { env } from "@/lib/env";
import type { AvatarSessionIssuer, SpeechSynthesizer, SpeechTranscriber } from "@/ports";

/**
 * Composition root: the only place that knows concrete classes.
 * Everything else depends on ports. Swapping OpenAI for another provider,
 * or memory for Postgres, is a change here only.
 */
export interface Container {
  interviews: InterviewService;
  assessments: AssessmentService;
  candidates: CandidateService;
  speech: SpeechSynthesizer | null;
  transcriber: SpeechTranscriber | null;
  avatarSessions: AvatarSessionIssuer;
  aiMode: "openai" | "fixtures" | "heuristic";
  models: { quality: string; fast: string } | null;
  voice: "elevenlabs" | "openai" | "browser";
  avatar: "simli" | "local";
  db: "supabase" | "memory";
}

async function build(): Promise<Container> {
  const validator = new AjvSchemaValidator();
  const clock = systemClock;

  const openai = env.openaiApiKey ? new OpenAI({ apiKey: env.openaiApiKey, maxRetries: 2, timeout: 60_000 }) : null;

  // Brain: real OpenAI only when LLM_PROVIDER=openai; otherwise free (Claude-written fixtures → heuristic).
  const models = { quality: env.llmModel, fast: env.llmModelFast };
  const llm =
    env.aiMode === "openai" && openai
      ? new OpenAIStructuredLLM(openai, models, env.reasoningEffort)
      : env.aiMode === "heuristic"
        ? new HeuristicLLM()
        : new FixtureLLM(new HeuristicLLM());
  // Moderation is free on OpenAI, so it runs whenever a key exists.
  const moderator = openai ? new OpenAIModerator(openai) : noopModerator;
  const transcriber: SpeechTranscriber | null = openai ? new OpenAITranscriber(openai, env.sttModel) : null;

  // ElevenLabs falls back to OpenAI's voice per line (e.g. when credits run out).
  function withBackup(primary: SpeechSynthesizer): SpeechSynthesizer {
    return openai ? new FallbackSpeechSynthesizer(primary, new OpenAISpeechSynthesizer(openai, env.ttsModel, env.ttsVoice)) : primary;
  }

  // Voice is chosen independently of the brain: ElevenLabs API → OpenAI TTS → browser voice (null).
  // TTS_PROVIDER=none forces the free browser voice.
  const tts: SpeechSynthesizer | null =
    env.ttsProvider === "none"
      ? null
      : env.ttsProvider === "elevenlabs" && env.elevenLabsApiKey
      ? withBackup(new ElevenLabsSpeechSynthesizer(env.elevenLabsApiKey, env.elevenLabsVoiceId, env.elevenLabsModel))
      : openai
        ? new OpenAISpeechSynthesizer(openai, env.ttsModel, env.ttsVoice)
        : null;
  const speech = tts ? new CachingSpeechSynthesizer(tts) : null;

  // Storage: Supabase when configured (required on Vercel), else in-memory for local dev.
  const useSupabase = Boolean(env.supabaseUrl && env.supabaseServiceRoleKey);
  const sessions = useSupabase
    ? new SupabaseSessionRepository(env.supabaseUrl, env.supabaseServiceRoleKey)
    : new InMemorySessionRepository();
  const proctoring = useSupabase
    ? new SupabaseProctoringRepository(env.supabaseUrl, env.supabaseServiceRoleKey)
    : new InMemoryProctoringRepository();
  // One source of truth: the database when configured; otherwise in-memory
  // stores pre-filled with the official demo data (offline / tests only).
  const assessmentRepo = useSupabase
    ? new SupabaseAssessmentRepository(env.supabaseUrl, env.supabaseServiceRoleKey)
    : new InMemoryAssessmentRepository(SEED_ASSESSMENTS);
  const candidateRepo = useSupabase
    ? new SupabaseCandidateRepository(env.supabaseUrl, env.supabaseServiceRoleKey)
    : new InMemoryCandidateRepository(SEED_CANDIDATES);
  const recordings = useSupabase
    ? new SupabaseRecordingStore(env.supabaseUrl, env.supabaseServiceRoleKey, env.recordingsBucket)
    : new InMemoryRecordingStore();

  const topicGuard = new ProtectedTopicGuard();
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
  const interviews = new InterviewService({
    assessments: assessmentRepo,
    candidates: candidateRepo,
    sessions,
    proctoring,
    recordings,
    analyzer: new AnswerAnalyzer(llm),
    reporter: new ReportWriter(llm, validator, clock),
    policy: new FollowUpPolicy(2),
    topicGuard,
    injection: new PromptInjectionDetector(),
    moderator,
    validator,
    speech: speech ?? undefined,
    clock,
    ids: uuidIds,
  });

  // Hosted photoreal face needs real TTS audio to lip-sync, so it's only used with a speech provider.
  const avatarSessions =
    env.avatarProvider === "simli" && env.simliApiKey && speech
      ? new SimliSessionIssuer(env.simliApiKey, env.simliFaceId)
      : localAvatarIssuer;

  const voice = tts instanceof ElevenLabsSpeechSynthesizer || tts instanceof FallbackSpeechSynthesizer ? "elevenlabs" : tts ? "openai" : "browser";
  console.info(`[twe] brain=${env.aiMode}${env.aiMode === "openai" ? ` (${models.quality} / fast ${models.fast})` : ""} voice=${voice} avatar=${avatarSessions === localAvatarIssuer ? "local" : "simli"} db=${sessions instanceof SupabaseSessionRepository ? "supabase" : "memory"}`);
  return {
    interviews,
    assessments,
    candidates,
    speech,
    transcriber,
    avatarSessions,
    aiMode: env.aiMode,
    models: env.aiMode === "openai" ? models : null,
    voice,
    avatar: avatarSessions === localAvatarIssuer ? "local" : "simli",
    db: useSupabase ? "supabase" : "memory",
  };
}

let moduleScoped: Promise<Container> | undefined;
const g = globalThis as unknown as { __twe?: Promise<Container> };

/**
 * With Supabase, all state lives in the database, so the container is rebuilt
 * whenever this module is re-evaluated (code edits in dev pick up immediately).
 * In-memory mode keeps one container on globalThis so hot reloads don't wipe
 * interviews in progress.
 */
export const container = (): Promise<Container> =>
  env.supabaseUrl && env.supabaseServiceRoleKey ? (moduleScoped ??= build()) : (g.__twe ??= build());
