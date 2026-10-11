// بندانگشتی سبک (JPEG) برای عکس‌ها و ویدئوهای آپلودی.
// چرا: کارت‌ها قبلاً خودِ عکس ۳۰۰ کیلوبایتی یا بخشی از ویدئوی ده‌ها مگابایتی را دانلود می‌کردند.
// بندانگشتی ۴۸۰ پیکسلی حدود ۲۰ کیلوبایت است و برای ویدئو اصلاً نیازی به باز کردن فایل نیست.
//
// ایمنی:
//  - فقط نام ساده‌ی یک فایل داخل /uploads/ پذیرفته می‌شود (بدون «..»، بدون زیرپوشه، فقط پسوندهای مجاز)
//  - فایل‌های اصلی هرگز نوشته یا تغییر داده نمی‌شوند؛ خروجی فقط در uploads/_thumbs/ ساخته می‌شود
//  - حداکثر THUMB_CONCURRENCY (پیش‌فرض ۲) پردازش هم‌زمان، با اولویت پایین (nice) تا سرور را اشغال نکند
//  - اگر ffmpeg در دسترس نبود، همه‌چیز بی‌صدا غیرفعال می‌شود و برنامه مثل قبل کار می‌کند
const fs = require("fs");
const path = require("path");
const { execFile } = require("child_process");

// ترتیب پیدا کردن ffmpeg: متغیر FFMPEG_PATH ← <پروژه>/bin/ffmpeg ← بستهٔ اختیاری @ffmpeg-installer ← ffmpeg سیستم.
// پوشهٔ bin/ عمداً بیرون از npm و گیت است تا نصب ffmpeg هیچ وابستگی‌ای را در package.json یا lock عوض نکند.
function findFfmpeg() {
  if (process.env.FFMPEG_PATH) return process.env.FFMPEG_PATH;
  const local = path.join(__dirname, "..", "bin", process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg");
  if (fs.existsSync(local)) return local;
  try { return require("@ffmpeg-installer/ffmpeg").path; } catch (e) { return "ffmpeg"; }
}
let FFMPEG = findFfmpeg();
const REPROBE_MS = Number(process.env.THUMB_REPROBE_MS) || 30000;   // تا وقتی ffmpeg پیدا نشده، هر ۳۰ ثانیه دوباره می‌گردیم (بدون نیاز به ری‌استارت)

const WIDTHS = [480, 1280];
const IMG_EXT = new Set(["jpg", "jpeg", "png", "webp", "gif", "bmp"]);
const VID_EXT = new Set(["mp4", "webm", "mov", "mkv", "m4v", "avi"]);
const NAME_RE = /^[A-Za-z0-9][A-Za-z0-9._-]{0,200}$/;

const extOf = (name) => String(name).toLowerCase().split(".").pop();
const kindOf = (name) => (IMG_EXT.has(extOf(name)) ? "image" : VID_EXT.has(extOf(name)) ? "video" : null);

function create(UP) {
  const DIR = path.join(UP, "_thumbs");
  const MAX = Math.max(1, Number(process.env.THUMB_CONCURRENCY) || 2);
  const inflight = new Map();   // کلید → Promise (از ساخت تکراری جلوگیری می‌کند)
  const queue = [];
  let running = 0;
  let available = null;         // null = هنوز بررسی نشده
  let lastProbe = 0;

  const probe = () => new Promise((resolve) => {
    if (available === true) return resolve(true);
    if (available === false && Date.now() - lastProbe < REPROBE_MS) return resolve(false);
    lastProbe = Date.now();
    FFMPEG = findFfmpeg();      // شاید در این فاصله فایل در bin/ گذاشته شده باشد
    execFile(FFMPEG, ["-version"], { timeout: 8000 }, (err) => { available = !err; resolve(available); });
  });

  const outName = (file, w) => `${file}.w${w}.jpg`;
  const outUrl = (file, w) => `/uploads/_thumbs/${outName(file, w)}`;

  /* ورودی کاربر → { file, kind } یا null. «u» باید دقیقاً شکل /uploads/<نام-ساده> باشد. */
  function validate(u) {
    const m = /^\/uploads\/([^/?#]+)$/.exec(String(u || ""));
    if (!m) return null;
    const file = m[1];
    if (!NAME_RE.test(file) || file.includes("..")) return null;
    const kind = kindOf(file);
    if (!kind) return null;
    const abs = path.join(UP, file);
    if (path.dirname(abs) !== UP) return null;
    let st; try { st = fs.statSync(abs); } catch (e) { return null; }
    if (!st.isFile()) return null;
    return { file, abs, kind };
  }

  function runFfmpeg(args) {
    return new Promise((resolve, reject) => {
      const useNice = process.platform !== "win32";
      const cmd = useNice ? "nice" : FFMPEG;
      const argv = useNice ? ["-n", "15", FFMPEG, ...args] : args;
      execFile(cmd, argv, { timeout: 45000, windowsHide: true, maxBuffer: 4 * 1024 * 1024 }, (err, so, se) => {
        if (err) { err.stderr = String(se || "").slice(0, 300); return reject(err); }
        resolve();
      });
    });
  }

  async function build({ file, abs, kind }, w) {
    const out = path.join(DIR, outName(file, w));
    try { if (fs.statSync(out).size > 0) return out; } catch (e) { /* هنوز نیست */ }
    fs.mkdirSync(DIR, { recursive: true });
    const tmp = `${out}.tmp-${process.pid}-${Date.now()}.jpg`;
    const vf = `scale='min(${w},iw)':-2`;
    const attempt = async (ss) => {
      const a = ["-v", "error", "-y"];
      if (kind === "video") a.push("-ss", String(ss));
      a.push("-i", abs, "-frames:v", "1", "-vf", vf, "-q:v", kind === "video" ? "5" : "4", tmp);
      await runFfmpeg(a);
    };
    try {
      try { await attempt(1); } catch (e) { if (kind !== "video") throw e; }
      // ویدئوی کوتاه‌تر از ۱ ثانیه: فریم اول
      let ok = false; try { ok = fs.statSync(tmp).size > 0; } catch (e) { ok = false; }
      if (!ok && kind === "video") { await attempt(0); ok = fs.statSync(tmp).size > 0; }
      if (!ok) throw new Error("empty output");
      // عکس JPEG که خودش کوچک است و بندانگشتی کوچک‌تر از آن نشد: فایل جدا نمی‌سازیم؛ به خود اصل لینک می‌دهیم
      // (بدون فضای اضافه و بدون بایت اضافه، و آدرس یکنواخت می‌ماند)
      if (kind === "image" && /\.jpe?g$/i.test(file) && fs.statSync(tmp).size >= fs.statSync(abs).size * 0.85) {
        try { fs.linkSync(abs, out); } catch (e) { if (e.code !== "EEXIST") fs.copyFileSync(abs, out); }
        return out;
      }
      fs.renameSync(tmp, out);            // جابه‌جایی اتمی؛ خواننده هرگز فایل نیمه‌کاره نمی‌بیند
      return out;
    } finally {
      try { fs.unlinkSync(tmp); } catch (e) { /* قبلاً جابه‌جا شده یا ساخته نشده */ }
    }
  }

  function pump() {
    while (running < MAX && queue.length) {
      const job = queue.shift();
      running++;
      job.run().then(job.resolve, job.reject).finally(() => { running--; pump(); });
    }
  }
  const schedule = (run) => new Promise((resolve, reject) => { queue.push({ run, resolve, reject }); pump(); });

  /* بندانگشتی را می‌سازد (اگر نبود) و آدرسش را برمی‌گرداند. هرگز نمی‌اندازد؛ { error, status } برمی‌گرداند. */
  async function ensure(u, w = 480) {
    w = WIDTHS.includes(Number(w)) ? Number(w) : 480;
    const v = validate(u);
    if (!v) return { status: 404, error: "فایل پشتیبانی‌شده‌ای با این آدرس نیست" };
    if (v.kind === "video" && w > 480) w = 480;
    if (!(await probe())) return { status: 501, error: "ffmpeg روی سرور در دسترس نیست" };
    const key = `${v.file}|${w}`;
    if (!inflight.has(key)) {
      const p = schedule(() => build(v, w)).finally(() => inflight.delete(key));
      inflight.set(key, p);
    }
    try { await inflight.get(key); return { url: outUrl(v.file, w), w }; }
    catch (e) { return { status: 500, error: "ساخت بندانگشتی ناموفق بود" }; }
  }

  /* بعد از آپلود: در پس‌زمینه و بدون انتظار */
  function warm(u) {
    const v = validate(u);
    if (!v) return;
    ensure(u, 480).catch(() => {});
    if (v.kind === "image") ensure(u, 1280).catch(() => {});
  }

  return { ensure, warm, validate, probe, DIR, WIDTHS, kindOf, outName };
}

module.exports = { create, kindOf, IMG_EXT, VID_EXT, WIDTHS };
