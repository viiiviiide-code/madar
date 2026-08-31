import React, { useEffect, useState } from "react";
import { Eye, Heart, MessageCircle, Link2, AlertTriangle } from "lucide-react";
import { api } from "../api";
import { formatJalali, toFa } from "../jalali";
import { Media, gradFor, VideoThumb, mediaKind, linkHost } from "./ProjectPage.jsx";

function fmtNum(n) {
  const v = Number(n) || 0;
  return toFa(v.toLocaleString("en-US"));
}

// Read-only, no-login view of a single work — reached via a share token
// (see api.getShareLink). Shows only that one work and its own content;
// nothing else in the app is reachable from here.
export default function PublicWorkPage({ token }) {
  const [work, setWork] = useState(null);
  const [error, setError] = useState("");
  const [activeIdx, setActiveIdx] = useState(0);

  useEffect(() => {
    api.publicWork(token)
      .then((w) => { if (w?.error) setError(w.error); else setWork(w); })
      .catch(() => setError("این لینک نامعتبر است یا حذف شده."));
  }, [token]);

  if (error) {
    return (
      <div className="app public-app">
        <div className="page public-work-page public-error">
          <AlertTriangle size={32} />
          <p>{error}</p>
        </div>
      </div>
    );
  }
  if (!work) {
    return <div className="app public-app"><div className="page muted">در حال بارگذاری…</div></div>;
  }

  const rawGallery = (work.media && work.media.length)
    ? work.media
    : (work.url ? [{ url: work.url, kind: work.type }] : []);
  const fullGallery = rawGallery.map((m) => ({ ...m, kind: mediaKind(m.url, m.kind) }));
  const links = fullGallery.filter((m) => m.kind === "link");
  const gallery = fullGallery.filter((m) => m.kind !== "link");
  const curIdx = gallery.length ? Math.min(activeIdx, gallery.length - 1) : 0;
  const item = gallery[curIdx] || null;
  const isImg = item && item.kind !== "video" && item.kind !== "audio";

  return (
    <div className="app public-app">
      <header className="topbar">
        <div className="topbar-right">
          <span className="brand">
            <span className="brand-mark" />
            <span><b>تلاش</b><em>آرشیو فعالیت‌ها و آثار مجموعه</em></span>
          </span>
        </div>
      </header>

      <div className="page public-work-page">
        <div className="work-view">
          <div className="work-media-col">
            <div className={`work-stage ${isImg ? "is-image" : ""}`}>
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
                  <video key={item.url} className="media media-contain" src={item.url} controls playsInline />
                </div>
              )}
              {item && item.kind === "audio" && (
                <div className="media media-ph" style={{ background: gradFor(work.id) }}>
                  <audio key={item.url} src={item.url} controls preload="metadata" style={{ width: "86%" }} />
                </div>
              )}
              {item && isImg && (
                <div className="media-wrap media-wrap-big">
                  <img className="media media-contain" src={item.url} alt={work.title} />
                </div>
              )}
            </div>

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
                  </button>
                ))}
              </div>
            )}

            {gallery.length > 0 && links.length > 0 && (
              <div className="work-links-row">
                {links.map((l, i) => (
                  <a key={i} className="work-link-btn" href={l.url} target="_blank" rel="noreferrer">
                    <Link2 size={14} /> {linkHost(l.url)}
                  </a>
                ))}
              </div>
            )}
          </div>

          <aside className="work-info">
            <span className="chip">{String(work.type || "").split(",").filter(Boolean).join("، ")}</span>
            <h1>{work.title}</h1>
            {work.descr && <p className="muted-sm">{work.descr}</p>}

            <div className="info-grid">
              <div className="info-block"><span className="info-k">محور</span><div className="info-v">{work.axis || "—"}</div></div>
              <div className="info-block"><span className="info-k">کمپین</span><div className="info-v">{work.campaign || "—"}</div></div>
            </div>

            {work.event_date && (
              <div className="info-block"><span className="info-k">تاریخ رویداد</span><div className="info-v">{formatJalali(work.event_date)}</div></div>
            )}

            {work.keywords?.length > 0 && (
              <div className="info-block">
                <span className="info-k">کلیدواژه‌ها</span>
                <div className="wr-kws">
                  {work.keywords.map((k) => <span key={k} className="kw-tag sm">{k}</span>)}
                </div>
              </div>
            )}

            {work.platformViews?.length > 0 && (
              <div className="pv-block">
                <span className="info-k">بازدید / لایک / کامنت</span>
                <div className="pv-view">
                  {work.platformViews.map((pv) => (
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
              </div>
            )}
          </aside>
        </div>
      </div>

      <footer className="foot">
        <span className="foot-line">قدرت‌گرفته از <span className="brand-vivide">Vivide</span></span>
      </footer>
    </div>
  );
}
