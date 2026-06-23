/**
 * store.ts — In-memory cache backed by PostgreSQL.
 *
 * Public interface is SYNCHRONOUS (reads from cache).
 * Writes update the cache immediately, then persist to DB asynchronously.
 * Call `initStore()` at server startup to hydrate the cache from DB.
 */

import { randomUUID } from "crypto";
import { existsSync, readFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { eq, sql } from "drizzle-orm";
import {
  db,
  settingsTable,
  rssSourcesTable,
  perplexityTopicsTable,
  categoryViewsTable,
  articleViewsTable,
} from "@workspace/db";
import { logger } from "./logger.js";

// ─── Types (kept identical to original interface) ─────────────────────────────

export interface Article {
  id: string; title: string; subtitle: string; content: string;
  category: string; tag: string; imageUrl: string; author: string;
  publishedAt: string; status: "draft" | "published";
  createdAt: string; updatedAt: string;
  origin?: "manual" | "rss" | "perplexity";
  rssSourceId?: string; rssSourceName?: string; rssSourceUrl?: string;
  aiRewritten?: boolean; slug?: string; keywords?: string;
}

export interface MenuItem {
  id: string; label: string; path: string;
  order: number; visible: boolean; newTab?: boolean; highlight?: boolean;
}

export interface HomeBlock {
  id: string; name: string; visible: boolean; order: number;
  category?: string;
  layout?: "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico" | "trio" | "compact" | "bigstory" | "timeline";
  color?: string; custom?: boolean; reverse?: boolean;
}

export interface SiteSettings {
  siteName: string; tagline: string; logoBase64?: string; logoSize?: number;
  mobileEnabled: boolean; desktopEnabled: boolean;
  showTickerBar?: boolean; showHeroStrip?: boolean;
  seoDescription?: string; seoKeywords?: string;
  facebookPixelId?: string; gtmId?: string; ga4MeasurementId?: string;
  ogImageBase64?: string; faviconBase64?: string;
  homeBlocks?: HomeBlock[]; adminLogoBase64?: string; loginLogoBase64?: string;
  adminSidebarColor?: string; adminAccentColor?: string;
  rssAiProvider?: "gemini_free" | "gemini_paid" | "gemini_direct" | "openai";
  rssAiApiKey?: string; rssAiModel?: string; rssAiOutputPrompt?: string;
  diffbotApiKey?: string; geminiApiKey?: string; geminiApiKeys?: string[];
  openaiApiKey?: string; youtubeApiKey?: string; bylineName?: string;
  bylineLogoBase64?: string; webhookApiKey?: string; siteUrl?: string;
}

export type ColumnistSpecialty =
  | "Política" | "Esporte" | "Economia" | "Cultura" | "Segurança Pública" | "Social" | "Outro";

export interface Columnist {
  id: string; name: string; bio: string; specialty: ColumnistSpecialty;
  avatarBase64: string; active: boolean; createdAt: string; updatedAt: string;
}

export interface ContactInfo {
  supportEmail: string; displayEmail: string; phone: string; whatsapp: string;
  facebook: string; instagram: string; x: string; youtube: string; tiktok: string;
  address: string; cnpj: string; legalInfo: string; privacyPolicy: string; termsOfUse: string;
}

export type RssAutoMode = "none" | "draft" | "publish" | "rewrite_draft" | "rewrite_publish";

export interface RssSource {
  id: string; name: string; url: string; category: string; active: boolean;
  createdAt: string; scheduleHours: number; fetchLimit?: number;
  giveCredit: boolean; autoMode: RssAutoMode;
  lastFetchedAt?: string; customPrompt?: string;
}

export interface RssPrompts { global?: string; categories?: Record<string, string> }

export interface SocialConfig {
  instagramUserId?: string; facebookPageId?: string; pageAccessToken?: string;
  feedCaption?: string; storyCaption?: string;
  autoPublishFeed?: boolean; autoPublishStory?: boolean; autoPublishFacebook?: boolean;
  templateShowLogo?: boolean; templateShowCategory?: boolean;
  templateGradientFrom?: string; templateGradientTo?: string; lastPublishedAt?: string;
}

export type PerplexityAutoMode = "none" | "draft" | "published";

export interface PerplexityTopic {
  id: string; name: string; query: string; category: string; active: boolean;
  scheduleHours: number; maxResults: number; autoMode: PerplexityAutoMode;
  lastRunAt?: string; createdAt: string;
}

// ─── Defaults ─────────────────────────────────────────────────────────────────

const DEFAULT_HOME_BLOCKS: HomeBlock[] = [
  { id: "hero",       name: "Hero / Destaques",   visible: true, order: 0 },
  { id: "brasil",     name: "Brasil",              visible: true, order: 1 },
  { id: "mais-lidas", name: "Mais Lidas",          visible: true, order: 2 },
  { id: "mundo",      name: "Mundo",               visible: true, order: 3 },
  { id: "esporte",    name: "Esporte",             visible: true, order: 4 },
  { id: "cultura",    name: "Cultura",             visible: true, order: 5 },
  { id: "df",         name: "DF",                  visible: true, order: 6 },
  { id: "saude",      name: "Saúde",               visible: true, order: 7 },
  { id: "tecnologia", name: "Tecnologia",          visible: true, order: 8 },
  { id: "colunistas", name: "Colunistas",          visible: true, order: 9 },
  { id: "ultimas",    name: "Últimas Notícias",    visible: true, order: 10 },
];

const DEFAULT_SETTINGS: SiteSettings = {
  siteName: "Brasília Hoje", tagline: "A notícia da nossa capital, agora.",
  logoSize: 101, mobileEnabled: true, desktopEnabled: true,
  showTickerBar: true, showHeroStrip: true, homeBlocks: DEFAULT_HOME_BLOCKS,
};

const DEFAULT_MENU: MenuItem[] = [
  { id: "1", label: "HOME",      path: "/",          order: 0, visible: true },
  { id: "2", label: "POLÍTICA",  path: "/politica",  order: 1, visible: true },
  { id: "3", label: "CIDADE",    path: "/cidade",    order: 2, visible: true },
  { id: "4", label: "SEGURANÇA", path: "/seguranca", order: 3, visible: true },
  { id: "5", label: "TRANSPORTE",path: "/transporte",order: 4, visible: true },
  { id: "6", label: "SAÚDE",     path: "/saude",     order: 5, visible: true },
  { id: "7", label: "EDUCAÇÃO",  path: "/educacao",  order: 6, visible: true },
  { id: "8", label: "CULTURA",   path: "/cultura",   order: 7, visible: true },
  { id: "9", label: "ESPORTES",  path: "/esportes",  order: 8, visible: true },
  { id: "10",label: "COLUNAS",   path: "/colunas",   order: 9, visible: true },
];

const DEFAULT_COLUMNISTS: Columnist[] = [
  { id: "c1", name: "Ana Paula Mendes", specialty: "Política", bio: "Jornalista com 15 anos de cobertura do Congresso Nacional e Palácio do Planalto.", avatarBase64: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "c2", name: "Carlos Eduardo Rocha", specialty: "Esporte", bio: "Cronista esportivo, ex-atleta e comentarista. Cobertura de futebol, atletismo e esportes olímpicos.", avatarBase64: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "c3", name: "Beatriz Fonseca", specialty: "Economia", bio: "Economista e analista de mercado. Escreve sobre finanças pessoais e macroeconomia.", avatarBase64: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "c4", name: "Rafael Martins", specialty: "Cultura", bio: "Crítico de cinema, teatro e literatura. Doutor em comunicação pela UnB.", avatarBase64: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "c5", name: "Juliana Soares", specialty: "Segurança Pública", bio: "Especialista em segurança pública e direitos humanos.", avatarBase64: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
  { id: "c6", name: "Marcos Vinicius Costa", specialty: "Social", bio: "Assistente social e colunista. Escreve sobre desigualdade e políticas públicas.", avatarBase64: "", active: true, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
];

const DEFAULT_CONTACT: ContactInfo = {
  supportEmail: "suporte@beemedia.ai", displayEmail: "redacao@brasiliaagora.com.br",
  phone: "(61) 99888-0000", whatsapp: "(61) 99888-0000",
  facebook: "", instagram: "", x: "", youtube: "", tiktok: "",
  address: "Brasília, Distrito Federal", cnpj: "", legalInfo: "", privacyPolicy: "", termsOfUse: "",
};

const DEFAULT_RSS_SOURCES: Omit<RssSource, "id" | "createdAt">[] = [
  { name: "Agência Brasil – Política",      url: "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",               category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense – Política", url: "https://www.correiobraziliense.com.br/politica/feed",                   category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Política",           url: "https://jovempan.com.br/noticias/politica/feed",                         category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Agência Brasil – Internacional", url: "https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml",           category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Carta Capital – Mundo",          url: "https://www.cartacapital.com.br/mundo/feed/",                            category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Mundo",              url: "https://jovempan.com.br/noticias/mundo/feed",                            category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Agência Brasil – Economia",      url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",                category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Economia",           url: "https://www.infomoney.com.br/economia/feed/",                            category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Economia",           url: "https://jovempan.com.br/noticias/economia/feed",                         category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Agência Brasil – Esportes",      url: "https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml",                category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Esportes",           url: "https://jovempan.com.br/esportes/feed",                                  category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Esportes",          url: "https://www.metropoles.com/esportes/feed",                               category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Agência Brasil – Cultura",       url: "https://agenciabrasil.ebc.com.br/radioagencia-nacional/rss/cultura/feed.xml", category: "cultura", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Entretenimento",    url: "https://www.metropoles.com/entretenimento/feed",                         category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Agência Brasil – Justiça",       url: "https://agenciabrasil.ebc.com.br/rss/justica/feed.xml",                 category: "seguranca",  active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense – Saúde",    url: "https://www.correiobraziliense.com.br/ciencia-e-saude/feed",             category: "saude",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Saúde",             url: "https://www.metropoles.com/saude/feed",                                  category: "saude",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Notícias ao Minuto – Tech",      url: "https://www.noticiasaominuto.com.br/rss/tech",                          category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Ciência",           url: "https://www.metropoles.com/ciencia/feed",                                category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense (geral)",    url: "https://www.correiobraziliense.com.br/feed",                             category: "cidade",     active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jornal de Brasília – DF",        url: "https://jornaldebrasilia.com.br/brasilia/feed/",                         category: "cidade",     active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Distrito Federal",  url: "https://www.metropoles.com/distrito-federal/feed",                      category: "cidade",     active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense – Brasil",   url: "https://www.correiobraziliense.com.br/brasil/feed",                     category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Brasil",             url: "https://jovempan.com.br/noticias/brasil/feed",                           category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Brasil",            url: "https://www.metropoles.com/brasil/feed",                                 category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
];

// ─── In-memory cache ──────────────────────────────────────────────────────────

interface StoreCache {
  settings:         SiteSettings;
  menuItems:        MenuItem[];
  columnists:       Columnist[];
  contactInfo:      ContactInfo;
  socialConfig:     SocialConfig;
  rssPrompts:       RssPrompts;
  rssSources:       RssSource[];
  perplexityTopics: PerplexityTopic[];
  categoryViews:    Record<string, number>;
  articleViews:     Record<string, { title: string; views: number }>;
}

let _cache: StoreCache = {
  settings:         { ...DEFAULT_SETTINGS },
  menuItems:        [...DEFAULT_MENU],
  columnists:       [...DEFAULT_COLUMNISTS],
  contactInfo:      { ...DEFAULT_CONTACT },
  socialConfig:     {},
  rssPrompts:       {},
  rssSources:       [],
  perplexityTopics: [],
  categoryViews:    {},
  articleViews:     {},
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

// File path for store.json migration
const _storeDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const STORE_FILE = join(_storeDir, "store.json");

interface LegacyStoreData {
  settings?: Partial<SiteSettings>;
  menuItems?: MenuItem[];
  columnists?: Columnist[];
  contactInfo?: Partial<ContactInfo>;
  socialConfig?: SocialConfig;
  rssPrompts?: RssPrompts;
  rssSources?: RssSource[];
  perplexityTopics?: PerplexityTopic[];
  categoryViews?: Record<string, number>;
  articleViews?: Record<string, { title: string; views: number }>;
  articles?: Article[];
}

/** Async upsert a JSON blob into the settings table (fire and forget) */
function persistSetting(key: string, value: unknown): void {
  const v = JSON.stringify(value);
  db.insert(settingsTable)
    .values({ key, value: v, updatedAt: new Date() })
    .onConflictDoUpdate({ target: settingsTable.key, set: { value: v, updatedAt: new Date() } })
    .catch((err: unknown) => logger.error({ err }, `store: failed to persist setting "${key}"`));
}

function slugify(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "").trim().replace(/\s+/g, "-")
    .replace(/-+/g, "-").slice(0, 80).replace(/^-+|-+$/g, "");
}

// ─── initStore — call once at startup ────────────────────────────────────────

export async function initStore(): Promise<void> {
  try {
    // 1. Load JSON blobs from settings table
    const rows = await db.select().from(settingsTable);
    for (const row of rows) {
      try {
        const parsed = JSON.parse(row.value) as unknown;
        switch (row.key) {
          case "site_settings":  _cache.settings       = parsed as SiteSettings;  break;
          case "menu_items":     _cache.menuItems       = parsed as MenuItem[];    break;
          case "columnists":     _cache.columnists      = parsed as Columnist[];   break;
          case "contact_info":   _cache.contactInfo     = parsed as ContactInfo;   break;
          case "social_config":  _cache.socialConfig    = parsed as SocialConfig;  break;
          case "rss_prompts":    _cache.rssPrompts      = parsed as RssPrompts;    break;
          case "category_views": _cache.categoryViews   = parsed as Record<string, number>; break;
          case "article_views":  _cache.articleViews    = parsed as Record<string, { title: string; views: number }>; break;
        }
      } catch { /* ignore corrupt entries */ }
    }

    // 2. Load rss_sources from DB table
    const dbSources = await db.select().from(rssSourcesTable);
    if (dbSources.length > 0) {
      _cache.rssSources = dbSources.map((r) => ({
        id: r.id, name: r.name, url: r.url, category: r.category,
        active: r.active, scheduleHours: r.scheduleHours,
        fetchLimit: r.fetchLimit ?? undefined,
        giveCredit: r.giveCredit, autoMode: r.autoMode as RssAutoMode,
        lastFetchedAt: r.lastFetchedAt?.toISOString(),
        customPrompt: r.customPrompt ?? undefined,
        createdAt: r.createdAt.toISOString(),
      }));
    }

    // 3. Load perplexity_topics from DB table
    const dbTopics = await db.select().from(perplexityTopicsTable);
    if (dbTopics.length > 0) {
      _cache.perplexityTopics = dbTopics.map((r) => ({
        id: r.id, name: r.name, query: r.query, category: r.category,
        active: r.active, scheduleHours: r.scheduleHours,
        maxResults: r.maxResults, autoMode: r.autoMode as PerplexityAutoMode,
        lastRunAt: r.lastRunAt?.toISOString(),
        createdAt: r.createdAt.toISOString(),
      }));
    }

    // 4. Load article_views and category_views from their tables
    const dbArticleViews = await db.select().from(articleViewsTable);
    if (dbArticleViews.length > 0) {
      for (const r of dbArticleViews) {
        _cache.articleViews[r.articleId] = { title: r.title, views: r.views };
      }
    }
    const dbCatViews = await db.select().from(categoryViewsTable);
    if (dbCatViews.length > 0) {
      for (const r of dbCatViews) {
        _cache.categoryViews[r.category] = r.views;
      }
    }

    // 5. Migrate from store.json if DB is empty (first run)
    await migrateFromJsonFile();

    logger.info({
      rssSources: _cache.rssSources.length,
      perplexityTopics: _cache.perplexityTopics.length,
    }, "store: initialized from PostgreSQL");
  } catch (err) {
    logger.error({ err }, "store: failed to initialize from DB — using defaults");
  }
}

async function migrateFromJsonFile(): Promise<void> {
  if (!existsSync(STORE_FILE)) return;

  let legacy: LegacyStoreData;
  try {
    legacy = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as LegacyStoreData;
  } catch { return; }

  let migrated = 0;

  // Migrate RSS sources
  if (_cache.rssSources.length === 0 && legacy.rssSources?.length) {
    const rows = legacy.rssSources.map((s) => ({
      id: s.id, name: s.name, url: s.url, category: s.category,
      active: s.active, scheduleHours: s.scheduleHours,
      fetchLimit: s.fetchLimit ?? null,
      giveCredit: s.giveCredit, autoMode: s.autoMode,
      lastFetchedAt: s.lastFetchedAt ? new Date(s.lastFetchedAt) : null,
      customPrompt: s.customPrompt ?? null,
      createdAt: new Date(s.createdAt),
    }));
    for (const row of rows) {
      await db.insert(rssSourcesTable).values(row).onConflictDoNothing();
    }
    _cache.rssSources = legacy.rssSources;
    migrated += rows.length;
  }

  // Migrate perplexity topics
  if (_cache.perplexityTopics.length === 0 && legacy.perplexityTopics?.length) {
    for (const t of legacy.perplexityTopics) {
      await db.insert(perplexityTopicsTable).values({
        id: t.id, name: t.name, query: t.query ?? "", category: t.category,
        active: t.active, scheduleHours: t.scheduleHours, maxResults: t.maxResults,
        autoMode: t.autoMode, lastRunAt: t.lastRunAt ? new Date(t.lastRunAt) : null,
        createdAt: new Date(t.createdAt),
      }).onConflictDoNothing();
    }
    _cache.perplexityTopics = legacy.perplexityTopics;
    migrated += legacy.perplexityTopics.length;
  }

  // Migrate settings blobs (only if not already in DB)
  const dbRows = await db.select().from(settingsTable);
  const dbKeys = new Set(dbRows.map((r) => r.key));

  if (!dbKeys.has("site_settings") && legacy.settings) {
    _cache.settings = { ...DEFAULT_SETTINGS, ...legacy.settings };
    persistSetting("site_settings", _cache.settings);
  }
  if (!dbKeys.has("menu_items") && legacy.menuItems?.length) {
    _cache.menuItems = legacy.menuItems;
    persistSetting("menu_items", _cache.menuItems);
  }
  if (!dbKeys.has("columnists") && legacy.columnists?.length) {
    _cache.columnists = legacy.columnists;
    persistSetting("columnists", _cache.columnists);
  }
  if (!dbKeys.has("contact_info") && legacy.contactInfo) {
    _cache.contactInfo = { ...DEFAULT_CONTACT, ...legacy.contactInfo };
    persistSetting("contact_info", _cache.contactInfo);
  }
  if (!dbKeys.has("social_config") && legacy.socialConfig) {
    _cache.socialConfig = legacy.socialConfig;
    persistSetting("social_config", _cache.socialConfig);
  }
  if (!dbKeys.has("rss_prompts") && legacy.rssPrompts) {
    _cache.rssPrompts = legacy.rssPrompts;
    persistSetting("rss_prompts", _cache.rssPrompts);
  }
  if (!dbKeys.has("category_views") && legacy.categoryViews) {
    _cache.categoryViews = legacy.categoryViews;
    persistSetting("category_views", _cache.categoryViews);
  }
  if (!dbKeys.has("article_views") && legacy.articleViews) {
    _cache.articleViews = legacy.articleViews;
    persistSetting("article_views", _cache.articleViews);
  }

  if (migrated > 0) {
    logger.info({ migrated }, "store: migrated data from store.json to PostgreSQL");
  }
}

// ─── Seed default RSS sources (once) ─────────────────────────────────────────

export async function seedDefaultRssSources(): Promise<void> {
  if (_cache.rssSources.length > 0) return;
  const rows = DEFAULT_RSS_SOURCES.map((s) => ({
    ...s, id: randomUUID(), createdAt: new Date(),
    fetchLimit: s.fetchLimit ?? null, customPrompt: null,
    lastFetchedAt: null,
  }));
  for (const row of rows) {
    await db.insert(rssSourcesTable).values(row).onConflictDoNothing();
  }
  _cache.rssSources = rows.map((r) => ({
    ...r, createdAt: r.createdAt.toISOString(),
    fetchLimit: r.fetchLimit ?? undefined, customPrompt: r.customPrompt ?? undefined,
    lastFetchedAt: undefined,
  }));
  logger.info({ count: rows.length }, "store: seeded default RSS sources");
}

// ─── Public store interface ───────────────────────────────────────────────────

export const store = {
  // ── Settings ──────────────────────────────────────────────────────────────
  getSettings: (): SiteSettings => ({ ..._cache.settings }),

  getPublicSettings: () => {
    const s = { ..._cache.settings };
    const allGeminiKeys = (s.geminiApiKeys ?? []).filter((k) => k.trim().length > 0);
    const out: Record<string, unknown> = {
      ...s,
      hasRssAiKey:    !!s.rssAiApiKey,
      hasDiffbotKey:  !!s.diffbotApiKey,
      hasGeminiKey:   !!s.geminiApiKey || allGeminiKeys.length > 0,
      hasOpenaiKey:   !!s.openaiApiKey,
      hasYoutubeKey:  !!s.youtubeApiKey,
    };
    delete out["rssAiApiKey"];
    delete out["diffbotApiKey"];
    delete out["geminiApiKey"];
    delete out["geminiApiKeys"];
    delete out["openaiApiKey"];
    delete out["youtubeApiKey"];
    return out as Omit<SiteSettings, "rssAiApiKey"|"diffbotApiKey"|"geminiApiKey"|"geminiApiKeys"|"openaiApiKey"|"youtubeApiKey"> & {
      hasRssAiKey: boolean; hasDiffbotKey: boolean; hasGeminiKey: boolean;
      hasOpenaiKey: boolean; hasYoutubeKey: boolean;
    };
  },

  updateSettings: (data: Partial<SiteSettings>): SiteSettings => {
    _cache.settings = { ..._cache.settings, ...data };
    persistSetting("site_settings", _cache.settings);
    return { ..._cache.settings };
  },

  // ── Menu ──────────────────────────────────────────────────────────────────
  getMenuItems: (): MenuItem[] => [..._cache.menuItems].sort((a, b) => a.order - b.order),

  updateMenuItems: (items: MenuItem[]): MenuItem[] => {
    _cache.menuItems = items;
    persistSetting("menu_items", _cache.menuItems);
    return [..._cache.menuItems];
  },

  // ── Columnists ────────────────────────────────────────────────────────────
  getColumnists: (): Columnist[] => [..._cache.columnists],
  getColumnist:  (id: string): Columnist | null => _cache.columnists.find((c) => c.id === id) ?? null,

  createColumnist: (data: Omit<Columnist, "id" | "createdAt" | "updatedAt">): Columnist => {
    const col: Columnist = { ...data, id: randomUUID(), createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    _cache.columnists.push(col);
    persistSetting("columnists", _cache.columnists);
    return col;
  },

  updateColumnist: (id: string, data: Partial<Omit<Columnist, "id" | "createdAt">>): Columnist | null => {
    const idx = _cache.columnists.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    _cache.columnists[idx] = { ..._cache.columnists[idx]!, ...data, updatedAt: new Date().toISOString() };
    persistSetting("columnists", _cache.columnists);
    return _cache.columnists[idx]!;
  },

  deleteColumnist: (id: string): boolean => {
    const before = _cache.columnists.length;
    _cache.columnists = _cache.columnists.filter((c) => c.id !== id);
    const deleted = _cache.columnists.length < before;
    if (deleted) persistSetting("columnists", _cache.columnists);
    return deleted;
  },

  // ── Contact Info ──────────────────────────────────────────────────────────
  getContactInfo: (): ContactInfo => ({ ..._cache.contactInfo }),

  updateContactInfo: (data: Partial<ContactInfo>): ContactInfo => {
    _cache.contactInfo = { ..._cache.contactInfo, ...data };
    persistSetting("contact_info", _cache.contactInfo);
    return { ..._cache.contactInfo };
  },

  // ── Social Config ─────────────────────────────────────────────────────────
  getSocialConfig: (): SocialConfig => ({ ..._cache.socialConfig }),

  updateSocialConfig: (data: Partial<SocialConfig>): SocialConfig => {
    _cache.socialConfig = { ..._cache.socialConfig, ...data };
    persistSetting("social_config", _cache.socialConfig);
    return { ..._cache.socialConfig };
  },

  // ── RSS Prompts ───────────────────────────────────────────────────────────
  getRssPrompts: (): RssPrompts => ({ ...(_cache.rssPrompts ?? {}) }),

  updateRssPrompts: (data: RssPrompts): RssPrompts => {
    _cache.rssPrompts = { ...(_cache.rssPrompts ?? {}), ...data };
    persistSetting("rss_prompts", _cache.rssPrompts);
    return { ..._cache.rssPrompts };
  },

  // ── RSS Sources (authoritative in DB) ────────────────────────────────────
  getRssSources: (): RssSource[] => [..._cache.rssSources],

  createRssSource: (data: Omit<RssSource, "id" | "createdAt">): RssSource => {
    const src: RssSource = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    _cache.rssSources.push(src);
    db.insert(rssSourcesTable).values({
      id: src.id, name: src.name, url: src.url, category: src.category,
      active: src.active, scheduleHours: src.scheduleHours,
      fetchLimit: src.fetchLimit ?? null,
      giveCredit: src.giveCredit, autoMode: src.autoMode,
      lastFetchedAt: src.lastFetchedAt ? new Date(src.lastFetchedAt) : null,
      customPrompt: src.customPrompt ?? null,
      createdAt: new Date(src.createdAt),
    }).catch((err: unknown) => logger.error({ err }, "store: failed to insert RSS source"));
    return src;
  },

  updateRssSource: (id: string, data: Partial<Omit<RssSource, "id" | "createdAt">>): RssSource | null => {
    const idx = _cache.rssSources.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    _cache.rssSources[idx] = { ..._cache.rssSources[idx]!, ...data };
    const src = _cache.rssSources[idx]!;
    db.update(rssSourcesTable).set({
      name: src.name, url: src.url, category: src.category,
      active: src.active, scheduleHours: src.scheduleHours,
      fetchLimit: src.fetchLimit ?? null,
      giveCredit: src.giveCredit, autoMode: src.autoMode,
      lastFetchedAt: src.lastFetchedAt ? new Date(src.lastFetchedAt) : null,
      customPrompt: src.customPrompt ?? null,
    }).where(eq(rssSourcesTable.id, id))
      .catch((err: unknown) => logger.error({ err }, "store: failed to update RSS source"));
    return src;
  },

  deleteRssSource: (id: string): boolean => {
    const before = _cache.rssSources.length;
    _cache.rssSources = _cache.rssSources.filter((s) => s.id !== id);
    const deleted = _cache.rssSources.length < before;
    if (deleted) {
      db.delete(rssSourcesTable).where(eq(rssSourcesTable.id, id))
        .catch((err: unknown) => logger.error({ err }, "store: failed to delete RSS source"));
    }
    return deleted;
  },

  // ── Perplexity Topics (authoritative in DB) ───────────────────────────────
  getPerplexityTopics: (): PerplexityTopic[] => [..._cache.perplexityTopics],

  createPerplexityTopic: (data: Omit<PerplexityTopic, "id" | "createdAt">): PerplexityTopic => {
    const topic: PerplexityTopic = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    _cache.perplexityTopics.push(topic);
    db.insert(perplexityTopicsTable).values({
      id: topic.id, name: topic.name, query: topic.query ?? "",
      category: topic.category, active: topic.active,
      scheduleHours: topic.scheduleHours, maxResults: topic.maxResults,
      autoMode: topic.autoMode,
      lastRunAt: topic.lastRunAt ? new Date(topic.lastRunAt) : null,
      createdAt: new Date(topic.createdAt),
    }).catch((err: unknown) => logger.error({ err }, "store: failed to insert perplexity topic"));
    return topic;
  },

  updatePerplexityTopic: (id: string, data: Partial<Omit<PerplexityTopic, "id" | "createdAt">>): PerplexityTopic | null => {
    const idx = _cache.perplexityTopics.findIndex((t) => t.id === id);
    if (idx === -1) return null;
    _cache.perplexityTopics[idx] = { ..._cache.perplexityTopics[idx]!, ...data };
    const t = _cache.perplexityTopics[idx]!;
    db.update(perplexityTopicsTable).set({
      name: t.name, query: t.query ?? "", category: t.category,
      active: t.active, scheduleHours: t.scheduleHours, maxResults: t.maxResults,
      autoMode: t.autoMode,
      lastRunAt: t.lastRunAt ? new Date(t.lastRunAt) : null,
    }).where(eq(perplexityTopicsTable.id, id))
      .catch((err: unknown) => logger.error({ err }, "store: failed to update perplexity topic"));
    return _cache.perplexityTopics[idx]!;
  },

  deletePerplexityTopic: (id: string): boolean => {
    const before = _cache.perplexityTopics.length;
    _cache.perplexityTopics = _cache.perplexityTopics.filter((t) => t.id !== id);
    const deleted = _cache.perplexityTopics.length < before;
    if (deleted) {
      db.delete(perplexityTopicsTable).where(eq(perplexityTopicsTable.id, id))
        .catch((err: unknown) => logger.error({ err }, "store: failed to delete perplexity topic"));
    }
    return deleted;
  },

  // ── Category Views ────────────────────────────────────────────────────────
  getCategoryViews: (): Record<string, number> => ({ ..._cache.categoryViews }),

  trackCategoryView: (category: string): void => {
    _cache.categoryViews[category] = (_cache.categoryViews[category] ?? 0) + 1;
    db.insert(categoryViewsTable)
      .values({ category, views: 1, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: categoryViewsTable.category,
        set: { views: sql`${categoryViewsTable.views} + 1`, updatedAt: new Date() },
      })
      .catch((err: unknown) => logger.error({ err }, "store: failed to track category view"));
  },

  // ── Article Views ─────────────────────────────────────────────────────────
  getArticleViews: (): Record<string, { title: string; views: number }> => ({ ..._cache.articleViews }),

  trackArticleView: (articleId: string, title: string): void => {
    const cur = _cache.articleViews[articleId];
    _cache.articleViews[articleId] = { title: title || cur?.title || articleId, views: (cur?.views ?? 0) + 1 };
    db.insert(articleViewsTable)
      .values({ articleId, title: title || articleId, views: 1, updatedAt: new Date() })
      .onConflictDoUpdate({
        target: articleViewsTable.articleId,
        set: {
          title: sql`CASE WHEN ${articleViewsTable.title} = '' THEN ${title} ELSE ${articleViewsTable.title} END`,
          views: sql`${articleViewsTable.views} + 1`,
          updatedAt: new Date(),
        },
      })
      .catch((err: unknown) => logger.error({ err }, "store: failed to track article view"));
  },

  // ── Legacy stubs (kept for backward compatibility) ────────────────────────
  // Articles are now managed exclusively by articleService + DB.
  getArticles: (): Article[] => [],
  isDuplicateArticle: (_title: string, _link?: string, _imageUrl?: string): boolean => false,

  // ── Slug utility ──────────────────────────────────────────────────────────
  slugify,
};
