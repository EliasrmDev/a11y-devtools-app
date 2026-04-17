import { useEffect, useState } from "react";
import { adminGetStats, type AdminStats } from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Users, Cpu, Activity, ShieldAlert, Loader2 } from "lucide-react";

export default function AdminStatsPage() {
  const [stats, setStats] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    adminGetStats()
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-sub" />
      </div>
    );
  }

  if (!stats) {
    return <p className="text-sub">Failed to load stats.</p>;
  }

  const cards = [
    {
      title: "Total Users",
      value: stats.totalUsers,
      icon: Users,
      color: "text-primary",
      bg: "bg-primary/10",
    },
    {
      title: "Active Users",
      value: stats.activeUsers,
      icon: Activity,
      color: "text-pass",
      bg: "bg-pass/10",
    },
    {
      title: "Active Models",
      value: stats.activeModels,
      icon: Cpu,
      color: "text-serious",
      bg: "bg-serious/10",
    },
    {
      title: "Blocked Users",
      value: stats.blockedUsers,
      icon: ShieldAlert,
      color: "text-critical",
      bg: "bg-critical/10",
    },
  ];

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text">Admin Dashboard</h1>
        <p className="mt-1 text-sub">System overview and statistics.</p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardContent className="flex items-center gap-4">
              <div className={`flex h-10 w-10 items-center justify-center rounded-[8px] ${card.bg}`}>
                <card.icon className={`h-5 w-5 ${card.color}`} />
              </div>
              <div>
                <p className="text-2xl font-bold text-text">{card.value}</p>
                <p className="text-xs text-sub">{card.title}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {stats.requestsToday !== undefined && (
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Usage Today</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-3xl font-bold text-text">{stats.requestsToday}</p>
            <p className="text-xs text-sub">API requests today</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
