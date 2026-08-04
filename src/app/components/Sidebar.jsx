import { Link, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Upload,
  FolderOpen,
  Bot,
  Code,
  GitBranch,
  Globe,
  Database,
  FileText,
  Users,
  Settings,
} from "lucide-react";
import { clsx } from "clsx";

const navigation = [
  { name: "Dashboard", href: "/dashboard", icon: LayoutDashboard },
  { name: "Upload Repository", href: "/upload", icon: Upload },
  { name: "Repositories", href: "/repositories", icon: FolderOpen },
  { name: "AI Assistant", href: "/ai-chat", icon: Bot },
  { name: "Code Explorer", href: "/code-explorer", icon: Code },
  { name: "Dependencies", href: "/dependencies", icon: GitBranch },
  { name: "API Explorer", href: "/api-explorer", icon: Globe },
  { name: "Database", href: "/database", icon: Database },
  { name: "Settings", href: "/settings", icon: Settings },
];

export function Sidebar({ isOpen }) {
  const location = useLocation();
  const searchParams = new URLSearchParams(location.search);
  const repoId = searchParams.get("repoId");

  return (
    <aside
      className={clsx(
        "fixed left-0 top-[73px] h-[calc(100vh-73px)] bg-sidebar border-r border-sidebar-border transition-all duration-300 z-40",
        isOpen ? "w-64" : "w-0 -translate-x-full md:translate-x-0 md:w-16",
      )}
    >
      <nav className="p-3 space-y-1">
        {navigation.map((item) => {
          const isActive = location.pathname === item.href;
          const targetHref = repoId && [
            "/ai-chat",
            "/code-explorer",
            "/dependencies",
            "/api-explorer",
            "/database"
          ].includes(item.href)
            ? `${item.href}?repoId=${repoId}`
            : item.href;

          return (
            <Link
              key={item.name}
              to={targetHref}
              className={clsx(
                "flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors",
                isActive
                  ? "bg-sidebar-primary text-sidebar-primary-foreground"
                  : "text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
              )}
            >
              <item.icon className="w-5 h-5 shrink-0" />
              <span
                className={clsx(
                  "transition-all",
                  isOpen ? "opacity-100" : "opacity-0 md:hidden",
                )}
              >
                {item.name}
              </span>
            </Link>
          );
        })}
      </nav>
    </aside>
  );
}
