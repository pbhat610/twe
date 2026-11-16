/**
 * Minimal recruiter auth: one set of credentials from env, a signed
 * HttpOnly session cookie (HMAC-SHA256 via Web Crypto, so it works in the
 * proxy and in route handlers). No database, no third-party dependency.
 *
 * Candidates never log in: their access is the unguessable invite token.
 */
export const SESSION_COOKIE = "twe_session";
export const SESSION_TTL_SECONDS = 60 * 60 * 8; // 8h

const enc = new TextEncoder();

function config() {
  return {
    email: process.env.RECRUITER_EMAIL?.trim().toLowerCase() ?? "",
    password: process.env.RECRUITER_PASSWORD ?? "",
    secret: process.env.AUTH_SECRET ?? "",
  };
}

export function authConfigured(): boolean {
  const c = config();
  return Boolean(c.email && c.password && c.secret.length >= 32);
}

const b64url = (bytes: ArrayBuffer | Uint8Array) =>
  Buffer.from(bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)).toString("base64url");

async function hmac(data: string, secret: string): Promise<Uint8Array> {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", key, enc.encode(data)));
}

/** Constant-time compare of two strings (via HMAC so lengths don't leak). */
async function safeEqual(a: string, b: string, secret: string): Promise<boolean> {
  const [x, y] = await Promise.all([hmac(a, secret), hmac(b, secret)]);
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

export async function verifyCredentials(email: string, password: string): Promise<boolean> {
  const c = config();
  if (!authConfigured()) return false;
  const [okEmail, okPass] = await Promise.all([
    safeEqual(email.trim().toLowerCase(), c.email, c.secret),
    safeEqual(password, c.password, c.secret),
  ]);
  return okEmail && okPass;
}

export async function createSessionToken(email: string, now = Date.now()): Promise<string> {
  const payload = b64url(enc.encode(JSON.stringify({ sub: email, exp: Math.floor(now / 1000) + SESSION_TTL_SECONDS })));
  return `${payload}.${b64url(await hmac(payload, config().secret))}`;
}

export async function verifySessionToken(token: string | undefined, now = Date.now()): Promise<{ sub: string } | null> {
  if (!token || !authConfigured()) return null;
  const [payload, sig] = token.split(".");
  if (!payload || !sig) return null;
  const expected = b64url(await hmac(payload, config().secret));
  if (!(await safeEqual(sig, expected, config().secret))) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as { sub: string; exp: number };
    return data.exp * 1000 > now ? { sub: data.sub } : null;
  } catch {
    return null;
  }
}

export function sessionCookie(value: string, maxAge = SESSION_TTL_SECONDS) {
  return {
    name: SESSION_COOKIE,
    value,
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax" as const,
    path: "/",
    maxAge,
  };
}

/** Read the cookie from a raw Request (route handlers). */
export function readSessionCookie(req: Request): string | undefined {
  const raw = req.headers.get("cookie") ?? "";
  return raw
    .split(";")
    .map((c) => c.trim().split("="))
    .find(([k]) => k === SESSION_COOKIE)?.[1];
}
