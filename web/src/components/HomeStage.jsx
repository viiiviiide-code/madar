import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Play, Pause, ChevronLeft, ChevronRight, ChevronDown, ArrowLeft, Edit3, Film, Check, Clapperboard, Rows3, PanelsLeftBottom,
} from "lucide-react";
import { api } from "../api";
import { toFa, formatJalaliMonth } from "../jalali";
import { gradFor } from "./ProjectPage.jsx";
import { heroDelayMs, ThumbImg } from "./Lazy.jsx";
import { VodRow } from "./Vod.jsx";
import { EmptyState } from "./States.jsx";

/* =====================================================================
   صفحهٔ اول در سه نمای نمایشی که جای نقشهٔ مداری (دایره‌ای، مربعی، کارتی) را گرفته‌اند:
     cinema  — هیروی تمام‌صفحه با تیزر، پیشرفت خودکار و فیلم‌استریپ (حالت ارائه)
     rows    — هر فعالیت یک ردیف VOD؛ تیزر با رفتن موس روی کارتش پخش می‌شود
     panels  — پرده‌های بازشونده؛ پرده‌ای که موس رویش است باز می‌شود و تیزرش پخش می‌شود
   ===================================================================== */

export const STAGE_MODES = [
  { key: "cinema", label: "سینما", hint: "هیرو و فیلم‌استریپ", icon: Clapperboard },
  { key: "rows", label: "ردیف‌ها", hint: "هر فعالیت یک ردیف", icon: Rows3 },
  { key: "panels", label: "پرده‌ها", hint: "پنل‌های بازشونده", icon: PanelsLeftBottom },
];
// مقدارهای قدیمی تم (orbit/square/card) «انتخاب صریح» حساب نمی‌شوند؛ نمای پیش‌فرض سایت اعمال می‌شود
export const normalizeStageMode = (m) => (["cinema", "rows", "panels"].includes(m) ? m : null);

const rangeText = (p) =>
  p.start_date
    ? formatJalaliMonth(p.start_date) + (p.end_date && p.end_date.slice(0, 7) !== p.start_date.slice(0, 7) ? ` تا ${formatJalaliMonth(p.end_date)}` : "")
    : "بدون تاریخ";
const two = (n) => toFa(String(n).padStart(2, "0"));

/* ---- کاور: تصویر یا گرادیان؛ تیزر فقط وقتی play=true است بارگذاری و پخش می‌شود ---- */
function Cover({ project, cover, play, eager, showImg = true, delay = 0, w = 480 }) {
  const vref = useRef(null);
  const [armed, setArmed] = useState(!!eager);
  const [ready, setReady] = useState(false);
  // تصویر پایه تا رسیدن ویدئو: فریم خود تیزر (همان چیزی که بعداً پخش می‌شود)، نه کاور یک اثر دیگر.
  // فقط اگر فعالیت تیزر ندارد یا فریمش در دسترس نبود، کاور اثر استفاده می‌شود.
  const [teaserFrameFailed, setTeaserFrameFailed] = useState(false);
  const baseUrl = project.teaser_url && !teaserFrameFailed ? project.teaser_url : cover;
  // delay: تیزر (که ده‌ها مگابایت است) را بعد از رسیدن کاور و رابط شروع می‌کنیم تا پهنای باند را از آن‌ها نگیرد
  useEffect(() => {
    if (!play) return;
    if (!delay) { setArmed(true); return; }
    const t = setTimeout(() => setArmed(true), delay);
    return () => clearTimeout(t);
  }, [play, delay]);
  useEffect(() => {
    const v = vref.current;
    if (!v) return;
    if (play) { const pr = v.play(); if (pr && pr.catch) pr.catch(() => {}); }
    else { v.pause(); try { v.currentTime = 0; } catch {} setReady(false); }
  }, [play, armed]);
  return (
    <div className="hs-cover" style={{ background: gradFor(project.id) }}>
      {baseUrl && showImg && <ThumbImg className="hs-cover-img" url={baseUrl} w={w} alt="" loading="lazy" decoding="async" draggable="false"
        onFail={() => { if (baseUrl === project.teaser_url) setTeaserFrameFailed(true); }} />}
      {project.teaser_url && armed && (
        <video ref={vref} className={`hs-cover-vid ${ready && play ? "on" : ""}`} src={project.teaser_url}
          muted loop playsInline preload="auto" onPlaying={() => setReady(true)} />
      )}
    </div>
  );
}

function EditBtn({ p, canEdit, onEdit }) {
  if (!canEdit(p)) return null;
  return (
    <button className="hs-edit" onClick={(e) => { e.stopPropagation(); onEdit(p.id); }} title="ویرایش فعالیت">
      <Edit3 size={14} /> ویرایش
    </button>
  );
}

/* =============================== ۱) سینما =============================== */
function Cinema({ items, coverOf, onOpen, onOpenWork, canEdit, onEdit, autoplay }) {
  const n = items.length;
  const [idx, setIdx] = useState(0);
  const [paused, setPaused] = useState(false);
  const [manual, setManual] = useState(!autoplay);
  const stage = useRef(null);
  const strip = useRef(null);
  const raf = useRef(0);
  const swipe = useRef(null);
  const hoverT = useRef(0);

  useEffect(() => { if (idx >= n) setIdx(0); }, [n]);
  useEffect(() => { setManual(!autoplay); }, [autoplay]);
  const go = useCallback((d) => setIdx((i) => (i + d + n) % n), [n]);

  // با تعداد زیاد فعالیت، فیلم‌استریپ باید دنبال اسلاید فعال اسکرول کند (فقط خود استریپ، نه صفحه)
  useEffect(() => {
    const s = strip.current, t = s && s.children[idx];
    if (!t) return;
    const sr = s.getBoundingClientRect(), tr = t.getBoundingClientRect(), pad = 28;
    if (tr.left < sr.left + pad) s.scrollBy({ left: tr.left - sr.left - pad, behavior: "smooth" });
    else if (tr.right > sr.right - pad) s.scrollBy({ left: tr.right - sr.right + pad, behavior: "smooth" });
  }, [idx]);

  const onMove = (e) => {
    const el = stage.current;
    if (!el) return;
    const { clientX, clientY } = e;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const r = el.getBoundingClientRect();
      const x = clientX - r.left, y = clientY - r.top;
      el.style.setProperty("--mx", `${x}px`);
      el.style.setProperty("--my", `${y}px`);
      el.style.setProperty("--px", (x / r.width - 0.5).toFixed(3));
      el.style.setProperty("--py", (y / r.height - 0.5).toFixed(3));
    });
  };
  const onKey = (e) => {
    if (e.key === "ArrowLeft") { e.preventDefault(); go(1); }
    if (e.key === "ArrowRight") { e.preventDefault(); go(-1); }
  };
  const onDown = (e) => { swipe.current = e.clientX; };
  const onUp = (e) => {
    if (swipe.current == null) return;
    const dx = e.clientX - swipe.current;
    swipe.current = null;
    if (Math.abs(dx) > 70) go(dx < 0 ? 1 : -1);   // RTL: کشیدن به چپ = بعدی
  };

  const hoverSelect = (i) => { clearTimeout(hoverT.current); hoverT.current = setTimeout(() => setIdx(i), 220); };
  const hoverCancel = () => clearTimeout(hoverT.current);

  return (
    <div className="hs-cinema">
      <div
        ref={stage} className={`hs-stage ${manual ? "manual" : ""}`} tabIndex={0} onKeyDown={onKey}
        onMouseMove={onMove} onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)}
        onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
        onPointerDown={onDown} onPointerUp={onUp} aria-roledescription="carousel" aria-label="فعالیت‌ها"
      >
        {items.map((p, i) => {
          const topId = p.top_work_id;
          const dist = Math.abs(i - idx), near = dist <= 1 || dist === n - 1;
          return (
            <article key={p.id} className={`hs-slide ${i === idx ? "is-active" : ""}`} aria-hidden={i !== idx}>
              <Cover project={p} cover={coverOf(p)} play={i === idx} eager={false} showImg={near} delay={heroDelayMs()} w={1280} />
              <div className="hs-scrim" />
              <div className="hs-spot" />
              <div className="hs-content">
                <span className="hs-eyebrow hs-r" style={{ "--d": 0 }}>{rangeText(p)}</span>
                <h2 className="hs-title hs-r" style={{ "--d": 1 }}>{p.title}</h2>
                {p.sub && <p className="hs-sub hs-r" style={{ "--d": 2 }}>{p.sub}</p>}
                <div className="hs-chips hs-r" style={{ "--d": 3 }}>
                  <span>{toFa(p.worksCount || 0)} اثر</span>
                  {p.teaser_url && <span><Film size={13} /> تیزر</span>}
                </div>
                <div className="hs-cta hs-r" style={{ "--d": 4 }}>
                  <button className="btn gold hs-main" tabIndex={i === idx ? 0 : -1} onClick={() => onOpen(p.id)}>
                    <Play size={18} fill="currentColor" /> ورود به فعالیت
                  </button>
                  {topId && (
                    <button className="btn light" tabIndex={i === idx ? 0 : -1} onClick={() => onOpenWork(p.id, topId)}>
                      پربازدیدترین اثر
                    </button>
                  )}
                </div>
              </div>
              {i === idx && <EditBtn p={p} canEdit={canEdit} onEdit={onEdit} />}
            </article>
          );
        })}

        <div className="hs-big" aria-hidden="true">{two(idx + 1)}</div>

        {n > 1 && (
          <div className="hs-hud">
            <div className="hs-bars" role="tablist" aria-label="انتخاب فعالیت">
              {items.map((p, i) => (
                <button key={p.id} role="tab" aria-selected={i === idx} aria-label={p.title}
                  className={`hs-bar ${i === idx ? "on" : ""} ${i < idx ? "done" : ""}`} onClick={() => setIdx(i)}>
                  <i key={i === idx ? `a${idx}` : `b${i}`} onAnimationEnd={i === idx ? () => go(1) : undefined}
                    style={{ animationPlayState: paused ? "paused" : "running" }} />
                </button>
              ))}
            </div>
            <div className="hs-arrows">
              <button className="hs-ic" onClick={() => go(-1)} aria-label="قبلی"><ChevronRight size={20} /></button>
              <button className="hs-ic" onClick={() => setManual((m) => !m)} aria-label={manual ? "پخش خودکار" : "توقف پخش خودکار"} aria-pressed={!manual}>
                {manual ? <Play size={16} fill="currentColor" /> : <Pause size={16} fill="currentColor" />}
              </button>
              <button className="hs-ic" onClick={() => go(1)} aria-label="بعدی"><ChevronLeft size={20} /></button>
            </div>
          </div>
        )}
      </div>

      {n > 1 && (
        <div className="hs-strip" role="list" ref={strip}>
          {items.map((p, i) => (
            <FilmThumb key={p.id} p={p} i={i} active={i === idx} cover={coverOf(p)}
              onPick={() => setIdx(i)} onIntent={() => hoverSelect(i)} onCancel={hoverCancel} />
          ))}
        </div>
      )}
    </div>
  );
}

function FilmThumb({ p, i, active, cover, onPick, onIntent, onCancel }) {
  const [hover, setHover] = useState(false);
  return (
    <button role="listitem" className={`hs-thumb ${active ? "on" : ""}`}
      onClick={onPick} onMouseEnter={() => { setHover(true); onIntent(); }} onMouseLeave={() => { setHover(false); onCancel(); }}>
      <span className="hs-thumb-frame">
        <Cover project={p} cover={cover} play={hover && !active} />
        <span className="hs-thumb-n">{two(i + 1)}</span>
      </span>
      <span className="hs-thumb-t">{p.title}</span>
      <span className="hs-thumb-d">{rangeText(p)}</span>
    </button>
  );
}

/* =============================== ۲) ردیف‌ها =============================== */
function LeadCard({ p, cover, onOpen }) {
  const [hover, setHover] = useState(false);
  return (
    <div className={`hs-lead ${p.teaser_url ? "has-vid" : ""}`} role="button" tabIndex={0}
      onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)} onBlur={() => setHover(false)}
      onClick={() => onOpen(p.id)}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(p.id); } }}
      aria-label={`ورود به ${p.title}`}>
      <Cover project={p} cover={cover} play={hover} />
      <span className="hs-lead-badge"><Film size={12} /> {p.teaser_url ? "پیش‌نمایش تیزر" : "فعالیت"}</span>
      <span className="hs-lead-shade" />
      <span className="vod-play"><Play size={22} fill="currentColor" /></span>
      <span className="hs-lead-meta"><b>{p.title}</b><em>{rangeText(p)}</em></span>
    </div>
  );
}

function ActRow({ p, i, coverOf, typeLabel, onOpen, onOpenWork, canEdit, onEdit }) {
  const ref = useRef(null);
  const [seen, setSeen] = useState(false);
  const [works, setWorks] = useState(null);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") { setSeen(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setSeen(true); io.disconnect(); } }, { rootMargin: "300px 0px", threshold: 0.05 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  useEffect(() => {
    if (!seen || works) return;
    let off = false;
    // فقط ۱۴ اثر برتر همین فعالیت (نه همهٔ آثار)؛ سرور هم فقط همین‌ها را می‌سازد
    api.works({ projectId: p.id, sort: "views", limit: 14 })
      .then((w) => { if (!off) setWorks(Array.isArray(w) ? w : []); })
      .catch(() => { if (!off) setWorks([]); });
    return () => { off = true; };
  }, [seen, p.id]);
  return (
    <div ref={ref} className={`hs-actrow ${seen ? "seen" : ""}`} style={{ "--i": Math.min(i, 5) }}>
      <VodRow
        title={p.title} hint={`${rangeText(p)} · ${toFa(p.worksCount || 0)} اثر`}
        items={works || []} typeLabel={typeLabel} onOpen={(w) => onOpenWork(p.id, w.id)}
        lead={<LeadCard p={p} cover={coverOf(p)} onOpen={onOpen} />}
        seeAllLabel="ورود به فعالیت" onSeeAll={() => onOpen(p.id)}
      />
      {canEdit(p) && <EditBtn p={p} canEdit={canEdit} onEdit={onEdit} />}
    </div>
  );
}

function RowsMode({ items, ...rest }) {
  return <div className="hs-rows">{items.map((p, i) => <ActRow key={p.id} p={p} i={i} {...rest} />)}</div>;
}

/* =============================== ۳) پرده‌ها =============================== */
function Panels({ items, coverOf, onOpen, canEdit, onEdit }) {
  const [active, setActive] = useState(0);
  useEffect(() => { if (active >= items.length) setActive(0); }, [items.length]);
  return (
    <div className="hs-panels" role="list" style={{ "--n": items.length }}>
      {items.map((p, i) => {
        const on = i === active;
        return (
          <article key={p.id} role="listitem" className={`hs-panel ${on ? "on" : ""}`}
            onMouseEnter={() => setActive(i)} onFocus={() => setActive(i)}
            onClick={() => (on ? onOpen(p.id) : setActive(i))}
            tabIndex={0} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onOpen(p.id); } }}
            aria-label={p.title} aria-expanded={on}>
            <Cover project={p} cover={coverOf(p)} play={on} w={1280} />
            <span className="hs-panel-shade" />
            <span className="hs-panel-n">{two(i + 1)}</span>
            <span className="hs-panel-v">{p.title}</span>
            <div className="hs-panel-body">
              <span className="hs-eyebrow">{rangeText(p)}</span>
              <h2 className="hs-panel-title">{p.title}</h2>
              {p.sub && <p className="hs-sub">{p.sub}</p>}
              <div className="hs-chips"><span>{toFa(p.worksCount || 0)} اثر</span>{p.teaser_url && <span><Film size={13} /> تیزر</span>}</div>
              <span className="hs-panel-go">ورود به فعالیت <ArrowLeft size={16} /></span>
            </div>
            {on && <EditBtn p={p} canEdit={canEdit} onEdit={onEdit} />}
          </article>
        );
      })}
    </div>
  );
}

/* =============================== ریشه =============================== */
export default function HomeStage({ view, items, onOpen, onOpenWork, canEdit = () => false, onEdit = () => {}, autoplay = true }) {
  const coverOf = (p) => p.cover_url || null;      // کاور از خود فهرست فعالیت‌ها می‌آید؛ دیگر آثار را نمی‌گیریم
  const [types, setTypes] = useState([]);
  useEffect(() => { api.types().then((t) => Array.isArray(t) && setTypes(t)).catch(() => {}); }, []);
  const typeLabel = (k) =>
    String(k || "").split(",").filter(Boolean).map((x) => types.find((t) => t.key === x)?.label || x).join("، ") || "—";

  if (!items.length) {
    return (
      <div className="hs-empty">
        <EmptyState icon={Film} title="فعالیتی برای نمایش نیست"
          text="در این بازه یا تمپلیت فعالیتی ثبت نشده. بازه را عوض کن یا از منوی کناری یک فعالیت جدید تعریف کن." />
      </div>
    );
  }
  const common = { items, coverOf, onOpen, onOpenWork, canEdit, onEdit };
  return (
    <section className="hs" data-view={view} aria-label="فعالیت‌ها">
      {view === "rows" ? <RowsMode {...common} typeLabel={typeLabel} />
        : view === "panels" ? <Panels {...common} />
        : <Cinema {...common} autoplay={autoplay} />}
    </section>
  );
}

/* انتخاب نما به‌صورت لیست کشویی (داخل هدر و پنل تنظیمات) */
export function StageSwitcher({ view, onPick }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const cur = STAGE_MODES.find((m) => m.key === view) || STAGE_MODES[0];
  const CurIcon = cur.icon;

  useEffect(() => {
    if (!open) return;
    const away = (e) => { if (box.current && !box.current.contains(e.target)) setOpen(false); };
    const key = (e) => {
      if (e.key === "Escape") { setOpen(false); box.current?.querySelector(".hs-dd-btn")?.focus(); }
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const items = [...box.current.querySelectorAll(".hs-dd-menu button")];
        const at = items.indexOf(document.activeElement);
        items[(at + (e.key === "ArrowDown" ? 1 : -1) + items.length) % items.length]?.focus();
      }
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    box.current?.querySelector(".hs-dd-menu button.on")?.focus();
    return () => { document.removeEventListener("pointerdown", away); document.removeEventListener("keydown", key); };
  }, [open]);

  return (
    <div className="hs-dd" ref={box}>
      <button className="hs-dd-btn" aria-haspopup="listbox" aria-expanded={open} aria-label={`نوع نمایش: ${cur.label}`}
        onClick={() => setOpen((o) => !o)}>
        <CurIcon size={16} /> <span>{cur.label}</span> <ChevronDown size={15} className={`hs-dd-chev ${open ? "open" : ""}`} />
      </button>
      {open && (
        <ul className="hs-dd-menu" role="listbox" aria-label="نوع نمایش">
          {STAGE_MODES.map(({ key, label, hint, icon: Icon }) => (
            <li key={key} role="option" aria-selected={view === key}>
              <button className={view === key ? "on" : ""} onClick={() => { onPick(key); setOpen(false); }}>
                <span className="hs-dd-ic"><Icon size={18} /></span>
                <span className="hs-dd-tx"><b>{label}</b><em>{hint}</em></span>
                {view === key && <Check size={16} className="hs-dd-ck" />}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
