import React, { useEffect, useRef, useState } from "react";
import {
  Settings, Menu, X, Sun, Moon, Circle, CalendarRange, Layers,
  Plus, SlidersHorizontal, FolderPlus, ChevronLeft, ChevronDown, LogOut,
} from "lucide-react";
import { api, auth, setUnauthorizedHandler } from "./api";
import { formatJalaliMonth, isoToJalali } from "./jalali";
import Home from "./components/Home.jsx";
import ProjectPage from "./components/ProjectPage.jsx";
import WorkPage from "./components/WorkPage.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
import Login from "./components/Login.jsx";

// URL <-> view mapping, so refreshing the page (or sharing a link) keeps
// the user on the same screen instead of always bouncing to "home".
function viewFromLocation() {
  const qs = new URLSearchParams(window.location.search);
  const name = qs.get("v") || "home";
  if (name === "project" && qs.get("id")) {
    return { name: "project", id: qs.get("id"), q: qs.get("q") || "" };
  }
  if (name === "work" && qs.get("id") && qs.get("workId")) {
    return { name: "work", id: qs.get("id"), workId: qs.get("workId") };
  }
  return { name: "home" };
}
function locationFromView(v) {
  const qs = new URLSearchParams();
  qs.set("v", v.name || "home");
  if (v.name === "project" && v.id) { qs.set("id", v.id); if (v.q) qs.set("q", v.q); }
  if (v.name === "work" && v.id && v.workId) { qs.set("id", v.id); qs.set("workId", v.workId); }
  return "?" + qs.toString();
}

export default function App() {
  const [user, setUser] = useState(() => (auth.getToken() ? auth.getUser() : null));
  const [settings, setSettings] = useState(null);
  const [types, setTypes] = useState([]);
  const [platforms, setPlatforms] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [allProjects, setAllProjects] = useState([]);
  const [view, setView] = useState(() => viewFromLocation());
  const isAdminUser = user?.role === "admin";
  const [adminView, setAdminView] = useState(true); // فقط برای کاربر مدیریت: پیش‌نمایش به‌صورت حالت نمایش
  const admin = isAdminUser && adminView;
  const [sidebar, setSidebar] = useState(false);
  const [mode, setMode] = useState({ type: "date" });   // {type:'date'} | {type:'template', id, label}
  const [homeTool, setHomeTool] = useState(null);        // null|'define'|'template'|'settings'
  const [actOpen, setActOpen] = useState(true);          // activities list collapsed/expanded
  const popping = useRef(false);

  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
  }, []);

  const logout = () => {
    auth.clearSession();
    setUser(null);
  };

  const loadMeta = async () => {
    setTypes(await api.types());
    setPlatforms(await api.platforms());
  };
  const loadTemplates = () => api.templates().then((t) => setTemplates(Array.isArray(t) ? t : [])).catch(() => {});
  const loadProjects = () => api.allProjects().then((p) => setAllProjects(Array.isArray(p) ? p : [])).catch(() => {});

  useEffect(() => {
    if (!user) return;
    api.settings().then(setSettings);
    loadMeta(); loadTemplates(); loadProjects();
    // keep whatever screen the URL already points to (e.g. after a refresh)
    window.history.replaceState(view, "", locationFromView(view));
  }, [user]);

  useEffect(() => {
    if (!settings) return;
    document.documentElement.setAttribute("data-theme", settings.theme === "light" ? "light" : "dark");
  }, [settings?.theme]);

  useEffect(() => { if (user && view.name === "home") { loadProjects(); loadTemplates(); } }, [view.name, user]);

  useEffect(() => {
    const onPop = (e) => { popping.current = true; setView(e.state || viewFromLocation()); };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  const go = (next) => {
    setView(next);
    if (popping.current) { popping.current = false; return; }
    window.history.pushState(next, "", locationFromView(next));
  };

  const updateSetting = (patch) => {
    setSettings((s) => ({ ...s, ...patch }));
    api.saveSettings(patch);
  };

  // sidebar actions
  const pickDateMode = () => { setMode({ type: "date" }); setHomeTool(null); setSidebar(false); go({ name: "home" }); };
  const pickTemplate = (t) => { setMode({ type: "template", id: t.id, label: t.label }); setHomeTool(null); setSidebar(false); go({ name: "home" }); };
  const openTool = (tool) => { setHomeTool(tool); setSidebar(false); go({ name: "home" }); };
  const openActivity = (p) => { setSidebar(false); go({ name: "project", id: p.id }); };

  if (!user) return <Login onLogin={setUser} />;
  if (!settings) return <div className="app loading">در حال بارگذاری…</div>;
  const theme = settings.theme === "light" ? "light" : "dark";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-right">
          <button className="icon-btn" onClick={() => setSidebar(true)} title="منو"><Menu size={18} /></button>
          <button className="brand" onClick={() => go({ name: "home" })}>
            <span className="brand-mark" />
            <span><b>تلاش</b><em>آرشیو فعالیت‌ها و آثار مجموعه</em></span>
          </button>
        </div>
        <div className="topbar-left">
          <button className="icon-btn" onClick={() => updateSetting({ theme: theme === "light" ? "dark" : "light" })}
            title={theme === "light" ? "حالت شب" : "حالت روز"}>
            {theme === "light" ? <Moon size={17} /> : <Sun size={17} />}
          </button>
        </div>
      </header>

      {/* sidebar */}
      {sidebar && <div className="sidebar-backdrop" onClick={() => setSidebar(false)} />}
      <aside className={`sidebar ${sidebar ? "open" : ""}`}>
        <div className="sidebar-head">
          <h3>تلاش</h3>
          <button className="icon-btn" onClick={() => setSidebar(false)}><X size={18} /></button>
        </div>

        <div className="sidebar-scroll">
          {/* view modes */}
          <div className="sb-section">
            <div className="sb-section-t">نمایش</div>
            <button className={`sb-item ${mode.type === "date" ? "active" : ""}`} onClick={pickDateMode}>
              <CalendarRange size={16} className="sb-ic" />
              <span className="sb-title">حالت تاریخ (بازهٔ زمانی)</span>
            </button>
          </div>

          {/* templates / labels — list + "new template" live together */}
          <div className="sb-section">
            <div className="sb-section-t">تمپلیت‌ها (هسته‌ها)</div>
            {templates.length === 0 && <p className="sb-empty">تمپلیتی تعریف نشده.</p>}
            {templates.map((t) => (
              <button key={t.id}
                className={`sb-item ${mode.type === "template" && mode.id === t.id ? "active" : ""}`}
                onClick={() => pickTemplate(t)}>
                <Layers size={16} className="sb-ic" />
                <span className="sb-title">{t.label}</span>
                <span className="sb-badge">{t.count ?? 0}</span>
              </button>
            ))}
            {admin && (
              <button className={`sb-item sb-new ${homeTool === "template" ? "active" : ""}`}
                onClick={() => openTool("template")}>
                <FolderPlus size={16} className="sb-ic" />
                <span className="sb-title">+ تمپلیت جدید / ویرایش</span>
              </button>
            )}
          </div>

          {/* activities (collapsible) — list + "new activity" live together */}
          <div className="sb-section">
            <button className="sb-section-t collapsible" onClick={() => setActOpen((v) => !v)}>
              <ChevronDown size={14} className={`sb-chevron ${actOpen ? "open" : ""}`} />
              فعالیت‌ها
              <span className="sb-count">{allProjects.length}</span>
            </button>
            {actOpen && (
              <>
                {allProjects.length === 0 && <p className="sb-empty">فعالیتی ثبت نشده.</p>}
                {allProjects.map((p) => (
                  <button key={p.id} className="sb-item" onClick={() => openActivity(p)}>
                    <Circle size={9} className="sb-dot" />
                    <span className="sb-title">{p.title}</span>
                    <span className="sb-date">{p.start_date ? formatJalaliMonth(p.start_date) : "—"}</span>
                  </button>
                ))}
                {admin && (
                  <button className={`sb-item sb-new ${homeTool === "define" ? "active" : ""}`}
                    onClick={() => openTool("define")}>
                    <Plus size={16} className="sb-ic" />
                    <span className="sb-title">+ فعالیت جدید</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* admin — فقط برای کاربری که با حساب مدیریت وارد شده نمایش داده می‌شود */}
          {isAdminUser && (
            <div className="sb-section sb-admin">
              <div className="sb-section-t">مدیریت</div>
              <button className={`sb-item toggle ${admin ? "on" : ""}`} onClick={() => setAdminView((v) => !v)}>
                <Settings size={16} className="sb-ic" />
                <span className="sb-title">حالت مدیریت</span>
                <span className={`sb-switch ${admin ? "on" : ""}`}><span /></span>
              </button>
              {admin && (
                <button className="sb-item" onClick={() => openTool("settings")}>
                  <SlidersHorizontal size={16} className="sb-ic" /><span className="sb-title">تنظیمات نمایش</span>
                </button>
              )}
            </div>
          )}

          {/* حساب کاربری */}
          <div className="sb-section">
            <div className="sb-section-t">حساب کاربری</div>
            <div className="sb-item sb-account">
              <span className="sb-title">{user.username}</span>
              <span className="sb-badge">{isAdminUser ? "مدیریت" : "نمایش"}</span>
            </div>
            <button className="sb-item" onClick={logout}>
              <LogOut size={16} className="sb-ic" /><span className="sb-title">خروج</span>
            </button>
          </div>
        </div>
      </aside>

      <ErrorBoundary
        key={view.name + ":" + (view.id || "") + ":" + (view.workId || "")}
        onReset={() => go({ name: "home" })}
      >
        {view.name === "home" && (
          <Home
            settings={settings} updateSetting={updateSetting} admin={admin}
            mode={mode} setMode={setMode}
            templates={templates} reloadTemplates={loadTemplates}
            homeTool={homeTool} setHomeTool={setHomeTool}
            openProject={(id) => go({ name: "project", id })}
            openSidebar={() => setSidebar(true)}
          />
        )}

        {view.name === "project" && (
          <ProjectPage
            projectId={view.id} admin={admin}
            initialQuery={view.q || ""}
            types={types} platforms={platforms} reloadMeta={loadMeta}
            goHome={() => go({ name: "home" })}
            openWork={(workId) => go({ name: "work", id: view.id, workId })}
          />
        )}

        {view.name === "work" && (
          <WorkPage
            workId={view.workId} projectId={view.id} admin={admin}
            platforms={platforms} reloadMeta={loadMeta}
            goBack={() => go({ name: "project", id: view.id })}
            openWork={(workId) => go({ name: "work", id: view.id, workId })}
            openProjectWithQuery={(q) => go({ name: "project", id: view.id, q })}
          />
        )}
      </ErrorBoundary>

      <footer className="foot">
        <span className="foot-line">
          قدرت‌گرفته از <span className="brand-vivide">Vivide</span>
        </span>
      </footer>
    </div>
  );
}
