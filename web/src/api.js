const j = (r) => r.json();
const send = (m) => (url, body) =>
  fetch(url, { method: m, headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) }).then(j);

export const api = {
  settings: () => fetch("/api/settings").then(j),
  saveSettings: (obj) => send("PUT")("/api/settings", obj),

  types: () => fetch("/api/types").then(j),
  addType: (t) => send("POST")("/api/types", t),
  delType: (id) => fetch("/api/types/" + id, { method: "DELETE" }).then(j),

  platforms: () => fetch("/api/platforms").then(j),
  addPlatform: (label) => send("POST")("/api/platforms", { label }),
  delPlatform: (id) => fetch("/api/platforms/" + id, { method: "DELETE" }).then(j),

  keywords: (prefix) => fetch("/api/keywords?prefix=" + encodeURIComponent(prefix)).then(j),
  fieldValues: (field) => fetch("/api/field-values?field=" + encodeURIComponent(field)).then(j),

  templates: () => fetch("/api/templates").then(j),
  addTemplate: (t) => send("POST")("/api/templates", t),
  updateTemplate: (id, t) => send("PUT")("/api/templates/" + id, t),
  delTemplate: (id) => fetch("/api/templates/" + id, { method: "DELETE" }).then(j),

  projects: (opts = {}) => {
    const qs = new URLSearchParams();
    if (opts.templateId) qs.set("templateId", opts.templateId);
    else if (opts.from && opts.to) { qs.set("from", opts.from); qs.set("to", opts.to); }
    const s = qs.toString();
    return fetch("/api/projects" + (s ? "?" + s : "")).then(j);
  },
  allProjects: () => fetch("/api/projects/all").then(j),
  project: (id) => fetch("/api/projects/" + id).then(j),
  addProject: (p) => send("POST")("/api/projects", p),
  updateProject: (id, p) => send("PUT")("/api/projects/" + id, p),
  delProject: (id) => fetch("/api/projects/" + id, { method: "DELETE" }).then(j),
  saveStats: (id, stats) => send("PUT")(`/api/projects/${id}/stats`, { stats }),

  works: (params) => {
    const qs = new URLSearchParams(params).toString();
    return fetch("/api/works?" + qs).then(j);
  },
  work: (id) => fetch("/api/works/" + id).then(j),
  addWork: (w) => send("POST")("/api/works", w),
  updateWork: (id, w) => send("PUT")("/api/works/" + id, w),
  delWork: (id) => fetch("/api/works/" + id, { method: "DELETE" }).then(j),
  similar: (id) => fetch(`/api/works/${id}/similar`).then(j),

  upload: (file) => {
    const fd = new FormData();
    fd.append("file", file);
    return fetch("/api/upload", { method: "POST", body: fd }).then(j);
  },
};
