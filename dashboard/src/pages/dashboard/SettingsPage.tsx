import { useState } from "react";
import { useAuth } from "@/lib/auth";
import { updateProfile, requestDeletion, cancelDeletion, exportData, getDeletionStatus } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Save, Download, Trash2, Loader2, AlertTriangle } from "lucide-react";

export default function SettingsPage() {
  const { profile, refreshProfile, activeDeletion, setActiveDeletion } = useAuth();
  const [displayName, setDisplayName] = useState(profile?.displayName ?? "");
  const [saving, setSaving] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await updateProfile({ displayName: displayName || null });
      await refreshProfile();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to update profile");
    } finally {
      setSaving(false);
    }
  };

  const handleExport = async () => {
    setExporting(true);
    try {
      const data = await exportData();
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "a11y-devtools-export.json";
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to export");
    } finally {
      setExporting(false);
    }
  };

  const handleRequestDeletion = async () => {
    if (!confirm("Are you sure? Your account will be scheduled for deletion.")) return;
    try {
      await requestDeletion();
      const r = await getDeletionStatus();
      setActiveDeletion(r.deletion);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to request deletion");
    }
  };

  const handleCancelDeletion = async () => {
    try {
      await cancelDeletion();
      setActiveDeletion(null);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel deletion");
    }
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text">Settings</h1>
        <p className="mt-1 text-sub">Manage your account settings and data.</p>
      </div>

      <div className="space-y-6">
        {/* Profile */}
        <Card>
          <CardHeader>
            <CardTitle>Profile</CardTitle>
            <CardDescription>Update your display name and personal details.</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" value={profile?.email ?? ""} disabled />
              </div>
              <div className="space-y-2">
                <Label htmlFor="name">Display Name</Label>
                <Input
                  id="name"
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  placeholder="Your name"
                />
              </div>
              <div className="flex items-center gap-2">
                <Label>Role</Label>
                <Badge>{profile?.role}</Badge>
              </div>
              <Button type="submit" disabled={saving}>
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Save Changes
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Data Export */}
        <Card>
          <CardHeader>
            <CardTitle>Data Export</CardTitle>
            <CardDescription>Download a copy of all your data.</CardDescription>
          </CardHeader>
          <CardContent>
            <Button variant="outline" onClick={handleExport} disabled={exporting}>
              {exporting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Download className="h-4 w-4" />
              )}
              Export Data
            </Button>
          </CardContent>
        </Card>

        {/* Danger Zone */}
        <Card className="border-critical/30">
          <CardHeader>
            <CardTitle className="text-critical">Danger Zone</CardTitle>
            <CardDescription>
              Permanently delete your account and all associated data.
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {activeDeletion && (
              <div className="flex items-start gap-3 rounded-[8px] border border-warn/30 bg-warn/10 px-4 py-3 text-sm text-warn">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                <p>
                  <span className="font-semibold">Deletion scheduled</span>
                  {activeDeletion.scheduledFor && (
                    <> for{" "}
                      <span className="font-semibold">
                        {new Date(activeDeletion.scheduledFor).toLocaleDateString(undefined, {
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </span>
                    </>
                  )}
                  . All your data will be permanently removed on that date.
                </p>
              </div>
            )}
            <div className="flex gap-3">
              <Button
                variant="destructive"
                onClick={handleRequestDeletion}
                disabled={!!activeDeletion}
              >
                <Trash2 className="h-4 w-4" />
                Request Deletion
              </Button>
              {activeDeletion && (
                <Button variant="outline" onClick={handleCancelDeletion}>
                  Cancel Deletion
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
