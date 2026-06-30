import React, { useState, useEffect, useRef, useCallback } from "react";
import { BRAND } from "../../brand";
import {
  Share2, Plus, Trash2, Pencil, CheckCircle, AlertCircle, Loader2, X,
  Play, RefreshCw, ChevronDown, ChevronUp, Image as ImageIcon, Type,
  AlignLeft, AlignCenter, AlignRight, Layers, Save,
  Instagram, Facebook, Clock, Send, Link2, TestTube2, ToggleLeft, ToggleRight,
  Upload, Eye, Copy, Sparkles, ArrowUpToLine, ArrowDownToLine, FoldVertical,
} from "lucide-react";
import AdminLayout from "@/components/admin/AdminLayout";
import {
  type TemplateElement,
  type ArticleData,
  type ElementType,
  type Gradient,
  elementBoxStyle,
  textInnerStyle,
  imageInnerStyle,
  resolveContent,
  isImageType,
  FONT_FAMILIES,
  fontStack,
  GOOGLE_FONTS_HREF,
  DEFAULT_CAPTION_TEMPLATE,
  resolveCaption,
  gradientToCss,
  backgroundCss,
  defaultGradient,
  easedScrim,
  smoothGradient,
  GRADIENT_PRESETS,
  parseHighlight,
  DEFAULT_ACCENT,
} from "@workspace/social-template";
import type { CSSProperties } from "react";
import { useLayoutEffect } from "react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface SocialAccount {
  id: string;
  name: string;
  metaAppId?: string | null;
  metaAppSecret?: string | null;
  pageId?: string | null;
  pageName?: string | null;
  instagramId?: string | null;
  instagramName?: string | null;
  accessToken?: string | null;
  isActive: boolean;
  createdAt: string;
}

export type { TemplateElement };

interface SocialTemplate {
  id: string;
  name: string;
  type: "feed" | "story";
  width: number;
  height: number;
  backgroundColor: string;
  backgroundGradient?: Gradient;
  elements: TemplateElement[];
}

interface QueueItem {
  id: string;
  articleId: string;
  articleTitle?: string | null;
  socialAccountId: string;
  accountName?: string | null;
  templateId?: string | null;
  type: string;
  status: string;
  caption?: string | null;
  scheduledAt: string;
  publishedAt?: string | null;
  metaPostId?: string | null;
  errorMessage?: string | null;
  retryCount: number;
  createdAt: string;
}

interface ArticleOption {
  id: string;
  title: string;
  socialTitle?: string;
  category: string;
  imageUrl?: string;
  subtitle?: string;
  author?: string;
  publishedAt?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CARD_SHADOW = "0 8px 24px rgba(15,23,42,0.06)";
const PRIMARY = "#0B2A66";
const ACCENT  = "#E71D36";

const PREVIEW_W = 360;
const ACTUAL_W  = 1080;
const SCALE = PREVIEW_W / ACTUAL_W;

/** Margem segura do feed e zonas de UI do story (em px no tamanho real). */
const FEED_SAFE_MARGIN = 60;
const STORY_SAFE_TOP = 250;
const STORY_SAFE_BOTTOM = 250;

const ELEMENT_TYPE_LABELS: Record<string, string> = {
  title: "Título", category: "Categoria", image: "Imagem de fundo",
  logo: "Logo", cta: "Call to action", text: "Texto livre", overlay: "Máscara (overlay)",
  gradient: "Degradê",
};

const ELEMENT_TYPES: ElementType[] = ["image", "overlay", "gradient", "title", "category", "logo", "cta", "text"];

function makeElement(type: ElementType, canvasH = 1350): TemplateElement {
  const overrides: Partial<Record<ElementType, Partial<TemplateElement>>> = {
    title:    { x: 40, y: 600, width: 1000, height: 200, fontSize: 64, fontWeight: "bold", color: "#ffffff", backgroundColor: "transparent", content: "{{title}}", verticalAlign: "top", autoFit: true },
    category: { x: 40, y: 540, width: 300,  height: 60,  fontSize: 28, fontWeight: "bold", color: "#ffffff", backgroundColor: ACCENT, content: "{{category}}", textAlign: "center", verticalAlign: "middle" },
    image:    { x: 0,  y: 0,   width: 1080, height: 800, fontSize: 0,  fontWeight: "normal", color: "", backgroundColor: "#333333", content: "", objectFit: "cover" },
    overlay:  { x: 0,  y: 0,   width: 1080, height: canvasH, fontSize: 0, fontWeight: "normal", color: "", backgroundColor: "transparent", content: "", objectFit: "fill", zIndex: 5 },
    gradient: { x: 0,  y: Math.round(canvasH * 0.55), width: 1080, height: Math.round(canvasH * 0.45), fontSize: 0, fontWeight: "normal", color: "", backgroundColor: "transparent", content: "", fill: "gradient", gradient: defaultGradient(), zIndex: 3 },
    logo:     { x: 40, y: 40,  width: 200,  height: 80,  fontSize: 0,  fontWeight: "normal", color: "", backgroundColor: "transparent", content: "", objectFit: "contain", zIndex: 6 },
    cta:      { x: 40, y: 900, width: 400,  height: 80,  fontSize: 28, fontWeight: "bold", color: "#ffffff", backgroundColor: PRIMARY, content: "Leia mais →", textAlign: "center", verticalAlign: "middle" },
    text:     { x: 40, y: 1100, width: 1000, height: 80, fontSize: 24, fontWeight: "normal", color: "#cccccc", backgroundColor: "transparent", content: "sbcagora.com.br" },
  };
  return {
    id: crypto.randomUUID(),
    type,
    x: 40, y: 400, width: 600, height: 100,
    fontSize: 32, fontFamily: "Inter", fontWeight: "normal",
    color: "#ffffff", backgroundColor: "transparent",
    textAlign: "left", padding: 16, borderRadius: 0, opacity: 1, zIndex: 1,
    content: "",
    ...(overrides[type] ?? {}),
  };
}

// ─── Presets de fábrica (marca SBC Agora) ──────────────────────────────────────

type PresetKind = "feed-photo" | "story-quote" | "sport-card";

const PRESETS: { kind: PresetKind; label: string }[] = [
  { kind: "sport-card",  label: "Esporte · Card (logo + faixa)" },
  { kind: "feed-photo",  label: "Feed · Foto + faixa" },
  { kind: "story-quote", label: "Story · Citação" },
];

function makePreset(kind: PresetKind): SocialTemplate {
  if (kind === "sport-card") {
    const H = 1350;
    return {
      id: "", name: "Esporte — Card", type: "feed", width: 1080, height: H, backgroundColor: "#0d0d0d",
      elements: [
        // foto do artigo (fundo)
        { ...makeElement("image", H), x: 0, y: 0, width: 1080, height: 1350, objectFit: "cover", zIndex: 1 },
        // degradê escuro embaixo (legibilidade) — curva suave (smoothstep),
        // transparente no topo e escuro embaixo, sem faixa/linha visível.
        { ...makeElement("gradient", H), x: 0, y: 620, width: 1080, height: 730, zIndex: 2, fill: "gradient",
          gradient: easedScrim(180, 0.96) },
        // logo (upload) no canto inferior esquerdo
        { ...makeElement("logo", H), x: 60, y: 1085, width: 145, height: 145, objectFit: "contain", zIndex: 6, content: "" },
        // divisor vertical
        { ...makeElement("text", H), x: 228, y: 1092, width: 5, height: 138, backgroundColor: "#ffffff", padding: 0, content: "", zIndex: 6 },
        // kicker (categoria, verde)
        { ...makeElement("category", H), x: 258, y: 1086, width: 770, height: 46, fontSize: 32, fontFamily: "Oswald", fontWeight: "bold", color: "#9EFF00", backgroundColor: "transparent", textAlign: "left", verticalAlign: "middle", padding: 0, letterSpacing: 1, content: "{{CATEGORY}}", zIndex: 6 },
        // título (auto-ajusta p/ nunca cortar; *destaque* em verde)
        { ...makeElement("title", H), x: 258, y: 1138, width: 780, height: 150, fontSize: 42, fontFamily: "Oswald", fontWeight: "bold", color: "#ffffff", backgroundColor: "transparent", textAlign: "left", padding: 0, content: "{{title}}", autoFit: true, accentColor: "#9EFF00", zIndex: 6 },
        // pílula da URL (borda arredondada; nome do site destacado)
        { ...makeElement("text", H), x: 150, y: 1292, width: 780, height: 52, fontSize: 24, fontFamily: "Oswald", fontWeight: "bold", color: "#ffffff", backgroundColor: "transparent", borderWidth: 3, borderColor: "#ffffff", borderRadius: 30, textAlign: "center", verticalAlign: "middle", padding: 0, letterSpacing: 1, content: "WWW.*SEUSITE*.COM.BR", accentColor: "#9EFF00", zIndex: 6 },
        // bandeira/selo (upload) no canto superior direito
        { ...makeElement("logo", H), x: 878, y: 80, width: 140, height: 95, objectFit: "contain", zIndex: 6, content: "" },
      ],
    };
  }
  if (kind === "story-quote") {
    const H = 1920;
    return {
      id: "", name: "Story — Citação", type: "story", width: 1080, height: H, backgroundColor: "#0B2A66",
      elements: [
        { ...makeElement("category", H), x: 80, y: 360, width: 360, height: 70, fontSize: 30, content: "{{category}}", zIndex: 2 },
        { ...makeElement("title", H),    x: 80, y: 470, width: 920, height: 760, fontSize: 86, fontFamily: "Oswald", color: "#ffffff", content: "{{title}}", autoFit: true, zIndex: 3 },
        { ...makeElement("text", H),     x: 80, y: 1770, width: 920, height: 60, fontSize: 30, color: "#cbd5e1", content: "sbcagora.com.br", zIndex: 4 },
      ],
    };
  }
  // feed-photo
  const H = 1350;
  return {
    id: "", name: "Feed — Foto + Faixa", type: "feed", width: 1080, height: H, backgroundColor: "#0B2A66",
    elements: [
      { ...makeElement("image", H),    x: 0,  y: 0,   width: 1080, height: 1350, objectFit: "cover", zIndex: 1 },
      { ...makeElement("text", H),     x: 0,  y: 760, width: 1080, height: 590, backgroundColor: "#0B2A66", opacity: 0.82, content: "", zIndex: 2 },
      { ...makeElement("category", H), x: 60, y: 840, width: 320, height: 64, fontSize: 28, content: "{{category}}", zIndex: 3 },
      { ...makeElement("title", H),    x: 60, y: 930, width: 960, height: 300, fontSize: 66, fontWeight: "bold", fontFamily: "Oswald", color: "#ffffff", content: "{{title}}", autoFit: true, zIndex: 4 },
      { ...makeElement("text", H),     x: 60, y: 1270, width: 960, height: 50, fontSize: 26, color: "#cbd5e1", content: "@sbcagora · sbcagora.com.br", zIndex: 5 },
    ],
  };
}

function fmtDate(iso?: string | null): string {
  if (!iso) return "—";
  return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
}

// ─── Canvas: interação (mover/redimensionar) + snapping ────────────────────────

type Handle = "nw" | "n" | "ne" | "e" | "se" | "s" | "sw" | "w" | "move";

interface Interaction {
  id: string;
  handle: Handle;
  startX: number;
  startY: number;
  orig: { x: number; y: number; width: number; height: number };
}

const RESIZE_HANDLES: Handle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];
const SNAP = 12;      // limiar de encaixe em px reais
const MIN_SIZE = 20;

/** Artigo de amostra usado no canvas quando nenhum artigo real é selecionado. */
const SAMPLE_ARTICLE: ArticleData = {
  title: "Prefeitura anuncia novo plano de mobilidade para a região central",
  subtitle: "Medida promete reduzir o tempo de deslocamento no horário de pico",
  category: "Cidade",
  author: "Redação",
  imageUrl: "",
};

/** Aplica o arrasto de uma alça à caixa original, mantendo tamanho mínimo. */
function applyHandle(orig: Interaction["orig"], handle: Handle, dx: number, dy: number) {
  let { x, y, width, height } = orig;
  if (handle === "move") return { x: x + dx, y: y + dy, width, height };
  if (handle.includes("e")) width = Math.max(MIN_SIZE, orig.width + dx);
  if (handle.includes("s")) height = Math.max(MIN_SIZE, orig.height + dy);
  if (handle.includes("w")) { width = Math.max(MIN_SIZE, orig.width - dx); x = orig.x + (orig.width - width); }
  if (handle.includes("n")) { height = Math.max(MIN_SIZE, orig.height - dy); y = orig.y + (orig.height - height); }
  return { x, y, width, height };
}

/** Encaixa um valor na linha-alvo mais próxima dentro do limiar SNAP. */
function snapTo(value: number, targets: number[]): { value: number; line: number | null } {
  let best: { value: number; line: number | null; dist: number } = { value, line: null, dist: SNAP };
  for (const t of targets) {
    const d = Math.abs(value - t);
    if (d <= best.dist) best = { value: t, line: t, dist: d };
  }
  return { value: best.value, line: best.line };
}

/** Ao MOVER: tenta encaixar borda inicial/centro/borda final na grade de alvos. */
function bestSnapTriple(pos: number, size: number, targets: number[]): { line: number | null; delta: number } {
  const candidates = [pos, pos + size / 2, pos + size];
  let best: { line: number | null; delta: number; dist: number } = { line: null, delta: 0, dist: SNAP };
  for (const c of candidates) {
    const s = snapTo(c, targets);
    if (s.line != null) {
      const d = Math.abs(c - s.line);
      if (d <= best.dist) best = { line: s.line, delta: s.line - c, dist: d };
    }
  }
  return { line: best.line, delta: best.delta };
}

// ─── Cor (hex + alfa ↔ rgba) e controles de degradê ────────────────────────────

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((x) => Math.max(0, Math.min(255, x)).toString(16).padStart(2, "0")).join("");
}

/** Decompõe uma cor CSS (rgba/hex/transparent) em hex (#rrggbb) + alfa (0–1). */
function parseColor(c: string): { hex: string; alpha: number } {
  if (!c || c === "transparent") return { hex: "#000000", alpha: 0 };
  const m = c.match(/rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*(?:,\s*([\d.]+)\s*)?\)/i);
  if (m) return { hex: rgbToHex(+m[1]!, +m[2]!, +m[3]!), alpha: m[4] !== undefined ? parseFloat(m[4]) : 1 };
  if (c[0] === "#") {
    if (c.length === 4) return { hex: "#" + c.slice(1).split("").map((x) => x + x).join(""), alpha: 1 };
    if (c.length === 9) return { hex: c.slice(0, 7), alpha: parseInt(c.slice(7, 9), 16) / 255 };
    return { hex: c, alpha: 1 };
  }
  return { hex: "#000000", alpha: 1 };
}

function toRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${Number(alpha.toFixed(2))})`;
}

/** Editor de degradê reutilizável (fundo do canvas e de elementos). */
function GradientControls({ value, onChange }: { value: Gradient; onChange: (g: Gradient) => void }) {
  const setStop = (i: number, patch: Partial<{ color: string; pos: number }>) =>
    onChange({ ...value, stops: value.stops.map((s, idx) => (idx === i ? { ...s, ...patch } : s)) });

  return (
    <div className="space-y-2">
      <select value=""
        onChange={(e) => { const p = GRADIENT_PRESETS[Number(e.target.value)]; if (p) onChange(JSON.parse(JSON.stringify(p.gradient))); e.target.value = ""; }}
        className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-slate-50">
        <option value="">★ Degradês prontos…</option>
        {GRADIENT_PRESETS.map((p, i) => <option key={p.name} value={i}>{p.name}</option>)}
      </select>

      <div style={{ height: 28, borderRadius: 6, border: "1px solid #e2e8f0", background: gradientToCss(value) }} />

      <div className="grid grid-cols-2 gap-2">
        <select value={value.type}
          onChange={(e) => onChange({ ...value, type: e.target.value as "linear" | "radial" })}
          className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-white">
          <option value="linear">Linear</option>
          <option value="radial">Radial</option>
        </select>
        {value.type === "linear" && (
          <div className="flex items-center gap-1">
            <input type="number" min={0} max={360} value={value.angle}
              onChange={(e) => onChange({ ...value, angle: Number(e.target.value) })}
              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" title="Ângulo (graus)" />
            <span className="text-[10px] text-slate-400">°</span>
          </div>
        )}
      </div>

      {value.stops.map((s, i) => {
        const { hex, alpha } = parseColor(s.color);
        return (
          <div key={i} className="flex items-center gap-1.5">
            <input type="color" value={hex}
              onChange={(e) => setStop(i, { color: toRgba(e.target.value, alpha) })}
              className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0" />
            <input type="range" min={0} max={1} step={0.05} value={alpha}
              onChange={(e) => setStop(i, { color: toRgba(hex, Number(e.target.value)) })}
              className="flex-1" title={`Opacidade ${Math.round(alpha * 100)}%`} />
            <input type="number" min={0} max={100} value={s.pos}
              onChange={(e) => setStop(i, { pos: Math.max(0, Math.min(100, Number(e.target.value))) })}
              className="w-12 text-xs border border-slate-200 rounded-lg px-1.5 py-1.5 outline-none focus:border-[#0B2A66]" title="Posição %" />
            {value.stops.length > 2 && (
              <button onClick={() => onChange({ ...value, stops: value.stops.filter((_, idx) => idx !== i) })}
                className="w-6 h-6 flex items-center justify-center rounded text-slate-400 hover:text-red-500 shrink-0">
                <X size={11} />
              </button>
            )}
          </div>
        );
      })}

      <div className="flex items-center justify-between">
        <button onClick={() => onChange({ ...value, stops: [...value.stops, { color: "rgba(0,0,0,1)", pos: 100 }] })}
          className="flex items-center gap-1 text-[11px] font-medium text-[#0B2A66] hover:underline">
          <Plus size={11} /> Adicionar parada
        </button>
        <button onClick={() => onChange(smoothGradient(value))}
          title="Reamostra as paradas numa curva suave (sem faixa/linha visível)"
          className="flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-[#0B2A66] hover:underline">
          <Sparkles size={11} /> Suavizar
        </button>
      </div>
    </div>
  );
}

/** Texto do canvas com destaque inline (*…*) e auto-ajuste de fonte (se autoFit). */
function AutoFitText({ el, text }: { el: TemplateElement; text: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [, bump] = useState(0);

  // Re-ajusta quando as fontes do Google terminam de carregar (métrica muda).
  useEffect(() => {
    let alive = true;
    const fonts = (document as unknown as { fonts?: { ready?: Promise<unknown> } }).fonts;
    fonts?.ready?.then(() => { if (alive) bump((x) => x + 1); });
    return () => { alive = false; };
  }, []);

  useLayoutEffect(() => {
    const node = ref.current;
    if (!node || !el.autoFit) return;
    const max = el.fontSize;
    const min = Math.max(12, Math.round(max * 0.5));
    let size = max;
    node.style.fontSize = size + "px";
    let guard = 400;
    while (size > min && guard-- > 0 && (node.scrollHeight > node.clientHeight || node.scrollWidth > node.clientWidth)) {
      size -= 1;
      node.style.fontSize = size + "px";
    }
  });

  const accent = el.accentColor || DEFAULT_ACCENT;
  return (
    <div ref={ref} style={textInnerStyle(el) as CSSProperties}>
      <div style={{ width: "100%" }}>
        {parseHighlight(text).map((s, i) =>
          s.accent ? <span key={i} style={{ color: accent }}>{s.text}</span> : <span key={i}>{s.text}</span>,
        )}
      </div>
    </div>
  );
}

// ─── API helpers ──────────────────────────────────────────────────────────────

function getAuthHeaders(): Record<string, string> {
  const token = localStorage.getItem("admin_token");
  return {
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
}

async function apiFetch(path: string, opts?: RequestInit) {
  const res = await fetch(`/api/admin/social${path}`, {
    ...opts,
    headers: { ...getAuthHeaders(), ...(opts?.headers ?? {}) },
  });
  return res.json() as Promise<unknown>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// ACCOUNT MODAL — simplified: Name + App ID + App Secret as primary fields
// ═══════════════════════════════════════════════════════════════════════════════

function AccountModal({
  editingAccount,
  setEditingAccount,
  accountSaving,
  onSave,
  onClose,
}: {
  editingAccount: Partial<SocialAccount & { accessToken: string }>;
  setEditingAccount: React.Dispatch<React.SetStateAction<Partial<SocialAccount & { accessToken: string }> | null>>;
  accountSaving: boolean;
  onSave: () => void;
  onClose: () => void;
}) {
  const [showAdvanced, setShowAdvanced] = React.useState(
    !!(editingAccount.pageId || editingAccount.instagramId || editingAccount.accessToken)
  );

  const Field = ({ fieldKey, label, placeholder, pw = false }: { fieldKey: string; label: string; placeholder: string; pw?: boolean }) => (
    <div>
      <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">{label}</label>
      <input
        type={pw ? "password" : "text"}
        value={(editingAccount[fieldKey as keyof typeof editingAccount] as string) ?? ""}
        onChange={(e) => setEditingAccount((prev) => prev ? { ...prev, [fieldKey]: e.target.value } : prev)}
        placeholder={placeholder}
        className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66] bg-slate-50"
      />
    </div>
  );

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-slate-100">
          <h3 className="text-base font-bold text-slate-800">
            {editingAccount.id ? "Editar Conta" : "Adicionar Conta Meta"}
          </h3>
          <button onClick={onClose}
            className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <div className="p-6 space-y-4">
          {/* ── Campos principais ── */}
          <Field fieldKey="name" label="Nome da conta *" placeholder={`Ex: ${BRAND.name}`} />
          <Field fieldKey="metaAppId" label="ID do Aplicativo Meta" placeholder="123456789012345" />
          <Field fieldKey="metaAppSecret" label="Chave Secreta do App" placeholder="••••••••••••••••" pw />

          {/* ── Avançado ── */}
          <div>
            <button
              type="button"
              onClick={() => setShowAdvanced((v) => !v)}
              className="flex items-center gap-1.5 text-xs font-semibold text-[#0B2A66] hover:underline"
            >
              {showAdvanced ? <ChevronUp size={13} /> : <ChevronDown size={13} />}
              {showAdvanced ? "Ocultar campos avançados" : "Configuração avançada (Page ID, Instagram, Token)"}
            </button>
          </div>

          {showAdvanced && (
            <div className="space-y-4 border-t border-slate-100 pt-4">
              <p className="text-[11px] text-slate-400 leading-relaxed">
                Preencha o <strong>Page Access Token</strong> com um token de longa duração obtido no Meta Business Suite
                ou pelo fluxo OAuth. O Page ID e o Instagram ID são preenchidos automaticamente ao testar a conexão.
              </p>
              <Field fieldKey="accessToken" label="Page Access Token (long-lived)" placeholder="EAABxx…" pw />
              <Field fieldKey="pageId" label="Facebook Page ID" placeholder="123456789012345" />
              <Field fieldKey="pageName" label="Nome da Página (opcional)" placeholder={BRAND.name} />
              <Field fieldKey="instagramId" label="Instagram Business Account ID" placeholder="123456789012345" />
              <Field fieldKey="instagramName" label="Nome do Instagram (opcional)" placeholder="@sbcagora" />
            </div>
          )}

          <label className="flex items-center gap-2 cursor-pointer">
            <input type="checkbox" checked={editingAccount.isActive ?? true}
              onChange={(e) => setEditingAccount((prev) => prev ? { ...prev, isActive: e.target.checked } : prev)} />
            <span className="text-sm text-slate-700">Conta ativa</span>
          </label>
        </div>

        <div className="flex gap-2 p-6 pt-0">
          <button onClick={onSave} disabled={accountSaving || !editingAccount.name}
            className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-60"
            style={{ background: PRIMARY }}>
            {accountSaving ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            {accountSaving ? "Salvando…" : "Salvar"}
          </button>
          <button onClick={onClose}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════════════
// MAIN COMPONENT
// ═══════════════════════════════════════════════════════════════════════════════

export default function SocialMedia() {
  const [tab, setTab] = useState<"accounts" | "templates" | "queue">("accounts");

  // ── Accounts ──────────────────────────────────────────────────────────────
  const [accounts,         setAccounts]         = useState<SocialAccount[]>([]);
  const [accountsLoading,  setAccountsLoading]  = useState(false);
  const [showAccountModal, setShowAccountModal] = useState(false);
  const [editingAccount,   setEditingAccount]   = useState<Partial<SocialAccount & { accessToken: string }> | null>(null);
  const [accountSaving,    setAccountSaving]    = useState(false);
  const [testStatus,       setTestStatus]       = useState<Record<string, { ok: boolean; msg: string } | null>>({});
  const [testingId,        setTestingId]        = useState<string | null>(null);

  // ── Templates ─────────────────────────────────────────────────────────────
  const [templates,       setTemplates]       = useState<SocialTemplate[]>([]);
  const [currentTemplate, setCurrentTemplate] = useState<SocialTemplate | null>(null);
  const [selectedElId,    setSelectedElId]    = useState<string | null>(null);
  const [templateSaving,  setTemplateSaving]  = useState(false);
  const [templateSaved,   setTemplateSaved]   = useState(false);

  // Artigo real p/ preview WYSIWYG dentro do canvas
  const [editorArticles,   setEditorArticles]   = useState<ArticleOption[]>([]);
  const [previewArticleId, setPreviewArticleId] = useState<string>("");

  // Preview "real" (render server-side via Playwright)
  const [previewUrl,     setPreviewUrl]     = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError,   setPreviewError]   = useState<string | null>(null);

  // Upload de imagem em andamento (id do elemento sendo enviado)
  const [uploadingElId, setUploadingElId] = useState<string | null>(null);

  // Interação no canvas (mover/redimensionar) + guias de alinhamento
  const [interaction, setInteraction] = useState<Interaction | null>(null);
  const [guides,      setGuides]      = useState<{ v: number[]; h: number[] }>({ v: [], h: [] });

  // ── Queue ─────────────────────────────────────────────────────────────────
  const [queue,          setQueue]          = useState<QueueItem[]>([]);
  const [queueLoading,   setQueueLoading]   = useState(false);
  const [queueFilter,    setQueueFilter]    = useState("all");
  const [showQueueModal, setShowQueueModal] = useState(false);
  const [articles,       setArticles]       = useState<ArticleOption[]>([]);
  const [processing,     setProcessing]     = useState(false);
  const [articleSearch,  setArticleSearch]  = useState("");
  const [captionTemplate, setCaptionTemplate] = useState<string>(DEFAULT_CAPTION_TEMPLATE);
  const [queueForm, setQueueForm] = useState({
    articleId: "",
    accountIds: [] as string[],
    templateFeedId: "",
    templateStoryId: "",
    caption: "",
    types: ["feed"] as string[],
    scheduledAt: "",
  });

  // ── Fetch ──────────────────────────────────────────────────────────────────

  const fetchAccounts = useCallback(async () => {
    setAccountsLoading(true);
    try { setAccounts((await apiFetch("/accounts")) as SocialAccount[]); } finally { setAccountsLoading(false); }
  }, []);

  const fetchTemplates = useCallback(async () => {
    setTemplates((await apiFetch("/templates")) as SocialTemplate[]);
  }, []);

  const fetchQueue = useCallback(async () => {
    setQueueLoading(true);
    try {
      const qs = queueFilter !== "all" ? `?status=${queueFilter}` : "";
      setQueue((await apiFetch(`/queue${qs}`)) as QueueItem[]);
    } finally { setQueueLoading(false); }
  }, [queueFilter]);

  const fetchEditorArticles = useCallback(async () => {
    try {
      const data = (await fetch("/api/articles?limit=200&status=published").then((r) => r.json())) as
        | { articles?: ArticleOption[] }
        | ArticleOption[];
      const list = Array.isArray(data) ? data : (data.articles ?? []);
      setEditorArticles(list as ArticleOption[]);
    } catch { setEditorArticles([]); }
  }, []);

  const fetchSocialConfig = useCallback(async () => {
    try {
      const cfg = (await apiFetch("/config")) as { captionTemplate?: string };
      if (cfg && typeof cfg.captionTemplate === "string" && cfg.captionTemplate.trim()) {
        setCaptionTemplate(cfg.captionTemplate);
      }
    } catch { /* mantém o default */ }
  }, []);

  useEffect(() => { void fetchAccounts(); void fetchTemplates(); void fetchSocialConfig(); }, [fetchAccounts, fetchTemplates, fetchSocialConfig]);
  useEffect(() => { if (tab === "templates" && editorArticles.length === 0) void fetchEditorArticles(); }, [tab, editorArticles.length, fetchEditorArticles]);
  useEffect(() => { if (tab === "queue") void fetchQueue(); }, [tab, fetchQueue]);
  useEffect(() => { if (tab === "queue") void fetchQueue(); }, [queueFilter]);

  // Carrega as fontes do editor (mesmas usadas no render server-side) p/ WYSIWYG.
  useEffect(() => {
    const id = "social-editor-fonts";
    if (document.getElementById(id)) return;
    const link = document.createElement("link");
    link.id = id; link.rel = "stylesheet"; link.href = GOOGLE_FONTS_HREF;
    document.head.appendChild(link);
  }, []);

  // ── Canvas: mover / redimensionar com snapping ─────────────────────────────

  const tplRef = useRef<SocialTemplate | null>(null);
  tplRef.current = currentTemplate;

  useEffect(() => {
    if (!interaction) return;
    const onMove = (e: MouseEvent) => {
      const tpl = tplRef.current;
      if (!tpl) return;
      const dx = (e.clientX - interaction.startX) / SCALE;
      const dy = (e.clientY - interaction.startY) / SCALE;
      const box = applyHandle(interaction.orig, interaction.handle, dx, dy);
      const W = tpl.width, H = tpl.height;
      const others = tpl.elements.filter((el) => el.id !== interaction.id);
      const xT = [0, W / 2, W, ...others.flatMap((el) => [el.x, el.x + el.width / 2, el.x + el.width])];
      const yT = [0, H / 2, H, ...others.flatMap((el) => [el.y, el.y + el.height / 2, el.y + el.height])];
      const gv: number[] = [], gh: number[] = [];

      if (interaction.handle === "move") {
        const sx = bestSnapTriple(box.x, box.width, xT);
        if (sx.line != null) { box.x += sx.delta; gv.push(sx.line); }
        const sy = bestSnapTriple(box.y, box.height, yT);
        if (sy.line != null) { box.y += sy.delta; gh.push(sy.line); }
      } else {
        if (interaction.handle.includes("e")) { const s = snapTo(box.x + box.width, xT); if (s.line != null) { box.width = s.value - box.x; gv.push(s.line); } }
        if (interaction.handle.includes("w")) { const s = snapTo(box.x, xT); if (s.line != null) { box.width += box.x - s.value; box.x = s.value; gv.push(s.line); } }
        if (interaction.handle.includes("s")) { const s = snapTo(box.y + box.height, yT); if (s.line != null) { box.height = s.value - box.y; gh.push(s.line); } }
        if (interaction.handle.includes("n")) { const s = snapTo(box.y, yT); if (s.line != null) { box.height += box.y - s.value; box.y = s.value; gh.push(s.line); } }
        box.width = Math.max(MIN_SIZE, box.width); box.height = Math.max(MIN_SIZE, box.height);
      }

      const nx = Math.round(box.x), ny = Math.round(box.y), nw = Math.round(box.width), nh = Math.round(box.height);
      setCurrentTemplate((prev) => prev ? {
        ...prev,
        elements: prev.elements.map((el) =>
          el.id === interaction.id ? { ...el, x: nx, y: ny, width: nw, height: nh } : el,
        ),
      } : prev);
      setGuides({ v: gv, h: gh });
    };
    const onUp = () => { setInteraction(null); setGuides({ v: [], h: [] }); };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => { window.removeEventListener("mousemove", onMove); window.removeEventListener("mouseup", onUp); };
  }, [interaction]);

  // ── Canvas: teclado (nudge com setas, Delete remove) ───────────────────────

  useEffect(() => {
    if (!selectedElId) return;
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null;
      if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)) return;
      if (e.key === "Delete" || e.key === "Backspace") {
        e.preventDefault();
        setCurrentTemplate((prev) => prev ? { ...prev, elements: prev.elements.filter((el) => el.id !== selectedElId) } : prev);
        setSelectedElId(null);
        return;
      }
      const step = e.shiftKey ? 10 : 1;
      let dx = 0, dy = 0;
      if (e.key === "ArrowLeft") dx = -step;
      else if (e.key === "ArrowRight") dx = step;
      else if (e.key === "ArrowUp") dy = -step;
      else if (e.key === "ArrowDown") dy = step;
      else return;
      e.preventDefault();
      setCurrentTemplate((prev) => prev ? {
        ...prev,
        elements: prev.elements.map((el) => el.id === selectedElId ? { ...el, x: el.x + dx, y: el.y + dy } : el),
      } : prev);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedElId]);

  // ── Account ops ───────────────────────────────────────────────────────────

  async function saveAccount() {
    if (!editingAccount?.name) return;
    setAccountSaving(true);
    try {
      if (editingAccount.id) {
        await apiFetch(`/accounts/${editingAccount.id}`, { method: "PUT", body: JSON.stringify(editingAccount) });
      } else {
        await apiFetch("/accounts", { method: "POST", body: JSON.stringify(editingAccount) });
      }
      setShowAccountModal(false); setEditingAccount(null);
      await fetchAccounts();
    } finally { setAccountSaving(false); }
  }

  async function deleteAccount(id: string) {
    if (!window.confirm("Remover esta conta?")) return;
    await apiFetch(`/accounts/${id}`, { method: "DELETE" });
    await fetchAccounts();
  }

  async function testAccount(id: string) {
    setTestingId(id); setTestStatus((prev) => ({ ...prev, [id]: null }));
    try {
      const r = (await apiFetch(`/accounts/${id}/test`, { method: "POST" })) as { ok: boolean; name?: string; error?: string };
      setTestStatus((prev) => ({ ...prev, [id]: { ok: r.ok, msg: r.ok ? `✓ ${r.name ?? "Conectado"}` : r.error ?? "Erro" } }));
    } catch (e) {
      setTestStatus((prev) => ({ ...prev, [id]: { ok: false, msg: (e as Error).message } }));
    } finally { setTestingId(null); }
  }

  async function toggleAccountActive(account: SocialAccount) {
    await apiFetch(`/accounts/${account.id}`, { method: "PUT", body: JSON.stringify({ isActive: !account.isActive }) });
    await fetchAccounts();
  }

  // ── Template ops ──────────────────────────────────────────────────────────

  function newTemplate(type: "feed" | "story") {
    setCurrentTemplate({
      id: "", name: `Novo ${type === "feed" ? "Feed" : "Story"}`,
      type, width: 1080, height: type === "feed" ? 1350 : 1920,
      backgroundColor: "#1a1a1a", elements: [],
    });
    setSelectedElId(null);
  }

  async function loadTemplate(id: string) {
    const t = (await apiFetch(`/templates/${id}`)) as SocialTemplate;
    setCurrentTemplate({ ...t, elements: (t.elements ?? []) as TemplateElement[] });
    setSelectedElId(null);
  }

  async function saveTemplate() {
    if (!currentTemplate) return;
    setTemplateSaving(true);
    try {
      let saved: SocialTemplate;
      if (currentTemplate.id) {
        saved = (await apiFetch(`/templates/${currentTemplate.id}`, { method: "PUT", body: JSON.stringify(currentTemplate) })) as SocialTemplate;
      } else {
        saved = (await apiFetch("/templates", { method: "POST", body: JSON.stringify(currentTemplate) })) as SocialTemplate;
      }
      setCurrentTemplate((prev) => prev ? { ...prev, id: saved.id } : prev);
      setTemplateSaved(true); setTimeout(() => setTemplateSaved(false), 2000);
      await fetchTemplates();
    } finally { setTemplateSaving(false); }
  }

  async function deleteTemplate(id: string) {
    if (!window.confirm("Remover este template?")) return;
    await apiFetch(`/templates/${id}`, { method: "DELETE" });
    if (currentTemplate?.id === id) setCurrentTemplate(null);
    await fetchTemplates();
  }

  function addElement(type: ElementType) {
    const el = makeElement(type, currentTemplate?.height ?? 1350);
    setCurrentTemplate((prev) => prev ? { ...prev, elements: [...prev.elements, el] } : prev);
    setSelectedElId(el.id);
  }

  function updateElement(id: string, patch: Partial<TemplateElement>) {
    setCurrentTemplate((prev) => prev ? {
      ...prev, elements: prev.elements.map((el) => el.id === id ? { ...el, ...patch } : el),
    } : prev);
  }

  function removeElement(id: string) {
    setCurrentTemplate((prev) => prev ? { ...prev, elements: prev.elements.filter((el) => el.id !== id) } : prev);
    if (selectedElId === id) setSelectedElId(null);
  }

  function moveElementZ(id: string, dir: "up" | "down") {
    setCurrentTemplate((prev) => {
      if (!prev) return prev;
      const sorted = [...prev.elements].sort((a, b) => a.zIndex - b.zIndex);
      const idx = sorted.findIndex((e) => e.id === id);
      if (dir === "up" && idx < sorted.length - 1) {
        const a = sorted[idx]!, b = sorted[idx + 1]!;
        sorted[idx] = { ...b, zIndex: a.zIndex }; sorted[idx + 1] = { ...a, zIndex: b.zIndex };
      } else if (dir === "down" && idx > 0) {
        const a = sorted[idx]!, b = sorted[idx - 1]!;
        sorted[idx] = { ...b, zIndex: a.zIndex }; sorted[idx - 1] = { ...a, zIndex: b.zIndex };
      }
      return { ...prev, elements: sorted };
    });
  }

  async function duplicateTemplate() {
    if (!currentTemplate) return;
    setTemplateSaving(true);
    try {
      const saved = (await apiFetch("/templates", {
        method: "POST",
        body: JSON.stringify({
          name: `${currentTemplate.name} (cópia)`,
          type: currentTemplate.type,
          width: currentTemplate.width,
          height: currentTemplate.height,
          backgroundColor: currentTemplate.backgroundColor,
          elements: currentTemplate.elements,
        }),
      })) as SocialTemplate;
      await fetchTemplates();
      setCurrentTemplate({ ...currentTemplate, id: saved.id, name: `${currentTemplate.name} (cópia)` });
      setSelectedElId(null);
    } finally { setTemplateSaving(false); }
  }

  function applyPreset(kind: PresetKind) {
    setCurrentTemplate(makePreset(kind));
    setSelectedElId(null);
  }

  async function uploadImage(elId: string, file: File) {
    setUploadingElId(elId);
    try {
      const fd = new FormData();
      fd.append("image", file);
      const token = localStorage.getItem("admin_token");
      const res = await fetch("/api/uploads/image", {
        method: "POST",
        headers: token ? { Authorization: `Bearer ${token}` } : {},
        body: fd,
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (data.url) updateElement(elId, { content: data.url });
      else window.alert(data.error ?? "Falha no upload da imagem");
    } catch (e) {
      window.alert((e as Error).message);
    } finally { setUploadingElId(null); }
  }

  async function runPreview() {
    if (!currentTemplate) return;
    setPreviewLoading(true); setPreviewError(null); setPreviewUrl(null);
    try {
      const id = currentTemplate.id || "inline";
      const body = {
        articleId: previewArticleId || undefined,
        template: {
          width: currentTemplate.width,
          height: currentTemplate.height,
          backgroundColor: currentTemplate.backgroundColor,
          elements: currentTemplate.elements,
        },
      };
      const r = (await apiFetch(`/templates/${id}/preview`, { method: "POST", body: JSON.stringify(body) })) as { url?: string; error?: string };
      if (r.url) setPreviewUrl(r.url);
      else setPreviewError(r.error ?? "Falha ao gerar o preview");
    } catch (e) {
      setPreviewError((e as Error).message);
    } finally { setPreviewLoading(false); }
  }

  // ── Queue ops ─────────────────────────────────────────────────────────────

  async function openQueueModal() {
    try {
      const data = (await fetch("/api/articles?limit=200&status=published").then((r) => r.json())) as { articles?: ArticleOption[] } | ArticleOption[];
      const list = Array.isArray(data) ? data : (data.articles ?? []);
      setArticles(list as ArticleOption[]);
    } catch { setArticles([]); }
    setQueueForm({ articleId: "", accountIds: [], templateFeedId: templates[0]?.id ?? "", templateStoryId: "", caption: "", types: ["feed"], scheduledAt: "" });
    setArticleSearch("");
    setShowQueueModal(true);
  }

  async function submitQueueForm() {
    if (!queueForm.articleId || !queueForm.accountIds.length) return;
    await apiFetch("/queue", { method: "POST", body: JSON.stringify(queueForm) });
    setShowQueueModal(false); await fetchQueue();
  }

  async function removeFromQueue(id: string) {
    await apiFetch(`/queue/${id}`, { method: "DELETE" });
    setQueue((q) => q.filter((i) => i.id !== id));
  }

  async function retryQueueItem(id: string) {
    await apiFetch(`/queue/${id}/retry`, { method: "POST" });
    await fetchQueue();
  }

  async function processQueue() {
    setProcessing(true);
    try { await apiFetch("/process", { method: "POST" }); await fetchQueue(); }
    finally { setProcessing(false); }
  }

  function captionFor(a: ArticleOption | undefined): string {
    if (!a) return "";
    return resolveCaption(captionTemplate, {
      title: a.title,
      category: a.category,
      subtitle: a.subtitle,
      author: a.author,
      publishedAt: a.publishedAt,
      site: "sbcagora.com.br",
    }, ["sbcagora", "noticias"]);
  }

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedEl = currentTemplate?.elements.find((e) => e.id === selectedElId) ?? null;
  const previewH   = currentTemplate ? Math.round(currentTemplate.height * SCALE) : 450;

  // Artigo (real ou amostra) usado para resolver os placeholders no canvas.
  const selectedPreviewArticle = editorArticles.find((a) => a.id === previewArticleId);
  const canvasArticle: ArticleData = selectedPreviewArticle
    ? {
        // Canvas usa o título compacto da IA (igual ao render server-side) p/ WYSIWYG.
        title: selectedPreviewArticle.socialTitle || selectedPreviewArticle.title,
        category: selectedPreviewArticle.category,
        subtitle: selectedPreviewArticle.subtitle,
        author: selectedPreviewArticle.author,
        imageUrl: selectedPreviewArticle.imageUrl,
        publishedAt: selectedPreviewArticle.publishedAt,
      }
    : SAMPLE_ARTICLE;

  const HANDLE_CURSOR: Record<Handle, string> = {
    nw: "nwse-resize", n: "ns-resize", ne: "nesw-resize", e: "ew-resize",
    se: "nwse-resize", s: "ns-resize", sw: "nesw-resize", w: "ew-resize", move: "grab",
  };

  function startInteraction(e: React.MouseEvent, el: TemplateElement, handle: Handle) {
    e.preventDefault(); e.stopPropagation();
    setSelectedElId(el.id);
    setInteraction({ id: el.id, handle, startX: e.clientX, startY: e.clientY, orig: { x: el.x, y: el.y, width: el.width, height: el.height } });
  }

  function handlePoint(el: TemplateElement, h: Handle): { cx: number; cy: number } {
    const cx = h.includes("w") ? el.x : h.includes("e") ? el.x + el.width : el.x + el.width / 2;
    const cy = h.includes("n") ? el.y : h.includes("s") ? el.y + el.height : el.y + el.height / 2;
    return { cx, cy };
  }

  /** Conteúdo interno de um elemento no canvas (imagem real ou texto resolvido). */
  function renderElInner(el: TemplateElement) {
    if (el.type === "gradient") return null; // a própria caixa mostra o degradê
    if (isImageType(el.type)) {
      const src = el.type === "image" ? (canvasArticle.imageUrl || el.content) : el.content;
      if (src) return <img src={src} alt="" style={imageInnerStyle(el) as CSSProperties} />;
      return (
        <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 10, color: "rgba(255,255,255,0.55)", fontSize: 26, background: "rgba(255,255,255,0.05)" }}>
          <ImageIcon size={30} /> {ELEMENT_TYPE_LABELS[el.type]}
        </div>
      );
    }
    const text = resolveContent(el.content, canvasArticle) || ELEMENT_TYPE_LABELS[el.type];
    return <AutoFitText el={el} text={text} />;
  }

  const tabBtn = (t: typeof tab, label: string, icon: React.ReactNode) => (
    <button
      onClick={() => setTab(t)}
      className={`flex items-center gap-2 px-5 py-2.5 text-sm font-semibold rounded-xl transition-colors ${
        tab === t ? "bg-white text-[#0B2A66]" : "text-white/70 hover:text-white"
      }`}
      style={tab === t ? { boxShadow: CARD_SHADOW } : {}}
    >
      {icon} {label}
    </button>
  );

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <AdminLayout title="Redes Sociais">

      {/* Tab bar */}
      <div className="flex items-center gap-2 mb-6 bg-[#0B2A66] rounded-2xl p-1.5 w-fit">
        {tabBtn("accounts",  "Contas",    <Facebook size={15} />)}
        {tabBtn("templates", "Templates", <Layers size={15} />)}
        {tabBtn("queue",     "Fila",      <Clock size={15} />)}
      </div>

      {/* ══════════ CONTAS ══════════════════════════════════════════════════ */}
      {tab === "accounts" && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-bold text-slate-800">Contas Meta conectadas</h2>
              <p className="text-sm text-slate-500 mt-0.5">Páginas do Facebook e perfis Instagram Business</p>
            </div>
            <button
              onClick={() => { setEditingAccount({ name: "", isActive: true }); setShowAccountModal(true); }}
              className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold text-white"
              style={{ background: PRIMARY }}
            >
              <Plus size={15} /> Adicionar Conta
            </button>
          </div>

          {accountsLoading ? (
            <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
          ) : accounts.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: CARD_SHADOW }}>
              <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <Share2 size={24} className="text-slate-300" />
              </div>
              <p className="text-sm text-slate-500 font-medium">Nenhuma conta conectada</p>
              <p className="text-xs text-slate-400 mt-1">Adicione uma conta Meta (Facebook/Instagram) para começar</p>
            </div>
          ) : (
            <div className="grid gap-3">
              {accounts.map((acc) => (
                <div key={acc.id} className="bg-white rounded-2xl p-5 flex items-center gap-4" style={{ boxShadow: CARD_SHADOW }}>
                  <div className="w-11 h-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: acc.instagramId ? "#E1306C" : "#1877F2" }}>
                    {acc.instagramId ? <Instagram size={20} className="text-white" /> : <Facebook size={20} className="text-white" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-semibold text-slate-800">{acc.name}</p>
                    <div className="flex items-center gap-3 mt-0.5 flex-wrap text-xs text-slate-500">
                      {acc.pageId      && <span>Page: {acc.pageId}</span>}
                      {acc.instagramId && <span>IG: {acc.instagramId}</span>}
                    </div>
                    {testStatus[acc.id] && (
                      <p className={`text-xs mt-1 font-medium ${testStatus[acc.id]?.ok ? "text-green-600" : "text-red-500"}`}>
                        {testStatus[acc.id]?.msg}
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className={`text-xs px-2.5 py-1 rounded-full font-semibold ${acc.isActive ? "bg-green-100 text-green-700" : "bg-slate-100 text-slate-400"}`}>
                      {acc.isActive ? "Ativo" : "Pausado"}
                    </span>
                    <button onClick={() => { void testAccount(acc.id); }} disabled={testingId === acc.id} title="Testar"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors disabled:opacity-50">
                      {testingId === acc.id ? <Loader2 size={13} className="animate-spin" /> : <TestTube2 size={13} />}
                    </button>
                    <button onClick={() => { void toggleAccountActive(acc); }} title="Ativar/Pausar"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-orange-500 hover:bg-orange-50 transition-colors">
                      {acc.isActive ? <ToggleRight size={15} className="text-green-500" /> : <ToggleLeft size={15} />}
                    </button>
                    <button onClick={() => { setEditingAccount({ ...acc, accessToken: "" }); setShowAccountModal(true); }} title="Editar"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-[#0B2A66] hover:bg-[#EEF2FF] transition-colors">
                      <Pencil size={13} />
                    </button>
                    <button onClick={() => { void deleteAccount(acc.id); }} title="Remover"
                      className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ══════════ TEMPLATES ═══════════════════════════════════════════════ */}
      {tab === "templates" && (
        <div className="flex flex-col gap-4">
          {/* Toolbar */}
          <div className="flex items-center gap-3 flex-wrap bg-white rounded-2xl p-3" style={{ boxShadow: CARD_SHADOW }}>
            <select
              className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] bg-slate-50"
              value={currentTemplate?.id ?? ""}
              onChange={(e) => { if (e.target.value) void loadTemplate(e.target.value); }}
            >
              <option value="">— Selecionar template —</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} ({t.type === "feed" ? "Feed" : "Story"})</option>)}
            </select>
            <button onClick={() => newTemplate("feed")}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white" style={{ background: PRIMARY }}>
              <Plus size={13} /> Feed
            </button>
            <button onClick={() => newTemplate("story")}
              className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl text-white" style={{ background: "#9333EA" }}>
              <Plus size={13} /> Story
            </button>
            <select
              value=""
              onChange={(e) => { if (e.target.value) applyPreset(e.target.value as PresetKind); e.target.value = ""; }}
              className="text-xs border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] bg-slate-50 text-slate-700"
              title="Criar a partir de um modelo pronto"
            >
              <option value="">★ Modelos prontos…</option>
              {PRESETS.map((p) => <option key={p.kind} value={p.kind}>{p.label}</option>)}
            </select>
            {currentTemplate && (
              <div className="flex items-center gap-2 ml-auto flex-wrap">
                <input value={currentTemplate.name}
                  onChange={(e) => setCurrentTemplate((p) => p ? { ...p, name: e.target.value } : p)}
                  className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] min-w-[160px]"
                  placeholder="Nome do template" />
                <select value={currentTemplate.type}
                  onChange={(e) => {
                    const t = e.target.value as "feed" | "story";
                    setCurrentTemplate((p) => p ? { ...p, type: t, height: t === "feed" ? 1350 : 1920 } : p);
                  }}
                  className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] bg-slate-50">
                  <option value="feed">Feed (1080×1350)</option>
                  <option value="story">Story (1080×1920)</option>
                </select>
                <button onClick={() => { void duplicateTemplate(); }} disabled={templateSaving} title="Duplicar template"
                  className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-[#0B2A66] hover:bg-[#EEF2FF] transition-colors disabled:opacity-50">
                  <Copy size={14} />
                </button>
                {currentTemplate.id && (
                  <button onClick={() => { void deleteTemplate(currentTemplate.id); }}
                    className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                )}
                <button onClick={() => { void saveTemplate(); }} disabled={templateSaving}
                  className={`flex items-center gap-1.5 text-xs font-semibold px-4 py-2 rounded-xl text-white disabled:opacity-60 ${templateSaved ? "!bg-green-500" : ""}`}
                  style={!templateSaved ? { background: ACCENT } : {}}>
                  {templateSaving ? <Loader2 size={13} className="animate-spin" /> : templateSaved ? <CheckCircle size={13} /> : <Save size={13} />}
                  {templateSaving ? "Salvando…" : templateSaved ? "Salvo!" : "Salvar"}
                </button>
              </div>
            )}
          </div>

          {!currentTemplate ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: CARD_SHADOW }}>
              <Layers size={32} className="text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Selecione um template ou crie um novo para começar</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 xl:grid-cols-[280px_1fr_300px] gap-4">

              {/* LEFT — Layers */}
              <div className="bg-white rounded-2xl p-4 space-y-3" style={{ boxShadow: CARD_SHADOW }}>
                <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">Camadas</p>
                <div className="grid grid-cols-2 gap-1.5">
                  {ELEMENT_TYPES.map((type) => (
                    <button key={type} onClick={() => addElement(type)}
                      className="flex items-center gap-1.5 text-xs font-medium px-2.5 py-1.5 rounded-lg border border-slate-200 text-slate-700 hover:border-[#0B2A66] hover:text-[#0B2A66] transition-colors">
                      <Plus size={11} /> {ELEMENT_TYPE_LABELS[type]}
                    </button>
                  ))}
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <label className="text-xs text-slate-500 w-12 shrink-0">Fundo</label>
                  <input type="color" value={currentTemplate.backgroundColor}
                    onChange={(e) => setCurrentTemplate((p) => p ? { ...p, backgroundColor: e.target.value } : p)}
                    className="w-8 h-8 rounded cursor-pointer border border-slate-200" />
                  <input type="text" value={currentTemplate.backgroundColor}
                    onChange={(e) => setCurrentTemplate((p) => p ? { ...p, backgroundColor: e.target.value } : p)}
                    className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                  <span className="text-[10px] text-slate-400 leading-tight">degradê?<br/>use camada "Degradê"</span>
                </div>
                <div className="border-t border-slate-100 pt-2 space-y-1">
                  {[...currentTemplate.elements].sort((a, b) => b.zIndex - a.zIndex).map((el) => (
                    <div key={el.id} onClick={() => setSelectedElId(el.id)}
                      className={`flex items-center gap-2 px-2.5 py-2 rounded-xl cursor-pointer transition-colors ${
                        selectedElId === el.id ? "bg-[#EEF2FF] border border-[#C7D2FE]" : "hover:bg-slate-50 border border-transparent"
                      }`}>
                      <span className="text-xs font-medium text-slate-700 flex-1 truncate">
                        {ELEMENT_TYPE_LABELS[el.type] ?? el.type}
                        {el.content ? ` — ${el.content.slice(0, 14)}` : ""}
                      </span>
                      <div className="flex items-center gap-0.5 shrink-0">
                        <button onClick={(e) => { e.stopPropagation(); moveElementZ(el.id, "up"); }}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700">
                          <ChevronUp size={11} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); moveElementZ(el.id, "down"); }}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-slate-700">
                          <ChevronDown size={11} />
                        </button>
                        <button onClick={(e) => { e.stopPropagation(); removeElement(el.id); }}
                          className="w-5 h-5 flex items-center justify-center rounded text-slate-400 hover:text-red-500">
                          <X size={11} />
                        </button>
                      </div>
                    </div>
                  ))}
                  {currentTemplate.elements.length === 0 && (
                    <p className="text-xs text-slate-400 text-center py-4">Adicione elementos acima</p>
                  )}
                </div>
              </div>

              {/* CENTER — Canvas preview (WYSIWYG: mesmo CSS do render server-side) */}
              <div className="bg-white rounded-2xl p-4 flex flex-col items-center" style={{ boxShadow: CARD_SHADOW }}>
                <div className="w-full flex items-center gap-2 mb-3 flex-wrap">
                  <span className="text-xs text-slate-400">
                    {currentTemplate.width}×{currentTemplate.height}px · 1:{Math.round(1 / SCALE)}
                  </span>
                  <select
                    value={previewArticleId}
                    onChange={(e) => setPreviewArticleId(e.target.value)}
                    className="ml-auto text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-slate-50 max-w-[180px]"
                    title="Pré-visualizar com um artigo real"
                  >
                    <option value="">Artigo de amostra</option>
                    {editorArticles.map((a) => <option key={a.id} value={a.id}>{a.title.slice(0, 40)}</option>)}
                  </select>
                  <button onClick={() => { void runPreview(); }} disabled={previewLoading}
                    className="flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-lg text-white disabled:opacity-60"
                    style={{ background: PRIMARY }} title="Renderiza no servidor (Playwright) — exatamente como será postado">
                    {previewLoading ? <Loader2 size={12} className="animate-spin" /> : <Eye size={12} />}
                    Preview real
                  </button>
                </div>

                {/* Container externo (escala visual) → interno em tamanho real 1080×N */}
                <div
                  className="relative shrink-0 overflow-hidden select-none border border-slate-200"
                  style={{ width: PREVIEW_W, height: previewH, background: "#0f172a" }}
                  onMouseDown={() => setSelectedElId(null)}
                >
                  <div style={{
                    position: "absolute", top: 0, left: 0,
                    width: currentTemplate.width, height: currentTemplate.height,
                    transform: `scale(${SCALE})`, transformOrigin: "top left",
                    background: backgroundCss(currentTemplate.backgroundColor, currentTemplate.backgroundGradient),
                  }}>
                    {[...currentTemplate.elements].sort((a, b) => a.zIndex - b.zIndex).map((el) => (
                      <div key={el.id}
                        onMouseDown={(e) => startInteraction(e, el, "move")}
                        style={{
                          ...(elementBoxStyle(el) as CSSProperties),
                          cursor: "grab",
                          outline: selectedElId === el.id ? `${Math.round(2 / SCALE)}px solid #2563EB` : "none",
                        }}
                      >
                        {renderElInner(el)}
                      </div>
                    ))}

                    {/* Safe-area (não exportada) */}
                    {currentTemplate.type === "feed" ? (
                      <div style={{ position: "absolute", left: FEED_SAFE_MARGIN, top: FEED_SAFE_MARGIN, width: currentTemplate.width - 2 * FEED_SAFE_MARGIN, height: currentTemplate.height - 2 * FEED_SAFE_MARGIN, border: `${Math.round(1 / SCALE)}px dashed rgba(255,255,255,0.25)`, zIndex: 9000, pointerEvents: "none" }} />
                    ) : (
                      <>
                        <div style={{ position: "absolute", left: 0, top: 0, width: currentTemplate.width, height: STORY_SAFE_TOP, background: "rgba(244,63,94,0.06)", borderBottom: `${Math.round(1 / SCALE)}px dashed rgba(255,255,255,0.25)`, zIndex: 9000, pointerEvents: "none" }} />
                        <div style={{ position: "absolute", left: 0, bottom: 0, width: currentTemplate.width, height: STORY_SAFE_BOTTOM, background: "rgba(244,63,94,0.06)", borderTop: `${Math.round(1 / SCALE)}px dashed rgba(255,255,255,0.25)`, zIndex: 9000, pointerEvents: "none" }} />
                      </>
                    )}

                    {/* Guias de alinhamento (snapping) */}
                    {guides.v.map((x, i) => (
                      <div key={`gv${i}`} style={{ position: "absolute", left: x, top: 0, width: Math.max(1, Math.round(1 / SCALE)), height: currentTemplate.height, background: "#ec4899", zIndex: 9500, pointerEvents: "none" }} />
                    ))}
                    {guides.h.map((y, i) => (
                      <div key={`gh${i}`} style={{ position: "absolute", top: y, left: 0, height: Math.max(1, Math.round(1 / SCALE)), width: currentTemplate.width, background: "#ec4899", zIndex: 9500, pointerEvents: "none" }} />
                    ))}

                    {/* Alças de redimensionar do elemento selecionado */}
                    {selectedEl && RESIZE_HANDLES.map((h) => {
                      const { cx, cy } = handlePoint(selectedEl, h);
                      const size = Math.round(11 / SCALE);
                      return (
                        <div key={h}
                          onMouseDown={(e) => startInteraction(e, selectedEl, h)}
                          style={{
                            position: "absolute", left: cx - size / 2, top: cy - size / 2,
                            width: size, height: size, background: "#ffffff",
                            border: `${Math.max(1, Math.round(2 / SCALE))}px solid #2563EB`,
                            borderRadius: Math.round(2 / SCALE), zIndex: 10000, cursor: HANDLE_CURSOR[h],
                          }}
                        />
                      );
                    })}
                  </div>
                </div>

                {previewError && <p className="text-[11px] text-red-500 mt-2 self-start">{previewError}</p>}
              </div>

              {/* RIGHT — Properties */}
              <div className="bg-white rounded-2xl p-4 space-y-3 overflow-y-auto max-h-[700px]" style={{ boxShadow: CARD_SHADOW }}>
                {!selectedEl ? (
                  <div className="flex items-center justify-center h-40 text-slate-300 text-sm text-center">
                    Clique num elemento no canvas para editar suas propriedades
                  </div>
                ) : (
                  <>
                    <p className="text-xs font-bold text-slate-500 uppercase tracking-wide">{ELEMENT_TYPE_LABELS[selectedEl.type]}</p>

                    {/* Position & Size */}
                    <div className="grid grid-cols-2 gap-2">
                      {(["x","y","width","height"] as const).map((prop) => (
                        <div key={prop}>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            {prop === "x" ? "X" : prop === "y" ? "Y" : prop === "width" ? "Largura" : "Altura"}
                          </label>
                          <input type="number" value={selectedEl[prop]}
                            onChange={(e) => updateElement(selectedEl.id, { [prop]: Number(e.target.value) })}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                        </div>
                      ))}
                    </div>

                    {/* Content */}
                    {selectedEl.type !== "gradient" && (
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                        {isImageType(selectedEl.type) ? "Imagem (URL ou upload)" : "Conteúdo"}
                      </label>
                      {isImageType(selectedEl.type) ? (
                        <div className="flex items-center gap-1.5">
                          <input type="text" value={selectedEl.content}
                            onChange={(e) => updateElement(selectedEl.id, { content: e.target.value })}
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]"
                            placeholder={selectedEl.type === "image" ? "URL de fallback (usa a imagem do artigo)" : selectedEl.type === "overlay" ? "PNG transparente (máscara do Canva)" : "https://…/logo.png"} />
                          <label className="w-8 h-8 flex items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:text-[#0B2A66] hover:border-[#0B2A66] cursor-pointer shrink-0" title="Enviar imagem">
                            <input type="file" accept="image/png,image/jpeg,image/webp" hidden
                              onChange={(e) => { const f = e.target.files?.[0]; if (f) void uploadImage(selectedEl.id, f); e.target.value = ""; }} />
                            {uploadingElId === selectedEl.id ? <Loader2 size={13} className="animate-spin" /> : <Upload size={13} />}
                          </label>
                        </div>
                      ) : (
                        <textarea rows={2} value={selectedEl.content}
                          onChange={(e) => updateElement(selectedEl.id, { content: e.target.value })}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] resize-none"
                          placeholder={selectedEl.type === "title" ? "{{title}}" : selectedEl.type === "category" ? "{{category}}" : "Texto…"} />
                      )}
                      {selectedEl.type === "overlay" && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Moldura/arte em PNG transparente. Use z-index alto para ficar sobre a foto.</p>
                      )}
                      {!isImageType(selectedEl.type) && (
                        <p className="text-[10px] text-slate-400 mt-0.5">Variáveis: {"{{title}} {{subtitle}} {{category}} {{date}} {{author}}"}</p>
                      )}
                    </div>
                    )}

                    {/* Tipografia — apenas tipos de texto */}
                    {!isImageType(selectedEl.type) && selectedEl.type !== "gradient" && (
                      <>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Fonte</label>
                            <select value={selectedEl.fontFamily}
                              onChange={(e) => updateElement(selectedEl.id, { fontFamily: e.target.value })}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-white">
                              {FONT_FAMILIES.map((f) => <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>{f}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Tamanho</label>
                            <input type="number" value={selectedEl.fontSize}
                              onChange={(e) => updateElement(selectedEl.id, { fontSize: Number(e.target.value) })}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Peso</label>
                            <select value={selectedEl.fontWeight}
                              onChange={(e) => updateElement(selectedEl.id, { fontWeight: e.target.value })}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-white">
                              {["normal","bold","light"].map((w) => <option key={w} value={w}>{w}</option>)}
                            </select>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Alinhamento</label>
                            <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                              {(["left","center","right"] as const).map((a) => (
                                <button key={a} onClick={() => updateElement(selectedEl.id, { textAlign: a })}
                                  className={`flex-1 py-1.5 flex items-center justify-center transition-colors ${
                                    selectedEl.textAlign === a ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"
                                  }`}>
                                  {a === "left" ? <AlignLeft size={11} /> : a === "center" ? <AlignCenter size={11} /> : <AlignRight size={11} />}
                                </button>
                              ))}
                            </div>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Alinhamento vertical</label>
                          <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                            {([["top", ArrowUpToLine], ["middle", FoldVertical], ["bottom", ArrowDownToLine]] as const).map(([v, Icon]) => (
                              <button key={v} onClick={() => updateElement(selectedEl.id, { verticalAlign: v })}
                                className={`flex-1 py-1.5 flex items-center justify-center transition-colors ${
                                  (selectedEl.verticalAlign ?? "top") === v ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"
                                }`}>
                                <Icon size={11} />
                              </button>
                            ))}
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cor do texto</label>
                            <div className="flex items-center gap-1.5">
                              <input type="color" value={selectedEl.color}
                                onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                                className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0" />
                              <input type="text" value={selectedEl.color}
                                onChange={(e) => updateElement(selectedEl.id, { color: e.target.value })}
                                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Espaç. letras</label>
                            <input type="number" step={0.5} value={selectedEl.letterSpacing ?? 0}
                              onChange={(e) => updateElement(selectedEl.id, { letterSpacing: Number(e.target.value) })}
                              className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                          </div>
                        </div>
                        <div className="grid grid-cols-2 gap-2">
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cor de destaque</label>
                            <div className="flex items-center gap-1.5">
                              <input type="color" value={selectedEl.accentColor || DEFAULT_ACCENT}
                                onChange={(e) => updateElement(selectedEl.id, { accentColor: e.target.value })}
                                className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0" />
                              <input type="text" value={selectedEl.accentColor ?? ""}
                                onChange={(e) => updateElement(selectedEl.id, { accentColor: e.target.value })}
                                placeholder={DEFAULT_ACCENT}
                                className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                            </div>
                          </div>
                          <div>
                            <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Auto-ajustar</label>
                            <button onClick={() => updateElement(selectedEl.id, { autoFit: !selectedEl.autoFit })}
                              className={`w-full py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                selectedEl.autoFit ? "bg-[#0B2A66] text-white" : "border border-slate-200 text-slate-500 hover:bg-slate-50"
                              }`}>
                              {selectedEl.autoFit ? "Ligado (não corta)" : "Desligado"}
                            </button>
                          </div>
                        </div>
                        <p className="text-[10px] text-slate-400 -mt-1">Destaque um trecho com *asteriscos* (ex.: WWW.*SEUSITE*.COM.BR). "Auto-ajustar" reduz a fonte p/ caber sem cortar.</p>
                      </>
                    )}

                    {/* Preenchimento do fundo — sólido ou degradê (todo elemento de caixa) */}
                    {!isImageType(selectedEl.type) && (
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Preenchimento (fundo)</label>
                        <div className="flex rounded-lg border border-slate-200 overflow-hidden mb-2">
                          {(["solid", "gradient"] as const).map((f) => (
                            <button key={f}
                              onClick={() => updateElement(selectedEl.id, f === "gradient"
                                ? { fill: "gradient", gradient: selectedEl.gradient ?? defaultGradient() }
                                : { fill: "solid" })}
                              className={`flex-1 py-1.5 text-xs font-medium transition-colors ${
                                (selectedEl.fill ?? "solid") === f ? "bg-[#0B2A66] text-white" : "text-slate-500 hover:bg-slate-50"
                              }`}>
                              {f === "solid" ? "Sólido" : "Degradê"}
                            </button>
                          ))}
                        </div>
                        {(selectedEl.fill ?? "solid") === "gradient" ? (
                          <GradientControls
                            value={selectedEl.gradient ?? defaultGradient()}
                            onChange={(g) => updateElement(selectedEl.id, { fill: "gradient", gradient: g })}
                          />
                        ) : (
                          <div className="flex items-center gap-1.5">
                            <input type="color" value={selectedEl.backgroundColor || "#000000"}
                              onChange={(e) => updateElement(selectedEl.id, { backgroundColor: e.target.value })}
                              className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0" />
                            <input type="text" value={selectedEl.backgroundColor}
                              onChange={(e) => updateElement(selectedEl.id, { backgroundColor: e.target.value })}
                              className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]"
                              placeholder="transparent" />
                          </div>
                        )}
                      </div>
                    )}

                    {/* objectFit */}
                    {isImageType(selectedEl.type) && (
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Ajuste de imagem</label>
                        <select value={selectedEl.objectFit ?? "cover"}
                          onChange={(e) => updateElement(selectedEl.id, { objectFit: e.target.value as "cover" | "contain" | "fill" })}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66] bg-white">
                          {["cover","contain","fill"].map((v) => <option key={v} value={v}>{v}</option>)}
                        </select>
                      </div>
                    )}

                    {/* Borda (contorno) — útil p/ pílulas de URL e molduras */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Borda (px)</label>
                        <input type="number" min={0} value={selectedEl.borderWidth ?? 0}
                          onChange={(e) => updateElement(selectedEl.id, { borderWidth: Number(e.target.value) })}
                          className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">Cor da borda</label>
                        <div className="flex items-center gap-1.5">
                          <input type="color" value={selectedEl.borderColor || "#ffffff"}
                            onChange={(e) => updateElement(selectedEl.id, { borderColor: e.target.value })}
                            className="w-7 h-7 rounded cursor-pointer border border-slate-200 shrink-0" />
                          <input type="text" value={selectedEl.borderColor ?? ""}
                            onChange={(e) => updateElement(selectedEl.id, { borderColor: e.target.value })}
                            placeholder="#ffffff"
                            className="flex-1 text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                        </div>
                      </div>
                    </div>

                    {/* Numeric props */}
                    <div className="grid grid-cols-2 gap-2">
                      {(["padding","borderRadius","opacity","zIndex"] as const).map((prop) => (
                        <div key={prop}>
                          <label className="block text-[10px] font-semibold text-slate-500 uppercase mb-1">
                            {prop === "padding" ? "Padding" : prop === "borderRadius" ? "Raio borda" : prop === "opacity" ? "Opacidade" : "Z-Index"}
                          </label>
                          <input type="number"
                            step={prop === "opacity" ? 0.1 : 1} min={0} max={prop === "opacity" ? 1 : undefined}
                            value={selectedEl[prop]}
                            onChange={(e) => updateElement(selectedEl.id, { [prop]: Number(e.target.value) })}
                            className="w-full text-xs border border-slate-200 rounded-lg px-2 py-1.5 outline-none focus:border-[#0B2A66]" />
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ══════════ FILA ════════════════════════════════════════════════════ */}
      {tab === "queue" && (
        <div className="space-y-4">
          <div className="flex items-center gap-3 flex-wrap">
            <h2 className="text-lg font-bold text-slate-800 flex-1">Fila de publicação</h2>
            <select value={queueFilter} onChange={(e) => setQueueFilter(e.target.value)}
              className="text-sm border border-slate-200 rounded-xl px-3 py-2 outline-none focus:border-[#0B2A66] bg-white">
              <option value="all">Todos</option>
              <option value="pending">Aguardando</option>
              <option value="processing">Processando</option>
              <option value="published">Publicado</option>
              <option value="failed">Falhou</option>
            </select>
            <button onClick={() => { void processQueue(); }} disabled={processing}
              className="flex items-center gap-2 px-3 py-2 rounded-xl text-xs font-semibold text-white disabled:opacity-50"
              style={{ background: "#16A34A" }}>
              {processing ? <Loader2 size={13} className="animate-spin" /> : <Play size={13} />}
              {processing ? "Processando…" : "Processar agora"}
            </button>
            <button onClick={() => { void fetchQueue(); }} title="Atualizar"
              className="w-9 h-9 flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50 transition-colors">
              <RefreshCw size={14} />
            </button>
            <button onClick={() => { void openQueueModal(); }}
              className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold text-white"
              style={{ background: PRIMARY }}>
              <Plus size={15} /> Adicionar à fila
            </button>
          </div>

          {queueLoading ? (
            <div className="flex items-center gap-2 text-slate-400 py-8"><Loader2 size={18} className="animate-spin" /> Carregando…</div>
          ) : queue.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center" style={{ boxShadow: CARD_SHADOW }}>
              <Clock size={32} className="text-slate-200 mx-auto mb-3" />
              <p className="text-sm text-slate-400">Nenhum item na fila</p>
            </div>
          ) : (
            <div className="bg-white rounded-2xl overflow-hidden overflow-x-auto" style={{ boxShadow: CARD_SHADOW }}>
              <table className="w-full min-w-[720px]">
                <thead>
                  <tr className="border-b border-slate-100">
                    {["Artigo","Conta","Tipo","Status","Agendado","Ações"].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold text-slate-400 uppercase tracking-wide">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {queue.map((item) => {
                    const sc: Record<string, string> = { pending:"bg-amber-50 text-amber-600", processing:"bg-blue-50 text-blue-600", published:"bg-green-50 text-green-700", failed:"bg-red-50 text-red-600" };
                    const sl: Record<string, string> = { pending:"Aguardando", processing:"Processando", published:"Publicado", failed:"Falhou" };
                    return (
                      <tr key={item.id} className="hover:bg-slate-50/60 group transition-colors">
                        <td className="px-4 py-3">
                          <p className="text-sm text-slate-800 font-medium truncate max-w-[200px]" title={item.articleTitle ?? ""}>
                            {item.articleTitle ?? item.articleId.slice(0, 8) + "…"}
                          </p>
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-600 whitespace-nowrap">{item.accountName ?? "—"}</td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${item.type === "story" ? "bg-purple-100 text-purple-700" : "bg-blue-100 text-blue-700"}`}>
                            {item.type === "story" ? "Story" : "Feed"}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${sc[item.status] ?? "bg-slate-100 text-slate-500"}`}>
                            {sl[item.status] ?? item.status}
                          </span>
                          {item.errorMessage && (
                            <p className="text-[11px] text-red-500 mt-0.5 truncate max-w-[140px]" title={item.errorMessage}>{item.errorMessage}</p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm text-slate-500 whitespace-nowrap">
                          {item.status === "published" ? fmtDate(item.publishedAt) : fmtDate(item.scheduledAt)}
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            {item.status === "failed" && (
                              <button onClick={() => { void retryQueueItem(item.id); }} title="Tentar novamente"
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-green-600 hover:bg-green-50 transition-colors">
                                <RefreshCw size={12} />
                              </button>
                            )}
                            {item.metaPostId && (
                              <a href={`https://www.instagram.com/p/${item.metaPostId}`} target="_blank" rel="noreferrer"
                                className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                                <Link2 size={12} />
                              </a>
                            )}
                            <button onClick={() => { void removeFromQueue(item.id); }} title="Remover"
                              className="w-7 h-7 flex items-center justify-center rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ══════════ MODAL — Conta ══════════════════════════════════════════ */}
      {showAccountModal && editingAccount && (
        <AccountModal
          editingAccount={editingAccount}
          setEditingAccount={setEditingAccount}
          accountSaving={accountSaving}
          onSave={() => { void saveAccount(); }}
          onClose={() => { setShowAccountModal(false); setEditingAccount(null); }}
        />
      )}

      {/* ══════════ MODAL — Adicionar à fila ═══════════════════════════════ */}
      {showQueueModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between p-6 border-b border-slate-100">
              <h3 className="text-base font-bold text-slate-800">Adicionar à fila de publicação</h3>
              <button onClick={() => setShowQueueModal(false)}
                className="w-8 h-8 flex items-center justify-center rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition-colors">
                <X size={16} />
              </button>
            </div>
            <div className="p-6 space-y-5">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Artigo *</label>
                <input
                  type="text"
                  value={articleSearch}
                  onChange={(e) => setArticleSearch(e.target.value)}
                  placeholder="Buscar por título ou editoria…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66] bg-slate-50 mb-2"
                />
                <div className="border border-slate-200 rounded-xl overflow-hidden max-h-52 overflow-y-auto bg-slate-50">
                  {articles.length === 0 && (
                    <p className="text-sm text-slate-400 p-3 text-center">Nenhum artigo publicado encontrado.</p>
                  )}
                  {articles
                    .filter((a) => {
                      const q = articleSearch.toLowerCase();
                      return !q || a.title.toLowerCase().includes(q) || (a.category ?? "").toLowerCase().includes(q);
                    })
                    .map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => setQueueForm((f) => ({ ...f, articleId: a.id, caption: f.caption.trim() ? f.caption : captionFor(a) }))}
                        className={`w-full text-left px-3 py-2.5 flex items-start gap-2 border-b border-slate-100 last:border-0 hover:bg-white transition-colors ${queueForm.articleId === a.id ? "bg-blue-50 border-l-2 border-l-[#0B2A66]" : ""}`}
                      >
                        {a.imageUrl && (
                          <img src={a.imageUrl} alt="" className="w-10 h-10 rounded-lg object-cover shrink-0 mt-0.5" />
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-slate-800 truncate leading-tight">{a.title}</p>
                          {a.category && <p className="text-[11px] text-slate-400 mt-0.5">{a.category}</p>}
                        </div>
                        {queueForm.articleId === a.id && (
                          <CheckCircle size={14} className="text-[#0B2A66] shrink-0 mt-1" />
                        )}
                      </button>
                    ))
                  }
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Contas *</label>
                <div className="space-y-2">
                  {accounts.filter((a) => a.isActive).map((acc) => (
                    <label key={acc.id} className="flex items-center gap-2.5 cursor-pointer">
                      <input type="checkbox"
                        checked={queueForm.accountIds.includes(acc.id)}
                        onChange={(e) => setQueueForm((f) => ({
                          ...f,
                          accountIds: e.target.checked ? [...f.accountIds, acc.id] : f.accountIds.filter((id) => id !== acc.id),
                        }))} />
                      <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0" style={{ background: acc.instagramId ? "#E1306C" : "#1877F2" }}>
                        {acc.instagramId ? <Instagram size={12} className="text-white" /> : <Facebook size={12} className="text-white" />}
                      </div>
                      <span className="text-sm text-slate-700">{acc.name}</span>
                    </label>
                  ))}
                  {accounts.filter((a) => a.isActive).length === 0 && (
                    <p className="text-sm text-slate-400">Nenhuma conta ativa. Adicione contas na aba "Contas".</p>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Tipo</label>
                <div className="flex gap-4">
                  {(["feed","story"] as const).map((t) => (
                    <label key={t} className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox"
                        checked={queueForm.types.includes(t)}
                        onChange={(e) => setQueueForm((f) => ({
                          ...f, types: e.target.checked ? [...f.types, t] : f.types.filter((x) => x !== t),
                        }))} />
                      <span className="text-sm text-slate-700">{t === "feed" ? "Feed (1080×1350)" : "Story (1080×1920)"}</span>
                    </label>
                  ))}
                </div>
              </div>
              {queueForm.types.includes("feed") && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Template Feed</label>
                  <select value={queueForm.templateFeedId}
                    onChange={(e) => setQueueForm((f) => ({ ...f, templateFeedId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0B2A66] bg-slate-50">
                    <option value="">Sem template (sem arte)</option>
                    {templates.filter((t) => t.type === "feed").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              {queueForm.types.includes("story") && (
                <div>
                  <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Template Story</label>
                  <select value={queueForm.templateStoryId}
                    onChange={(e) => setQueueForm((f) => ({ ...f, templateStoryId: e.target.value }))}
                    className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0B2A66] bg-slate-50">
                    <option value="">Sem template (sem arte)</option>
                    {templates.filter((t) => t.type === "story").map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                  </select>
                </div>
              )}
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Legenda</label>
                <textarea rows={3} value={queueForm.caption}
                  onChange={(e) => setQueueForm((f) => ({ ...f, caption: e.target.value }))}
                  placeholder="Escreva a legenda que acompanhará a publicação…"
                  className="w-full border border-slate-200 rounded-xl px-3 py-2 text-sm outline-none focus:border-[#0B2A66] resize-none bg-slate-50" />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1.5">Agendar para</label>
                <input type="datetime-local" value={queueForm.scheduledAt}
                  onChange={(e) => setQueueForm((f) => ({ ...f, scheduledAt: e.target.value }))}
                  className="w-full border border-slate-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-[#0B2A66] bg-slate-50" />
                <p className="text-[11px] text-slate-400 mt-1">Deixe em branco para publicar imediatamente (na próxima execução do cron)</p>
              </div>
            </div>
            <div className="flex gap-2 p-6 pt-0">
              <button
                onClick={() => { void submitQueueForm(); }}
                disabled={!queueForm.articleId || !queueForm.accountIds.length || !queueForm.types.length}
                className="flex-1 flex items-center justify-center gap-2 py-2.5 rounded-xl text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: PRIMARY }}>
                <Send size={14} /> Adicionar à fila
              </button>
              <button onClick={() => setShowQueueModal(false)}
                className="px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 bg-slate-100 hover:bg-slate-200 transition-colors">
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ══════════ MODAL — Preview real (render server-side) ═══════════════ */}
      {previewUrl && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setPreviewUrl(null)}>
          <div className="relative max-h-[92vh] max-w-[92vw] flex flex-col items-center gap-3" onClick={(e) => e.stopPropagation()}>
            <img src={previewUrl} alt="Preview"
              className="rounded-xl shadow-2xl max-h-[82vh] w-auto object-contain bg-white" />
            <div className="flex items-center gap-2">
              <a href={previewUrl} target="_blank" rel="noreferrer"
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white text-slate-700 hover:bg-slate-100 transition-colors">
                <Eye size={13} /> Abrir em nova aba
              </a>
              <button onClick={() => setPreviewUrl(null)}
                className="flex items-center gap-1.5 text-xs font-semibold px-3 py-2 rounded-xl bg-white text-slate-700 hover:bg-slate-100 transition-colors">
                <X size={13} /> Fechar
              </button>
            </div>
          </div>
        </div>
      )}
    </AdminLayout>
  );
}
