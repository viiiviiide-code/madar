import React, { useEffect, useState } from "react";
import { X, Copy, Layers, Circle, ArrowLeftRight, Check, AlertTriangle } from "lucide-react";
import { api } from "../api";

// Two-step picker: choose a template (or "no template"), then choose one of its
// activities, then copy (or move) the work(s) into it. Self-contained — fetches its
// own data. Accepts either a single `work` (legacy, single-item flow) or a `works`
// array (bulk flow) — internally everything runs off the array.
export default function CopyWorkModal({ work, works, currentProjectId, canMove = true, onClose, onDone }) {
  const items = works && works.length ? works : (work ? [work] : []);
  const isBulk = items.length > 1;

  const [templates, setTemplates] = useState(null);
  const [projects, setProjects] = useState(null);
  const [tplId, setTplId] = useState(undefined); // undefined = not chosen yet, "" = "no template"
  const [move, setMove] = useState(false);
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState(null); // { done, total } while running in bulk
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // { moved, okCount, failCount, failTitles } after finishing

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
    if (!isBulk) {
      try {
        const res = await api.duplicateWork(items[0].id, projectId, move);
        setDone({ moved: !!res.moved, okCount: 1, failCount: 0, failTitles: [] });
      } catch (e) {
        setError(e.message || "عملیات ناموفق بود.");
      } finally {
        setBusy(false);
      }
      return;
    }
    // bulk: run one-by-one so a single duplicate-title collision doesn't abort the rest
    let okCount = 0;
    const failTitles = [];
    for (let i = 0; i < items.length; i++) {
      setProgress({ done: i, total: items.length });
      try {
        await api.duplicateWork(items[i].id, projectId, move);
        okCount++;
      } catch (e) {
        failTitles.push(items[i].title);
      }
    }
    setProgress(null);
    setBusy(false);
    setDone({ moved: move, okCount, failCount: failTitles.length, failTitles });
  };

  if (done) {
    const allOk = done.failCount === 0;
    return (
      <div className="modal-overlay" onClick={() => onDone?.(done)}>
        <div className="modal-card" onClick={(e) => e.stopPropagation()}>
          <div className="cw-done">
            {allOk
              ? <Check size={28} className="cw-done-ic" />
              : <AlertTriangle size={28} className="cw-done-ic cw-done-warn" />}
            {isBulk ? (
              <>
                <p>
                  {done.okCount} از {items.length} اثر با موفقیت {done.moved ? "منتقل" : "کپی"} شد.
                </p>
                {done.failCount > 0 && (
                  <p className="muted-sm">
                    {done.failCount} اثر رد شد (احتمالاً از قبل با همین عنوان در آن فعالیت وجود داشت): {done.failTitles.join("، ")}
                  </p>
                )}
              </>
            ) : (
              <p>{done.moved ? "اثر با موفقیت منتقل شد." : "اثر با موفقیت کپی شد."}</p>
            )}
            <button className="btn gold sm" onClick={() => onDone?.(done)}>باشه</button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-card" onClick={(e) => e.stopPropagation()}>
        <div className="tp-head">
          <h3>
            <Copy size={16} /> {move ? "انتقال" : "کپی"}{" "}
            {isBulk ? `${items.length} اثر` : `«${items[0]?.title}»`} به فعالیت دیگر
          </h3>
          <button className="x-btn" onClick={onClose}><X size={18} /></button>
        </div>

        <div className="cw-mode-pick">
          <label className={!move ? "on" : ""}>
            <input type="radio" name="cwMode" checked={!move} onChange={() => setMove(false)} />
            <Copy size={13} /> کپی (نسخهٔ اصلی دست‌نخورده می‌ماند)
          </label>
          {canMove ? (
            <label className={move ? "on" : ""}>
              <input type="radio" name="cwMode" checked={move} onChange={() => setMove(true)} />
              <ArrowLeftRight size={13} /> انتقال (از اینجا حذف می‌شود)
            </label>
          ) : (
            <label className="disabled" title="این تمپلیت قفل شده — فقط مالک آرشیو می‌تواند اثر را از اینجا حذف/منتقل کند">
              <input type="radio" disabled />
              <ArrowLeftRight size={13} /> انتقال (این تمپلیت قفل است، فقط کپی مجاز است)
            </label>
          )}
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
        {busy && (
          <p className="muted-sm">
            در حال {move ? "انتقال" : "کپی"}…
            {progress && ` (${progress.done} از ${progress.total})`}
          </p>
        )}
      </div>
    </div>
  );
}
