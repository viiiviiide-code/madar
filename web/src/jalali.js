import { toJalaali, toGregorian, jalaaliMonthLength } from "jalaali-js";

export const FA = ["۰","۱","۲","۳","۴","۵","۶","۷","۸","۹"];
export const toFa = (v) => String(v).replace(/\d/g, (d) => FA[+d]);
export const faToEn = (s) => String(s).replace(/[۰-۹]/g, (d) => String(FA.indexOf(d)));

export const MONTHS = [
  "فروردین","اردیبهشت","خرداد","تیر","مرداد","شهریور",
  "مهر","آبان","آذر","دی","بهمن","اسفند",
];

const pad = (n) => String(n).padStart(2, "0");

// true only for a clean Gregorian ISO date 'YYYY-MM-DD' with sane ranges
export function isValidISO(iso) {
  if (typeof iso !== "string") return false;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return false;
  const y = +m[1], mo = +m[2], d = +m[3];
  return y >= 1700 && y <= 2200 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

// ISO 'YYYY-MM-DD' (Gregorian) -> {jy,jm,jd} | null   (never throws)
export function isoToJalali(iso) {
  if (!isValidISO(iso)) return null;
  try {
    const [y, m, d] = iso.split("-").map(Number);
    const j = toJalaali(y, m, d);
    if (!j || !j.jy || j.jm < 1 || j.jm > 12) return null;
    return j;
  } catch (e) {
    return null;
  }
}

// {jy,jm,jd} -> ISO  (guards against bad numbers)
export function jalaliToISO(jy, jm, jd) {
  try {
    jy = +jy; jm = +jm; jd = +jd;
    if (!jy || jm < 1 || jm > 12 || jd < 1 || jd > 31) return null;
    const g = toGregorian(jy, jm, jd);
    return `${g.gy}-${pad(g.gm)}-${pad(g.gd)}`;
  } catch (e) {
    return null;
  }
}

export function formatJalali(iso) {
  const j = isoToJalali(iso);
  if (!j) return "—";
  return `${toFa(j.jd)} ${MONTHS[j.jm - 1]} ${toFa(j.jy)}`;
}
export function formatJalaliMonth(iso) {
  const j = isoToJalali(iso);
  if (!j) return "—";
  return `${MONTHS[j.jm - 1]} ${toFa(j.jy)}`;
}

export const jMonthStartISO = (jy, jm) => jalaliToISO(jy, jm, 1);
export const jMonthEndISO = (jy, jm) => {
  try { return jalaliToISO(jy, jm, jalaaliMonthLength(jy, jm)); }
  catch (e) { return jalaliToISO(jy, jm, 29); }
};

export const todayJalali = () => {
  const n = new Date();
  return toJalaali(n.getFullYear(), n.getMonth() + 1, n.getDate());
};
