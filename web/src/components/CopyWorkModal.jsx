import React, { useEffect, useState } from "react";
import { X, Copy, Layers, Circle } from "lucide-react";
import { api } from "../api";

// Two-step picker: choose a template (or "no template"), then choose one of its
// activities, then copy the work into it. Self-contained — fetches its own data.
export default function CopyWorkModal({ work, currentProjectId, onClose, onDone }) {
  const [templates, setTemplates] = useState(null);
  const [projects, setProjects] = useState(null);
  const [tplId, setTplId] = useState(undefined); // undefined = not chosen yet, "" = "no template"
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    api.templates().then((t) => setTemplates(Array.isArray(t) ? t : [])).catch(() => setTemplates([]));
    api.allProjects().then((p) => setProjects(Array.isArray(p) ? p : [])).catch(() => setProjects([]));
  }, []);

  const loading = templates === null || projects === null;
  const activitiesForTpl = !loading
    ? projects.filter((p) => (tplId === "" ? !p.template_id : String(p.template_id || "") === String(tplId)))
    : [];

  const copyInto = async (projectId) => {
    setBusy(true); setError("");
    try {
      await api.duplicateWork(work.id, projectId);
      onDone?.();
    } catch (e) {
      setError(e.message || "کپی ناموفق بود.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="tp-head">
          <h3><Copy size={16} /> کپی «{work.title}» به فعالیت دیگر</h3>
          <button className="x-btn" onClick={onClose}><X size={18} /></button>
        </div>

        {loading && <p className="muted-sm">در حال بارگذاری…</p>}

        {!loading && tplId === undefined && (
          <>
            <p className="muted-sm">اول تمپلیت مقصد را انتخاب کن:</p>
            <div className="cw-list">
              <button className="cw-item" onClick={() => setTplId("")}>
                <Circle size={9} className="sb-dot" /> بدون تمپلیت
              </button>
              {templates.map((t) => (
                <button key={t.id} className="cw-item" onClick={() => setTplId(t.id)}>
                  <Layers size={15} className="sb-ic" /> {t.label}
                </button>
              ))}
            </div>
          </>
        )}

        {!loading && tplId !== undefined && (
          <>
            <div className="cw-back-row">
              <button className="btn ghost sm" onClick={() => setTplId(undefined)}>‹ تغییر تمپلیت</button>
              <span className="muted-sm">{tplId === "" ? "بدون تمپلیت" : templates.find((t) => t.id === tplId)?.label}</span>
            </div>
            <p className="muted-sm">حالا فعالیت مقصد را انتخاب کن:</p>
            <div className="cw-list">
              {activitiesForTpl.length === 0 && <p className="sb-empty">فعالیتی در این تمپلیت نیست.</p>}
              {activitiesForTpl.map((p) => (
                <button key={p.id} className="cw-item" disabled={busy} onClick={() => copyInto(p.id)}>
                  <Circle size={9} className="sb-dot" /> {p.title}
                  {String(p.id) === String(currentProjectId) && <span className="cw-current">(همین فعالیت)</span>}
                </button>
              ))}
            </div>
          </>
        )}

        {error && <div className="login-error">{error}</div>}
        {busy && <p className="muted-sm">در حال کپی…</p>}
      </div>
    </div>
  );
}
