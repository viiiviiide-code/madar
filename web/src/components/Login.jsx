import React, { useState } from "react";
import { Lock, User, Eye, EyeOff, LogIn } from "lucide-react";
import { api, auth } from "../api";

export default function Login({ onLogin }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const submit = async (e) => {
    e.preventDefault();
    if (!username.trim() || !password) { setError("نام کاربری و رمز عبور را وارد کنید."); return; }
    setBusy(true); setError("");
    try {
      const res = await api.login(username.trim(), password);
      auth.setSession(res.token, { username: res.username, role: res.role });
      onLogin({ username: res.username, role: res.role });
    } catch (err) {
      setError(err.message || "ورود ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-screen">
      <div className="login-card">
        <div className="login-brand">
          <span className="brand-mark" />
          <div>
            <b>تلاش</b>
            <em>آرشیو فعالیت‌ها و آثار مجموعه</em>
          </div>
        </div>

        <h2 className="login-title">ورود به سامانه</h2>
        <p className="login-sub">با حساب نمایش یا حساب مدیریت وارد شوید.</p>

        <form className="login-form" onSubmit={submit}>
          <label className="login-field">
            <User size={16} className="login-ic" />
            <input
              type="text"
              placeholder="نام کاربری"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
            />
          </label>

          <label className="login-field">
            <Lock size={16} className="login-ic" />
            <input
              type={showPass ? "text" : "password"}
              placeholder="رمز عبور"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
            />
            <button type="button" className="login-eye" onClick={() => setShowPass((v) => !v)} tabIndex={-1}>
              {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
            </button>
          </label>

          {error && <div className="login-error">{error}</div>}

          <button type="submit" className="btn gold login-submit" disabled={busy}>
            <LogIn size={16} />
            {busy ? "در حال ورود…" : "ورود"}
          </button>
        </form>
      </div>
    </div>
  );
}
