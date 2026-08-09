import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";
import { useQuota } from "@/hooks/useQuota";


const NAV = [
  { to: "/", label: "01 Home", end: true },
  { to: "/workbench", label: "02 Workbench" },
  { to: "/match", label: "03 Match" },
  { to: "/compare", label: "04 Compare" },
  { to: "/delivery", label: "05 Delivery" },
];


export default function TopBar({ date = "2026 · 07 · 12" }: { date?: string }) {
  const { toggle } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const { remaining, limit, unlimited } = useQuota();
  return (
    <header className="topbar">
      <div className="logo">Work Finds You / 工作找你</div>
      <nav>
        {NAV.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.end}
            className={({ isActive }) => (isActive ? "on" : "")}
          >
            {n.label}
          </NavLink>
        ))}
      </nav>
      <div className="right">
        <span className="caption">{date}</span>
        {user && unlimited && <span className="caption">开发者 · 不限次</span>}
        {user && !unlimited && remaining != null && (
          <span className="caption" title={`每天 ${limit} 次分析（岗位 / 简历 / 匹配合计）`}>
            今日剩余 {remaining}/{limit}
          </span>
        )}
        {user ? (
          <button
            className="caption"
            style={{ background: "none", border: 0, cursor: "pointer", color: "inherit" }}
            onClick={async () => {
              await signOut();
              navigate("/auth");
            }}
          >
            登出
          </button>
        ) : (
          <NavLink to="/auth" className="caption">
            登录
          </NavLink>
        )}
        <button className="theme-toggle" aria-label="toggle theme" onClick={toggle} />
      </div>
    </header>
  );
}

