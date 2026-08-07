import { NavLink, useNavigate } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";
import { useAuth } from "@/hooks/useAuth";


const NAV = [
  { to: "/", label: "01 Home", end: true },
  { to: "/jobprofile", label: "02 Job" },
  { to: "/profile", label: "03 Profile" },
  { to: "/match", label: "04 Match" },
  { to: "/compare", label: "05 Compare" },
  { to: "/delivery", label: "06 Delivery" },
];

export default function TopBar({ date = "2026 · 07 · 12" }: { date?: string }) {
  const { toggle } = useTheme();
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
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

