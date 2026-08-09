import { useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import JobProfile from "./JobProfile";
import Profile from "./Profile";
import { getUI, putJob, setUI } from "@/lib/wfy";
import { runMatch, aiMessage, isJobProfileId } from "@/lib/ai";
import { useAuth } from "@/hooks/useAuth";
import "@/styles/pages/workbench.css";

/** 02 · WORKBENCH — JD 解析（左）与个人画像（右）合并为一页，功能与原页面完全一致。 */
export default function Workbench() {
  const navigate = useNavigate();
  const { search } = useLocation();
  const { user } = useAuth();

  const jobColRef = useRef<HTMLDivElement>(null);
  const profileColRef = useRef<HTMLDivElement>(null);

  const [jobState, setJobState] = useState("empty");
  const [profileState, setProfileState] = useState("empty");
  const [matching, setMatching] = useState(false);
  const [mergeGo, setMergeGo] = useState(false);
  const [mineSvg, setMineSvg] = useState("");
  const [roleSvg, setRoleSvg] = useState("");
  const [cap, setCap] = useState("Overlaying two flowers · computing fit");
  const [hint, setHint] = useState("");

  const ready = jobState === "bloomed" && profileState === "bloomed";

  const jobId = useMemo(() => {
    const fromUrl = new URLSearchParams(search).get("job");
    if (isJobProfileId(fromUrl)) return fromUrl;
    const jp = getUI<{ job?: { id?: string } }>("jobprofile");
    const storedJobId = jp?.job?.id;
    if (isJobProfileId(storedJobId)) return storedJobId;
    const m = getUI<{ jobId?: string }>("match");
    const matchedJobId = m?.jobId;
    return isJobProfileId(matchedJobId) ? matchedJobId : null;
  }, [search, jobState, matching]);

  async function onMatch() {
    if (!ready || matching) return;
    if (!user) {
      navigate(`/auth?next=${encodeURIComponent("/workbench")}`);
      return;
    }
    const id = jobId;
    if (!id) {
      setHint("岗位信息缺失，请重新建立岗位画像");
      return;
    }
    setMineSvg(profileColRef.current?.querySelector("#flowerSvg")?.outerHTML || "");
    setRoleSvg(jobColRef.current?.querySelector("#flowerSvg")?.outerHTML || "");
    setCap("Overlaying two flowers · computing fit");
    setMergeGo(true);
    setMatching(true);
    setHint("");
    try {
      const { job } = await runMatch(id);
      // Keep a local record so the match report, pool and delivery board can
      // resolve this job without another round-trip.
      const bj = job as Record<string, unknown> | undefined;
      if (bj?.id) {
        putJob({
          id: String(bj.id),
          title: String(bj.title ?? "待确认"),
          co: String(bj.company ?? "待确认"),
          loc: String(bj.location ?? "待确认"),
          m: 0,
          s: "待确认",
          yes: "JD 匹配",
          no: "待确认",
        });
      }
      setUI("match", { jobId: id });
      setCap("Match computed · entering");
      navigate("/match?job=" + encodeURIComponent(id) + "&fresh=1");

    } catch (e) {
      setHint(aiMessage(e));
      setMatching(false);
      setMergeGo(false);
    }
  }

  return (
    <div className="p-workbench">
      <main className="page">
        <TopBar />

        <section className="wb-grid">
          <div className="wb-col" ref={jobColRef}>
            <JobProfile embedded onStateChange={setJobState} />
          </div>
          <div className="wb-col" ref={profileColRef}>
            <Profile embedded onStateChange={setProfileState} />
          </div>
        </section>

        <div className="wb-foot">
          <button className="btn ghost" type="button" onClick={() => navigate("/")}>
            ← 返回
          </button>
          <button
            className={"btn" + (matching ? " loading" : "")}
            type="button"
            disabled={!ready || matching}
            onClick={onMatch}
          >
            {matching ? (
              <>
                匹配中<span className="dot"></span><span className="dot"></span><span className="dot"></span>
              </>
            ) : (
              "进入匹配 →"
            )}
          </button>
          <span className="wb-hint">
            {hint || (ready ? "两朵花已就绪 · 可以开始匹配" : "先建立岗位画像与个人画像")}
          </span>
        </div>
      </main>

      <div className="p-profile">
        <div className={"merge" + (matching ? " on" : "") + (mergeGo ? " go" : "")} id="merge">
          <div className="arena">
            <div className="mine" id="mergeMine" dangerouslySetInnerHTML={{ __html: mineSvg }} />
            <div className="role" id="mergeRole" dangerouslySetInnerHTML={{ __html: roleSvg }} />
          </div>
          <div className="caps">
            <span className="cap">Your flower</span>
            <span className="cap">Role flower</span>
          </div>
          <div className="cap" id="mergeCap">{cap}</div>
        </div>
      </div>
    </div>
  );
}
