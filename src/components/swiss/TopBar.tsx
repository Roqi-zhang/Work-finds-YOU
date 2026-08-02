import { NavLink } from "react-router-dom";
import { useTheme } from "@/hooks/useTheme";

const NAV = [
  { to: "/", label: "01 Home", end: true },
  { to: "/profile", label: "02 Profile" },
  { to: "/jobprofile", label: "03 Job" },
  { to: "/match", label: "04 Match" },
  { to: "/compare", label: "05 Compare" },
  { to: "/delivery", label: "06 Delivery" },
];

export default function TopBar({ date = "2026 · 07 · 12" }: { date?: string }) {
  const { toggle } = useTheme();
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
        <button className="theme-toggle" aria-label="toggle theme" onClick={toggle} />
      </div>
    </header>
  );
}
