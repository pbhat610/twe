import type { InterviewSession } from "@/domain/types";
import { ConflictError } from "@/application/errors";
import type { SessionRepository, SessionSummary } from "@/ports";
import { toSummary } from "../sessionSummary";

/** Local dev store. On Vercel use Supabase (serverless instances don't share memory). */
export class InMemorySessionRepository implements SessionRepository {
  private readonly store = new Map<string, InterviewSession>();

  async save(session: InterviewSession) {
    const current = this.store.get(session.id);
    if (current && current.version !== session.version) throw new ConflictError("Interview was updated elsewhere; please retry");
    session.version += 1;
    this.store.set(session.id, structuredClone(session));
  }

  async get(id: string) {
    const s = this.store.get(id);
    return s && structuredClone(s);
  }

  async getByInviteToken(token: string) {
    for (const s of this.store.values()) if (s.invite_token === token) return structuredClone(s);
    return undefined;
  }

  async list(limit = 50): Promise<SessionSummary[]> {
    return [...this.store.values()]
      .sort((a, b) => b.created_at.localeCompare(a.created_at))
      .slice(0, limit)
      .map(toSummary);
  }
}
