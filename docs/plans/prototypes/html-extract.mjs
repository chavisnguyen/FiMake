// Render sun-asterisk.us at 1440 and extract visible boxes / images / svgs / text runs with computed styles.
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

const OUT = path.dirname(new URL(import.meta.url).pathname);
const URL_ = "https://sun-asterisk.us/";
const W = 1440;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: W, height: 900 }, deviceScaleFactor: 1 });
await page.goto(URL_, { waitUntil: "load", timeout: 120000 });
await page.waitForTimeout(4000);
// Scroll through the page so lazy images / on-scroll animations settle.
const total = await page.evaluate(() => document.documentElement.scrollHeight);
for (let y = 0; y < total; y += 600) {
  await page.evaluate((yy) => window.scrollTo(0, yy), y);
  await page.waitForTimeout(250);
}
await page.evaluate(() => window.scrollTo(0, 0));
await page.waitForTimeout(1500);
// Freeze carousels/animations so geometry is stable.
await page.addStyleTag({ content: "*,*::before,*::after{animation:none!important;transition:none!important}" });
await page.waitForTimeout(300);

await page.screenshot({ path: path.join(OUT, "reference.png"), fullPage: true });

// Media Figma cannot import (video/canvas/iframe): keep a still frame of each.
const media = await page.$$("video, canvas, iframe");
const rasters = [];
for (const [i, handle] of media.entries()) {
  const box = await handle.boundingBox();
  if (!box || box.width < 2 || box.height < 2) continue;
  const file = path.join(OUT, `media-${i}.png`);
  const shot = await page.screenshot({ path: file, fullPage: true, clip: { x: Math.max(0, box.x), y: box.y + (await page.evaluate(() => window.scrollY)), width: Math.min(box.width, 1440), height: box.height } }).catch(() => null);
  if (shot) rasters.push({ index: i, file });
}
await page.evaluate(() => { document.querySelectorAll("video, canvas, iframe").forEach((el, i) => el.setAttribute("data-media-index", String(i))); });

// Pseudo-elements are not in the DOM: turn visible ::before/::after into real spans.
await page.evaluate(() => {
  const ICON_FONT = /slick|awesome|icon|glyph|dashicons/i;
  const els = [...document.querySelectorAll("body *")];
  for (const el of els) {
    for (const pseudo of ["::before", "::after"]) {
      const cs = getComputedStyle(el, pseudo);
      if (!cs || cs.content === "none" || cs.content === "normal" || cs.display === "none") continue;
      const span = document.createElement("span");
      span.setAttribute("data-pseudo", pseudo);
      for (const prop of cs) span.style.setProperty(prop, cs.getPropertyValue(prop));
      const m = cs.content.match(/^["'](.*)["']$/s);
      if (m && !ICON_FONT.test(cs.fontFamily)) {
        span.textContent = m[1].replace(/\\([0-9a-f]{1,6}) ?/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)));
      }
      if (pseudo === "::before") el.prepend(span); else el.append(span);
      el.setAttribute("data-had-pseudo", "1");
    }
  }
  const style = document.createElement("style");
  style.textContent = "[data-had-pseudo]::before,[data-had-pseudo]::after{content:none!important}";
  document.head.appendChild(style);
});
await page.waitForTimeout(300);

const data = await page.evaluate(({ W, rasters }) => {
  const out = { width: W, height: document.documentElement.scrollHeight, bodyBg: getComputedStyle(document.body).backgroundColor, items: [] };
  const sy = window.scrollY;
  // Effective opacity multiplies up the ancestor chain (computed opacity is not inherited).
  const opacityOf = (el) => { let o = 1; for (let p = el; p && p !== document.documentElement; p = p.parentElement) o *= parseFloat(getComputedStyle(p).opacity); return o; };
  const visible = (el, cs) => cs.display !== "none" && cs.visibility !== "hidden" && opacityOf(el) > 0.01;
  const isTop = (el) => { for (let p = el; p && p !== document.body; p = p.parentElement) { const pos = getComputedStyle(p).position; if (pos === "fixed" || pos === "sticky") return true; } return false; };
  const rasterByIndex = new Map(rasters.map((r) => [String(r.index), r.file]));
  // Paint order across stacking contexts: z-index of the outermost positioned ancestor that sets one.
  const zOf = (el) => { let z = 0; for (let p = el; p && p !== document.body; p = p.parentElement) { const cs = getComputedStyle(p); if (cs.position !== "static" && cs.zIndex !== "auto") z = parseInt(cs.zIndex, 10) || 0; } return z; };
  const onPage = (r) => r.width > 0.5 && r.height > 0.5 && r.right > 0 && r.left < W;
  // Clip rect from ancestors with overflow hidden (carousels hide off-slide clones).
  function clipRect(el) {
    let r = { l: -1e9, t: -1e9, r: 1e9, b: 1e9 };
    for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
      const cs = getComputedStyle(p);
      if (cs.overflowX !== "visible" || cs.overflowY !== "visible") {
        const pr = p.getBoundingClientRect();
        r = { l: Math.max(r.l, pr.left), t: Math.max(r.t, pr.top), r: Math.min(r.r, pr.right), b: Math.min(r.b, pr.bottom) };
      }
    }
    return r;
  }
  const clipped = (rect, c) => rect.right <= c.l + 0.5 || rect.left >= c.r - 0.5 || rect.bottom <= c.t + 0.5 || rect.top >= c.b - 0.5;
  let order = 0;
  const box = (rect) => ({ x: rect.left, y: rect.top + sy, w: rect.width, h: rect.height });
  const clipBox = (c) => (c.l > -1e8 ? { x: c.l, y: c.t + sy, w: c.r - c.l, h: c.b - c.t } : null);
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
  for (let n = walker.currentNode; n; n = walker.nextNode()) {
    if (n.nodeType === Node.TEXT_NODE) {
      const txt = n.textContent.replace(/\s+/g, " ").trim();
      if (!txt) continue;
      const el = n.parentElement;
      if (!el || el.closest("svg,script,style,noscript")) continue;
      const cs = getComputedStyle(el);
      if (!visible(el, cs)) continue;
      const range = document.createRange();
      range.selectNodeContents(n);
      const rects = [...range.getClientRects()].filter((r) => r.width > 0.5 && r.height > 0.5);
      if (!rects.length) continue;
      const c = clipRect(el);
      const l = Math.min(...rects.map((r) => r.left)), t = Math.min(...rects.map((r) => r.top));
      const rr = Math.max(...rects.map((r) => r.right)), b = Math.max(...rects.map((r) => r.bottom));
      const rect = { left: l, top: t, right: rr, bottom: b, width: rr - l, height: b - t };
      if (!onPage(rect) || clipped(rect, c)) continue;
      let text = txt;
      if (cs.textTransform === "uppercase") text = text.toUpperCase();
      if (cs.textTransform === "capitalize") text = text.replace(/\b\w/g, (m) => m.toUpperCase());
      out.items.push({
        kind: "text", order: order++, ...box(rect), lines: rects.length, text, op: opacityOf(el), top: isTop(el), z: zOf(el), clip: clipBox(c),
        font: cs.fontFamily, size: parseFloat(cs.fontSize), weight: parseInt(cs.fontWeight, 10), italic: cs.fontStyle === "italic",
        lineHeight: cs.lineHeight === "normal" ? null : parseFloat(cs.lineHeight),
        letterSpacing: cs.letterSpacing === "normal" ? 0 : parseFloat(cs.letterSpacing),
        color: cs.color, align: cs.textAlign, decoration: cs.textDecorationLine,
      });
      continue;
    }
    const el = n;
    const tag = el.tagName.toLowerCase();
    if (["script", "style", "noscript", "head", "link", "meta", "br"].includes(tag)) continue;
    const cs = getComputedStyle(el);
    if (!visible(el, cs)) { continue; }
    const rect = el.getBoundingClientRect();
    const c = clipRect(el);
    if (!onPage(rect) || clipped(rect, c)) continue;
    const base = { order: order++, ...box(rect), tag, cls: String(el.className?.baseVal ?? el.className ?? "").slice(0, 60), op: opacityOf(el), top: isTop(el), z: zOf(el), clip: clipBox(c) };
    const mediaFile = rasterByIndex.get(el.getAttribute("data-media-index") ?? "");
    if (mediaFile) { out.items.push({ kind: "raster", ...base, file: mediaFile }); continue; }
    if ((tag === "input" || tag === "textarea") && !["hidden", "checkbox", "radio"].includes(el.type)) {
      const isButton = ["submit", "button"].includes(el.type);
      const label = isButton ? el.value : (el.value || el.placeholder);
      if (label) {
        const ph = !isButton && !el.value ? getComputedStyle(el, "::placeholder") : cs;
        const size = parseFloat(cs.fontSize);
        const pl = parseFloat(cs.paddingLeft) + parseFloat(cs.borderLeftWidth);
        const pt = parseFloat(cs.paddingTop) + parseFloat(cs.borderTopWidth);
        const lineH = size * 1.2;
        const ty = tag === "textarea" ? rect.top + pt : rect.top + (rect.height - lineH) / 2;
        out.items.push({
          kind: "text", order: order + 0.5, x: isButton ? rect.left : rect.left + pl, y: ty + sy, w: isButton ? rect.width : rect.width - pl * 2, h: lineH,
          lines: 1, text: label, op: opacityOf(el), top: isTop(el), z: zOf(el), clip: null, forceWidth: isButton,
          font: cs.fontFamily, size, weight: parseInt(cs.fontWeight, 10), italic: false, lineHeight: lineH, letterSpacing: 0,
          color: ph.color, align: isButton ? "center" : "left", decoration: "none", placeholderFor: tag,
        });
      }
    }
    if (tag === "svg") {
      const clone = el.cloneNode(true);
      clone.setAttribute("width", String(rect.width));
      clone.setAttribute("height", String(rect.height));
      if (!clone.getAttribute("xmlns")) clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
      // Resolve currentColor so the markup renders standalone.
      clone.setAttribute("color", cs.color);
      out.items.push({ kind: "svg", ...base, svg: clone.outerHTML });
      continue;
    }
    if (tag === "img") {
      out.items.push({ kind: "img", ...base, src: el.currentSrc || el.src, fit: cs.objectFit, nw: el.naturalWidth, nh: el.naturalHeight, radius: parseFloat(cs.borderTopLeftRadius) || 0 });
      continue;
    }
    const bg = cs.backgroundColor;
    const bgImg = cs.backgroundImage !== "none" ? cs.backgroundImage : null;
    const bw = ["Top", "Right", "Bottom", "Left"].map((s) => parseFloat(cs[`border${s}Width`]) || 0);
    const bc = ["Top", "Right", "Bottom", "Left"].map((s) => cs[`border${s}Color`]);
    const hasBg = bg && !/rgba\(0, 0, 0, 0\)|transparent/.test(bg);
    const hasBorder = bw.some((w, i) => w > 0 && !/rgba\(0, 0, 0, 0\)/.test(bc[i]) && cs[`border${["Top", "Right", "Bottom", "Left"][i]}Style`] !== "none");
    const shadow = cs.boxShadow !== "none" ? cs.boxShadow : null;
    if (hasBg || bgImg || hasBorder || shadow) {
      out.items.push({
        kind: "box", ...base, bg: hasBg ? bg : null, bgImg, bgSize: cs.backgroundSize, bgPos: cs.backgroundPosition,
        radius: ["TopLeft", "TopRight", "BottomRight", "BottomLeft"].map((s) => parseFloat(cs[`border${s}Radius`]) || 0),
        border: hasBorder ? { w: bw, c: bc } : null, shadow,
      });
    }
  }
  return out;
}, { W, rasters });

fs.writeFileSync(path.join(OUT, "extract.json"), JSON.stringify(data, null, 1));
const counts = data.items.reduce((m, i) => ((m[i.kind] = (m[i.kind] || 0) + 1), m), {});
console.log(`page ${data.width}x${data.height} bodyBg=${data.bodyBg}`, counts);
const fonts = [...new Set(data.items.filter((i) => i.kind === "text").map((i) => i.font))];
console.log("fonts:", fonts);
await browser.close();
