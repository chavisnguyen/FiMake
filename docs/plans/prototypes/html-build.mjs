// Rebuild extract.json (DOM geometry of sun-asterisk.us @1440) as absolute-positioned Figma nodes.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";

const DIR = process.argv[2];
const ORIGIN_X = Number(process.argv[3] ?? 5000);
const data = JSON.parse(fs.readFileSync(path.join(DIR, "extract.json"), "utf-8"));
const url = "http://localhost:10101/mcp";
const H = { "Content-Type": "application/json", Accept: "application/json, text/event-stream" };
const post = async (body, sid) => fetch(url, { method: "POST", headers: { ...H, ...(sid ? { "mcp-session-id": sid } : {}) }, body: JSON.stringify(body) });
const init = await post({ jsonrpc: "2.0", id: 1, method: "initialize", params: { protocolVersion: "2024-11-05", capabilities: {}, clientInfo: { name: "sun", version: "0" } } });
const sid = init.headers.get("mcp-session-id"); await init.text();
await (await post({ jsonrpc: "2.0", method: "notifications/initialized" }, sid)).text();

let rpc = 10, calls = 0;
const failures = [];
async function call(tool, args, { fatal = true } = {}) {
  calls++;
  const t = await (await post({ jsonrpc: "2.0", id: rpc++, method: "tools/call", params: { name: tool, arguments: args } }, sid)).text();
  const line = t.split("\n").find((l) => l.startsWith("data: "));
  const r = JSON.parse(line.slice(6)).result;
  let c; try { c = JSON.parse(r.content[0].text); } catch { c = r.content[0].text; }
  if (r.isError) {
    if (fatal) { console.error(`FAILED ${tool}:`, JSON.stringify(c).slice(0, 1200)); process.exit(1); }
    failures.push({ tool, args: JSON.stringify(args).slice(0, 160), error: JSON.stringify(c).slice(0, 200) });
  }
  return { ok: !r.isError, content: c };
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- CSS value parsing ----------
const hex2 = (v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0").toUpperCase();
function cssColor(s) {
  const m = s && s.match(/rgba?\(([^)]+)\)/);
  if (!m) return null;
  const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
  const a = p.length > 3 ? p[3] : 1;
  return `#${hex2(p[0])}${hex2(p[1])}${hex2(p[2])}${hex2(a * 255)}`;
}
const withOp = (hex, op = 1) => {
  if (!hex || op >= 0.999) return hex;
  return hex.slice(0, 7) + hex2(parseInt(hex.slice(7, 9), 16) * op);
};
function splitTop(s) {
  const out = []; let depth = 0, cur = "";
  for (const ch of s) {
    if (ch === "(") depth++;
    if (ch === ")") depth--;
    if (ch === "," && depth === 0) { out.push(cur.trim()); cur = ""; } else cur += ch;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
function parseGradient(bgImg) {
  const m = bgImg.match(/^(linear|radial)-gradient\((.*)\)$/s);
  if (!m) return null;
  const parts = splitTop(m[2]);
  let angle = 180;
  const dirs = { "to top": 0, "to right": 90, "to bottom": 180, "to left": 270, "to bottom right": 135, "to top right": 45, "to bottom left": 225, "to top left": 315 };
  if (m[1] === "linear") {
    if (/deg$/.test(parts[0])) { angle = parseFloat(parts.shift()); }
    else if (dirs[parts[0]] !== undefined) { angle = dirs[parts.shift()]; }
  } else if (!/rgb/.test(parts[0])) parts.shift();
  const stops = parts.map((p, i) => {
    const color = cssColor(p);
    const pct = p.match(/\)\s*(-?[\d.]+)%/);
    return color ? { color, position: pct ? Math.min(1, Math.max(0, parseFloat(pct[1]) / 100)) : i / Math.max(1, parts.length - 1) } : null;
  }).filter(Boolean);
  if (stops.length < 2) return null;
  // CSS: 0deg = to top, 90deg = to right. Ours: 0 = left->right, 90 = top->bottom.
  return { type: m[1] === "radial" ? "RADIAL" : "LINEAR", angle: angle - 90, stops: stops.slice(0, 16) };
}
function parseShadows(s) {
  return splitTop(s).slice(0, 4).map((part) => {
    const inset = /\binset\b/.test(part);
    const color = cssColor(part);
    const nums = part.replace(/rgba?\([^)]+\)/, "").replace("inset", "").trim().split(/\s+/).map(parseFloat).filter((v) => !Number.isNaN(v));
    if (!color || nums.length < 2) return null;
    const [x, y, blur = 0, spread = 0] = nums;
    return { type: inset ? "INNER_SHADOW" : "DROP_SHADOW", color, offset: { x, y }, radius: Math.max(0, blur), spread };
  }).filter(Boolean);
}
const STYLE = { 100: "Regular", 200: "Regular", 300: "Regular", 400: "Regular", 500: "Medium", 600: "SemiBold", 700: "Bold", 800: "ExtraBold", 900: "Black" };
const round = (v) => Math.round(v * 100) / 100;

// ---------- build ----------
const t0 = Date.now();
const root = await call("create-frame", { x: ORIGIN_X, y: 0, width: data.width, height: Math.ceil(data.height), name: "Sun* Inc. — sun-asterisk.us · Desktop 1440" });
const rootId = root.content.id;
await call("set-fill-color", { id: rootId, color: cssColor(data.bodyBg) ?? "#FFFFFFFF" });

// Fixed/sticky elements (header) paint above everything that follows them in the DOM.
const items = [...data.items].sort((a, b) =>
  a.top !== b.top ? (a.top ? 1 : -1) : (a.z ?? 0) !== (b.z ?? 0) ? (a.z ?? 0) - (b.z ?? 0) : a.order - b.order);

// Items partially outside an overflow-hidden ancestor go into a clipping frame.
const clipFrames = new Map();
const partial = (it) => it.clip && (it.x < it.clip.x - 0.5 || it.y < it.clip.y - 0.5 || it.x + it.w > it.clip.x + it.clip.w + 0.5 || it.y + it.h > it.clip.y + it.clip.h + 0.5);
async function parentFor(it) {
  if (!partial(it)) return { parentId: rootId, dx: 0, dy: 0 };
  const c = it.clip;
  const key = [c.x, c.y, c.w, c.h].map((v) => Math.round(v)).join(",");
  if (!clipFrames.has(key)) {
    await flush();
    const f = await call("create-frame", { x: round(c.x), y: round(c.y), width: Math.max(1, round(c.w)), height: Math.max(1, round(c.h)), name: "clip", parentId: rootId });
    await call("set-fill-color", { id: f.content.id, color: "#00000000" });
    clipFrames.set(key, f.content.id);
  }
  return { parentId: clipFrames.get(key), dx: c.x, dy: c.y };
}
let ops = [], refN = 0;
async function flush() {
  if (!ops.length) return;
  await call("batch-create", { operations: ops });
  ops = [];
}
async function push(list) {
  if (ops.length + list.length > 50) await flush();
  ops.push(...list);
}
let lastImageAt = 0;
async function imageCall(tool, args) {
  // fetchGuarded allows 20 fetches/min per server process.
  const wait = lastImageAt + 3100 - Date.now();
  if (wait > 0) await sleep(wait);
  lastImageAt = Date.now();
  return call(tool, args, { fatal: false });
}

for (const it of items) {
  const { parentId, dx, dy } = await parentFor(it);
  const op = it.op ?? 1;
  const x = round(it.x - dx), y = round(it.y - dy), w = Math.max(1, round(it.w)), h = Math.max(1, round(it.h));
  if (it.kind === "box") {
    const ref = `b${refN++}`;
    const list = [{ op: "create-rectangle", ref, params: { x, y, width: w, height: h, name: it.cls ? `${it.tag}.${it.cls.split(" ")[0]}` : it.tag, parentId } }];
    const grad = it.bgImg ? parseGradient(it.bgImg) : null;
    const urlMatch = it.bgImg && it.bgImg.match(/url\("?([^")]+)"?\)/);
    if (grad) list.push({ op: "set-fill-gradient", params: { id: `$${ref}`, ...grad } });
    else list.push({ op: "set-fill-color", params: { id: `$${ref}`, color: it.bg ? withOp(cssColor(it.bg), op) : "#00000000" } });
    const [tl, tr, br, bl] = it.radius;
    if (tl || tr || br || bl) list.push({ op: "set-corner-radius", params: { id: `$${ref}`, cornerRadius: tl, topLeftRadius: tl, topRightRadius: tr, bottomRightRadius: br, bottomLeftRadius: bl } });
    if (it.border) {
      const { w: bw, c: bc } = it.border;
      const uniform = bw.every((v) => v === bw[0]) && bc.every((c) => c === bc[0]);
      if (uniform) list.push({ op: "set-stroke-color", params: { id: `$${ref}`, color: withOp(cssColor(bc[0]), op), weight: bw[0], align: "INSIDE" } });
      else {
        // Per-side borders (dividers, underlines) become thin rectangles.
        const sides = [[x, y, w, bw[0]], [x + w - bw[1], y, bw[1], h], [x, y + h - bw[2], w, bw[2]], [x, y, bw[3], h]];
        sides.forEach(([sx, sy, sw, sh], i) => {
          if (sw > 0 && sh > 0 && cssColor(bc[i]) && !cssColor(bc[i]).endsWith("00")) {
            const sref = `${ref}s${i}`;
            list.push({ op: "create-rectangle", ref: sref, params: { x: sx, y: sy, width: sw, height: sh, name: "border", parentId } },
              { op: "set-fill-color", params: { id: `$${sref}`, color: withOp(cssColor(bc[i]), op) } });
          }
        });
      }
    }
    if (it.shadow) {
      const effects = parseShadows(it.shadow);
      if (effects.length) list.push({ op: "set-effects", params: { id: `$${ref}`, effects } });
    }
    if (urlMatch) {
      // Image fill needs the node id, so flush this box first.
      await push(list); await flush();
      const found = await call("get-node-info", { id: parentId, depth: 0, fields: ["children"] });
      const last = found.content.children.at(-1);
      const mode = /contain/.test(it.bgSize) ? "FIT" : "FILL";
      await imageCall("set-image-fill", { id: last.id, url: new URL(urlMatch[1], "https://sun-asterisk.us/").href, scaleMode: mode });
    } else await push(list);
  } else if (it.kind === "text") {
    const lh = it.lineHeight ?? it.size * 1.2;
    const contentH = it.lines > 1 ? Math.max(1, it.h - (it.lines - 1) * lh) : it.h;
    const params = {
      x: it.forceWidth ? round(x - 4) : x, y: round(y - (lh - contentH) / 2), text: it.text, fontName: "Schibsted Grotesk",
      fontStyle: STYLE[it.weight] ?? "Regular", fontSize: it.size, fontColor: withOp(cssColor(it.color) ?? "#000000FF", op),
      lineHeight: round(lh), name: it.text.slice(0, 40), parentId,
    };
    if (it.letterSpacing) params.letterSpacing = round((it.letterSpacing / it.size) * 100);
    // Figma's metrics differ slightly from the browser's: give wrapped/centered boxes a little slack.
    if (it.lines > 1 || it.forceWidth) params.width = round(it.w + (it.forceWidth ? 8 : 2));
    const align = { center: "CENTER", right: "RIGHT", end: "RIGHT", justify: "JUSTIFIED" }[it.align];
    if (align && (it.lines > 1 || it.forceWidth)) params.textAlign = align;
    await push([{ op: "create-text", params }]);
  } else if (it.kind === "img" && /\.svg(\?|$)/i.test(it.src)) {
    await flush();
    // SVG files cannot be image fills: inline them, sized to the rendered box (viewBox scales the drawing).
    const src = new URL(it.src, "https://sun-asterisk.us/").href;
    let svg = await (await fetch(src)).text();
    svg = svg.replace(/<\?xml[^>]*>/, "").replace(/<svg\b([^>]*)>/, (m, attrs) => `<svg${attrs.replace(/\s(width|height)="[^"]*"/g, "")} width="${w}" height="${h}">`);
    await call("create-svg", { svg, x, y, name: src.split("/").pop(), parentId }, { fatal: false });
  } else if (it.kind === "img") {
    await flush();
    const rect = await call("create-rectangle", { x, y, width: w, height: h, name: path.basename(new URL(it.src, "https://x/").pathname), parentId });
    const id = rect.content.id;
    // object-fit: cover -> FILL; contain/scale-down -> FIT; default "fill" stretches,
    // so keep FILL only when the aspect ratio already matches.
    const sameAspect = it.nw && it.nh && Math.abs(it.nw / it.nh - it.w / it.h) / (it.w / it.h) < 0.03;
    const mode = it.fit === "cover" ? "FILL" : /contain|scale-down/.test(it.fit) ? "FIT" : sameAspect ? "FILL" : "FIT";
    const r = await imageCall("set-image-fill", { id, url: new URL(it.src, "https://sun-asterisk.us/").href, scaleMode: mode });
    if (!r.ok) await call("delete-node", { id }, { fatal: false });
    else if (it.radius) await call("set-corner-radius", { id, cornerRadius: it.radius }, { fatal: false });
  } else if (it.kind === "svg") {
    await flush();
    const colorAttr = it.svg.match(/color="(rgba?\([^"]+\))"/);
    const color = colorAttr ? cssColor(colorAttr[1]).slice(0, 7) : "#000000";
    const svg = it.svg.replace(/currentColor/g, color);
    await call("create-svg", { svg, x, y, name: it.cls ? `svg.${it.cls.split(" ")[0]}` : "svg", parentId }, { fatal: false });
  } else if (it.kind === "raster") {
    await flush();
    // Still frame of a video/canvas: JPEG-encode, embed in an SVG <image> (Figma imports it as an image fill).
    const jpg = it.file.replace(/\.png$/, ".jpg");
    execFileSync("sips", ["-s", "format", "jpeg", "-s", "formatOptions", "82", it.file, "--out", jpg], { stdio: "ignore" });
    const b64 = fs.readFileSync(jpg).toString("base64");
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image width="${w}" height="${h}" preserveAspectRatio="none" href="data:image/jpeg;base64,${b64}"/></svg>`;
    await call("create-svg", { svg, x, y, name: `${it.tag} still`, parentId }, { fatal: false });
  }
}
await flush();
console.log(`done: root ${rootId}, ${items.length} items, ${calls} tool calls, ${((Date.now() - t0) / 1000).toFixed(0)}s, failures=${failures.length}`);
if (failures.length) console.log(JSON.stringify(failures, null, 1).slice(0, 4000));
fs.writeFileSync(path.join(DIR, "build-result.json"), JSON.stringify({ rootId, failures }, null, 1));
