import { Hono } from "hono";
import type { CloudflareBindings } from "./env.js";
import { parseEnv } from "./env.js";

// Middleware
import { corsMiddleware } from "./adapters/middleware/cors.middleware.js";
import { requestIdMiddleware } from "./adapters/middleware/request-id.middleware.js";
import { loggingMiddleware } from "./adapters/middleware/logging.middleware.js";
import { errorMiddleware } from "./adapters/middleware/error.middleware.js";
import { authMiddleware } from "./adapters/middleware/auth.middleware.js";

// Routes
import { createHealthRoutes } from "./adapters/routes/health.routes.js";
import { createAuthRoutes } from "./adapters/routes/auth.routes.js";
import { createProviderRoutes } from "./adapters/routes/providers.routes.js";
import { createProxyRoutes } from "./adapters/routes/proxy.routes.js";
import { createUserRoutes } from "./adapters/routes/users.routes.js";
import { createAdminRoutes } from "./adapters/routes/admin.routes.js";
import { createAccessibilityRoutes } from "./adapters/routes/accessibility.routes.js";
import { createMetricsRoutes } from "./adapters/routes/metrics.routes.js";

// Infrastructure
import { createDb } from "./infrastructure/db/client.js";
import { EnvelopeEncryption } from "./infrastructure/crypto/envelope-encryption.js";
import { createAuthAdapter } from "./infrastructure/auth/auth.factory.js";
import { ResendEmailAdapter } from "./infrastructure/email/resend.adapter.js";
import { JobQueue } from "./infrastructure/jobs/job-queue.js";

// Repositories
import { UserRepositoryImpl } from "./infrastructure/db/repositories/user.repository.impl.js";
import { ProviderRepositoryImpl } from "./infrastructure/db/repositories/provider.repository.impl.js";
import { SecretRepositoryImpl } from "./infrastructure/db/repositories/secret.repository.impl.js";
import { AuditRepositoryImpl } from "./infrastructure/db/repositories/audit.repository.impl.js";
import { UsageRepositoryImpl } from "./infrastructure/db/repositories/usage.repository.impl.js";
import { RevokedTokenRepositoryImpl } from "./infrastructure/db/repositories/revoked-token.repository.impl.js";
import { DeletionRequestRepositoryImpl } from "./infrastructure/db/repositories/deletion-request.repository.impl.js";

// Use cases — Auth
import { LoginUseCase } from "./application/use-cases/auth/login.use-case.js";
import { RefreshTokenUseCase } from "./application/use-cases/auth/refresh-token.use-case.js";
import { LogoutUseCase } from "./application/use-cases/auth/logout.use-case.js";
import { VerifyTokenUseCase } from "./application/use-cases/auth/verify-token.use-case.js";

// Use cases — Providers
import { CreateConnectionUseCase } from "./application/use-cases/providers/create-connection.use-case.js";
import { ListConnectionsUseCase } from "./application/use-cases/providers/list-connections.use-case.js";
import { UpdateConnectionUseCase } from "./application/use-cases/providers/update-connection.use-case.js";
import { DeleteConnectionUseCase } from "./application/use-cases/providers/delete-connection.use-case.js";
import { TestConnectionUseCase } from "./application/use-cases/providers/test-connection.use-case.js";
import { ListModelsUseCase } from "./application/use-cases/providers/list-models.use-case.js";

// Use cases — Proxy
import { AiProxyUseCase } from "./application/use-cases/proxy/ai-proxy.use-case.js";
import { SuggestAccessibilityUseCase } from "./application/use-cases/accessibility/suggest-accessibility.use-case.js";

// Use cases — Users
import { GetProfileUseCase } from "./application/use-cases/users/get-profile.use-case.js";
import { UpdateProfileUseCase } from "./application/use-cases/users/update-profile.use-case.js";
import { RequestDeletionUseCase, CancelDeletionUseCase } from "./application/use-cases/users/request-deletion.use-case.js";
import { ExportDataUseCase } from "./application/use-cases/users/export-data.use-case.js";

// Use cases — Admin
import { ListUsersUseCase } from "./application/use-cases/admin/list-users.use-case.js";
import { ManageModelsUseCase } from "./application/use-cases/admin/manage-models.use-case.js";
import { ViewAuditLogUseCase } from "./application/use-cases/admin/view-audit-log.use-case.js";
import { BlockUserUseCase } from "./application/use-cases/admin/block-user.use-case.js";
import { GetAdminStatsUseCase } from "./application/use-cases/admin/get-admin-stats.use-case.js";
import { ManageJobsUseCase } from "./application/use-cases/admin/manage-jobs.use-case.js";

export function createApp(env: CloudflareBindings) {
  const config = parseEnv(env as unknown as Record<string, unknown>);
  const allowedOrigins = config.ENVIRONMENT === "development"
    ? config.ALLOWED_ORIGINS_DEV.split(",").map((s) => s.trim())
    : config.ALLOWED_ORIGINS.split(",").map((s) => s.trim());

  // --- Infrastructure ---
  const db = createDb(config.DATABASE_URL);

  const crypto = new EnvelopeEncryption(config.KEK_CURRENT, config.KEK_VERSION);

  const authAdapter = createAuthAdapter(config);
  const emailAdapter = new ResendEmailAdapter(config.RESEND_API_KEY);

  // --- Repositories ---
  const userRepo = new UserRepositoryImpl(db);
  const providerRepo = new ProviderRepositoryImpl(db);
  const secretRepo = new SecretRepositoryImpl(db);
  const auditRepo = new AuditRepositoryImpl(db);
  const usageRepo = new UsageRepositoryImpl(db);
  const revokedTokenRepo = new RevokedTokenRepositoryImpl(db);
  const deletionRequestRepo = new DeletionRequestRepositoryImpl(db);

  // --- Use Cases ---
  const verifyTokenUC = new VerifyTokenUseCase(authAdapter, revokedTokenRepo);
  const loginUC = new LoginUseCase(authAdapter, userRepo, auditRepo);
  const refreshTokenUC = new RefreshTokenUseCase(authAdapter, userRepo, revokedTokenRepo);
  const logoutUC = new LogoutUseCase(revokedTokenRepo, auditRepo);

  const createConnectionUC = new CreateConnectionUseCase(providerRepo, secretRepo, crypto, auditRepo);
  const listConnectionsUC = new ListConnectionsUseCase(providerRepo);
  const updateConnectionUC = new UpdateConnectionUseCase(providerRepo, secretRepo, crypto, auditRepo);
  const deleteConnectionUC = new DeleteConnectionUseCase(providerRepo, auditRepo);
  const testConnectionUC = new TestConnectionUseCase(providerRepo, secretRepo, crypto, auditRepo);
  const listModelsUC = new ListModelsUseCase(providerRepo);

  const aiProxyUC = new AiProxyUseCase(providerRepo, secretRepo, crypto, usageRepo);
  const suggestAccessibilityUC = new SuggestAccessibilityUseCase(
    providerRepo,
    secretRepo,
    crypto,
    usageRepo,
    auditRepo,
  );

  const getProfileUC = new GetProfileUseCase(userRepo);
  const updateProfileUC = new UpdateProfileUseCase(userRepo, auditRepo);
  const requestDeletionUC = new RequestDeletionUseCase(userRepo, deletionRequestRepo, auditRepo, emailAdapter);
  const cancelDeletionUC = new CancelDeletionUseCase(userRepo, deletionRequestRepo, auditRepo);
  const exportDataUC = new ExportDataUseCase(userRepo, providerRepo, usageRepo, auditRepo);

  const listUsersUC = new ListUsersUseCase(userRepo);
  const manageModelsUC = new ManageModelsUseCase(providerRepo, auditRepo);
  const viewAuditLogUC = new ViewAuditLogUseCase(auditRepo);
  const blockUserUC = new BlockUserUseCase(userRepo, auditRepo);
  const getAdminStatsUC = new GetAdminStatsUseCase(db);
  const jobQueue = new JobQueue(db);
  const manageJobsUC = new ManageJobsUseCase(jobQueue, auditRepo);

  // --- Hono App ---
  const app = new Hono<{ Bindings: CloudflareBindings }>();

  // Global middleware
  app.use("*", requestIdMiddleware);
  app.use("*", corsMiddleware(allowedOrigins));
  app.use("*", errorMiddleware);
  app.use("*", loggingMiddleware);

  // Public routes
  app.route("/health", createHealthRoutes());
  app.route(
    "/auth",
    createAuthRoutes({
      login: loginUC,
      refresh: refreshTokenUC,
      logout: logoutUC,
      verifyToken: verifyTokenUC,
    }),
  );

  // Protected routes — apply auth middleware
  const protectedApp = new Hono<{ Bindings: CloudflareBindings }>();
  protectedApp.use(
    "*",
    authMiddleware((token) => verifyTokenUC.execute(token)),
  );

  protectedApp.route(
    "/providers",
    createProviderRoutes({
      create: createConnectionUC,
      list: listConnectionsUC,
      update: updateConnectionUC,
      remove: deleteConnectionUC,
      testConnection: testConnectionUC,
      listModels: listModelsUC,
    }),
  );

  protectedApp.route(
    "/proxy",
    createProxyRoutes({ aiProxy: aiProxyUC }),
  );

  protectedApp.route(
    "/accessibility",
    createAccessibilityRoutes({ suggestAccessibility: suggestAccessibilityUC }),
  );

  protectedApp.route(
    "/metrics",
    createMetricsRoutes({ getStats: getAdminStatsUC }),
  );

  protectedApp.route(
    "/users",
    createUserRoutes({
      getProfile: getProfileUC,
      updateProfile: updateProfileUC,
      requestDeletion: requestDeletionUC,
      cancelDeletion: cancelDeletionUC,
      exportData: exportDataUC,
    }),
  );

  protectedApp.route(
    "/admin",
    createAdminRoutes({
      listUsers: listUsersUC,
      manageModels: manageModelsUC,
      viewAuditLog: viewAuditLogUC,
      blockUser: blockUserUC,
      getStats: getAdminStatsUC,
      manageJobs: manageJobsUC,
      userRepo,
      deletionRequestRepo,
      auditRepo,
    }),
  );

  // Mount protected routes under /api/v1
  app.route("/api/v1", protectedApp);

  return app;
}
