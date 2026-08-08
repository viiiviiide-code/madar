import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, Maximize2, Eye, Plus, X, Save, Check, Trash2, Star, Link2, Camera, Heart, MessageCircle } from "lucide-react";
import { api } from "../api";
import { formatJalali, toFa, jalaliToISO } from "../jalali";
import JalaliInput from "./JalaliInput.jsx";
import KeywordInput from "./KeywordInput.jsx";
import { Media, gradFor, VideoThumb, mediaKind, linkHost } from "./ProjectPage.jsx";

/* compact number display */
function fmtNum(n) {
  const v = Number(n) || 0;
  if (v >= 1_000_000) return toFa((v / 1_000_000).toFixed(1)) + " میلیون";
  if (v >= 1_000)     return toFa(Math.round(v / 1_000))      + " هزار";
  return toFa(v);
}

export default function WorkPage({ workId, projectId, admin, platforms, reloadMeta, goBack, openWork, openProjectWithQuery }) {
  const [work,        setWork]        = useState(null);
  const [similar,     setSimilar]     = useState([]);
  const [draft,       setDraft]       = useState(null);
  const [newPlatform, setNewPlatform] = useState("");
  const [newPlatformLogo, setNewPlatformLogo] = useState(null);
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
  });

  const load = async () => {
    try {
      const w = await api.work(workId);
      if (!w || w.error || !w.id) { setNotFound(true); return; }
      const nw = normalize(w);
      setWork(nw);
      setDraft(JSON.parse(JSON.stringify(nw)));
      const sim = await api.similar(workId);
      setSimilar(Array.isArray(sim) ? sim.map(normalize) : []);
    } catch (e) {
      setNotFound(true);
    }
  };
  useEffect(() => { load(); setActiveIdx(0); }, [workId]);

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
        media:      draft.media || [],
      });
      const nw = normalize(res);
      setWork(nw);
      setDraft(JSON.parse(JSON.stringify(nw)));
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
    await api.addPlatform(newPlatform.trim(), logo_url);
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
            <span className="chip">{work.type}</span>
            {admin && (
              <button className={`card-star ${draft.featured ? "on" : ""}`}
                title={draft.featured ? "حذف از آثار شاخص" : "علامت‌گذاری به‌عنوان اثر شاخص"}
                onClick={() => setDraft({ ...draft, featured: draft.featured ? 0 : 1 })}>
                <Star size={15} fill={draft.featured ? "currentColor" : "none"} /> اثر شاخص
              </button>
            )}
            {!admin && work.featured ? <span className="featured-badge"><Star size={13} fill="currentColor" /> اثر شاخص</span> : null}
          </div>

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

          {/* platform views */}
          <div className="pv-block">
            <span className="info-k">بازدید / لایک / کامنت به تفکیک پلتفرم</span>
            {admin ? (
              <>
                <div className="pv-list">
                  {platforms.map((p) => {
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
                          <span className="pv-plabel-t">{p.label}</span>
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
                      </div>
                    );
                  })}
                </div>
                <div className="pv-add">
                  <input placeholder="افزودن پلتفرم…" value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPlatform()} />
                  <button className="mini" title="لوگوی پلتفرم جدید" onClick={() => platformLogoRef.current?.click()}>
                    <Camera size={14} />
                  </button>
                  <input ref={platformLogoRef} type="file" hidden accept="image/*"
                    onChange={(e) => setNewPlatformLogo(e.target.files?.[0] || null)} />
                  <button className="mini" onClick={addPlatform}><Plus size={14} /></button>
                </div>
                {newPlatformLogo && <span className="muted-sm">لوگو انتخاب شد: {newPlatformLogo.name}</span>}
                <div className="pv-total">
                  <Eye size={18} className="cyan" />
                  <div>
                    <span className="info-k">مجموع بازدید</span>
                    <div className="info-v big">{fmtNum(draftTotal)}</div>
                  </div>
                </div>
              </>
            ) : (
              <>
                <div className="pv-view">
                  {work.platformViews.length === 0
                    ? <span className="muted-sm">ثبت نشده</span>
                    : work.platformViews.map((pv) => (
                      <div key={pv.platform_id} className="pv-chip">
                        <span className="plat-logo-wrap sm">
                          {pv.logo_url
                            ? <img className="plat-logo" src={pv.logo_url} alt="" />
                            : <span className="plat-logo ph">{pv.label?.[0] || "?"}</span>}
                        </span>
                        <div className="pv-chip-body">
                          <span className="pv-chip-name">{pv.label}</span>
                          <div className="pv-chip-stats">
                            <b><Eye size={12} /> {fmtNum(pv.views)}</b>
                            {!!pv.likes && <b><Heart size={12} /> {fmtNum(pv.likes)}</b>}
                            {!!pv.comments && <b><MessageCircle size={12} /> {fmtNum(pv.comments)}</b>}
                          </div>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="pv-total">
                  <Eye size={18} className="cyan" />
                  <div>
                    <span className="info-k">مجموع بازدید</span>
                    <div className="info-v big">{fmtNum(work.totalViews)}</div>
                  </div>
                </div>
              </>
            )}
          </div>

          {admin && (
            <div className="work-admin-actions">
              <button className={`btn ${saved ? "saved" : "gold"}`} onClick={save}>
                {saved ? <><Check size={15} /> ذخیره شد!</> : <><Save size={15} /> ذخیرهٔ تغییرات</>}
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
