import React, { useState, useEffect, useRef, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useSite } from "@/hooks/useSite";
import { useToast } from "@/hooks/use-toast";
import {
  Share2, Instagram, Facebook, Eye, Send, CheckCircle,
  XCircle, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  Copy, AlertTriangle, Image as ImageIcon, Layers,
  Hash, Info, Save, AlignLeft, Building2, Folder,
  Type, Layout, Smile, FileText, Megaphone, ToggleLeft, ToggleRight,
  Plus, MoreVertical, Pencil, Copy as CopyIcon, Upload,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────
interface SocialConfig {
  instagramUserId?: string;
  facebookPageId?: string;
  pageAccessToken?: string;
  feedCaption?: string;
  storyCaption?: string;
  autoPublishFeed?: boolean;
  autoPublishStory?: boolean;
  autoPublishFacebook?: boolean;
  autoPublishIntervalHours?: number;
  templateShowLogo?: boolean;
  templateShowCategory?: boolean;
  templateCustomLogoBase64?: string;
  templateGradientFrom?: string;
  templateGradientTo?: string;
  lastPublishedAt?: string;
  templateTitleSizeScale?: number;
  templateTitleOffsetX?: number;
  templateTitleOffsetY?: number;
  templateTitleFont?: string;
  templateLogoScale?: number;
  templateLogoPosition?: "top-right" | "top-left" | "bottom-left" | "bottom-right";
  templateCategoryOffsetX?: number;
  templateCategoryOffsetY?: number;
  templatePhotoRatio?: number;
  templatePhotoCropY?: "top" | "center" | "bottom";
  templatePhotoVignette?: number;
  templatePanelColor?: string;
  templateAccentColor?: string;
  templateTitleColor?: string;
  templateTitleMaxLines?: number;
  templateShowSubtitle?: boolean;
  templateSiteUrl?: string;
  captionUseTitulo?: boolean;
  captionUseResumo?: boolean;
  captionIncludePortal?: boolean;
  captionIncludeCategoria?: boolean;
  captionIncludeHashtags?: boolean;
  captionIncludeCTA?: boolean;
  captionLimitChars?: boolean;
  captionCharLimit?: "feed" | "story" | "facebook";
  captionUseEmojis?: boolean;
  captionSeparateBlocks?: boolean;
  captionPrefixo?: string;
  captionCTA?: string;
  captionHashtagsFixed?: string;
  captionAssinatura?: string;
  captionTom?: string;
  templateLayout?: string;
  templateOverlayOpacity?: number;
  templateCategoryStyle?: string;
  templateShowAuthor?: boolean;
  templateShowDate?: boolean;
  templateShowCTA?: boolean;
}

interface Article {
  id: string;
  title: string;
  subtitle?: string;
  category: string;
  tag?: string;
  imageUrl?: string;
  keywords?: string;
  publishedAt?: string;
}

type ActiveTab = "credenciais" | "template" | "legenda" | "publicar";
type TemplateType = "feed" | "story" | "facebook";

const FB_W = 1200, FB_H = 630;

// ─── Constants ────────────────────────────────────────────────────────────────
const FEED_W = 1080, FEED_H = 1350;
const STORY_W = 1080, STORY_H = 1920;

const CATEGORY_COLORS: Record<string, string> = {
  politica: "#c8102e", cidade: "#0b3d91",  seguranca: "#7c3aed",
  transporte: "#ea580c", saude: "#16a34a", educacao: "#0891b2",
  cultura: "#db2777", esportes: "#ca8a04", colunas: "#6b7280",
  brasil: "#c8102e", mundo: "#0b3d91",    economia: "#059669",
  tecnologia: "#7c3aed", geral: "#374151",
};

const DEFAULT_FEED_CAPTION =
  "{{titulo}}\n\n{{resumo}}\n\n{{tags}}\n\nLeia mais na íntegra no link da bio! 🚀\nAcesse:";
const DEFAULT_STORY_CAPTION =
  "{{titulo}}\n\n{{tags}}\n\nLeia mais no link da bio! 🚀";

// ─── Canvas rendering ─────────────────────────────────────────────────────────
function hexToRgb(hex: string) {
  const c = (hex ?? "#1a2448").replace("#", "");
  return {
    r: parseInt(c.slice(0, 2), 16) || 26,
    g: parseInt(c.slice(2, 4), 16) || 36,
    b: parseInt(c.slice(4, 6), 16) || 72,
  };
}

function wrapText(ctx: CanvasRenderingContext2D, text: string, maxW: number): string[] {
  const words = text.split(" ");
  const lines: string[] = [];
  let cur = "";
  for (const w of words) {
    const test = cur ? `${cur} ${w}` : w;
    if (ctx.measureText(test).width > maxW && cur) { lines.push(cur); cur = w; }
    else cur = test;
  }
  if (cur) lines.push(cur);
  return lines;
}

function renderCanvas(
  canvas: HTMLCanvasElement,
  type: TemplateType,
  article: Article | null,
  cfg: SocialConfig,
  logoBase64?: string,
  siteName?: string,
) {
  const W = type === "feed" ? FEED_W : type === "story" ? STORY_W : FB_W;
  const H = type === "feed" ? FEED_H : type === "story" ? STORY_H : FB_H;
  canvas.width = W;
  canvas.height = H;
  const ctx = canvas.getContext("2d")!;

  const doDraw = (bgImg?: HTMLImageElement, logoImg?: HTMLImageElement) => {
    ctx.clearRect(0, 0, W, H);
    ctx.shadowBlur = 0;

    const PAD         = Math.round(W * 0.058);
    const photoRatio  = cfg.templatePhotoRatio   ?? 0.54;
    const PHOTO_H     = Math.round(H * photoRatio);
    const panelColor  = cfg.templatePanelColor   ?? "#1a2448";
    const accentColor = cfg.templateAccentColor  ?? "#f59e0b";
    const titleColor  = cfg.templateTitleColor   ?? "#ffffff";
    const fontFamily  = cfg.templateTitleFont    ?? "Inter, Arial, sans-serif";
    const cropY       = cfg.templatePhotoCropY   ?? "center";
    const vigStrength = cfg.templatePhotoVignette ?? 0.40;
    const maxLines    = cfg.templateTitleMaxLines ?? 4;
    const showSub     = cfg.templateShowSubtitle  ?? false;
    const { r: pr, g: pg, b: pb } = hexToRgb(panelColor);

    // 1. Photo area — cover crop with vertical alignment
    if (bgImg) {
      ctx.save();
      ctx.beginPath();
      ctx.rect(0, 0, W, PHOTO_H);
      ctx.clip();
      const ar  = bgImg.width / bgImg.height;
      const car = W / PHOTO_H;
      let sx = 0, sy = 0, sw = bgImg.width, sh = bgImg.height;
      if (ar > car) {
        sw = bgImg.height * car;
        sx = (bgImg.width - sw) / 2;
      } else {
        sh = bgImg.width / car;
        const extra = bgImg.height - sh;
        sy = cropY === "top" ? 0 : cropY === "bottom" ? extra : extra / 2;
      }
      ctx.drawImage(bgImg, sx, sy, sw, sh, 0, 0, W, PHOTO_H);
      ctx.restore();

      // Vignette — bottom of photo bleeds into panel
      if (vigStrength > 0) {
        const vigH = Math.round(PHOTO_H * 0.55);
        const vg   = ctx.createLinearGradient(0, PHOTO_H - vigH, 0, PHOTO_H);
        vg.addColorStop(0, `rgba(${pr},${pg},${pb},0)`);
        vg.addColorStop(1, `rgba(${pr},${pg},${pb},${vigStrength})`);
        ctx.fillStyle = vg;
        ctx.fillRect(0, PHOTO_H - vigH, W, vigH);
      }
    } else {
      const g = ctx.createLinearGradient(0, 0, W, PHOTO_H);
      g.addColorStop(0, "#2a3a5e"); g.addColorStop(1, panelColor);
      ctx.fillStyle = g; ctx.fillRect(0, 0, W, PHOTO_H);
    }

    // 2. Dark panel (bottom portion)
    ctx.fillStyle = panelColor;
    ctx.fillRect(0, PHOTO_H, W, H - PHOTO_H);

    // 3. Logo (overlaid on photo)
    if (cfg.templateShowLogo && logoImg) {
      const logoScale = cfg.templateLogoScale ?? 1.0;
      const lW = Math.round(W * 0.20 * logoScale);
      const lH = Math.round(lW * (logoImg.height / logoImg.width));
      const logoPos = cfg.templateLogoPosition ?? "top-right";
      let lx: number, ly: number;
      if      (logoPos === "top-left")     { lx = PAD;          ly = PAD; }
      else if (logoPos === "bottom-left")  { lx = PAD;          ly = PHOTO_H - lH - Math.round(PAD * 0.6); }
      else if (logoPos === "bottom-right") { lx = W - PAD - lW; ly = PHOTO_H - lH - Math.round(PAD * 0.6); }
      else                                 { lx = W - PAD - lW; ly = PAD; }
      ctx.drawImage(logoImg, lx, ly, lW, lH);
    }

    // 4. Category badge — top of dark panel
    const panelPad = Math.round(H * 0.030);
    let curY = PHOTO_H + panelPad;

    if (cfg.templateShowCategory !== false && article?.category) {
      const catOffX   = cfg.templateCategoryOffsetX ?? 0;
      const catOffY   = cfg.templateCategoryOffsetY ?? 0;
      const badgeText = (article.tag ?? article.category).toUpperCase();
      const fs  = Math.round(W * 0.030);
      ctx.font  = `700 ${fs}px Inter, Arial, sans-serif`;
      const tm  = ctx.measureText(badgeText);
      const bh  = Math.round(W * 0.052);
      const bw  = tm.width + Math.round(W * 0.042);
      const bx  = PAD + Math.round(W * catOffX);
      const by  = curY + Math.round(H * catOffY);
      ctx.fillStyle    = accentColor;
      ctx.beginPath();
      ctx.roundRect(bx, by, bw, bh, 8);
      ctx.fill();
      ctx.fillStyle    = "#1a2448";
      ctx.textAlign    = "left";
      ctx.textBaseline = "middle";
      ctx.fillText(badgeText, bx + Math.round(W * 0.018), by + bh / 2);
      curY = by + bh + Math.round(H * 0.022);
    }

    // 5. Title — configurable color + max lines
    const cleanTitle = (article?.title ?? "").replace(/<[^>]*>/g, "");
    if (cleanTitle) {
      const sizeScale  = cfg.templateTitleSizeScale ?? 1.0;
      const baseFs     = type === "feed" ? Math.round(W * 0.074) : Math.round(W * 0.070);
      const fs         = Math.round(baseFs * sizeScale);
      ctx.font         = `800 ${fs}px ${fontFamily}`;
      ctx.fillStyle    = titleColor;
      ctx.textAlign    = "left";
      ctx.textBaseline = "top";
      const offX   = Math.round(W * (cfg.templateTitleOffsetX ?? 0));
      const offY   = Math.round(H * (cfg.templateTitleOffsetY ?? 0));
      const titleX = PAD + offX;
      const maxW   = W - PAD - offX - PAD;
      const lines  = wrapText(ctx, cleanTitle, Math.max(maxW, W * 0.5)).slice(0, maxLines);
      const lh     = fs * 1.16;
      lines.forEach((ln, i) => ctx.fillText(ln, titleX, curY + offY + i * lh));
      curY += lines.length * lh + Math.round(H * 0.014) + offY;
    }

    // 6. Subtitle — accent italic, toggleable
    if (showSub) {
      const cleanSub = (article?.subtitle ?? "").replace(/<[^>]*>/g, "");
      if (cleanSub) {
        const sizeScale  = cfg.templateTitleSizeScale ?? 1.0;
        const baseFs     = type === "feed" ? Math.round(W * 0.063) : Math.round(W * 0.059);
        const fs         = Math.round(baseFs * sizeScale);
        ctx.font         = `700 italic ${fs}px ${fontFamily}`;
        ctx.fillStyle    = accentColor;
        ctx.textAlign    = "left";
        ctx.textBaseline = "top";
        const maxW = W - PAD * 2;
        const lines = wrapText(ctx, cleanSub, maxW).slice(0, 3);
        const lh    = fs * 1.18;
        lines.forEach((ln, i) => ctx.fillText(ln, PAD, curY + i * lh));
      }
    }

    // 7. URL — custom or auto-generated, bottom of panel
    const hostname = typeof window !== "undefined"
      ? window.location.hostname.replace("www.", "")
      : "portal.com.br";
    const autoUrl  = siteName
      ? `www.${siteName.toLowerCase().replace(/\s+/g, "")}.com.br`
      : `www.${hostname}`;
    const urlLabel = cfg.templateSiteUrl?.trim() || autoUrl;
    const urlFs    = Math.round(W * 0.026);
    ctx.font         = `400 ${urlFs}px Inter, Arial, sans-serif`;
    ctx.fillStyle    = "rgba(255,255,255,0.38)";
    ctx.textAlign    = "left";
    ctx.textBaseline = "bottom";
    ctx.fillText(urlLabel, PAD, H - Math.round(H * 0.022));
  };

  // Load images
  let bgLoaded   = false;
  let logoLoaded = false;
  let _bgImg:   HTMLImageElement | null = null;
  let _logoImg: HTMLImageElement | null = null;
  const maybeRender = () => {
    if (bgLoaded && logoLoaded) doDraw(_bgImg ?? undefined, _logoImg ?? undefined);
  };

  if (article?.imageUrl && article.imageUrl.startsWith("http")) {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload  = () => { _bgImg = img; bgLoaded = true; maybeRender(); };
    img.onerror = () => {                bgLoaded = true; maybeRender(); };
    img.src = article.imageUrl;
  } else {
    bgLoaded = true;
  }

  if (cfg.templateShowLogo && logoBase64) {
    const img = new Image();
    img.onload  = () => { _logoImg = img; logoLoaded = true; maybeRender(); };
    img.onerror = () => {                  logoLoaded = true; maybeRender(); };
    img.src = logoBase64;
  } else {
    logoLoaded = true;
  }

  if (bgLoaded && logoLoaded) doDraw(undefined, undefined);
}

// ─── Caption builder ──────────────────────────────────────────────────────────
function buildCaption(template: string, article: Article | null): string {
  if (!article) return template;
  const tags = (article.keywords ?? article.category ?? "")
    .split(/[,\s]+/).filter(Boolean)
    .map(t => `#${t.replace(/[^a-zA-ZÀ-ú0-9]/g, "")}`)
    .join(" ");
  return template
    .replace(/{{titulo}}/g,    article.title)
    .replace(/{{resumo}}/g,    article.subtitle ?? "")
    .replace(/{{tags}}/g,      tags)
    .replace(/{{categoria}}/g, article.tag ?? article.category);
}

// ─── Small helpers ────────────────────────────────────────────────────────────
function Chip({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium
      ${ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}`}>
      {ok ? <CheckCircle size={11} /> : <XCircle size={11} />} {label}
    </span>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function SocialMedia() {
  const { settings } = useSite();
  const { toast } = useToast();

  const [tab, setTab] = useState<ActiveTab>("credenciais");
  const [cfg, setCfg] = useState<SocialConfig>({});
  const [saving, setSaving] = useState(false);
  const [articles, setArticles] = useState<Article[]>([]);
  const [selArt, setSelArt] = useState<Article | null>(null);
  const [previewType, setPreviewType] = useState<TemplateType>("feed");
  const [showToken, setShowToken] = useState(false);
  const [publishFeed, setPublishFeed] = useState(true);
  const [publishStory, setPublishStory] = useState(false);
  const [publishFacebook, setPublishFacebook] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [publishResults, setPublishResults] = useState<Record<string, { ok: boolean; error?: string; id?: string }> | null>(null);

  const [captionPlatform, setCaptionPlatform] = useState<"feed" | "story" | "facebook">("feed");
  const [templateDestTab, setTemplateDestTab] = useState<TemplateType>("feed");

  const feedCanvasRef      = useRef<HTMLCanvasElement>(null);
  const storyCanvasRef     = useRef<HTMLCanvasElement>(null);
  const facebookCanvasRef  = useRef<HTMLCanvasElement>(null);

  // Load config
  useEffect(() => {
    fetch("/api/admin/social/config")
      .then(r => r.json())
      .then((d: SocialConfig) => setCfg({
        feedCaption:  d.feedCaption  || DEFAULT_FEED_CAPTION,
        storyCaption: d.storyCaption || DEFAULT_STORY_CAPTION,
        templateShowLogo:     d.templateShowLogo     ?? false,
        templateShowCategory: d.templateShowCategory ?? true,
        templateGradientFrom: d.templateGradientFrom ?? "rgba(0,0,0,0)",
        templateGradientTo:   d.templateGradientTo   ?? "rgba(0,0,0,0.88)",
        autoPublishFeed:     d.autoPublishFeed     ?? false,
        autoPublishStory:    d.autoPublishStory    ?? false,
        autoPublishFacebook: d.autoPublishFacebook ?? false,
        lastPublishedAt:     d.lastPublishedAt,
        ...d,
      }))
      .catch(() => {});
  }, []);

  // Load articles
  useEffect(() => {
    if (tab !== "publicar" && tab !== "template") return;
    fetch("/api/articles?status=published&limit=50")
      .then(r => r.json())
      .then((data: Article[] | { articles?: Article[] }) => {
        const arr = Array.isArray(data) ? data : (data.articles ?? []);
        setArticles(arr);
        if (arr.length > 0 && !selArt) setSelArt(arr[0] ?? null);
      })
      .catch(() => {});
  }, [tab]);

  // Re-render canvas when relevant state changes
  const logoBase64 = settings?.logoBase64;
  const siteName   = settings?.siteName;

  const effectiveLogo = cfg.templateCustomLogoBase64 ?? logoBase64;

  const redrawCanvas = useCallback(() => {
    if (feedCanvasRef.current) {
      renderCanvas(feedCanvasRef.current, "feed", selArt, cfg, effectiveLogo, siteName);
    }
    if (storyCanvasRef.current) {
      renderCanvas(storyCanvasRef.current, "story", selArt, cfg, effectiveLogo, siteName);
    }
    if (facebookCanvasRef.current) {
      renderCanvas(facebookCanvasRef.current, "facebook", selArt, cfg, effectiveLogo, siteName);
    }
  }, [selArt, cfg, effectiveLogo, siteName]);

  useEffect(() => {
    if (tab === "publicar" || tab === "template") redrawCanvas();
  }, [tab, redrawCanvas]);

  // Save config
  const saveConfig = async () => {
    setSaving(true);
    try {
      const r = await fetch("/api/admin/social/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(cfg),
      });
      if (!r.ok) throw new Error("Erro ao salvar");
      const d = await r.json() as { config: SocialConfig };
      setCfg(prev => ({ ...prev, ...d.config }));
      toast({ title: "Configuração salva!", description: "Credenciais e templates atualizados." });
    } catch {
      toast({ title: "Erro ao salvar", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  // Publish
  const doPublish = async () => {
    if (!selArt) { toast({ title: "Selecione um artigo", variant: "destructive" }); return; }
    if (!publishFeed && !publishStory && !publishFacebook) {
      toast({ title: "Selecione ao menos um destino", variant: "destructive" }); return;
    }

    const feedCanvas  = feedCanvasRef.current!;
    const storyCanvas = storyCanvasRef.current!;

    // Ensure canvas is rendered
    renderCanvas(feedCanvas,  "feed",  selArt, cfg, effectiveLogo, siteName);
    renderCanvas(storyCanvas, "story", selArt, cfg, effectiveLogo, siteName);

    // Give it a brief moment for async image loads to complete
    await new Promise(r => setTimeout(r, 600));

    const imageBase64 = feedCanvas.toDataURL("image/jpeg", 0.92);
    const caption     = buildCaption(cfg.feedCaption  ?? DEFAULT_FEED_CAPTION,  selArt);
    const stCaption   = buildCaption(cfg.storyCaption ?? DEFAULT_STORY_CAPTION, selArt);

    setPublishing(true);
    setPublishResults(null);
    try {
      const r = await fetch(`/api/admin/social/publish/${selArt.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ imageBase64, caption, storyCaption: stCaption, publishFeed, publishStory, publishFacebook }),
      });
      const data = await r.json() as { ok: boolean; results?: Record<string, { ok: boolean; error?: string; id?: string }>; error?: string };
      if (!r.ok || data.error) throw new Error(data.error ?? "Erro desconhecido");
      setPublishResults(data.results ?? {});
      const allOk = Object.values(data.results ?? {}).every(v => v.ok);
      toast({ title: allOk ? "Publicado com sucesso! 🎉" : "Publicado com avisos", variant: allOk ? "default" : "destructive" });
    } catch (e: unknown) {
      toast({ title: "Erro na publicação", description: (e as Error).message, variant: "destructive" });
    } finally {
      setPublishing(false);
    }
  };

  const TABS: { id: ActiveTab; label: string }[] = [
    { id: "credenciais", label: "Credenciais Meta" },
    { id: "template",    label: "Templates" },
    { id: "legenda",     label: "Legenda automática" },
    { id: "publicar",    label: "Publicar" },
  ];

  const CHAR_LIMITS: Record<string, number> = { feed: 2200, story: 150, facebook: 63206 };

  function buildRuleCaption(article: Article | null, platform: "feed" | "story" | "facebook"): string {
    if (!article) return "";
    const title   = article.title.replace(/<[^>]*>/g, "");
    const summary = (article.subtitle ?? "").replace(/<[^>]*>/g, "");
    const cat     = (article.tag ?? article.category ?? "geral").toUpperCase();
    const sep     = cfg.captionSeparateBlocks !== false ? "\n\n" : "\n";
    const parts: string[] = [];

    const prefixo = cfg.captionPrefixo ?? "{categoria} | {titulo}";
    if (prefixo) {
      parts.push(prefixo.replace("{categoria}", cat).replace("{titulo}", title));
    } else if (cfg.captionUseTitulo !== false) {
      parts.push(title);
    }

    if (cfg.captionUseResumo !== false && summary) parts.push(summary);
    if (cfg.captionIncludePortal && siteName) parts.push(siteName);
    if (cfg.captionIncludeCTA !== false) {
      parts.push(cfg.captionCTA ?? "Leia a matéria completa no link da bio.");
    }
    if (cfg.captionAssinatura) parts.push(cfg.captionAssinatura);

    let caption = parts.join(sep);

    if (cfg.captionIncludeHashtags !== false) {
      const autoTags = (article.keywords ?? article.category ?? "")
        .split(/[,\s]+/).filter(Boolean)
        .map(t => `#${t.replace(/[^a-zA-ZÀ-ú0-9]/g, "")}`)
        .filter(t => t.length > 1).slice(0, 5).join(" ");
      const fixed = cfg.captionHashtagsFixed ?? "#SBCAgora #NotíciasDeVerdade";
      if (autoTags || fixed) caption += "\n\n" + [autoTags, fixed].filter(Boolean).join(" ");
    }

    const limit = CHAR_LIMITS[platform];
    if (cfg.captionLimitChars && caption.length > limit) caption = caption.slice(0, limit - 3) + "…";
    return caption;
  }

  return (
    <AdminLayout title="Redes Sociais">
      <div className="space-y-6">

        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg" style={{ background: "linear-gradient(135deg,#405de6,#5851db,#833ab4,#c13584,#e1306c,#fd1d1d)" }}>
            <Share2 size={20} className="text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-gray-900">Redes Sociais</h1>
            <p className="text-sm text-gray-500">Conexão Meta · publicação automática no Feed e Story</p>
          </div>
          {cfg.lastPublishedAt && (
            <span className="ml-auto text-xs text-gray-400">
              Última publicação: {new Date(cfg.lastPublishedAt).toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        {/* Tabs */}
        <div className="border-b border-gray-200">
          <nav className="flex gap-6">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={`pb-3 text-sm font-medium border-b-2 transition-colors ${
                  tab === t.id
                    ? "border-[#E71D36] text-[#E71D36]"
                    : "border-transparent text-gray-500 hover:text-gray-700"
                }`}>
                {t.label}
              </button>
            ))}
          </nav>
        </div>

        {/* ── CREDENCIAIS ──────────────────────────────────────────────────────── */}
        {tab === "credenciais" && (
          <div className="space-y-6">
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 flex gap-3">
              <AlertTriangle size={18} className="text-blue-600 shrink-0 mt-0.5" />
              <div className="text-sm text-blue-700">
                <p className="font-medium">Pré-requisitos Meta</p>
                <ul className="mt-1 list-disc pl-4 space-y-0.5 text-blue-600">
                  <li>Conta comercial ou criador no Instagram vinculada a uma Página no Facebook</li>
                  <li>App criado no <a href="https://developers.facebook.com" target="_blank" rel="noopener" className="underline inline-flex items-center gap-0.5">Meta for Developers <ExternalLink size={11}/></a></li>
                  <li>Token de acesso de longa duração com permissões <code className="bg-blue-100 px-1 rounded">instagram_basic</code>, <code className="bg-blue-100 px-1 rounded">instagram_content_publish</code>, <code className="bg-blue-100 px-1 rounded">pages_manage_posts</code></li>
                </ul>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-5">
              <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                <Instagram size={16} /> Credenciais Instagram
              </h2>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Instagram Business Account ID *
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="123456789012345"
                    value={cfg.instagramUserId ?? ""}
                    onChange={e => setCfg(p => ({ ...p, instagramUserId: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-gray-400">Settings → About → See All Info → Instagram ID</p>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Facebook Page ID
                  </label>
                  <input
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="987654321098765"
                    value={cfg.facebookPageId ?? ""}
                    onChange={e => setCfg(p => ({ ...p, facebookPageId: e.target.value }))}
                  />
                  <p className="mt-1 text-xs text-gray-400">Necessário para publicar no feed do Facebook</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Page Access Token *
                </label>
                <div className="relative">
                  <input
                    type={showToken ? "text" : "password"}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 pr-24"
                    placeholder="EAABwzLixnjYBAJ..."
                    value={cfg.pageAccessToken ?? ""}
                    onChange={e => setCfg(p => ({ ...p, pageAccessToken: e.target.value }))}
                  />
                  <button
                    type="button"
                    onClick={() => setShowToken(v => !v)}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-xs text-blue-600 hover:text-blue-800 px-2 py-1">
                    {showToken ? "Ocultar" : "Mostrar"}
                  </button>
                </div>
                <p className="mt-1 text-xs text-gray-400">
                  Token de longa duração (60 dias). <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener" className="text-blue-500 underline inline-flex items-center gap-0.5">Graph API Explorer <ExternalLink size={10}/></a>
                </p>
              </div>
            </div>

            <div className="bg-white border border-gray-200 rounded-xl p-6 space-y-4">
              <h2 className="font-semibold text-gray-800">Publicação automática</h2>
              <p className="text-sm text-gray-500">Quando um artigo é publicado, postar automaticamente nas redes selecionadas.</p>
              {([
                { key: "autoPublishFeed",     icon: <Instagram size={15}/>, label: "Instagram Feed", sub: "1080×1350" },
                { key: "autoPublishStory",    icon: <Layers size={15}/>,    label: "Instagram Story", sub: "1080×1920" },
                { key: "autoPublishFacebook", icon: <Facebook size={15}/>,  label: "Facebook Page", sub: "Foto na Página" },
              ] as const).map(({ key, icon, label, sub }) => (
                <label key={key} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer">
                  <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                    {icon} {label} <span className="text-xs text-gray-400">{sub}</span>
                  </span>
                  <input type="checkbox" className="w-4 h-4 accent-[#E71D36]"
                    checked={!!(cfg as Record<string, unknown>)[key]}
                    onChange={e => setCfg(p => ({ ...p, [key]: e.target.checked }))} />
                </label>
              ))}

              {/* Interval scheduler */}
              <div className="pt-3 border-t border-gray-100 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-800">Publicar a cada X horas</p>
                    <p className="text-xs text-gray-500 mt-0.5">O site publica automaticamente um artigo nas redes a cada intervalo configurado.</p>
                  </div>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input type="checkbox"
                      className="w-4 h-4 accent-[#E71D36]"
                      checked={!!(cfg.autoPublishIntervalHours && cfg.autoPublishIntervalHours > 0)}
                      onChange={e => setCfg(p => ({ ...p, autoPublishIntervalHours: e.target.checked ? 4 : 0 }))} />
                    <span className="text-xs font-medium text-gray-600">Ativar</span>
                  </label>
                </div>

                {cfg.autoPublishIntervalHours && cfg.autoPublishIntervalHours > 0 ? (
                  <div className="space-y-2">
                    <div className="flex items-center gap-3 flex-wrap">
                      {[1, 2, 4, 6, 8, 12, 24].map(h => (
                        <button
                          key={h}
                          type="button"
                          onClick={() => setCfg(p => ({ ...p, autoPublishIntervalHours: h }))}
                          className={`px-3 py-1.5 rounded-lg text-sm font-semibold border transition-colors ${cfg.autoPublishIntervalHours === h ? "bg-[#E71D36] text-white border-[#E71D36]" : "bg-white text-gray-600 border-gray-200 hover:border-gray-400"}`}
                        >
                          {h}h
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                      <Info size={13} className="text-amber-600 shrink-0" />
                      <p className="text-xs text-amber-700">
                        A cada <strong>{cfg.autoPublishIntervalHours} hora{cfg.autoPublishIntervalHours > 1 ? "s" : ""}</strong>, o artigo mais recente não publicado será postado automaticamente.
                      </p>
                    </div>
                    {cfg.lastPublishedAt && (
                      <p className="text-xs text-gray-500">
                        Última publicação: {new Date(cfg.lastPublishedAt).toLocaleString("pt-BR")}
                      </p>
                    )}
                  </div>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveConfig} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E71D36] text-white rounded-lg text-sm font-medium hover:bg-[#c9182e] disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {saving ? "Salvando…" : "Salvar credenciais"}
              </button>
            </div>
          </div>
        )}

        {/* ── TEMPLATE ─────────────────────────────────────────────────────────── */}
        {tab === "template" && (
          <div className="grid gap-6" style={{ gridTemplateColumns: "0.85fr 1.6fr" }}>

            {/* ── LEFT: Settings ── */}
            <div className="bg-white rounded-2xl overflow-hidden" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
              {/* Card header */}
              <div className="px-6 pt-6 pb-4 border-b border-[#F1F5F9]">
                <h2 className="font-semibold text-[#0F172A] text-[15px]">Configurar máscara de publicações</h2>
                <p className="text-xs text-[#64748B] mt-0.5">Personalize como seus artigos serão exibidos nas redes sociais.</p>
              </div>

              <div className="px-6 py-5 space-y-5 overflow-y-auto" style={{ maxHeight: "calc(100vh - 280px)" }}>

                {/* Destination sub-tabs */}
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-2">Destino (Template)</p>
                  <div className="grid grid-cols-3 gap-2">
                    {([
                      { id: "feed",     icon: <Instagram size={13}/>, label: "Instagram Feed",  size: "1080×1350" },
                      { id: "story",    icon: <Layers    size={13}/>, label: "Instagram Story", size: "1080×1920" },
                      { id: "facebook", icon: <Facebook  size={13}/>, label: "Facebook Page",   size: "1200×630" },
                    ] as const).map(d => (
                      <button key={d.id}
                        onClick={() => setTemplateDestTab(d.id)}
                        className={`flex flex-col items-center gap-1 py-3 px-2 rounded-xl border text-center transition-all ${
                          templateDestTab === d.id
                            ? "border-[#0B2A66] bg-[#EFF6FF] text-[#0B2A66]"
                            : "border-[#E2E8F0] bg-white text-[#64748B] hover:bg-[#F8FAFC]"
                        }`}>
                        {d.icon}
                        <span className="text-[11px] font-medium leading-tight">{d.label}</span>
                        <span className="text-[10px] opacity-70">{d.size}</span>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Modelo de layout */}
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">Modelo de layout</label>
                  <select
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white"
                    value={cfg.templateLayout ?? "Padrão com badge e logo"}
                    onChange={e => { setCfg(p => ({ ...p, templateLayout: e.target.value })); }}>
                    {["Padrão com badge e logo", "Editorial com imagem cheia", "Urgente com faixa vermelha", "Minimalista com título central", "Imagem escura com overlay"].map(o => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>

                {/* Cor primária + Cor de destaque */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1.5">Cor primária (overlay)</label>
                    <div className="flex items-center gap-2 border border-[#E2E8F0] rounded-xl px-3 py-2">
                      <input type="color"
                        value={cfg.templatePanelColor ?? "#1a2448"}
                        onChange={e => { setCfg(p => ({ ...p, templatePanelColor: e.target.value })); setTimeout(redrawCanvas, 50); }}
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent" />
                      <span className="text-xs font-mono text-[#0F172A]">{cfg.templatePanelColor ?? "#1a2448"}</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1.5">Cor de destaque (badge/CTA)</label>
                    <div className="flex items-center gap-2 border border-[#E2E8F0] rounded-xl px-3 py-2">
                      <input type="color"
                        value={cfg.templateAccentColor ?? "#f59e0b"}
                        onChange={e => { setCfg(p => ({ ...p, templateAccentColor: e.target.value })); setTimeout(redrawCanvas, 50); }}
                        className="w-6 h-6 rounded cursor-pointer border-0 p-0 bg-transparent" />
                      <span className="text-xs font-mono text-[#0F172A]">{cfg.templateAccentColor ?? "#f59e0b"}</span>
                    </div>
                  </div>
                </div>

                {/* Tamanho do título + Subtítulo toggle */}
                <div>
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="text-xs font-medium text-[#64748B]">Tamanho do título</label>
                    <div className="flex items-center gap-2">
                      <span className="text-xs text-[#64748B]">Exibir subtítulo</span>
                      <button
                        onClick={() => { setCfg(p => ({ ...p, templateShowSubtitle: !(cfg.templateShowSubtitle ?? false) })); setTimeout(redrawCanvas, 50); }}
                        className={`relative w-9 h-5 rounded-full transition-colors ${cfg.templateShowSubtitle ? "bg-[#0B2A66]" : "bg-gray-200"}`}>
                        <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${cfg.templateShowSubtitle ? "translate-x-4" : "translate-x-0.5"}`} />
                      </button>
                    </div>
                  </div>
                  <input type="range" min="0.5" max="1.8" step="0.05"
                    value={cfg.templateTitleSizeScale ?? 1.0}
                    onChange={e => { setCfg(p => ({ ...p, templateTitleSizeScale: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                    className="w-full accent-[#0B2A66]" />
                  <div className="flex justify-between text-[10px] text-[#94A3B8] mt-0.5"><span>Pequeno</span><span>Extra grande</span></div>
                </div>

                {/* Posição do logo + Opacidade do overlay */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-medium text-[#64748B] mb-1.5">Posição do logo</label>
                    <select
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white"
                      value={cfg.templateLogoPosition ?? "top-left"}
                      onChange={e => { setCfg(p => ({ ...p, templateLogoPosition: e.target.value as typeof cfg.templateLogoPosition, templateShowLogo: true })); setTimeout(redrawCanvas, 50); }}>
                      <option value="top-left">Superior esquerda</option>
                      <option value="top-right">Superior direita</option>
                      <option value="bottom-left">Inferior esquerda</option>
                      <option value="bottom-right">Inferior direita</option>
                    </select>
                  </div>
                  <div>
                    <div className="flex items-center justify-between mb-1.5">
                      <label className="text-xs font-medium text-[#64748B]">Opacidade do overlay</label>
                      <span className="text-xs font-mono text-[#0B2A66]">{Math.round((cfg.templatePhotoVignette ?? 0.40) * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05"
                      value={cfg.templatePhotoVignette ?? 0.40}
                      onChange={e => { setCfg(p => ({ ...p, templatePhotoVignette: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                      className="w-full accent-[#0B2A66] mt-1" />
                    <div className="flex justify-between text-[10px] text-[#94A3B8] mt-0.5"><span>0%</span><span>100%</span></div>
                  </div>
                </div>

                {/* Logo customizado para a máscara */}
                <div className="space-y-2 p-3 bg-[#F8FAFC] rounded-xl border border-[#E2E8F0]">
                  <div className="flex items-center justify-between">
                    <label className="text-xs font-medium text-[#64748B]">Logo da máscara</label>
                    {cfg.templateCustomLogoBase64 && (
                      <button
                        type="button"
                        onClick={() => { setCfg(p => ({ ...p, templateCustomLogoBase64: undefined })); setTimeout(redrawCanvas, 80); }}
                        className="text-[10px] text-red-500 hover:text-red-700 font-medium">
                        Remover
                      </button>
                    )}
                  </div>
                  {cfg.templateCustomLogoBase64 ? (
                    <div className="flex items-center gap-3">
                      <img src={cfg.templateCustomLogoBase64} alt="Logo customizado" className="h-10 w-auto object-contain bg-white rounded border border-[#E2E8F0] p-1" />
                      <span className="text-xs text-green-600 font-medium">Logo personalizado ativo</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2 text-xs text-[#64748B]">
                      <span className="w-8 h-8 rounded bg-white border border-[#E2E8F0] flex items-center justify-center shrink-0">
                        <ImageIcon size={14} className="text-[#94A3B8]" />
                      </span>
                      <span className="italic">Usando logo do portal</span>
                    </div>
                  )}
                  <label className="block">
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        const reader = new FileReader();
                        reader.onload = ev => {
                          const b64 = ev.target?.result as string;
                          setCfg(p => ({ ...p, templateCustomLogoBase64: b64, templateShowLogo: true }));
                          setTimeout(redrawCanvas, 80);
                        };
                        reader.readAsDataURL(file);
                      }}
                    />
                    <span className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-[#E2E8F0] rounded-lg text-xs font-medium text-[#0F172A] hover:bg-[#F1F5F9] cursor-pointer transition-colors">
                      <Upload size={12} /> Subir logo diferente
                    </span>
                  </label>
                  <p className="text-[10px] text-[#94A3B8]">Use um logo adaptado para fundos escuros (versão branca/clara funciona melhor).</p>
                </div>

                {/* Estilo da tag de categoria */}
                <div>
                  <label className="block text-xs font-medium text-[#64748B] mb-1.5">Estilo da tag de categoria</label>
                  <select
                    className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white"
                    value={cfg.templateCategoryStyle ?? "Retangular preenchida"}
                    onChange={e => { setCfg(p => ({ ...p, templateCategoryStyle: e.target.value })); }}>
                    {["Retangular preenchida", "Pílula preenchida", "Contorno fino", "Sem tag"].map(o => (
                      <option key={o}>{o}</option>
                    ))}
                  </select>
                </div>

                {/* Exibir elementos toggles */}
                <div>
                  <p className="text-xs font-medium text-[#64748B] mb-2">Exibir elementos</p>
                  <div className="flex flex-wrap gap-4">
                    {([
                      { key: "templateShowAuthor",   label: "Autor",      def: true },
                      { key: "templateShowDate",     label: "Data",       def: true },
                      { key: "templateShowCategory", label: "Categoria",  def: true },
                      { key: "templateShowCTA",      label: "CTA (Ver mais)", def: true },
                    ] as const).map(({ key, label, def }) => {
                      const on = (cfg as Record<string, unknown>)[key] !== undefined
                        ? !!(cfg as Record<string, unknown>)[key]
                        : def;
                      return (
                        <label key={key} className="flex items-center gap-2 cursor-pointer">
                          <button
                            onClick={() => { setCfg(p => ({ ...p, [key]: !on })); setTimeout(redrawCanvas, 50); }}
                            className={`relative w-9 h-5 rounded-full transition-colors ${on ? "bg-[#0B2A66]" : "bg-gray-200"}`}>
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? "translate-x-4" : "translate-x-0.5"}`} />
                          </button>
                          <span className="text-sm text-[#0F172A]">{label}</span>
                        </label>
                      );
                    })}
                  </div>
                </div>

                {/* Templates salvos */}
                <div className="pt-2 border-t border-[#F1F5F9]">
                  <p className="text-xs font-semibold text-[#64748B] uppercase tracking-wide mb-3">Templates salvos</p>
                  <div className="space-y-1.5">
                    {["Plantão", "Notícia padrão", "Esportes", "Urgente"].map(name => (
                      <div key={name} className="flex items-center justify-between py-2 px-3 rounded-xl hover:bg-[#F8FAFC] transition-colors group">
                        <div className="flex items-center gap-2.5">
                          <div className="w-1 h-4 rounded-full bg-[#E2E8F0]" />
                          <span className="text-sm text-[#0F172A]">{name}</span>
                          <span className="text-[10px] px-1.5 py-0.5 bg-[#F1F5F9] text-[#64748B] rounded-md font-medium">Padrão</span>
                        </div>
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button className="p-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#64748B] hover:text-[#0B2A66] transition-colors">
                            <Pencil size={13}/>
                          </button>
                          <button className="p-1.5 rounded-lg hover:bg-[#EFF6FF] text-[#64748B] hover:text-[#0B2A66] transition-colors">
                            <MoreVertical size={13}/>
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                  <button className="mt-3 w-full flex items-center justify-center gap-2 py-2 border border-dashed border-[#CBD5E1] rounded-xl text-sm text-[#64748B] hover:border-[#0B2A66] hover:text-[#0B2A66] hover:bg-[#F8FAFC] transition-all">
                    <Plus size={14}/> Novo template
                  </button>
                </div>
              </div>
            </div>

            {/* ── RIGHT: Preview ── */}
            <div className="bg-white rounded-2xl overflow-hidden flex flex-col" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
              {/* Card header */}
              <div className="px-6 pt-6 pb-4 border-b border-[#F1F5F9] flex items-start justify-between gap-4">
                <div>
                  <h2 className="font-semibold text-[#0F172A] text-[15px]">Prévia do template</h2>
                  <p className="text-xs text-[#64748B] mt-0.5">Visualize como suas publicações serão exibidas em cada destino.</p>
                </div>
                <div className="flex items-center gap-2 flex-shrink-0">
                  {articles.length > 0 && (
                    <select
                      className="border border-[#E2E8F0] rounded-xl px-3 py-1.5 text-xs text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white max-w-[220px]"
                      value={selArt?.id ?? ""}
                      onChange={e => { const found = articles.find(a => a.id === e.target.value) ?? null; setSelArt(found); setTimeout(redrawCanvas, 100); }}>
                      <option value="">— sem artigo —</option>
                      {articles.map(a => (
                        <option key={a.id} value={a.id}>
                          {a.title.replace(/<[^>]*>/g, "").slice(0, 40)}{a.title.length > 40 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  <button
                    onClick={() => { setCfg(p => ({ ...p, templatePanelColor: "#1a2448", templateAccentColor: "#f59e0b", templateTitleSizeScale: 1.0, templatePhotoVignette: 0.40, templateShowSubtitle: false })); setTimeout(redrawCanvas, 80); }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-[#E2E8F0] rounded-xl text-xs text-[#64748B] hover:bg-[#F8FAFC] transition-colors flex-shrink-0">
                    <RefreshCw size={12}/> Redefinir padrão
                  </button>
                </div>
              </div>

              {/* 3 canvas previews */}
              <div className="flex-1 px-6 py-6">
                <div className="flex gap-6 items-start justify-center h-full">

                  {/* Feed 4:5 */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                      <Instagram size={12}/> <span className="font-medium">Instagram Feed</span>
                      <span className="text-[#94A3B8]">1080×1350</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-gray-900"
                      style={{ width: 200, height: 250 }}>
                      <canvas ref={feedCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
                    </div>
                    <button onClick={() => { if (!feedCanvasRef.current) return; const a = document.createElement("a"); a.download = "feed.jpg"; a.href = feedCanvasRef.current.toDataURL("image/jpeg", 0.92); a.click(); }}
                      className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
                      <Eye size={10}/> Baixar
                    </button>
                  </div>

                  {/* Story 9:16 */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                      <Layers size={12}/> <span className="font-medium">Instagram Story</span>
                      <span className="text-[#94A3B8]">1080×1920</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-gray-900"
                      style={{ width: 141, height: 250 }}>
                      <canvas ref={storyCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
                    </div>
                    <button onClick={() => { if (!storyCanvasRef.current) return; const a = document.createElement("a"); a.download = "story.jpg"; a.href = storyCanvasRef.current.toDataURL("image/jpeg", 0.92); a.click(); }}
                      className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
                      <Eye size={10}/> Baixar
                    </button>
                  </div>

                  {/* Facebook 1.91:1 */}
                  <div className="flex flex-col items-center gap-2">
                    <div className="flex items-center gap-1.5 text-xs text-[#64748B]">
                      <Facebook size={12}/> <span className="font-medium">Facebook Page</span>
                      <span className="text-[#94A3B8]">1200×630</span>
                    </div>
                    <div className="overflow-hidden rounded-xl border border-[#E2E8F0] bg-gray-900 flex items-center justify-center"
                      style={{ width: 320, height: 168 }}>
                      <canvas ref={facebookCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
                    </div>
                    <button onClick={() => { if (!facebookCanvasRef.current) return; const a = document.createElement("a"); a.download = "facebook.jpg"; a.href = facebookCanvasRef.current.toDataURL("image/jpeg", 0.92); a.click(); }}
                      className="text-xs text-[#2563EB] hover:underline flex items-center gap-1">
                      <Eye size={10}/> Baixar
                    </button>
                  </div>

                </div>
              </div>

              {/* Footer actions */}
              <div className="px-6 py-4 border-t border-[#F1F5F9] flex items-center justify-end gap-3">
                <button
                  onClick={() => toast({ title: "Template duplicado!", description: "Uma cópia foi criada nos templates salvos.", duration: 2500 })}
                  className="inline-flex items-center gap-2 px-5 py-2.5 border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition-colors">
                  <CopyIcon size={14}/> Duplicar template
                </button>
                <button onClick={saveConfig} disabled={saving}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E71D36] text-white rounded-xl text-sm font-semibold hover:bg-[#c9182e] disabled:opacity-50 transition-colors">
                  {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
                  {saving ? "Salvando…" : "Salvar template"}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LEGENDA AUTOMÁTICA ────────────────────────────────────────────────── */}
        {tab === "legenda" && (() => {
          const previewCaption = buildRuleCaption(selArt, captionPlatform);
          const charCount = previewCaption.length;
          const charLimit = CHAR_LIMITS[captionPlatform];
          const charPct   = Math.min(100, Math.round((charCount / charLimit) * 100));
          const withinLimit = charCount <= charLimit;

          const hashtagList = previewCaption.match(/#\S+/g) ?? [];
          const bodyWithoutTags = previewCaption.replace(/#\S+/g, "").trim();

          type ToggleRule = {
            key: keyof SocialConfig;
            icon: React.ReactNode;
            label: string;
            defaultVal?: boolean;
            extra?: React.ReactNode;
          };

          const toggleRules: ToggleRule[] = [
            { key: "captionUseTitulo",       icon: <FileText  size={14}/>, label: "Usar título da notícia",       defaultVal: true },
            { key: "captionUseResumo",        icon: <AlignLeft size={14}/>, label: "Usar resumo da matéria",       defaultVal: true },
            { key: "captionIncludePortal",    icon: <Building2 size={14}/>, label: "Incluir nome do portal",       defaultVal: false },
            { key: "captionIncludeCategoria", icon: <Folder    size={14}/>, label: "Incluir categoria",            defaultVal: true },
            { key: "captionIncludeHashtags",  icon: <Hash      size={14}/>, label: "Incluir hashtags automáticas", defaultVal: true },
            { key: "captionIncludeCTA",       icon: <Megaphone size={14}/>, label: "Incluir CTA",                  defaultVal: true },
            { key: "captionLimitChars",       icon: <Type      size={14}/>, label: "Limitar caracteres por rede",  defaultVal: true,
              extra: cfg.captionLimitChars !== false ? (
                <select
                  className="ml-2 border border-gray-200 rounded-lg px-2 py-1 text-xs text-gray-700 focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white"
                  value={cfg.captionCharLimit ?? "feed"}
                  onChange={e => setCfg(p => ({ ...p, captionCharLimit: e.target.value as "feed"|"story"|"facebook" }))}>
                  <option value="feed">Instagram Feed (2.200)</option>
                  <option value="story">Instagram Story (150)</option>
                  <option value="facebook">Facebook Page (63.206)</option>
                </select>
              ) : null
            },
            { key: "captionUseEmojis",        icon: <Smile     size={14}/>, label: "Usar emojis",                  defaultVal: false },
            { key: "captionSeparateBlocks",   icon: <Layout    size={14}/>, label: "Separar legenda por blocos",   defaultVal: true },
          ];

          return (
            <div className="space-y-5">
              {/* ── 2-column main grid ── */}
              <div className="grid gap-6" style={{ gridTemplateColumns: "0.95fr 1.35fr" }}>

                {/* ── LEFT: Regras de geração ── */}
                <div className="bg-white rounded-2xl p-6 space-y-5" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
                  <h2 className="font-semibold text-[#0F172A] text-[15px]">Regras de geração</h2>

                  {/* Toggles */}
                  <div className="space-y-1">
                    {toggleRules.map(rule => {
                      const val = (cfg as Record<string, unknown>)[rule.key] as boolean | undefined;
                      const on  = val !== undefined ? val : (rule.defaultVal ?? true);
                      return (
                        <div key={rule.key as string}
                          className="flex items-center justify-between py-2.5 px-3 rounded-xl hover:bg-gray-50 transition-colors">
                          <span className="flex items-center gap-2.5 text-sm text-[#0F172A]">
                            <span className="text-[#64748B]">{rule.icon}</span>
                            {rule.label}
                            {rule.extra}
                          </span>
                          <button
                            onClick={() => setCfg(p => ({ ...p, [rule.key as string]: !on }))}
                            className={`relative w-10 h-5 rounded-full transition-colors flex-shrink-0 ${on ? "bg-[#0B2A66]" : "bg-gray-200"}`}
                            style={{ minWidth: 40 }}>
                            <span className={`absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform ${on ? "translate-x-5" : "translate-x-0.5"}`} />
                          </button>
                        </div>
                      );
                    })}
                  </div>

                  {/* Fields */}
                  <div className="space-y-3 pt-1 border-t border-gray-100">
                    {([
                      { key: "captionPrefixo",      label: "Prefixo da legenda",  placeholder: "{categoria} | {titulo}", type: "text" },
                      { key: "captionCTA",           label: "CTA padrão",          placeholder: "Leia a matéria completa no link da bio.", type: "text" },
                      { key: "captionHashtagsFixed", label: "Hashtags fixas",      placeholder: "#SBCAgora #NotíciasDeVerdade", type: "text" },
                      { key: "captionAssinatura",    label: "Assinatura",          placeholder: "SBC Agora – Notícias de Verdade.", type: "text" },
                    ] as const).map(f => (
                      <div key={f.key}>
                        <label className="block text-xs font-medium text-[#64748B] mb-1">{f.label}</label>
                        <input
                          type="text"
                          placeholder={f.placeholder}
                          value={(cfg as Record<string, unknown>)[f.key] as string ?? ""}
                          onChange={e => setCfg(p => ({ ...p, [f.key]: e.target.value }))}
                          className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66]"
                        />
                      </div>
                    ))}

                    <div>
                      <label className="block text-xs font-medium text-[#64748B] mb-1">Tom de voz</label>
                      <select
                        value={cfg.captionTom ?? "Jornalístico"}
                        onChange={e => setCfg(p => ({ ...p, captionTom: e.target.value }))}
                        className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-sm text-[#0F172A] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white">
                        {["Jornalístico", "Institucional", "Popular", "Urgente", "Neutro"].map(t => (
                          <option key={t}>{t}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                </div>

                {/* ── RIGHT: Prévia da legenda ── */}
                <div className="bg-white rounded-2xl p-6 space-y-4" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
                  <h2 className="font-semibold text-[#0F172A] text-[15px]">Prévia da legenda</h2>

                  {/* Platform tabs */}
                  <div className="flex gap-1 bg-[#F7F9FC] rounded-xl p-1">
                    {([
                      { id: "feed",     icon: <Instagram size={13}/>, label: "Instagram Feed" },
                      { id: "story",    icon: <Layers    size={13}/>, label: "Instagram Story" },
                      { id: "facebook", icon: <Facebook  size={13}/>, label: "Facebook Page" },
                    ] as const).map(p => (
                      <button key={p.id}
                        onClick={() => setCaptionPlatform(p.id)}
                        className={`flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium transition-all ${
                          captionPlatform === p.id
                            ? "bg-white text-[#0B2A66] shadow-sm"
                            : "text-[#64748B] hover:text-[#0F172A]"
                        }`}>
                        {p.icon} {p.label}
                      </button>
                    ))}
                  </div>

                  {/* Article selector for preview */}
                  {articles.length > 0 && (
                    <select
                      className="w-full border border-[#E2E8F0] rounded-xl px-3 py-2 text-xs text-[#64748B] focus:outline-none focus:ring-2 focus:ring-[#0B2A66]/20 focus:border-[#0B2A66] bg-white"
                      value={selArt?.id ?? ""}
                      onChange={e => {
                        const found = articles.find(a => a.id === e.target.value) ?? null;
                        setSelArt(found);
                      }}>
                      <option value="">— selecione um artigo para prévia —</option>
                      {articles.map(a => (
                        <option key={a.id} value={a.id}>
                          [{a.tag ?? a.category}] {a.title.replace(/<[^>]*>/g, "").slice(0, 55)}{a.title.length > 55 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                  )}

                  {/* Preview text */}
                  <div className="min-h-[180px] bg-[#F8FAFC] rounded-xl p-4 text-sm text-[#0F172A] leading-relaxed whitespace-pre-wrap border border-[#E2E8F0]">
                    {previewCaption || (
                      <span className="text-[#94A3B8] italic text-sm">
                        Selecione um artigo acima para visualizar a legenda gerada automaticamente.
                      </span>
                    )}
                  </div>

                  {/* Character counter */}
                  {previewCaption && (
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between text-xs">
                        <span className="text-[#64748B]">Caracteres usados</span>
                        <span className={`font-medium ${withinLimit ? "text-[#16A34A]" : "text-[#E71D36]"}`}>
                          {charCount.toLocaleString("pt-BR")} / {charLimit.toLocaleString("pt-BR")} — {withinLimit ? "Dentro do limite" : "Acima do limite"}
                        </span>
                      </div>
                      <div className="h-1.5 bg-[#E2E8F0] rounded-full overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all ${withinLimit ? "bg-[#16A34A]" : "bg-[#E71D36]"}`}
                          style={{ width: `${charPct}%` }}
                        />
                      </div>
                    </div>
                  )}

                  {/* Hashtag chips */}
                  {hashtagList.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {hashtagList.map((tag, i) => (
                        <span key={i}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-[#EFF6FF] text-[#2563EB] rounded-lg text-xs font-medium">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
              </div>

              {/* ── Variables panel ── */}
              <div className="bg-white rounded-2xl px-5 py-4" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-xs font-semibold text-[#64748B] uppercase tracking-wide">Variáveis disponíveis</span>
                  <span className="text-xs text-[#64748B]">Clique para copiar</span>
                  <div className="flex flex-wrap gap-2">
                    {["{titulo}", "{resumo}", "{categoria}", "{cidade}", "{autor}", "{link}"].map(v => (
                      <button key={v}
                        onClick={() => { navigator.clipboard.writeText(v); toast({ title: `${v} copiado!`, duration: 1500 }); }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-[#F8FAFC] border border-[#E2E8F0] rounded-lg text-xs font-mono text-[#0F172A] hover:bg-[#EFF6FF] hover:border-[#0B2A66]/30 hover:text-[#0B2A66] transition-colors">
                        <Copy size={10}/> {v}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* ── Action bar ── */}
              <div className="bg-white rounded-2xl px-5 py-4" style={{ boxShadow: "0 8px 24px rgba(15,23,42,0.06)" }}>
                <div className="flex items-center gap-4">
                  <div className="flex-1 flex items-start gap-2.5 bg-[#EFF6FF] border border-[#BFDBFE] rounded-xl px-4 py-3">
                    <Info size={15} className="text-[#2563EB] flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-[#1E40AF] leading-relaxed">
                      Ao publicar um novo artigo, a legenda será gerada automaticamente com base nas regras acima e na prévia correspondente à rede selecionada.
                    </p>
                  </div>
                  <div className="flex gap-3 flex-shrink-0">
                    <button
                      onClick={() => {
                        if (!articles[0]) return;
                        if (!selArt) setSelArt(articles[0]);
                        toast({ title: "Exemplo gerado!", description: "Selecione um artigo para ver a prévia.", duration: 2000 });
                      }}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-white border border-[#E2E8F0] rounded-xl text-sm font-medium text-[#0F172A] hover:bg-[#F8FAFC] transition-colors">
                      <RefreshCw size={14}/> Gerar exemplo
                    </button>
                    <button onClick={saveConfig} disabled={saving}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#E71D36] text-white rounded-xl text-sm font-semibold hover:bg-[#c9182e] disabled:opacity-50 transition-colors">
                      {saving ? <RefreshCw size={14} className="animate-spin"/> : <Save size={14}/>}
                      {saving ? "Salvando…" : "Salvar regras"}
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })()}

        {/* ── PUBLICAR ─────────────────────────────────────────────────────────── */}
        {tab === "publicar" && (
          <div className="space-y-6">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              {/* Left: controls */}
              <div className="space-y-4">
                {/* Article selector */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-semibold text-gray-800">Selecionar artigo</h3>
                  {articles.length === 0 ? (
                    <p className="text-sm text-gray-400">Carregando artigos…</p>
                  ) : (
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      value={selArt?.id ?? ""}
                      onChange={e => {
                        const found = articles.find(a => a.id === e.target.value) ?? null;
                        setSelArt(found);
                        setTimeout(redrawCanvas, 100);
                      }}>
                      {articles.map(a => (
                        <option key={a.id} value={a.id}>
                          [{a.tag ?? a.category}] {a.title.slice(0, 55)}{a.title.length > 55 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                  {selArt && (
                    <div className="p-3 bg-gray-50 rounded-lg text-xs text-gray-600 space-y-1">
                      <p className="font-medium text-gray-800 line-clamp-2">{selArt.title}</p>
                      {selArt.subtitle && <p className="line-clamp-2 text-gray-500">{selArt.subtitle}</p>}
                    </div>
                  )}
                </div>

                {/* Destinations */}
                <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                  <h3 className="font-semibold text-gray-800">Destinos</h3>
                  {([
                    { key: "publishFeed",     icon: <Instagram size={15}/>, label: "Instagram Feed",  sub: "1080×1350",  get: publishFeed,     set: setPublishFeed },
                    { key: "publishStory",    icon: <Layers size={15}/>,    label: "Instagram Story", sub: "1080×1920",  get: publishStory,    set: setPublishStory },
                    { key: "publishFacebook", icon: <Facebook size={15}/>,  label: "Facebook Page",   sub: "Foto",       get: publishFacebook, set: setPublishFacebook },
                  ] as const).map(({ key, icon, label, sub, get, set }) => (
                    <label key={key} className="flex items-center justify-between p-3 border border-gray-100 rounded-lg hover:bg-gray-50 cursor-pointer">
                      <span className="flex items-center gap-2 text-sm font-medium text-gray-700">
                        {icon} {label} <span className="text-xs text-gray-400">{sub}</span>
                      </span>
                      <input type="checkbox" className="w-4 h-4 accent-[#E71D36]"
                        checked={get} onChange={e => set(e.target.checked)} />
                    </label>
                  ))}
                </div>

                {/* Caption preview */}
                {selArt && (
                  <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                    <h3 className="font-semibold text-gray-800 text-sm">Prévia da legenda</h3>
                    <pre className="text-xs text-gray-600 whitespace-pre-wrap font-sans bg-gray-50 p-3 rounded-lg max-h-40 overflow-y-auto">
                      {buildCaption(cfg.feedCaption ?? DEFAULT_FEED_CAPTION, selArt)}
                    </pre>
                  </div>
                )}

                {/* Publish button */}
                <button
                  onClick={doPublish}
                  disabled={publishing || !selArt || !cfg.pageAccessToken}
                  className="w-full py-3 bg-gradient-to-r from-[#405de6] via-[#c13584] to-[#fd1d1d] text-white rounded-xl text-sm font-semibold hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2">
                  {publishing ? <RefreshCw size={15} className="animate-spin" /> : <Send size={15} />}
                  {publishing ? "Publicando…" : "Publicar agora"}
                </button>

                {!cfg.pageAccessToken && (
                  <p className="text-xs text-center text-amber-600 flex items-center justify-center gap-1">
                    <AlertTriangle size={12} /> Configure o Access Token na aba Credenciais
                  </p>
                )}

                {/* Results */}
                {publishResults && (
                  <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                    <p className="text-sm font-semibold text-gray-700">Resultado</p>
                    {Object.entries(publishResults).map(([key, val]) => (
                      <div key={key} className="flex items-center justify-between text-sm">
                        <span className="text-gray-600 capitalize">{key.replace(/_/g, " ")}</span>
                        <div className="flex items-center gap-2">
                          <Chip ok={val.ok} label={val.ok ? (val.id ? `ID: ${val.id.slice(0, 12)}…` : "OK") : (val.error ?? "Erro")} />
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: canvas previews */}
              <div className="space-y-4">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide text-center">Prévia das imagens</p>
                <div className="flex gap-4 justify-center">
                  {/* Feed */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400">Feed 1080×1350</span>
                    <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-gray-900"
                      style={{ width: 200, height: 250 }}>
                      <canvas ref={feedCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
                    </div>
                  </div>
                  {/* Story */}
                  <div className="flex flex-col items-center gap-1">
                    <span className="text-xs text-gray-400">Story 1080×1920</span>
                    <div className="overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-gray-900"
                      style={{ width: 141, height: 250 }}>
                      <canvas ref={storyCanvasRef} style={{ width: "100%", height: "100%", display: "block" }} />
                    </div>
                  </div>
                </div>
                <div className="flex justify-center gap-3">
                  <button onClick={() => {
                    if (!feedCanvasRef.current) return;
                    const a = document.createElement("a"); a.download = "feed.jpg";
                    a.href = feedCanvasRef.current.toDataURL("image/jpeg", 0.92); a.click();
                  }} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Eye size={11}/> Baixar Feed
                  </button>
                  <button onClick={() => {
                    if (!storyCanvasRef.current) return;
                    const a = document.createElement("a"); a.download = "story.jpg";
                    a.href = storyCanvasRef.current.toDataURL("image/jpeg", 0.92); a.click();
                  }} className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                    <Eye size={11}/> Baixar Story
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

      </div>
    </AdminLayout>
  );
}
