import { useEffect, useState, useCallback } from "react";
import { adminGetAuditLog, type AuditEntry } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Search, Loader2 } from "lucide-react";

export default function AdminAuditPage() {
  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 25;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminGetAuditLog({ page, limit });
      setEntries(r.data);
      setTotal((r as any).total || 0);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const totalPages = Math.ceil(total / limit) || 1;

  const filtered = entries.filter(
    (e) =>
      !search ||
      e.action.toLowerCase().includes(search.toLowerCase()) ||
      e.actorEmail?.toLowerCase().includes(search.toLowerCase()) ||
      e.targetId?.toLowerCase().includes(search.toLowerCase())
  );

  const fmtDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleString();
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text">Audit Log</h1>
        <p className="mt-1 text-sub">Review all admin and user actions.</p>
      </div>

      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
        <Input
          className="pl-9"
          placeholder="Search by action, email, or target..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sub" />
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {filtered.map((entry, i) => (
              <Card key={entry.id || i}>
                <CardContent className="flex items-center justify-between py-3">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline">{entry.action}</Badge>
                      <span className="text-xs text-sub">{fmtDate(entry.createdAt)}</span>
                    </div>
                    <p className="mt-1 text-xs text-sub">
                      {entry.actorEmail || entry.actorId}
                      {entry.targetId && (
                        <span className="ml-2 text-sub">→ {entry.targetId}</span>
                      )}
                    </p>
                    {entry.metadata && (
                      <p className="mt-1 max-w-lg truncate text-xs text-sub/60">
                        {JSON.stringify(entry.metadata)}
                      </p>
                    )}
                  </div>
                </CardContent>
              </Card>
            ))}

            {filtered.length === 0 && (
              <p className="py-8 text-center text-sm text-sub">No audit entries found.</p>
            )}
          </div>

          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage((p) => p - 1)}
              >
                Previous
              </Button>
              <span className="text-sm text-sub">
                Page {page} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                disabled={page >= totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
