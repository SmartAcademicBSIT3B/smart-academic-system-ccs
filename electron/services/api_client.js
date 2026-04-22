/**
 * api_client.js
 *
 * Thin HTTP wrapper used by electron/main.js IPC handlers to call the
 * backend REST API instead of touching the database / cloud services directly.
 *
 * Usage:
 *   const api = require("./api_client");
 *   api.setToken(jwt);
 *   const result = await api.get("/meta/departments");
 *   const result = await api.post("/auth/login", { email, password });
 *   const result = await api.postForm("/upload/profile-image", formData);
 */

const { Blob } = require("node:buffer");

const FormDataImpl = globalThis.FormData;

// ── Config ────────────────────────────────────────────────────────────────────
let BASE_URL = (
  process.env.BACKEND_URL ||
  "https://smart-academic-system-ccs.onrender.com"
).replace(
  /\/$/,
  "",
);
let authToken = null;
let departmentCode = "CCS";

function setBaseUrl(url) {
  BASE_URL = String(url || "").replace(/\/$/, "");
}

function getBaseUrl() {
  return BASE_URL;
}

function setToken(token) {
  authToken = token || null;
}

function clearToken() {
  authToken = null;
}

function setDepartmentCode(code) {
  departmentCode = String(code || "CCS").trim() || "CCS";
}

// ── Core request ──────────────────────────────────────────────────────────────
async function request(method, path, body = null, extraHeaders = {}) {
  const url = `${BASE_URL}/api${path}`;

  const headers = {
    "x-department": departmentCode,
    ...extraHeaders,
  };

  if (authToken) {
    headers["Authorization"] = `Bearer ${authToken}`;
  }

  let bodyStr = null;
  if (body !== null && !(body instanceof FormData)) {
    headers["Content-Type"] = "application/json";
    bodyStr = JSON.stringify(body);
  }

  const response = await fetch(url, {
    method,
    headers,
    body: body instanceof FormData ? body : bodyStr,
  });

  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    // Non-JSON (e.g. file download) — callers handle separately.
    return response;
  }

  let data;
  try {
    data = await response.json();
  } catch (_err) {
    return { success: false, message: `HTTP ${response.status}` };
  }

  return data;
}

function get(path) {
  return request("GET", path);
}

function post(path, body) {
  return request("POST", path, body);
}

function patch(path, body) {
  return request("PATCH", path, body);
}

function del(path) {
  return request("DELETE", path);
}

/**
 * Uploads a file buffer to the backend.
 * @param {string} path  - API path, e.g. "/upload/profile-image"
 * @param {Buffer} buffer
 * @param {string} fileName
 * @param {string} mimeType
 * @param {Object} fields  - Extra form fields, e.g. { userId, partnerId }
 */
async function postFile(path, buffer, fileName, mimeType, fields = {}) {
  if (typeof FormDataImpl !== "function") {
    return {
      success: false,
      message: "FormData is unavailable in this runtime.",
    };
  }

  const form = new FormDataImpl();
  form.append("file", new Blob([buffer], { type: mimeType }), fileName);
  for (const [key, value] of Object.entries(fields)) {
    form.append(key, String(value));
  }
  return request("POST", path, form);
}

/**
 * Downloads a file from the backend and returns the raw ArrayBuffer.
 * Used for Google Drive proxy downloads.
 */
async function downloadFile(fileUrl) {
  const url = `${BASE_URL}/api/gdrive/download?fileUrl=${encodeURIComponent(fileUrl)}`;
  const headers = { "x-department": departmentCode };
  if (authToken) headers["Authorization"] = `Bearer ${authToken}`;

  const response = await fetch(url, { method: "GET", headers });
  if (!response.ok) {
    let msg = `HTTP ${response.status}`;
    try {
      const json = await response.json();
      msg = json?.message || msg;
    } catch (_) {}
    throw Object.assign(new Error(msg), {
      requiresAuth: response.status === 403,
    });
  }

  const contentDisposition = response.headers.get("content-disposition") || "";
  const nameMatch = contentDisposition.match(/filename[^;=\n]*=([^;\n]*)/i);
  const fileName = nameMatch
    ? decodeURIComponent(nameMatch[1].replace(/['"]/g, "").trim())
    : "archive.pdf";

  const arrayBuffer = await response.arrayBuffer();
  return { buffer: Buffer.from(arrayBuffer), fileName };
}

module.exports = {
  setBaseUrl,
  getBaseUrl,
  setToken,
  clearToken,
  setDepartmentCode,
  get,
  post,
  patch,
  del,
  postFile,
  downloadFile,
};
