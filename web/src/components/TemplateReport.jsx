import React, { useEffect, useMemo, useState } from "react";
import {
  ChevronRight, Printer, Eye, Heart, MessageCircle, Film, Image as ImageIcon,
  FileText, CheckSquare, Square, BarChart3,
} from "lucide-react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Cell, ResponsiveContainer, LabelList,
} from "recharts";
import { api } from "../api";
import { toFa } from "../jalali";

function fmtNum(n) {
  const v = Number(n) || 0;
  return toFa(v.toLocaleString("en-US"));
}

const BAR_COLORS = ["#E8B04B", "#5FB3E0", "#7ED6A5", "#E88C8C", "#C0A0E8", "#E0C05F"];

export default function TemplateReport({ templateId, templateLabel, goBack }) {
  const [report, setReport] = useState(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("overview"); // "overview" | "custom"
  const [selected, setSelected] = useState(new Set());
  const [show, setShow] = useState({
    statViews: true, statLikes: true, statComments: true, statTypes: true,
    chartViews: true, chartLikes: true, chartComments: true, chartTypes: true,
  });

  useEffect(() => {
    api.templateReport(templateId)
      .then((r) => {
        if (r?.error) { setError(r.error); return; }
        setReport(r);
        setSelected(new Set((r.activities || []).map((a) => a.id)));
      })
      .catch(() => setError("گزارش بارگذاری نشد."));
  }, [templateId]);

  const activities = report?.activities || [];
  const types = report?.types || [];

  const activeActivities = useMemo(() => {
    if (mode === "overview") return activities;
    return activities.filter((a) => selected.has(a.id));
  }, [mode, activities, selected]);

  const totals = useMemo(() => {
    const t = { views: 0, likes: 0, comments: 0, workCount: 0, typeCounts: {} };
    activeActivities.forEach((a) => {
      t.views += a.views; t.likes += a.likes; t.comments += a.comments; t.workCount += a.workCount;
      Object.entries(a.typeCounts).forEach(([k, v]) => { t.typeCounts[k] = (t.typeCounts[k] || 0) + v; });
    });
    return t;
  }, [activeActivities]);

  const toggleActivity = (id) => {
    setSelected((s) => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  };
  const selectAll = () => setSelected(new Set(activities.map((a) => a.id)));
  const selectNone = () => setSelected(new Set());
  const toggle = (key) => setShow((s) => ({ ...s, [key]: !s[key] }));

  const chartData = (field) =>
    activeActivities.map((a) => ({ name: a.title, value: a[field] }));
  const typeChartData = types
    .map((t) => ({ name: t.label, value: totals.typeCounts[t.key] || 0 }))
    .filter((d) => d.value > 0);

  if (error) {
    return (
      <div className="page report-page">
        <div className="page-top"><button className="back" onClick={goBack}><ChevronRight size={16} /> بازگشت</button></div>
        <div className="no-res">{error}</div>
      </div>
    );
  }
  if (!report) {
    return (
      <div className="page report-page">
        <div className="page-top"><button className="back" onClick={goBack}><ChevronRight size={16} /> بازگشت</button></div>
        <div className="muted">در حال بارگذاری گزارش…</div>
      </div>
    );
  }

  return (
    <div className="page report-page">
      <div className="page-top no-print">
        <button className="back" onClick={goBack}><ChevronRight size={16} /> بازگشت</button>
        <button className="btn gold sm" onClick={() => window.print()}>
          <Printer size={14} /> دانلود / چاپ PDF
        </button>
      </div>

      {/* print-only header (screen header lives in .rp-head below) */}
      <div className="rp-print-head">
        <h1>گزارش تمپلیت «{report.template.label}»</h1>
        <span>{mode === "overview" ? "گزارش کلی" : "گزارش سفارشی"} — {toFa(new Date().toLocaleDateString("fa-IR"))}</span>
      </div>

      <div className="rp-head">
        <BarChart3 size={20} className="rp-head-ic" />
        <h1>گزارش «{report.template.label}»</h1>
      </div>

      {/* report-type + customization controls */}
      <div className="rp-controls no-print">
        <div className="rp-mode-pick">
          <label className={mode === "overview" ? "on" : ""}>
            <input type="radio" name="rpMode" checked={mode === "overview"} onChange={() => setMode("overview")} />
            گزارش کلی (همهٔ فعالیت‌ها)
          </label>
          <label className={mode === "custom" ? "on" : ""}>
            <input type="radio" name="rpMode" checked={mode === "custom"} onChange={() => setMode("custom")} />
            گزارش سفارشی
          </label>
        </div>

        {mode === "custom" && (
          <div className="rp-custom-box">
            <div className="rp-custom-row">
              <span className="tp-subhead">فعالیت‌ها</span>
              <div className="rp-select-actions">
                <button className="mini" onClick={selectAll}>همهٔ فعالیت‌ها</button>
                <button className="mini" onClick={selectNone}>لغو انتخاب همه</button>
              </div>
            </div>
            <div className="rp-activity-list">
              {activities.map((a) => (
                <button key={a.id} className={`rp-act-chip ${selected.has(a.id) ? "on" : ""}`} onClick={() => toggleActivity(a.id)}>
                  {selected.has(a.id) ? <CheckSquare size={14} /> : <Square size={14} />}
                  {a.title}
                </button>
              ))}
              {activities.length === 0 && <span className="muted-sm">فعالیتی در این تمپلیت نیست.</span>}
            </div>

            <div className="rp-custom-row">
              <span className="tp-subhead">آمارهای نمایش‌داده‌شده</span>
            </div>
            <div className="rp-toggle-row">
              <label className={show.statViews ? "on" : ""}><input type="checkbox" checked={show.statViews} onChange={() => toggle("statViews")} /> بازدید</label>
              <label className={show.statLikes ? "on" : ""}><input type="checkbox" checked={show.statLikes} onChange={() => toggle("statLikes")} /> لایک</label>
              <label className={show.statComments ? "on" : ""}><input type="checkbox" checked={show.statComments} onChange={() => toggle("statComments")} /> کامنت</label>
              <label className={show.statTypes ? "on" : ""}><input type="checkbox" checked={show.statTypes} onChange={() => toggle("statTypes")} /> انواع اثر</label>
            </div>

            <div className="rp-custom-row">
              <span className="tp-subhead">نمودارهای نمایش‌داده‌شده</span>
            </div>
            <div className="rp-toggle-row">
              <label className={show.chartViews ? "on" : ""}><input type="checkbox" checked={show.chartViews} onChange={() => toggle("chartViews")} /> نمودار بازدید</label>
              <label className={show.chartLikes ? "on" : ""}><input type="checkbox" checked={show.chartLikes} onChange={() => toggle("chartLikes")} /> نمودار لایک</label>
              <label className={show.chartComments ? "on" : ""}><input type="checkbox" checked={show.chartComments} onChange={() => toggle("chartComments")} /> نمودار کامنت</label>
              <label className={show.chartTypes ? "on" : ""}><input type="checkbox" checked={show.chartTypes} onChange={() => toggle("chartTypes")} /> نمودار انواع اثر</label>
            </div>
          </div>
        )}
      </div>

      {/* summary cards */}
      <div className="rp-cards">
        {show.statViews && (
          <div className="rp-card">
            <Eye size={20} className="cyan" />
            <div><span className="info-k">جمع بازدید</span><div className="info-v big">{fmtNum(totals.views)}</div></div>
          </div>
        )}
        {show.statLikes && (
          <div className="rp-card">
            <Heart size={20} className="cyan" />
            <div><span className="info-k">جمع لایک</span><div className="info-v big">{fmtNum(totals.likes)}</div></div>
          </div>
        )}
        {show.statComments && (
          <div className="rp-card">
            <MessageCircle size={20} className="cyan" />
            <div><span className="info-k">جمع کامنت</span><div className="info-v big">{fmtNum(totals.comments)}</div></div>
          </div>
        )}
        <div className="rp-card">
          <FileText size={20} className="cyan" />
          <div><span className="info-k">تعداد آثار</span><div className="info-v big">{fmtNum(totals.workCount)}</div></div>
        </div>
      </div>

      {/* type-count breakdown */}
      {show.statTypes && (
        <section className="rp-section">
          <h2>انواع آثار</h2>
          <div className="rp-type-cards">
            {types.map((t) => (totals.typeCounts[t.key] || 0) > 0 && (
              <div key={t.key} className="rp-type-card">
                <span className="info-v">{fmtNum(totals.typeCounts[t.key] || 0)}</span>
                <span className="info-k">{t.label}</span>
              </div>
            ))}
            {types.every((t) => !(totals.typeCounts[t.key] > 0)) && <span className="muted-sm">اثری ثبت نشده.</span>}
          </div>
        </section>
      )}

      {/* charts — activities along the horizontal axis, numbers on the vertical axis */}
      {show.chartViews && activeActivities.length > 0 && (
        <section className="rp-section rp-chart-section">
          <h2><Eye size={16} /> بازدید به تفکیک فعالیت</h2>
          <div className="rp-chart-wrap" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData("views")} margin={{ top: 26, right: 8, bottom: 48, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rp-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--rp-tick)", fontSize: 11 }}
                  angle={-25} textAnchor="end" interval={0} height={60} />
                <YAxis tick={{ fill: "var(--rp-tick)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(232,176,75,0.10)" }}
                  contentStyle={{
                    direction: "rtl", fontFamily: "inherit", background: "var(--panel)",
                    border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)",
                  }}
                  labelStyle={{ color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}
                  itemStyle={{ color: "var(--gold)" }}
                  formatter={(v) => fmtNum(v)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={fmtNum}
                    style={{ fill: "var(--rp-tick)", fontSize: 11, fontWeight: 700 }} />
                  {chartData("views").map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {show.chartLikes && activeActivities.length > 0 && (
        <section className="rp-section rp-chart-section">
          <h2><Heart size={16} /> لایک به تفکیک فعالیت</h2>
          <div className="rp-chart-wrap" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData("likes")} margin={{ top: 26, right: 8, bottom: 48, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rp-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--rp-tick)", fontSize: 11 }}
                  angle={-25} textAnchor="end" interval={0} height={60} />
                <YAxis tick={{ fill: "var(--rp-tick)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(232,176,75,0.10)" }}
                  contentStyle={{
                    direction: "rtl", fontFamily: "inherit", background: "var(--panel)",
                    border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)",
                  }}
                  labelStyle={{ color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}
                  itemStyle={{ color: "var(--gold)" }}
                  formatter={(v) => fmtNum(v)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={fmtNum}
                    style={{ fill: "var(--rp-tick)", fontSize: 11, fontWeight: 700 }} />
                  {chartData("likes").map((_, i) => <Cell key={i} fill={BAR_COLORS[(i + 1) % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {show.chartComments && activeActivities.length > 0 && (
        <section className="rp-section rp-chart-section">
          <h2><MessageCircle size={16} /> کامنت به تفکیک فعالیت</h2>
          <div className="rp-chart-wrap" style={{ height: 300 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData("comments")} margin={{ top: 26, right: 8, bottom: 48, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rp-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--rp-tick)", fontSize: 11 }}
                  angle={-25} textAnchor="end" interval={0} height={60} />
                <YAxis tick={{ fill: "var(--rp-tick)", fontSize: 11 }} allowDecimals={false} />
                <Tooltip
                  cursor={{ fill: "rgba(232,176,75,0.10)" }}
                  contentStyle={{
                    direction: "rtl", fontFamily: "inherit", background: "var(--panel)",
                    border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)",
                  }}
                  labelStyle={{ color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}
                  itemStyle={{ color: "var(--gold)" }}
                  formatter={(v) => fmtNum(v)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={fmtNum}
                    style={{ fill: "var(--rp-tick)", fontSize: 11, fontWeight: 700 }} />
                  {chartData("comments").map((_, i) => <Cell key={i} fill={BAR_COLORS[(i + 2) % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {show.chartTypes && typeChartData.length > 0 && (
        <section className="rp-section rp-chart-section">
          <h2><Film size={16} /> توزیع انواع اثر</h2>
          <div className="rp-chart-wrap" style={{ height: 280 }}>
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={typeChartData} margin={{ top: 26, right: 8, bottom: 32, left: 8 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--rp-grid)" vertical={false} />
                <XAxis dataKey="name" tick={{ fill: "var(--rp-tick)", fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fill: "var(--rp-tick)", fontSize: 11 }} />
                <Tooltip
                  cursor={{ fill: "rgba(232,176,75,0.10)" }}
                  contentStyle={{
                    direction: "rtl", fontFamily: "inherit", background: "var(--panel)",
                    border: "1px solid var(--line)", borderRadius: 10, color: "var(--ink)",
                  }}
                  labelStyle={{ color: "var(--ink)", fontWeight: 700, marginBottom: 4 }}
                  itemStyle={{ color: "var(--gold)" }}
                  formatter={(v) => fmtNum(v)}
                />
                <Bar dataKey="value" radius={[6, 6, 0, 0]}>
                  <LabelList dataKey="value" position="top" formatter={fmtNum}
                    style={{ fill: "var(--rp-tick)", fontSize: 11, fontWeight: 700 }} />
                  {typeChartData.map((_, i) => <Cell key={i} fill={BAR_COLORS[i % BAR_COLORS.length]} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </section>
      )}

      {/* per-activity breakdown table */}
      <section className="rp-section">
        <h2><ImageIcon size={16} /> جدول تفکیکی هر فعالیت</h2>
        <table className="rp-table">
          <thead>
            <tr>
              <th>فعالیت</th>
              {show.statViews && <th>بازدید</th>}
              {show.statLikes && <th>لایک</th>}
              {show.statComments && <th>کامنت</th>}
              <th>تعداد آثار</th>
            </tr>
          </thead>
          <tbody>
            {activeActivities.map((a) => (
              <tr key={a.id}>
                <td>{a.title}</td>
                {show.statViews && <td>{fmtNum(a.views)}</td>}
                {show.statLikes && <td>{fmtNum(a.likes)}</td>}
                {show.statComments && <td>{fmtNum(a.comments)}</td>}
                <td>{fmtNum(a.workCount)}</td>
              </tr>
            ))}
            {activeActivities.length === 0 && (
              <tr><td colSpan={5} className="muted-sm">فعالیتی انتخاب نشده.</td></tr>
            )}
          </tbody>
        </table>
      </section>
    </div>
  );
}
