import React, { useEffect, useState } from "react";
import { X, Plus, Trash2, UserPlus, Shield, Eye, Layers, Circle, ChevronDown, KeyRound } from "lucide-react";
import { api } from "../api";

export default function UserManagement({ templates, onClose }) {
  const [users, setUsers] = useState(null);
  const [projects, setProjects] = useState([]);
  const [newUser, setNewUser] = useState({ username: "", password: "", role: "viewer" });
  const [error, setError] = useState("");
  const [expandedId, setExpandedId] = useState(null);
  const [pwTarget, setPwTarget] = useState(null);
  const [pwVal, setPwVal] = useState("");
  const [pwErr, setPwErr] = useState("");
  const [pwBusy, setPwBusy] = useState(false);
  const [grantTplId, setGrantTplId] = useState({});   // { [userId]: templateId | "" } — for "whole template" mode
  const [grantMode, setGrantMode] = useState({});      // { [userId]: "template" | "activity" }
  const [grantTplForActivity, setGrantTplForActivity] = useState({}); // { [userId]: templateId | "" } — filter for activity picker
  const [grantProjId, setGrantProjId] = useState({}); // { [userId]: projectId | "" }

  const reload = () => api.users().then((u) => setUsers(Array.isArray(u) ? u : [])).catch(() => setUsers([]));

  useEffect(() => {
    reload();
    api.allProjects().then((p) => setProjects(Array.isArray(p) ? p : [])).catch(() => {});
  }, []);

  const addUser = async () => {
    setError("");
    if (!newUser.username.trim() || newUser.password.length < 6) {
      setError("نام کاربری و رمز عبور (حداقل ۶ کاراکتر) لازم است.");
      return;
    }
    try {
      await api.addUser(newUser.username.trim(), newUser.password, newUser.role);
      setNewUser({ username: "", password: "", role: "viewer" });
      await reload();
    } catch (e) {
      setError(e.message || "افزودن کاربر ناموفق بود.");
    }
  };

  const delUser = async (u) => {
    if (!confirm(`کاربر «${u.username}» حذف شود؟`)) return;
    try { await api.delUser(u.id); await reload(); }
    catch (e) { alert(e.message || "حذف ناموفق بود."); }
  };

  const resetPassword = async () => {
    setPwErr("");
    if (pwVal.length < 6) { setPwErr("رمز باید حداقل ۶ کاراکتر باشد."); return; }
    setPwBusy(true);
    try {
      await api.updateUser(pwTarget.id, { password: pwVal });
      setPwTarget(null); setPwVal("");
    } catch (e) {
      setPwErr(e.message || "تغییر رمز ناموفق بود.");
    } finally {
      setPwBusy(false);
    }
  };

  const grantTemplate = async (userId) => {
    const tplId = grantTplId[userId];
    if (!tplId) return;
    await api.grantPermission(userId, { template_id: tplId });
    setGrantTplId((s) => ({ ...s, [userId]: "" }));
    await reload();
  };
  const grantActivity = async (userId) => {
    const projId = grantProjId[userId];
    if (!projId) return;
    await api.grantPermission(userId, { project_id: projId });
    setGrantProjId((s) => ({ ...s, [userId]: "" }));
    setGrantTplForActivity((s) => ({ ...s, [userId]: "" }));
    await reload();
  };
  const revoke = async (userId, permId) => {
    await api.revokePermission(userId, permId);
    await reload();
  };

  const activitiesForTpl = (tplId) =>
    tplId ? projects.filter((p) => String(p.template_id || "") === String(tplId)) : [];

  return (
    <div className="tool-panel um-panel">
      <div className="tp-head">
        <h3><Shield size={17} /> مدیریت کاربران و دسترسی‌ها</h3>
        <button className="x-btn" onClick={onClose}><X size={18} /></button>
      </div>

      {/* new user */}
      <div className="um-new">
        <div className="tp-subhead">کاربر جدید</div>
        <div className="dp-row">
          <input placeholder="نام کاربری *" value={newUser.username}
            onChange={(e) => setNewUser({ ...newUser, username: e.target.value })} />
          <input placeholder="رمز عبور (حداقل ۶ کاراکتر) *" type="password" value={newUser.password}
            onChange={(e) => setNewUser({ ...newUser, password: e.target.value })} />
        </div>
        <div className="dp-row">
          <label className="um-role-pick">
            <input type="radio" name="newUserRole" checked={newUser.role === "viewer"}
              onChange={() => setNewUser({ ...newUser, role: "viewer" })} /> نمایش
          </label>
          <label className="um-role-pick">
            <input type="radio" name="newUserRole" checked={newUser.role === "admin"}
              onChange={() => setNewUser({ ...newUser, role: "admin" })} /> مدیریت
          </label>
        </div>
        {error && <div className="login-error">{error}</div>}
        <div className="dp-actions">
          <button className="btn gold sm" onClick={addUser}><UserPlus size={14} /> افزودن کاربر</button>
        </div>
      </div>

      {/* user list */}
      <div className="tp-subhead">کاربران</div>
      {users === null && <p className="muted-sm">در حال بارگذاری…</p>}
      {users && users.length === 0 && <p className="sb-empty">کاربری نیست.</p>}
      <div className="um-list">
        {users && users.map((u) => {
          const isViewer = u.role !== "admin";
          const open = expandedId === u.id;
          const restricted = (u.permissions || []).length > 0;
          return (
            <div key={u.id} className="um-user-card">
              <div className="um-user-row">
                {isViewer
                  ? <Eye size={15} className="sb-ic" />
                  : <Shield size={15} className="sb-ic" style={{ color: "var(--gold)" }} />}
                <span className="um-username">{u.username}</span>
                <span className="pv-plabel-t um-role-badge">{isViewer ? "نمایش" : "مدیریت"}</span>
                {isViewer && (
                  <span className={`um-scope-badge ${restricted ? "restricted" : "full"}`}>
                    {restricted ? "دسترسی محدود" : "دسترسی کامل"}
                  </span>
                )}
                {isViewer && (
                  <button className="mini" onClick={() => setExpandedId(open ? null : u.id)} title="مدیریت دسترسی‌ها">
                    <ChevronDown size={14} className={`sb-chevron ${open ? "open" : ""}`} />
                  </button>
                )}
                <button className="mini" title="تغییر رمز عبور"
                  onClick={() => { setPwTarget(u); setPwVal(""); setPwErr(""); }}>
                  <KeyRound size={13} />
                </button>
                <button className="mini danger" title="حذف کاربر" onClick={() => delUser(u)}>
                  <Trash2 size={13} />
                </button>
              </div>

              {isViewer && open && (
                <div className="um-perms">
                  {(u.permissions || []).length === 0 && (
                    <p className="muted-sm">هنوز دسترسی خاصی تعریف نشده — یعنی این کاربر همه‌چیز را می‌بیند.</p>
                  )}
                  {(u.permissions || []).map((perm) => (
                    <div key={perm.id} className="um-perm-row">
                      {perm.project_id
                        ? <><Circle size={9} className="sb-dot" /><span>فقط فعالیت «{perm.project_title || "—"}»</span></>
                        : <><Layers size={13} className="sb-ic" /><span>کل تمپلیت «{perm.template_label || "—"}»</span></>}
                      <button className="mini danger" onClick={() => revoke(u.id, perm.id)} title="لغو دسترسی">
                        <X size={12} />
                      </button>
                    </div>
                  ))}

                  <div className="um-grant-box">
                    <div className="um-grant-mode">
                      <label className={grantMode[u.id] !== "activity" ? "on" : ""}>
                        <input type="radio" name={`gm-${u.id}`} checked={grantMode[u.id] !== "activity"}
                          onChange={() => setGrantMode((s) => ({ ...s, [u.id]: "template" }))} />
                        دسترسی کامل به یک تمپلیت
                      </label>
                      <label className={grantMode[u.id] === "activity" ? "on" : ""}>
                        <input type="radio" name={`gm-${u.id}`} checked={grantMode[u.id] === "activity"}
                          onChange={() => setGrantMode((s) => ({ ...s, [u.id]: "activity" }))} />
                        فقط یک فعالیت خاص
                      </label>
                    </div>

                    {grantMode[u.id] !== "activity" ? (
                      <select className="full-select" value={grantTplId[u.id] || ""}
                        onChange={(e) => setGrantTplId((s) => ({ ...s, [u.id]: e.target.value }))}>
                        <option value="">— یک تمپلیت انتخاب کن —</option>
                        {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                      </select>
                    ) : (
                      <>
                        <select className="full-select" value={grantTplForActivity[u.id] ?? ""}
                          onChange={(e) => { setGrantTplForActivity((s) => ({ ...s, [u.id]: e.target.value })); setGrantProjId((s) => ({ ...s, [u.id]: "" })); }}>
                          <option value="">— بدون تمپلیت —</option>
                          {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
                        </select>
                        <select className="full-select" value={grantProjId[u.id] || ""}
                          onChange={(e) => setGrantProjId((s) => ({ ...s, [u.id]: e.target.value }))}>
                          <option value="">— یک فعالیت انتخاب کن —</option>
                          {(grantTplForActivity[u.id]
                            ? activitiesForTpl(grantTplForActivity[u.id])
                            : projects.filter((p) => !p.template_id)
                          ).map((p) => <option key={p.id} value={p.id}>{p.title}</option>)}
                        </select>
                      </>
                    )}

                    <button
                      className="btn gold sm um-grant-confirm"
                      disabled={grantMode[u.id] === "activity" ? !grantProjId[u.id] : !grantTplId[u.id]}
                      onClick={() => (grantMode[u.id] === "activity" ? grantActivity(u.id) : grantTemplate(u.id))}
                    >
                      <Plus size={14} /> افزودن این دسترسی
                    </button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>

      {pwTarget && (
        <div className="modal-overlay" onClick={() => setPwTarget(null)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="tp-head">
              <h3><KeyRound size={16} /> تغییر رمز «{pwTarget.username}»</h3>
              <button className="x-btn" onClick={() => setPwTarget(null)}><X size={18} /></button>
            </div>
            <p className="muted-sm">یه رمز جدید بذار و به کاربر بده — رمز قبلی دیگه کار نمی‌کنه.</p>
            <input type="password" placeholder="رمز جدید (حداقل ۶ کاراکتر)" value={pwVal}
              autoFocus
              onChange={(e) => setPwVal(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && resetPassword()} />
            {pwErr && <div className="login-error">{pwErr}</div>}
            <div className="dp-actions">
              <button className="btn ghost sm" onClick={() => setPwTarget(null)}>انصراف</button>
              <button className="btn gold sm" disabled={pwBusy} onClick={resetPassword}>
                {pwBusy ? "در حال ذخیره…" : "ذخیرهٔ رمز جدید"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
