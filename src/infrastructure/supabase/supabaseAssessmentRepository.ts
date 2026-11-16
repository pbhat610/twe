import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Assessment } from "@/domain/assessment";
import type { AssessmentRepository } from "@/ports";
import { supabaseError } from "./errors";

/** Assessments in Postgres: the full assessment as JSONB, title and times as columns. */
export class SupabaseAssessmentRepository implements AssessmentRepository {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async list(): Promise<Assessment[]> {
    const { data, error } = await this.db.from("assessments").select("data").order("created_at", { ascending: false }).limit(200);
    if (error) throw supabaseError("Supabase assessments list failed", error);
    return (data ?? []).map((r) => r.data as Assessment);
  }

  async get(id: string): Promise<Assessment | undefined> {
    const { data, error } = await this.db.from("assessments").select("data").eq("assessment_id", id).maybeSingle();
    if (error) throw supabaseError("Supabase assessments read failed", error);
    return (data?.data as Assessment | undefined) ?? undefined;
  }

  async save(a: Assessment) {
    const { error } = await this.db.from("assessments").upsert({
      assessment_id: a.assessment_id,
      title: a.title,
      data: a,
      created_at: a.created_at,
      updated_at: a.updated_at,
    });
    if (error) throw supabaseError("Supabase assessments save failed", error);
  }
}
