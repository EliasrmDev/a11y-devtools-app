import { useState, useCallback } from "react";
import { adminFetchMetrics } from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Loader2, RefreshCw, Copy, Check, BarChart2, FileJson } from "lucide-react";

type Format = "json" | "prometheus";

function prettyJson(raw: string): string {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw;
  }
}

export default function AdminMetricsPage() {
  const [format, setFormat] = useState<Format>("json");
  const [data, setData] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetch = useCallback(
    async (fmt: Format) => {
      setLoading(true);
      setError(null);
      try {
        const raw = await adminFetchMetrics(fmt);
        setData(fmt === "json" ? prettyJson(raw) : raw);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to fetch metrics");
        setData(null);
      } finally {
        setLoading(false);
      }
    },
    [],
  );

  const handleFormat = (fmt: Format) => {
    setFormat(fmt);
    fetch(fmt);
  };

  const handleCopy = async () => {
    if (!data) return;
    await navigator.clipboard.writeText(data);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div>
      {/* Header */}
      <div className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-text">Metrics</h1>
          <p className="mt-1 text-sub">
            System metrics snapshot — JSON gauges or Prometheus text format.
          </p>
        </div>
      </div>

      {/* Format selector + actions */}
      <div className="mb-5 flex flex-wrap items-center gap-3">
        <div className="flex overflow-hidden rounded-lg border border-border">
          <button
            onClick={() => handleFormat("json")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors ${
              format === "json"
                ? "bg-primary text-white"
                : "bg-surface-2 text-sub hover:text-text"
            }`}
          >
            <FileJson className="h-4 w-4" />
            JSON
          </button>
          <button
            onClick={() => handleFormat("prometheus")}
            className={`flex items-center gap-1.5 px-4 py-2 text-sm font-medium transition-colors border-l border-border ${
              format === "prometheus"
                ? "bg-primary text-white"
                : "bg-surface-2 text-sub hover:text-text"
            }`}
          >
            <BarChart2 className="h-4 w-4" />
            Prometheus
          </button>
        </div>

        {data && (
          <>
            <Button variant="outline" size="sm" onClick={() => fetch(format)} disabled={loading}>
              <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleCopy}>
              {copied ? (
                <Check className="h-4 w-4 text-success" />
              ) : (
                <Copy className="h-4 w-4" />
              )}
              {copied ? "Copied!" : "Copy"}
            </Button>
          </>
        )}
      </div>

      {/* Empty state */}
      {!data && !loading && !error && (
        <Card>
          <CardContent className="py-16 text-center">
            <BarChart2 className="mx-auto mb-3 h-10 w-10 text-sub/40" />
            <p className="mb-4 text-sub">Select a format above to load the metrics snapshot.</p>
            <div className="flex justify-center gap-3">
              <Button variant="outline" onClick={() => handleFormat("json")}>
                <FileJson className="h-4 w-4" />
                Load JSON
              </Button>
              <Button variant="outline" onClick={() => handleFormat("prometheus")}>
                <BarChart2 className="h-4 w-4" />
                Load Prometheus
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Loading */}
      {loading && (
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-sub" />
        </div>
      )}

      {/* Error */}
      {error && !loading && (
        <Card>
          <CardContent className="py-8 text-center">
            <p className="text-sm text-critical">{error}</p>
            <Button variant="outline" size="sm" className="mt-4" onClick={() => fetch(format)}>
              Retry
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Output */}
      {data && !loading && (
        <Card>
          <CardContent className="p-0">
            <div className="flex items-center justify-between border-b border-border px-4 py-2.5">
              <span className="text-xs font-medium text-sub uppercase tracking-wide">
                {format === "prometheus" ? "text/plain · Prometheus exposition format" : "application/json"}
              </span>
              <span className="text-xs text-sub/60">
                {data.split("\n").length} lines
              </span>
            </div>
            <pre className="overflow-auto p-4 text-xs leading-relaxed text-text font-mono max-h-[60vh] whitespace-pre">
              {data}
            </pre>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
