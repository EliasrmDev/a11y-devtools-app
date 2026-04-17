import { describe, it, expect, vi, beforeEach } from "vitest";
import { VerifyTokenUseCase } from "../src/application/use-cases/auth/verify-token.use-case.js";
import { RefreshTokenUseCase } from "../src/application/use-cases/auth/refresh-token.use-case.js";
import type { AuthPort } from "../src/domain/ports/auth.port.js";
import type { JwtPayload } from "../src/shared/types.js";
import { UnauthorizedError } from "../src/domain/errors/index.js";
import type { RevokedTokenChecker } from "../src/application/use-cases/auth/refresh-token.use-case.js";
import type { UserRepository } from "../src/domain/ports/user.repository.js";

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function nowSec() {
  return Math.floor(Date.now() / 1000);
}

function basePayload(overrides: Partial<JwtPayload> = {}): JwtPayload {
  return {
    sub: "user-1",
    email: "test@example.com",
    role: "user",
    jti: "test-jti-123",
    iat: nowSec() - 10,
    exp: nowSec() + 890,
    aud: "a11y-devtools-ext",
    ...overrides,
  };
}

function mockAuthPort(overrides: Partial<AuthPort> = {}): AuthPort {
  return {
    verifyExternalToken: vi.fn(),
    createTokenPair: vi.fn().mockResolvedValue({
      accessToken: "new-access",
      refreshToken: "new-refresh",
      expiresIn: 900,
    }),
    verifyAccessToken: vi.fn().mockResolvedValue(basePayload()),
    verifyRefreshToken: vi.fn().mockResolvedValue(
      basePayload({ jti: "refresh-jti", exp: nowSec() + 604_800 }),
    ),
    ...overrides,
  };
}

function mockRevokedTokenRepo(
  overrides: Partial<RevokedTokenChecker> = {},
): RevokedTokenChecker {
  return {
    isRevoked: vi.fn().mockResolvedValue(false),
    revoke: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

function mockUserRepo(): UserRepository {
  return {
    findById: vi.fn().mockResolvedValue({
      id: "user-1",
      email: "test@example.com",
      displayName: "Test User",
      avatarUrl: null,
      role: "user",
      emailVerifiedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    }),
    findByEmail: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    softDelete: vi.fn(),
    findAll: vi.fn(),
    countByStatus: vi.fn(),
  };
}

// ---------------------------------------------------------------------------
// VerifyTokenUseCase — edge cases
// ---------------------------------------------------------------------------

describe("VerifyTokenUseCase", () => {
  let auth: AuthPort;
  let revokedTokenRepo: RevokedTokenChecker;
  let uc: VerifyTokenUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    auth = mockAuthPort();
    revokedTokenRepo = mockRevokedTokenRepo();
    uc = new VerifyTokenUseCase(auth, revokedTokenRepo);
  });

  it("returns payload for a valid, non-revoked token", async () => {
    const payload = await uc.execute("valid-token");
    expect(payload.sub).toBe("user-1");
  });

  it("throws UnauthorizedError when JWT is expired (verifyAccessToken rejects)", async () => {
    auth = mockAuthPort({
      verifyAccessToken: vi
        .fn()
        .mockRejectedValue(new UnauthorizedError("Token expired")),
    });
    uc = new VerifyTokenUseCase(auth, revokedTokenRepo);

    await expect(uc.execute("expired-token")).rejects.toThrow(UnauthorizedError);
  });

  it("throws UnauthorizedError when JTI has been revoked (blacklisted)", async () => {
    revokedTokenRepo = mockRevokedTokenRepo({
      isRevoked: vi.fn().mockResolvedValue(true),
    } as Partial<RevokedTokenChecker>);
    uc = new VerifyTokenUseCase(auth, revokedTokenRepo);

    await expect(uc.execute("revoked-token")).rejects.toThrow(
      "Token has been revoked",
    );
  });

  it("checks the SHA-256 hash of the JTI, not the raw JTI", async () => {
    const payload = await uc.execute("valid-token");
    expect(revokedTokenRepo.isRevoked).toHaveBeenCalledOnce();
    const calledWith = vi.mocked(revokedTokenRepo.isRevoked).mock.calls[0][0];
    // Hash should not equal the raw JTI
    expect(calledWith).not.toBe(payload.jti);
    expect(calledWith).toMatch(/^[a-f0-9]{64}$/); // SHA-256 hex
  });
});

// ---------------------------------------------------------------------------
// RefreshTokenUseCase — token rotation and revocation
// ---------------------------------------------------------------------------

describe("RefreshTokenUseCase", () => {
  let auth: AuthPort;
  let userRepo: UserRepository;
  let revokedTokenRepo: RevokedTokenChecker;
  let uc: RefreshTokenUseCase;

  beforeEach(() => {
    vi.clearAllMocks();
    auth = mockAuthPort();
    userRepo = mockUserRepo();
    revokedTokenRepo = mockRevokedTokenRepo();
    uc = new RefreshTokenUseCase(auth, userRepo, revokedTokenRepo);
  });

  it("returns a new token pair on valid refresh", async () => {
    const pair = await uc.execute("valid-refresh-token");
    expect(pair.accessToken).toBe("new-access");
    expect(pair.refreshToken).toBe("new-refresh");
  });

  it("revokes the old refresh JTI after rotation", async () => {
    await uc.execute("valid-refresh-token");
    expect(revokedTokenRepo.revoke).toHaveBeenCalledOnce();
  });

  it("throws UnauthorizedError when refresh token is expired", async () => {
    auth = mockAuthPort({
      verifyRefreshToken: vi
        .fn()
        .mockRejectedValue(new UnauthorizedError("Refresh token expired")),
    });
    uc = new RefreshTokenUseCase(auth, userRepo, revokedTokenRepo);

    await expect(uc.execute("expired-refresh")).rejects.toThrow(UnauthorizedError);
  });

  it("throws when refresh token JTI is already revoked (replay attack)", async () => {
    revokedTokenRepo = mockRevokedTokenRepo({
      isRevoked: vi.fn().mockResolvedValue(true),
    } as Partial<RevokedTokenChecker>);
    uc = new RefreshTokenUseCase(auth, userRepo, revokedTokenRepo);

    await expect(uc.execute("replayed-refresh")).rejects.toThrow(UnauthorizedError);
  });

  it("throws when the associated user no longer exists", async () => {
    userRepo = {
      ...mockUserRepo(),
      findById: vi.fn().mockResolvedValue(null),
    };
    uc = new RefreshTokenUseCase(auth, userRepo, revokedTokenRepo);

    await expect(uc.execute("valid-refresh-token")).rejects.toThrow();
  });
});
