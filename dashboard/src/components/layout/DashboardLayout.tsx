import { NavLink, Outlet, useNavigate, useLocation } from "react-router";
import { useAuth } from "@/lib/auth";
import { UserButton } from "@clerk/clerk-react";
import { isClerkAuth } from "@/lib/auth-mode";
import { useState, useEffect } from "react";
import {
  LayoutDashboard,
  Link2,
  Settings,
  Shield,
  Users,
  Activity,
  ScrollText,
  Cpu,
  BarChart3,
  LogOut,
  Menu,
  X,
  Trash2,
  BarChart2,
} from "lucide-react";
import { Button } from "@/components/ui/button";

const userNav = [
  { to: "/dashboard", icon: LayoutDashboard, label: "Overview" },
  { to: "/dashboard/connections", icon: Link2, label: "Connections" },
  { to: "/dashboard/settings", icon: Settings, label: "Settings" },
];

const adminNav = [
  { to: "/admin", icon: BarChart3, label: "Stats" },
  { to: "/admin/users", icon: Users, label: "Users" },
  { to: "/admin/models", icon: Cpu, label: "Models" },
  { to: "/admin/audit", icon: ScrollText, label: "Audit Log" },
  { to: "/admin/jobs", icon: Activity, label: "Jobs" },
  { to: "/admin/deletions", icon: Trash2, label: "Deletions" },
  { to: "/admin/metrics", icon: BarChart2, label: "Metrics" },
];

function NavItem({ to, icon: Icon, label }: { to: string; icon: React.ElementType; label: string }) {
  return (
    <NavLink
      to={to}
      end={to === "/dashboard" || to === "/admin"}
      className={({ isActive }) =>
        `flex items-center gap-3 rounded-[6px] px-3 py-2 text-[13px] font-medium transition-colors ${
          isActive
            ? "bg-primary/10 text-primary-light"
            : "text-sub hover:text-text hover:bg-surface-3"
        }`
      }
    >
      <Icon className="h-4 w-4" />
      {label}
    </NavLink>
  );
}

export default function DashboardLayout() {
  const { profile, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Close sidebar on navigation
  useEffect(() => {
    setMobileOpen(false);
  }, [location.pathname]);

  const handleLogout = async () => {
    await logout();
    navigate("/login"); // Navigate to login instead of root
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Mobile overlay backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-60 shrink-0 flex-col border-r border-border bg-surface-2 transition-transform duration-200 ease-in-out md:relative md:translate-x-0 ${
          mobileOpen ? "translate-x-0 shadow-2xl" : "-translate-x-full"
        }`}
      >
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <svg className="h-6 w-6 shrink-0" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" stroke="#5b8dee" strokeWidth="2" />
            <circle cx="12" cy="9.2" r="1.8" fill="#5b8dee" />
            <path d="M10.2 12.5h3.6M12 12.5v4.5" stroke="#5b8dee" strokeWidth="1.9" strokeLinecap="round" />
            <line x1="18.5" y1="18.5" x2="25" y2="25" stroke="#5b8dee" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-bold text-text">
            A11y<span className="text-sub">/</span>DevTools
          </span>
          {/* Close button — mobile only */}
          <button
            className="ml-auto rounded p-1 text-sub hover:text-text md:hidden"
            onClick={() => setMobileOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Navigation */}
        <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-4">
          <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sub">
            Dashboard
          </p>
          {userNav.map((item) => (
            <NavItem key={item.to} {...item} />
          ))}

          {isAdmin && (
            <>
              <div className="my-4 border-t border-border" />
              <p className="mb-2 px-3 text-[11px] font-semibold uppercase tracking-wider text-sub">
                <Shield className="mr-1 inline h-3 w-3" />
                Admin
              </p>
              {adminNav.map((item) => (
                <NavItem key={item.to} {...item} />
              ))}
            </>
          )}
        </nav>

        {/* User footer */}
        <div className="border-t border-border px-4 py-3">
          <div className="flex items-center gap-3">
            {isClerkAuth ? (
              <UserButton
                appearance={{
                  elements: {
                    avatarBox: "h-8 w-8",
                  },
                }}
              />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary-light">
                {(profile?.displayName?.[0] ?? profile?.email?.[0] ?? "?").toUpperCase()}
              </div>
            )}
            <div className="flex-1 min-w-0">
              <p className="truncate text-sm font-medium text-text">
                {profile?.displayName || profile?.email}
              </p>
              <p className="truncate text-xs text-sub">{profile?.role}</p>
            </div>
            <Button variant="ghost" size="icon" onClick={handleLogout} title="Log out">
              <LogOut className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </aside>

      {/* Content area */}
      <div className="flex flex-1 flex-col overflow-hidden">
        {/* Mobile top bar */}
        <header className="flex shrink-0 items-center gap-3 border-b border-border bg-surface-2 px-4 py-3 md:hidden">
          <button
            onClick={() => setMobileOpen(true)}
            aria-label="Open navigation menu"
            className="rounded p-1 text-sub hover:text-text"
          >
            <Menu className="h-5 w-5" />
          </button>
          <svg className="h-5 w-5 shrink-0" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" stroke="#5b8dee" strokeWidth="2" />
            <circle cx="12" cy="9.2" r="1.8" fill="#5b8dee" />
            <path d="M10.2 12.5h3.6M12 12.5v4.5" stroke="#5b8dee" strokeWidth="1.9" strokeLinecap="round" />
            <line x1="18.5" y1="18.5" x2="25" y2="25" stroke="#5b8dee" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-bold text-text">
            A11y<span className="text-sub">/</span>DevTools
          </span>
          <div className="ml-auto">
            {isClerkAuth ? (
              <UserButton appearance={{ elements: { avatarBox: "h-8 w-8" } }} />
            ) : (
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/20 text-sm font-medium text-primary-light">
                {(profile?.displayName?.[0] ?? profile?.email?.[0] ?? "?").toUpperCase()}
              </div>
            )}
          </div>
        </header>

        {/* Main content */}
        <main className="flex-1 overflow-y-auto">
          <div className="mx-auto max-w-5xl px-4 py-6 md:px-8 md:py-8">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}
