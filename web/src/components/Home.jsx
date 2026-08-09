import React, { useEffect, useMemo, useRef, useState, useCallback } from "react";
import {
  Search, X, Plus, Minus, ArrowRight, ArrowLeft, Bold, LogIn, Trash2, Save, Type, Menu,
  CalendarRange, Layers, Edit3, Copy, LayoutGrid, ChevronDown,
} from "lucide-react";
import { api } from "../api";
import {
  MONTHS, toFa, faToEn, jMonthStartISO, jMonthEndISO, formatJalaliMonth, formatJalali, jalaliToISO,
} from "../jalali";
import JalaliInput from "./JalaliInput.jsx";

export const TEMPLATE_FONTS = [
  { key: "Vazirmatn", label: "وزیرمتن" },
  { key: "Sahel",     label: "ساحل" },
  { key: "Samim",     label: "صمیم" },
  { key: "Shabnam",   label: "شبنم" },
];
export const TEMPLATE_THEMES = [
  { key: "orbit",  label: "دایره‌ای (مداری)" },
  { key: "square", label: "مربعی" },
  { key: "card",   label: "کارتی" },
];

export default function Home({
  settings, updateSetting, admin, mode, setMode,
  templates, reloadTemplates, homeTool, setHomeTool, openProject, openSidebar,
  onProjectsChanged,
}) {
  const orbits = Math.max(1, +(settings.orbits || 3));
  const labelFont = +(settings.range_label_font || 13);
  const anim = {
    pulse: settings.anim_pulse !== "0",
    float: settings.anim_float !== "0",
    twinkle: settings.anim_twinkle !== "0",
  };

  const isTemplate = mode?.type === "template";
  const activeTemplate = isTemplate ? templates.find((t) => t.id === mode.id) : null;
  const [tplEditTarget, setTplEditTarget] = useState(null);

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
      : api.projects({ from: fromISO, to: toISO });
    return p.then((x) => setProjects(Array.isArray(x) ? x : [])).catch(() => setProjects([]));
  }, [isTemplate, mode?.id, fromISO, toISO]);
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

  /* ---- drag / resize (crash-safe) ---- */
  const squareRef = useRef(null);
  const drag = useRef(null);
  const suppressClick = useRef(false);

  const onMove = useCallback((e) => {
    const d = drag.current;                 // capture once; updater runs async
    if (!d || !squareRef.current) return;
    const r = squareRef.current.getBoundingClientRect();
    const px = ((e.clientX - r.left) / r.width) * 100;
    const py = ((e.clientY - r.top)  / r.height) * 100;
    if (Math.abs(e.clientX - d.sx) + Math.abs(e.clientY - d.sy) > 4) d.moved = true;
    setProjects((ps) =>
      ps.map((p) => {
        if (!p || p.id !== d.id) return p;
        if (d.mode === "move") {
          return { ...p, node_x: Math.min(93, Math.max(7, px)), node_y: Math.min(93, Math.max(7, py)) };
        }
        const dx = (px - p.node_x) / 100 * r.width;
        const dy = (py - p.node_y) / 100 * r.height;
        return { ...p, node_size: Math.min(120, Math.max(36, Math.hypot(dx, dy) * 2)) };
      })
    );
  }, []);

  const onUp = useCallback(() => {
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    const d = drag.current;
    drag.current = null;
    if (!d) return;
    suppressClick.current = d.moved;
    if (d.moved) persist(d.id);
  }, [onMove]);

  const onPointerDown = (e, p, m) => {
    if (!admin) return;
    e.preventDefault(); e.stopPropagation();
    drag.current = { id: p.id, mode: m, moved: false, sx: e.clientX, sy: e.clientY };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const onNodeClick = (p) => {
    if (suppressClick.current) { suppressClick.current = false; return; }
    if (admin) setEditId(p.id);
    else openProject(p.id);
  };

  /* card theme: snap all current cards into a tidy grid (still freely draggable afterwards) */
  const autoArrangeGrid = async () => {
    const list = projects.filter(Boolean);
    if (!list.length) return;
    const cols = Math.max(1, Math.min(4, Math.ceil(Math.sqrt(list.length))));
    const rows = Math.ceil(list.length / cols);
    const xStep = 86 / Math.max(1, cols - 1 || 1);
    const yStep = 76 / Math.max(1, rows - 1 || 1);
    const updated = list.map((p, i) => {
      const col = i % cols, row = Math.floor(i / cols);
      const node_x = cols === 1 ? 50 : 7 + col * xStep;
      const node_y = rows === 1 ? 46 : 12 + row * yStep;
      return { ...p, node_x, node_y };
    });
    setProjects(updated);
    await Promise.all(updated.map((p) =>
      api.updateProject(p.id, {
        title: p.title, sub: p.sub, start_date: p.start_date, end_date: p.end_date,
        node_x: p.node_x, node_y: p.node_y, node_size: p.node_size,
        node_font: p.node_font, node_bold: p.node_bold, template_id: p.template_id,
      })
    ));
    flash("چیدمان شبکه‌ای اعمال شد ✓");
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
  const rings = Array.from({ length: orbits }, (_, i) => 12 + (i + 1) * (38 / orbits));
  const theme = isTemplate ? (activeTemplate?.theme || "orbit") : "orbit";
  const templateFont = isTemplate ? (activeTemplate?.font || null) : null;

  // center subtitle for template mode
  const tplRange = activeTemplate && activeTemplate.from_date && activeTemplate.to_date
    ? `${formatJalaliMonth(activeTemplate.from_date)} تا ${formatJalaliMonth(activeTemplate.to_date)}`
    : "";

  return (
    <main className="home" style={templateFont ? { fontFamily: templateFont } : undefined}>
      {toast && <div className="toast">{toast}</div>}

      {/* compact search — top corner, away from center */}
      <div className="home-topbar">
        <div className="home-search-mini">
          <div className="search-box small">
            <Search size={15} className="muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجوی فعالیت…" />
            {q && <button className="x-btn" onClick={() => setQ("")}><X size={14} /></button>}
          </div>
          {results.length > 0 && (
            <div className="search-results">
              {results.map((p) => (
                <button key={p.id} className="sr-row" onClick={() => openProject(p.id)}>
                  <span className="sr-yr">{p.start_date ? formatJalaliMonth(p.start_date) : "—"}</span>
                  <span className="sr-title">{p.title}</span>
                  <ArrowRight size={14} className="muted" />
                </button>
              ))}
            </div>
          )}
          {q && results.length === 0 && <div className="no-res mini">نتیجه‌ای نیست.</div>}
        </div>
      </div>

      {/* date-range control — OUTSIDE the circle, only in date mode */}
      {!isTemplate && (
        <div className="daterange-bar">
          <span className="drb-label">بازهٔ زمانی</span>
          <div className="drb-group">
            <span className="drb-tag">از</span>
            <select value={range.fromM} onChange={(e) => setRangePart({ fromM: +e.target.value })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={range.fromY} onChange={(e) => setRangePart({ fromY: +e.target.value })}>
              {Array.from({ length: 13 }, (_, i) => 1398 + i).map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
            </select>
          </div>
          <ArrowLeft size={15} className="drb-arrow" />
          <div className="drb-group">
            <span className="drb-tag">تا</span>
            <select value={range.toM} onChange={(e) => setRangePart({ toM: +e.target.value })}>
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </select>
            <select value={range.toY} onChange={(e) => setRangePart({ toY: +e.target.value })}>
              {Array.from({ length: 13 }, (_, i) => 1398 + i).map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
            </select>
          </div>
        </div>
      )}

      {/* template header bar — only in template mode, gives a quick "new activity" shortcut */}
      {isTemplate && (
        <div className="daterange-bar template-bar">
          <span className="drb-label tpl-title">{activeTemplate?.label || "تمپلیت"}</span>
          {admin && (
            <>
              <button className="btn light sm" onClick={() => { setTplEditTarget(activeTemplate?.id || null); setHomeTool("template"); }}>
                <Edit3 size={14} /> ویرایش تمپلیت
              </button>
              {theme === "card" && (
                <button className="btn light sm" onClick={autoArrangeGrid} title="کارت‌ها را به‌صورت شبکه‌ای مرتب کن">
                  <LayoutGrid size={14} /> چیدمان شبکه‌ای
                </button>
              )}
              <button className="btn gold sm" onClick={() => setHomeTool("define")}>
                <Plus size={14} /> فعالیت جدید
              </button>
            </>
          )}
        </div>
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
          onEnterTemplate={(t) => { setMode({ type: "template", id: t.id, label: t.label }); setHomeTool(null); setTplEditTarget(null); }}
          initialEditId={tplEditTarget}
        />
      )}
      {admin && homeTool === "settings" && (
        <SettingsPanel
          orbits={orbits} labelFont={labelFont} anim={anim}
          updateSetting={updateSetting}
          onClose={() => setHomeTool(null)}
        />
      )}

      {/* node editor */}
      {admin && editing && (
        <NodeEditor
          p={editing} templates={templates}
          onPatch={(patch) => patchLocal(editing.id, patch)}
          onSave={async () => { await persist(editing.id); await load(); onProjectsChanged?.(); flash("ذخیره شد ✓"); setEditId(null); }}
          onEnter={() => openProject(editing.id)}
          onDelete={async () => {
            if (confirm("حذف این فعالیت؟")) {
              await api.delProject(editing.id);
              setEditId(null);
              await load();
              onProjectsChanged?.();
              flash("فعالیت حذف شد ✓");
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

      {/* orbit map (or freeform card board when theme === "card") */}
      <div className="orbit-wrap">
        <div className={`orbit-square theme-${theme}`} ref={squareRef}>
          {theme !== "card" && (
            <svg className="orbit-lines" viewBox="0 0 100 100" preserveAspectRatio="none">
              {rings.map((r, i) => (
                theme === "square"
                  ? <rect key={i} x={50 - r} y={50 - r} width={r * 2} height={r * 2} rx="3"
                      className={`ring ${i % 2 ? "ring-dash" : ""}`} />
                  : <circle key={i} cx="50" cy="50" r={r} className={`ring ${i % 2 ? "ring-dash" : ""}`} />
              ))}
              {projects.map((p) => p && (
                <line key={p.id} x1="50" y1="50" x2={p.node_x} y2={p.node_y} className="spoke" />
              ))}
            </svg>
          )}

          {/* center — hidden for the card theme; the template title already sits in the bar above */}
          {theme !== "card" && (
            <div className={`center-node ${anim.pulse ? "anim-pulse" : ""}`}>
              <div className="yr-core">
                {isTemplate ? (
                  <>
                    <Layers size={15} className="core-ic" />
                    <span className="yr-label" style={{ fontSize: labelFont }}>{activeTemplate?.label || "—"}</span>
                    {tplRange && <span className="yr-sub">{tplRange}</span>}
                  </>
                ) : (
                  <>
                    <CalendarRange size={15} className="core-ic" />
                    <span className="range-disp" style={{ fontSize: labelFont }}>
                      {MONTHS[range.fromM - 1]} {toFa(range.fromY)}
                    </span>
                    <span className="range-disp-sep">تا</span>
                    <span className="range-disp" style={{ fontSize: labelFont }}>
                      {MONTHS[range.toM - 1]} {toFa(range.toY)}
                    </span>
                  </>
                )}
              </div>
            </div>
          )}

          {/* nodes / cards */}
          {projects.map((p) => p && (
            <div key={p.id} className={`node-pos ${editId === p.id ? "editing" : ""}`}
              style={{ left: `${p.node_x}%`, top: `${p.node_y}%` }}>
              <button
                className={`node ${theme === "card" ? "node-card" : ""} ${anim.float && theme !== "card" ? "anim-float" : ""} ${admin ? "draggable" : ""}`}
                style={theme === "card"
                  ? { width: Math.max(p.node_size * 2.1, 130), height: Math.max(p.node_size * 1.15, 74) }
                  : { width: p.node_size, height: p.node_size }}
                onPointerDown={(e) => onPointerDown(e, p, "move")}
                onClick={() => onNodeClick(p)}
                title={admin ? "کلیک: ویرایش · بکش: جابه‌جایی" : p.title}
              >
                {theme !== "card" && <span className={`node-dot ${anim.twinkle ? "anim-twinkle" : ""}`} />}
                <span className="node-inner-title"
                  style={{ fontSize: (p.node_font || 12), fontWeight: p.node_bold ? 800 : 600 }}>
                  {p.title}
                </span>
                {theme === "card" && p.start_date && (
                  <span className="node-card-date">{formatJalaliMonth(p.start_date)}</span>
                )}
              </button>
              {admin && (
                <span className="resize-h" onPointerDown={(e) => onPointerDown(e, p, "resize")} title="تغییر اندازه" />
              )}
            </div>
          ))}
        </div>
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

function TemplatePanel({ templates, reload, onClose, flash, onEnterTemplate, initialEditId }) {
  const TPL_DRAFT_KEY = "madar_draft_template";
  const [draft, setDraft] = useState(() => loadDraft(TPL_DRAFT_KEY) || {
    label: "", from_date: jalaliToISO(1404, 1, 1), to_date: jalaliToISO(1404, 12, 1),
    theme: "orbit", font: "Vazirmatn",
  });
  useEffect(() => { saveDraft(TPL_DRAFT_KEY, draft); }, [draft]);
  const initial = initialEditId ? templates.find((t) => t.id === initialEditId) : null;
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
    await api.updateTemplate(editId, edit);
    setEditId(null); setEdit(null);
    await reload(); flash("ذخیره شد ✓");
  };
  const del = async (id) => { if (confirm("حذف این تمپلیت؟ فعالیت‌هایش حذف نمی‌شوند.")) { await api.delTemplate(id); await reload(); } };
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
                  <label className="dp-lbl">تم گرافیکی</label>
                  <select className="full-select" value={edit.theme} onChange={(e) => setEdit({ ...edit, theme: e.target.value })}>
                    {TEMPLATE_THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
                  </select>
                </div>
                <div className="dp-row">
                  <label className="dp-lbl">فونت</label>
                  <select className="full-select" style={{ fontFamily: edit.font }} value={edit.font} onChange={(e) => setEdit({ ...edit, font: e.target.value })}>
                    {TEMPLATE_FONTS.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: f.key }}>{f.label}</option>)}
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
                <button className="mini" onClick={() => startEdit(t)} title="ویرایش"><Edit3 size={14} /></button>
                <button className="mini danger" onClick={() => del(t.id)} title="حذف"><Trash2 size={14} /></button>
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
              <label className="dp-lbl">تم گرافیکی</label>
              <select className="full-select" value={draft.theme} onChange={(e) => setDraft({ ...draft, theme: e.target.value })}>
                {TEMPLATE_THEMES.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
              </select>
            </div>
            <div className="dp-row">
              <label className="dp-lbl">فونت</label>
              <select className="full-select" style={{ fontFamily: draft.font }} value={draft.font} onChange={(e) => setDraft({ ...draft, font: e.target.value })}>
                {TEMPLATE_FONTS.map((f) => <option key={f.key} value={f.key} style={{ fontFamily: f.key }}>{f.label}</option>)}
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

function SettingsPanel({ orbits, labelFont, anim, updateSetting, onClose }) {
  return (
    <Panel title="تنظیمات نمایش" onClose={onClose}>
      <div className="settings-grid">
        <div className="sp-group">
          <span className="sp-label">تعداد مدار</span>
          <div className="stepper">
            <button onClick={() => updateSetting({ orbits: Math.max(1, orbits - 1) })}><Minus size={14} /></button>
            <b>{toFa(orbits)}</b>
            <button onClick={() => updateSetting({ orbits: Math.min(6, orbits + 1) })}><Plus size={14} /></button>
          </div>
        </div>
        <div className="sp-group">
          <span className="sp-label">اندازهٔ فونت لیبل مرکز</span>
          <div className="stepper">
            <button onClick={() => updateSetting({ range_label_font: Math.max(9, labelFont - 1) })}><Minus size={14} /></button>
            <b>{toFa(labelFont)}</b>
            <button onClick={() => updateSetting({ range_label_font: Math.min(24, labelFont + 1) })}><Plus size={14} /></button>
          </div>
        </div>
        <div className="sp-group sp-wide">
          <span className="sp-label">انیمیشن‌ها</span>
          <div className="toggles">
            <Toggle on={anim.pulse}   label="تپش مرکز" onClick={() => updateSetting({ anim_pulse:   anim.pulse   ? "0" : "1" })} />
            <Toggle on={anim.float}   label="شناوری"   onClick={() => updateSetting({ anim_float:   anim.float   ? "0" : "1" })} />
            <Toggle on={anim.twinkle} label="چشمک‌زن" onClick={() => updateSetting({ anim_twinkle: anim.twinkle ? "0" : "1" })} />
          </div>
        </div>
      </div>
    </Panel>
  );
}

function NodeEditor({ p, templates, onPatch, onSave, onEnter, onDelete, onDuplicate, onCreateTemplate, onClose }) {
  const font = p.node_font || 12;
  const [dupTarget, setDupTarget] = useState("");
  const [duping, setDuping] = useState(false);
  const [newTplMode, setNewTplMode] = useState(false);
  const [newTplLabel, setNewTplLabel] = useState("");
  return (
    <Panel title="ویرایش فعالیت" onClose={onClose}>
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
      <div className="dp-row ne-style">
        <span className="dp-lbl"><Type size={14} /> فونت</span>
        <div className="stepper">
          <button onClick={() => onPatch({ node_font: Math.max(9, font - 1) })}><Minus size={14} /></button>
          <b>{toFa(Math.round(font))}</b>
          <button onClick={() => onPatch({ node_font: Math.min(22, font + 1) })}><Plus size={14} /></button>
        </div>
        <button className={`tg ${p.node_bold ? "on" : ""}`} onClick={() => onPatch({ node_bold: p.node_bold ? 0 : 1 })}>
          <Bold size={14} /> توپر
        </button>
      </div>

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
        <button className="btn ghost sm danger" onClick={onDelete}><Trash2 size={14} /> حذف</button>
        <button className="btn ghost sm" onClick={onEnter}><LogIn size={14} /> ورود به صفحه</button>
        <button className="btn gold sm" onClick={onSave}><Save size={14} /> ذخیره</button>
      </div>
    </Panel>
  );
}
