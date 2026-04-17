import { useAuth } from "@/lib/auth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Link2, Activity, User } from "lucide-react";
import { useEffect, useState } from "react";
import { listConnections, type Connection } from "@/lib/api";

export default function OverviewPage() {
  const { profile } = useAuth();
  const [connections, setConnections] = useState<Connection[]>([]);

  useEffect(() => {
    listConnections().then((r) => setConnections(r.data)).catch(() => {});
  }, []);

  const activeConnections = connections.filter((c) => c.isActive).length;

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text">
          Welcome back{profile?.displayName ? `, ${profile.displayName}` : ""}
        </h1>
        <p className="mt-1 text-sub">Here's an overview of your a11y DevTools account.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 mb-8">
        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-primary/10">
              <Link2 className="h-5 w-5 text-primary" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text">{connections.length}</p>
              <p className="text-xs text-sub">Total Connections</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-pass/10">
              <Activity className="h-5 w-5 text-pass" />
            </div>
            <div>
              <p className="text-2xl font-bold text-text">{activeConnections}</p>
              <p className="text-xs text-sub">Active Connections</p>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="flex items-center gap-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-[8px] bg-serious/10">
              <User className="h-5 w-5 text-serious" />
            </div>
            <div>
              <p className="text-sm font-medium text-text">{profile?.email}</p>
              <p className="text-xs text-sub">
                <Badge variant={profile?.role === "admin" ? "warning" : "default"}>
                  {profile?.role}
                </Badge>
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Recent connections */}
      <Card>
        <CardHeader>
          <CardTitle>Your Connections</CardTitle>
        </CardHeader>
        <CardContent>
          {connections.length === 0 ? (
            <p className="text-sm text-sub py-4 text-center">
              No connections yet. Add an AI provider to get started.
            </p>
          ) : (
            <div className="space-y-3">
              {connections.map((conn) => (
                <div
                  key={conn.id}
                  className="flex items-center justify-between rounded-[8px] border border-border px-4 py-3"
                >
                  <div className="flex items-center gap-3">
                    <div className="flex h-8 w-8 items-center justify-center rounded-[6px] bg-surface-3 text-xs font-bold text-primary uppercase">
                      {conn.providerType.slice(0, 2)}
                    </div>
                    <div>
                      <p className="text-sm font-medium text-text">{conn.displayName}</p>
                      <p className="text-xs text-sub">{conn.providerType}</p>
                    </div>
                  </div>
                  <Badge variant={conn.isActive ? "success" : "outline"}>
                    {conn.isActive ? "Active" : "Inactive"}
                  </Badge>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
