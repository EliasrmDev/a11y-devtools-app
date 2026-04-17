import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { AuthPort, ExternalAuthResult } from "../../domain/ports/auth.port.js";
import type { TokenPair, JwtPayload } from "../../shared/types.js";
import { TOKEN_TTL } from "../../shared/constants.js";
import { UnauthorizedError } from "../../domain/errors/index.js";

/**
 * Better Auth adapter — verifies Better Auth session tokens
 * and issues internal JWTs. Better Auth manages its own session storage,
 * so this adapter calls its verify endpoint.
 */
export class BetterAuthAdapter implements AuthPort {
  private readonly secret: Uint8Array;
  private readonly betterAuthSecret: string;
  private readonly audience: string;

  constructor(jwtSecret: string, betterAuthSecret: string, audience = "a11y-devtools-ext") {
    this.secret = new TextEncoder().encode(jwtSecret);
    this.betterAuthSecret = betterAuthSecret;
    this.audience = audience;
  }

  async verifyExternalToken(token: string): Promise<ExternalAuthResult> {
    // Better Auth uses its own session verification
    // The token here is a Better Auth session token
    // In production, this would call the Better Auth verify endpoint
    // or decode the session token directly using the shared secret

    try {
      const sessionSecret = new TextEncoder().encode(this.betterAuthSecret);
      const { payload } = await jwtVerify(token, sessionSecret);

      return {
        externalId: payload.sub!,
        provider: "better-auth",
        email: payload.email as string,
        displayName: (payload.name as string) || null,
        avatarUrl: (payload.picture as string) || null,
        emailVerified: (payload.email_verified as boolean) ?? false,
      };
    } catch {
      throw new UnauthorizedError("Invalid Better Auth session token");
    }
  }

  async createTokenPair(
    payload: Pick<JwtPayload, "sub" | "email" | "role">,
  ): Promise<TokenPair> {
    const jti = randomUUID();
    const now = Math.floor(Date.now() / 1000);

    const accessToken = await new SignJWT({
      email: payload.email,
      role: payload.role,
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setJti(jti)
      .setAudience(this.audience)
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL.ACCESS_TOKEN_SECONDS)
      .sign(this.secret);

    const refreshJti = randomUUID();
    const refreshToken = await new SignJWT({
      type: "refresh",
    })
      .setProtectedHeader({ alg: "HS256" })
      .setSubject(payload.sub)
      .setJti(refreshJti)
      .setAudience(this.audience)
      .setIssuedAt(now)
      .setExpirationTime(now + TOKEN_TTL.REFRESH_TOKEN_SECONDS)
      .sign(this.secret);

    return {
      accessToken,
      refreshToken,
      expiresIn: TOKEN_TTL.ACCESS_TOKEN_SECONDS,
    };
  }

  async verifyAccessToken(token: string): Promise<JwtPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: this.audience,
      });

      return {
        sub: payload.sub!,
        email: payload.email as string,
        role: payload.role as JwtPayload["role"],
        jti: payload.jti!,
        iat: payload.iat!,
        exp: payload.exp!,
        aud: this.audience,
      };
    } catch {
      throw new UnauthorizedError("Invalid or expired access token");
    }
  }

  async verifyRefreshToken(token: string): Promise<JwtPayload> {
    try {
      const { payload } = await jwtVerify(token, this.secret, {
        audience: this.audience,
      });

      if (payload.type !== "refresh") {
        throw new UnauthorizedError("Token is not a refresh token");
      }

      return {
        sub: payload.sub!,
        email: "",
        role: "user",
        jti: payload.jti!,
        iat: payload.iat!,
        exp: payload.exp!,
        aud: this.audience,
      };
    } catch (error) {
      if (error instanceof UnauthorizedError) throw error;
      throw new UnauthorizedError("Invalid or expired refresh token");
    }
  }
}
