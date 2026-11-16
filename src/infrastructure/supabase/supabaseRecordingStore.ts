import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { chunkFileName, normalizeContentType, type RecordingContentType } from "@/domain/recording";
import type { RecordingStore } from "@/ports";

const SIGNED_URL_TTL_S = 60 * 60;
const SEQ = /^(\d{6})\.(webm|mp4)$/;

/**
 * Private Supabase Storage bucket: `<bucket>/<interviewId>/<seq>.webm`.
 * The service-role key never leaves the server; the recruiter's browser gets
 * one-hour signed URLs and fetches the chunks straight from Storage.
 */
export class SupabaseRecordingStore implements RecordingStore {
  private readonly db: SupabaseClient;

  constructor(
    url: string,
    serviceRoleKey: string,
    private readonly bucket: string,
  ) {
    this.db = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
  }

  async putChunk(interviewId: string, seq: number, data: ArrayBuffer, contentType: RecordingContentType) {
    const { error } = await this.db.storage
      .from(this.bucket)
      .upload(`${interviewId}/${chunkFileName(seq, contentType)}`, data, { contentType, upsert: true });
    if (error) throw new Error(`Recording upload failed: ${error.message}`);
  }

  async list(interviewId: string) {
    const { data, error } = await this.db.storage
      .from(this.bucket)
      .list(interviewId, { limit: 2000, sortBy: { column: "name", order: "asc" } });
    if (error) throw new Error(`Recording list failed: ${error.message}`);

    const files = (data ?? [])
      .map((f) => ({ f, m: SEQ.exec(f.name) }))
      .filter((x): x is { f: (typeof data)[number]; m: RegExpExecArray } => x.m !== null)
      .sort((a, b) => Number(a.m[1]) - Number(b.m[1]));
    if (!files.length) return { content_type: null, chunks: [] };

    const { data: signed, error: signError } = await this.db.storage
      .from(this.bucket)
      .createSignedUrls(files.map(({ f }) => `${interviewId}/${f.name}`), SIGNED_URL_TTL_S);
    if (signError) throw new Error(`Recording sign failed: ${signError.message}`);

    const content_type = normalizeContentType(files[0].f.metadata?.mimetype) ?? (files[0].m[2] === "mp4" ? "video/mp4" : "video/webm");
    return {
      content_type,
      chunks: files.map(({ f, m }, i) => ({
        seq: Number(m[1]),
        bytes: Number(f.metadata?.size ?? 0),
        url: signed?.[i]?.signedUrl ?? `/api/interviews/${interviewId}/recording/${Number(m[1])}`,
      })),
    };
  }

  async read(interviewId: string, seq: number) {
    for (const type of ["video/webm", "video/mp4"] as const) {
      const { data } = await this.db.storage.from(this.bucket).download(`${interviewId}/${chunkFileName(seq, type)}`);
      if (data) return { data: await data.arrayBuffer(), contentType: type };
    }
    return undefined;
  }
}
