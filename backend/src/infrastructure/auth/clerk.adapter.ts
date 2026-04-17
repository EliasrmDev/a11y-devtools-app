import { SignJWT, jwtVerify, createRemoteJWKSet } from "jose";
import { randomUUID } from "node:crypto";
import type { AuthPort, ExternalAuthResult } from "../../domain/ports/auth.port.js";
import type { TokenPair, JwtPayload } from "../../shared/types.js";
import { TOKEN_TTL } from "../../shared/constants.js";
import { UnauthorizedError } from "../../domain/errors/index.js";

/** Clerk adapter — verifies Clerk session JWTs (from getToken()) and issues internal JWTs */
export class ClerkAuthAdapter implements AuthPort {
  private readonly secret: Uint8Array;
  private readonly clerkSecretKey: string;
  private readonly audience: string;
  private readonly jwks: ReturnType<typeof createRemoteJWKSet>;

  constructor(
    jwtSecret: string,
    clerkSecretKey: string,
    clerkPublishableKey: string,
    audience = "a11y-devtools-ext",
  ) {
    this.secret = new TextEncoder().encode(jwtSecret);
    this.clerkSecretKey = clerkSecretKey;
    this.audience = audience;

    // Derive JWKS URL from publishable key.
    // Format: pk_live_<base64(frontendApiHost + "$")>
    // e.g. pk_live_Y2xlcmsuYXBpLmExMXkuZWxpYXNybS5kZXYk → clerk.api.a11y.eliasrm.dev
    const b64 = clerkPublishableKey.replace(/^pk_(live|test)_/, "");
    const frontendApiHost = atob(b64).replace(/\$+$/, "");
    this.jwks = createRemoteJWKSet(
      new URL(`https://${frontendApiHost}/.well-known/jwks.json`),
    );
  }

  async verifyExternalToken(token: string): Promise<ExternalAuthResult> {
    // Verify the JWT using Clerk's JWKS endpoint.
    // session.getToken() on the frontend returns a short-lived Clerk-signed JWT;
    // the correct backend verification path is JWKS, not /v1/sessions/verify.
    let jwtPayload: Record<string, unknown>;
    try {
      const { payload } = await jwtVerify(token, this.jwks);
      jwtPayload = payload as Record<string, unknown>;
    } catch {
      throw new UnauthorizedError("Invalid Clerk session token");
    }

    const userId = jwtPayload["sub"] as string | undefined;
    if (!userId) {
      throw new UnauthorizedError("Invalid Clerk session token");
    }

    // Fetch user details from Clerk Backend API
    const userResponse = await fetch(
      `https://api.clerk.com/v1/users/${userId}`,
      {
        headers: { Authorization: `Bearer ${this.clerkSecretKey}` },
      },
    );

    if (!userResponse.ok) {
      throw new UnauthorizedError("Failed to fetch Clerk user");
    }

    const user = (await userResponse.json()) as ClerkUserResponse;
    const primaryEmail = user.email_addresses.find(
      (e) => e.id === user.primary_email_address_id,
    );

    return {
      externalId: user.id,
      provider: "clerk",
      email: primaryEmail?.email_address ?? "",
      displayName:
        [user.first_name, user.last_name].filter(Boolean).join(" ") || null,
      avatarUrl: user.image_url || null,
      emailVerified: primaryEmail?.verification?.status === "verified",
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
}

interface ClerkUserResponse {
  id: string;
  first_name: string | null;
  last_name: string | null;
  image_url: string | null;
  primary_email_address_id: string;
  email_addresses: Array<{
    id: string;
    email_address: string;
    verification: { status: string } | null;
  }>;
}
