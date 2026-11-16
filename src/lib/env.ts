/** Typed access to configuration. All model names are swappable via env. */
export const env = {
  openaiApiKey: process.env.OPENAI_API_KEY?.trim() || "",
  /**
   * Which "brain" answers LLM tasks:
   *   fixtures  = replay outputs Claude wrote for the demo data (free; default for local dev)
   *   openai    = real OpenAI calls (needs OPENAI_API_KEY)
   *   heuristic = simple offline rules (free; also covers anything fixtures don't)
   */
  llmProvider: (process.env.LLM_PROVIDER || "fixtures") as "fixtures" | "openai" | "heuristic",
  /** Quality tasks: write a JD, plan questions, write the report (few calls per interview). */
  llmModel: process.env.OPENAI_MODEL || "gpt-6.1-sol",
  /** Per-answer analysis: many calls, latency-sensitive, so a cheaper fast model. */
  llmModelFast: process.env.OPENAI_MODEL_FAST || "gpt-6.1-terra",
  reasoningEffort: (process.env.OPENAI_REASONING_EFFORT || "low") as "none" | "minimal" | "low" | "medium",
  ttsModel: process.env.OPENAI_TTS_MODEL || "gpt-4o-mini-tts",
  ttsVoice: process.env.OPENAI_TTS_VOICE || "marin",
  sttModel: process.env.OPENAI_STT_MODEL || "gpt-4o-mini-transcribe",
  // ElevenLabs is the preferred voice; OpenAI TTS is the automatic fallback when no ElevenLabs key is set.
  ttsProvider: (process.env.TTS_PROVIDER || "elevenlabs") as "openai" | "elevenlabs" | "none",
  elevenLabsApiKey: process.env.ELEVENLABS_API_KEY?.trim() || "",
  // "Sarah": a built-in voice that free ElevenLabs plans can use via the API (library voices need a paid plan).
  elevenLabsVoiceId: process.env.ELEVENLABS_VOICE_ID || "EXAVITQu4vr4xnSDxMaL",
  // eleven_v4_turbo: most expressive real-time model (~100 ms). Use eleven_flash_v2_5 to halve cost.
  elevenLabsModel: process.env.ELEVENLABS_MODEL || "eleven_v4_turbo",
  // Open-source local avatar by default; Simli (hosted, photoreal) is opt-in.
  avatarProvider: (process.env.AVATAR_PROVIDER || "local") as "simli" | "local",
  simliApiKey: process.env.SIMLI_API_KEY?.trim() || "",
  simliFaceId: process.env.SIMLI_FACE_ID || "14c60d62-6ebf-424d-b626-1f4f91c33b04",
  supabaseUrl: process.env.SUPABASE_URL?.trim() || "",
  // Supabase's newer dashboards call this the "secret key"; accept either name.
  supabaseServiceRoleKey: (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY)?.trim() || "",
  recordingsBucket: process.env.SUPABASE_RECORDINGS_BUCKET?.trim() || "interview-recordings",
  /** "openai" only when explicitly chosen and keyed; everything else costs nothing. */
  get aiMode(): "openai" | "fixtures" | "heuristic" {
    if (this.llmProvider === "openai" && this.openaiApiKey) return "openai";
    return this.llmProvider === "heuristic" ? "heuristic" : "fixtures";
  },
};
