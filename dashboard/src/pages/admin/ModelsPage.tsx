import { useEffect, useState, useCallback, useMemo } from "react";
import {
  adminListModels,
  adminCreateModel,
  adminToggleModel,
  adminDeleteModel,
  adminSyncModels,
  adminBulkToggleModels,
  type ProviderModel,
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
  ToggleLeft,
  ToggleRight,
  Loader2,
  Search,
  RefreshCw,
  Check,
  AlertCircle,
} from "lucide-react";

const PROVIDERS = [
  { value: "all", label: "All" },
  { value: "openai", label: "OpenAI" },
  { value: "anthropic", label: "Anthropic" },
  { value: "openrouter", label: "OpenRouter" },
  { value: "gemini", label: "Gemini" },
  { value: "groq", label: "Groq" },
] as const;

const SYNCABLE_PROVIDERS = ["openai", "anthropic", "openrouter", "gemini", "groq"] as const;

interface SyncStatus {
  loading: boolean;
  result?: { added: number; updated: number; total: number };
  error?: string;
}

export default function AdminModelsPage() {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [syncStatus, setSyncStatus] = useState<Record<string, SyncStatus>>({});

  const [form, setForm] = useState({
    providerType: "openai",
    modelId: "",
    displayName: "",
    capabilities: "",
  });

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListModels();
      setModels(r.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Filtered models based on active tab and search
  const filteredModels = useMemo(() => {
    let result = models;
    if (activeTab !== "all") {
      result = result.filter((m) => m.providerType === activeTab);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      result = result.filter(
        (m) =>
          m.displayName.toLowerCase().includes(q) ||
          m.modelId.toLowerCase().includes(q),
      );
    }
    return result;
  }, [models, activeTab, search]);

  // Stats per provider
  const providerStats = useMemo(() => {
    const stats: Record<string, { total: number; enabled: number }> = {};
    for (const m of models) {
      if (!stats[m.providerType]) stats[m.providerType] = { total: 0, enabled: 0 };
      stats[m.providerType].total++;
      if (m.isEnabled) stats[m.providerType].enabled++;
    }
    return stats;
  }, [models]);

  const handleSync = async (providerType: string) => {
    setSyncStatus((s) => ({ ...s, [providerType]: { loading: true } }));
    try {
      const result = await adminSyncModels(providerType);
      setSyncStatus((s) => ({ ...s, [providerType]: { loading: false, result } }));
      refresh();
      // Clear success message after 5s
      setTimeout(() => {
        setSyncStatus((s) => {
          const next = { ...s };
          delete next[providerType];
          return next;
        });
      }, 5000);
    } catch (err) {
      const error = err instanceof Error ? err.message : "Sync failed";
      setSyncStatus((s) => ({ ...s, [providerType]: { loading: false, error } }));
      setTimeout(() => {
        setSyncStatus((s) => {
          const next = { ...s };
          delete next[providerType];
          return next;
        });
      }, 5000);
    }
  };

  const handleSyncAll = async () => {
    for (const p of SYNCABLE_PROVIDERS) {
      await handleSync(p);
    }
  };

  const [bulkToggling, setBulkToggling] = useState(false);

  const handleBulkToggle = async (providerType: string, enabled: boolean) => {
    setBulkToggling(true);
    try {
      await adminBulkToggleModels(providerType, enabled);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Bulk toggle failed");
    } finally {
      setBulkToggling(false);
    }
  };

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await adminCreateModel({
        providerType: form.providerType,
        modelId: form.modelId,
        displayName: form.displayName,
        capabilities: form.capabilities
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean),
      });
      setShowCreate(false);
      setForm({ providerType: "openai", modelId: "", displayName: "", capabilities: "" });
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to create model");
    }
  };

  const handleToggle = async (id: string, isEnabled: boolean) => {
    await adminToggleModel(id, !isEnabled);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Delete this model?")) return;
    await adminDeleteModel(id);
    refresh();
  };

  const anySyncing = Object.values(syncStatus).some((s) => s.loading);

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Models</h1>
          <p className="mt-1 text-sub">
            Manage AI models available to all users.{" "}
            <span className="text-text/60">
              {models.length} total · {models.filter((m) => m.isEnabled).length} enabled
            </span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={handleSyncAll} disabled={anySyncing}>
            <RefreshCw className={`h-4 w-4 ${anySyncing ? "animate-spin" : ""}`} />
            Sync All
          </Button>
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" />
            Add Model
          </Button>
        </div>
      </div>

      {/* Provider tabs */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5">
        {PROVIDERS.map((p) => {
          const isActive = activeTab === p.value;
          const stats = p.value === "all" ? null : providerStats[p.value];
          return (
            <button
              key={p.value}
              onClick={() => setActiveTab(p.value)}
              className={`flex items-center gap-1.5 rounded-[8px] px-3 py-1.5 text-sm font-medium transition-colors ${
                isActive
                  ? "bg-primary/15 text-primary-light"
                  : "text-sub hover:bg-surface-3 hover:text-text"
              }`}
            >
              {p.label}
              {stats && (
                <span className="text-[11px] opacity-70">
                  {stats.enabled}/{stats.total}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {/* Sync buttons per provider (shown when specific provider tab is active) */}
      {activeTab !== "all" && SYNCABLE_PROVIDERS.includes(activeTab as any) && (
        <div className="mb-4 flex items-center gap-3">
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSync(activeTab)}
            disabled={syncStatus[activeTab]?.loading}
          >
            <RefreshCw
              className={`h-3.5 w-3.5 ${syncStatus[activeTab]?.loading ? "animate-spin" : ""}`}
            />
            Sync {PROVIDERS.find((p) => p.value === activeTab)?.label} Models
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkToggle(activeTab, true)}
            disabled={bulkToggling}
          >
            <ToggleRight className="h-3.5 w-3.5 text-pass" />
            Enable All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleBulkToggle(activeTab, false)}
            disabled={bulkToggling}
          >
            <ToggleLeft className="h-3.5 w-3.5 text-sub" />
            Disable All
          </Button>
          {syncStatus[activeTab]?.result && (
            <span className="flex items-center gap-1 text-xs text-pass">
              <Check className="h-3.5 w-3.5" />
              +{syncStatus[activeTab].result!.added} added, {syncStatus[activeTab].result!.updated} updated ({syncStatus[activeTab].result!.total} total)
            </span>
          )}
          {syncStatus[activeTab]?.error && (
            <span className="flex items-center gap-1 text-xs text-critical">
              <AlertCircle className="h-3.5 w-3.5" />
              {syncStatus[activeTab].error}
            </span>
          )}
        </div>
      )}

      {/* Global sync results banner */}
      {activeTab === "all" && Object.keys(syncStatus).length > 0 && (
        <div className="mb-4 space-y-1">
          {Object.entries(syncStatus).map(([provider, status]) => (
            <div key={provider} className="flex items-center gap-2 text-xs">
              <span className="w-20 font-medium text-text capitalize">{provider}</span>
              {status.loading && <Loader2 className="h-3 w-3 animate-spin text-sub" />}
              {status.result && (
                <span className="text-pass">
                  +{status.result.added} added, {status.result.updated} updated
                </span>
              )}
              {status.error && <span className="text-critical">{status.error}</span>}
            </div>
          ))}
        </div>
      )}

      {/* Search */}
      <div className="relative mb-4">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
        <Input
          placeholder="Search models..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Model list */}
      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sub" />
        </div>
      ) : (
        <div className="space-y-2">
          {filteredModels.map((model) => (
            <Card key={model.id}>
              <CardContent className="flex items-center justify-between py-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-9 w-9 items-center justify-center rounded-[6px] bg-surface-3 text-xs font-bold text-primary uppercase">
                    {model.providerType.slice(0, 2)}
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-text">{model.displayName}</p>
                    <p className="text-xs text-sub">
                      {model.providerType} / {model.modelId}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <Badge variant={model.isEnabled ? "success" : "outline"}>
                    {model.isEnabled ? "Enabled" : "Disabled"}
                  </Badge>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleToggle(model.id, model.isEnabled)}
                    title={model.isEnabled ? "Disable" : "Enable"}
                  >
                    {model.isEnabled ? (
                      <ToggleRight className="h-5 w-5 text-pass" />
                    ) : (
                      <ToggleLeft className="h-5 w-5 text-sub" />
                    )}
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(model.id)}
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4 text-critical" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {filteredModels.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sub">
                  {search
                    ? "No models match your search."
                    : activeTab !== "all"
                      ? `No ${PROVIDERS.find((p) => p.value === activeTab)?.label} models. Click "Sync" to fetch from the API.`
                      : "No models configured. Click \"Sync All\" to fetch from provider APIs."}
                </p>
              </CardContent>
            </Card>
          )}
        </div>
      )}

      {/* Create dialog */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add Model</DialogTitle>
            <DialogDescription>Manually add a model to the platform.</DialogDescription>
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
                <option value="openai">OpenAI</option>
                <option value="anthropic">Anthropic</option>
                <option value="openrouter">OpenRouter</option>
                <option value="gemini">Google Gemini</option>
                <option value="groq">Groq</option>
                <option value="cloudflare">Cloudflare AI</option>
                <option value="custom">Custom</option>
              </select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="modelId">Model ID</Label>
              <Input
                id="modelId"
                value={form.modelId}
                onChange={(e) => setForm((f) => ({ ...f, modelId: e.target.value }))}
                placeholder="gpt-4o"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="modelDisplayName">Display Name</Label>
              <Input
                id="modelDisplayName"
                value={form.displayName}
                onChange={(e) => setForm((f) => ({ ...f, displayName: e.target.value }))}
                placeholder="GPT-4o"
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="capabilities">Capabilities (comma-separated)</Label>
              <Input
                id="capabilities"
                value={form.capabilities}
                onChange={(e) => setForm((f) => ({ ...f, capabilities: e.target.value }))}
                placeholder="text, vision, code"
              />
            </div>

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
