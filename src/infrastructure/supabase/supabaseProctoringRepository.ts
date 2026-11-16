import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { MAX_STORED_EVENTS, type ProctoringEvent } from "@/domain/proctoring";
import { supabaseError } from "./errors";
import type { ProctoringRepository } from "@/ports";

export class SupabaseProctoringRepository implements ProctoringRepository {
  private readonly db: SupabaseClient;

  constructor(url: string, serviceRoleKey: string) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async append(interviewId: string, events: ProctoringEvent[]) {
    if (!events.length) return;
    const { error } = await this.db.from("proctoring_events").insert(
      events.map((e) => ({ interview_id: interviewId, type: e.type, severity: e.severity, turn_id: e.turn_id ?? null, detail: e.detail ?? null, at: e.at })),
    );
    if (error) throw supabaseError("Supabase insert failed", error);
  }

  async list(interviewId: string): Promise<ProctoringEvent[]> {
    const { data, error } = await this.db
      .from("proctoring_events")
      .select("type, severity, turn_id, detail, at")
      .eq("interview_id", interviewId)
      .order("at", { ascending: true })
      .limit(MAX_STORED_EVENTS);
    if (error) throw supabaseError("Supabase read failed", error);
    return (data ?? []).map((r) => ({ ...r, turn_id: r.turn_id ?? undefined, detail: r.detail ?? undefined })) as ProctoringEvent[];
  }
}
