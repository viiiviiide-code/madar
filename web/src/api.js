const TOKEN_KEY = "madar_token";
const USER_KEY = "madar_user";

export const auth = {
  getToken: () => localStorage.getItem(TOKEN_KEY),
  getUser: () => {
    try { return JSON.parse(localStorage.getItem(USER_KEY) || "null"); }
    catch { return null; }
  },
  setSession: (token, user) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  },
  clearSession: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(USER_KEY);
  },
};

// وقتی توکن نامعتبر/منقضی باشد (۴۰۱)، سراسر اپ باید به صفحهٔ ورود برگردد.
let onUnauthorized = () => {};
export const setUnauthorizedHandler = (fn) => { onUnauthorized = fn || (() => {}); };

function authHeaders() {
  const t = auth.getToken();
  return t ? { Authorization: "Bearer " + t } : {};
}

async function handle(r) {
  if (r.status === 401) {
    auth.clearSession();
    onUnauthorized();
    throw new Error("ورود لازم است");
  }
  let data;
  try { data = await r.json(); } catch { data = null; }
  if (!r.ok) throw new Error((data && data.error) || "خطا در ارتباط با سرور");
  return data;
}

const j = (r) => handle(r);
const send = (m) => (url, body) =>
  fetch(url, {
    method: m,
    headers: { "Content-Type": "application/json", ...authHeaders() },
    body: JSON.stringify(body),
  }).then(j);
const get = (url) => fetch(url, { headers: { ...authHeaders() } }).then(j);
const del = (url) => fetch(url, { method: "DELETE", headers: { ...authHeaders() } }).then(j);

export const api = {
  login: (username, password) =>
    fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username, password }),
    }).then(j),
  me: () => get("/api/me"),
  changePassword: (currentPassword, newPassword) =>
    send("PUT")("/api/account/password", { currentPassword, newPassword }),

  settings: () => get("/api/settings"),
  saveSettings: (obj) => send("PUT")("/api/settings", obj),

  types: () => get("/api/types"),
  addType: (t) => send("POST")("/api/types", t),
  delType: (id) => del("/api/types/" + id),

  platforms: () => get("/api/platforms"),
  addPlatform: (label) => send("POST")("/api/platforms", { label }),
  delPlatform: (id) => del("/api/platforms/" + id),

  keywords: (prefix) => get("/api/keywords?prefix=" + encodeURIComponent(prefix)),
  fieldValues: (field) => get("/api/field-values?field=" + encodeURIComponent(field)),

  templates: () => get("/api/templates"),
  addTemplate: (t) => send("POST")("/api/templates", t),
  updateTemplate: (id, t) => send("PUT")("/api/templates/" + id, t),
  delTemplate: (id) => del("/api/templates/" + id),

  projects: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.templateId) qs.set("templateId", opts.templateId);
    else if (opts.from && opts.to) { qs.set("from", opts.from); qs.set("to", opts.to); }
    const s = qs.toString();
    return get("/api/projects" + (s ? "?" + s : ""));
  },
  allProjects: () => get("/api/projects/all"),
  project: (id) => get("/api/projects/" + id),
  addProject: (p) => send("POST")("/api/projects", p),
  updateProject: (id, p) => send("PUT")("/api/projects/" + id, p),
  delProject: (id) => del("/api/projects/" + id),
  saveStats: (id, stats) => send("PUT")(`/api/projects/${id}/stats`, { stats }),

  works: (params) => {
    const qs = new URLSearchParams(params).toString();
    return get("/api/works?" + qs);
  },
  work: (id) => get("/api/works/" + id),
  addWork: (w) => send("POST")("/api/works", w),
  updateWork: (id, w) => send("PUT")("/api/works/" + id, w),
  delWork: (id) => del("/api/works/" + id),
  similar: (id) => get(`/api/works/${id}/similar`),

  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/upload", { method: "POST", headers: { ...authHeaders() }, body: fd }).then(j);
  },
};
