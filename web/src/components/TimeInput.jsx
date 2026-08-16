import React from "react";
import { Clock } from "lucide-react";
import { toFa } from "../jalali";

// A simple H:M selector in the site's own dropdown style (matches JalaliInput),
// so nothing here depends on the browser's native time-picker widget.
// value/onChange both work with a plain "HH:MM" 24-hour string.
export default function TimeInput({ value, onChange }) {
  const [h, m] = /^(\d{1,2}):(\d{1,2})$/.test(value || "") ? value.split(":").map(Number) : [null, null];

  const set = (patch) => {
    const nh = patch.h ?? h ?? 0;
    const nm = patch.m ?? m ?? 0;
    onChange(`${String(nh).padStart(2, "0")}:${String(nm).padStart(2, "0")}`);
  };

  return (
    <div className="time-in">
      <Clock size={13} className="time-in-ic" />
      <select value={h ?? ""} onChange={(e) => set({ h: +e.target.value })}>
        <option value="" disabled>ساعت</option>
        {Array.from({ length: 24 }, (_, i) => i).map((n) => (
          <option key={n} value={n}>{toFa(String(n).padStart(2, "0"))}</option>
        ))}
      </select>
      <span className="time-in-sep">:</span>
      <select value={m ?? ""} onChange={(e) => set({ m: +e.target.value })}>
        <option value="" disabled>دقیقه</option>
        {Array.from({ length: 60 }, (_, i) => i).map((n) => (
          <option key={n} value={n}>{toFa(String(n).padStart(2, "0"))}</option>
        ))}
      </select>
    </div>
  );
}
