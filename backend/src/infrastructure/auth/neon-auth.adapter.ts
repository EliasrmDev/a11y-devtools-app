import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { randomUUID } from "node:crypto";
import type { AuthPort, ExternalAuthResult } from "../../domain/ports/auth.port.js";
import type { TokenPair, JwtPayload } from "../../shared/types.js";
import { TOKEN_TTL } from "../../shared/constants.js";
import { UnauthorizedError } from "../../domain/errors/index.js";

/**
 * Neon Auth adapter — verifies JWTs issued by the Neon Auth managed service
 * (built on Better Auth) and issues internal HS256 JWT pairs.
 *
 * Neon Auth stores users/sessions in the `neon_auth` schema in Neon Postgres.
 * The JWT `sub` claim is the Neon Auth user ID (UUID).
 */
export class NeonAuthAdapter implements AuthPort {
  private readonly secret: Uint8Array;
  private readonly audience: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;
  private readonly baseUrl: string;

  constructor(
    jwtSecret: string,
    neonAuthJwksUrl: string,
    neonAuthBaseUrl: string,
    audience = "a11y-devtools-ext",
  ) {
    this.secret = new TextEncoder().encode(jwtSecret);
    this.audience = audience;
    this.baseUrl = neonAuthBaseUrl;
    this.jwks = createRemoteJWKSet(new URL(neonAuthJwksUrl));
  }

  async verifyExternalToken(token: string): Promise<ExternalAuthResult> {
    let jwtPayload: Record<string, unknown>;
    try {
      const { payload } = await jwtVerify(token, this.jwks);
      jwtPayload = payload as Record<string, unknown>;
    } catch {
      throw new UnauthorizedError("Invalid Neon Auth token");
    }

    const userId = jwtPayload["sub"] as string | undefined;
    if (!userId) {
      throw new UnauthorizedError("Invalid Neon Auth token: missing sub claim");
    }

    const email = jwtPayload["email"] as string | undefined;
    if (!email) {
      throw new UnauthorizedError("Invalid Neon Auth token: missing email claim");
    }

    return {
      externalId: userId,
      provider: "neon-auth",
      email,
      displayName: (jwtPayload["name"] as string) ?? null,
      avatarUrl: (jwtPayload["image"] as string) ?? null,
      emailVerified: (jwtPayload["emailVerified"] as boolean) ?? false,
    };
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

  /** Base URL of the Neon Auth REST API (used by deletion cascade) */
  get neonAuthBaseUrl(): string {
    return this.baseUrl;
  }
}
