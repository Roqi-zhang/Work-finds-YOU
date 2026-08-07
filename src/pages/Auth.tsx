import { useEffect, useState, CSSProperties } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { lovable } from "@/integrations/lovable/index";
import { useAuth } from "@/hooks/useAuth";

const INK = "#0A0A0A";
const BG = "#F1F1F1";
const LINE = "#D4D4D4";
const MUTED = "#888888";

const label: CSSProperties = {
  fontSize: 10,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  color: MUTED,
  display: "block",
  marginBottom: 8,
};

const input: CSSProperties = {
  width: "100%",
  padding: "12px 0",
  border: 0,
  borderBottom: `0.5px solid ${LINE}`,
  background: "transparent",
  fontSize: 14,
  color: INK,
  outline: "none",
  fontFamily: "inherit",
};

const button: CSSProperties = {
  width: "100%",
  padding: "14px 0",
  border: `0.5px solid ${INK}`,
  background: INK,
  color: BG,
  fontSize: 11,
  letterSpacing: "0.18em",
  textTransform: "uppercase",
  cursor: "pointer",
  fontFamily: "inherit",
};

const ghostButton: CSSProperties = {
  ...button,
  background: "transparent",
  color: INK,
  borderColor: LINE,
};

const safeNext = (raw: string | null) =>
  raw && raw.startsWith("/") && !raw.startsWith("//") ? raw : "/";

const Auth = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const { session, loading: authLoading } = useAuth();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const next = safeNext(new URLSearchParams(location.search).get("next"));

  useEffect(() => {
    if (!authLoading && session) navigate(next, { replace: true });
  }, [authLoading, session, navigate, next]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setMessage(null);

    if (mode === "signup") {
      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: window.location.origin + next },
      });
      if (err) setError(err.message);
      else if (!data.session) setMessage("注册成功，请查收邮件并点击确认链接后登录。");
    } else {
      const { error: err } = await supabase.auth.signInWithPassword({ email, password });
      if (err) setError(err.message);
    }
    setBusy(false);
  };

  const google = async () => {
    setError(null);
    const result = await lovable.auth.signInWithOAuth("google", {
      redirect_uri: window.location.origin + next,
    });
    if (result.error) {
      setError("Google 登录失败，请重试。");
      return;
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: BG,
        color: INK,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 24,
        fontFamily: "Inter, system-ui, sans-serif",
      }}
    >
      <main style={{ width: "100%", maxWidth: 360 }}>
        <div style={{ fontSize: 10, letterSpacing: "0.24em", textTransform: "uppercase", color: MUTED }}>
          Job Seek You
        </div>
        <h1 style={{ fontSize: 34, fontWeight: 500, letterSpacing: "-0.02em", margin: "14px 0 40px" }}>
          {mode === "signin" ? "登录。" : "注册。"}
        </h1>

        <form onSubmit={submit}>
          <div style={{ marginBottom: 28 }}>
            <label style={label} htmlFor="email">Email</label>
            <input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={input}
              autoComplete="email"
            />
          </div>
          <div style={{ marginBottom: 36 }}>
            <label style={label} htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              required
              minLength={6}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={input}
              autoComplete={mode === "signin" ? "current-password" : "new-password"}
            />
          </div>

          {error && (
            <p style={{ fontSize: 12, color: "#B4231F", marginBottom: 16 }}>{error}</p>
          )}
          {message && (
            <p style={{ fontSize: 12, color: MUTED, marginBottom: 16 }}>{message}</p>
          )}

          <button type="submit" disabled={busy} style={{ ...button, opacity: busy ? 0.5 : 1 }}>
            {busy ? "处理中" : mode === "signin" ? "登录" : "创建账号"}
          </button>
        </form>

        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            margin: "24px 0",
            fontSize: 10,
            letterSpacing: "0.18em",
            color: MUTED,
          }}
        >
          <span style={{ flex: 1, height: 0, borderTop: `0.5px solid ${LINE}` }} />
          OR
          <span style={{ flex: 1, height: 0, borderTop: `0.5px solid ${LINE}` }} />
        </div>

        <button type="button" onClick={google} style={ghostButton}>
          使用 Google 继续
        </button>

        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setError(null);
            setMessage(null);
          }}
          style={{
            marginTop: 28,
            background: "none",
            border: 0,
            padding: 0,
            color: MUTED,
            fontSize: 11,
            letterSpacing: "0.08em",
            cursor: "pointer",
            fontFamily: "inherit",
          }}
        >
          {mode === "signin" ? "还没有账号？去注册 →" : "已有账号？去登录 →"}
        </button>
      </main>
    </div>
  );
};

export default Auth;
