import React, { useState, useEffect, useRef, useCallback } from "react";
import AdminLayout from "@/components/admin/AdminLayout";
import { useSite } from "@/hooks/useSite";
import { useToast } from "@/hooks/use-toast";
import {
  Share2, Instagram, Facebook, Eye, Send, CheckCircle,
  XCircle, RefreshCw, ChevronDown, ChevronUp, ExternalLink,
  Copy, AlertTriangle, Image as ImageIcon, Layers,
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
  templateShowLogo?: boolean;
  templateShowCategory?: boolean;
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
type TemplateType = "feed" | "story";

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
  const W = type === "feed" ? FEED_W : STORY_W;
  const H = type === "feed" ? FEED_H : STORY_H;
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
    const showSub     = cfg.templateShowSubtitle  ?? true;
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

  const feedCanvasRef  = useRef<HTMLCanvasElement>(null);
  const storyCanvasRef = useRef<HTMLCanvasElement>(null);

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

  const redrawCanvas = useCallback(() => {
    if (feedCanvasRef.current) {
      renderCanvas(feedCanvasRef.current, "feed", selArt, cfg, logoBase64, siteName);
    }
    if (storyCanvasRef.current) {
      renderCanvas(storyCanvasRef.current, "story", selArt, cfg, logoBase64, siteName);
    }
  }, [selArt, cfg, logoBase64, siteName]);

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
    renderCanvas(feedCanvas,  "feed",  selArt, cfg, logoBase64, siteName);
    renderCanvas(storyCanvas, "story", selArt, cfg, logoBase64, siteName);

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
    { id: "credenciais", label: "Credenciais" },
    { id: "template",    label: "Templates" },
    { id: "legenda",     label: "Legenda" },
    { id: "publicar",    label: "Publicar" },
  ];

  return (
    <AdminLayout title="Redes Sociais">
      <div className="max-w-5xl mx-auto space-y-6">

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
                    ? "border-[#c8102e] text-[#c8102e]"
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
                  <input type="checkbox" className="w-4 h-4 accent-[#c8102e]"
                    checked={!!(cfg as Record<string, unknown>)[key]}
                    onChange={e => setCfg(p => ({ ...p, [key]: e.target.checked }))} />
                </label>
              ))}
            </div>

            <div className="flex justify-end">
              <button onClick={saveConfig} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c8102e] text-white rounded-lg text-sm font-medium hover:bg-[#a50d25] disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {saving ? "Salvando…" : "Salvar credenciais"}
              </button>
            </div>
          </div>
        )}

        {/* ── TEMPLATE ─────────────────────────────────────────────────────────── */}
        {tab === "template" && (
          <div className="space-y-5">
            {/* Type toggle */}
            <div className="flex gap-2">
              {(["feed", "story"] as const).map(t => (
                <button key={t} onClick={() => { setPreviewType(t); setTimeout(redrawCanvas, 50); }}
                  className={`px-4 py-2 rounded-lg text-sm font-medium border transition-colors ${
                    previewType === t ? "bg-[#c8102e] text-white border-[#c8102e]" : "bg-white text-gray-600 border-gray-200 hover:bg-gray-50"
                  }`}>
                  {t === "feed" ? "Feed 1080×1350" : "Story 1080×1920"}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-6 items-start">
              {/* ── Controls ── */}
              <div className="space-y-4">

                {/* Article for preview */}
                <div className="bg-white border border-gray-200 rounded-xl p-4">
                  <h3 className="font-semibold text-gray-800 text-sm mb-3 flex items-center gap-2">
                    <ImageIcon size={14} /> Artigo para prévia
                  </h3>
                  {articles.length === 0 ? (
                    <p className="text-xs text-gray-400">Carregando artigos…</p>
                  ) : (
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
                      value={selArt?.id ?? ""}
                      onChange={e => {
                        const found = articles.find(a => a.id === e.target.value) ?? null;
                        setSelArt(found);
                        setTimeout(redrawCanvas, 100);
                      }}>
                      <option value="">— sem artigo (fundo padrão) —</option>
                      {articles.map(a => (
                        <option key={a.id} value={a.id}>
                          [{a.tag ?? a.category}] {a.title.replace(/<[^>]*>/g, "").slice(0, 55)}
                          {a.title.length > 55 ? "…" : ""}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                {/* Title controls */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 text-sm">Título</h3>
                    <div className="flex items-center gap-3">
                      <label className="flex items-center gap-1.5 text-xs text-gray-600 cursor-pointer">
                        <input type="checkbox" className="w-3.5 h-3.5 accent-[#c8102e]"
                          checked={cfg.templateShowSubtitle ?? true}
                          onChange={e => { setCfg(p => ({ ...p, templateShowSubtitle: e.target.checked })); setTimeout(redrawCanvas, 50); }} />
                        Subtítulo
                      </label>
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs text-gray-600 mb-1">Fonte</label>
                    <select
                      className="w-full border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
                      value={cfg.templateTitleFont ?? "Inter, Arial, sans-serif"}
                      onChange={e => { setCfg(p => ({ ...p, templateTitleFont: e.target.value })); setTimeout(redrawCanvas, 50); }}>
                      <option value="Inter, Arial, sans-serif">Inter (Sans-serif moderna)</option>
                      <option value="Arial Black, Arial, sans-serif">Arial Black (impacto)</option>
                      <option value="'Trebuchet MS', sans-serif">Trebuchet MS</option>
                      <option value="Arial, Helvetica, sans-serif">Arial (Sans-serif simples)</option>
                      <option value="Merriweather, Georgia, serif">Merriweather (Serif elegante)</option>
                      <option value="Georgia, serif">Georgia (Serif clássica)</option>
                      <option value="'Times New Roman', serif">Times New Roman</option>
                    </select>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1.5">Cor do título</label>
                      <div className="flex items-center gap-2">
                        <input type="color"
                          value={cfg.templateTitleColor ?? "#ffffff"}
                          onChange={e => { setCfg(p => ({ ...p, templateTitleColor: e.target.value })); setTimeout(redrawCanvas, 50); }}
                          className="w-9 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
                        <span className="text-xs text-gray-400 font-mono">{cfg.templateTitleColor ?? "#ffffff"}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1">Máx. linhas</label>
                      <div className="flex items-center gap-1">
                        {[2, 3, 4, 5].map(n => (
                          <button key={n}
                            onClick={() => { setCfg(p => ({ ...p, templateTitleMaxLines: n })); setTimeout(redrawCanvas, 50); }}
                            className={`flex-1 py-1.5 rounded text-xs font-semibold border transition-colors ${
                              (cfg.templateTitleMaxLines ?? 4) === n
                                ? "bg-[#c8102e] text-white border-[#c8102e]"
                                : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                            }`}>{n}</button>
                        ))}
                      </div>
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Tamanho</span>
                      <span className="font-mono text-gray-500">{Math.round((cfg.templateTitleSizeScale ?? 1.0) * 100)}%</span>
                    </div>
                    <input type="range" min="0.5" max="1.8" step="0.05"
                      value={cfg.templateTitleSizeScale ?? 1.0}
                      onChange={e => { setCfg(p => ({ ...p, templateTitleSizeScale: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                      className="w-full accent-[#c8102e]" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Pequeno</span><span>Grande</span></div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Posição horizontal</span>
                      <span className="font-mono text-gray-500">{Math.round((cfg.templateTitleOffsetX ?? 0) * 100)}%</span>
                    </div>
                    <input type="range" min="-0.15" max="0.15" step="0.01"
                      value={cfg.templateTitleOffsetX ?? 0}
                      onChange={e => { setCfg(p => ({ ...p, templateTitleOffsetX: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                      className="w-full accent-[#c8102e]" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>← Esquerda</span><span>Direita →</span></div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Posição vertical</span>
                      <span className="font-mono text-gray-500">{Math.round((cfg.templateTitleOffsetY ?? 0) * 100)}%</span>
                    </div>
                    <input type="range" min="-0.25" max="0.35" step="0.01"
                      value={cfg.templateTitleOffsetY ?? 0}
                      onChange={e => { setCfg(p => ({ ...p, templateTitleOffsetY: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                      className="w-full accent-[#c8102e]" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>↓ Mais baixo</span><span>↑ Mais alto</span></div>
                  </div>
                </div>

                {/* Category tag */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 text-sm">Tag de Categoria</h3>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-[#c8102e]"
                        checked={cfg.templateShowCategory ?? true}
                        onChange={e => { setCfg(p => ({ ...p, templateShowCategory: e.target.checked })); setTimeout(redrawCanvas, 50); }} />
                      Exibir
                    </label>
                  </div>
                  {(cfg.templateShowCategory ?? true) && (
                    <>
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Posição horizontal</span>
                          <span className="font-mono text-gray-500">{Math.round((cfg.templateCategoryOffsetX ?? 0) * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="0.6" step="0.01"
                          value={cfg.templateCategoryOffsetX ?? 0}
                          onChange={e => { setCfg(p => ({ ...p, templateCategoryOffsetX: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                          className="w-full accent-[#c8102e]" />
                        <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Borda esq.</span><span>Centro →</span></div>
                      </div>
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Posição vertical</span>
                          <span className="font-mono text-gray-500">{Math.round((cfg.templateCategoryOffsetY ?? 0) * 100)}%</span>
                        </div>
                        <input type="range" min="0" max="0.4" step="0.01"
                          value={cfg.templateCategoryOffsetY ?? 0}
                          onChange={e => { setCfg(p => ({ ...p, templateCategoryOffsetY: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                          className="w-full accent-[#c8102e]" />
                        <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Topo</span><span>↓ Mais baixo</span></div>
                      </div>
                    </>
                  )}
                </div>

                {/* Logo */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-800 text-sm">Logo</h3>
                    <label className="flex items-center gap-2 text-xs text-gray-600 cursor-pointer">
                      <input type="checkbox" className="w-3.5 h-3.5 accent-[#c8102e]"
                        checked={cfg.templateShowLogo ?? false}
                        onChange={e => { setCfg(p => ({ ...p, templateShowLogo: e.target.checked })); setTimeout(redrawCanvas, 50); }} />
                      Exibir
                    </label>
                  </div>
                  {(cfg.templateShowLogo ?? false) && (
                    <>
                      <div>
                        <div className="flex justify-between text-xs text-gray-600 mb-1">
                          <span>Tamanho</span>
                          <span className="font-mono text-gray-500">{Math.round((cfg.templateLogoScale ?? 1.0) * 100)}%</span>
                        </div>
                        <input type="range" min="0.4" max="2.0" step="0.1"
                          value={cfg.templateLogoScale ?? 1.0}
                          onChange={e => { setCfg(p => ({ ...p, templateLogoScale: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                          className="w-full accent-[#c8102e]" />
                        <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Menor</span><span>Maior</span></div>
                      </div>
                      <div>
                        <p className="text-xs text-gray-600 mb-2">Posição</p>
                        <div className="grid grid-cols-2 gap-1.5">
                          {([
                            { key: "top-left",     label: "↖ Sup. Esq." },
                            { key: "top-right",    label: "↗ Sup. Dir." },
                            { key: "bottom-left",  label: "↙ Inf. Esq." },
                            { key: "bottom-right", label: "↘ Inf. Dir." },
                          ] as const).map(({ key, label }) => (
                            <button key={key}
                              onClick={() => { setCfg(p => ({ ...p, templateLogoPosition: key })); setTimeout(redrawCanvas, 50); }}
                              className={`py-1.5 px-2 rounded text-xs font-medium border transition-colors ${
                                (cfg.templateLogoPosition ?? "top-right") === key
                                  ? "bg-[#c8102e] text-white border-[#c8102e]"
                                  : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                              }`}>
                              {label}
                            </button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {/* Layout */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-gray-800 text-sm">Foto</h3>

                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Altura da foto</span>
                      <span className="font-mono text-gray-500">{Math.round((cfg.templatePhotoRatio ?? 0.54) * 100)}%</span>
                    </div>
                    <input type="range" min="0.35" max="0.72" step="0.01"
                      value={cfg.templatePhotoRatio ?? 0.54}
                      onChange={e => { setCfg(p => ({ ...p, templatePhotoRatio: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                      className="w-full accent-[#c8102e]" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Menos foto</span><span>Mais foto</span></div>
                  </div>

                  <div>
                    <p className="text-xs text-gray-600 mb-1.5">Recorte vertical</p>
                    <div className="flex gap-1.5">
                      {([
                        { key: "top",    label: "⬆ Topo"   },
                        { key: "center", label: "◎ Centro" },
                        { key: "bottom", label: "⬇ Base"   },
                      ] as const).map(({ key, label }) => (
                        <button key={key}
                          onClick={() => { setCfg(p => ({ ...p, templatePhotoCropY: key })); setTimeout(redrawCanvas, 50); }}
                          className={`flex-1 py-1.5 rounded text-xs font-medium border transition-colors ${
                            (cfg.templatePhotoCropY ?? "center") === key
                              ? "bg-[#c8102e] text-white border-[#c8102e]"
                              : "bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100"
                          }`}>{label}</button>
                      ))}
                    </div>
                  </div>

                  <div>
                    <div className="flex justify-between text-xs text-gray-600 mb-1">
                      <span>Vinheta (foto→painel)</span>
                      <span className="font-mono text-gray-500">{Math.round((cfg.templatePhotoVignette ?? 0.40) * 100)}%</span>
                    </div>
                    <input type="range" min="0" max="1" step="0.05"
                      value={cfg.templatePhotoVignette ?? 0.40}
                      onChange={e => { setCfg(p => ({ ...p, templatePhotoVignette: parseFloat(e.target.value) })); setTimeout(redrawCanvas, 50); }}
                      className="w-full accent-[#c8102e]" />
                    <div className="flex justify-between text-xs text-gray-400 mt-0.5"><span>Sem vinheta</span><span>Intensa</span></div>
                  </div>
                </div>

                {/* Colors */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-3">
                  <h3 className="font-semibold text-gray-800 text-sm">Cores</h3>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs text-gray-600 mb-1.5">Cor do painel</label>
                      <div className="flex items-center gap-2">
                        <input type="color"
                          value={cfg.templatePanelColor ?? "#1a2448"}
                          onChange={e => { setCfg(p => ({ ...p, templatePanelColor: e.target.value })); setTimeout(redrawCanvas, 50); }}
                          className="w-9 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
                        <span className="text-xs text-gray-400 font-mono">{cfg.templatePanelColor ?? "#1a2448"}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs text-gray-600 mb-1.5">Cor de destaque</label>
                      <div className="flex items-center gap-2">
                        <input type="color"
                          value={cfg.templateAccentColor ?? "#f59e0b"}
                          onChange={e => { setCfg(p => ({ ...p, templateAccentColor: e.target.value })); setTimeout(redrawCanvas, 50); }}
                          className="w-9 h-9 rounded border border-gray-300 cursor-pointer p-0.5" />
                        <span className="text-xs text-gray-400 font-mono">{cfg.templateAccentColor ?? "#f59e0b"}</span>
                      </div>
                      <p className="text-[10px] text-gray-400 mt-1">Badge + subtítulo</p>
                    </div>
                  </div>
                </div>

                {/* URL personalizada */}
                <div className="bg-white border border-gray-200 rounded-xl p-4 space-y-2">
                  <h3 className="font-semibold text-gray-800 text-sm">URL do rodapé</h3>
                  <input
                    type="text"
                    placeholder="Ex: brasilia.com.br  (deixe vazio para automático)"
                    value={cfg.templateSiteUrl ?? ""}
                    onChange={e => { setCfg(p => ({ ...p, templateSiteUrl: e.target.value })); setTimeout(redrawCanvas, 80); }}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-[#c8102e]"
                  />
                  <p className="text-[10px] text-gray-400">Aparece discreto no canto inferior esquerdo da máscara.</p>
                </div>

                <button onClick={saveConfig} disabled={saving}
                  className="w-full py-2.5 bg-[#c8102e] text-white rounded-lg text-sm font-medium hover:bg-[#a50d25] disabled:opacity-50 flex items-center justify-center gap-2">
                  {saving ? <RefreshCw size={13} className="animate-spin" /> : <CheckCircle size={13} />}
                  {saving ? "Salvando…" : "Salvar template"}
                </button>
              </div>

              {/* ── Canvas preview ── */}
              <div className="flex flex-col items-center gap-3 lg:sticky lg:top-4">
                <p className="text-xs text-gray-400 font-medium uppercase tracking-wide">
                  Prévia — {previewType === "feed" ? "Feed 1080×1350" : "Story 1080×1920"}
                </p>
                <div className="relative overflow-hidden rounded-xl border border-gray-200 shadow-sm bg-gray-900"
                  style={{ width: 270, height: previewType === "feed" ? 338 : 480 }}>
                  <canvas ref={previewType === "feed" ? feedCanvasRef : storyCanvasRef}
                    style={{ width: "100%", height: "100%", display: "block" }} />
                </div>
                <button onClick={() => {
                    const ref = previewType === "feed" ? feedCanvasRef.current : storyCanvasRef.current;
                    if (!ref) return;
                    const a = document.createElement("a");
                    a.download = `${previewType}.jpg`;
                    a.href = ref.toDataURL("image/jpeg", 0.92);
                    a.click();
                  }}
                  className="text-xs text-blue-600 hover:underline flex items-center gap-1">
                  <Eye size={11}/> Baixar prévia
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── LEGENDA ───────────────────────────────────────────────────────────── */}
        {tab === "legenda" && (
          <div className="space-y-6">
            <div className="bg-gray-50 border border-gray-200 rounded-lg p-4">
              <p className="text-sm font-medium text-gray-700 mb-2">Variáveis disponíveis</p>
              <div className="flex flex-wrap gap-2">
                {["{{titulo}}", "{{resumo}}", "{{tags}}", "{{categoria}}"].map(v => (
                  <button key={v} onClick={() => navigator.clipboard.writeText(v)}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-white border border-gray-300 rounded text-xs font-mono text-gray-700 hover:bg-gray-100">
                    <Copy size={10} /> {v}
                  </button>
                ))}
              </div>
              <p className="mt-2 text-xs text-gray-400">Clique para copiar. As variáveis são substituídas automaticamente ao publicar.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Instagram size={15} /> Legenda do Feed
                </h3>
                <textarea
                  rows={10}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cfg.feedCaption ?? DEFAULT_FEED_CAPTION}
                  onChange={e => setCfg(p => ({ ...p, feedCaption: e.target.value }))}
                />
                <p className="text-xs text-gray-400">{(cfg.feedCaption ?? DEFAULT_FEED_CAPTION).length} / 2200 caracteres (limite Instagram)</p>
              </div>

              <div className="bg-white border border-gray-200 rounded-xl p-5 space-y-3">
                <h3 className="font-semibold text-gray-800 flex items-center gap-2">
                  <Layers size={15} /> Legenda do Story
                </h3>
                <textarea
                  rows={10}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={cfg.storyCaption ?? DEFAULT_STORY_CAPTION}
                  onChange={e => setCfg(p => ({ ...p, storyCaption: e.target.value }))}
                />
                <p className="text-xs text-gray-400">{(cfg.storyCaption ?? DEFAULT_STORY_CAPTION).length} caracteres</p>
              </div>
            </div>

            <div className="flex justify-end">
              <button onClick={saveConfig} disabled={saving}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#c8102e] text-white rounded-lg text-sm font-medium hover:bg-[#a50d25] disabled:opacity-50">
                {saving ? <RefreshCw size={14} className="animate-spin" /> : <CheckCircle size={14} />}
                {saving ? "Salvando…" : "Salvar legendas"}
              </button>
            </div>
          </div>
        )}

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
                      <input type="checkbox" className="w-4 h-4 accent-[#c8102e]"
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

        {/* Hidden canvases for template tab (other type) */}
        {tab === "template" && (
          <>
            <canvas ref={previewType === "feed" ? storyCanvasRef : feedCanvasRef} className="hidden" />
          </>
        )}
      </div>
    </AdminLayout>
  );
}
