import { container } from "@/container";
import { SEED_CANDIDATES } from "@/infrastructure/data/demoData";
import { handleRecruiter } from "@/lib/http";

/**
 * One click: load the brief's four example candidates (data/candidates.json)
 * into the database. Runs on the server, so persona_note never reaches the browser.
 * Re-running overwrites the same four ids; nothing else is touched.
 */
export const POST = handleRecruiter(async () => {
  const { candidates } = await container();
  return Response.json(await candidates.importJson(SEED_CANDIDATES, "seed"));
});
