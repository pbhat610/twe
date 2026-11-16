import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Candidate } from "@/domain/types";
import type { CandidateRepository } from "@/ports";
import { supabaseError } from "./errors";

/** Candidates in Postgres: the full profile as JSONB, name as a column. */
export class SupabaseCandidateRepository implements CandidateRepository {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async list(): Promise<Candidate[]> {
    const { data, error } = await this.db.from("candidates").select("data").limit(500);
    if (error) throw supabaseError("Supabase candidates list failed", error);
    return (data ?? []).map((r) => r.data as Candidate);
  }

  async get(candidateId: string): Promise<Candidate | undefined> {
    const { data, error } = await this.db.from("candidates").select("data").eq("candidate_id", candidateId).maybeSingle();
    if (error) throw supabaseError("Supabase candidates read failed", error);
    return (data?.data as Candidate | undefined) ?? undefined;
  }

  async save(candidates: Candidate[]) {
    if (!candidates.length) return;
    const { error } = await this.db.from("candidates").upsert(
      candidates.map((c) => ({ candidate_id: c.candidate_id, name: c.name, data: c, created_at: c.created_at ?? new Date().toISOString() })),
    );
    if (error) throw supabaseError("Supabase candidates save failed", error);
  }
}
