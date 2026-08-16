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

  users: () => get("/api/users"),
  addUser: (username, password, role) => send("POST")("/api/users", { username, password, role }),
  updateUser: (id, patch) => send("PUT")("/api/users/" + id, patch),
  delUser: (id) => del("/api/users/" + id),
  userPermissions: (userId) => get(`/api/users/${userId}/permissions`),
  grantPermission: (userId, { template_id, project_id }) =>
    send("POST")(`/api/users/${userId}/permissions`, { template_id, project_id }),
  revokePermission: (userId, permId) => del(`/api/users/${userId}/permissions/${permId}`),

  settings: () => get("/api/settings"),
  saveSettings: (obj) => send("PUT")("/api/settings", obj),

  types: () => get("/api/types"),
  addType: (t) => send("POST")("/api/types", t),
  delType: (id) => del("/api/types/" + id),

  platforms: () => get("/api/platforms"),
  addPlatform: (label, logo_url, type) => send("POST")("/api/platforms", { label, logo_url: logo_url || null, type: type === "tv" ? "tv" : "social" }),
  updatePlatform: (id, patch) => send("PUT")("/api/platforms/" + id, patch),
  delPlatform: (id) => del("/api/platforms/" + id),

  keywords: (prefix) => get("/api/keywords?prefix=" + encodeURIComponent(prefix)),
  fieldValues: (field) => get("/api/field-values?field=" + encodeURIComponent(field)),
  statLabels: (prefix) => get("/api/stat-labels" + (prefix ? "?prefix=" + encodeURIComponent(prefix) : "")),

  templates: () => get("/api/templates"),
  addTemplate: (t) => send("POST")("/api/templates", t),
  updateTemplate: (id, t) => send("PUT")("/api/templates/" + id, t),
  delTemplate: (id) => del("/api/templates/" + id),
  featuredWorks: (templateId) => get("/api/templates/" + templateId + "/featured-works"),
  templateReport: (templateId) => get("/api/templates/" + templateId + "/report"),

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
  duplicateProject: (id, templateId) => send("POST")(`/api/projects/${id}/duplicate`, { template_id: templateId ?? null }),
  saveStats: (id, stats) => send("PUT")(`/api/projects/${id}/stats`, { stats }),

  works: (params) => {
    const qs = new URLSearchParams(params).toString();
    return get("/api/works?" + qs);
  },
  work: (id) => get("/api/works/" + id),
  addWork: (w) => send("POST")("/api/works", w),
  updateWork: (id, w) => send("PUT")("/api/works/" + id, w),
  delWork: (id) => del("/api/works/" + id),
  duplicateWork: (id, projectId, move) => send("POST")(`/api/works/${id}/duplicate`, { project_id: projectId, move: !!move }),
  similar: (id) => get(`/api/works/${id}/similar`),

  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/upload", { method: "POST", headers: { ...authHeaders() }, body: fd }).then(j);
  },
  // XHR-based upload with real progress percentage (fetch doesn't expose upload progress)
  uploadWithProgress: (file, onProgress) =>
    new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      xhr.open("POST", "/api/upload");
      const t = auth.getToken();
      if (t) xhr.setRequestHeader("Authorization", "Bearer " + t);
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.round((e.loaded / e.total) * 100));
      };
      xhr.onload = () => {
        if (xhr.status === 401) { auth.clearSession(); onUnauthorized(); reject(new Error("ورود لازم است")); return; }
        try {
          const data = JSON.parse(xhr.responseText);
          if (xhr.status >= 200 && xhr.status < 300) resolve(data);
          else reject(new Error(data?.error || "خطا در بارگذاری"));
        } catch { reject(new Error("خطا در بارگذاری")); }
      };
      xhr.onerror = () => reject(new Error("خطا در ارتباط با سرور"));
      const fd = new FormData();
      fd.append("file", file);
      xhr.send(fd);
    }),
};
