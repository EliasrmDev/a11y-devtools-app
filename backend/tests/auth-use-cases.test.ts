import { describe, it, expect, vi, beforeEach } from "vitest";
import { RefreshTokenUseCase } from "../src/application/use-cases/auth/refresh-token.use-case.js";
import type { RevokedTokenChecker } from "../src/application/use-cases/auth/refresh-token.use-case.js";
import { VerifyTokenUseCase } from "../src/application/use-cases/auth/verify-token.use-case.js";
import { LogoutUseCase } from "../src/application/use-cases/auth/logout.use-case.js";
import { LoginUseCase } from "../src/application/use-cases/auth/login.use-case.js";
import type { AuthPort, ExternalAuthResult } from "../src/domain/ports/auth.port.js";
import type { UserRepository } from "../src/domain/ports/user.repository.js";
import type { AuditRepository } from "../src/domain/ports/audit.repository.js";
import type { JwtPayload, TokenPair } from "../src/shared/types.js";
import { UnauthorizedError } from "../src/domain/errors/index.js";

// --- Mocks ---

function mockAuthPort(overrides: Partial<AuthPort> = {}): AuthPort {
  return {
    verifyExternalToken: vi.fn().mockResolvedValue({
      externalId: "ext-1",
      provider: "clerk",
      email: "test@example.com",
      displayName: "Test User",
      avatarUrl: null,
      emailVerified: true,
    } satisfies ExternalAuthResult),
    createTokenPair: vi.fn().mockResolvedValue({
      accessToken: "access-tok",
      refreshToken: "refresh-tok",
      expiresIn: 900,
    } satisfies TokenPair),
    verifyAccessToken: vi.fn().mockResolvedValue({
      sub: "user-1",
      email: "test@example.com",
      role: "user",
      jti: "jti-abc",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      aud: "a11y-devtools-ext",
    } satisfies JwtPayload),
    verifyRefreshToken: vi.fn().mockResolvedValue({
      sub: "user-1",
      email: "",
      role: "user",
      jti: "refresh-jti-abc",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800,
      aud: "a11y-devtools-ext",
    } satisfies JwtPayload),
    ...overrides,
  };
}

function mockUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
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
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation((data) =>
      Promise.resolve({
        id: "user-1",
        email: data.email,
        displayName: data.displayName ?? null,
        avatarUrl: data.avatarUrl ?? null,
        role: data.role ?? "user",
        emailVerifiedAt: data.emailVerifiedAt ?? null,
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    ),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    hardDelete: vi.fn(),
    list: vi.fn(),
    ...overrides,
  };
}

function mockAuditRepo(): AuditRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByUser: vi.fn().mockResolvedValue([]),
    findAll: vi.fn().mockResolvedValue({ data: [], total: 0 }),
    nullifyUser: vi.fn().mockResolvedValue(0),
  };
}

function mockTokenChecker(overrides: Partial<RevokedTokenChecker> = {}): RevokedTokenChecker {
  return {
    isRevoked: vi.fn().mockResolvedValue(false),
    revoke: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  };
}

// --- Tests ---

describe("LoginUseCase", () => {
  let auth: AuthPort;
  let users: UserRepository;
  let audit: AuditRepository;

  beforeEach(() => {
    auth = mockAuthPort();
    users = mockUserRepo();
    audit = mockAuditRepo();
  });

  it("should create a new user on first login", async () => {
    const uc = new LoginUseCase(auth, users, audit);
    const result = await uc.execute("external-token", { ipAddress: "1.2.3.4" });

    expect(auth.verifyExternalToken).toHaveBeenCalledWith("external-token");
    expect(users.findByEmail).toHaveBeenCalledWith("test@example.com");
    expect(users.create).toHaveBeenCalled();
    expect(auth.createTokenPair).toHaveBeenCalled();
    expect(result.accessToken).toBe("access-tok");
    expect(result.user.email).toBe("test@example.com");
  });

  it("should return existing user on subsequent login", async () => {
    users = mockUserRepo({
      findByEmail: vi.fn().mockResolvedValue({
        id: "existing-user",
        email: "test@example.com",
        displayName: "Test User",
        avatarUrl: null,
        role: "user",
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    });

    const uc = new LoginUseCase(auth, users, audit);
    const result = await uc.execute("external-token", {});

    expect(users.create).not.toHaveBeenCalled();
    expect(result.user.id).toBe("existing-user");
  });

  it("should audit the login event", async () => {
    const uc = new LoginUseCase(auth, users, audit);
    await uc.execute("token", { ipAddress: "10.0.0.1", userAgent: "test-agent" });

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.login",
        ipAddress: "10.0.0.1",
        userAgent: "test-agent",
      }),
    );
  });

  it("should propagate auth verification errors", async () => {
    auth = mockAuthPort({
      verifyExternalToken: vi.fn().mockRejectedValue(
        new UnauthorizedError("Invalid token"),
      ),
    });
    const uc = new LoginUseCase(auth, users, audit);

    await expect(uc.execute("bad-token", {})).rejects.toThrow(
      UnauthorizedError,
    );
  });
});

describe("VerifyTokenUseCase", () => {
  it("should verify a valid, non-revoked token", async () => {
    const auth = mockAuthPort();
    const checker = mockTokenChecker();
    const uc = new VerifyTokenUseCase(auth, checker);

    const payload = await uc.execute("valid-token");

    expect(auth.verifyAccessToken).toHaveBeenCalledWith("valid-token");
    expect(checker.isRevoked).toHaveBeenCalled();
    expect(payload.sub).toBe("user-1");
  });

  it("should throw UnauthorizedError for revoked token", async () => {
    const auth = mockAuthPort();
    const checker = mockTokenChecker({
      isRevoked: vi.fn().mockResolvedValue(true),
    });
    const uc = new VerifyTokenUseCase(auth, checker);

    await expect(uc.execute("revoked-token")).rejects.toThrow(
      "Token has been revoked",
    );
  });

  it("should throw when JWT verification fails", async () => {
    const auth = mockAuthPort({
      verifyAccessToken: vi.fn().mockRejectedValue(
        new UnauthorizedError("expired"),
      ),
    });
    const checker = mockTokenChecker();
    const uc = new VerifyTokenUseCase(auth, checker);

    await expect(uc.execute("expired-token")).rejects.toThrow(
      UnauthorizedError,
    );
    expect(checker.isRevoked).not.toHaveBeenCalled();
  });
});

describe("RefreshTokenUseCase", () => {
  it("should rotate tokens successfully", async () => {
    const auth = mockAuthPort();
    const users = mockUserRepo();
    const checker = mockTokenChecker();
    const uc = new RefreshTokenUseCase(auth, users, checker);

    const result = await uc.execute("refresh-tok");

    expect(auth.verifyRefreshToken).toHaveBeenCalledWith("refresh-tok");
    expect(checker.isRevoked).toHaveBeenCalled();
    expect(checker.revoke).toHaveBeenCalledWith(
      expect.any(String), // sha256(jti)
      "user-1",
      "refresh_rotation",
      expect.any(Date),
    );
    expect(auth.createTokenPair).toHaveBeenCalled();
    expect(result.accessToken).toBe("access-tok");
  });

  it("should reject revoked refresh token", async () => {
    const auth = mockAuthPort();
    const users = mockUserRepo();
    const checker = mockTokenChecker({
      isRevoked: vi.fn().mockResolvedValue(true),
    });
    const uc = new RefreshTokenUseCase(auth, users, checker);

    await expect(uc.execute("revoked-refresh")).rejects.toThrow(
      "Refresh token has been revoked",
    );
  });

  it("should reject if user no longer exists", async () => {
    const auth = mockAuthPort();
    const users = mockUserRepo({
      findById: vi.fn().mockResolvedValue(null),
    });
    const checker = mockTokenChecker();
    const uc = new RefreshTokenUseCase(auth, users, checker);

    await expect(uc.execute("refresh-tok")).rejects.toThrow(
      "User not found",
    );
  });
});

describe("LogoutUseCase", () => {
  it("should revoke the access token and audit", async () => {
    const checker = mockTokenChecker();
    const audit = mockAuditRepo();
    const uc = new LogoutUseCase(checker, audit);

    const payload: JwtPayload = {
      sub: "user-1",
      email: "test@example.com",
      role: "user",
      jti: "jti-xyz",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      aud: "a11y-devtools-ext",
    };

    await uc.execute(payload, { ipAddress: "1.2.3.4" });

    expect(checker.revoke).toHaveBeenCalledWith(
      expect.any(String), // sha256("jti-xyz")
      "user-1",
      "logout",
      expect.any(Date),
    );
    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({ action: "user.logout" }),
    );
  });
});
