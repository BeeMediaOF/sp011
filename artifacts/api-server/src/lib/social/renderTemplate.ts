/**
 * Renderizador de arte social via Playwright (Chromium headless).
 *
 * Substitui o antigo gerador baseado em Sharp+SVG: aqui o servidor renderiza
 * EXATAMENTE o mesmo HTML/CSS do editor (via `@workspace/social-template`) e
 * tira um screenshot 1080×N. Isso garante o WYSIWYG — o preview do editor é,
 * pixel a pixel, a imagem publicada — incluindo fontes reais, quebra de linha
 * do navegador e PNGs com transparência (máscaras feitas no Canva).
 *
 * Mantém um browser "quente" (lançado uma vez e reusado) para evitar o
 * cold-start a cada post e economizar memória no VPS.
 */
import type { Browser } from "playwright";
import { chromium } from "playwright";
import {
  buildTemplateHtml,
  type ArticleData,
  type SocialTemplate,
  type TemplateElement,
} from "@workspace/social-template";
import { logger } from "../logger.js";

export type { ArticleData, SocialTemplate, TemplateElement };

let _browser: Browser | null = null;
let _launching: Promise<Browser> | null = null;

async function getBrowser(): Promise<Browser> {
  if (_browser && _browser.isConnected()) return _browser;
  if (_launching) return _launching;

  _launching = chromium
    .launch({
      headless: true,
      args: [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-gpu",
        "--font-render-hinting=none",
      ],
    })
    .then((b) => {
      _browser = b;
      _launching = null;
      b.on("disconnected", () => {
        _browser = null;
      });
      logger.info("Social render: Chromium iniciado (browser quente)");
      return b;
    })
    .catch((err) => {
      _launching = null;
      throw err;
    });

  return _launching;
}

export interface RenderOptions {
  /** Base para resolver URLs relativas de imagens (ex.: uploads). */
  baseHref?: string;
}

/**
 * Renderiza o template + dados do artigo em um JPEG (qualidade 90),
 * no tamanho real definido pelo template (ex.: 1080×1350 / 1080×1920).
 */
export async function renderArt(
  template: SocialTemplate,
  article: ArticleData,
  opts: RenderOptions = {},
): Promise<Buffer> {
  const html = buildTemplateHtml(template, article, { baseHref: opts.baseHref });
  const browser = await getBrowser();
  const context = await browser.newContext({
    viewport: { width: template.width, height: template.height },
    deviceScaleFactor: 1,
  });
  const page = await context.newPage();
  try {
    await page.setContent(html, { waitUntil: "load", timeout: 30_000 });
    // Espera fontes carregarem e imagens decodificarem antes do screenshot,
    // senão o print pode sair com fonte fallback ou imagem em branco.
    // (Callback roda no contexto do browser; usamos `any` pois o tsconfig do
    // servidor não inclui a lib DOM.)
    await page.evaluate(async () => {
      const doc = (globalThis as unknown as { document: any }).document;
      try {
        await doc.fonts.ready;
      } catch {
        /* noop */
      }
      const imgs: any[] = Array.from(doc.images);
      await Promise.all(
        imgs.map((img) => (img.complete ? Promise.resolve() : img.decode().catch(() => undefined))),
      );
      // Auto-ajuste: encolhe a fonte dos textos marcados até caberem na caixa
      // (após as fontes carregarem, para medir com a métrica real).
      const getCS = (globalThis as unknown as { getComputedStyle: (n: any) => { fontSize: string } }).getComputedStyle;
      const nodes: any[] = Array.from(doc.querySelectorAll('[data-fit="1"]'));
      for (const el of nodes) {
        let size = parseFloat(getCS(el).fontSize);
        const min = Math.max(12, Math.round(size * 0.5));
        let guard = 400;
        while (size > min && guard-- > 0 && (el.scrollHeight > el.clientHeight || el.scrollWidth > el.clientWidth)) {
          size -= 1;
          el.style.fontSize = size + "px";
        }
      }
    });
    const buf = await page.screenshot({
      type: "jpeg",
      quality: 90,
      clip: { x: 0, y: 0, width: template.width, height: template.height },
    });
    return buf;
  } finally {
    await context.close().catch(() => undefined);
  }
}

/** Fecha o browser quente (chamado no shutdown gracioso, opcional). */
export async function closeRenderBrowser(): Promise<void> {
  if (_browser) {
    await _browser.close().catch(() => undefined);
    _browser = null;
  }
}
