import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

/** Import a JSON array of candidates (same shape as data/candidates.json). */
export const POST = handleRecruiter(async (req: Request) => {
  const { candidates } = await container();
  return Response.json(await candidates.importJson(await req.json()));
});
