import { useEffect, useState, useCallback } from "react";
import {
  adminListDeletionRequests,
  adminExecuteDeletion,
  adminCancelDeletion,
  type DeletionRequest,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Trash2,
  X,
  Loader2,
  RefreshCw,
  AlertTriangle,
  Clock,
  CheckCircle2,
  XCircle,
  Hourglass,
} from "lucide-react";

const STATUS_CONFIG: Record<
  DeletionRequest["status"],
  { label: string; variant: "default" | "warning" | "success" | "error" | "outline"; icon: React.ElementType }
> = {
  pending:    { label: "Pending",    variant: "warning",  icon: Clock },
  processing: { label: "Processing", variant: "warning",  icon: Hourglass },
  completed:  { label: "User Deleted", variant: "success",  icon: CheckCircle2 },
  failed:     { label: "Failed",     variant: "error",    icon: XCircle },
  cancelled:  { label: "Cancelled",  variant: "outline",  icon: XCircle },
};

const FILTER_OPTIONS = [
  { value: "", label: "All" },
  { value: "pending", label: "Pending" },
  { value: "processing", label: "Processing" },
  { value: "failed", label: "Failed" },
  { value: "completed", label: "Completed" },
  { value: "cancelled", label: "Cancelled" },
];

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

function isPast(iso: string) {
  return new Date(iso) <= new Date();
}

export default function AdminDeletionsPage() {
  const [requests, setRequests] = useState<DeletionRequest[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState("");
  const [page, setPage] = useState(1);
  const [executing, setExecuting] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);
  const limit = 20;

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListDeletionRequests({
        page,
        limit,
        status: statusFilter || undefined,
      });
      setRequests(r.data);
      setTotal(r.total);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page, statusFilter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setPage(1);
  }, [statusFilter]);

  const handleExecute = async (req: DeletionRequest) => {
    const name = req.userDisplayName || req.userEmail || req.userId;
    if (
      !confirm(
        `Execute deletion for "${name}" immediately?\n\nThis will permanently delete the user and ALL associated data. This action cannot be undone.`,
      )
    )
      return;

    setExecuting(req.id);
    try {
      await adminExecuteDeletion(req.id);
      // Give job queue a moment then refresh
      setTimeout(refresh, 800);
      const label = req.userDisplayName || req.userEmail || req.userId;
      setSuccessMsg(`Deletion scheduled for "${label}" — the account will be removed shortly.`);
      setTimeout(() => setSuccessMsg(null), 6000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to execute deletion");
    } finally {
      setExecuting(null);
    }
  };

  const handleCancel = async (req: DeletionRequest) => {
    if (!confirm(`Cancel the deletion request for "${req.userEmail || req.userId}"?`)) return;
    setCancelling(req.id);
    try {
      await adminCancelDeletion(req.id);
      refresh();
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to cancel deletion");
    } finally {
      setCancelling(null);
    }
  };

  const totalPages = Math.ceil(total / limit) || 1;

  const pendingCount = requests.filter((r) => r.status === "pending").length;
  const failedCount  = requests.filter((r) => r.status === "failed").length;

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Deletion Requests</h1>
          <p className="mt-1 text-sub">
            Review and manage user account deletion requests.
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={refresh} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {/* Success banner */}
      {successMsg && (
        <div className="mb-6 flex items-center justify-between gap-3 rounded-lg border border-success/30 bg-success/10 px-4 py-3 text-sm text-success">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="shrink-0 opacity-60 hover:opacity-100">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Summary banners */}
      {(pendingCount > 0 || failedCount > 0) && (
        <div className="mb-6 flex flex-wrap gap-3">
          {pendingCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-warning/30 bg-warning/10 px-4 py-2 text-sm text-warning">
              <Clock className="h-4 w-4" />
              <span>{pendingCount} pending — run <strong>PROCESS_DELETION_REQUESTS</strong> job to process</span>
            </div>
          )}
          {failedCount > 0 && (
            <div className="flex items-center gap-2 rounded-lg border border-critical/30 bg-critical/10 px-4 py-2 text-sm text-critical">
              <AlertTriangle className="h-4 w-4" />
              <span>{failedCount} failed — will be retried automatically</span>
            </div>
          )}
        </div>
      )}

      {/* Status filter */}
      <div className="mb-5 flex flex-wrap gap-2">
        {FILTER_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            onClick={() => setStatusFilter(opt.value)}
            className={`rounded-full px-4 py-1.5 text-xs font-medium transition-colors ${
              statusFilter === opt.value
                ? "bg-primary text-white"
                : "bg-surface-2 text-sub hover:text-text"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-sub" />
        </div>
      ) : requests.length === 0 ? (
        <Card>
          <CardContent className="py-16 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-sub/40" />
            <p className="text-sub">No deletion requests found.</p>
          </CardContent>
        </Card>
      ) : (
        <>
          <div className="space-y-3">
            {requests.map((req) => {
              const cfg = STATUS_CONFIG[req.status];
              const StatusIcon = cfg.icon;
              const scheduledPast = isPast(req.scheduledFor);
              const canExecute = req.status !== "completed" && req.status !== "cancelled";
              const canCancel = req.status === "pending" || req.status === "failed";

              const tablesTotal = req.processedTables
                ? Object.keys(req.processedTables).length
                : null;
              const tablesDone = req.processedTables
                ? Object.values(req.processedTables).filter(Boolean).length
                : null;

              return (
                <Card key={req.id}>
                  <CardContent className="flex items-start justify-between gap-4">
                    {/* Left: user info + status */}
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="text-sm font-semibold text-text truncate">
                          {req.userDisplayName || req.userEmail || req.userId}
                        </p>
                        <Badge variant={cfg.variant}>
                          <StatusIcon className="mr-1 h-3 w-3" />
                          {cfg.label}
                        </Badge>
                        {scheduledPast && req.status === "pending" && (
                          <Badge variant="error">Overdue</Badge>
                        )}
                      </div>

                      <p className="mt-0.5 text-xs text-sub">{req.userEmail}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-sub/60">{req.userId}</p>

                      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-sub">
                        <span>
                          <span className="text-sub/60">Requested:</span>{" "}
                          {fmtDate(req.requestedAt)}
                        </span>
                        <span>
                          <span className="text-sub/60">Scheduled:</span>{" "}
                          <span className={scheduledPast && req.status === "pending" ? "text-critical font-medium" : ""}>
                            {fmtDate(req.scheduledFor)}
                          </span>
                        </span>
                        {req.completedAt && (
                          <span>
                            <span className="text-sub/60">Completed:</span>{" "}
                            {fmtDate(req.completedAt)}
                          </span>
                        )}
                      </div>

                      {/* Progress bar for in-progress deletions */}
                      {tablesTotal !== null && tablesDone !== null && tablesTotal > 0 && req.status !== "completed" && (
                        <div className="mt-2">
                          <div className="flex items-center justify-between text-[10px] text-sub mb-1">
                            <span>Progress</span>
                            <span>{tablesDone}/{tablesTotal} tables</span>
                          </div>
                          <div className="h-1 w-full rounded-full bg-surface-3 overflow-hidden">
                            <div
                              className="h-full rounded-full bg-primary transition-all"
                              style={{ width: `${(tablesDone / tablesTotal) * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      {req.errorDetails && (
                        <p className="mt-2 rounded border border-critical/20 bg-critical/5 px-2 py-1 text-xs text-critical line-clamp-2">
                          {req.errorDetails}
                        </p>
                      )}
                    </div>

                    {/* Right: actions */}
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      {canExecute && (
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleExecute(req)}
                          disabled={executing === req.id}
                          className="border-critical/40 text-critical hover:bg-critical/10 hover:border-critical"
                        >
                          {executing === req.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <Trash2 className="h-4 w-4" />
                          )}
                          Execute Now
                        </Button>
                      )}
                      {canCancel && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCancel(req)}
                          disabled={cancelling === req.id}
                          className="text-sub hover:text-text"
                        >
                          {cancelling === req.id ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            <X className="h-4 w-4" />
                          )}
                          Cancel
                        </Button>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="mt-6 flex items-center justify-center gap-3">
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
                <span className="ml-2 text-sub/60">({total} total)</span>
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
