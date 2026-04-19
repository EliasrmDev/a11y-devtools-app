const API_BASE = import.meta.env.VITE_API_URL || "https://api.a11y.eliasrm.dev";

interface RequestOptions {
  method?: string;
  body?: unknown;
  params?: Record<string, string | number | undefined>;
}

class ApiError extends Error {
  status: number;
  constructor(
    status: number,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
  }
}

function getTokens() {
  const raw = localStorage.getItem("a11y_tokens");
  if (!raw) return null;
  try {
    return JSON.parse(raw) as {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  } catch {
    return null;
  }
}

function setTokens(tokens: {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}) {
  localStorage.setItem("a11y_tokens", JSON.stringify(tokens));
}

function clearTokens() {
  localStorage.removeItem("a11y_tokens");
}

async function refreshAccessToken(): Promise<string | null> {
  const tokens = getTokens();
  if (!tokens?.refreshToken) return null;

  try {
    const res = await fetch(`${API_BASE}/auth/refresh`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ refreshToken: tokens.refreshToken }),
    });

    if (!res.ok) {
      clearTokens();
      return null;
    }

    const data = await res.json();
    setTokens({
      accessToken: data.accessToken,
      refreshToken: data.refreshToken,
      expiresIn: data.expiresIn,
    });
    return data.accessToken;
  } catch {
    clearTokens();
    return null;
  }
}

async function apiFetch<T>(path: string, opts: RequestOptions = {}): Promise<T> {
  const { method = "GET", body, params } = opts;

  let url = `${API_BASE}${path}`;
  if (params) {
    const searchParams = new URLSearchParams();
    for (const [key, val] of Object.entries(params)) {
      if (val !== undefined) searchParams.set(key, String(val));
    }
    const qs = searchParams.toString();
    if (qs) url += `?${qs}`;
  }

  const tokens = getTokens();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
  };
  if (tokens?.accessToken) {
    headers["Authorization"] = `Bearer ${tokens.accessToken}`;
  }

  let res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  // Try refresh on 401
  if (res.status === 401 && tokens?.refreshToken) {
    const newToken = await refreshAccessToken();
    if (newToken) {
      headers["Authorization"] = `Bearer ${newToken}`;
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    }
  }

  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try {
      const json = JSON.parse(text);
      message = json.error || json.message || text;
    } catch {
      message = text;
    }
    throw new ApiError(res.status, message);
  }

  return res.json();
}

// ─── Auth ─────────────────────────────────────────────
export async function login(externalToken: string) {
  const data = await apiFetch<{
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
    user: { id: string; email: string; displayName: string | null; role: string };
  }>("/auth/login", {
    method: "POST",
    body: { token: externalToken },
  });
  setTokens({
    accessToken: data.accessToken,
    refreshToken: data.refreshToken,
    expiresIn: data.expiresIn,
  });
  return data;
}

export async function logout() {
  try {
    await apiFetch("/auth/logout", { method: "POST" });
  } finally {
    clearTokens();
  }
}

export { clearTokens, getTokens };

// ─── User ─────────────────────────────────────────────
export interface Profile {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  emailVerifiedAt: string | null;
  createdAt: string;
}

export function getProfile() {
  return apiFetch<Profile>("/api/v1/users/me");
}

export function updateProfile(data: { displayName?: string | null; avatarUrl?: string | null }) {
  return apiFetch<Profile>("/api/v1/users/me", { method: "PATCH", body: data });
}

export function requestDeletion() {
  return apiFetch<{ scheduledAt: string }>("/api/v1/users/me/deletion", { method: "POST" });
}

export function cancelDeletion() {
  return apiFetch<{ ok: boolean }>("/api/v1/users/me/deletion", { method: "DELETE" });
}

export interface ActiveDeletion {
  id: string;
  status: string;
  scheduledFor: string;
  requestedAt: string;
}

export function getDeletionStatus() {
  return apiFetch<{ deletion: ActiveDeletion | null }>("/api/v1/users/me/deletion");
}

export function exportData() {
  return apiFetch<unknown>("/api/v1/users/me/export");
}

// ─── Providers ────────────────────────────────────────
export interface Connection {
  id: string;
  providerType: string;
  displayName: string;
  baseUrl: string | null;
  hasCustomHeaders: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function listConnections() {
  return apiFetch<{ data: Connection[] }>("/api/v1/providers/connections");
}

export function createConnection(data: {
  providerType: string;
  displayName: string;
  apiKey: string;
  baseUrl?: string;
}) {
  return apiFetch<Connection>("/api/v1/providers/connections", { method: "POST", body: data });
}

export function updateConnection(
  id: string,
  data: { displayName?: string; apiKey?: string; baseUrl?: string | null; isActive?: boolean },
) {
  return apiFetch<Connection>(`/api/v1/providers/connections/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: data,
  });
}

export function deleteConnection(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/v1/providers/connections/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function testConnection(id: string) {
  return apiFetch<{ success: boolean; latencyMs?: number; error?: string }>(
    `/api/v1/providers/connections/${encodeURIComponent(id)}/test`,
    { method: "POST" },
  );
}

export interface ProviderModel {
  id: string;
  providerType: string;
  modelId: string;
  displayName: string;
  isEnabled: boolean;
  capabilities?: string[];
}

export function listModels(providerType?: string, enabledOnly = true) {
  return apiFetch<{ data: ProviderModel[] }>("/api/v1/providers/models", {
    params: { providerType, enabledOnly: enabledOnly ? "true" : "false" },
  });
}

// ─── Admin ────────────────────────────────────────────
export interface AdminUser {
  id: string;
  email: string;
  displayName: string | null;
  avatarUrl: string | null;
  role: string;
  emailVerifiedAt: string | null;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  isBlocked: boolean;
  deletionScheduledAt: string | null;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
}

export function adminListUsers(params?: { page?: number; limit?: number; role?: string }) {
  return apiFetch<PaginatedResult<AdminUser>>("/api/v1/admin/users", { params });
}

export function adminGetUser(id: string) {
  return apiFetch<AdminUser>(`/api/v1/admin/users/${encodeURIComponent(id)}`);
}

export function adminBlockUser(id: string, reason?: string) {
  return apiFetch<{ ok: boolean }>(`/api/v1/admin/users/${encodeURIComponent(id)}/block`, {
    method: "POST",
    body: { reason: reason || "Blocked by admin" },
  });
}

export function adminUnblockUser(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/v1/admin/users/${encodeURIComponent(id)}/unblock`, {
    method: "POST",
  });
}

export function adminDeleteUser(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/v1/admin/users/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export function adminListModels() {
  return apiFetch<{ data: ProviderModel[] }>("/api/v1/admin/models");
}

export function adminCreateModel(data: {
  providerType: string;
  modelId: string;
  displayName: string;
  capabilities?: string[];
  isAvailable?: boolean;
}) {
  return apiFetch<ProviderModel>("/api/v1/admin/models", { method: "POST", body: data });
}

export function adminToggleModel(id: string, enabled: boolean) {
  return apiFetch<{ ok: boolean }>(`/api/v1/admin/models/${encodeURIComponent(id)}`, {
    method: "PATCH",
    body: { enabled },
  });
}

export function adminDeleteModel(id: string) {
  return apiFetch<{ ok: boolean }>(`/api/v1/admin/models/${encodeURIComponent(id)}`, {
    method: "DELETE",
  });
}

export interface AuditEntry {
  id: string;
  userId: string;
  actorId?: string;
  actorEmail?: string;
  action: string;
  resourceType: string;
  resourceId: string | null;
  targetId?: string | null;
  ipAddress: string | null;
  userAgent: string | null;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export function adminGetAuditLog(params?: {
  page?: number;
  limit?: number;
  action?: string;
  resourceType?: string;
  since?: string;
  until?: string;
}) {
  return apiFetch<PaginatedResult<AuditEntry>>("/api/v1/admin/audit", { params });
}

export interface Job {
  id: string;
  name: string;
  status: string;
  lastRunAt: string | null;
  nextRunAt: string | null;
  schedule?: string;
  lastError?: string;
  failCount: number;
}

export function adminListJobs(params?: { name?: string; status?: string }) {
  return apiFetch<{ data: Job[] }>("/api/v1/admin/jobs", { params });
}

export function adminRunJob(name: string) {
  return apiFetch<{ ok: boolean; job: string }>("/api/v1/admin/jobs/run", {
    method: "POST",
    body: { name },
  });
}

export function adminPurgeJobs(keepLast = 7) {
  return apiFetch<{ ok: boolean; deleted: number; keepLast: number }>("/api/v1/admin/jobs/purge", {
    method: "POST",
    body: { keepLast },
  });
}

export interface AdminStats {
  totalUsers: number;
  activeUsers: number;
  activeModels: number;
  blockedUsers: number;
  totalConnections: number;
  totalRequests: number;
  requestsToday?: number;
}

export function adminGetStats() {
  return apiFetch<AdminStats>("/api/v1/admin/stats");
}

// ─── Deletion Requests ────────────────────────────────
export interface DeletionRequest {
  id: string;
  userId: string;
  userEmail: string | null;
  userDisplayName: string | null;
  status: "pending" | "processing" | "completed" | "failed" | "cancelled";
  requestedAt: string;
  scheduledFor: string;
  completedAt: string | null;
  processedTables: Record<string, boolean> | null;
  errorDetails: string | null;
}

export function adminListDeletionRequests(params?: {
  page?: number;
  limit?: number;
  status?: string;
}) {
  return apiFetch<PaginatedResult<DeletionRequest>>("/api/v1/admin/deletion-requests", { params });
}

export function adminExecuteDeletion(id: string) {
  return apiFetch<{ ok: boolean; message: string }>(
    `/api/v1/admin/deletion-requests/${encodeURIComponent(id)}/execute`,
    { method: "POST" },
  );
}

export function adminCancelDeletion(id: string) {
  return apiFetch<{ ok: boolean }>(
    `/api/v1/admin/deletion-requests/${encodeURIComponent(id)}/cancel`,
    { method: "DELETE" },
  );
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

export async function adminFetchMetrics(format: "json" | "prometheus"): Promise<string> {
  const url = `${API_BASE}/api/v1/metrics${format === "prometheus" ? "?format=prometheus" : ""}`;
  const tokens = getTokens();
  const headers: Record<string, string> = {};
  if (tokens?.accessToken) headers["Authorization"] = `Bearer ${tokens.accessToken}`;

  const res = await fetch(url, { headers });
  if (!res.ok) {
    const text = await res.text();
    let message: string;
    try { message = (JSON.parse(text) as { error?: string }).error ?? text; } catch { message = text; }
    throw new ApiError(res.status, message);
  }
  return res.text();
}
