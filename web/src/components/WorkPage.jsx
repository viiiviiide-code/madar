import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, Maximize2, Eye, Plus, X, Save, Check, Trash2, Star, Link2, Camera, Heart, MessageCircle, Edit3, FolderInput } from "lucide-react";
import { api } from "../api";
import { formatJalali, toFa, jalaliToISO } from "../jalali";
import JalaliInput from "./JalaliInput.jsx";
import TimeInput from "./TimeInput.jsx";
import KeywordInput from "./KeywordInput.jsx";
import CopyWorkModal from "./CopyWorkModal.jsx";
import { Media, gradFor, VideoThumb, mediaKind, linkHost } from "./ProjectPage.jsx";

/* compact number display */
function fmtNum(n) {
  const v = Number(n) || 0;
  return toFa(v.toLocaleString("en-US"));
}

export default function WorkPage({ workId, projectId, admin, platforms, reloadMeta, types: typesProp = [], goBack, openWork, openProjectWithQuery }) {
  // fetch our own copy of the work-types list — self-contained, so this never
  // depends on whether/when the parent happened to pass a populated `types` prop
  const [ownTypes, setOwnTypes] = useState(typesProp);
  useEffect(() => {
    api.types().then((t) => { if (Array.isArray(t) && t.length) setOwnTypes(t); }).catch(() => {});
  }, []);
  useEffect(() => {
    if (Array.isArray(typesProp) && typesProp.length) setOwnTypes(typesProp);
  }, [typesProp]);
  const types = ownTypes;
  const [work,        setWork]        = useState(null);
  const [similar,     setSimilar]     = useState([]);
  const [draft,       setDraft]       = useState(null);
  const [newPlatform, setNewPlatform] = useState("");
  const [renamingId, setRenamingId] = useState(null);
  const [copyTarget, setCopyTarget] = useState(false);
  const [renameVal, setRenameVal] = useState("");
  const [newPlatformLogo, setNewPlatformLogo] = useState(null);
  const [newPlatformType, setNewPlatformType] = useState("social");
  const [tvFormOpenId, setTvFormOpenId] = useState(null);
  const [tvFormDate, setTvFormDate] = useState("");
  const [tvFormTime, setTvFormTime] = useState("");
  const platformLogoRef = useRef(null);
  const [saved,       setSaved]       = useState(false); // visual feedback
  const [notFound,    setNotFound]    = useState(false);
  const [axisList,    setAxisList]    = useState([]);
  const [campList,    setCampList]    = useState([]);
  const [activeIdx,   setActiveIdx]   = useState(0);
  const [uploadPct,   setUploadPct]   = useState(null);
  const [linkUrl,     setLinkUrl]     = useState("");
  const stageRef = useRef(null);
  const mediaFileRef = useRef(null);

  useEffect(() => {
    if (!admin) return;
    api.fieldValues("axis").then((v) => setAxisList(Array.isArray(v) ? v : [])).catch(() => {});
    api.fieldValues("campaign").then((v) => setCampList(Array.isArray(v) ? v : [])).catch(() => {});
  }, [admin]);

  // ensure arrays always exist so the UI never crashes on partial data
  const normalize = (w) => ({
    ...w,
    keywords: Array.isArray(w?.keywords) ? w.keywords : [],
    platformViews: Array.isArray(w?.platformViews) ? w.platformViews : [],
    totalViews: Number(w?.totalViews) || 0,
    tv: Array.isArray(w?.tv) ? w.tv : [],
  });

  const editDraftKey = (id) => `madar_draft_workedit_${id}`;

  const load = async () => {
    try {
      const w = await api.work(workId);
      if (!w || w.error || !w.id) { setNotFound(true); return; }
      const nw = normalize(w);
      setWork(nw);
      let initialDraft = JSON.parse(JSON.stringify(nw));
      try {
        const saved = JSON.parse(localStorage.getItem(editDraftKey(workId)) || "null");
        if (saved) initialDraft = saved;
      } catch {}
      setDraft(initialDraft);
      const sim = await api.similar(workId);
      setSimilar(Array.isArray(sim) ? sim.map(normalize) : []);
    } catch (e) {
      setNotFound(true);
    }
  };
  useEffect(() => { load(); setActiveIdx(0); }, [workId]);

  // persist edits to localStorage so navigating away or a refresh mid-edit doesn't lose them
  useEffect(() => {
    if (!admin || !draft) return;
    try { localStorage.setItem(editDraftKey(workId), JSON.stringify(draft)); } catch {}
  }, [draft, admin, workId]);

  // keyboard arrows navigate the gallery (declared before any conditional return
  // so hook order stays stable). RTL-friendly: Left = next, Right = previous.
  const galLen = (work?.media?.length) || (work?.url ? 1 : 0);
  useEffect(() => {
    if (galLen < 2) return;
    const onKey = (e) => {
      if (e.key === "ArrowLeft") { e.preventDefault(); setActiveIdx((i) => (i + 1) % galLen); }
      else if (e.key === "ArrowRight") { e.preventDefault(); setActiveIdx((i) => (i - 1 + galLen) % galLen); }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [galLen]);

  if (notFound) return (
    <div className="page">
      <button className="back" onClick={goBack}><ChevronRight size={16} /> بازگشت</button>
      <div className="no-res">این اثر پیدا نشد یا حذف شده است.</div>
    </div>
  );
  if (!work || !draft) return <div className="page muted">در حال بارگذاری…</div>;

  const goFullscreen = () => {
    const el = stageRef.current;
    if (!el) return;
    if (document.fullscreenElement) document.exitFullscreen();
    else el.requestFullscreen?.();
  };

  /* gallery (multi-file) — kind resolved by file extension for reliable playback.
     Links are shown separately (a standalone button), never mixed into the image/video album. */
  const rawGallery = (work.media && work.media.length)
    ? work.media
    : (work.url ? [{ url: work.url, kind: work.type }] : []);
  const fullGallery = rawGallery.map((m) => ({ ...m, kind: mediaKind(m.url, m.kind) }));
  const links = fullGallery.filter((m) => m.kind === "link");
  const gallery = fullGallery.filter((m) => m.kind !== "link");
  const curIdx = gallery.length ? Math.min(activeIdx, gallery.length - 1) : 0;
  const item = gallery[curIdx] || null;
  const isImg = item && item.kind !== "video" && item.kind !== "audio";
  const goRel = (delta) => {
    if (gallery.length < 2) return;
    setActiveIdx((i) => {
      const cur = Math.min(i, gallery.length - 1);
      return (cur + delta + gallery.length) % gallery.length;
    });
  };

  /* platform views */
  const pvMap = {};
  draft.platformViews.forEach((pv) => (pvMap[pv.platform_id] = pv));
  const draftTotal = Object.values(pvMap).reduce((a, pv) => a + (Number(pv.views) || 0), 0);
  const draftTotalLikes = Object.values(pvMap).reduce((a, pv) => a + (Number(pv.likes) || 0), 0);
  const draftTotalComments = Object.values(pvMap).reduce((a, pv) => a + (Number(pv.comments) || 0), 0);

  const togglePlatform = (pid, checked) => {
    let list = draft.platformViews.filter((pv) => pv.platform_id !== pid);
    if (checked) list = [...list, { platform_id: pid, label: platforms.find(p=>p.id===pid)?.label, views: 0, likes: 0, comments: 0 }];
    setDraft({ ...draft, platformViews: list });
  };
  const setPVField = (pid, field, value) =>
    setDraft({
      ...draft,
      platformViews: draft.platformViews.map((pv) =>
        pv.platform_id === pid ? { ...pv, [field]: Number(value) || 0 } : pv),
    });

  /* TV broadcast schedule: flat rows of {platform_id, date, time}, grouped by date for display */
  const tvRows = (pid) => (draft.tv || []).filter((t) => t.platform_id === pid);
  const tvGrouped = (pid) => {
    const byDate = {};
    tvRows(pid).forEach((r) => { (byDate[r.date] ||= []).push(r.time); });
    return Object.entries(byDate).sort(([a], [b]) => a.localeCompare(b));
  };
  const addTvEntry = (pid) => {
    if (!tvFormDate || !tvFormTime) return;
    const already = (draft.tv || []).some((t) => t.platform_id === pid && t.date === tvFormDate && t.time === tvFormTime);
    if (!already) setDraft({ ...draft, tv: [...(draft.tv || []), { platform_id: pid, date: tvFormDate, time: tvFormTime }] });
    setTvFormTime("");
  };
  const removeTvEntry = (pid, date, time) =>
    setDraft({ ...draft, tv: (draft.tv || []).filter((t) => !(t.platform_id === pid && t.date === date && t.time === time)) });
  const removeTvDate = (pid, date) =>
    setDraft({ ...draft, tv: (draft.tv || []).filter((t) => !(t.platform_id === pid && t.date === date)) });

  const save = async () => {
    try {
      const res = await api.updateWork(work.id, {
        title:      draft.title,
        descr:      draft.descr,
        axis:       draft.axis,
        campaign:   draft.campaign,
        event_date: draft.event_date,
        type:       draft.type,
        keywords:   draft.keywords,
        featured:   draft.featured ? 1 : 0,
        platformViews: draft.platformViews,
        tv:         draft.tv || [],
        media:      draft.media || [],
      });
      const nw = normalize(res);
      setWork(nw);
      setDraft(JSON.parse(JSON.stringify(nw)));
      try { localStorage.removeItem(editDraftKey(work.id)); } catch {}
      const sim = await api.similar(work.id);
      setSimilar(Array.isArray(sim) ? sim.map(normalize) : []);
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (e) {
      alert("ذخیره ناموفق بود. اتصال به سرور را بررسی کن.");
    }
  };

  const addPlatform = async () => {
    if (!newPlatform.trim()) return;
    let logo_url = null;
    if (newPlatformLogo) {
      try { const r = await api.uploadWithProgress(newPlatformLogo); logo_url = r.url; } catch (e) {}
    }
    await api.addPlatform(newPlatform.trim(), logo_url, newPlatformType);
    await reloadMeta();
    setNewPlatform("");
    setNewPlatformLogo(null);
    if (platformLogoRef.current) platformLogoRef.current.value = "";
  };
  const uploadPlatformLogo = async (pid, file) => {
    if (!file) return;
    try {
      const r = await api.uploadWithProgress(file);
      await api.updatePlatform(pid, { logo_url: r.url });
      await reloadMeta();
    } catch (e) {}
  };
  const commitRename = async (pid) => {
    const v = renameVal.trim();
    setRenamingId(null);
    if (!v) return;
    const cur = platforms.find((p) => p.id === pid);
    if (cur && v === cur.label) return;
    await api.updatePlatform(pid, { label: v });
    await reloadMeta();
  };

  const kindOf = (file) => {
    const t = file.type || "";
    if (t.startsWith("video")) return "video";
    if (t.startsWith("audio")) return "audio";
    if (t.startsWith("image")) return "image";
    return mediaKind(file.name, "image");
  };
  const onAddFiles = async (e) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setUploadPct({ i: i + 1, n: files.length, pct: 0 });
      try {
        const { url } = await api.uploadWithProgress(file, (pct) => setUploadPct({ i: i + 1, n: files.length, pct }));
        if (url) setDraft((d) => ({ ...d, media: [...(d.media || []), { url, kind: kindOf(file) }] }));
      } catch (err) {}
    }
    setUploadPct(null);
    if (mediaFileRef.current) mediaFileRef.current.value = "";
  };
  const addDraftLink = () => {
    const u = linkUrl.trim();
    if (!u) return;
    setDraft((d) => ({ ...d, media: [...(d.media || []), { url: u, kind: "link" }] }));
    setLinkUrl("");
  };
  const removeDraftMedia = (i) =>
    setDraft((d) => ({ ...d, media: (d.media || []).filter((_, j) => j !== i) }));

  return (
    <div className="page">
      <button className="back" onClick={goBack}>
        <ChevronRight size={16} /> بازگشت به آثار
      </button>

      <div className="work-view">
        {/* media stage (gallery-aware) */}
        <div className="work-media-col">
          <div className={`work-stage ${isImg ? "is-image" : ""}`} ref={stageRef}>
            {!item && links.length > 0 && (
              <a className="media media-ph media-link" href={links[0].url} target="_blank" rel="noreferrer"
                style={{ background: gradFor(work.id) }}>
                <Link2 size={40} strokeWidth={1.4} />
                <span className="media-link-t">{linkHost(links[0].url)}</span>
              </a>
            )}
            {!item && links.length === 0 && <Media work={work} big />}
            {item && item.kind === "video" && (
              <div className="media-wrap media-wrap-big">
                <video key={item.url} className="media media-contain" src={item.url} controls autoPlay playsInline />
              </div>
            )}
            {item && item.kind === "audio" && (
              <div className="media media-ph" style={{ background: gradFor(work.id) }}>
                <audio key={item.url} src={item.url} controls preload="metadata" style={{ width: "86%" }} />
              </div>
            )}
            {item && isImg && (
              <div className="media-wrap media-wrap-big"
                onClick={() => gallery.length > 1 && goRel(1)}
                style={gallery.length > 1 ? { cursor: "pointer" } : undefined}>
                <img className="media media-contain" src={item.url} alt={work.title} />
              </div>
            )}

            {/* nav arrows (when more than one file) */}
            {gallery.length > 1 && (
              <>
                <button className="gal-nav gal-prev" onClick={(e) => { e.stopPropagation(); goRel(-1); }} title="قبلی">
                  <ChevronRight size={22} />
                </button>
                <button className="gal-nav gal-next" onClick={(e) => { e.stopPropagation(); goRel(1); }} title="بعدی">
                  <ChevronLeft size={22} />
                </button>
                <span className="gal-counter">{toFa(curIdx + 1)} / {toFa(gallery.length)}</span>
              </>
            )}

            {item && item.kind !== "audio" && (
              <button className="ic-btn stage-fs" onClick={goFullscreen} title="تمام‌صفحه">
                <Maximize2 size={17} />
              </button>
            )}
          </div>

          {/* thumbnails strip when more than one file */}
          {gallery.length > 1 && (
            <div className="gallery-strip">
              {gallery.map((m, i) => (
                <button key={i} className={`gs-thumb ${i === curIdx ? "active" : ""}`}
                  onClick={() => setActiveIdx(i)} title={`فایل ${toFa(i + 1)}`}>
                  {m.kind === "video"
                    ? <VideoThumb url={m.url} className="gs-img" />
                    : m.kind === "audio"
                      ? <span className="gs-icon">🎵</span>
                      : <img className="gs-img" src={m.url} alt="" />}
                  {m.kind === "video" && <span className="gs-play">▶</span>}
                </button>
              ))}
            </div>
          )}

          {/* standalone link buttons — shown separately from the media album, never mixed into it */}
          {gallery.length > 0 && links.length > 0 && (
            <div className="work-links-row">
              {links.map((l, i) => (
                <a key={i} className="work-link-btn" href={l.url} target="_blank" rel="noreferrer">
                  <Link2 size={14} /> {linkHost(l.url)}
                </a>
              ))}
            </div>
          )}

          {/* admin: manage gallery files */}
          {admin && (
            <div className="gallery-admin">
              <div className="ga-head">
                <span className="info-k">فایل‌های اثر (گالری)</span>
                <button className="btn light sm" onClick={() => mediaFileRef.current?.click()}>
                  <Plus size={13} /> افزودن فایل
                </button>
                <input ref={mediaFileRef} type="file" hidden multiple
                  accept="image/*,video/*,audio/*" onChange={onAddFiles} />
                <div className="link-add">
                  <input placeholder="آدرس لینک (اسکرین‌شات/لینک خارجی)" value={linkUrl}
                    onChange={(e) => setLinkUrl(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addDraftLink()}
                    onBlur={addDraftLink} />
                  <button className="mini" onClick={addDraftLink} title="افزودن لینک"><Link2 size={14} /></button>
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
              <div className="ga-list">
                {(draft.media || []).map((m, i) => (
                  <div key={i} className="ga-item">
                    {m.kind === "image"
                      ? <img src={m.url} alt="" />
                      : m.kind === "link"
                        ? <span className="ga-icon"><Link2 size={16} /></span>
                        : <span className="ga-icon">{m.kind === "video" ? "🎬" : "🎵"}</span>}
                    <button className="mt-del" onClick={() => removeDraftMedia(i)} title="حذف"><X size={12} /></button>
                  </div>
                ))}
                {(!draft.media || draft.media.length === 0) && (
                  <span className="muted-sm">فایلی نیست؛ با «افزودن فایل» چند عکس/ویدئو اضافه کن.</span>
                )}
              </div>
              <span className="muted-sm">پس از تغییر فایل‌ها، «ذخیرهٔ تغییرات» را بزن.</span>
            </div>
          )}
        </div>

        {/* info aside */}
        <aside className="work-info">
          <div className="wi-top">
            {!admin && <span className="chip">{String(work.type || "").split(",").filter(Boolean).join("، ")}</span>}
            {admin && (
              <button className={`card-star ${draft.featured ? "on" : ""}`}
                title={draft.featured ? "حذف از آثار شاخص" : "علامت‌گذاری به‌عنوان اثر شاخص"}
                onClick={() => setDraft({ ...draft, featured: draft.featured ? 0 : 1 })}>
                <Star size={15} fill={draft.featured ? "currentColor" : "none"} /> اثر شاخص
              </button>
            )}
            {!admin && work.featured ? <span className="featured-badge"><Star size={13} fill="currentColor" /> اثر شاخص</span> : null}
          </div>

          {admin && (
            <div className="wi-type-edit">
              <span className="info-k">نوع اثر</span>
              <div className="type-multi">
                {types.length === 0 && (
                  <span className="muted-sm">نوعی تعریف نشده — از فرم «ثبت اثر» یک نوع اضافه کن.</span>
                )}
                {types.map((t) => {
                  const selectedTypes = String(draft.type || "").split(",").filter(Boolean);
                  const on = selectedTypes.includes(t.key);
                  return (
                    <button key={t.key} type="button" className={`type-chip ${on ? "on" : ""}`}
                      onClick={() => {
                        const set = new Set(selectedTypes);
                        if (set.has(t.key)) set.delete(t.key); else set.add(t.key);
                        setDraft({ ...draft, type: Array.from(set).join(",") });
                      }}>
                      {t.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {admin
            ? <input className="ed h1-ed" value={draft.title}
                onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            : <h1>{work.title}</h1>}

          <Field label="شرح اثر">
            {admin
              ? <textarea className="ed" value={draft.descr || ""}
                  onChange={(e) => setDraft({ ...draft, descr: e.target.value })} />
              : (work.descr || "—")}
          </Field>

          <div className="info-grid">
            <Field label="محور">
              {admin
                ? <input className="ed" value={draft.axis || ""} list="axis-options-w"
                    onChange={(e) => setDraft({ ...draft, axis: e.target.value })} />
                : (work.axis || "—")}
            </Field>
            <Field label="کمپین">
              {admin
                ? <input className="ed" value={draft.campaign || ""} list="campaign-options-w"
                    onChange={(e) => setDraft({ ...draft, campaign: e.target.value })} />
                : (work.campaign || "—")}
            </Field>
          </div>
          {admin && (
            <>
              <datalist id="axis-options-w">{axisList.map((v) => <option key={v} value={v} />)}</datalist>
              <datalist id="campaign-options-w">{campList.map((v) => <option key={v} value={v} />)}</datalist>
            </>
          )}

          {admin ? (
            <Field label="تاریخ رویداد">
              <label className="date-check">
                <input type="checkbox" checked={draft.event_date != null}
                  onChange={(e) => setDraft({ ...draft, event_date: e.target.checked ? jalaliToISO(1404, 1, 1) : null })} />
                تاریخ رویداد دارد
              </label>
              {draft.event_date != null && (
                <div style={{ marginTop: 8 }}>
                  <JalaliInput value={draft.event_date}
                    onChange={(d) => setDraft({ ...draft, event_date: d })} />
                </div>
              )}
            </Field>
          ) : (
            work.event_date && (
              <Field label="تاریخ رویداد">{formatJalali(work.event_date)}</Field>
            )
          )}

          <Field label="کلیدواژه‌ها">
            {admin
              ? <KeywordInput value={draft.keywords}
                  onChange={(keywords) => setDraft({ ...draft, keywords })} />
              : (
                <div className="wr-kws">
                  {work.keywords.length === 0
                    ? <span className="muted-sm">—</span>
                    : work.keywords.map((k) => (
                        <span key={k} className="kw-tag sm">{k}</span>
                      ))}
                </div>
              )}
          </Field>

          {/* platform views — social networks only; TV networks have their own section below */}
          <div className="pv-block">
            <span className="info-k">بازدید / لایک / کامنت — شبکه‌های اجتماعی</span>
            {admin ? (
              <>
                <div className="pv-list">
                  {platforms.filter((p) => p.type !== "tv").map((p) => {
                    const on = p.id in pvMap;
                    const pv = pvMap[p.id] || {};
                    return (
                      <div key={p.id} className={`pv-card ${on ? "on" : ""}`}>
                        <label className="pv-card-head">
                          <input type="checkbox" className="pv-check" checked={on}
                            onChange={(e) => togglePlatform(p.id, e.target.checked)} />
                          <span className="plat-logo-wrap">
                            {p.logo_url
                              ? <img className="plat-logo" src={p.logo_url} alt="" />
                              : <span className="plat-logo ph">{p.label?.[0] || "?"}</span>}
                            <label className="plat-logo-edit" title="تغییر لوگو" onClick={(e) => e.stopPropagation()}>
                              <Camera size={11} />
                              <input type="file" hidden accept="image/*"
                                onChange={(e) => uploadPlatformLogo(p.id, e.target.files?.[0])} />
                            </label>
                          </span>
                          {renamingId === p.id ? (
                            <input className="pv-rename-in" autoFocus value={renameVal}
                              onClick={(e) => e.stopPropagation()}
                              onChange={(e) => setRenameVal(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && commitRename(p.id)}
                              onBlur={() => commitRename(p.id)} />
                          ) : (
                            <span className="pv-plabel-t">{p.label}</span>
                          )}
                        </label>
                        {on && (
                          <div className="pv-nums">
                            <label className="pv-num-lbl"><Eye size={13} />
                              <input className="pv-num" type="number" value={pv.views || 0}
                                onChange={(e) => setPVField(p.id, "views", e.target.value)} />
                            </label>
                            <label className="pv-num-lbl"><Heart size={13} />
                              <input className="pv-num" type="number" value={pv.likes || 0}
                                onChange={(e) => setPVField(p.id, "likes", e.target.value)} />
                            </label>
                            <label className="pv-num-lbl"><MessageCircle size={13} />
                              <input className="pv-num" type="number" value={pv.comments || 0}
                                onChange={(e) => setPVField(p.id, "comments", e.target.value)} />
                            </label>
                          </div>
                        )}
                        <div className="pv-card-tools">
                          <button className="mini" title="تغییر نام" onClick={(e) => { e.stopPropagation(); setRenamingId(p.id); setRenameVal(p.label); }}>
                            <Edit3 size={12} /> تغییر نام
                          </button>
                          <button className="mini danger" title="حذف پلتفرم"
                            onClick={async (e) => {
                              e.stopPropagation();
                              if (confirm(`پلتفرم «${p.label}» حذف شود؟ آمار ثبت‌شده برایش هم پاک می‌شود.`)) {
                                await api.delPlatform(p.id);
                                await reloadMeta();
                              }
                            }}>
                            <Trash2 size={12} /> حذف
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <div className="pv-add">
                  <input placeholder="افزودن پلتفرم…" value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPlatform()} />
                  <div className="pv-type-pick">
                    <label className={newPlatformType === "social" ? "on" : ""}>
                      <input type="radio" name="newPlatformType" checked={newPlatformType === "social"}
                        onChange={() => setNewPlatformType("social")} /> شبکهٔ اجتماعی
                    </label>
                    <label className={newPlatformType === "tv" ? "on" : ""}>
                      <input type="radio" name="newPlatformType" checked={newPlatformType === "tv"}
                        onChange={() => setNewPlatformType("tv")} /> تلویزیونی
                    </label>
                  </div>
                  <button className="mini" title="لوگوی پلتفرم جدید" onClick={() => platformLogoRef.current?.click()}>
                    <Camera size={14} />
                  </button>
                  <input ref={platformLogoRef} type="file" hidden accept="image/*"
                    onChange={(e) => setNewPlatformLogo(e.target.files?.[0] || null)} />
                  <button className="mini" onClick={addPlatform}><Plus size={14} /></button>
                </div>
                {newPlatformLogo && <span className="muted-sm">لوگو انتخاب شد: {newPlatformLogo.name}</span>}
                <div className="pv-totals">
                  <div className="pv-total-item">
                    <Eye size={16} className="cyan" />
                    <div><span className="info-k">جمع بازدید</span><div className="info-v">{fmtNum(draftTotal)}</div></div>
                  </div>
                  <div className="pv-total-item">
                    <Heart size={16} className="cyan" />
                    <div><span className="info-k">جمع لایک</span><div className="info-v">{fmtNum(draftTotalLikes)}</div></div>
                  </div>
                  <div className="pv-total-item">
                    <MessageCircle size={16} className="cyan" />
                    <div><span className="info-k">جمع کامنت</span><div className="info-v">{fmtNum(draftTotalComments)}</div></div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="pv-view">
                  {work.platformViews.length === 0
                    ? <span className="muted-sm">ثبت نشده</span>
                    : work.platformViews.map((pv) => (
                      <div key={pv.platform_id} className="pv-line">
                        <span className="plat-logo-wrap sm">
                          {pv.logo_url
                            ? <img className="plat-logo" src={pv.logo_url} alt="" />
                            : <span className="plat-logo ph">{pv.label?.[0] || "?"}</span>}
                        </span>
                        <span className="pv-line-name">{pv.label}</span>
                        <div className="pv-line-stats">
                          <b><Eye size={13} /> {fmtNum(pv.views)}</b>
                          <b><Heart size={13} /> {fmtNum(pv.likes)}</b>
                          <b><MessageCircle size={13} /> {fmtNum(pv.comments)}</b>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="pv-totals">
                  <div className="pv-total-item">
                    <Eye size={16} className="cyan" />
                    <div><span className="info-k">جمع بازدید</span><div className="info-v">{fmtNum(work.totalViews)}</div></div>
                  </div>
                  <div className="pv-total-item">
                    <Heart size={16} className="cyan" />
                    <div><span className="info-k">جمع لایک</span><div className="info-v">{fmtNum(work.totalLikes)}</div></div>
                  </div>
                  <div className="pv-total-item">
                    <MessageCircle size={16} className="cyan" />
                    <div><span className="info-k">جمع کامنت</span><div className="info-v">{fmtNum(work.totalComments)}</div></div>
                  </div>
                </div>
              </>
            )}
          </div>

          {/* TV broadcast conductor — networks have no views/likes/comments, only a schedule */}
          {(admin || work.tv.length > 0) && (
            <div className="pv-block tv-block">
              <span className="info-k">کنداکتور پخش — شبکه‌های تلویزیونی</span>
              {admin ? (
                <div className="pv-list">
                  {platforms.filter((p) => p.type === "tv").length === 0 && (
                    <p className="muted-sm">هنوز شبکه‌ای تعریف نشده — از فرم «افزودن پلتفرم» بالا با گزینهٔ «تلویزیونی» اضافه کن.</p>
                  )}
                  {platforms.filter((p) => p.type === "tv").map((p) => {
                    const grouped = tvGrouped(p.id);
                    const formOpen = tvFormOpenId === p.id;
                    return (
                      <div key={p.id} className={`pv-card ${grouped.length ? "on" : ""}`}>
                        <div className="pv-card-head">
                          <span className="plat-logo-wrap">
                            {p.logo_url
                              ? <img className="plat-logo" src={p.logo_url} alt="" />
                              : <span className="plat-logo ph">{p.label?.[0] || "?"}</span>}
                            <label className="plat-logo-edit" title="تغییر لوگو" onClick={(e) => e.stopPropagation()}>
                              <Camera size={11} />
                              <input type="file" hidden accept="image/*"
                                onChange={(e) => uploadPlatformLogo(p.id, e.target.files?.[0])} />
                            </label>
                          </span>
                          {renamingId === p.id ? (
                            <input className="pv-rename-in" autoFocus value={renameVal}
                              onChange={(e) => setRenameVal(e.target.value)}
                              onKeyDown={(e) => e.key === "Enter" && commitRename(p.id)}
                              onBlur={() => commitRename(p.id)} />
                          ) : (
                            <span className="pv-plabel-t">{p.label}</span>
                          )}
                        </div>

                        {grouped.length > 0 && (
                          <div className="tv-dates">
                            {grouped.map(([date, times]) => (
                              <div key={date} className="tv-date-block">
                                <span className="tv-date-t">{formatJalali(date)}</span>
                                <div className="tv-times">
                                  {times.map((t) => (
                                    <span key={t} className="tv-time-chip">
                                      {t}
                                      <button onClick={() => removeTvEntry(p.id, date, t)}><X size={10} /></button>
                                    </span>
                                  ))}
                                </div>
                                <button className="mini" title="حذف این تاریخ" onClick={() => removeTvDate(p.id, date)}>
                                  <Trash2 size={11} />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}

                        {formOpen ? (
                          <div className="tv-add-form">
                            <JalaliInput value={tvFormDate || jalaliToISO(1404, 1, 1)} onChange={setTvFormDate} />
                            <TimeInput value={tvFormTime} onChange={setTvFormTime} />
                            <button className="mini" disabled={!tvFormDate || !tvFormTime} onClick={() => addTvEntry(p.id)}><Plus size={13} /></button>
                            <button className="mini" onClick={() => { setTvFormOpenId(null); setTvFormDate(""); setTvFormTime(""); }}><X size={13} /></button>
                          </div>
                        ) : (
                          <button className="btn light sm tv-add-btn" onClick={() => { setTvFormOpenId(p.id); setTvFormDate(""); setTvFormTime(""); }}>
                            <Plus size={13} /> افزودن تاریخ/ساعت پخش
                          </button>
                        )}

                        <div className="pv-card-tools">
                          <button className="mini" title="تغییر نام" onClick={() => { setRenamingId(p.id); setRenameVal(p.label); }}>
                            <Edit3 size={12} /> تغییر نام
                          </button>
                          <button className="mini danger" title="حذف شبکه"
                            onClick={async () => {
                              if (confirm(`شبکهٔ «${p.label}» حذف شود؟`)) { await api.delPlatform(p.id); await reloadMeta(); }
                            }}>
                            <Trash2 size={12} /> حذف
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="pv-view">
                  {work.tv.length === 0 && <span className="muted-sm">پخش تلویزیونی ثبت نشده</span>}
                  {Object.values(
                    work.tv.reduce((acc, t) => {
                      (acc[t.platform_id] ||= { label: t.label, logo_url: t.logo_url, dates: {} });
                      (acc[t.platform_id].dates[t.date] ||= []).push(t.time);
                      return acc;
                    }, {})
                  ).map((net, i) => (
                    <div key={i} className="tv-view-card">
                      <div className="pv-line-name-row">
                        <span className="plat-logo-wrap sm">
                          {net.logo_url
                            ? <img className="plat-logo" src={net.logo_url} alt="" />
                            : <span className="plat-logo ph">{net.label?.[0] || "?"}</span>}
                        </span>
                        <span className="pv-line-name">{net.label}</span>
                      </div>
                      <div className="tv-dates">
                        {Object.entries(net.dates).sort(([a], [b]) => a.localeCompare(b)).map(([date, times]) => (
                          <div key={date} className="tv-date-block view">
                            <span className="tv-date-t">{formatJalali(date)}</span>
                            <div className="tv-times">
                              {times.map((t) => <span key={t} className="tv-time-chip view">{t}</span>)}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {admin && (
            <div className="work-admin-actions">
              <button className={`btn ${saved ? "saved" : "gold"}`} onClick={save}>
                {saved ? <><Check size={15} /> ذخیره شد!</> : <><Save size={15} /> ذخیرهٔ تغییرات</>}
              </button>
              <button className="btn light" onClick={() => setCopyTarget(true)}>
                <FolderInput size={15} /> کپی به فعالیت دیگر
              </button>
              <button className="btn ghost danger" onClick={async () => {
                if (confirm("این اثر برای همیشه حذف شود؟")) {
                  await api.delWork(work.id);
                  goBack();
                }
              }}>
                <Trash2 size={15} /> حذف اثر
              </button>
            </div>
          )}
        </aside>
      </div>

      {copyTarget && (
        <CopyWorkModal
          work={work}
          currentProjectId={projectId}
          onClose={() => setCopyTarget(false)}
          onDone={(result) => { setCopyTarget(false); if (result?.moved) goBack(); }}
        />
      )}

      {/* similar works */}
      {similar.length > 0 && (
        <section className="similar">
          <h2>آثار مشابه</h2>
          <p className="muted-sm">بر اساس اشتراک کلیدواژه‌ها</p>
          <div className="works-grid">
            {similar.map((w) => (
              <button key={w.id} className="work-card" onClick={() => openWork(w.id)}>
                <Media work={w} />
                <div className="work-meta">
                  <div className="work-top">
                    <span className="chip">{w.type}</span>
                    <span className="views"><Eye size={13} /> {fmtNum(w.totalViews)}</span>
                  </div>
                  <h3>{w.title}</h3>
                  <p className="muted-sm">{w.keywords.slice(0, 3).join("، ")}</p>
                </div>
              </button>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}

function Field({ label, children }) {
  return (
    <div className="info-block">
      <span className="info-k">{label}</span>
      <div className="info-v">{children}</div>
    </div>
  );
}
