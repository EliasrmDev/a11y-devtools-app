import { useEffect, useState, useCallback } from "react";
import { adminListJobs, adminRunJob, type Job } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Play, Loader2 } from "lucide-react";

export default function AdminJobsPage() {
  const [jobs, setJobs] = useState<Job[]>([]);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListJobs();
      setJobs(r.data);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleRun = async (jobName: string) => {
    if (!confirm(`Run job "${jobName}" now?`)) return;
    setRunning(jobName);
    try {
      await adminRunJob(jobName);
      setTimeout(refresh, 1000);
    } catch (err) {
      alert(err instanceof Error ? err.message : "Failed to run job");
    } finally {
      setRunning(null);
    }
  };

  const statusVariant = (status: string) => {
    switch (status) {
      case "completed":
        return "success" as const;
      case "running":
        return "warning" as const;
      case "failed":
        return "error" as const;
      default:
        return "outline" as const;
    }
  };

  const fmtDate = (iso?: string) => {
    if (!iso) return "Never";
    return new Date(iso).toLocaleString();
  };

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text">Jobs</h1>
        <p className="mt-1 text-sub">Manage background jobs and scheduled tasks.</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-sub" />
        </div>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <Card key={job.name}>
              <CardContent className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-semibold text-text">{job.name}</p>
                  <p className="text-xs text-sub">
                    Last run: {fmtDate(job.lastRunAt ?? undefined)}
                    {job.schedule && <span className="ml-2">({job.schedule})</span>}
                  </p>
                  {job.lastError && (
                    <p className="mt-1 text-xs text-critical truncate max-w-md">{job.lastError}</p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Badge variant={statusVariant(job.status)}>{job.status}</Badge>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handleRun(job.name)}
                    disabled={running === job.name}
                  >
                    {running === job.name ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Play className="h-4 w-4" />
                    )}
                    Run Now
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {jobs.length === 0 && (
            <Card>
              <CardContent className="py-12 text-center">
                <p className="text-sub">No jobs configured.</p>
              </CardContent>
            </Card>
          )}
        </div>
      )}
    </div>
  );
}
