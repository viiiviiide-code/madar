import React, { useEffect, useRef, useState } from "react";
import {
  Settings, Menu, X, Sun, Moon, Circle, CalendarRange, Layers,
  Plus, SlidersHorizontal, FolderPlus, ChevronLeft, ChevronDown, LogOut, Star, Trash2, Users,
} from "lucide-react";
import { api, auth, setUnauthorizedHandler } from "./api";
import { formatJalaliMonth, isoToJalali } from "./jalali";
import Home from "./components/Home.jsx";
import ProjectPage from "./components/ProjectPage.jsx";
import WorkPage from "./components/WorkPage.jsx";
import FeaturedWorks from "./components/FeaturedWorks.jsx";
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
  if (name === "featured" && qs.get("tid")) {
    return { name: "featured", tid: qs.get("tid"), label: qs.get("label") || "" };
  }
  // home (default) — also remembers which "mode" (date range vs a specific template)
  // was active, so a hard refresh or the browser's back button doesn't dump the
  // person onto a blank/template-less screen.
  if (qs.get("m") === "template" && qs.get("mid")) {
    return { name: "home", modeType: "template", modeId: qs.get("mid"), modeLabel: qs.get("mlabel") || "" };
  }
  if (qs.get("m") === "date") return { name: "home", modeType: "date" };
  return { name: "home", modeType: "none" };
}
function locationFromView(v) {
  const qs = new URLSearchParams();
  qs.set("v", v.name || "home");
  if (v.name === "project" && v.id) { qs.set("id", v.id); if (v.q) qs.set("q", v.q); }
  if (v.name === "work" && v.id && v.workId) { qs.set("id", v.id); qs.set("workId", v.workId); }
  if (v.name === "featured" && v.tid) { qs.set("tid", v.tid); if (v.label) qs.set("label", v.label); }
  if (v.name === "home") {
    if (v.modeType === "template" && v.modeId) {
      qs.set("m", "template"); qs.set("mid", v.modeId); if (v.modeLabel) qs.set("mlabel", v.modeLabel);
    } else {
      qs.set("m", "date");
    }
  }
  return "?" + qs.toString();
}
function modeFromView(v) {
  if (v?.name === "home" && v.modeType === "template" && v.modeId) {
    return { type: "template", id: v.modeId, label: v.modeLabel || "" };
  }
  if (v?.name === "home" && v.modeType === "date") return { type: "date" };
  return { type: "none" };   // true default: a blank landing page, nothing picked yet
}
function viewForMode(m) {
  if (m?.type === "template" && m.id) {
    return { name: "home", modeType: "template", modeId: m.id, modeLabel: m.label || "" };
  }
  if (m?.type === "date") return { name: "home", modeType: "date" };
  return { name: "home", modeType: "none" };
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
  const [adminView, setAdminView] = useState(() => {
    try { return localStorage.getItem("madar_admin_view_mode") !== "0"; } catch { return true; }
  }); // فقط برای کاربر مدیریت: پیش‌نمایش به‌صورت حالت نمایش — بین رفرش‌ها حفظ می‌شود
  const admin = isAdminUser && adminView;
  const toggleAdminView = () => {
    setAdminView((v) => {
      const next = !v;
      try { localStorage.setItem("madar_admin_view_mode", next ? "1" : "0"); } catch {}
      return next;
    });
  };
  const [sidebar, setSidebar] = useState(false);
  const [mode, setMode] = useState(() => modeFromView(viewFromLocation()));   // {type:'date'} | {type:'template', id, label}
  const [homeTool, setHomeTool] = useState(null);        // null|'define'|'template'|'settings'
  const [actOpen, setActOpen] = useState(true);          // "untemplated" activities list collapsed/expanded
  const [expandedTpl, setExpandedTpl] = useState({});    // per-template nested-activities expand state
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
    const onPop = (e) => {
      popping.current = true;
      const next = e.state || viewFromLocation();
      setView(next);
      if (next.name === "home") setMode(modeFromView(next));
    };
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
  const pickDateMode = () => { setMode({ type: "date" }); setHomeTool(null); setSidebar(false); go(viewForMode({ type: "date" })); };
  const pickTemplate = (t) => { setMode({ type: "template", id: t.id, label: t.label }); setHomeTool(null); setSidebar(false); go(viewForMode({ type: "template", id: t.id, label: t.label })); };
  const openTool = (tool) => { setHomeTool(tool); setSidebar(false); go(viewForMode(mode)); };
  const openActivity = (p) => { setSidebar(false); go({ name: "project", id: p.id }); };
  const newActivityInTemplate = (t) => {
    setMode({ type: "template", id: t.id, label: t.label });
    setHomeTool("define"); setSidebar(false); go(viewForMode({ type: "template", id: t.id, label: t.label }));
  };
  const newActivityUntemplated = () => {
    setMode({ type: "date" });
    setHomeTool("define"); setSidebar(false); go(viewForMode({ type: "date" }));
  };
  const delTemplateFromSidebar = async (t, e) => {
    e.stopPropagation();
    if (!confirm(`تمپلیت «${t.label}» حذف شود؟ فعالیت‌های داخلش حذف نمی‌شوند، فقط از این تمپلیت جدا می‌شوند.`)) return;
    await api.delTemplate(t.id);
    if (mode.type === "template" && mode.id === t.id) { setMode({ type: "date" }); go(viewForMode({ type: "date" })); }
    loadTemplates(); loadProjects();
  };
  const delActivityFromSidebar = async (p, e) => {
    e.stopPropagation();
    if (!confirm(`فعالیت «${p.title}» حذف شود؟`)) return;
    await api.delProject(p.id);
    if (view.name === "project" && String(view.id) === String(p.id)) go(viewForMode(mode));
    loadProjects(); loadTemplates();
  };

  if (!user) return <Login onLogin={setUser} />;
  if (!settings) return <div className="app loading">در حال بارگذاری…</div>;
  const theme = settings.theme === "light" ? "light" : "dark";

  return (
    <div className="app">
      <header className="topbar">
        <div className="topbar-right">
          <button className="icon-btn" onClick={() => setSidebar(true)} title="منو"><Menu size={18} /></button>
          <button className="brand" onClick={() => go(viewForMode(mode))}>
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
          {/* templates / labels — each template's own activities nest right under it */}
          <div className="sb-section">
            <div className="sb-section-t">تمپلیت‌ها (هسته‌ها)</div>
            {templates.length === 0 && <p className="sb-empty">تمپلیتی تعریف نشده.</p>}
            {templates.map((t) => {
              const tplActs = allProjects.filter((p) => String(p.template_id || "") === String(t.id));
              const open = !!expandedTpl[t.id];
              return (
                <div key={t.id} className="sb-tpl-group">
                  <div className={`sb-item sb-tpl-row ${mode.type === "template" && mode.id === t.id ? "active" : ""}`}>
                    <button className="sb-tpl-chevron" onClick={() => setExpandedTpl((e) => ({ ...e, [t.id]: !open }))}
                      title={open ? "بستن فعالیت‌ها" : "نمایش فعالیت‌ها"}>
                      <ChevronDown size={13} className={`sb-chevron ${open ? "open" : ""}`} />
                    </button>
                    <button className="sb-tpl-main" onClick={() => pickTemplate(t)}>
                      <Layers size={16} className="sb-ic" />
                      <span className="sb-title">{t.label}</span>
                      <span className="sb-badge">{t.count ?? 0}</span>
                    </button>
                    <span className="sb-star" title="آثار شاخص این تمپلیت"
                      onClick={(e) => { e.stopPropagation(); setSidebar(false); go({ name: "featured", tid: t.id, label: t.label }); }}>
                      <Star size={13} />
                    </span>
                    {admin && (
                      <button className="sb-del" title="حذف تمپلیت" onClick={(e) => delTemplateFromSidebar(t, e)}>
                        <Trash2 size={13} />
                      </button>
                    )}
                  </div>
                  {open && (
                    <div className="sb-tpl-nested">
                      {tplActs.length === 0 && <p className="sb-empty sm">فعالیتی ثبت نشده.</p>}
                      {tplActs.map((p) => (
                        <div key={p.id} className="sb-item nested sb-row-with-del">
                          <button className="sb-row-main" onClick={() => openActivity(p)}>
                            <Circle size={8} className="sb-dot" />
                            <span className="sb-title">{p.title}</span>
                            <span className="sb-date">{p.start_date ? formatJalaliMonth(p.start_date) : "—"}</span>
                          </button>
                          {admin && (
                            <button className="sb-del" title="حذف فعالیت" onClick={(e) => delActivityFromSidebar(p, e)}>
                              <Trash2 size={12} />
                            </button>
                          )}
                        </div>
                      ))}
                      {admin && (
                        <button className="sb-item nested sb-new" onClick={() => newActivityInTemplate(t)}>
                          <Plus size={14} className="sb-ic" />
                          <span className="sb-title">+ فعالیت جدید در این تمپلیت</span>
                        </button>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            {admin && (
              <button className={`sb-item sb-new ${homeTool === "template" ? "active" : ""}`}
                onClick={() => openTool("template")}>
                <FolderPlus size={16} className="sb-ic" />
                <span className="sb-title">+ تمپلیت جدید / ویرایش</span>
              </button>
            )}
          </div>

          {/* activities without a template (date-mode) — list + "new activity" live together */}
          <div className="sb-section">
            <button className="sb-section-t collapsible" onClick={() => setActOpen((v) => !v)}>
              <ChevronDown size={14} className={`sb-chevron ${actOpen ? "open" : ""}`} />
              فعالیت‌های بدون تمپلیت
              <span className="sb-count">{allProjects.filter((p) => !p.template_id).length}</span>
            </button>
            {actOpen && (
              <>
                {allProjects.filter((p) => !p.template_id).length === 0 && <p className="sb-empty">فعالیتی ثبت نشده.</p>}
                {allProjects.filter((p) => !p.template_id).map((p) => (
                  <div key={p.id} className="sb-item sb-row-with-del">
                    <button className="sb-row-main" onClick={() => openActivity(p)}>
                      <Circle size={9} className="sb-dot" />
                      <span className="sb-title">{p.title}</span>
                      <span className="sb-date">{p.start_date ? formatJalaliMonth(p.start_date) : "—"}</span>
                    </button>
                    {admin && (
                      <button className="sb-del" title="حذف فعالیت" onClick={(e) => delActivityFromSidebar(p, e)}>
                        <Trash2 size={12} />
                      </button>
                    )}
                  </div>
                ))}
                {admin && (
                  <button className={`sb-item sb-new ${homeTool === "define" && mode.type !== "template" ? "active" : ""}`}
                    onClick={newActivityUntemplated}>
                    <Plus size={16} className="sb-ic" />
                    <span className="sb-title">+ فعالیت جدید</span>
                  </button>
                )}
              </>
            )}
          </div>

          {/* view modes */}
          <div className="sb-section">
            <div className="sb-section-t">نمایش</div>
            <button className={`sb-item ${mode.type === "date" ? "active" : ""}`} onClick={pickDateMode}>
              <CalendarRange size={16} className="sb-ic" />
              <span className="sb-title">حالت تاریخ (بازهٔ زمانی)</span>
            </button>
          </div>

          {/* admin — فقط برای کاربری که با حساب مدیریت وارد شده نمایش داده می‌شود */}
          {isAdminUser && (
            <div className="sb-section sb-admin">
              <div className="sb-section-t">مدیریت</div>
              <button className={`sb-item toggle ${admin ? "on" : ""}`} onClick={toggleAdminView}>
                <Settings size={16} className="sb-ic" />
                <span className="sb-title">حالت مدیریت</span>
                <span className={`sb-switch ${admin ? "on" : ""}`}><span /></span>
              </button>
              {admin && (
                <button className="sb-item" onClick={() => openTool("settings")}>
                  <SlidersHorizontal size={16} className="sb-ic" /><span className="sb-title">تنظیمات نمایش</span>
                </button>
              )}
              {admin && (
                <button className="sb-item" onClick={() => openTool("users")}>
                  <Users size={16} className="sb-ic" /><span className="sb-title">مدیریت کاربران و دسترسی‌ها</span>
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
        key={view.name + ":" + (view.id || "") + ":" + (view.workId || "") + ":" + (view.tid || "")}
        onReset={() => go(viewForMode(mode))}
      >
        {view.name === "home" && (
          <Home
            settings={settings} updateSetting={updateSetting} admin={admin}
            mode={mode} setMode={setMode}
            templates={templates} reloadTemplates={loadTemplates}
            homeTool={homeTool} setHomeTool={setHomeTool}
            openProject={(id) => go({ name: "project", id })}
            openSidebar={() => setSidebar(true)}
            onProjectsChanged={() => { loadProjects(); loadTemplates(); }}
          />
        )}

        {view.name === "project" && (
          <ProjectPage
            projectId={view.id} admin={admin}
            initialQuery={view.q || ""}
            types={types} platforms={platforms} reloadMeta={loadMeta}
            templates={templates}
            goHome={() => go(viewForMode(mode))}
            openWork={(workId) => go({ name: "work", id: view.id, workId })}
            onProjectChanged={() => { loadProjects(); loadTemplates(); }}
            onProjectLoaded={(p) => {
              // keep "mode" (which template we're conceptually inside) in sync with
              // whatever activity is actually being viewed — landing directly on a
              // project link/refresh never carries this info in the URL otherwise,
              // which is what made "back" drop people on a blank/template-less page.
              if (p.template_id) {
                const t = templates.find((x) => String(x.id) === String(p.template_id));
                setMode({ type: "template", id: p.template_id, label: t?.label || "" });
              } else {
                setMode({ type: "date" });
              }
            }}
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

        {view.name === "featured" && (
          <FeaturedWorks
            templateId={view.tid} templateLabel={view.label}
            goBack={() => go(viewForMode({ type: "template", id: view.tid, label: view.label }))}
            openWork={(projectId, workId) => go({ name: "work", id: projectId, workId })}
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
