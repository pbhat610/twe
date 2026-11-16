import { BadRequestError } from "@/application/errors";
import { container } from "@/container";
import { handleRecruiter } from "@/lib/http";

export const maxDuration = 60;
const MAX_BYTES = 5 * 1024 * 1024;

/** Upload a resume (PDF, DOCX, TXT): returns an AI-drafted profile to review. Not saved. */
export const POST = handleRecruiter(async (req: Request) => {
  const form = await req.formData();
  const file = form.get("file");
  if (!(file instanceof File) || file.size === 0) throw new BadRequestError("Choose a resume file.");
  if (file.size > MAX_BYTES) throw new BadRequestError("Resume is too large (max 5 MB).");
  const { candidates } = await container();
  return Response.json(await candidates.parseResume(file, file.name));
});
