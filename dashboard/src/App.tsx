import { Routes, Route, Navigate } from "react-router";
import { useAuth } from "@/lib/auth";
import DashboardLayout from "@/components/layout/DashboardLayout";
import LoginPage from "@/pages/LoginPage";
import AuthErrorPage from "@/components/AuthErrorPage";
import OverviewPage from "@/pages/dashboard/OverviewPage";
import ConnectionsPage from "@/pages/dashboard/ConnectionsPage";
import SettingsPage from "@/pages/dashboard/SettingsPage";
import AdminStatsPage from "@/pages/admin/StatsPage";
import AdminUsersPage from "@/pages/admin/UsersPage";
import AdminModelsPage from "@/pages/admin/ModelsPage";
import AdminAuditPage from "@/pages/admin/AuditPage";
import AdminJobsPage from "@/pages/admin/JobsPage";
import AdminDeletionsPage from "@/pages/admin/DeletionsPage";
import AdminMetricsPage from "@/pages/admin/MetricsPage";
import { Loader2 } from "lucide-react";

function RequireAuth({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading, error } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error page if there's a connection error and user is not authenticated
  if (error && !isAuthenticated) {
    return <AuthErrorPage />;
  }

  return isAuthenticated ? <>{children}</> : <Navigate to="/login" replace />;
}

function RequireAdmin({ children }: { children: React.ReactNode }) {
  const { isAdmin, isLoading, error, isAuthenticated } = useAuth();

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  // Show error page if there's a connection error and user is not authenticated
  if (error && !isAuthenticated) {
    return <AuthErrorPage />;
  }

  return isAdmin ? <>{children}</> : <Navigate to="/dashboard" replace />;
}

export default function App() {
  return (
    <Routes>
      <Route path="/" element={<Navigate to="/dashboard" replace />} />
      <Route path="/login" element={<LoginPage />} />
      <Route
        element={
          <RequireAuth>
            <DashboardLayout />
          </RequireAuth>
        }
      >
        <Route path="/dashboard" element={<OverviewPage />} />
        <Route path="/dashboard/connections" element={<ConnectionsPage />} />
        <Route path="/dashboard/settings" element={<SettingsPage />} />
        <Route
          path="/admin"
          element={
            <RequireAdmin>
              <AdminStatsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/users"
          element={
            <RequireAdmin>
              <AdminUsersPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/models"
          element={
            <RequireAdmin>
              <AdminModelsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/audit"
          element={
            <RequireAdmin>
              <AdminAuditPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/jobs"
          element={
            <RequireAdmin>
              <AdminJobsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/deletions"
          element={
            <RequireAdmin>
              <AdminDeletionsPage />
            </RequireAdmin>
          }
        />
        <Route
          path="/admin/metrics"
          element={
            <RequireAdmin>
              <AdminMetricsPage />
            </RequireAdmin>
          }
        />
      </Route>
      <Route path="*" element={<Navigate to="/dashboard" replace />} />
    </Routes>
  );
}
