import { useEffect, useRef } from "react";
import { useLocation } from "react-router-dom";
import { track } from "@/lib/analytics";

/** Emits page_view on every route change, plus workbench_enter for the funnel. */
export default function Analytics() {
  const { pathname, search } = useLocation();
  const last = useRef<string>("");

  useEffect(() => {
    const key = pathname + search;
    if (last.current === key) return;
    last.current = key;
    track("page_view", { path: pathname });
    if (pathname.startsWith("/workbench")) track("workbench_enter");
    if (pathname.startsWith("/match")) track("match_view");
    if (pathname.startsWith("/auth")) track("auth_prompt");
  }, [pathname, search]);

  return null;
}
