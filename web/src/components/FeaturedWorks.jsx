import React, { useEffect, useState } from "react";
import { ChevronRight, Star, Eye } from "lucide-react";
import { PageSkeleton, EmptyState } from "./States.jsx";
import { api } from "../api";
import { toFa } from "../jalali";
import { LazyMedia } from "./ProjectPage.jsx";

function fmtNum(n) {
  const v = Number(n) || 0;
  return toFa(v.toLocaleString("en-US"));
}

export default function FeaturedWorks({ templateId, templateLabel, goBack, openWork }) {
  const [works, setWorks] = useState(null);

  useEffect(() => {
    api.featuredWorks(templateId).then((w) => setWorks(Array.isArray(w) ? w : [])).catch(() => setWorks([]));
  }, [templateId]);

  return (
    <div className="page">
      <div className="page-top">
        <button className="back" onClick={goBack}><ChevronRight size={16} /> بازگشت</button>
      </div>

      <section>
        <div className="row-head">
          <h2><Star size={18} fill="currentColor" className="title-star" /> آثار شاخص {templateLabel ? `— ${templateLabel}` : ""}</h2>
          {works && <span className="count-badge">{toFa(works.length)}</span>}
        </div>

        {works === null && <PageSkeleton hero={false} cards={4} />}
        {works && works.length === 0 && <EmptyState icon={Star} title="هنوز اثر شاخصی نیست" text="در صفحهٔ هر اثر می‌توانی آن را به‌عنوان اثر شاخص این تمپلیت علامت بزنی." />}

        {works && works.length > 0 && (
          <div className="works-grid">
            {works.map((w) => (
              <div key={w.id} className="work-card" onClick={() => openWork(w.project_id, w.id)} onKeyDown={(e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); openWork(w.project_id, w.id); } }} role="button" tabIndex={0}>
                <LazyMedia work={w} />
                <div className="work-meta">
                  <div className="work-top">
                    <span className="chip"><Star size={11} fill="currentColor" /> شاخص</span>
                    <span className="views"><Eye size={13} /> {fmtNum(w.totalViews)}</span>
                  </div>
                  <h3>{w.title}</h3>
                  <p className="muted-sm">{w.axis}{w.axis && w.campaign ? " · " : ""}{w.campaign}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
