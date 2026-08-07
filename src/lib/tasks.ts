// Module-level background task registry.
// AI analysis runs here instead of inside a page effect, so switching routes
// (or logging in) never kills a running analysis — the page just re-subscribes.

export type TaskStatus = "idle" | "running" | "done" | "error";

export type TaskState<T = unknown> = {
  status: TaskStatus;
  result?: T;
  error?: string;
  stage?: string;
  startedAt?: number;
};

const store = new Map<string, TaskState>();
const subs = new Map<string, Set<(s: TaskState) => void>>();

function emit(key: string) {
  const s = getTask(key);
  subs.get(key)?.forEach((cb) => cb(s));
}

function set(key: string, s: TaskState) {
  store.set(key, s);
  emit(key);
}

export function getTask<T = unknown>(key: string): TaskState<T> {
  return (store.get(key) as TaskState<T>) ?? { status: "idle" };
}

export function subscribeTask<T = unknown>(key: string, cb: (s: TaskState<T>) => void) {
  if (!subs.has(key)) subs.set(key, new Set());
  const set_ = subs.get(key)!;
  set_.add(cb as (s: TaskState) => void);
  return () => set_.delete(cb as (s: TaskState) => void);
}

export function clearTask(key: string) {
  store.delete(key);
  emit(key);
}

export function setTaskStage(key: string, stage: string) {
  const cur = getTask(key);
  if (cur.status === "running") set(key, { ...cur, stage });
}

/** Start (or re-use) a background task. Returns the current state. */
export function startTask<T>(key: string, fn: () => Promise<T>): TaskState<T> {
  const cur = getTask<T>(key);
  if (cur.status === "running") return cur;
  set(key, { status: "running", startedAt: Date.now(), stage: "READING" });
  fn().then(
    (result) => set(key, { status: "done", result }),
    (e) => set(key, { status: "error", error: (e as Error)?.message || "分析失败", result: e as unknown }),
  );
  return getTask<T>(key);
}
