import React, { useEffect, useRef, useState } from "react";
import { thumbOf, requestThumb } from "../thumbs";

// ابزارهای بارگذاری تنبل: چیزی که روی صفحه نیست، دانلود نمی‌شود.
// روی شبکه‌ای با تأخیر بالا، «تعداد درخواست‌ها» مهم‌تر از حجم هر کدام است.

/* فرزندان فقط وقتی به محدودهٔ دید نزدیک شدند ساخته می‌شوند (و بعد می‌مانند) */
export function LazyMount({ children, placeholder = null, rootMargin = "500px 0px", className, style }) {
  const ref = useRef(null);
  const [on, setOn] = useState(false);
  useEffect(() => {
    if (on) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setOn(true); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) { setOn(true); io.disconnect(); } }, { rootMargin });
    io.observe(el);
    return () => io.disconnect();
  }, [on, rootMargin]);
  return <div ref={ref} className={className} style={style}>{on ? children : placeholder}</div>;
}

/* فهرست‌های بلند را تکه‌تکه نشان می‌دهد: با رسیدن به انتها، تکهٔ بعدی اضافه می‌شود.
   resetKey عوض شود (فیلتر/جستجو/مرتب‌سازی)، دوباره از اولین تکه شروع می‌شود. */
export function useChunked(items, step = 36, resetKey = "") {
  const [count, setCount] = useState(step);
  const ref = useRef(null);
  useEffect(() => { setCount(step); }, [resetKey, step]);
  const has = count < items.length;
  useEffect(() => {
    if (!has) return;
    const el = ref.current;
    if (!el) return;
    if (typeof IntersectionObserver === "undefined") { setCount(items.length); return; }
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) setCount((c) => c + step); }, { rootMargin: "700px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [has, count, items.length, step]);
  return {
    shown: has ? items.slice(0, count) : items,
    has,
    count,
    showAll: () => setCount(items.length),
    sentinel: has ? <div ref={ref} className="chunk-sentinel" aria-hidden="true" /> : null,
  };
}

/* تأخیر شروع پخش تیزر هیرو: به کاور و رابط فرصت می‌دهیم اول برسند. تیزر همیشه پخش می‌شود
   (مثل قبل)؛ فقط روی اتصال کند دیرتر شروع می‌شود. */
export function heroDelayMs() {
  try {
    const c = navigator.connection;
    if (c && ["slow-2g", "2g", "3g"].includes(c.effectiveType)) return 4000;
  } catch { /* مرورگر بدون این API */ }
  return 1500;
}

/* تصویر با بندانگشتی سبک: اول آدرس ثابت بندانگشتی؛ اگر نبود یک‌بار از سرور می‌خواهد بسازد؛
   اگر نشد، به اصل برمی‌گردد (یا onFail را صدا می‌زند، مثلاً برای گرفتن فریم ویدئو در مرورگر). */
export function ThumbImg({ url, w = 480, className, alt = "", onFail, ...rest }) {
  const first = thumbOf(url, w);
  const [src, setSrc] = useState(first || url);
  const stage = useRef(0);   // 0 = بندانگشتی ثابت، 1 = بعد از درخواست ساخت، 2 = شکست
  useEffect(() => { setSrc(thumbOf(url, w) || url); stage.current = 0; }, [url, w]);
  const onError = async () => {
    if (!first || stage.current >= 2) { if (onFail) onFail(); else if (src !== url) setSrc(url); return; }
    if (stage.current === 0) {
      stage.current = 1;
      const made = await requestThumb(url, w);
      if (made) { setSrc(`${made}?r=1`); return; }       // پارامتر: اگر 404 قبلی در کش مرورگر مانده بود دوباره بخواند
    }
    stage.current = 2;
    if (onFail) onFail(); else setSrc(url);
  };
  return <img className={className} src={src} alt={alt} onError={onError} {...rest} />;
}
