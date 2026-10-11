import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { createPortal } from "react-dom";
import {
  Search, X, Plus, ArrowRight, ArrowLeft, LogIn, Trash2, Save,
  Layers, Edit3, Copy, ChevronDown, BarChart3, Lock,
} from "lucide-react";
import { api } from "../api";
import {
  MONTHS, toFa, faToEn, jMonthStartISO, jMonthEndISO, formatJalaliMonth, formatJalali, jalaliToISO,
} from "../jalali";
import JalaliInput from "./JalaliInput.jsx";
import UserManagement from "./UserManagement.jsx";
import { confirmDialog } from "./Dialog.jsx";
import HomeStage, { StageSwitcher, STAGE_MODES, normalizeStageMode } from "./HomeStage.jsx";

export const TEMPLATE_FONTS = [
  { key: "Vazirmatn", label: "وزیرمتن" },
  { key: "Sahel",     label: "ساحل" },
  { key: "Samim",     label: "صمیم" },
  { key: "Shabnam",   label: "شبنم" },
];
// تم هر تمپلیت حالا یکی از نمای‌های صفحهٔ اول است؛ مقدار خالی یعنی نمای پیش‌فرض سایت
export const TEMPLATE_THEMES = [
  { key: "", label: "پیش‌فرض سایت" },
  ...STAGE_MODES.map((m) => ({ key: m.key, label: `${m.label} — ${m.hint}` })),
];

export default function Home({
  settings, updateSetting, admin, isOwner, mode, setMode,
  templates, reloadTemplates, homeTool, setHomeTool, openProject, openWork, openSidebar, openReport,
  onProjectsChanged,
}) {
  const autoplay = settings.home_autoplay !== "0";

  const isTemplate = mode?.type === "template";
  const isNone = mode?.type === "none";
  const activeTemplate = isTemplate ? templates.find((t) => String(t.id) === String(mode.id)) : null;
  const [tplEditTarget, setTplEditTarget] = useState(null);

  // نمای صفحهٔ اول: همیشه «پرده‌ها» وقتی صفحه باز می‌شود (ورود، لاگین، برگشت از صفحات دیگر).
  // کاربر می‌تواند در همان بازدید حالت را عوض کند؛ ذخیره نمی‌شود و دفعهٔ بعد دوباره پرده‌هاست.
  const scopeKey = isTemplate ? `tpl-${mode.id}` : isNone ? "all" : "date";
  const [override, setOverride] = useState(null);
  useEffect(() => { setOverride(null); }, [scopeKey]);
  const view = override || "panels";
  const pickView = (k) => setOverride(k);

  // same lock rule as ProjectPage/WorkPage: a locked template's activities can only
  // be dragged/edited/deleted from this canvas by the archive owner. everyone else
  // (even other "admin" accounts) gets the plain click-to-open behaviour instead.
  const canManageProject = (p) => admin && !(p?.templateLocked && !isOwner);

  // date-mode range (Jalali)
  const [range, setRange] = useState({
    fromY: +(settings.range_from_jy || 1404), fromM: +(settings.range_from_jm || 1),
    toY:   +(settings.range_to_jy   || 1404), toM:   +(settings.range_to_jm   || 12),
  });
  const fromISO = jMonthStartISO(range.fromY, range.fromM);
  const toISO   = jMonthEndISO(range.toY, range.toM);

  const [projects,   setProjects]   = useState([]);
  const [editId,     setEditId]     = useState(null);
  const [toast,      setToast]      = useState("");

  const projectsRef = useRef(projects);
  useEffect(() => { projectsRef.current = projects; }, [projects]);

  const load = useCallback(() => {
    const p = isTemplate
      ? api.projects({ templateId: mode.id })
      : isNone
        ? api.projects({})
        : api.projects({ from: fromISO, to: toISO });
    return p.then((x) => setProjects(Array.isArray(x) ? x : [])).catch(() => setProjects([]));
  }, [isTemplate, isNone, mode?.id, fromISO, toISO]);
  useEffect(() => { load(); }, [load]);

  useEffect(() => { if (!admin) { setEditId(null); setHomeTool(null); } }, [admin]);

  const flash = (msg) => { setToast(msg); setTimeout(() => setToast(""), 2500); };

  const setRangePart = (patch) => {
    const n = { ...range, ...patch };
    setRange(n);
    updateSetting({
      range_from_jy: n.fromY, range_from_jm: n.fromM,
      range_to_jy: n.toY, range_to_jm: n.toM,
    });
  };

  /* ---- live edits + persist ---- */
  const patchLocal = (id, patch) =>
    setProjects((ps) => ps.map((p) => (p.id === id ? { ...p, ...patch } : p)));
  const persist = (id) => {
    const p = projectsRef.current.find((x) => x.id === id);
    if (!p) return;
    return api.updateProject(id, {
      title: p.title, sub: p.sub, start_date: p.start_date, end_date: p.end_date,
      node_x: p.node_x, node_y: p.node_y, node_size: p.node_size,
      node_font: p.node_font, node_bold: p.node_bold, template_id: p.template_id,
    });
  };

  /* ---- search ---- */
  const [q, setQ] = useState("");
  const [searchAll, setSearchAll] = useState([]);
  useEffect(() => { api.allProjects().then((p) => setSearchAll(Array.isArray(p) ? p : [])).catch(() => {}); }, [projects]);
  const results = useMemo(() => {
    const t = q.trim();
    if (!t) return [];
    const en = faToEn(t);
    return searchAll.filter(
      (p) => p.title.includes(t) || (p.sub || "").includes(t) ||
        (p.start_date && (p.start_date.includes(en) || formatJalaliMonth(p.start_date).includes(t)))
    );
  }, [q, searchAll]);

  const addProject = async (data) => {
    const payload = { ...data, node_x: 50, node_y: 28, node_size: 60, node_font: 12, node_bold: 0, orbit: 1 };
    if (isTemplate) payload.template_id = mode.id;     // new activity joins current template
    await api.addProject(payload);
    setHomeTool(null);
    await load();
    onProjectsChanged?.();
    flash("فعالیت ثبت شد ✓");
  };

  const editing = editId ? projects.find((p) => p.id === editId) : null;

  // جایگاه کنترل‌ها در هدر (App آن را می‌سازد)
  const [slot, setSlot] = useState(null);
  useEffect(() => { setSlot(document.getElementById("topbar-slot")); }, []);

  // نمای سینما: تیزر از بالای صفحه و زیر هدر شفاف شروع می‌شود. وقتی پنل مدیر باز است، هدر معمولی می‌شود
  const heroMode = view === "cinema" && !homeTool && !editing && projects.length > 0;
  useEffect(() => {
    const el = document.documentElement;
    if (heroMode) el.dataset.hero = "1"; else delete el.dataset.hero;
    return () => { delete el.dataset.hero; };
  }, [heroMode]);
  const templateFont = isTemplate ? (activeTemplate?.font || null) : null;

  // center subtitle for template mode
  const tplRange = activeTemplate && activeTemplate.from_date && activeTemplate.to_date
    ? `${formatJalaliMonth(activeTemplate.from_date)} تا ${formatJalaliMonth(activeTemplate.to_date)}`
    : "";

  return (
    <main className="home" style={templateFont ? { fontFamily: templateFont } : undefined}>
      {toast && <div className="toast">{toast}</div>}

      {/* کنترل‌های صفحهٔ اول داخل هدر می‌نشینند: عنوان تمپلیت/بازه، جستجو و انتخاب نما */}
      {slot && createPortal(
        <div className="hdr-controls">
          {isTemplate && (
            <div className="hdr-group hdr-tpl">
              <span className="hdr-title">{activeTemplate?.label || "تمپلیت"}</span>
              <button className="hdr-btn" onClick={() => openReport?.(activeTemplate?.id, activeTemplate?.label)}>
                <BarChart3 size={14} /> گزارش
              </button>
              {admin && (
                <>
                  {!(activeTemplate?.locked && !isOwner) && (
                    <button className="hdr-btn" title="ویرایش تمپلیت"
                      onClick={() => { setTplEditTarget(activeTemplate?.id || null); setHomeTool("template"); }}>
                      <Edit3 size={14} /> <span className="hdr-lbl">ویرایش تمپلیت</span>
                    </button>
                  )}
                  {!!activeTemplate?.locked && !isOwner && (
                    <span className="hdr-btn is-static" title="این تمپلیت توسط مالک آرشیو قفل شده">
                      <Lock size={13} /> قفل‌شده
                    </span>
                  )}
                  <button className="hdr-btn accent" onClick={() => setHomeTool("define")}>
                    <Plus size={14} /> <span className="hdr-lbl">فعالیت جدید</span>
                  </button>
                </>
              )}
            </div>
          )}

          {!isTemplate && !isNone && (
            <div className="hdr-group hdr-range" role="group" aria-label="بازهٔ زمانی">
              <span className="drb-tag">از</span>
              <select aria-label="ماه شروع" value={range.fromM} onChange={(e) => setRangePart({ fromM: +e.target.value })}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select aria-label="سال شروع" value={range.fromY} onChange={(e) => setRangePart({ fromY: +e.target.value })}>
                {Array.from({ length: 13 }, (_, i) => 1398 + i).map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
              </select>
              <ArrowLeft size={14} className="drb-arrow" />
              <span className="drb-tag">تا</span>
              <select aria-label="ماه پایان" value={range.toM} onChange={(e) => setRangePart({ toM: +e.target.value })}>
                {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
              </select>
              <select aria-label="سال پایان" value={range.toY} onChange={(e) => setRangePart({ toY: +e.target.value })}>
                {Array.from({ length: 13 }, (_, i) => 1398 + i).map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
              </select>
            </div>
          )}

          <div className="home-search-mini hdr-search">
            <div className="search-box small">
              <Search size={15} className="muted" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی فعالیت…" aria-label="جستجوی فعالیت" />
              {q && <button className="x-btn" onClick={() => setQ("")} aria-label="پاک‌کردن"><X size={14} /></button>}
            </div>
            {results.length > 0 && (
              <div className="search-results">
                {results.map((p) => (
                  <button key={p.id} className="sr-row" onClick={() => { setQ(""); openProject(p.id); }}>
                    <span className="sr-yr">{p.start_date ? formatJalaliMonth(p.start_date) : "—"}</span>
                    <span className="sr-title">{p.title}</span>
                    <ArrowRight size={14} className="muted" />
                  </button>
                ))}
              </div>
            )}
            {q && results.length === 0 && <div className="no-res mini">نتیجه‌ای نیست.</div>}
          </div>

          <StageSwitcher view={view} onPick={pickView} compact />
        </div>,
        slot
      )}

      {/* admin tool panels (opened from sidebar) */}
      {admin && homeTool === "define" && (
        <DefineProject
          defaultDate={isTemplate ? (activeTemplate?.from_date || fromISO) : fromISO}
          templates={templates}
          defaultTemplate={isTemplate ? mode.id : null}
          onAdd={addProject}
          onClose={() => setHomeTool(null)}
        />
      )}
      {admin && homeTool === "template" && (
        <TemplatePanel
          templates={templates}
          reload={reloadTemplates}
          onClose={() => { setHomeTool(null); setTplEditTarget(null); }}
          flash={flash}
          isOwner={isOwner}
          onEnterTemplate={(t) => { setMode({ type: "template", id: t.id, label: t.label }); setHomeTool(null); setTplEditTarget(null); }}
          initialEditId={tplEditTarget}
        />
      )}
      {admin && homeTool === "settings" && (
        <SettingsPanel
          view={normalizeStageMode(settings.home_view) || "cinema"} autoplay={autoplay}
          updateSetting={updateSetting}
          onClose={() => setHomeTool(null)}
        />
      )}

      {admin && isOwner && homeTool === "users" && (
        <UserManagement templates={templates} isOwner={isOwner} onClose={() => setHomeTool(null)} />
      )}

      {/* node editor */}
      {admin && editing && (
        <NodeEditor
          p={editing} templates={templates} readOnly={!canManageProject(editing)}
          onPatch={(patch) => patchLocal(editing.id, patch)}
          onSave={async () => {
            try {
              await persist(editing.id); await load(); onProjectsChanged?.(); flash("ذخیره شد ✓"); setEditId(null);
            } catch (e) {
              flash(e.message || "ذخیره ناموفق بود.");
            }
          }}
          onEnter={() => openProject(editing.id)}
          onDelete={async () => {
            if (!(await confirmDialog("این فعالیت حذف شود؟", { tone: "danger", title: "حذف فعالیت", confirmLabel: "حذف فعالیت" }))) return;
            try {
              await api.delProject(editing.id);
              setEditId(null);
              await load();
              onProjectsChanged?.();
              flash("فعالیت حذف شد ✓");
            } catch (e) {
              flash(e.message || "حذف ناموفق بود.");
            }
          }}
          onDuplicate={async (targetTemplateId) => {
            await api.duplicateProject(editing.id, targetTemplateId || null);
            await reloadTemplates(); await load();
            onProjectsChanged?.();
            flash("فعالیت به‌طور کامل کپی شد ✓");
            setEditId(null);
          }}
          onCreateTemplate={async (label) => {
            const created = await api.addTemplate({
              label, from_date: jalaliToISO(1404, 1, 1), to_date: jalaliToISO(1404, 12, 1),
              theme: "orbit", font: "Vazirmatn",
            });
            await reloadTemplates();
            return created;
          }}
          onClose={() => setEditId(null)}
        />
      )}

      {/* صحنهٔ اصلی: سه نمای VOD/ارائه به‌جای نقشهٔ مداری */}
      <div className="hs-wrap">
        <HomeStage
          view={view} items={projects.filter(Boolean)} autoplay={autoplay}
          onOpen={openProject} onOpenWork={openWork}
          canEdit={canManageProject} onEdit={(id) => setEditId(id)}
        />
      </div>
    </main>
  );
}

function Toggle({ on, label, onClick }) {
  return (
    <button className={`tg ${on ? "on" : ""}`} onClick={onClick}>
      <span className="tg-dot" /> {label}
    </button>
  );
}

function Panel({ title, onClose, children }) {
  return (
    <div className="tool-panel">
      <div className="tp-head">
        <h3>{title}</h3>
        <button className="x-btn" onClick={onClose}><X size={18} /></button>
      </div>
      {children}
    </div>
  );
}

/* tiny localStorage-backed draft helper so mid-typing refreshes don't lose form data */
function loadDraft(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function saveDraft(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function clearDraft(key) {
  try { localStorage.removeItem(key); } catch {}
}

function DefineProject({ defaultDate, templates, defaultTemplate, onAdd, onClose }) {
  const DRAFT_KEY = "madar_draft_activity";
  const [f, setF] = useState(() => loadDraft(DRAFT_KEY) || {
    title: "", sub: "",
    start_date: defaultDate || jalaliToISO(1404, 1, 1),
    end_date: "",
    template_id: defaultTemplate || "",
  });
  useEffect(() => { saveDraft(DRAFT_KEY, f); }, [f]);
  const submit = async () => {
    if (!f.title.trim()) return;
    await onAdd({ ...f, end_date: f.end_date || null, template_id: f.template_id || null });
    clearDraft(DRAFT_KEY);
  };
  const closeAndDiscard = () => { clearDraft(DRAFT_KEY); onClose(); };
  return (
    <Panel title="تعریف فعالیت" onClose={closeAndDiscard}>
      <div className="dp-row">
        <input placeholder="عنوان فعالیت *" value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} />
        <input placeholder="توضیح کوتاه" value={f.sub} onChange={(e) => setF({ ...f, sub: e.target.value })} />
      </div>
      <div className="dp-row">
        <label className="dp-lbl">تاریخ شروع</label>
        <JalaliInput value={f.start_date} onChange={(d) => setF({ ...f, start_date: d })} />
      </div>
      <div className="dp-row">
        <label className="dp-lbl">تاریخ پایان</label>
        <JalaliInput value={f.end_date || f.start_date} onChange={(d) => setF({ ...f, end_date: d })} />
        {f.end_date && (
          <button type="button" className="mini" onClick={() => setF({ ...f, end_date: "" })} title="پاک کردن">
            <X size={13} />
          </button>
        )}
      </div>
      <div className="dp-row">
        <label className="dp-lbl">تمپلیت</label>
        <select className="full-select" value={f.template_id} onChange={(e) => setF({ ...f, template_id: e.target.value })}>
          <option value="">— بدون تمپلیت (فقط بر اساس تاریخ) —</option>
          {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
        </select>
      </div>
      <div className="dp-actions">
        <button className="btn ghost sm" onClick={closeAndDiscard}>انصراف</button>
        <button className="btn gold sm" disabled={!f.title.trim()} onClick={submit}>ثبت فعالیت</button>
      </div>
    </Panel>
  );
}

function TemplatePanel({ templates, reload, onClose, flash, isOwner = false, onEnterTemplate, initialEditId }) {
  const TPL_DRAFT_KEY = "madar_draft_template";
  const [draft, setDraft] = useState(() => loadDraft(TPL_DRAFT_KEY) || {
    label: "", from_date: jalaliToISO(1404, 1, 1), to_date: jalaliToISO(1404, 12, 1),
    theme: "orbit", font: "Vazirmatn",
  });
  useEffect(() => { saveDraft(TPL_DRAFT_KEY, draft); }, [draft]);
  const initial = initialEditId ? templates.find((t) => String(t.id) === String(initialEditId)) : null;
  const [editId, setEditId] = useState(initialEditId || null);
  const [edit, setEdit] = useState(initial
    ? { label: initial.label, from_date: initial.from_date, to_date: initial.to_date, theme: initial.theme || "orbit", font: initial.font || "Vazirmatn" }
    : null);
  const [newOpen, setNewOpen] = useState(!initialEditId);

  const add = async () => {
    if (!draft.label.trim()) return;
    const created = await api.addTemplate(draft);
    setDraft({ label: "", from_date: jalaliToISO(1404, 1, 1), to_date: jalaliToISO(1404, 12, 1), theme: "orbit", font: "Vazirmatn" });
    clearDraft(TPL_DRAFT_KEY);
    await reload();
    flash("تمپلیت ساخته شد ✓");
    if (created?.id) onEnterTemplate?.(created);
  };
  const startEdit = (t) => { setEditId(t.id); setEdit({ label: t.label, from_date: t.from_date, to_date: t.to_date, theme: t.theme || "orbit", font: t.font || "Vazirmatn" }); };
  const saveEdit = async () => {
    try {
      await api.updateTemplate(editId, edit);
      setEditId(null); setEdit(null);
      await reload(); flash("ذخیره شد ✓");
      onClose();
    } catch (e) {
      flash(e.message || "ذخیره ناموفق بود.");
    }
  };
  const del = async (id) => {
    if (!(await confirmDialog("این تمپلیت حذف شود؟ فعالیت‌های داخلش حذف نمی‌شوند.", { tone: "danger", title: "حذف تمپلیت", confirmLabel: "حذف تمپلیت" }))) return;
    try {
      await api.delTemplate(id);
      await reload();
    } catch (e) {
      flash(e.message || "حذف ناموفق بود.");
    }
  };
  const closeAndDiscard = () => { clearDraft(TPL_DRAFT_KEY); onClose(); };

  return (
    <Panel title="تعریف / ویرایش تمپلیت" onClose={closeAndDiscard}>
      <div className="tpl-list">
        {templates.map((t) => (
          <div key={t.id} className="tpl-row">
            {editId === t.id ? (
              <div className="tpl-edit">
                <input value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} placeholder="عنوان" />
                <div className="dp-row">
                  <label className="dp-lbl">از</label>
                  <JalaliInput value={edit.from_date} onChange={(d) => setEdit({ ...edit, from_date: d })} />
                </div>
                <div className="dp-row">
                  <label className="dp-lbl">تا</label>
                  <JalaliInput value={edit.to_date} onChange={(d) => setEdit({ ...edit, to_date: d })} />
                </div>
                <div className="dp-row">
                  <label className="dp-lbl">نمای صفحه</label>
                  <select className="full-select" value={normalizeStageMode(edit.theme) || ""} onChange={(e) => setEdit({ ...edit, theme: e.target.value })}>
                    {TEMPLATE_THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div className="dp-row">
                  <label className="dp-lbl">فونت</label>
                  <select className="full-select" style={{ fontFamily: edit.font }} value={edit.font} onChange={(e) => setEdit({ ...edit, font: e.target.value })}>
                    {TEMPLATE_FONTS.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: f.key }}>{f.label} — نمونه متن فارسی</option>)}
                  </select>
                </div>
                <div className="dp-actions">
                  <button className="btn ghost sm" onClick={() => setEditId(null)}>انصراف</button>
                  <button className="btn gold sm" onClick={saveEdit}><Save size={13} /> ذخیره</button>
                </div>
              </div>
            ) : (
              <>
                <Layers size={15} className="muted" />
                <div className="tpl-info">
                  <b>{t.label}</b>
                  <span className="muted-sm">
                    {t.from_date ? `${formatJalaliMonth(t.from_date)} تا ${formatJalaliMonth(t.to_date)}` : "بدون بازه"} · {t.count ?? 0} فعالیت
                  </span>
                </div>
                {!!t.locked && !isOwner ? (
                  <span className="mini-lock-note" title="این تمپلیت قفل شده — فقط مالک آرشیو می‌تواند ویرایش/حذفش کند">
                    <Lock size={13} />
                  </span>
                ) : (
                  <>
                    <button className="mini" onClick={() => startEdit(t)} title="ویرایش"><Edit3 size={14} /></button>
                    <button className="mini danger" onClick={() => del(t.id)} title="حذف"><Trash2 size={14} /></button>
                  </>
                )}
              </>
            )}
          </div>
        ))}
        {templates.length === 0 && <p className="muted-sm">هنوز تمپلیتی نساخته‌ای.</p>}
      </div>

      <div className="tpl-new">
        <button className="tp-subhead collapsible" onClick={() => setNewOpen((v) => !v)}>
          <ChevronDown size={14} className={`sb-chevron ${newOpen ? "open" : ""}`} />
          تمپلیت جدید
        </button>
        {newOpen && (
          <>
            <input placeholder="عنوان تمپلیت *" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} />
            <div className="dp-row">
              <label className="dp-lbl">از</label>
              <JalaliInput value={draft.from_date} onChange={(d) => setDraft({ ...draft, from_date: d })} />
            </div>
            <div className="dp-row">
              <label className="dp-lbl">تا</label>
              <JalaliInput value={draft.to_date} onChange={(d) => setDraft({ ...draft, to_date: d })} />
            </div>
            <div className="dp-row">
              <label className="dp-lbl">نمای صفحه</label>
              <select className="full-select" value={normalizeStageMode(draft.theme) || ""} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
                {TEMPLATE_THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="dp-row">
              <label className="dp-lbl">فونت</label>
              <select className="full-select" style={{ fontFamily: draft.font }} value={draft.font} onChange={(e) => setDraft({ ...draft, font: e.target.value })}>
                {TEMPLATE_FONTS.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: f.key }}>{f.label} — نمونه متن فارسی</option>)}
              </select>
            </div>
            <div className="dp-actions">
              <button className="btn gold sm" disabled={!draft.label.trim()} onClick={add}><Plus size={14} /> افزودن تمپلیت</button>
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

function SettingsPanel({ view, autoplay, updateSetting, onClose }) {
  return (
    <Panel title="تنظیمات نمایش" onClose={onClose}>
      <div className="settings-grid">
        <div className="sp-group sp-wide">
          <span className="sp-label">نمای پیش‌فرض صفحهٔ اول</span>
          <StageSwitcher view={view} onPick={(k) => updateSetting({ home_view: k })} />
          <span className="muted-sm">هر تمپلیت می‌تواند نمای خودش را داشته باشد، و هر بازدیدکننده هم می‌تواند روی دستگاه خودش عوضش کند.</span>
        </div>
        <div className="sp-group sp-wide">
          <span className="sp-label">نمای سینما</span>
          <div className="toggles">
            <Toggle on={autoplay} label="پیشروی خودکار اسلایدها" onClick={() => updateSetting({ home_autoplay: autoplay ? "0" : "1" })} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function NodeEditor({ p, templates, readOnly = false, onPatch, onSave, onEnter, onDelete, onDuplicate, onCreateTemplate, onClose }) {
  const [dupTarget, setDupTarget] = useState("");
  const [duping, setDuping] = useState(false);
  const [newTplMode, setNewTplMode] = useState(false);
  const [newTplLabel, setNewTplLabel] = useState("");
  return (
    <Panel title="ویرایش فعالیت" onClose={onClose}>
      {readOnly && (
        <div className="lock-badge" style={{ marginBottom: 10 }}>
          <Lock size={13} /> این تمپلیت قفل شده — فقط می‌توانی این فعالیت را کپی کنی، نه ویرایش یا حذف.
        </div>
      )}
      {!readOnly && (
        <>
          <div className="dp-row">
            <input placeholder="عنوان" value={p.title} onChange={(e) => onPatch({ title: e.target.value })} />
            <input placeholder="توضیح کوتاه" value={p.sub || ""} onChange={(e) => onPatch({ sub: e.target.value })} />
          </div>
          <div className="dp-row">
            <label className="dp-lbl">تاریخ شروع</label>
            <JalaliInput value={p.start_date || jalaliToISO(1404, 1, 1)} onChange={(d) => onPatch({ start_date: d })} />
          </div>
          <div className="dp-row">
            <label className="dp-lbl">تاریخ پایان</label>
            <JalaliInput value={p.end_date || p.start_date || jalaliToISO(1404, 1, 1)} onChange={(d) => onPatch({ end_date: d })} />
            {p.end_date && (
              <button type="button" className="mini" onClick={() => onPatch({ end_date: null })} title="پاک کردن">
                <X size={13} />
              </button>
            )}
          </div>
          <div className="dp-row">
            <label className="dp-lbl">تمپلیت</label>
            <select className="full-select" value={p.template_id || ""} onChange={(e) => onPatch({ template_id: e.target.value || null })}>
              <option value="">— بدون تمپلیت —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
            </select>
          </div>
        </>
      )}

      <div className="ne-duplicate">
        <span className="dp-lbl">کپی کامل این فعالیت به تمپلیت دیگر</span>
        {!newTplMode ? (
          <>
            <div className="dp-row">
              <select className="full-select" value={dupTarget} onChange={(e) => setDupTarget(e.target.value)}>
                <option value="">— بدون تمپلیت —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
              <button className="btn light sm" disabled={duping}
                onClick={async () => {
                  setDuping(true);
                  try { await onDuplicate(dupTarget || null); }
                  finally { setDuping(false); }
                }}>
                <Copy size={13} /> {duping ? "در حال کپی…" : "کپی کامل فعالیت"}
              </button>
            </div>
            <button type="button" className="ne-newtpl-toggle" onClick={() => setNewTplMode(true)}>
              + یا یک تمپلیت جدید بساز و فعالیت را به آن منتقل کن
            </button>
          </>
        ) : (
          <div className="dp-row">
            <input placeholder="عنوان تمپلیت جدید *" value={newTplLabel} onChange={(e) => setNewTplLabel(e.target.value)} />
            <button className="btn ghost sm" onClick={() => { setNewTplMode(false); setNewTplLabel(""); }}>انصراف</button>
            <button className="btn gold sm" disabled={!newTplLabel.trim() || duping}
              onClick={async () => {
                setDuping(true);
                try {
                  const created = await onCreateTemplate(newTplLabel.trim());
                  if (created?.id) await onDuplicate(created.id);
                  setNewTplMode(false); setNewTplLabel("");
                } finally { setDuping(false); }
              }}>
              <Copy size={13} /> {duping ? "در حال ساخت و کپی…" : "بساز و کپی کن"}
            </button>
          </div>
        )}
        <span className="muted-sm">همهٔ آثار، آمارها، کلیدواژه‌ها و بازدیدها هم کپی می‌شوند؛ خودِ این فعالیت دست‌نخورده می‌ماند.</span>
      </div>

      <div className="dp-actions ne-actions">
        {!readOnly && <button className="btn ghost sm danger" onClick={onDelete}><Trash2 size={14} /> حذف</button>}
        <button className="btn ghost sm" onClick={onEnter}><LogIn size={14} /> ورود به صفحه</button>
        {!readOnly && <button className="btn gold sm" onClick={onSave}><Save size={14} /> ذخیره</button>}
      </div>
    </Panel>
  );
}
