import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import { supabase } from "@/integrations/supabase/client";
import "@/styles/pages/jobprofile.css";

type Dim = {
  key?: string;
  label?: string;
  score?: number | null;
  level?: string;
  evidence?: string;
  analysis?: string;
  why?: string;
  evidenceDetail?: { label?: string; claim?: string; quotes?: string[] }[];
};

const GROUPS = [
  { title: "01 · Can do · 能不能做", idx: [0, 1, 2] },
  { title: "02 · Can deliver · 能不能做成", idx: [3, 4, 5] },
  { title: "03 · Long-term fit · 能不能长期适配", idx: [6, 7] },
];

const LABELS = ["专业技能", "业务理解", "问题分析", "执行交付", "沟通表达", "协作影响", "学习适应", "动机匹配"];

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default function Snapshot() {
  const navigate = useNavigate();
  const location = useLocation();
  const q = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const jobId = (q.get("job") || "").trim();
  const kind = q.get("kind") === "resume" ? "resume" : "job";

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [head, setHead] = useState<{ title: string; sub: string }>({ title: "—", sub: "" });
  const [dims, setDims] = useState<Dim[]>([]);

  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setError(null);
      if (!UUID.test(jobId)) {
        if (alive) { setError("这条记录还没有可查看的分析快照。"); setLoading(false); }
        return;
      }
      try {
        if (kind === "job") {
          const { data, error } = await supabase
            .from("job_profiles")
            .select("title, company, location, dimensions")
            .eq("id", jobId)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("未找到该岗位的画像快照。");
          if (!alive) return;
          setHead({
            title: data.title || "岗位画像",
            sub: [data.company, data.location].filter(Boolean).join(" · "),
          });
          setDims((data.dimensions as unknown as Dim[]) || []);
        } else {
          const { data, error } = await supabase
            .from("user_profiles")
            .select("dimensions, updated_at")
            .eq("target_job_profile_id", jobId)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (error) throw error;
          if (!data) throw new Error("这个岗位下还没有生成个人画像。");
          if (!alive) return;
          setHead({ title: "个人画像", sub: "针对该岗位生成的候选人画像快照" });
          setDims((data.dimensions as unknown as Dim[]) || []);
        }
      } catch (e) {
        if (alive) setError((e as Error).message || "读取失败");
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [jobId, kind]);

  return (
    <div className="p-jobprofile">
      <main className="page">
        <TopBar />

        <section className="layout wb">
          <aside className="side">
            <div className="caption">{kind === "job" ? "Snapshot · Job Profile" : "Snapshot · Candidate Profile"}</div>
            <h1 style={{ marginTop: 12 }}>{head.title}</h1>
            {head.sub && <p>{head.sub}</p>}
            <div className="actions">
              <button className="btn ghost" type="button" onClick={() => navigate("/delivery")}>← 返回投递管理</button>
            </div>
          </aside>

          <section className="stage">
            <div className="stage-head">
              <span className="caption">Analysis snapshot · 8 competencies</span>
            </div>

            {loading && <p style={{ opacity: 0.6, fontSize: 13 }}>LOADING…</p>}
            {!loading && error && <p style={{ opacity: 0.7, fontSize: 13 }}>{error}</p>}

            {!loading && !error && (
              <div className="legend">
                {GROUPS.map((g) => (
                  <div className="g" key={g.title}>
                    <h4>{g.title}</h4>
                    {g.idx.map((i) => {
                      const d = dims[i] || {};
                      const s = d.score;
                      return (
                        <div className="p" key={i}>
                          <div className="ph">
                            <span>
                              {d.label || LABELS[i]}
                              <em>{d.key || ""}</em>
                            </span>
                            <b>{s == null ? "—" : s + "/5"}</b>
                          </div>
                          <div className={"bar" + (s == null ? " none" : "")}>
                            {Array.from({ length: 5 }, (_, n) => (
                              <i className={s != null && n < s ? "on" : ""} key={n} />
                            ))}
                          </div>
                          <dl>
                            <div className="r">
                              <span className="k">Analysis</span>
                              <span className="v">{d.analysis || d.why || "—"}</span>
                            </div>
                            <div className="r">
                              <span className="k">Evidence</span>
                              <span className="v">
                                {d.evidenceDetail?.length ? (
                                  <span className="evi">
                                    {d.evidenceDetail.map((ev, n) => (
                                      <span className="evi-i" key={n}>
                                        <span className="evi-m">{ev.label || "简历原文"}</span>
                                        {ev.claim && <span className="evi-r">{ev.claim}</span>}
                                        {(ev.quotes || []).map((q, qi) => (
                                          <span className="evi-q" key={qi}>「{q}」</span>
                                        ))}
                                      </span>
                                    ))}
                                  </span>
                                ) : (
                                  d.evidence || "—"
                                )}
                              </span>
                            </div>
                          </dl>

                          <div className="str">[{String(d.level || "missing").toUpperCase()}]</div>
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            )}
          </section>
        </section>
      </main>
    </div>
  );
}
