import { useEffect, useState, useCallback } from "react";
import {
  listConnections,
  createConnection,
  deleteConnection,
  testConnection,
  listConnectionModels,
  updateConnection,
  type Connection,
  type ConnectionModel,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Plus,
  Trash2,
  TestTube,
  Power,
  PowerOff,
  Loader2,
  ChevronDown,
  ChevronRight,
  CheckCircle,
  XCircle,
  Clock,
  AlertTriangle,
  X,
} from "lucide-react";

/** Extracts the first 3-digit HTTP status code from a raw error prefix like "Gemini returned 429:". */
function extractPrefixStatus(raw: string): number | null {
  const m = raw.match(/\b(\d{3})\b/);
  return m ? parseInt(m[1], 10) : null;
}

/** Extracts "code" and "message" field values from a potentially truncated/malformed JSON string
 *  by using targeted regex instead of full JSON.parse. Handles strings like:
 *  "Gemini returned 429: {\n  \"error\": {\n    \"code\": 429,\n    \"message\": \"...(truncated)" */
function extractFieldsFromMalformedJson(fragment: string): { code: number | null; message: string | null } {
  const codeMatch = fragment.match(/"code"\s*:\s*(\d+)/);
  const messageMatch = fragment.match(/"message"\s*:\s*"((?:[^"\\]|\\.)*)(?:"|$)/s);
  return {
    code: codeMatch ? parseInt(codeMatch[1], 10) : null,
    message: messageMatch ? messageMatch[1].replace(/\\n/g, "\n").replace(/\\"/g, '"') : null,
  };
}

/** Normalizes backend error strings like "Gemini returned 429: {...}" into a friendly shape.
 *  Handles both well-formed and truncated/malformed embedded JSON. */
function parseProviderError(raw: string): { status: number | null; message: string } {
  const jsonStart = raw.indexOf("{");

  // Branch 1: no embedded JSON — return text after first ":"
  if (jsonStart === -1) {
    const colonIdx = raw.indexOf(":");
    const message = colonIdx !== -1 ? raw.slice(colonIdx + 1).trim() : raw;
    return { status: extractPrefixStatus(raw), message: message || raw };
  }

  const jsonFragment = raw.slice(jsonStart);

  // Branch 2: well-formed JSON — parse normally
  try {
    const parsed = JSON.parse(jsonFragment) as {
      error?: { code?: number; message?: string };
      message?: string;
    };
    const status = parsed?.error?.code ?? extractPrefixStatus(raw) ?? null;
    const message = (parsed?.error?.message ?? parsed?.message ?? raw).trim();
    return { status, message };
  } catch {
    // Branch 3: truncated / malformed JSON — extract fields with regex
    const { code, message } = extractFieldsFromMalformedJson(jsonFragment);
    const status = code ?? extractPrefixStatus(raw);
    return { status, message: message ?? raw };
  }
}

/** Splits a string into text and clickable anchor elements for any http(s) URLs found. */
function renderWithLinks(text: string): React.ReactNode[] {
  const URL_RE = /https?:\/\/[^\s"')\}\]]+/g;
  const parts: React.ReactNode[] = [];
  let last = 0;
  let match: RegExpExecArray | null;
  while ((match = URL_RE.exec(text)) !== null) {
    if (match.index > last) parts.push(text.slice(last, match.index));
    const url = match[0];
    parts.push(
      <a
        key={match.index}
        href={url}
        target="_blank"
        rel="noopener noreferrer"
        className="underline text-primary break-all hover:opacity-75"
      >
        {url}
      </a>
    );
    last = match.index + url.length;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}

const STATUS_LABELS: Record<number, string> = {
  400: "Bad Request",
  401: "Unauthorized — check your API key",
  403: "Forbidden",
  404: "Model not found",
  422: "Unprocessable request",
  429: "Rate limit / quota exceeded",
  500: "Provider server error",
  503: "Provider unavailable",
};

function ModelErrorBadge({ error }: { error: string }) {
  const [visible, setVisible] = useState(true);
  const { status, message } = parseProviderError(error);
  const statusLabel = status ? (STATUS_LABELS[status] ?? `HTTP ${status}`) : null;

  // Reset visibility whenever the error value changes (new test run)
  useEffect(() => {
    setVisible(true);
  }, [error]);

  // Auto-dismiss after 10 s
  useEffect(() => {
    if (!visible) return;
    const timer = setTimeout(() => setVisible(false), 100_000);
    return () => clearTimeout(timer);
  }, [visible]);

  return (
    <div className="relative">
      {/* Trigger / collapsed badge */}
      <button
        className="flex items-center gap-1 text-xs text-critical"
        onClick={() => setVisible((v) => !v)}
        title={visible ? undefined : "Click to see error details"}
      >
        <AlertTriangle className="h-3 w-3 shrink-0" />
        <span className="font-medium">{statusLabel ?? "Error"}</span>
      </button>

      {/* Floating panel */}
      {visible && (
        <div className="absolute bg-black bottom-full right-0 mb-2 z-50 rounded-[8px] border border-critical/30 bg-surface-1 shadow-xl shadow-black/20">
          {/* Header */}
          <div className="flex items-center justify-between gap-2 border-b border-critical/20 px-3 py-2">
            <div className="flex items-center gap-1.5 min-w-0">
              <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-critical" />
              {status && (
                <span className="font-mono text-xs font-bold text-critical">{status}</span>
              )}
              {statusLabel && (
                <span className="text-xs font-semibold text-critical truncate">{statusLabel}</span>
              )}
            </div>
            <button
              onClick={() => setVisible(false)}
              className="shrink-0 rounded p-1.5 text-sub hover:text-text hover:bg-surface-3 transition-colors"
              title="Dismiss"
            >
              <X className="h-3 w-3" />
            </button>
          </div>
          {/* Body */}
          <p className="px-3 py-2.5 text-xs text-sub break-words leading-relaxed">{renderWithLinks(message)}</p>
        </div>
      )}
    </div>
  );
}

function ModelsErrorPanel({ error }: { error: string }) {
  const { status, message } = parseProviderError(error);
  const statusLabel = status ? (STATUS_LABELS[status] ?? `HTTP ${status}`) : null;
  return (
    <div className="flex items-start gap-2 rounded-[6px] border border-critical/30 bg-critical/5 px-3 py-2.5">
      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-critical" />
      <div className="min-w-0">
        {statusLabel && (
          <p className="text-xs font-semibold text-critical">{statusLabel}</p>
        )}
        <p className="text-xs text-critical/80 break-words">{renderWithLinks(message)}</p>
      </div>
    </div>
  );
}

const PROVIDER_OPTIONS = [
  { value: "openai",     label: "OpenAI",               free: false, hint: "GPT-4o, o1, etc." },
  { value: "anthropic",  label: "Anthropic",             free: false, hint: "Claude 3.x / Sonnet" },
  { value: "openrouter", label: "OpenRouter",            free: true,  hint: "Most flexible — 200+ models, some free" },
  { value: "gemini",     label: "Google Gemini",         free: true,  hint: "Best free option overall" },
  { value: "groq",       label: "Groq",                  free: true,  hint: "Best performance and speed" },
  { value: "custom",     label: "Custom / Self-hosted",  free: false, hint: "Any OpenAI-compatible endpoint" },
] as const;

type ProviderValue = typeof PROVIDER_OPTIONS[number]["value"];

const FREE_PROVIDERS = new Set<string>(["openrouter", "gemini", "groq"]);

const API_KEY_LINKS: Record<string, { label: string; url: string }> = {
  gemini:     { label: "Get free API key", url: "https://aistudio.google.com/app/apikey" },
  groq:       { label: "Get free API key", url: "https://console.groq.com/keys" },
  openrouter: { label: "Get API key", url: "https://openrouter.ai/keys" },
  openai:    { label: "Get API key", url: "https://platform.openai.com/api-keys" },
  anthropic: { label: "Get API key", url: "https://platform.claude.com/settings/keys" },
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; latencyMs?: number; error?: string }>>({});

  // Accordion state per connection
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [models, setModels] = useState<Record<string, ConnectionModel[]>>({});
  const [modelsLoading, setModelsLoading] = useState<Record<string, boolean>>({});
  const [modelsError, setModelsError] = useState<Record<string, string>>({});
  // per-model test state: key = `${connId}:${modelId}`
  const [modelTesting, setModelTesting] = useState<Record<string, boolean>>({});
  const [modelTestResult, setModelTestResult] = useState<Record<string, { success: boolean; latencyMs?: number; error?: string }>>({});

  const [form, setForm] = useState({
    providerType: "openai" as ProviderValue,
    displayName: "",
    apiKey: "",
    baseUrl: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await listConnections();
      setConnections(r.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await createConnection({
        providerType: form.providerType,
        displayName: form.displayName,
        apiKey: form.apiKey,
        ...(form.baseUrl ? { baseUrl: form.baseUrl } : {}),
      });
      setShowCreate(false);
      setForm({ providerType: "openai", displayName: "", apiKey: "", baseUrl: "" });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create connection");
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this connection?")) return;
    await deleteConnection(id);
    refresh();
  };

  const handleTest = async (id: string) => {
    setTesting(id);
    try {
      const r = await testConnection(id);
      setTestResult((prev) => ({ ...prev, [id]: r }));
    } catch (err) {
      setTestResult((prev) => ({
        ...prev,
        [id]: { success: false, error: err instanceof Error ? err.message : "Test failed" },
      }));
    } finally {
      setTesting(null);
    }
  };

  const handleToggle = async (conn: Connection) => {
    await updateConnection(conn.id, { isActive: !conn.isActive });
    refresh();
  };

  const handleToggleAccordion = async (connId: string) => {
    const nowOpen = !expanded[connId];
    setExpanded((prev) => ({ ...prev, [connId]: nowOpen }));
    if (nowOpen && !models[connId]) {
      setModelsLoading((prev) => ({ ...prev, [connId]: true }));
      setModelsError((prev) => ({ ...prev, [connId]: "" }));
      try {
        const r = await listConnectionModels(connId);
        setModels((prev) => ({ ...prev, [connId]: r.data }));
      } catch (err) {
        setModelsError((prev) => ({
          ...prev,
          [connId]: err instanceof Error ? err.message : "Failed to load models",
        }));
      } finally {
        setModelsLoading((prev) => ({ ...prev, [connId]: false }));
      }
    }
  };

  const handleTestModel = async (connId: string, modelId: string) => {
    const key = `${connId}:${modelId}`;
    setModelTesting((prev) => ({ ...prev, [key]: true }));
    try {
      const r = await testConnection(connId, modelId);
      setModelTestResult((prev) => ({ ...prev, [key]: r }));
    } catch (err) {
      setModelTestResult((prev) => ({
        ...prev,
        [key]: { success: false, error: err instanceof Error ? err.message : "Test failed" },
      }));
    } finally {
      setModelTesting((prev) => ({ ...prev, [key]: false }));
    }
  };

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Connections</h1>
          <p className="mt-1 text-sub">Manage your AI provider connections.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Add Connection
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sub" />
        </div>
      ) : connections.length === 0 ? (
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-sub">No connections yet. Add your first AI provider.</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-4">
          {connections.map((conn) => (
            <Card key={conn.id}>
              {/* ── Connection header row ── */}
              <CardContent className="flex items-center justify-between">
                <button
                  className="flex items-center gap-3 flex-1 text-left"
                  onClick={() => handleToggleAccordion(conn.id)}
                >
                  {expanded[conn.id]
                    ? <ChevronDown className="h-4 w-4 text-sub shrink-0" />
                    : <ChevronRight className="h-4 w-4 text-sub shrink-0" />}
                  <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-surface-3 text-sm font-bold text-primary uppercase shrink-0">
                    {conn.providerType.slice(0, 2)}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-text">{conn.displayName}</p>
                      {FREE_PROVIDERS.has(conn.providerType) && (
                        <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-green-500/15 text-green-500">FREE</span>
                      )}
                    </div>
                    <p className="text-xs text-sub">
                      {conn.providerType}
                      {conn.baseUrl && <span className="ml-2">{conn.baseUrl}</span>}
                    </p>
                  </div>
                </button>

                <div className="flex items-center gap-2">
                  {testResult[conn.id] && (
                    <Badge
                      variant={testResult[conn.id].success ? "success" : "error"}
                      title={!testResult[conn.id].success ? testResult[conn.id].error : undefined}
                    >
                      {testResult[conn.id].success ? `OK ${testResult[conn.id].latencyMs}ms` : "Failed"}
                    </Badge>
                  )}
                  <Badge variant={conn.isActive ? "success" : "outline"}>
                    {conn.isActive ? "Active" : "Inactive"}
                  </Badge>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleTest(conn.id)}
                    disabled={testing === conn.id}
                    title="Test connection"
                  >
                    {testing === conn.id ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <TestTube className="h-4 w-4" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggle(conn)}
                    title={conn.isActive ? "Disable" : "Enable"}
                  >
                    {conn.isActive ? (
                      <PowerOff className="h-4 w-4 text-sub" />
                    ) : (
                      <Power className="h-4 w-4 text-pass" />
                    )}
                  </Button>

                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(conn.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-critical" />
                  </Button>
                </div>
              </CardContent>

              {/* ── Accordion: model list ── */}
              {expanded[conn.id] && (
                <div className="border-t border-border-md px-4 pb-4 pt-3">
                  {modelsLoading[conn.id] ? (
                    <div className="flex items-center gap-2 py-4 text-xs text-sub">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Loading models…
                    </div>
                  ) : modelsError[conn.id] ? (
                    <div className="py-2">
                      <ModelsErrorPanel error={modelsError[conn.id]} />
                    </div>
                  ) : !models[conn.id]?.length ? (
                    <p className="py-3 text-xs text-sub">No enabled models found for this provider.</p>
                  ) : (
                    <div className="space-y-2">
                      <p className="mb-3 text-xs font-medium text-sub uppercase tracking-wide">
                        Enabled models — click Test to verify each one
                      </p>
                      {models[conn.id].map((model) => {
                        const key = `${conn.id}:${model.id}`;
                        const result = modelTestResult[key];
                        const isTesting = modelTesting[key];
                        return (
                          <div
                            key={model.id}
                            className="flex items-center justify-between rounded-[6px] bg-surface-2 px-3 py-2"
                          >
                            <div className="flex items-center gap-3 min-w-0">
                              {result ? (
                                result.success
                                  ? <CheckCircle className="h-4 w-4 shrink-0 text-green-500" />
                                  : <XCircle className="h-4 w-4 shrink-0 text-critical" />
                              ) : (
                                <Clock className="h-4 w-4 shrink-0 text-sub" />
                              )}
                              <div className="min-w-0">
                                <p className="truncate text-sm font-medium text-text">{model.name}</p>
                                <p className="truncate text-xs text-sub">{model.id}</p>
                              </div>
                              <div className="flex shrink-0 items-center gap-1.5 ml-2">
                                {model.supportsVision && (
                                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-blue-500/15 text-blue-400">Vision</span>
                                )}
                                {model.supportsStreaming && (
                                  <span className="rounded px-1.5 py-0.5 text-[10px] font-semibold bg-purple-500/15 text-purple-400">Stream</span>
                                )}
                                {model.contextWindow && (
                                  <span className="rounded px-1.5 py-0.5 text-[10px] text-sub bg-surface-3">
                                    {(model.contextWindow / 1000).toFixed(0)}k ctx
                                  </span>
                                )}
                              </div>
                            </div>
                            <div className="flex items-center gap-2 ml-3 shrink-0">
                              {result && (
                                result.success
                                  ? <span className="text-xs text-green-500">{result.latencyMs}ms</span>
                                  : <ModelErrorBadge error={result.error ?? "Unknown error"} />
                              )}
                              <Button
                                variant="outline"
                                size="sm"
                                onClick={() => handleTestModel(conn.id, model.id)}
                                disabled={isTesting}
                                className="h-7 px-2 text-xs"
                              >
                                {isTesting ? (
                                  <Loader2 className="h-3 w-3 animate-spin" />
                                ) : (
                                  "Test"
                                )}
                              </Button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </Card>
          ))}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Connection</DialogTitle>
            <DialogDescription>
              Connect an AI provider to use with a11y DevTools.
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleCreate} className="mt-4 space-y-4">
            <div className="space-y-2">
              <Label htmlFor="providerType">Provider</Label>
              <select
                id="providerType"
                value={form.providerType}
                onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value as ProviderValue }))}
                className="flex h-9 w-full rounded-[6px] border border-border-md bg-surface-2 px-3 py-1 text-sm text-text"
              >
                {PROVIDER_OPTIONS.map((p) => (
                  <option key={p.value} value={p.value}>
                    {p.free ? "	\uD83C\uDD93 " : ""}{p.label}
                  </option>
                ))}
              </select>
              {(() => {
                const opt = PROVIDER_OPTIONS.find((p) => p.value === form.providerType);
                const link = form.providerType in API_KEY_LINKS ? API_KEY_LINKS[form.providerType] : null;
                return opt ? (
                  <div className="text-xs text-sub mt-1 space-y-0.5">
                    <p>{opt.hint}{opt.free && <span className="ml-2 text-green-500 font-medium">· Free tier available</span>}</p>
                    {link && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{link.label} ↗</a>
                    )}
                  </div>
                ) : null;
              })()}
            </div>

            <div className="space-y-2">
              <Label htmlFor="displayName">Display Name</Label>
              <Input
                id="displayName"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="My OpenAI Key"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="apiKey">API Key</Label>
              <Input
                id="apiKey"
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder="sk-..."
                required
              />
            </div>

            {form.providerType === "custom" && (
              <div className="space-y-2">
                <Label htmlFor="baseUrl">Base URL</Label>
                <Input
                  id="baseUrl"
                  value={form.baseUrl}
                  onChange={(e) => setForm((f) => ({ ...f, baseUrl: e.target.value }))}
                  placeholder="https://api.example.com/v1"
                  required
                />
              </div>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button type="button" variant="outline" onClick={() => setShowCreate(false)}>
                Cancel
              </Button>
              <Button type="submit">Create</Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
