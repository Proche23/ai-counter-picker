"use strict";
/* The engine of the in-browser version: Python compiled to WebAssembly (Pyodide) running the same
   Python code as the local site, on a snapshot of its statistics (engine/snapshot.bin, made by
   build_web.py). web-shim.js sends it the page's /api/... requests. */
const PYODIDE = "https://cdn.jsdelivr.net/pyodide/v0.27.7/full/";
importScripts(PYODIDE + "pyodide.js");

const V = new URL(self.location.href).searchParams.get("v") || "";   // this build's stamp (see web-shim.js)
const say = (progress) => postMessage({ progress });
let py = null, handle = null;

async function bytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(`${url}: ${r.status}`);
  return new Uint8Array(await r.arrayBuffer());
}

const started = (async () => {
  say("Loading Python…");
  py = await loadPyodide({ indexURL: PYODIDE });
  say("Loading the engine…");
  const [code, snap] = await Promise.all([bytes(`engine/acp.zip?v=${V}`), bytes(`engine/snapshot.bin?v=${V}`)]);
  py.unpackArchive(code, "zip", { extractDir: "/app" });
  py.FS.writeFile("/app/snapshot.bin", snap);
  say("Reading the pro statistics…");
  py.runPython("import sys\nsys.path.insert(0, '/app')\nfrom acp import webapi\nwebapi.load('/app/snapshot.bin')");
  handle = py.globals.get("webapi").handle;
  postMessage({ ready: true });
})().catch((e) => postMessage({ fatal: String((e && e.message) || e).split("\n").slice(-3).join(" ") }));

self.onmessage = async (e) => {
  const { id, method, path, query, body } = e.data || {};
  try {
    await started;
    postMessage({ id, out: handle(method, path, query || "", body || "") });
  } catch (err) {
    postMessage({ id, out: JSON.stringify({ status: 500, body: { error: String((err && err.message) || err) } }) });
  }
};
