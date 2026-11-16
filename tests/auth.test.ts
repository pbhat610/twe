import { beforeAll, describe, expect, it } from "vitest";
import { createSessionToken, verifyCredentials, verifySessionToken } from "@/lib/auth";

beforeAll(() => {
  process.env.RECRUITER_EMAIL = "Recruiter@Example.com";
  process.env.RECRUITER_PASSWORD = "correct horse battery staple";
  process.env.AUTH_SECRET = "x".repeat(40);
});

describe("recruiter auth", () => {
  it("accepts the configured credentials (email case-insensitive) and rejects others", async () => {
    expect(await verifyCredentials("recruiter@example.com", "correct horse battery staple")).toBe(true);
    expect(await verifyCredentials("recruiter@example.com", "wrong")).toBe(false);
    expect(await verifyCredentials("someone@example.com", "correct horse battery staple")).toBe(false);
  });

  it("issues a session token that verifies, and rejects tampered or expired ones", async () => {
    const token = await createSessionToken("recruiter@example.com");
    expect(await verifySessionToken(token)).toEqual({ sub: "recruiter@example.com" });

    const [payload, sig] = token.split(".");
    const forged = Buffer.from(JSON.stringify({ sub: "attacker", exp: 9999999999 })).toString("base64url");
    expect(await verifySessionToken(`${forged}.${sig}`)).toBeNull();
    expect(await verifySessionToken(`${payload}.AAAA`)).toBeNull();

    const old = await createSessionToken("recruiter@example.com", Date.now() - 9 * 3600_000);
    expect(await verifySessionToken(old)).toBeNull();
  });

  it("refuses everything when auth isn't configured", async () => {
    const secret = process.env.AUTH_SECRET;
    process.env.AUTH_SECRET = "";
    expect(await verifyCredentials("recruiter@example.com", "correct horse battery staple")).toBe(false);
    process.env.AUTH_SECRET = secret;
  });
});
