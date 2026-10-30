import { supabase } from "@/integrations/supabase/client";
import { getApplications, saveApplications, type Application } from "@/lib/wfy";

/** Pull jobs saved by the browser extension into the local job tracker. Returns true if anything changed. */
export async function importExtensionJobs(): Promise<boolean> {
  const { data: s } = await supabase.auth.getSession();
  if (!s.session) return false;
  const { data, error } = await supabase
    .from("saved_jobs")
    .select("id,title,company,location,salary,url,jd_text,status,note,created_at")
    .is("imported_at", null)
    .limit(100);
  if (error || !data?.length) return false;
  const list = getApplications();
  for (const j of data) {
    const id = "ext-" + j.id;
    const at = (j.created_at || new Date().toISOString()).slice(0, 10);
    const meta = [j.location, j.salary].filter(Boolean).join(" · ");
    const body = [`[EXT] ${j.url}`, meta, j.note].filter(Boolean).join("\n");
    const app = {
      id, co: j.company || "", title: j.title, m: 0, status: j.status, appliedAt: at, updatedAt: at,
      body, quote: (j.jd_text || "").slice(0, 400), manual: true, events: [{ status: j.status, at }],
    } as Application;
    const i = list.findIndex((a) => a.id === id);
    if (i >= 0) list[i] = { ...list[i], ...app, events: list[i].events }; else list.unshift(app);
  }
  saveApplications(list);
  await supabase.from("saved_jobs").update({ imported_at: new Date().toISOString() }).in("id", data.map((j) => j.id));
  return true;
}
