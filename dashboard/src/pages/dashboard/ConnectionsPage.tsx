import { useEffect, useState, useCallback } from "react";
import {
  listConnections,
  createConnection,
  deleteConnection,
  testConnection,
  updateConnection,
  type Connection,
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
} from "lucide-react";

const PROVIDER_OPTIONS = [
  { value: "openai",     label: "OpenAI",               free: false, hint: "GPT-4o, o1, etc." },
  { value: "anthropic",  label: "Anthropic",             free: false, hint: "Claude 3.x / Sonnet" },
  { value: "openrouter", label: "OpenRouter",            free: true,  hint: "M\u00e1s flexible — 200+ modelos, algunos gratuitos" },
  { value: "gemini",     label: "Google Gemini",         free: true,  hint: "Mejor opci\u00f3n gratuita en general" },
  { value: "groq",       label: "Groq",                  free: true,  hint: "Mejor rendimiento y velocidad" },
  { value: "cloudflare", label: "Cloudflare AI",         free: true,  hint: "Mejor integraci\u00f3n con este stack \u2014 sin API key" },
  { value: "custom",     label: "Custom / Self-hosted",  free: false, hint: "Cualquier endpoint compatible con OpenAI" },
] as const;

type ProviderValue = typeof PROVIDER_OPTIONS[number]["value"];

const FREE_PROVIDERS = new Set<string>(["openrouter", "gemini", "groq", "cloudflare"]);

const API_KEY_LINKS: Record<string, { label: string; url: string } | string> = {
  gemini:     { label: "Obtener API key gratuita", url: "https://aistudio.google.com/app/apikey" },
  groq:       { label: "Obtener API key gratuita", url: "https://console.groq.com/keys" },
  openrouter: { label: "Obtener API key", url: "https://openrouter.ai/keys" },
  cloudflare: "Incluido gratis con tu plan de Cloudflare Workers — no se necesita API key",
};

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; error?: string }>>({});

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
              <CardContent className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-surface-3 text-sm font-bold text-primary uppercase">
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
                      {conn.baseUrl && <span className="ml-2 text-sub">{conn.baseUrl}</span>}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {testResult[conn.id] && (
                    <Badge
                      variant={testResult[conn.id].success ? "success" : "error"}
                      title={!testResult[conn.id].success ? testResult[conn.id].error : undefined}
                    >
                      {testResult[conn.id].success ? "OK" : "Failed"}
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
                    {p.free ? "\uD83C\uDD13 " : ""}{p.label}
                  </option>
                ))}
              </select>
              {(() => {
                const opt = PROVIDER_OPTIONS.find((p) => p.value === form.providerType);
                const link = form.providerType in API_KEY_LINKS ? API_KEY_LINKS[form.providerType] : null;
                return opt ? (
                  <div className="text-xs text-sub mt-1 space-y-0.5">
                    <p>{opt.hint}{opt.free && <span className="ml-2 text-green-500 font-medium">· Tier gratuito disponible</span>}</p>
                    {link && typeof link === "object" && (
                      <a href={link.url} target="_blank" rel="noopener noreferrer" className="text-primary underline">{link.label} ↗</a>
                    )}
                    {link && typeof link === "string" && <p className="text-green-500">{link}</p>}
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
              <Label htmlFor="apiKey">API Key{form.providerType === "cloudflare" ? " (opcional)" : ""}</Label>
              <Input
                id="apiKey"
                type="password"
                value={form.apiKey}
                onChange={(e) => setForm((f) => ({ ...f, apiKey: e.target.value }))}
                placeholder={form.providerType === "cloudflare" ? "No requerido" : "sk-..."}
                required={form.providerType !== "cloudflare"}
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
