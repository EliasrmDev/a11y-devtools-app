import { describe, it, expect, vi, beforeEach } from "vitest";
import { LoginUseCase } from "../src/application/use-cases/auth/login.use-case.js";
import type { AuthPort, ExternalAuthResult } from "../src/domain/ports/auth.port.js";
import type { UserRepository } from "../src/domain/ports/user.repository.js";
import type { AuditRepository } from "../src/domain/ports/audit.repository.js";
import type { Database } from "../src/infrastructure/db/client.js";
import type { JwtPayload, TokenPair } from "../src/shared/types.js";

// --- Helpers ---

function mockAuthPort(overrides: Partial<AuthPort> = {}): AuthPort {
  return {
    verifyExternalToken: vi.fn().mockResolvedValue({
      externalId: "neon-uuid-123",
      provider: "neon-auth",
      email: "alice@example.com",
      displayName: "Alice",
      avatarUrl: "https://avatar.example.com/alice.png",
      emailVerified: true,
    } satisfies ExternalAuthResult),
    createTokenPair: vi.fn().mockResolvedValue({
      accessToken: "access-tok",
      refreshToken: "refresh-tok",
      expiresIn: 900,
    } satisfies TokenPair),
    verifyAccessToken: vi.fn().mockResolvedValue({
      sub: "neon-uuid-123",
      email: "alice@example.com",
      role: "user",
      jti: "jti-abc",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 900,
      aud: "a11y-devtools-ext",
    } satisfies JwtPayload),
    verifyRefreshToken: vi.fn().mockResolvedValue({
      sub: "neon-uuid-123",
      email: "",
      role: "user",
      jti: "r-jti",
      iat: Math.floor(Date.now() / 1000),
      exp: Math.floor(Date.now() / 1000) + 604800,
      aud: "a11y-devtools-ext",
    } satisfies JwtPayload),
    ...overrides,
  };
}

function mockUserRepo(overrides: Partial<UserRepository> = {}): UserRepository {
  return {
    findById: vi.fn().mockResolvedValue(null),
    findByEmail: vi.fn().mockResolvedValue(null),
    create: vi.fn().mockImplementation(async (data) => ({
      id: data.id ?? "generated-uuid",
      email: data.email,
      displayName: data.displayName ?? null,
      avatarUrl: data.avatarUrl ?? null,
      role: data.role ?? "user",
      emailVerifiedAt: data.emailVerifiedAt ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
      deletedAt: null,
    })),
    update: vi.fn(),
    softDelete: vi.fn(),
    restore: vi.fn(),
    hardDelete: vi.fn(),
    list: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, hasMore: false }),
    ...overrides,
  };
}

function mockAuditRepo(): AuditRepository {
  return {
    create: vi.fn().mockResolvedValue(undefined),
    findByUser: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, hasMore: false }),
    list: vi.fn().mockResolvedValue({ data: [], total: 0, page: 1, limit: 20, hasMore: false }),
  };
}

function mockDatabase(): Database {
  return {
    insert: vi.fn(() => ({
      values: vi.fn(() => ({
        onConflictDoUpdate: vi.fn().mockResolvedValue(undefined)
      }))
    })),
    update: vi.fn(),
    delete: vi.fn(),
    select: vi.fn(),
    execute: vi.fn(),
  } as any;
}

// --- Tests ---

describe("Neon Auth — LoginUseCase", () => {
  let auth: AuthPort;
  let users: UserRepository;
  let audit: AuditRepository;
  let db: Database;

  beforeEach(() => {
    auth = mockAuthPort();
    users = mockUserRepo();
    audit = mockAuditRepo();
    db = mockDatabase();
  });

  it("creates a new user with the Neon Auth user ID", async () => {
    const uc = new LoginUseCase(auth, users, audit, db);
    const result = await uc.execute("neon-jwt-token", {});

    // findByEmail returns null → create is called
    expect(users.create).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "neon-uuid-123",
        email: "alice@example.com",
        displayName: "Alice",
        avatarUrl: "https://avatar.example.com/alice.png",
      }),
    );
    expect(result.accessToken).toBe("access-tok");
    expect(result.user.id).toBe("neon-uuid-123");
  });

  it("does NOT pass id for non-neon-auth providers", async () => {
    auth = mockAuthPort({
      verifyExternalToken: vi.fn().mockResolvedValue({
        externalId: "clerk-ext-id",
        provider: "clerk",
        email: "bob@example.com",
        displayName: "Bob",
        avatarUrl: null,
        emailVerified: true,
      }),
    });

    const uc = new LoginUseCase(auth, users, audit, db);
    await uc.execute("clerk-jwt-token", {});

    const createCall = (users.create as ReturnType<typeof vi.fn>).mock.calls[0]?.[0];
    expect(createCall).not.toHaveProperty("id");
    expect(createCall.email).toBe("bob@example.com");
  });

  it("re-uses existing user when email already exists", async () => {
    users = mockUserRepo({
      findByEmail: vi.fn().mockResolvedValue({
        id: "existing-user-id",
        email: "alice@example.com",
        displayName: "Alice",
        role: "user",
        avatarUrl: null,
        emailVerifiedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
        deletedAt: null,
      }),
    });

    const uc = new LoginUseCase(auth, users, audit, db);
    const result = await uc.execute("neon-jwt-token", {});

    expect(users.create).not.toHaveBeenCalled();
    expect(result.user.id).toBe("existing-user-id");
  });

  it("records audit log with neon-auth provider", async () => {
    const uc = new LoginUseCase(auth, users, audit, db);
    await uc.execute("neon-jwt-token", { ipAddress: "1.2.3.4", userAgent: "test" });

    expect(audit.create).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "user.login",
        metadata: { provider: "neon-auth" },
      }),
    );
  });
});
