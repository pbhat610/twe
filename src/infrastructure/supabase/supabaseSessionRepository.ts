import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { ConflictError } from "@/application/errors";
import { supabaseError } from "./errors";
import type { InterviewSession } from "@/domain/types";
import type { SessionRepository, SessionSummary } from "@/ports";

type Row = {
  id: string;
  assessment_id: string | null;
  invite_token: string;
  status: InterviewSession["status"];
  job_title: string;
  candidate_name: string;
  recommendation: string | null;
  version: number;
  data: InterviewSession;
  created_at: string;
};

const TABLE = "interviews";

/**
 * Postgres (Supabase) persistence for serverless deploys (Vercel).
 * Uses the service-role key on the server only; RLS blocks everything else.
 * Optimistic concurrency via `version` prevents double-submitted answers
 * from two instances overwriting each other.
 */
export class SupabaseSessionRepository implements SessionRepository {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async save(session: InterviewSession) {
    const expected = session.version;
    const next = { ...session, version: expected + 1 };
    const row = {
      id: session.id,
      invite_token: session.invite_token,
      assessment_id: session.assessment_id ?? null,
      status: session.status,
      job_title: session.job.title,
      candidate_name: session.candidate.name,
      recommendation: session.report?.overall.recommendation ?? null,
      version: next.version,
      data: next,
      updated_at: new Date().toISOString(),
    };

    if (expected === 0) {
      const { error } = await this.db.from(TABLE).insert({ ...row, created_at: session.created_at });
      if (error) throw supabaseError("Supabase insert failed", error);
    } else {
      const { data, error } = await this.db.from(TABLE).update(row).eq("id", session.id).eq("version", expected).select("id");
      if (error) throw supabaseError("Supabase update failed", error);
      if (!data?.length) throw new ConflictError("Interview was updated elsewhere; please retry");
    }
    session.version = next.version;
  }

  async get(id: string) {
    return this.one(this.db.from(TABLE).select("data").eq("id", id).maybeSingle());
  }

  async getByInviteToken(token: string) {
    return this.one(this.db.from(TABLE).select("data").eq("invite_token", token).maybeSingle());
  }

  async list(limit = 50): Promise<SessionSummary[]> {
    const { data, error } = await this.db
      .from(TABLE)
      .select("id, assessment_id, invite_token, status, job_title, candidate_name, recommendation, created_at")
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw supabaseError("Supabase list failed", error);
    return (data as Omit<Row, "data" | "version">[]).map((r) => ({ ...r, assessment_id: r.assessment_id ?? undefined, recommendation: r.recommendation ?? undefined }));
  }

  private async one(query: PromiseLike<{ data: Pick<Row, "data"> | null; error: { message: string } | null }>) {
    const { data, error } = await query;
    if (error) throw supabaseError("Supabase read failed", error);
    return data?.data;
  }
}
