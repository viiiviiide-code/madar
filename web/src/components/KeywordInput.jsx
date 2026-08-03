import React, { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { api } from "../api";

export default function KeywordInput({ value, onChange }) {
  const vals = Array.isArray(value) ? value : [];
  const [text, setText] = useState("");
  const [sug, setSug] = useState([]);
  const [open, setOpen] = useState(false);
  const tRef = useRef(null);

  useEffect(() => {
    if (!text.trim()) { setSug([]); return; }
    clearTimeout(tRef.current);
    tRef.current = setTimeout(async () => {
      try {
        const list = await api.keywords(text.trim());
        const arr = Array.isArray(list) ? list : [];
        setSug(arr.filter((s) => !vals.includes(s)));
        setOpen(true);
      } catch (e) {
        setSug([]); // network error shouldn't crash the form
      }
    }, 180); // debounced AJAX
    return () => clearTimeout(tRef.current);
  }, [text, value]);

  const add = (kw) => {
    const k = String(kw ?? text).trim();
    if (k && !vals.includes(k)) onChange([...vals, k]);
    setText(""); setSug([]); setOpen(false);
  };
  const remove = (k) => onChange(vals.filter((x) => x !== k));

  return (
    <div className="kw">
      <div className="kw-tags">
        {vals.map((k) => (
          <span key={k} className="kw-tag">
            {k}<button type="button" onClick={() => remove(k)}><X size={12} /></button>
          </span>
        ))}
        <input
          value={text}
          placeholder={vals.length ? "" : "کلیدواژه… (Enter)"}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") { e.preventDefault(); add(); }
            if (e.key === "Backspace" && !text && vals.length) remove(vals[vals.length - 1]);
          }}
          onFocus={() => sug.length && setOpen(true)}
        />
      </div>
      {open && sug.length > 0 && (
        <div className="kw-sug">
          {sug.map((s) => (
            <button key={s} type="button" onMouseDown={(e) => { e.preventDefault(); add(s); }}>{s}</button>
          ))}
        </div>
      )}
    </div>
  );
}
