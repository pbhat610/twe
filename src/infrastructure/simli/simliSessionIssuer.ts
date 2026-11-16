import { generateSimliSessionToken } from "simli-client";
import type { AvatarSession, AvatarSessionIssuer } from "@/ports";

/**
 * Photoreal streaming avatar (Simli). We only use it as a *face*: it lip-syncs
 * the PCM audio we send, so our own agent, guardrails and TTS stay in control.
 */
export class SimliSessionIssuer implements AvatarSessionIssuer {
  constructor(
    private readonly apiKey: string,
    private readonly faceId: string,
  ) {}

  async issue(): Promise<AvatarSession> {
    const { session_token } = await generateSimliSessionToken({
      apiKey: this.apiKey,
      config: {
        faceId: this.faceId,
        handleSilence: true,
        maxSessionLength: 1200, // 20 min hard cap protects free minutes
        maxIdleTime: 180,
        streaming_width: 1280,
        streaming_height: 720,
      },
    });
    return { provider: "simli", token: session_token };
  }
}

/** Used when no hosted avatar is configured: the browser renders 3D/2D locally. */
export const localAvatarIssuer: AvatarSessionIssuer = {
  issue: async () => ({ provider: "local" }),
};
