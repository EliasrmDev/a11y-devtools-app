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

const PROVIDER_TYPES = ["openai", "anthropic", "openrouter", "custom"] as const;

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [testing, setTesting] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<Record<string, { success: boolean; error?: string }>>({});

  const [form, setForm] = useState({
    providerType: "openai" as string,
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
                    <p className="text-sm font-semibold text-text">{conn.displayName}</p>
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
                onChange={(e) => setForm((f) => ({ ...f, providerType: e.target.value }))}
                className="flex h-9 w-full rounded-[6px] border border-border-md bg-surface-2 px-3 py-1 text-sm text-text"
              >
                {PROVIDER_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t.charAt(0).toUpperCase() + t.slice(1)}
                  </option>
                ))}
              </select>
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
