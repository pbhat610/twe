/**
 * Simulated interview (bonus): runs a full interview with scripted answers
 * from data/sample_answers.json (picked by topic) and writes the plan and
 * the official-schema report to /outputs.
 *
 *   npm run simulate -- job_003 cand_004
 *
 * Loads .env.local. LLM_PROVIDER decides the brain: fixtures (default, free),
 * heuristic (free) or openai (billed; prints the cost of every call).
 */
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { pickSampleAnswer, type SampleAnswers } from "../src/application/simulation/sampleAnswerPicker";
import samples from "../data/sample_answers.json";

async function main() {
  try {
    process.loadEnvFile(".env.local");
  } catch {
    /* no env file: free local mode */
  }
  // Keep the CLI self-contained: no Supabase writes, no voice.
  delete process.env.SUPABASE_URL;
  delete process.env.ELEVENLABS_API_KEY;
  process.env.TTS_PROVIDER = "none";

  const { container } = await import("../src/container");
  const [jobId = "job_003", candidateId = "cand_004"] = process.argv.slice(2);
  const { interviews, aiMode } = await container();
  const answers = (samples as unknown as Record<string, SampleAnswers>)[candidateId];
  if (!answers) throw new Error(`No sample answers for ${candidateId}`);

  console.log(`▶ Simulating ${candidateId} for ${jobId} (brain: ${aiMode})`);
  const created = await interviews.create(jobId, candidateId);
  let cv = await interviews.join(created.invite_token, { recordingConsent: true });

  while (cv.current_turn) {
    const turn = cv.current_turn;
    const sim = await interviews.simulationContext(created.invite_token);
    const { topic, text } = pickSampleAnswer(answers, sim);
    console.log(`\n${turn.is_follow_up ? "  ↳ follow-up" : `Q${turn.question_number}`}: ${turn.question}\n  A [${topic}]: ${text || "(empty)"}`);
    cv = await interviews.submitAnswer(created.invite_token, turn.turn_id, text, "simulated");
    const t = (await interviews.get(created.id)).turns.find((x) => x.turn_id === turn.turn_id);
    if (t?.analysis) console.log(`  ⇒ ${t.analysis.score ?? "–"}/5 · ${t.decision}: ${t.decision_reason}`);
  }

  const report = await interviews.report(created.id);
  const view = await interviews.get(created.id);
  await mkdir("outputs", { recursive: true });
  const base = path.join("outputs", `${jobId}_${candidateId}`);
  const plan = {
    interview_id: view.id,
    job_id: jobId,
    candidate_id: candidateId,
    created_at: view.created_at,
    candidate_summary: view.candidate_summary,
    questions: view.plan,
  };
  await writeFile(`${base}_plan.json`, JSON.stringify(plan, null, 2));
  await writeFile(`${base}_report.json`, JSON.stringify(report, null, 2));
  console.log(`\n✔ ${report.overall.recommendation} (${report.overall.confidence} confidence). Saved ${base}_report.json`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
