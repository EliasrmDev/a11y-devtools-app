import { SignJWT, jwtVerify } from "jose";
import { randomUUID } from "node:crypto";
import type { AuthPort, ExternalAuthResult } from "../../domain/ports/auth.port.js";
import type { TokenPair, JwtPayload } from "../../shared/types.js";
import { TOKEN_TTL } from "../../shared/constants.js";
import { UnauthorizedError } from "../../domain/errors/index.js";

/** Clerk adapter — verifies Clerk session tokens and issues internal JWTs */
export class ClerkAuthAdapter implements AuthPort {
  private readonly secret: Uint8Array;
  private readonly clerkSecretKey: string;
  private readonly audience: string;

  constructor(jwtSecret: string, clerkSecretKey: string, audience = "a11y-devtools-ext") {
    this.secret = new TextEncoder().encode(jwtSecret);
    this.clerkSecretKey = clerkSecretKey;
    this.audience = audience;
  }

  async verifyExternalToken(token: string): Promise<ExternalAuthResult> {
    // Call Clerk Backend API to verify session token
    const response = await fetch("https://api.clerk.com/v1/sessions/verify", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.clerkSecretKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ token }),
    });

    if (!response.ok) {
      throw new UnauthorizedError("Invalid Clerk session token");
    }

    const session = (await response.json()) as ClerkSessionResponse;

    // Fetch user details
    const userResponse = await fetch(
      `https://api.clerk.com/v1/users/${session.user_id}`,
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

interface ClerkSessionResponse {
  user_id: string;
  status: string;
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
