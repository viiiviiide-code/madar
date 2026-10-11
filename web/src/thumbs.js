// بندانگشتی‌های سبک سمت سرور (ffmpeg): آدرس ثابت و قابل‌کش زیر /uploads/_thumbs/.
// اول همین آدرس ثابت (یک GET ارزان که nginx جواب می‌دهد) امتحان می‌شود؛ فقط اگر نبود از سرور ساختش را می‌خواهیم.
import { api } from "./api";

const RASTER = /\.(jpe?g|png|webp|gif|bmp)$/i;
const VIDEO = /\.(mp4|webm|mov|mkv|m4v|avi)$/i;

/* آدرس بندانگشتی یک آپلود، یا null اگر این نوع فایل/آدرس بندانگشتی ندارد (مثلاً لینک خارجی یا svg) */
export function thumbOf(url, w = 480) {
  const m = /^\/uploads\/([A-Za-z0-9][A-Za-z0-9._-]*)$/.exec(String(url || ""));
  if (!m) return null;
  const f = m[1];
  const video = VIDEO.test(f);
  if (!video && !RASTER.test(f)) return null;
  return `/uploads/_thumbs/${f}.w${video ? 480 : (w >= 1000 ? 1280 : 480)}.jpg`;
}

let unavailable = false;          // اگر سرور ffmpeg ندارد، دیگر تلاش نمی‌کنیم
const inflight = new Map();
const waiting = [];
let active = 0;
function pump() {
  while (active < 3 && waiting.length) {
    const j = waiting.shift();
    active++;
    api.thumb(j.url, j.w)
      .then((r) => j.resolve((r && r.url) || null))
      .catch((e) => { if (/ffmpeg|501/.test(String((e && e.message) || e))) unavailable = true; j.resolve(null); })
      .finally(() => { active--; pump(); });
  }
}
/* ساخت بندانگشتی در سرور؛ حداکثر ۳ درخواست هم‌زمان. null یعنی نشد. */
export function requestThumb(url, w = 480) {
  if (unavailable) return Promise.resolve(null);
  const key = `${url}|${w}`;
  if (inflight.has(key)) return inflight.get(key);
  const p = new Promise((resolve) => { waiting.push({ url, w, resolve }); pump(); }).finally(() => inflight.delete(key));
  inflight.set(key, p);
  return p;
}
