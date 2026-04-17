import { useEffect, useState, useCallback } from "react";
import {
  adminListUsers,
  adminBlockUser,
  adminUnblockUser,
  adminDeleteUser,
  type AdminUser,
} from "@/lib/api";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Search, ShieldBan, ShieldCheck, Trash2, Loader2 } from "lucide-react";

export default function AdminUsersPage() {
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const r = await adminListUsers({ page, limit: 20 });
      setUsers(r.data);
      setTotalPages(Math.ceil((r as any).total / 20) || 1);
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const handleBlock = async (id: string) => {
    if (!confirm("Block this user?")) return;
    await adminBlockUser(id);
    refresh();
  };

  const handleUnblock = async (id: string) => {
    await adminUnblockUser(id);
    refresh();
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Permanently delete this user? This cannot be undone.")) return;
    await adminDeleteUser(id);
    refresh();
  };

  const filtered = users.filter(
    (u) =>
      !search ||
      u.email.toLowerCase().includes(search.toLowerCase()) ||
      u.displayName?.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-text">Users</h1>
        <p className="mt-1 text-sub">Manage platform users.</p>
      </div>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-sub" />
        <Input
          className="pl-9"
          placeholder="Search by email or name..."
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
          <div className="space-y-3">
            {filtered.map((user) => (
              <Card key={user.id}>
                <CardContent className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-text">
                      {user.displayName || user.email}
                    </p>
                    <p className="text-xs text-sub">{user.email}</p>
                    <div className="mt-1 flex gap-2">
                      <Badge variant={user.role === "admin" ? "warning" : "default"}>
                        {user.role}
                      </Badge>
                      {user.isBlocked && <Badge variant="error">Blocked</Badge>}
                      {user.deletionScheduledAt && (
                        <Badge variant="error">Deletion scheduled</Badge>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    {user.isBlocked ? (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleUnblock(user.id)}
                        title="Unblock"
                      >
                        <ShieldCheck className="h-4 w-4 text-pass" />
                      </Button>
                    ) : (
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => handleBlock(user.id)}
                        title="Block"
                      >
                        <ShieldBan className="h-4 w-4 text-serious" />
                      </Button>
                    )}
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(user.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4 text-critical" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Pagination */}
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
