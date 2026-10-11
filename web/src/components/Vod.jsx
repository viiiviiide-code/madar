import React, { useEffect, useMemo, useRef, useState } from "react";
import { ChevronRight, ChevronLeft, ChevronDown, Play, Eye, Star, Search, X, SearchX, FolderOpen, ArrowRight, SlidersHorizontal, Check } from "lucide-react";
import { toFa } from "../jalali";
import { LazyMedia } from "./ProjectPage.jsx";
import { useChunked } from "./Lazy.jsx";
import { EmptyState } from "./States.jsx";

// نمای «پلتفرم ویدیو» برای حالت نمایش: ردیف‌های افقی از آثار، کارت‌های پوستری،
// و یک ردیف رتبه‌بندی‌شده. وقتی جستجو یا فیلتر فعال است، به‌جای ردیف‌ها شبکهٔ نتایج می‌آید.

function fmt(n) {
  return toFa((Number(n) || 0).toLocaleString("en-US"));
}

export function VodCard({ work, typeLabel, onOpen, rank, wide }) {
  const open = () => onOpen(work);
  return (
    <div
      data-work-id={work.id}
      className={`vod-card ${rank ? "ranked" : ""} ${wide ? "wide" : ""}`}
      role="button" tabIndex={0} onClick={open}
      onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); open(); } }}
      aria-label={work.title}
    >
      {rank > 0 && <span className="vod-rank" aria-hidden="true">{toFa(rank)}</span>}
      <div className="vod-poster">
        <div className="vod-thumb">
          <LazyMedia work={work} fill />
          <span className="vod-type">{typeLabel(work.type)}</span>
          {!!work.featured && <span className="vod-star" title="اثر شاخص"><Star size={13} fill="currentColor" /></span>}
          <span className="vod-shade" />
          <span className="vod-play"><Play size={20} fill="currentColor" /></span>
        </div>
        <div className="vod-info">
          <h3>{work.title}</h3>
          <p>
            <span className="vod-views"><Eye size={12} /> {fmt(work.totalViews)}</span>
            {(work.axis || work.campaign) && <span className="vod-sub">{[work.axis, work.campaign].filter(Boolean).join(" · ")}</span>}
          </p>
        </div>
      </div>
    </div>
  );
}

export function VodRow({ title, hint, items, typeLabel, onOpen, ranked, wide, onSeeAll, total, lead, seeAllLabel, max = 24 }) {
  const scroller = useRef(null);
  const [edge, setEdge] = useState({ prev: false, next: false });

  const measure = () => {
    const el = scroller.current;
    if (!el) return;
    // در RTL، scrollLeft منفی است؛ قدر مطلق فاصله از ابتدای ردیف (سمت راست) را می‌دهد
    const pos = Math.abs(el.scrollLeft);
    const max = el.scrollWidth - el.clientWidth;
    setEdge({ prev: pos > 4, next: pos < max - 4 });
  };
  useEffect(() => {
    measure();
    const el = scroller.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [items.length, !!lead]);

  const page = (dir) => {
    const el = scroller.current;
    if (!el) return;
    const rtl = getComputedStyle(el).direction === "rtl";
    const step = Math.max(el.clientWidth * 0.85, 240) * dir * (rtl ? -1 : 1);
    el.scrollBy({ left: step, behavior: "smooth" });
  };

  // ردیف فقط max کارت اول را می‌سازد؛ بقیه پشت کارت «نمایش همه» می‌ماند (صدها کارت یک‌جا نمی‌سازیم)
  const visible = max && items.length > max ? items.slice(0, max) : items;
  const hidden = items.length - visible.length;
  if (!items.length && !lead) return null;
  return (
    <section className="vod-row" aria-label={title}>
      <header className="vod-row-head">
        <h2>{title}</h2>
        {hint && <span className="vod-row-hint">{hint}</span>}
        {onSeeAll && (
          <button className="vod-seeall" onClick={onSeeAll} aria-label={`نمایش همهٔ ${title}`}>
            {seeAllLabel
              ? <>{seeAllLabel}</>
              : <>نمایش همه <span className="vod-seeall-n">{toFa(total ?? items.length)}</span></>} <ChevronLeft size={15} />
          </button>
        )}
      </header>
      <div className="vod-row-body">
        {edge.prev && (
          <button className="vod-arrow prev" onClick={() => page(-1)} aria-label="قبلی"><ChevronRight size={22} /></button>
        )}
        <div className="vod-scroller" ref={scroller} onScroll={measure}>
          {lead}
          {visible.map((w, i) => (
            <VodCard key={w.id} work={w} typeLabel={typeLabel} onOpen={onOpen} rank={ranked ? i + 1 : 0} wide={wide} />
          ))}
          {hidden > 0 && onSeeAll && (
            <button className="vod-more" onClick={onSeeAll}>
              <b>{toFa(hidden)}+</b><span>اثر دیگر</span><i>نمایش همه <ChevronLeft size={16} /></i>
            </button>
          )}
        </div>
        {edge.next && (
          <button className="vod-arrow next" onClick={() => page(1)} aria-label="بعدی"><ChevronLeft size={22} /></button>
        )}
      </div>
    </section>
  );
}

/* فیلتر نوع اثر + «فقط شاخص» در یک لیست کشویی، به‌جای ردیف دکمه‌های کنار هم */
function FilterDropdown({ types, type, setType, featuredOnly, setFeaturedOnly }) {
  const [open, setOpen] = useState(false);
  const box = useRef(null);
  const curType = type === "all" ? "همه" : (types.find((t) => t.key === type)?.label || type);
  const label = featuredOnly ? `${curType} · شاخص` : curType;
  const active = type !== "all" || featuredOnly;

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

  const options = [{ key: "all", label: "همه" }, ...types.map((t) => ({ key: t.key, label: t.label }))];
  return (
    <div className="hs-dd vod-dd" ref={box}>
      <button className={`hs-dd-btn ${active ? "is-active" : ""}`} aria-haspopup="listbox" aria-expanded={open}
        aria-label={`فیلتر آثار: ${label}`} onClick={() => setOpen((o) => !o)}>
        <SlidersHorizontal size={15} /> <span className="vod-dd-k">نوع اثر</span> <b>{label}</b>
        <ChevronDown size={15} className={`hs-dd-chev ${open ? "open" : ""}`} />
      </button>
      {open && (
        <ul className="hs-dd-menu" role="listbox" aria-label="فیلتر نوع اثر">
          {options.map((o) => (
            <li key={o.key} role="option" aria-selected={type === o.key}>
              <button className={type === o.key ? "on" : ""} onClick={() => { setType(o.key); setOpen(false); }}>
                <span className="hs-dd-tx"><b>{o.label}</b></span>
                {type === o.key && <Check size={16} className="hs-dd-ck" />}
              </button>
            </li>
          ))}
          <li role="separator" className="vod-dd-sep" />
          <li role="option" aria-selected={featuredOnly}>
            <button className={featuredOnly ? "on" : ""} onClick={() => setFeaturedOnly((v) => !v)}>
              <span className="hs-dd-ic"><Star size={16} fill={featuredOnly ? "currentColor" : "none"} /></span>
              <span className="hs-dd-tx"><b>فقط آثار شاخص</b></span>
              {featuredOnly && <Check size={16} className="hs-dd-ck" />}
            </button>
          </li>
        </ul>
      )}
    </div>
  );
}

export function VodBrowser({
  works, types, typeLabel, onOpen,
  q, setQ, type, setType, featuredOnly, setFeaturedOnly,
}) {
  const hasFilters = !!q || type !== "all" || featuredOnly;
  const [seeAll, setSeeAll] = useState(null);       // کلید ردیفی که در حالت «نمایش همه» است
  const [seeAllSort, setSeeAllSort] = useState("new");

  const rows = useMemo(() => {
    const byDate = (a, b) => String(b.event_date || "").localeCompare(String(a.event_date || "")) || b.id - a.id;
    const featured = works.filter((w) => w.featured).sort(byDate);
    const top = [...works].sort((a, b) => (b.totalViews || 0) - (a.totalViews || 0)).filter((w) => (w.totalViews || 0) > 0);
    const all = [...works].sort(byDate);
    const perType = types
      .map((t) => ({ t, items: works.filter((w) => String(w.type || "").split(",").includes(t.key)).sort(byDate) }))
      .filter((r) => r.items.length >= 2);
    const n = works.length;
    return { featured, top, all, perType, mode: n <= 4 ? "few" : n <= 8 ? "some" : "many" };
  }, [works, types]);

  // تعریف ردیف‌ها یک‌جا؛ هم برای نمایش ردیفی و هم برای صفحهٔ «نمایش همه» استفاده می‌شود.
  // limit فقط در حالت ردیفی اعمال می‌شود (مثلاً ۱۰ اثر برتر)؛ صفحهٔ «نمایش همه» همه را نشان می‌دهد.
  const defs = useMemo(() => {
    const list = [];
    if (rows.featured.length && rows.featured.length < works.length) {
      list.push({ key: "featured", title: "آثار شاخص", hint: "انتخاب مجموعه", items: rows.featured, wide: true });
    }
    const topOk = rows.top.length >= 3;
    if (topOk || rows.mode === "few") {
      list.push({
        key: "top", title: topOk || rows.mode !== "few" ? "پربازدیدترین‌ها" : "آثار این فعالیت",
        hint: topOk ? "رتبه‌بندی بر اساس بازدید" : undefined,
        items: topOk ? rows.top : rows.all, ranked: topOk, limit: topOk ? 10 : 0,
      });
    }
    if (rows.mode === "some") list.push({ key: "all", title: "همهٔ آثار", items: rows.all });
    if (rows.mode === "many") {
      list.push({ key: "latest", title: "تازه‌ترین‌ها", items: rows.all, limit: 14 });
      rows.perType.forEach(({ t, items }) =>
        list.push({ key: `type:${t.key}`, title: t.label, hint: `${toFa(items.length)} اثر`, items }));
    }
    return list;
  }, [rows, works.length]);

  // نوع‌های موجود را وقتی فیلتری فعال نیست به‌خاطر می‌سپاریم؛ وگرنه با فعال‌بودن یک فیلتر، گزینه‌های دیگر ناپدید می‌شوند
  const [seenTypes, setSeenTypes] = useState(null);
  useEffect(() => {
    if (!hasFilters) setSeenTypes(new Set(works.flatMap((w) => String(w.type || "").split(",").filter(Boolean))));
  }, [works, hasFilters]);
  const usedTypes = useMemo(
    () => (seenTypes ? types.filter((t) => seenTypes.has(t.key) || type === t.key) : types),
    [types, seenTypes, type]
  );

  const goTop = () => document.getElementById("vod-rows")?.scrollIntoView({ block: "start" });
  const openAll = (key) => { setSeeAll(key); setSeeAllSort("new"); requestAnimationFrame(goTop); };
  const closeAll = () => { setSeeAll(null); requestAnimationFrame(goTop); };

  // فیلتر یا جستجو که فعال شد، از حالت «نمایش همه» خارج می‌شویم
  useEffect(() => { if (hasFilters) setSeeAll(null); }, [hasFilters]);
  useEffect(() => {
    if (!seeAll) return;
    const onKey = (e) => { if (e.key === "Escape") closeAll(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [seeAll]);

  const current = seeAll ? defs.find((d) => d.key === seeAll) : null;
  const currentItems = useMemo(() => {
    if (!current) return [];
    const d = (a) => String(a.event_date || "");
    const copy = [...current.items];
    if (seeAllSort === "views") return copy.sort((a, b) => (b.totalViews || 0) - (a.totalViews || 0));
    if (seeAllSort === "old") return copy.sort((a, b) => d(a).localeCompare(d(b)) || a.id - b.id);
    return copy.sort((a, b) => d(b).localeCompare(d(a)) || b.id - a.id);
  }, [current, seeAllSort]);
  // شبکه‌های «نمایش همه» و «نتایج» تکه‌تکه رندر می‌شوند
  const seeAllChunk = useChunked(currentItems, 36, `${seeAll}|${seeAllSort}`);
  const resultsChunk = useChunked(works, 36, `${q}|${type}|${featuredOnly}`);

  return (
    <div className="vod-browser" id="vod-rows">
      {!current && (
        <div className="vod-filters">
          <div className="vod-search">
            <Search size={16} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="جستجو در آثار…" aria-label="جستجو در آثار" />
            {q && <button className="x-btn" onClick={() => setQ("")} aria-label="پاک‌کردن جستجو"><X size={14} /></button>}
          </div>
          <FilterDropdown types={usedTypes} type={type} setType={setType}
            featuredOnly={featuredOnly} setFeaturedOnly={setFeaturedOnly} />
          {hasFilters && (
            <button className="vod-clear" onClick={() => { setQ(""); setType("all"); setFeaturedOnly(false); }}>
              <X size={13} /> پاک‌کردن فیلترها
            </button>
          )}
        </div>
      )}

      {current ? (
        <section className="vod-seeall-page" aria-label={current.title}>
          <button className="vod-backrow" onClick={closeAll}><ArrowRight size={16} /> بازگشت به همهٔ ردیف‌ها</button>
          <header className="vod-seeall-head">
            <div>
              <h2>{current.title}</h2>
              <p>{toFa(currentItems.length)} اثر</p>
            </div>
            <div className="vod-pills" role="group" aria-label="مرتب‌سازی">
              {[["new", "جدیدترین"], ["views", "پربازدیدترین"], ["old", "قدیمی‌ترین"]].map(([k, l]) => (
                <button key={k} className={`vod-pill ${seeAllSort === k ? "on" : ""}`} aria-pressed={seeAllSort === k} onClick={() => setSeeAllSort(k)}>{l}</button>
              ))}
            </div>
          </header>
          <div className={`vod-grid ${current.wide ? "wide" : ""}`}>
            {seeAllChunk.shown.map((w) => <VodCard key={w.id} work={w} typeLabel={typeLabel} onOpen={onOpen} wide={current.wide} />)}
            {seeAllChunk.sentinel}
          </div>
        </section>
      ) : works.length === 0 ? (
        hasFilters
          ? <EmptyState icon={SearchX} title="اثری پیدا نشد" text="جستجو یا فیلتر را تغییر بده تا آثار بیشتری ببینی."
              action={<button className="btn ghost sm" onClick={() => { setQ(""); setType("all"); setFeaturedOnly(false); }}>پاک‌کردن فیلترها</button>} />
          : <EmptyState icon={FolderOpen} title="هنوز اثری منتشر نشده" text="به‌محض ثبت اثر، اینجا مثل یک کتابخانهٔ ویدیو نمایش داده می‌شود." />
      ) : hasFilters ? (
        <section className="vod-results" aria-label="نتایج">
          <header className="vod-row-head">
            <h2>نتایج</h2>
            <span className="vod-row-hint">{toFa(works.length)} اثر</span>
          </header>
          <div className="vod-grid">
            {resultsChunk.shown.map((w) => <VodCard key={w.id} work={w} typeLabel={typeLabel} onOpen={onOpen} />)}
            {resultsChunk.sentinel}
          </div>
        </section>
      ) : (
        defs.map((d) => {
          const shown = d.limit ? d.items.slice(0, d.limit) : d.items;
          return (
            <VodRow key={d.key} title={d.title} hint={d.hint} items={shown} total={d.items.length}
              typeLabel={typeLabel} onOpen={onOpen} ranked={d.ranked} wide={d.wide}
              onSeeAll={d.items.length >= 3 ? () => openAll(d.key) : undefined} />
          );
        })
      )}
    </div>
  );
}
