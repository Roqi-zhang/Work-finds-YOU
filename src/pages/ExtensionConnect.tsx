import { useState } from "react";
import { Link } from "react-router-dom";
import TopBar from "@/components/swiss/TopBar";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

const box: React.CSSProperties = { maxWidth: 640, margin: "64px auto", padding: "0 24px", lineHeight: 1.7 };

export default function ExtensionConnect() {
  const { user } = useAuth() as { user: { email?: string } | null };
  const [token, setToken] = useState("");
  const [msg, setMsg] = useState("");

  const connect = async () => {
    setMsg("生成中…");
    const { data, error } = await supabase.functions.invoke("extension-token", { body: {} });
    if (error || !data?.token) return setMsg("生成失败，请重试");
    setToken(data.token);
    window.postMessage({ type: "WFY_EXTENSION_TOKEN", token: data.token, email: data.email }, window.location.origin);
    setMsg("已连接。如扩展未自动识别，请复制下方连接码粘贴到扩展中。");
  };
  const revoke = async () => {
    await supabase.functions.invoke("extension-token", { body: { action: "revoke" } });
    setToken("");
    setMsg("已断开所有扩展连接。");
  };
  const download = () =>
    fetch("/wfy-extension.zip").then((r) => r.blob()).then((b) => {
      const a = document.createElement("a");
      a.href = URL.createObjectURL(b);
      a.download = "wfy-extension.zip";
      a.click();
      URL.revokeObjectURL(a.href);
    });

  return (
    <>
      <TopBar />
      <main style={box}>
        <h1 style={{ fontSize: 40, margin: 0 }}>BROWSER EXTENSION</h1>
        <p>在任意招聘网站一键保存职位到「投递管理」。</p>
        <h3>01 安装</h3>
        <ol>
          <li><button className="btn" onClick={download}>下载扩展</button> 并解压</li>
          <li>打开 chrome://extensions，开启右上角「开发者模式」</li>
          <li>点击「加载已解压的扩展程序」，选择解压后的文件夹</li>
        </ol>
        <h3>02 连接账号</h3>
        {user ? (
          <>
            <p>当前账号：{user.email}</p>
            <button className="btn" onClick={connect}>连接扩展</button>{" "}
            <button className="btn" onClick={revoke}>断开所有连接</button>
          </>
        ) : (
          <p>请先 <Link to="/auth?redirect=/extension/connect">登录</Link>。</p>
        )}
        {msg && <p>{msg}</p>}
        {token && <textarea readOnly value={token} style={{ width: "100%", fontFamily: "monospace", fontSize: 12 }} rows={2} onFocus={(e) => e.target.select()} />}
      </main>
    </>
  );
}
