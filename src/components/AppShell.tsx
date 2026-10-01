import {
  BarChart3,
  Compass,
  Home,
  Plus,
  UserRound
} from "lucide-react";
import type { ReactNode } from "react";

export type AppTab = "home" | "discover" | "create" | "stats" | "profile";

interface AppShellProps {
  activeTab: AppTab;
  children: ReactNode;
  onNavigate: (tab: AppTab) => void;
}

const tabs = [
  { id: "home", label: "首页", icon: Home },
  { id: "discover", label: "发现", icon: Compass },
  { id: "stats", label: "统计", icon: BarChart3 },
  { id: "profile", label: "我的", icon: UserRound }
] as const;

export function AppShell({
  activeTab,
  children,
  onNavigate
}: AppShellProps) {
  return (
    <div className="app-shell">
      <main className="app-main">{children}</main>
      <nav className="bottom-nav" aria-label="主导航">
        {tabs.slice(0, 2).map((tab) => (
          <NavButton
            key={tab.id}
            active={activeTab === tab.id}
            label={tab.label}
            icon={tab.icon}
            onClick={() => onNavigate(tab.id)}
          />
        ))}
        <button
          type="button"
          className={`create-button ${activeTab === "create" ? "is-active" : ""}`}
          onClick={() => onNavigate("create")}
          aria-label="创建卡片"
        >
          <Plus size={25} strokeWidth={2.4} />
        </button>
        {tabs.slice(2).map((tab) => (
          <NavButton
            key={tab.id}
            active={activeTab === tab.id}
            label={tab.label}
            icon={tab.icon}
            onClick={() => onNavigate(tab.id)}
          />
        ))}
      </nav>
    </div>
  );
}

function NavButton({
  active,
  label,
  icon: Icon,
  onClick
}: {
  active: boolean;
  label: string;
  icon: typeof Home;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`nav-button ${active ? "is-active" : ""}`}
      onClick={onClick}
      aria-current={active ? "page" : undefined}
    >
      <Icon size={21} strokeWidth={active ? 2.4 : 1.8} />
      <span>{label}</span>
    </button>
  );
}
