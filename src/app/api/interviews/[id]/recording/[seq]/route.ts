import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

/** Recruiter: bytes of one chunk (local store, or fallback when signing fails). */
export const GET = handleRecruiter(async (_req: Request, ctx: RouteContext<"/api/interviews/[id]/recording/[seq]">) => {
  const { id, seq } = await ctx.params;
  const { interviews } = await container();
  const chunk = await interviews.recordingChunk(id, Number(seq));
  return new Response(chunk.data, { headers: { "content-type": chunk.contentType, "cache-control": "private, max-age=3600" } });
});
