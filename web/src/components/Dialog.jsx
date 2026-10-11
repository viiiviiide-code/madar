import React, { useEffect, useRef, useState } from "react";
import { AlertTriangle, HelpCircle } from "lucide-react";

// جایگزین confirm() و alert() مرورگر. به‌جای بلاک‌کردن صفحه، Promise برمی‌گرداند:
//   if (!(await confirmDialog("حذف شود؟", { tone: "danger", confirmLabel: "حذف" }))) return;
//   await alertDialog("ذخیره ناموفق بود.");
// تا وقتی <DialogHost /> سوار نشده، به دیالوگ بومی مرورگر برمی‌گردد تا هیچ فراخوانی بی‌اثر نماند.

let enqueue = null;

export function confirmDialog(message, opts = {}) {
  if (!enqueue) return Promise.resolve(window.confirm(message));
  return new Promise((resolve) => enqueue({ kind: "confirm", message, ...opts, resolve }));
}

export function alertDialog(message, opts = {}) {
  if (!enqueue) { window.alert(message); return Promise.resolve(); }
  return new Promise((resolve) => enqueue({ kind: "alert", tone: "danger", message, ...opts, resolve }));
}

export function DialogHost() {
  const [queue, setQueue] = useState([]);
  const current = queue[0];

  useEffect(() => {
    enqueue = (d) => setQueue((q) => [...q, d]);
    return () => { enqueue = null; };
  }, []);

  const close = (value) => {
    current.resolve(value);
    setQueue((q) => q.slice(1));
  };

  return current ? <DialogView key={queue.length + current.message} d={current} onClose={close} /> : null;
}

function DialogView({ d, onClose }) {
  const cardRef = useRef(null);
  const cancelRef = useRef(null);
  const okRef = useRef(null);
  const isConfirm = d.kind === "confirm";
  const danger = d.tone === "danger";
  const title = d.title || (isConfirm ? (danger ? "تأیید حذف" : "تأیید") : "مشکلی پیش آمد");
  const cancelValue = isConfirm ? false : undefined;

  useEffect(() => {
    const prev = document.activeElement;
    // برای کار مخرب، فوکوس اولیه روی «انصراف» است تا Enter اشتباهی چیزی را پاک نکند
    (isConfirm && danger ? cancelRef : okRef).current?.focus();
    return () => { if (prev && prev.focus) prev.focus(); };
  }, []);

  const onKeyDown = (e) => {
    if (e.key === "Escape") { e.stopPropagation(); onClose(cancelValue); return; }
    if (e.key !== "Tab") return;
    const f = cardRef.current?.querySelectorAll("button:not(:disabled)");
    if (!f?.length) return;
    const first = f[0], last = f[f.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  };

  const Icon = danger ? AlertTriangle : HelpCircle;
  return (
    <div className="dlg-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget) onClose(cancelValue); }}>
      <div ref={cardRef} className={`dlg-card ${danger ? "danger" : ""}`} role="alertdialog"
        aria-modal="true" aria-labelledby="dlg-title" aria-describedby="dlg-msg" onKeyDown={onKeyDown}>
        <div className="dlg-head">
          <span className="dlg-ic"><Icon size={20} /></span>
          <h2 className="dlg-title" id="dlg-title">{title}</h2>
        </div>
        <p className="dlg-msg" id="dlg-msg">{d.message}</p>
        <div className="dlg-actions">
          {isConfirm && (
            <button ref={cancelRef} className="btn ghost" onClick={() => onClose(false)}>
              {d.cancelLabel || "انصراف"}
            </button>
          )}
          <button ref={okRef} className={`btn ${danger && isConfirm ? "danger-fill" : "gold"}`}
            onClick={() => onClose(isConfirm ? true : undefined)}>
            {d.confirmLabel || (isConfirm ? "تأیید" : "متوجه شدم")}
          </button>
        </div>
      </div>
    </div>
  );
}
