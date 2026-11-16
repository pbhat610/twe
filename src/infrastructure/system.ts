import { randomBytes, randomUUID } from "node:crypto";
import type { Clock, IdGenerator } from "@/ports";

export const systemClock: Clock = { now: () => new Date() };

export const uuidIds: IdGenerator = {
  next: (prefix) => `${prefix}_${randomUUID().replace(/-/g, "").slice(0, 16)}`,
  secret: () => randomBytes(18).toString("base64url"),
};
