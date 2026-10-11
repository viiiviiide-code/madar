#!/usr/bin/env node
// ساخت بندانگشتی برای همهٔ آپلودهای موجود (یک‌بار). فایل‌های اصلی فقط خوانده می‌شوند.
//   node scripts/make-thumbs.js            همه
//   node scripts/make-thumbs.js --limit 20 فقط ۲۰ تای اول (برای آزمایش)
//   node scripts/make-thumbs.js --dry      فقط شمارش، بدون ساخت
// آهسته و پشت‌سرهم کار می‌کند (THUMB_CONCURRENCY=1) تا سرور زنده را اذیت نکند. هر زمان می‌شود قطعش کرد؛ دفعهٔ بعد ادامه می‌دهد.
process.env.THUMB_CONCURRENCY = process.env.THUMB_CONCURRENCY || "1";
const fs = require("fs");
const path = require("path");
const thumbsLib = require("../thumbs");

const UP = path.join(__dirname, "..", "..", "uploads");
const args = process.argv.slice(2);
const limit = args.includes("--limit") ? Number(args[args.indexOf("--limit") + 1]) : Infinity;
const dry = args.includes("--dry");

(async () => {
  const t = thumbsLib.create(UP);
  if (!(await t.probe())) { console.error("ffmpeg در دسترس نیست؛ چیزی ساخته نشد."); process.exit(2); }
  const files = fs.readdirSync(UP).filter((f) => fs.statSync(path.join(UP, f)).isFile() && thumbsLib.kindOf(f));
  const jobs = [];
  for (const f of files) {
    const kind = thumbsLib.kindOf(f);
    for (const w of (kind === "image" ? thumbsLib.WIDTHS : [480])) {
      if (!fs.existsSync(path.join(t.DIR, t.outName(f, w)))) jobs.push([f, w]);
    }
  }
  console.log(`فایل‌های پشتیبانی‌شده: ${files.length} | بندانگشتی‌های باقی‌مانده: ${jobs.length}${dry ? " (dry run)" : ""}`);
  if (dry) return;
  let ok = 0, fail = 0, bytes = 0;
  const started = Date.now();
  for (const [f, w] of jobs.slice(0, limit)) {
    const r = await t.ensure("/uploads/" + f, w);
    if (r.url) { ok++; try { bytes += fs.statSync(path.join(UP, r.url.replace("/uploads/", ""))).size; } catch (e) {} } else { fail++; console.log("  ✗", f, w, r.error); }
    if ((ok + fail) % 25 === 0) console.log(`  ${ok + fail}/${Math.min(jobs.length, limit)}  ok=${ok} fail=${fail}  ${((Date.now() - started) / 1000).toFixed(0)}s`);
  }
  console.log(`تمام شد: ${ok} ساخته شد، ${fail} ناموفق، مجموع حجم بندانگشتی‌ها ${(bytes / 1048576).toFixed(1)} MB، ${((Date.now() - started) / 1000).toFixed(0)} ثانیه`);
})();
