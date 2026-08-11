import React, { useEffect, useRef, useState } from "react";
import {
  ChevronRight, Plus, Trash2, MoveRight, MoveLeft, Search, ArrowUpDown,
  Upload, Play, Maximize2, Minimize2, LayoutGrid, List as ListIcon, Eye, RefreshCw, X,
  RotateCcw, Volume2, VolumeX, Film, Info, Star, Copy, Link2, Camera, Save, Edit3, FolderInput,
} from "lucide-react";
import { api } from "../api";
import { formatJalali, toFa, jalaliToISO, isValidISO } from "../jalali";
import KeywordInput from "./KeywordInput.jsx";
import CopyWorkModal from "./CopyWorkModal.jsx";

/* tiny localStorage-backed draft helper so a mid-typing refresh doesn't lose form data */
function loadWorkDraft(key) {
  try { return JSON.parse(localStorage.getItem(key) || "null"); } catch { return null; }
}
function saveWorkDraft(key, val) {
  try { localStorage.setItem(key, JSON.stringify(val)); } catch {}
}
function clearWorkDraft(key) {
  try { localStorage.removeItem(key); } catch {}
}
import JalaliInput from "./JalaliInput.jsx";
import * as XLSX from "xlsx";

const ICONS = { video: Play, poster: Maximize2, image: LayoutGrid, audio: Eye, screenshot: Camera, link: Link2 };

/* ---- compact number: 420000 → ۴۲۰ هزار, 1200000 → ۱.۲ میلیون ---- */
function fmtNum(n) {
  const v = Number(n) || 0;
  return toFa(v.toLocaleString("en-US"));
}

export default function ProjectPage({ projectId, admin, types, reloadMeta, goHome, openWork, initialQuery = "", templates = [], onProjectChanged, onProjectLoaded }) {
  const [project, setProject] = useState(null);
  const [works,   setWorks]   = useState([]);
  const [q,       setQ]       = useState(initialQuery);   // unified search
  const [type,    setType]    = useState("all");
  const [sort,    setSort]    = useState("new");
  const [featuredOnly, setFeaturedOnly] = useState(false);
  const [viewMode,setViewMode]= useState("list");
  const [addOpen, setAddOpen] = useState(false);
  const [refresh, setRefresh] = useState(0);
  const [statLabels, setStatLabels] = useState([]);
  const [openStat, setOpenStat] = useState(null);
  const [copySource, setCopySource] = useState(null);
  const [copyWorkTarget, setCopyWorkTarget] = useState(null);
  const teaserRef  = useRef(null);
  const [teaserPct, setTeaserPct] = useState(null);
  const [editActOpen, setEditActOpen] = useState(false);
  const [editAct, setEditAct] = useState(null);
  const videoRef   = useRef(null);
  const stageRef   = useRef(null);
  const [isFs, setIsFs] = useState(false);
  const [muted, setMuted] = useState(true);

  const typeLabel = (k) =>
    String(k || "").split(",").filter(Boolean)
      .map((x) => types.find((t) => t.key === x)?.label || x)
      .join("، ") || "—";

  const loadProject = () =>
    api.project(projectId)
      .then((p) => {
        const np = p && p.id ? {
          ...p,
          stats: Array.isArray(p.stats) ? p.stats : [],
          works: Array.isArray(p.works) ? p.works : [],
        } : null;
        setProject(np);
        if (np) onProjectLoaded?.(np);   // let the parent know which template this activity belongs to
      })
      .catch(() => setProject(null));
  const loadWorks = () =>
    api.works({ projectId, type, q, sort, ...(featuredOnly ? { featured: 1 } : {}) })
      .then((w) => setWorks(Array.isArray(w) ? w : []))
      .catch(() => setWorks([]));

  useEffect(() => { loadProject(); }, [projectId, refresh]);
  useEffect(() => { loadWorks(); },  [projectId, type, q, sort, featuredOnly, refresh]);
  useEffect(() => { if (admin) api.statLabels().then((v) => setStatLabels(Array.isArray(v) ? v : [])).catch(() => {}); }, [admin]);

  // fullscreen change listener
  useEffect(() => {
    const h = () => setIsFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);

  if (!project) return <div className="page muted">در حال بارگذاری…</div>;

  const setStats = async (stats) => {
    setProject({ ...project, stats });
    await api.saveStats(project.id, stats);
  };

  const onTeaser = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setTeaserPct(0);
    try {
      const { url } = await api.uploadWithProgress(file, (pct) => setTeaserPct(pct));
      await api.updateProject(project.id, { teaser_url: url });
      await loadProject();
    } finally {
      setTeaserPct(null);
      if (teaserRef.current) teaserRef.current.value = "";
    }
  };

  const openActivityEdit = () => {
    setEditAct({
      title: project.title, sub: project.sub || "",
      start_date: project.start_date, end_date: project.end_date || "",
      template_id: project.template_id || "",
    });
    setEditActOpen(true);
  };
  const saveActivityEdit = async () => {
    await api.updateProject(project.id, {
      title: editAct.title, sub: editAct.sub,
      start_date: editAct.start_date, end_date: editAct.end_date || null,
      template_id: editAct.template_id || null,
    });
    setEditActOpen(false);
    await loadProject();
    onProjectChanged?.();
  };
  const delActivity = async () => {
    if (!confirm(`فعالیت «${project.title}» حذف شود؟`)) return;
    await api.delProject(project.id);
    onProjectChanged?.();
    goHome();
  };

  const goFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  return (
    <div className="page">
      <div className="page-top">
        <button className="back" onClick={goHome}>
          <ChevronRight size={16} /> بازگشت
        </button>
        {admin && (
          <button className="btn light sm" onClick={openActivityEdit}>
            <Edit3 size={14} /> ویرایش فعالیت
          </button>
        )}
      </div>

      {editActOpen && editAct && (
        <div className="modal-overlay" onClick={() => setEditActOpen(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="tp-head">
              <h3>ویرایش فعالیت</h3>
              <button className="x-btn" onClick={() => setEditActOpen(false)}><X size={18} /></button>
            </div>
            <div className="dp-row">
              <input placeholder="عنوان فعالیت *" value={editAct.title}
                onChange={(e) => setEditAct({ ...editAct, title: e.target.value })} />
              <input placeholder="توضیح کوتاه" value={editAct.sub}
                onChange={(e) => setEditAct({ ...editAct, sub: e.target.value })} />
            </div>
            <div className="dp-row">
              <label className="dp-lbl">تاریخ شروع</label>
              <JalaliInput value={editAct.start_date} onChange={(d) => setEditAct({ ...editAct, start_date: d })} />
            </div>
            <div className="dp-row">
              <label className="dp-lbl">تاریخ پایان</label>
              <JalaliInput value={editAct.end_date || editAct.start_date} onChange={(d) => setEditAct({ ...editAct, end_date: d })} />
              {editAct.end_date && (
                <button type="button" className="mini" onClick={() => setEditAct({ ...editAct, end_date: "" })} title="پاک کردن">
                  <X size={13} />
                </button>
              )}
            </div>
            <div className="dp-row">
              <label className="dp-lbl">تمپلیت</label>
              <select className="full-select" value={editAct.template_id} onChange={(e) => setEditAct({ ...editAct, template_id: e.target.value })}>
                <option value="">— بدون تمپلیت —</option>
                {templates.map((t) => <option key={t.id} value={t.id}>{t.label}</option>)}
              </select>
            </div>
            <div className="dp-actions ne-actions">
              <button className="btn ghost sm danger" onClick={delActivity}><Trash2 size={14} /> حذف فعالیت</button>
              <button className="btn gold sm" disabled={!editAct.title.trim()} onClick={saveActivityEdit}><Save size={14} /> ذخیره</button>
            </div>
          </div>
        </div>
      )}

      {/* ---- cinematic teaser with overlaid meta ---- */}
      <section className="studio">
        <div className="studio-frame cinematic" ref={stageRef}>
          {project.teaser_url ? (
            <video
              ref={videoRef}
              className="studio-video cover"
              src={project.teaser_url}
              autoPlay muted loop playsInline
            />
          ) : (
            <div className="studio-empty" style={{ background: gradFor(project.id) }}>
              <Film size={46} strokeWidth={1.2} />
              {admin && teaserPct === null && (
                <button className="btn light sm" onClick={() => teaserRef.current?.click()}>
                  <Upload size={15} /> بارگذاری تیزر
                </button>
              )}
              {admin && teaserPct !== null && (
                <div className="teaser-upload-progress">
                  <div className="upload-progress-bar" style={{ width: teaserPct + "%" }} />
                  <span className="upload-progress-t">{toFa(teaserPct)}٪</span>
                </div>
              )}
            </div>
          )}

          {/* gradient + meta overlay */}
          <div className="studio-scrim" />
          <div className="studio-meta">
            <span className="sm-eyebrow">
              {project.start_date ? formatJalali(project.start_date) : "بدون تاریخ"}
              {project.end_date ? ` تا ${formatJalali(project.end_date)}` : ""}
            </span>
            <h1>{project.title}</h1>
            {project.sub && <p>{project.sub}</p>}
          </div>

          {/* controls bottom-left */}
          {project.teaser_url && (
            <div className="studio-controls floating">
              <button className="ic-btn" title="پخش از ابتدا"
                onClick={() => { if (videoRef.current) { videoRef.current.currentTime = 0; videoRef.current.play(); } }}>
                <RotateCcw size={17} />
              </button>
              <button className="ic-btn" title={muted ? "صدا" : "بی‌صدا"}
                onClick={() => { const v = videoRef.current; if (v) { v.muted = !v.muted; setMuted(v.muted); } }}>
                {muted ? <VolumeX size={17} /> : <Volume2 size={17} />}
              </button>
              {admin && (
                <button className="ic-btn" title="تغییر تیزر" onClick={() => teaserRef.current?.click()}>
                  {teaserPct !== null ? <span className="teaser-pct-badge">{toFa(teaserPct)}٪</span> : <RefreshCw size={16} />}
                </button>
              )}
              <button className="ic-btn" title={isFs ? "خروج از تمام‌صفحه" : "تمام‌صفحه"} onClick={goFullscreen}>
                {isFs ? <Minimize2 size={17} /> : <Maximize2 size={17} />}
              </button>
            </div>
          )}
        </div>
        <input ref={teaserRef} type="file" accept="video/*" hidden onChange={onTeaser} />
      </section>

      {/* ---- stats — centered ---- */}
      <section>
        <div className="row-head">
          <h2>آمار پروژه</h2>
          {admin && (
            <button className="btn ghost sm"
              onClick={() => setStats([...project.stats, { label: "", value: "۰", descr: "" }])}>
              <Plus size={14} /> افزودن فیلد
            </button>
          )}
        </div>
        <datalist id="stat-label-options">
          {statLabels.map((v) => <option key={v} value={v} />)}
        </datalist>
        <div className="stats-row centered">
          {project.stats.map((s, i) => (
            <div className="stat-card" key={i}>
              {admin ? (
                <>
                  <input className="stat-val-in" value={s.value}
                    onChange={(e) => setStats(project.stats.map((x, j) => j === i ? { ...x, value: e.target.value } : x))} />
                  <input className="stat-lbl-in" value={s.label} list="stat-label-options" placeholder="عنوان آمار"
                    onChange={(e) => setStats(project.stats.map((x, j) => j === i ? { ...x, label: e.target.value } : x))} />
                  <textarea className="stat-descr-in" placeholder="توضیح (اختیاری)" value={s.descr || ""} rows={1}
                    ref={(el) => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                    onChange={(e) => setStats(project.stats.map((x, j) => j === i ? { ...x, descr: e.target.value } : x))} />
                  <div className="stat-tools">
                    <button disabled={i === 0}
                      onClick={() => { const a=[...project.stats];[a[i-1],a[i]]=[a[i],a[i-1]];setStats(a); }}>
                      <MoveRight size={13} />
                    </button>
                    <button disabled={i === project.stats.length - 1}
                      onClick={() => { const a=[...project.stats];[a[i+1],a[i]]=[a[i],a[i+1]];setStats(a); }}>
                      <MoveLeft size={13} />
                    </button>
                    <button onClick={() => setStats(project.stats.filter((_, j) => j !== i))}>
                      <Trash2 size={13} />
                    </button>
                  </div>
                </>
              ) : (
                <button type="button" className="stat-card-view"
                  disabled={!s.descr}
                  title={s.descr || ""}
                  onClick={() => s.descr && setOpenStat(openStat === i ? null : i)}>
                  <span className="stat-val">{s.value}</span>
                  <span className="stat-lbl">{s.label}</span>
                  {s.descr && (
                    <>
                      <Info size={12} className="stat-info-ic" />
                      {openStat === i && <span className="stat-descr-pop">{s.descr}</span>}
                    </>
                  )}
                </button>
              )}
            </div>
          ))}
          {project.stats.length === 0 && !admin && null}
        </div>
      </section>

      {/* ---- works ---- */}
      <section>
        <div className="row-head">
          <h2>آثار منتخب <span className="count-badge">{toFa(works.length)}</span></h2>
          {admin && (
            <button className="btn ghost sm" onClick={() => setAddOpen((v) => !v)}>
              <Plus size={14} /> افزودن اثر
            </button>
          )}
        </div>

        {addOpen && admin && (
          <AddWork
            projectId={project.id} types={types} reloadMeta={reloadMeta}
            copyFrom={copySource}
            onAdded={() => {
              setAddOpen(false);
              setCopySource(null);
              setQ(""); setType("all"); setSort("new"); setViewMode("list"); setFeaturedOnly(false);
              setRefresh((x) => x + 1);   // force refetch even if filters unchanged
            }}
            onClose={() => { setAddOpen(false); setCopySource(null); }}
          />
        )}

        {copyWorkTarget && (
          <CopyWorkModal
            work={copyWorkTarget}
            currentProjectId={project.id}
            onClose={() => setCopyWorkTarget(null)}
            onDone={() => { setCopyWorkTarget(null); setRefresh((x) => x + 1); }}
          />
        )}

        {/* unified toolbar */}
        <div className="works-toolbar">
          <div className="search-box small flex-1">
            <Search size={16} className="muted" />
            <input value={q} onChange={(e) => setQ(e.target.value)}
              placeholder="جستجو در عنوان، شرح، محور، کمپین، کلیدواژه…" />
            {q && <button className="x-btn" onClick={() => setQ("")}><X size={14} /></button>}
          </div>
          <div className="sort">
            <span className="muted-sm">نوع</span>
            <select value={type} onChange={(e) => setType(e.target.value)}>
              <option value="all">همه</option>
              {types.map((t) => <option key={t.key} value={t.key}>{t.label}</option>)}
            </select>
          </div>
          <div className="sort">
            <ArrowUpDown size={15} className="muted" />
            <select value={sort} onChange={(e) => setSort(e.target.value)}>
              <option value="new">جدیدترین</option>
              <option value="old">قدیمی‌ترین</option>
              <option value="views">پربازدیدترین</option>
              <option value="title">عنوان</option>
            </select>
          </div>
          <button className={`sort featured-filter ${featuredOnly ? "on" : ""}`}
            onClick={() => setFeaturedOnly((v) => !v)} title="فقط آثار شاخص">
            <Star size={15} fill={featuredOnly ? "currentColor" : "none"} /> شاخص
          </button>
          <div className="vmode">
            <button className={viewMode === "grid" ? "on" : ""} onClick={() => setViewMode("grid")}>
              <LayoutGrid size={16} />
            </button>
            <button className={viewMode === "list" ? "on" : ""} onClick={() => setViewMode("list")}>
              <ListIcon size={16} />
            </button>
          </div>
        </div>

        {viewMode === "grid" ? (
          <div className="works-grid">
            {works.map((w) => (
              <div key={w.id} className={`work-card ${w.featured ? "is-featured" : ""}`} onClick={() => openWork(w.id)} role="button" tabIndex={0}>
                {admin && (
                  <div className="card-admin-tools">
                    <button className={`card-star ${w.featured ? "on" : ""}`} title={w.featured ? "حذف از آثار شاخص" : "علامت‌گذاری به‌عنوان اثر شاخص"}
                      onClick={async (e) => { e.stopPropagation(); await api.updateWork(w.id, { featured: w.featured ? 0 : 1 }); setRefresh((x) => x + 1); }}>
                      <Star size={14} fill={w.featured ? "currentColor" : "none"} />
                    </button>
                    <button className="card-copy" title="کپی اطلاعات این اثر"
                      onClick={(e) => { e.stopPropagation(); setCopySource(w); setAddOpen(true); }}>
                      <Copy size={14} />
                    </button>
                    <button className="card-copy" title="کپی به فعالیت دیگر"
                      onClick={(e) => { e.stopPropagation(); setCopyWorkTarget(w); }}>
                      <FolderInput size={14} />
                    </button>
                    <button className="card-del" title="حذف اثر"
                      onClick={async (e) => {
                        e.stopPropagation();
                        if (confirm(`حذف «${w.title}»؟`)) { await api.delWork(w.id); setRefresh((x) => x + 1); }
                      }}>
                      <Trash2 size={14} />
                    </button>
                  </div>
                )}
                <Media work={w} />
                <div className="work-meta">
                  <div className="work-top">
                    <span className="chip">{typeLabel(w.type)}</span>
                    <span className="views"><Eye size={13} /> {fmtNum(w.totalViews)}</span>
                  </div>
                  <h3>{!!w.featured && <Star size={13} className="title-star" fill="currentColor" />} {w.title}</h3>
                  <p className="muted-sm">{w.axis}{w.axis && w.campaign ? " · " : ""}{w.campaign}</p>
                </div>
              </div>
            ))}
            {works.length === 0 && <div className="no-res">اثری با این فیلترها پیدا نشد.</div>}
          </div>
        ) : (
          <div className="works-list">
            {works.map((w) => (
              <div key={w.id} className={`work-row ${w.featured ? "is-featured" : ""}`} onClick={() => openWork(w.id)} role="button" tabIndex={0}>
                <div className="wr-thumb"><Media work={w} small /></div>
                <div className="wr-body">
                  <div className="wr-line1">
                    <span className="chip">{typeLabel(w.type)}</span>
                    <h3>{!!w.featured && <Star size={13} className="title-star" fill="currentColor" />} {w.title}</h3>
                    {admin && (
                      <div className="row-admin-tools">
                        <button className={`card-star ${w.featured ? "on" : ""}`} title={w.featured ? "حذف از آثار شاخص" : "اثر شاخص"}
                          onClick={async (e) => { e.stopPropagation(); await api.updateWork(w.id, { featured: w.featured ? 0 : 1 }); setRefresh((x) => x + 1); }}>
                          <Star size={14} fill={w.featured ? "currentColor" : "none"} />
                        </button>
                        <button className="row-copy" title="کپی اطلاعات این اثر"
                          onClick={(e) => { e.stopPropagation(); setCopySource(w); setAddOpen(true); }}>
                          <Copy size={14} />
                        </button>
                        <button className="row-copy" title="کپی به فعالیت دیگر"
                          onClick={(e) => { e.stopPropagation(); setCopyWorkTarget(w); }}>
                          <FolderInput size={14} />
                        </button>
                        <button className="row-del" title="حذف اثر"
                          onClick={async (e) => {
                            e.stopPropagation();
                            if (confirm(`حذف «${w.title}»؟`)) { await api.delWork(w.id); setRefresh((x) => x + 1); }
                          }}>
                          <Trash2 size={14} />
                        </button>
                      </div>
                    )}
                  </div>
                  <p className="muted-sm">{w.descr}</p>
                  <div className="wr-meta">
                    <span>محور: {w.axis || "—"}</span>
                    <span>کمپین: {w.campaign || "—"}</span>
                    {w.event_date && <span>تاریخ: {formatJalali(w.event_date)}</span>}
                    <span><Eye size={12} /> {fmtNum(w.totalViews)}</span>
                  </div>
                  {w.keywords?.length > 0 && (
                    <div className="wr-kws">
                      {w.keywords.map((k) => (
                        <span key={k} className="kw-tag sm">{k}</span>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            ))}
            {works.length === 0 && <div className="no-res">اثری با این فیلترها پیدا نشد.</div>}
          </div>
        )}
      </section>
    </div>
  );
}

/* ---- media block — handles vertical videos ---- */
/* captures a representative (non-black) frame for video thumbnails */
export function VideoThumb({ url, className }) {
  const [poster, setPoster] = useState(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let cancelled = false;
    const v = document.createElement("video");
    v.muted = true; v.preload = "auto"; v.crossOrigin = "anonymous"; v.src = url;
    const cleanup = () => { try { v.removeAttribute("src"); v.load(); } catch (e) {} };
    const onLoaded = () => {
      const dur = (v.duration && isFinite(v.duration)) ? v.duration : 2;
      const seekTo = Math.max(0.1, Math.min(1.5, dur * 0.15)); // ~15% in, capped
      const onSeeked = () => {
        try {
          const c = document.createElement("canvas");
          c.width = v.videoWidth || 320; c.height = v.videoHeight || 180;
          c.getContext("2d").drawImage(v, 0, 0, c.width, c.height);
          const data = c.toDataURL("image/jpeg", 0.7);
          if (!cancelled) setPoster(data);
        } catch (e) { if (!cancelled) setFailed(true); }
        cleanup();
      };
      v.addEventListener("seeked", onSeeked, { once: true });
      try { v.currentTime = seekTo; } catch (e) { if (!cancelled) setFailed(true); cleanup(); }
    };
    v.addEventListener("loadeddata", onLoaded, { once: true });
    v.addEventListener("error", () => { if (!cancelled) setFailed(true); }, { once: true });
    return () => { cancelled = true; cleanup(); };
  }, [url]);

  if (poster) return <img className={className} src={poster} alt="" />;
  // fallback while capturing / if capture fails: show frame at ~1s
  return <video className={className} src={url + "#t=1"} muted preload="metadata" playsInline />;
}

export function mediaKind(url, fallback) {
  if (fallback === "link") return "link"; // explicit link kind is never re-guessed from the URL
  const ext = String(url || "").toLowerCase().split(/[?#]/)[0].split(".").pop();
  if (["mp4", "webm", "mov", "mkv", "avi", "m4v", "ogv"].includes(ext)) return "video";
  if (["mp3", "wav", "ogg", "oga", "m4a", "aac", "flac", "opus"].includes(ext)) return "audio";
  if (["jpg", "jpeg", "png", "gif", "webp", "bmp", "svg", "avif"].includes(ext)) return "image";
  return fallback || "image";
}

export function linkHost(url) {
  try { return new URL(url).hostname.replace(/^www\./, ""); }
  catch { return String(url || "").slice(0, 30); }
}

export function Media({ work, small, big }) {
  const Icon = ICONS[work.type] || Play;
  // trust the file's actual extension over the work's declared type
  const kind = work.url ? mediaKind(work.url, work.type) : work.type;
  if (kind === "link" && work.url) {
    return (
      <a className="media media-ph media-link" href={work.url} target="_blank" rel="noreferrer"
        style={{ background: gradFor(work.id) }} onClick={(e) => e.stopPropagation()}>
        <Link2 size={big ? 40 : small ? 18 : 26} strokeWidth={1.4} />
        <span className="media-link-t">{linkHost(work.url)}</span>
      </a>
    );
  }
  if (work.url && kind === "video") {
    if (big) {
      return (
        <div className="media-wrap media-wrap-big">
          <video className="media media-contain" src={work.url}
            controls autoPlay playsInline />
        </div>
      );
    }
    // grid/list thumbnail: representative still frame
    return (
      <div className="media-wrap">
        <VideoThumb url={work.url} className="media media-contain" />
      </div>
    );
  }
  if (work.url && kind === "audio") {
    return (
      <div className="media media-ph" style={{ background: gradFor(work.id) }}>
        <audio src={work.url} controls preload="metadata" style={{ width: "86%" }} />
      </div>
    );
  }
  if (work.url) {
    return (
      <div className={`media-wrap ${big ? "media-wrap-big" : ""}`}>
        <img className="media media-contain" src={work.url} alt={work.title} />
      </div>
    );
  }
  return (
    <div className="media media-ph" style={{ background: gradFor(work.id) }}>
      <Icon size={big ? 54 : small ? 22 : 30} strokeWidth={1.4} />
      {big && <span className="media-ph-t">{work.title}</span>}
    </div>
  );
}

export function gradFor(seed) {
  const s = (n) => { const x = Math.sin(n * 127.1 + 311.7) * 43758.5; return x - Math.floor(x); };
  const h1 = Math.floor(s(seed) * 360);
  const h2 = (h1 + 50 + Math.floor(s(seed * 3) * 60)) % 360;
  return `linear-gradient(135deg, hsl(${h1} 55% 32%), hsl(${h2} 60% 22%))`;
}

/* ---- add work + Excel import ---- */
function AddWork({ projectId, types, reloadMeta, onAdded, copyFrom, onClose }) {
  const DRAFT_KEY = `madar_draft_work_${projectId}`;
  const savedDraft = !copyFrom ? loadWorkDraft(DRAFT_KEY) : null;
  const [tab, setTab] = useState("manual"); // "manual" | "excel"
  const [f, setF] = useState(() => copyFrom ? {
    type: copyFrom.type, title: copyFrom.title + " (کپی)", axis: copyFrom.axis || "",
    campaign: copyFrom.campaign || "", descr: copyFrom.descr || "",
    event_date: copyFrom.event_date || null, keywords: copyFrom.keywords || [],
    url: null, featured: 0,
  } : (savedDraft?.f || {
    type: types[0]?.key || "video", title: "", axis: "", campaign: "",
    descr: "", event_date: null, keywords: [], url: null, featured: 0,
  }));
  const [fileName,  setFileName]  = useState("");
  const [mediaList, setMediaList] = useState(() => (!copyFrom && savedDraft?.mediaList) || []);   // [{url, kind, name}]
  const [uploading, setUploading] = useState(false);
  const [uploadPct, setUploadPct] = useState(null);
  const [addType,   setAddType]   = useState(false);
  const [newType,   setNewType]   = useState({ key: "", label: "" });
  const [importing, setImporting] = useState(false);
  const [importLog, setImportLog] = useState("");
  const [axisList, setAxisList] = useState([]);
  const [campList, setCampList] = useState([]);
  const [linkUrl, setLinkUrl] = useState("");
  const fileRef    = useRef(null);
  const excelRef   = useRef(null);

  // persist as a draft on every change (skipped entirely for the "copy" flow)
  useEffect(() => {
    if (copyFrom) return;
    saveWorkDraft(DRAFT_KEY, { f, mediaList });
  }, [f, mediaList, copyFrom]);

  useEffect(() => {
    api.fieldValues("axis").then((v) => setAxisList(Array.isArray(v) ? v : [])).catch(() => {});
    api.fieldValues("campaign").then((v) => setCampList(Array.isArray(v) ? v : [])).catch(() => {});
  }, []);

  const kindOf = (file) => {
    const t = file.type || "";
    if (t.startsWith("video")) return "video";
    if (t.startsWith("audio")) return "audio";
    if (t.startsWith("image")) return "image";
    return mediaKind(file.name, "image"); // MIME missing → detect by extension
  };

  const pick = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setUploading(true);
    const added = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadPct({ i: i + 1, n: files.length, pct: 0 });
      try {
        const { url } = await api.uploadWithProgress(file, (pct) => setUploadPct({ i: i + 1, n: files.length, pct }));
        if (url) added.push({ url, kind: kindOf(file), name: file.name });
      } catch (err) { /* skip failed file */ }
    }
    setMediaList((prev) => [...prev, ...added]);
    setUploading(false);
    setUploadPct(null);
    if (fileRef.current) fileRef.current.value = "";
  };

  const addLink = () => {
    const u = linkUrl.trim();
    if (!u) return;
    setMediaList((prev) => [...prev, { url: u, kind: "link", name: u }]);
    setLinkUrl("");
  };

  const removeMedia = (i) => setMediaList((prev) => prev.filter((_, j) => j !== i));

  const submit = async () => {
    const media = mediaList.map(({ url, kind }) => ({ url, kind }));
    await api.addWork({ ...f, project_id: projectId, media, url: media[0]?.url || f.url || null });
    clearWorkDraft(DRAFT_KEY);
    onAdded();
  };

  const createType = async () => {
    if (!newType.key || !newType.label) return;
    await api.addType(newType);
    await reloadMeta();
    setF((s) => ({ ...s, type: newType.key }));
    setAddType(false); setNewType({ key: "", label: "" });
  };

  const downloadTemplate = () => {
    const sample = [
      { "عنوان": "نمونه تیزر", "نوع": "ویدئو", "محور": "خانواده", "کمپین": "نوروز ۱۴۰۴",
        "کلیدواژه": "نوروز، خانواده", "شرح": "توضیح نمونه", "تاریخ رویداد": "2025-03-21" },
      { "عنوان": "نمونه پوستر", "نوع": "پوستر", "محور": "", "کمپین": "",
        "کلیدواژه": "پوستر", "شرح": "", "تاریخ رویداد": "" },
    ];
    const ws = XLSX.utils.json_to_sheet(sample);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "آثار");
    XLSX.writeFile(wb, "madar-template.xlsx");
  };

  // Excel import via SheetJS (loaded from CDN inside effect, or using dynamic import)
  const handleExcel = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImporting(true); setImportLog("در حال پردازش فایل…");
    try {
      const buf  = await file.arrayBuffer();
      const wb   = XLSX.read(new Uint8Array(buf), { type: "array" });
      const ws   = wb.Sheets[wb.SheetNames[0]];
      const rows = XLSX.utils.sheet_to_json(ws, { defval: "" });
      if (!rows.length) { setImportLog("فایل خالی است یا ستون‌ها شناسایی نشد."); setImporting(false); return; }

      // map a type cell (key OR Persian label) to a valid type key
      const resolveType = (val) => {
        const v = String(val || "").trim();
        if (!v) return types[0]?.key || "video";
        const byKey   = types.find((t) => t.key === v);
        const byLabel = types.find((t) => t.label === v);
        return byKey?.key || byLabel?.key || (types[0]?.key || "video");
      };

      let ok = 0, fail = 0;
      for (const row of rows) {
        const title = String(row["عنوان"] || row["title"] || "").trim();
        if (!title) { fail++; continue; }
        const kws = String(row["کلیدواژه"] || row["keywords"] || "")
          .split(/[,،]/).map((k) => k.trim()).filter(Boolean);
        const rawDate = String(row["تاریخ رویداد"] || row["event_date"] || "").trim();
        const event_date = isValidISO(rawDate) ? rawDate : null;
        await api.addWork({
          project_id: projectId,
          title,
          type:       resolveType(row["نوع"] || row["type"]),
          axis:       String(row["محور"]   || row["axis"]     || "").trim(),
          campaign:   String(row["کمپین"]  || row["campaign"] || "").trim(),
          descr:      String(row["شرح"]    || row["descr"]    || "").trim(),
          event_date,
          keywords:   kws,
        });
        ok++;
      }
      if (ok > 0) {
        setImportLog(`✓ ${toFa(ok)} اثر وارد شد${fail ? `، ${toFa(fail)} ردیف بدون عنوان نادیده گرفته شد` : ""}.`);
        onAdded();   // closes form, resets filters, refetches
      } else {
        setImportLog("هیچ ردیفی عنوان نداشت؛ چیزی وارد نشد. ستون «عنوان» را بررسی کنید.");
      }
    } catch (err) {
      setImportLog("خطا در خواندن فایل: " + err.message);
    }
    setImporting(false);
  };

  return (
    <div className="add-form">
      {copyFrom && (
        <div className="copy-banner">
          <Copy size={13} /> اطلاعات از «{copyFrom.title}» کپی شد — فقط فایل جدید اضافه کن.
          {onClose && <button className="x-btn" onClick={onClose}><X size={13} /></button>}
        </div>
      )}
      {!copyFrom && savedDraft?.f?.title && (
        <div className="copy-banner draft-banner">
          <Save size={13} /> پیش‌نویس قبلی بازیابی شد.
          <button className="x-btn draft-discard" onClick={() => {
            clearWorkDraft(DRAFT_KEY);
            setF({ type: types[0]?.key || "video", title: "", axis: "", campaign: "", descr: "", event_date: null, keywords: [], url: null, featured: 0 });
            setMediaList([]);
          }}>شروع از نو</button>
        </div>
      )}
      <div className="af-tabs">
        <button className={tab === "manual" ? "af-tab on" : "af-tab"} onClick={() => setTab("manual")}>ثبت دستی</button>
        <button className={tab === "excel"  ? "af-tab on" : "af-tab"} onClick={() => setTab("excel")}>وارد کردن از اکسل</button>
      </div>

      {tab === "manual" && (
        <>
          <div className="af-row">
            <div className="type-multi">
              {types.map((t) => {
                const selectedTypes = (f.type || "").split(",").filter(Boolean);
                const on = selectedTypes.includes(t.key);
                return (
                  <button key={t.key} type="button" className={`type-chip ${on ? "on" : ""}`}
                    onClick={() => {
                      const set = new Set(selectedTypes);
                      if (set.has(t.key)) set.delete(t.key); else set.add(t.key);
                      setF({ ...f, type: Array.from(set).join(",") });
                    }}>
                    {t.label}
                  </button>
                );
              })}
              <button className="mini" onClick={() => setAddType((v) => !v)} title="افزودن/حذف نوع">
                <Plus size={14} />
              </button>
            </div>
            <input placeholder="عنوان اثر" value={f.title}
              onChange={(e) => setF({ ...f, title: e.target.value })} />
          </div>
          <span className="muted-sm type-multi-hint">می‌تونی چند نوع هم‌زمان انتخاب کنی (مثلاً هم ویدئو هم پوستر).</span>
          {addType && (
            <div className="af-row newtype-manage">
              <div className="newtype-list">
                {types.map((t) => (
                  <span key={t.key} className="newtype-row">
                    {t.label}
                    <button className="mini danger" title="حذف این نوع"
                      onClick={async () => {
                        if (confirm(`نوع «${t.label}» حذف شود؟ (آثار ثبت‌شده با این نوع دست‌نخورده می‌مانند)`)) {
                          await api.delType(t.id);
                          setF((prev) => ({ ...prev, type: (prev.type || "").split(",").filter((k) => k !== t.key).join(",") }));
                          await reloadMeta();
                        }
                      }}>
                      <Trash2 size={11} />
                    </button>
                  </span>
                ))}
              </div>
              <div className="af-row">
                <input placeholder="شناسه لاتین (مثل infographic)" value={newType.key}
                  onChange={(e) => setNewType({ ...newType, key: e.target.value })} />
                <input placeholder="عنوان فارسی (مثل اینفوگرافیک)" value={newType.label}
                  onChange={(e) => setNewType({ ...newType, label: e.target.value })} />
                <button className="btn gold sm" onClick={createType}>ثبت نوع</button>
              </div>
            </div>
          )}
          <div className="af-row">
            <input placeholder="محور" value={f.axis} list="axis-options"
              onChange={(e) => setF({ ...f, axis: e.target.value })} />
            <input placeholder="نام کمپین" value={f.campaign} list="campaign-options"
              onChange={(e) => setF({ ...f, campaign: e.target.value })} />
            <datalist id="axis-options">
              {axisList.map((v) => <option key={v} value={v} />)}
            </datalist>
            <datalist id="campaign-options">
              {campList.map((v) => <option key={v} value={v} />)}
            </datalist>
          </div>
          <div className="af-row date-opt">
            <label className="date-check">
              <input type="checkbox" checked={f.event_date != null}
                onChange={(e) => setF({ ...f, event_date: e.target.checked ? jalaliToISO(1404, 1, 1) : null })} />
              تاریخ رویداد دارد
            </label>
            {f.event_date != null && (
              <JalaliInput value={f.event_date} onChange={(d) => setF({ ...f, event_date: d })} />
            )}
          </div>
          <KeywordInput value={f.keywords} onChange={(keywords) => setF({ ...f, keywords })} />
          <textarea placeholder="شرح اثر" value={f.descr}
            onChange={(e) => setF({ ...f, descr: e.target.value })} />

          <label className="date-check">
            <input type="checkbox" checked={!!f.featured}
              onChange={(e) => setF({ ...f, featured: e.target.checked ? 1 : 0 })} />
            <Star size={13} /> علامت‌گذاری به‌عنوان اثر شاخص
          </label>

          {/* multi-file gallery upload */}
          <div className="media-upload">
            <div className="media-upload-row">
              <button className="btn light sm" onClick={() => fileRef.current?.click()} disabled={uploading}>
                <Upload size={14} /> {uploading ? "در حال بارگذاری…" : "افزودن فایل‌ها (چند فایل مجاز است)"}
              </button>
              <input ref={fileRef} type="file" hidden multiple onChange={pick}
                accept="image/*,video/*,audio/*" />
              <div className="link-add">
                <input placeholder="آدرس لینک (اسکرین‌شات/لینک خارجی)" value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && addLink()}
                  onBlur={addLink} />
                <button className="mini" onClick={addLink} title="افزودن لینک"><Link2 size={14} /></button>
              </div>
            </div>
            {uploadPct && (
              <div className="upload-progress">
                <div className="upload-progress-bar" style={{ width: uploadPct.pct + "%" }} />
                <span className="upload-progress-t">
                  فایل {toFa(uploadPct.i)} از {toFa(uploadPct.n)} — {toFa(uploadPct.pct)}٪
                </span>
              </div>
            )}
            {mediaList.length > 0 && (
              <div className="media-thumbs">
                {mediaList.map((m, i) => (
                  <div key={i} className="mt-item">
                    {m.kind === "image"
                      ? <img src={m.url} alt="" />
                      : m.kind === "link"
                        ? <div className="mt-icon link"><Link2 size={16} /></div>
                        : <div className="mt-icon">{m.kind === "video" ? "🎬" : "🎵"}</div>}
                    <button className="mt-del" onClick={() => removeMedia(i)} title="حذف"><X size={12} /></button>
                  </div>
                ))}
              </div>
            )}
            {mediaList.length > 0 && <span className="muted-sm">{toFa(mediaList.length)} فایل انتخاب شد</span>}
          </div>

          <div className="af-row">
            <button className="btn ghost sm" onClick={() => { clearWorkDraft(DRAFT_KEY); onClose?.(); }}>انصراف</button>
            <button className="btn gold sm" disabled={!f.title} onClick={submit}>ثبت اثر</button>
          </div>
        </>
      )}

      {tab === "excel" && (
        <div className="excel-import">
          <p className="muted-sm">
            فایل اکسل باید ستون‌های زیر را داشته باشد:<br />
            <b>عنوان</b> (اجباری) · نوع · محور · کمپین · کلیدواژه (با ویرگول) · شرح · تاریخ رویداد<br />
            «نوع» می‌تواند کلید لاتین یا عنوان فارسی باشد (مثل video یا ویدئو). تاریخ به‌صورت میلادی YYYY-MM-DD و اختیاری است.
          </p>
          <div className="af-row">
            <button className="btn light sm" onClick={downloadTemplate}>
              دانلود قالب نمونه
            </button>
            <button className="btn gold sm" onClick={() => excelRef.current?.click()} disabled={importing}>
              <Upload size={14} /> {importing ? "در حال وارد کردن…" : "انتخاب فایل اکسل"}
            </button>
          </div>
          <input ref={excelRef} type="file" hidden accept=".xlsx,.xls,.csv" onChange={handleExcel} />
          {importLog && <p className="import-log">{importLog}</p>}
        </div>
      )}
    </div>
  );
}
