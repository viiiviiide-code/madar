import React, { useState } from "react";
import { Lock, X, KeyRound } from "lucide-react";
import { api } from "../api";

export default function ChangePasswordModal({ onClose }) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!currentPassword || !newPassword || !confirmPassword) {
      setError("همهٔ فیلدها را پر کنید.");
      return;
    }
    if (newPassword.length < 6) {
      setError("رمز جدید باید حداقل ۶ کاراکتر باشد.");
      return;
    }
    if (newPassword !== confirmPassword) {
      setError("رمز جدید و تکرار آن یکسان نیستند.");
      return;
    }
    setBusy(true);
    try {
      await api.changePassword(currentPassword, newPassword);
      setDone(true);
    } catch (err) {
      setError(err.message || "تغییر رمز ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="cp-overlay" onClick={onClose}>
      <div className="cp-card" onClick={(e) => e.stopPropagation()}>
        <div className="cp-head">
          <div className="cp-head-t">
            <KeyRound size={17} />
            <span>تغییر رمز عبور</span>
          </div>
          <button className="icon-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {done ? (
          <div className="cp-done">
            <p>رمز عبور با موفقیت تغییر کرد.</p>
            <button className="btn gold sm" onClick={onClose}>باشه</button>
          </div>
        ) : (
          <form className="login-form" onSubmit={submit}>
            <label className="login-field">
              <Lock size={16} className="login-ic" />
              <input
                type="password"
                placeholder="رمز فعلی"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                autoComplete="current-password"
                autoFocus
              />
            </label>
            <label className="login-field">
              <Lock size={16} className="login-ic" />
              <input
                type="password"
                placeholder="رمز جدید (حداقل ۶ کاراکتر)"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>
            <label className="login-field">
              <Lock size={16} className="login-ic" />
              <input
                type="password"
                placeholder="تکرار رمز جدید"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                autoComplete="new-password"
              />
            </label>

            {error && <div className="login-error">{error}</div>}

            <button type="submit" className="btn gold login-submit" disabled={busy}>
              {busy ? "در حال ذخیره…" : "ذخیرهٔ رمز جدید"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
