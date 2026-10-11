import React from "react";

// حالت‌های بارگذاری و خالی. اسکلت‌ها شکل صفحه را از قبل نشان می‌دهند تا با رسیدن
// داده‌ها، محتوا جابه‌جا نشود؛ جایگزین متن ساده‌ی «در حال بارگذاری…».

export function PageSkeleton({ cards = 6, hero = true }) {
  return (
    <div className="page" role="status" aria-live="polite" aria-label="در حال بارگذاری">
      {hero && (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 12, margin: "20px 0 28px" }}>
          <div className="skel skel-line w-40" style={{ height: 12, width: 110 }} />
          <div className="skel skel-line" style={{ height: 38, width: "min(420px, 70%)" }} />
          <div className="skel skel-line w-60" style={{ maxWidth: 380 }} />
        </div>
      )}
      <div className="skel-grid">
        {Array.from({ length: cards }, (_, i) => <div key={i} className="skel skel-card" />)}
      </div>
    </div>
  );
}

// اسکلت کل برنامه تا وقتی تنظیمات کاربر از سرور می‌رسد
export function AppSkeleton() {
  return (
    <div className="app loading" role="status" aria-live="polite" aria-label="در حال بارگذاری">
      <div className="skel skel-top" />
      <div className="skel-page">
        <div style={{ display: "flex", justifyContent: "center", margin: "12px 0" }}>
          <div className="skel skel-circle" style={{ width: 220, height: 220 }} />
        </div>
        <div className="skel-grid">
          {Array.from({ length: 3 }, (_, i) => <div key={i} className="skel skel-card" style={{ height: 140 }} />)}
        </div>
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, text, action }) {
  return (
    <div className="empty-state">
      {Icon && <span className="es-ic"><Icon size={24} /></span>}
      <h3>{title}</h3>
      {text && <p>{text}</p>}
      {action}
    </div>
  );
}
