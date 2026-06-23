import sharp from "sharp";
import { logger } from "../logger.js";

export interface TemplateElement {
  id: string;
  type: "title" | "category" | "image" | "logo" | "cta" | "text";
  x: number; y: number;
  width: number; height: number;
  fontSize: number;
  fontFamily: string;
  fontWeight: string;
  color: string;
  backgroundColor: string;
  textAlign: "left" | "center" | "right";
  padding: number;
  borderRadius: number;
  opacity: number;
  zIndex: number;
  content: string;
  objectFit?: "cover" | "contain" | "fill";
}

export interface SocialTemplate {
  width: number;
  height: number;
  backgroundColor: string;
  elements: TemplateElement[];
}

export interface ArticleData {
  title: string;
  category: string;
  imageUrl?: string;
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const clean = hex.replace("#", "");
  if (clean.length === 3) {
    const r = parseInt(clean[0]! + clean[0]!, 16);
    const g = parseInt(clean[1]! + clean[1]!, 16);
    const b = parseInt(clean[2]! + clean[2]!, 16);
    return { r, g, b };
  }
  return {
    r: parseInt(clean.slice(0, 2), 16),
    g: parseInt(clean.slice(2, 4), 16),
    b: parseInt(clean.slice(4, 6), 16),
  };
}

function resolveContent(content: string, article: ArticleData): string {
  return content
    .replace(/\{\{title\}\}/gi, article.title)
    .replace(/\{\{category\}\}/gi, article.category)
    .replace(/\{\{cta\}\}/gi, content.includes("{{cta}}") ? content.replace(/\{\{cta\}\}/gi, "") : content);
}

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/** Build an SVG layer for a text element (full canvas size) */
function buildTextSvg(el: TemplateElement, text: string, canvasW: number, canvasH: number): string {
  const weight = el.fontWeight === "bold" ? "bold" : el.fontWeight === "light" ? "300" : "normal";
  const anchor = el.textAlign === "center" ? "middle" : el.textAlign === "right" ? "end" : "start";
  const textX = el.textAlign === "center"
    ? el.x + el.width / 2
    : el.textAlign === "right"
    ? el.x + el.width - el.padding
    : el.x + el.padding;

  // Word-wrap simulation: split into lines of roughly el.width / (el.fontSize * 0.55) chars
  const charsPerLine = Math.max(1, Math.floor((el.width - el.padding * 2) / (el.fontSize * 0.55)));
  const words = text.split(" ");
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length <= charsPerLine) {
      current = (current + " " + word).trim();
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);

  const lineHeight = el.fontSize * 1.3;
  const totalTextH = lines.length * lineHeight;
  const startY = el.y + el.padding + el.fontSize;

  const hasBg = el.backgroundColor && el.backgroundColor !== "transparent" && el.backgroundColor !== "rgba(0,0,0,0)";

  const bgRect = hasBg
    ? `<rect x="${el.x}" y="${el.y}" width="${el.width}" height="${Math.max(el.height, totalTextH + el.padding * 2)}"
          fill="${el.backgroundColor}" rx="${el.borderRadius}" opacity="${el.opacity}"/>`
    : "";

  const tspans = lines.map((line, i) =>
    `<tspan x="${textX}" dy="${i === 0 ? 0 : lineHeight}">${escapeXml(line)}</tspan>`
  ).join("");

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${canvasW}" height="${canvasH}">
    ${bgRect}
    <text
      x="${textX}"
      y="${startY}"
      font-family="${el.fontFamily || "Arial"}, sans-serif"
      font-size="${el.fontSize}"
      font-weight="${weight}"
      fill="${el.color}"
      text-anchor="${anchor}"
      opacity="${el.opacity}"
    >${tspans}</text>
  </svg>`;
}

async function fetchImageBuffer(url: string): Promise<Buffer | null> {
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(10000) });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    return Buffer.from(ab);
  } catch {
    return null;
  }
}

export async function generateArt(template: SocialTemplate, article: ArticleData): Promise<Buffer> {
  const { width, height, backgroundColor, elements } = template;
  const bg = hexToRgb(backgroundColor);

  const sorted = [...elements].sort((a, b) => a.zIndex - b.zIndex);

  const composites: sharp.OverlayOptions[] = [];

  for (const el of sorted) {
    try {
      if (el.type === "image" || el.type === "logo") {
        const url = el.type === "image" ? article.imageUrl : el.content;
        if (!url) continue;
        const buf = await fetchImageBuffer(url);
        if (!buf) continue;
        const fit: sharp.FitEnum[keyof sharp.FitEnum] =
          el.objectFit === "contain" ? "contain"
          : el.objectFit === "fill"   ? "fill"
          : "cover";
        const resized = await sharp(buf)
          .resize(Math.round(el.width), Math.round(el.height), { fit })
          .toBuffer();
        composites.push({
          input: resized,
          top: Math.round(el.y),
          left: Math.round(el.x),
          blend: "over",
        });
      } else {
        const text = resolveContent(el.content || "", article);
        if (!text.trim()) continue;
        const svg = buildTextSvg(el, text, width, height);
        composites.push({ input: Buffer.from(svg), top: 0, left: 0, blend: "over" });
      }
    } catch (err) {
      logger.warn({ err, elType: el.type }, "Social image generator: element render error");
    }
  }

  return sharp({
    create: { width, height, channels: 3, background: { r: bg.r, g: bg.g, b: bg.b } },
  })
    .composite(composites)
    .jpeg({ quality: 90 })
    .toBuffer();
}
