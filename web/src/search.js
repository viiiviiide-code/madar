// جستجوی فارسی‌پسند — همان منطق server/textsearch.js (هر تغییری را در هر دو انجام بده).
export function normFa(s) {
  return String(s == null ? "" : s)
    .normalize("NFKC")
    .replace(/[ً-ٰٟـ]/g, "")
    .replace(/[يىئ]/g, "ی")
    .replace(/ك/g, "ک")
    .replace(/[ةۀ]/g, "ه")
    .replace(/[أإٱ]/g, "ا")
    .replace(/ؤ/g, "و")
    .replace(/‌|‏|‎/g, " ")
    .replace(/[٠-٩]/g, (c) => String(c.charCodeAt(0) - 0x660))
    .replace(/[۰-۹]/g, (c) => String(c.charCodeAt(0) - 0x6f0))
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export const searchTokens = (q) => normFa(q).split(" ").filter(Boolean);

const hits = (hay, t) => hay.includes(t) || (t.length >= 3 && hay.replace(/ /g, "").includes(t));

// فیلدهای جستجو، به همان ترتیبی که سرور می‌گردد
const FIELDS = [
  ["عنوان", (w) => w.title],
  ["شرح", (w) => w.descr],
  ["محور", (w) => w.axis],
  ["کمپین", (w) => w.campaign],
  ["کلیدواژه", (w) => (Array.isArray(w.keywords) ? w.keywords.join(" ") : "")],
];

/* آیا اثر با همهٔ کلمه‌های جستجو می‌خواند؟ (هر کلمه در یکی از فیلدها) */
export function workMatches(work, q) {
  const tokens = searchTokens(q);
  if (!tokens.length) return true;
  const hay = normFa(FIELDS.map(([, get]) => get(work) || "").join(" "));
  return tokens.every((t) => hits(hay, t));
}

/* «بر چه اساسی پیدا شد»: برچسب فیلدهایی (غیر از عنوان) که کلمه‌ای از جستجو در آن‌ها آمده؛
   وقتی همهٔ کلمه‌ها در عنوان هست چیزی برنمی‌گرداند (واضح است). */
export function matchHint(work, q) {
  const tokens = searchTokens(q);
  if (!tokens.length) return "";
  const title = normFa(work.title || "");
  if (tokens.every((t) => hits(title, t))) return "";
  const found = [];
  for (const [label, get] of FIELDS) {
    const h = normFa(get(work) || "");
    if (h && tokens.some((t) => hits(h, t))) found.push(label);
  }
  return found.length ? `در ${found.join(" و ")}` : "";
}
