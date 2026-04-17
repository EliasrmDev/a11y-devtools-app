import { NavLink, Outlet, useNavigate } from "react-router";
import { useAuth } from "@/lib/auth";
import { UserButton } from "@clerk/clerk-react";
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

  const handleLogout = async () => {
    await logout();
    navigate("/");
  };

  return (
    <div className="flex h-screen overflow-hidden">
      {/* Sidebar */}
      <aside className="flex w-60 shrink-0 flex-col border-r border-border bg-surface-2">
        {/* Logo */}
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <svg className="h-6 w-6" viewBox="0 0 28 28" fill="none" aria-hidden="true">
            <circle cx="12" cy="12" r="8.5" stroke="#5b8dee" strokeWidth="2" />
            <circle cx="12" cy="9.2" r="1.8" fill="#5b8dee" />
            <path d="M10.2 12.5h3.6M12 12.5v4.5" stroke="#5b8dee" strokeWidth="1.9" strokeLinecap="round" />
            <line x1="18.5" y1="18.5" x2="25" y2="25" stroke="#5b8dee" strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          <span className="text-sm font-bold text-text">
            A11y<span className="text-sub">/</span>DevTools
          </span>
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
            <UserButton
              appearance={{
                elements: {
                  avatarBox: "h-8 w-8",
                },
              }}
            />
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

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto max-w-5xl px-8 py-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
