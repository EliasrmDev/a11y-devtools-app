import { useEffect, useState, useCallback } from "react";
import {
  adminListModels,
  adminCreateModel,
  adminToggleModel,
  adminDeleteModel,
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
import { Plus, Trash2, ToggleLeft, ToggleRight, Loader2 } from "lucide-react";

export default function AdminModelsPage() {
  const [models, setModels] = useState<ProviderModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);

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

  return (
    <div>
      <div className="mb-8 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-text">Models</h1>
          <p className="mt-1 text-sub">Manage available AI models.</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4" />
          Add Model
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sub" />
        </div>
      ) : (
        <div className="space-y-3">
          {models.map((model) => (
            <Card key={model.id}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">{model.displayName}</p>
                  <p className="text-xs text-sub">
                    {model.providerType} / {model.modelId}
                  </p>
                  {model.capabilities && model.capabilities.length > 0 && (
                    <div className="mt-1 flex gap-1">
                      {model.capabilities.map((cap) => (
                        <Badge key={cap} variant="outline">
                          {cap}
                        </Badge>
                      ))}
                    </div>
                  )}
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

          {models.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sub">No models configured.</p>
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
            <DialogDescription>Add a new AI model to the platform.</DialogDescription>
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
