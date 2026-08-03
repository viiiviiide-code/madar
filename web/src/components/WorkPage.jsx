import React, { useEffect, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, Maximize2, Eye, Plus, X, Save, Check, Trash2 } from "lucide-react";
import { api } from "../api";
import { formatJalali, toFa, jalaliToISO } from "../jalali";
import JalaliInput from "./JalaliInput.jsx";
import KeywordInput from "./KeywordInput.jsx";
import { Media, gradFor, VideoThumb, mediaKind } from "./ProjectPage.jsx";

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
  const [saved,       setSaved]       = useState(false); // visual feedback
  const [notFound,    setNotFound]    = useState(false);
  const [axisList,    setAxisList]    = useState([]);
  const [campList,    setCampList]    = useState([]);
  const [activeIdx,   setActiveIdx]   = useState(0);
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

  /* gallery (multi-file) — kind resolved by file extension for reliable playback */
  const rawGallery = (work.media && work.media.length)
    ? work.media
    : (work.url ? [{ url: work.url, kind: work.type }] : []);
  const gallery = rawGallery.map((m) => ({ ...m, kind: mediaKind(m.url, m.kind) }));
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
  draft.platformViews.forEach((pv) => (pvMap[pv.platform_id] = pv.views));
  const draftTotal = Object.values(pvMap).reduce((a, b) => a + (Number(b) || 0), 0);

  const togglePlatform = (pid, checked) => {
    let list = draft.platformViews.filter((pv) => pv.platform_id !== pid);
    if (checked) list = [...list, { platform_id: pid, label: platforms.find(p=>p.id===pid)?.label, views: 0 }];
    setDraft({ ...draft, platformViews: list });
  };
  const setPV = (pid, views) =>
    setDraft({
      ...draft,
      platformViews: draft.platformViews.map((pv) =>
        pv.platform_id === pid ? { ...pv, views: Number(views) || 0 } : pv),
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
    await api.addPlatform(newPlatform.trim());
    await reloadMeta();
    setNewPlatform("");
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
    const added = [];
    for (const file of files) {
      try { const { url } = await api.upload(file); if (url) added.push({ url, kind: kindOf(file) }); }
      catch (err) {}
    }
    setDraft((d) => ({ ...d, media: [...(d.media || []), ...added] }));
    if (mediaFileRef.current) mediaFileRef.current.value = "";
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
            {!item && <Media work={work} big />}
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
              </div>
              <div className="ga-list">
                {(draft.media || []).map((m, i) => (
                  <div key={i} className="ga-item">
                    {m.kind === "image"
                      ? <img src={m.url} alt="" />
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
          <span className="chip">{work.type}</span>

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
            <span className="info-k">بازدید به تفکیک پلتفرم</span>
            {admin ? (
              <>
                <div className="pv-list">
                  {platforms.map((p) => {
                    const on = p.id in pvMap;
                    return (
                      <div key={p.id} className={`pv-row ${on ? "on" : ""}`}>
                        <label>
                          <input type="checkbox" checked={on}
                            onChange={(e) => togglePlatform(p.id, e.target.checked)} />
                          {p.label}
                        </label>
                        {on && (
                          <input className="pv-num" type="number" value={pvMap[p.id]}
                            onChange={(e) => setPV(p.id, e.target.value)} />
                        )}
                      </div>
                    );
                  })}
                </div>
                <div className="pv-add">
                  <input placeholder="افزودن پلتفرم…" value={newPlatform}
                    onChange={(e) => setNewPlatform(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && addPlatform()} />
                  <button className="mini" onClick={addPlatform}><Plus size={14} /></button>
                </div>
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
                        <span>{pv.label}</span><b>{fmtNum(pv.views)}</b>
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
