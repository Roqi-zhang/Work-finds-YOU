// Lightweight first-party analytics. Fire-and-forget: never blocks or breaks the UI.
import { supabase } from "@/integrations/supabase/client";
import { getGuestKey } from "@/lib/guest";

const SESSION_KEY = "wfy.sessionId";
const FN_URL = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/track`;

type Props = Record<string, unknown>;

function sessionId(): string {
  try {
    let v = sessionStorage.getItem(SESSION_KEY);
    if (!v) {
      v = (crypto.randomUUID?.() || Math.random().toString(36).slice(2) + Date.now().toString(36)).replace(/-/g, "");
      sessionStorage.setItem(SESSION_KEY, v);
    }
    return v;
  } catch {
    return "nosession";
  }
}

function device(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent;
  if (/iPad|Tablet/i.test(ua)) return "tablet";
  if (/Mobi|Android|iPhone/i.test(ua)) return "mobile";
  return "desktop";
}

function utm() {
  try {
    const q = new URLSearchParams(window.location.search);
    return {
      utm_source: q.get("utm_source") || undefined,
      utm_medium: q.get("utm_medium") || undefined,
      utm_campaign: q.get("utm_campaign") || undefined,
    };
  } catch {
    return {};
  }
}

let queue: Record<string, unknown>[] = [];
let timer: ReturnType<typeof setTimeout> | null = null;

async function flush(useBeacon = false) {
  if (!queue.length) return;
  const events = queue;
  queue = [];
  if (timer) {
    clearTimeout(timer);
    timer = null;
  }
  const payload = JSON.stringify({ events });
  try {
    if (useBeacon && typeof navigator !== "undefined" && navigator.sendBeacon) {
      navigator.sendBeacon(FN_URL, new Blob([payload], { type: "application/json" }));
      return;
    }
    const { data } = await supabase.auth.getSession();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = data.session?.access_token;
    if (token) headers.Authorization = `Bearer ${token}`;
    await fetch(FN_URL, { method: "POST", headers, body: payload, keepalive: true });
  } catch {
    // Analytics must stay silent.
  }
}

/** Record one product event. Safe to call anywhere, including inside catch blocks. */
export function track(event: string, props: Props = {}) {
  try {
    queue.push({
      event,
      session_id: sessionId(),
      visitor_id: getGuestKey(),
      path: typeof window !== "undefined" ? window.location.pathname : null,
      referrer: typeof document !== "undefined" ? document.referrer || null : null,
      device: device(),
      ...utm(),
      props,
    });
    if (queue.length >= 10) {
      void flush();
      return;
    }
    if (!timer) timer = setTimeout(() => void flush(), 1500);
  } catch {
    // ignore
  }
}

/** Measure an async step and emit success/fail events with duration + reason. */
export async function trackStep<T>(
  name: "jd_parse" | "resume_parse" | "match",
  run: () => Promise<T>,
  props: Props = {},
): Promise<T> {
  const started = Date.now();
  try {
    const out = await run();
    track(`${name}_success`, { ...props, ms: Date.now() - started });
    return out;
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    track(`${name}_fail`, { ...props, ms: Date.now() - started, reason: message.slice(0, 160) });
    if (/额度|登录|limit|quota/i.test(message)) track("quota_blocked", { step: name });
    throw e;
  }
}

if (typeof window !== "undefined") {
  window.addEventListener("pagehide", () => void flush(true));
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") void flush(true);
  });
}
