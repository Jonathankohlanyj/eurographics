// Triangle Ink OBJ Viewer + Converter
// No external libs. Works offline.

"use strict";

const $ = (id) => document.getElementById(id);

const fileInput = $("fileInput");
const dropzone = $("dropzone");
const triLimitEl = $("triLimit");
const toggleColorsEl = $("toggleColors");
const toggleCullEl = $("toggleCull");
const toggleAutoEl = $("toggleAuto");
const fovEl = $("fov");

const statVerts = $("statVerts");
const statTris = $("statTris");
const statColors = $("statColors");

const btnExport = $("btnExport");
const btnCopy = $("btnCopy");
const btnDownload = $("btnDownload");
const exportOut = $("exportOut");

// Scene inserter (separate output)
const meshIdEl = $("meshId");
const insBackcullEl = $("insBackcull");
const btnExportIns = $("btnExportIns");
const btnCopyIns = $("btnCopyIns");
const btnDownloadIns = $("btnDownloadIns");
const exportIns = $("exportIns");

const canvas = $("canvas");
const overlay = $("overlay");
const ctx = canvas.getContext("2d");

const palette = [
  "#f2f2f2", "#ffd166", "#06d6a0", "#118ab2", "#ef476f",
  "#8338ec", "#3a86ff", "#ff006e", "#fb5607"
];

// Eurographics ink palette indices.
// Safe default ramp. Replace if you want a different canonical palette mapping.
const inkPalette = [
  44, 43, 42, 41, 40, 39, 38, 37,
  38, 39, 40, 41, 42, 43
];

function clamp(x, a, b) { return Math.max(a, Math.min(b, x)); }
function fmt6(x) { return (Math.round(x * 1e6) / 1e6).toFixed(6); }

// Basic vec3
function v3(x=0,y=0,z=0){ return {x,y,z}; }
function add(a,b){ return v3(a.x+b.x, a.y+b.y, a.z+b.z); }
function sub(a,b){ return v3(a.x-b.x, a.y-b.y, a.z-b.z); }
function mul(a,s){ return v3(a.x*s, a.y*s, a.z*s); }
function dot(a,b){ return a.x*b.x + a.y*b.y + a.z*b.z; }
function cross(a,b){
  return v3(
    a.y*b.z - a.z*b.y,
    a.z*b.x - a.x*b.z,
    a.x*b.y - a.y*b.x
  );
}

function rotX(p, a){
  const s=Math.sin(a), c=Math.cos(a);
  return v3(p.x, p.y*c - p.z*s, p.y*s + p.z*c);
}
function rotY(p, a){
  const s=Math.sin(a), c=Math.cos(a);
  return v3(p.x*c + p.z*s, p.y, -p.x*s + p.z*c);
}

// OBJ parsing
function parseOBJ(text){
  const verts = []; // array of {x,y,z}
  const tris = [];  // array of [a,b,c] 1-based

  const lines = text.split(/\r?\n/);
  for (let raw of lines){
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;

    if (line.startsWith("v ")){
      const parts = line.split(/\s+/);
      if (parts.length >= 4){
        const x = Number(parts[1]), y = Number(parts[2]), z = Number(parts[3]);
        if (Number.isFinite(x) && Number.isFinite(y) && Number.isFinite(z)){
          verts.push(v3(x,y,z));
        }
      }
      continue;
    }

    if (line.startsWith("f ")){
      const parts = line.split(/\s+/).slice(1);
      const idx = [];
      for (const p of parts){
        const vStr = p.split("/")[0];
        if (!vStr) continue;
        let vi = parseInt(vStr, 10);
        if (!Number.isFinite(vi)) continue;
        // negative indices are relative to end
        if (vi < 0) vi = verts.length + 1 + vi;
        idx.push(vi);
      }
      if (idx.length >= 3){
        // fan triangulation
        const a = idx[0];
        for (let i=1; i<idx.length-1; i++){
          tris.push([a, idx[i], idx[i+1]]);
        }
      }
    }
  }

  return { verts, tris };
}

// Truncate tris and optionally reindex vertices
function limitAndReindex(mesh, triLimit){
  const tris = mesh.tris.slice(0, triLimit);
  const used = new Map(); // oldIndex -> newIndex
  const newVerts = [];
  let next = 1;

  for (const t of tris){
    for (let k=0; k<3; k++){
      const oi = t[k];
      if (!used.has(oi)){
        used.set(oi, next++);
        newVerts.push(mesh.verts[oi-1]);
      }
    }
  }

  const newTris = tris.map(t => [used.get(t[0]), used.get(t[1]), used.get(t[2])]);
  return { verts: newVerts, tris: newTris };
}

function exportVF(mesh){
  const out = [];
  out.push("[[");
  for (const p of mesh.verts){
    out.push(`v ${fmt6(p.x)} ${fmt6(p.y)} ${fmt6(p.z)}`);
  }
  for (const t of mesh.tris){
    out.push(`f ${t[0]} ${t[1]} ${t[2]}`);
  }
  out.push("]]");
  return out.join("\n");
}

function buildInserter(mesh){
  const meshId = clamp(parseInt(meshIdEl.value || "7", 10), 1, 999);
  const backcull = !!insBackcullEl.checked;

  const cols = new Array(mesh.tris.length);
  const n = inkPalette.length || 1;
  for (let i = 0; i < cols.length; i++) cols[i] = inkPalette[i % n];

  // One-line color array (your engine expects this exact style)
  const colorLine = "{ " + cols.join(", ") + " }";

  const lines = [];
  lines.push(`local mesh = instance.new("mesh")`);
  lines.push(`mesh.meshID = ${meshId}`);
  lines.push(`mesh.backcull = ${backcull ? "true" : "false"}`);
  lines.push(`mesh.color = ${colorLine}`);
  lines.push(`setPosition3(mesh,{0,0,0})`);
  lines.push(`setSize3(mesh,{1,1,1})`);
  return lines.join("\n");
}

// Rendering state
let mesh = { verts: [], tris: [] };
let modelRot = { yaw: 0, pitch: 0 };
let autoRot = 0;

let cam = {
  pos: v3(0, 0, 4.0), // camera is at +Z looking toward origin along -Z
  speed: 2.0
};

let dragging = false;
let lastMouse = { x: 0, y: 0 };

function setStats(){
  statVerts.textContent = mesh.verts.length.toString();
  statTris.textContent = mesh.tris.length.toString();
  statColors.textContent = toggleColorsEl.checked ? "On" : "Off";
}

function fitToView(){
  // set camera distance based on model bounds
  if (mesh.verts.length === 0) return;
  let minx=Infinity, miny=Infinity, minz=Infinity;
  let maxx=-Infinity, maxy=-Infinity, maxz=-Infinity;
  for (const p of mesh.verts){
    minx = Math.min(minx, p.x); miny = Math.min(miny, p.y); minz = Math.min(minz, p.z);
    maxx = Math.max(maxx, p.x); maxy = Math.max(maxy, p.y); maxz = Math.max(maxz, p.z);
  }
  const dx = maxx-minx, dy = maxy-miny, dz = maxz-minz;
  const r = Math.max(dx,dy,dz) * 0.6 + 1e-6;

  cam.pos = v3(0, 0, r * 2.2);
  modelRot.yaw = 0;
  modelRot.pitch = 0;
  autoRot = 0;
}

function resetView(){
  fitToView();
}

function onMeshLoaded(newMesh){
  mesh = newMesh;
  setStats();
  resetView();
  exportOut.value = ""; // clear until user exports
}

async function loadOBJFile(file){
  const text = await file.text();
  const parsed = parseOBJ(text);

  const limit = clamp(parseInt(triLimitEl.value || "600", 10), 50, 50000);
  const limited = limitAndReindex(parsed, limit);

  onMeshLoaded(limited);
}

function handleFiles(files){
  if (!files || files.length === 0) return;
  const file = files[0];
  loadOBJFile(file).catch(err => {
    console.error(err);
    alert("Failed to load OBJ: " + err.message);
  });
}

// Input wiring
fileInput.addEventListener("change", (e) => handleFiles(e.target.files));

dropzone.addEventListener("click", () => fileInput.click());
dropzone.addEventListener("keydown", (e) => {
  if (e.key === "Enter" || e.key === " ") fileInput.click();
});

dropzone.addEventListener("dragover", (e) => {
  e.preventDefault();
  dropzone.classList.add("dragover");
});
dropzone.addEventListener("dragleave", () => dropzone.classList.remove("dragover"));
dropzone.addEventListener("drop", (e) => {
  e.preventDefault();
  dropzone.classList.remove("dragover");
  const dt = e.dataTransfer;
  if (dt && dt.files) handleFiles(dt.files);
});

triLimitEl.addEventListener("change", () => {
  // Re-limit current mesh by re-parsing would be more accurate; for now, user should re-load.
  // We keep it simple: this is mainly for new loads.
});

toggleColorsEl.addEventListener("change", setStats);
toggleAutoEl.addEventListener("change", () => {});
toggleCullEl.addEventListener("change", () => {});
fovEl.addEventListener("change", () => {});

btnExport.addEventListener("click", () => {
  exportOut.value = exportVF(mesh);
});

btnCopy.addEventListener("click", async () => {
  const txt = exportOut.value || exportVF(mesh);
  exportOut.value = txt;
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    exportOut.select();
    document.execCommand("copy");
  }
});

btnDownload.addEventListener("click", () => {
  const txt = exportOut.value || exportVF(mesh);
  exportOut.value = txt;
  const blob = new Blob([txt], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "mesh_vf_export.txt";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 50);
});

// Scene inserter (separate output)
btnExportIns.addEventListener("click", () => {
  exportIns.value = buildInserter(mesh);
});

btnCopyIns.addEventListener("click", async () => {
  const txt = exportIns.value || buildInserter(mesh);
  exportIns.value = txt;
  try {
    await navigator.clipboard.writeText(txt);
  } catch {
    exportIns.select();
    document.execCommand("copy");
  }
});

btnDownloadIns.addEventListener("click", () => {
  const txt = exportIns.value || buildInserter(mesh);
  exportIns.value = txt;
  const blob = new Blob([txt], { type: "text/plain" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "scene_inserter.txt";
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 50);
});

// Canvas resize for HiDPI
function resizeCanvas(){
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  const w = Math.max(1, Math.floor(rect.width * dpr));
  const h = Math.max(1, Math.floor(rect.height * dpr));
  if (canvas.width !== w || canvas.height !== h){
    canvas.width = w;
    canvas.height = h;
  }
}
window.addEventListener("resize", resizeCanvas);

// Mouse interaction
canvas.addEventListener("mousedown", (e) => {
  dragging = true;
  lastMouse.x = e.clientX;
  lastMouse.y = e.clientY;
});
window.addEventListener("mouseup", () => dragging = false);
window.addEventListener("mousemove", (e) => {
  if (!dragging) return;
  const dx = e.clientX - lastMouse.x;
  const dy = e.clientY - lastMouse.y;
  lastMouse.x = e.clientX;
  lastMouse.y = e.clientY;

  modelRot.yaw += dx * 0.01;
  modelRot.pitch += dy * 0.01;
  modelRot.pitch = clamp(modelRot.pitch, -Math.PI*0.49, Math.PI*0.49);
});

canvas.addEventListener("wheel", (e) => {
  e.preventDefault();
  const delta = Math.sign(e.deltaY);
  cam.pos.z *= (delta > 0) ? 1.08 : 0.92;
  cam.pos.z = clamp(cam.pos.z, 0.2, 5000);
}, { passive: false });

// Keyboard movement
const keys = new Set();
window.addEventListener("keydown", (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === "r") resetView();
});
window.addEventListener("keyup", (e) => keys.delete(e.key.toLowerCase()));

function updateCamera(dt){
  const s = cam.speed * dt;
  let dx = 0, dy = 0, dz = 0;

  const up = keys.has("q");
  const down = keys.has("e");

  const w = keys.has("w") || keys.has("arrowup");
  const a = keys.has("a") || keys.has("arrowleft");
  const sKey = keys.has("s") || keys.has("arrowdown");
  const d = keys.has("d") || keys.has("arrowright");

  if (w) dz -= s;
  if (sKey) dz += s;
  if (a) dx -= s;
  if (d) dx += s;
  if (up) dy += s;
  if (down) dy -= s;

  cam.pos.x += dx;
  cam.pos.y += dy;
  cam.pos.z += dz;
}

// Software pipeline
function project(p, fovDeg, aspect, near){
  // camera looks down -Z, so we want points with z < -near in camera space
  const fov = (fovDeg * Math.PI) / 180;
  const t = Math.tan(fov * 0.5);
  const z = -p.z; // convert to positive forward
  if (z <= near) return null;

  const xN = (p.x / (z * t * aspect));
  const yN = (p.y / (z * t));

  return { xN, yN, z };
}

function draw(){
  resizeCanvas();
  const W = canvas.width, H = canvas.height;
  ctx.clearRect(0, 0, W, H);

  const dpr = window.devicePixelRatio || 1;
  const sw = W, sh = H;

  // UI overlay
  overlay.textContent =
    `TriInk: ${mesh.tris.length} tris | ${mesh.verts.length} verts\n` +
    `Colors: ${toggleColorsEl.checked ? "On" : "Off"} | Cull: ${toggleCullEl.checked ? "On" : "Off"}\n` +
    `Drag to rotate. Wheel zoom. WASD move.`;

  if (mesh.tris.length === 0) {
    // draw a little hint
    ctx.save();
    ctx.fillStyle = "rgba(255,255,255,0.08)";
    ctx.font = `${14*dpr}px system-ui, sans-serif`;
    ctx.fillText("Load an OBJ to render it", 16*dpr, 28*dpr);
    ctx.restore();
    return;
  }

  const aspect = (W / H);
  const near = 0.1;
  const fov = clamp(parseFloat(fovEl.value || "75"), 20, 140);

  // model rotation (plus optional auto rotation)
  if (toggleAutoEl.checked) autoRot += 0.6 / 60;
  const yaw = modelRot.yaw + autoRot;
  const pitch = modelRot.pitch;

  // transform vertices into camera space
  const camPos = cam.pos;

  const camSpace = new Array(mesh.verts.length);
  for (let i=0; i<mesh.verts.length; i++){
    // model rotation about origin
    let p = mesh.verts[i];
    p = rotY(p, yaw);
    p = rotX(p, pitch);

    // camera translation (camera looks toward origin along -Z)
    // world to camera: p - camPos
    p = sub(p, camPos);
    camSpace[i] = p;
  }

  // build projected triangles list
  const tris2d = [];
  const colorsEnabled = toggleColorsEl.checked;
  const cull = toggleCullEl.checked;

  for (let ti=0; ti<mesh.tris.length; ti++){
    const t = mesh.tris[ti];
    const a = camSpace[t[0]-1];
    const b = camSpace[t[1]-1];
    const c = camSpace[t[2]-1];

    // near reject (simple)
    if (-a.z <= near || -b.z <= near || -c.z <= near) continue;

    if (cull){
      // backface cull in camera space: normal dot viewDir (0,0,-1)
      const ab = sub(b,a);
      const ac = sub(c,a);
      const n = cross(ab, ac);
      // In this camera convention, front faces typically have n.z < 0
      if (n.z >= 0) continue;
    }

    const pa = project(a, fov, aspect, near);
    const pb = project(b, fov, aspect, near);
    const pc = project(c, fov, aspect, near);
    if (!pa || !pb || !pc) continue;

    // Convert NDC-ish to screen
    const x1 = (pa.xN * 0.5 + 0.5) * sw;
    const y1 = (1 - (pa.yN * 0.5 + 0.5)) * sh;
    const x2 = (pb.xN * 0.5 + 0.5) * sw;
    const y2 = (1 - (pb.yN * 0.5 + 0.5)) * sh;
    const x3 = (pc.xN * 0.5 + 0.5) * sw;
    const y3 = (1 - (pc.yN * 0.5 + 0.5)) * sh;

    const depth = (pa.z + pb.z + pc.z) / 3;

    let col = "#e6e6e6";
    if (colorsEnabled){
      col = palette[ti % palette.length];
    }

    tris2d.push({ x1,y1,x2,y2,x3,y3, depth, col });
  }

  // Painter sort by depth far-to-near
  tris2d.sort((u,v) => v.depth - u.depth);

  // Draw
  ctx.save();
  ctx.lineWidth = 1 * dpr;
  ctx.globalAlpha = 0.95;

  for (const tri of tris2d){
    ctx.beginPath();
    ctx.moveTo(tri.x1, tri.y1);
    ctx.lineTo(tri.x2, tri.y2);
    ctx.lineTo(tri.x3, tri.y3);
    ctx.closePath();

    ctx.fillStyle = tri.col;
    ctx.fill();

    // subtle wireframe
    ctx.strokeStyle = "rgba(0,0,0,0.18)";
    ctx.stroke();
  }

  ctx.restore();
}

// Main loop
let lastT = performance.now();
function tick(t){
  const dt = Math.min(0.05, (t - lastT) / 1000);
  lastT = t;

  updateCamera(dt);
  draw();

  requestAnimationFrame(tick);
}
requestAnimationFrame(tick);

// Small built-in demo mesh if user loads nothing: a tetra
(function bootstrapDemo(){
  const demo = {
    verts: [v3(0,1,0), v3(-1,-1,1), v3(1,-1,1), v3(0,-1,-1)],
    tris: [[1,2,3],[1,3,4],[1,4,2],[2,4,3]]
  };
  const limit = clamp(parseInt(triLimitEl.value || "600", 10), 50, 50000);
  onMeshLoaded(limitAndReindex(demo, limit));
})();
