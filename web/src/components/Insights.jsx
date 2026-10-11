import React, { useEffect, useRef, useState } from "react";
import { Eye, Heart, MessageCircle, Trophy } from "lucide-react";
import { toFa } from "../jalali";

// داشبورد آمار یک اثر (فقط‌خواندنی، برای حالت نمایش):
// سه عدد اصلی، نرخ تعامل، نوار سهم هر شبکه و جزئیات هر شبکه.

const nf = (n) => toFa((Math.round(Number(n) || 0)).toLocaleString("en-US"));
const pct = (x) => `${toFa(x.toFixed(1).replace(".", "٫"))}٪`;

// شمارش تدریجی تا مقدار نهایی؛ با prefers-reduced-motion مستقیم مقدار نهایی را نشان می‌دهد
function useCountUp(target, ms = 1000) {
  const [v, setV] = useState(0);
  const raf = useRef(0);
  useEffect(() => {
    const goal = Number(target) || 0;
    const reduce = typeof matchMedia !== "undefined" && matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || goal === 0) { setV(goal); return; }
    const t0 = performance.now();
    const tick = (t) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(goal * (1 - Math.pow(1 - k, 3)));          // easeOutCubic
      if (k < 1) raf.current = requestAnimationFrame(tick);
    };
    raf.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf.current);
  }, [target, ms]);
  return v;
}

function Metric({ icon: Icon, label, value, main }) {
  const v = useCountUp(value);
  return (
    <div className={`ins-metric ${main ? "main" : ""}`}>
      <span className="ins-k"><Icon size={14} /> {label}</span>
      <b className="ins-v" aria-label={`${label}: ${nf(value)}`}>{nf(v)}</b>
    </div>
  );
}

export default function WorkInsights({ work }) {
  const list = [...(work.platformViews || [])].sort((a, b) => (Number(b.views) || 0) - (Number(a.views) || 0));
  const tv = Number(work.totalViews) || 0;
  const tl = Number(work.totalLikes) || 0;
  const tc = Number(work.totalComments) || 0;
  const rate = tv > 0 ? ((tl + tc) / tv) * 100 : 0;
  const share = (n) => (tv > 0 ? ((Number(n) || 0) / tv) * 100 : 0);

  return (
    <div className="ins">
      <div className="ins-metrics">
        <Metric icon={Eye} label="بازدید کل" value={tv} main />
        <Metric icon={Heart} label="لایک" value={tl} />
        <Metric icon={MessageCircle} label="کامنت" value={tc} />
      </div>

      {tv > 0 && tl + tc > 0 && (
        <p className="ins-rate">
          <span>نرخ تعامل</span> <b>{pct(rate)}</b>
          <em>لایک و کامنت نسبت به بازدید</em>
        </p>
      )}

      {list.length === 0 ? (
        <p className="muted-sm ins-empty">آمار شبکه‌های اجتماعی هنوز ثبت نشده است.</p>
      ) : (
        <>
          {tv > 0 && list.length > 1 && (
            <div className="ins-share" role="img"
              aria-label={`سهم بازدید: ${list.map((p) => `${p.label} ${pct(share(p.views))}`).join("، ")}`}>
              {list.map((p, i) => (
                <span key={p.platform_id} className="ins-seg" style={{ flexGrow: Math.max(Number(p.views) || 0, 1), "--seg": `var(--seg-${i % 5})` }} />
              ))}
            </div>
          )}
          <ul className="ins-list">
            {list.map((p, i) => (
              <li key={p.platform_id} className="ins-row" style={{ "--seg": `var(--seg-${i % 5})` }}>
                <span className="plat-logo-wrap sm">
                  {p.logo_url
                    ? <img className="plat-logo" src={p.logo_url} alt="" />
                    : <span className="plat-logo ph">{p.label?.[0] || "?"}</span>}
                </span>
                <div className="ins-name">
                  <span className="ins-plat">
                    <i className="ins-dot" aria-hidden="true" />{p.label}
                    {i === 0 && list.length > 1 && <span className="ins-top"><Trophy size={11} /> بیشترین بازدید</span>}
                  </span>
                  {tv > 0 && (
                    <span className="ins-bar" aria-hidden="true"><span style={{ width: `${Math.max(share(p.views), 1.5)}%` }} /></span>
                  )}
                </div>
                <div className="ins-nums">
                  <b title="بازدید"><Eye size={13} /> {nf(p.views)}</b>
                  <span title="لایک"><Heart size={12} /> {nf(p.likes)}</span>
                  <span title="کامنت"><MessageCircle size={12} /> {nf(p.comments)}</span>
                </div>
                {tv > 0 && <span className="ins-share-n">{pct(share(p.views))}</span>}
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
