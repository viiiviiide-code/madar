import React from "react";
import { MONTHS, isoToJalali, jalaliToISO, toFa, todayJalali } from "../jalali";

// A Y/M/D Jalali selector that emits an ISO (Gregorian) string.
// Resilient: if `value` is missing/invalid, falls back to a default date.
export default function JalaliInput({ value, onChange }) {
  const fallback = { jy: todayJalali().jy, jm: 1, jd: 1 };
  const j = isoToJalali(value) || fallback;

  const set = (patch) => {
    const n = { ...j, ...patch };
    const iso = jalaliToISO(n.jy, n.jm, n.jd);
    if (iso) onChange(iso);
  };

  const years = [];
  for (let y = 1398; y <= 1410; y++) years.push(y);

  return (
    <div className="jdate">
      <select value={j.jd} onChange={(e) => set({ jd: +e.target.value })}>
        {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
          <option key={d} value={d}>{toFa(d)}</option>
        ))}
      </select>
      <select value={j.jm} onChange={(e) => set({ jm: +e.target.value })}>
        {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
      </select>
      <select value={j.jy} onChange={(e) => set({ jy: +e.target.value })}>
        {years.map((y) => <option key={y} value={y}>{toFa(y)}</option>)}
      </select>
    </div>
  );
}
