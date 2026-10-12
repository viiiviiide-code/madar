// جستجوی فارسی‌پسند: یکسان‌سازی حروف (ي/ی، ك/ک، ة/ه، همزه‌ها)، اعراب و کشیده، نیم‌فاصله، ارقام فارسی/عربی/لاتین و حروف کوچک/بزرگ.
// نسخهٔ سمت کاربر همین منطق است (web/src/search.js)؛ هر تغییری را در هر دو انجام بده.
function normFa(s) {
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

// هر کلمهٔ جستجو باید جایی (عنوان/شرح/محور/کمپین/کلیدواژه) بیاید؛ ترتیب و جای کلمه‌ها مهم نیست.
function makeMatcher(q) {
  const tokens = normFa(q).split(" ").filter(Boolean);
  if (!tokens.length) return null;
  return (fields) => {
    const hay = normFa(fields.join(" "));
    const compact = hay.replace(/ /g, "");
    return tokens.every((t) => hay.includes(t) || (t.length >= 3 && compact.includes(t)));
  };
}

module.exports = { normFa, makeMatcher };
