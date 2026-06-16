import { readFileSync, writeFileSync, existsSync, mkdirSync } from "fs";
import { randomUUID } from "crypto";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

function slugify(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 80)
    .replace(/^-+|-+$/g, "");
}

export interface Article {
  id: string;
  title: string;
  subtitle: string;
  content: string;
  category: string;
  tag: string;
  imageUrl: string;
  author: string;
  publishedAt: string;
  status: "draft" | "published";
  createdAt: string;
  updatedAt: string;
  origin?: "manual" | "rss";
  rssSourceId?: string;
  rssSourceName?: string;
  rssSourceUrl?: string;
  aiRewritten?: boolean;
  slug?: string;
  keywords?: string;
}

export interface MenuItem {
  id: string;
  label: string;
  path: string;
  order: number;
  visible: boolean;
}

export interface HomeBlock {
  id: string;
  name: string;
  visible: boolean;
  order: number;
  category?: string;
  layout?: "grid" | "featured" | "duplo" | "cultura" | "lista" | "manchete" | "mosaico";
  color?: string;
  custom?: boolean;
}

export interface SiteSettings {
  siteName: string;
  tagline: string;
  logoBase64?: string;
  logoSize?: number;
  mobileEnabled: boolean;
  desktopEnabled: boolean;
  seoDescription?: string;
  seoKeywords?: string;
  ogImageBase64?: string;
  faviconBase64?: string;
  homeBlocks?: HomeBlock[];
  adminLogoBase64?: string;
  adminSidebarColor?: string;
  adminAccentColor?: string;
  rssAiProvider?: "gemini_free" | "gemini_paid" | "openai";
  rssAiApiKey?: string;
  rssAiModel?: string;
  bylineName?: string;
  bylineLogoBase64?: string;
}

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

export interface Ad {
  id: string;
  name: string;
  imageBase64: string;
  link: string;
  position: "slot_01" | "slot_02" | "slot_03" | "slot_04" | "slot_05" | "topo" | "centro" | "lateral" | "rodape" | "slidebar_250" | "slidebar_500" | "banner" | "sidebar" | "central";
  active: boolean;
  clicks: number;
  impressions: number;
  createdAt: string;
  updatedAt: string;
}

export type ColumnistSpecialty =
  | "Política"
  | "Esporte"
  | "Economia"
  | "Cultura"
  | "Segurança Pública"
  | "Social"
  | "Outro";

export interface Columnist {
  id: string;
  name: string;
  bio: string;
  specialty: ColumnistSpecialty;
  avatarBase64: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface ContactInfo {
  supportEmail: string;
  displayEmail: string;
  phone: string;
  whatsapp: string;
  facebook: string;
  instagram: string;
  x: string;
  youtube: string;
  tiktok: string;
  address: string;
  cnpj: string;
  legalInfo: string;
  privacyPolicy: string;
  termsOfUse: string;
}

export type RssAutoMode = "none" | "draft" | "publish" | "rewrite_draft" | "rewrite_publish";

export interface RssSource {
  id: string;
  name: string;
  url: string;
  category: string;
  active: boolean;
  createdAt: string;
  scheduleHours: number;
  fetchLimit?: number;
  giveCredit: boolean;
  autoMode: RssAutoMode;
  lastFetchedAt?: string;
  customPrompt?: string;
}

export interface RssPrompts {
  global?: string;
  categories?: Record<string, string>;
}

interface StoreData {
  articles: Article[];
  menuItems: MenuItem[];
  settings: SiteSettings;
  ads: Ad[];
  columnists: Columnist[];
  contactInfo: ContactInfo;
  rssSources: RssSource[];
  rssPrompts?: RssPrompts;
  seedVersion?: number;
}

const RSS_SEED_VERSION = 1;

const DEFAULT_RSS_SOURCES: Omit<RssSource, "id" | "createdAt">[] = [
  // ── Política ──────────────────────────────────────────────────────────────
  { name: "Agência Brasil – Política",        url: "https://agenciabrasil.ebc.com.br/rss/politica/feed.xml",                          category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Brasil de Fato – Política",         url: "https://www.brasildefato.com.br/editoria/politica/feed/",                        category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Carta Capital – Política",          url: "https://www.cartacapital.com.br/politica/feed/",                                  category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense – Política",    url: "https://www.correiobraziliense.com.br/politica/feed",                             category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Política",              url: "https://jovempan.com.br/noticias/politica/feed",                                  category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Notícias ao Minuto – Política",     url: "https://www.noticiasaominuto.com.br/rss/politica",                               category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Revista Oeste – Política",          url: "https://revistaoeste.com/politica/feed/",                                         category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Política",              url: "https://www.infomoney.com.br/politica/feed/",                                     category: "politica",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Mundo ─────────────────────────────────────────────────────────────────
  { name: "Agência Brasil – Internacional",    url: "https://agenciabrasil.ebc.com.br/rss/internacional/feed.xml",                    category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Brasil de Fato – Internacional",    url: "https://www.brasildefato.com.br/editoria/interacional/feed/",                    category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Carta Capital – Mundo",             url: "https://www.cartacapital.com.br/mundo/feed/",                                     category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense – Mundo",       url: "https://www.correiobraziliense.com.br/mundo/feed",                                category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jornal de Brasília – Mundo",        url: "https://jornaldebrasilia.com.br/noticias/mundo/feed/",                            category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Mundo",                 url: "https://jovempan.com.br/noticias/mundo/feed",                                     category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Mundo",                url: "https://www.metropoles.com/mundo/feed",                                           category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Notícias ao Minuto – Mundo",        url: "https://www.noticiasaominuto.com.br/rss/mundo",                                   category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Revista Oeste – Mundo",             url: "https://revistaoeste.com/mundo/feed/",                                            category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Mundo",                 url: "https://www.infomoney.com.br/mundo/feed/",                                        category: "mundo",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Economia ──────────────────────────────────────────────────────────────
  { name: "Agência Brasil – Economia",         url: "https://agenciabrasil.ebc.com.br/rss/economia/feed.xml",                         category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Carta Capital – Economia",          url: "https://www.cartacapital.com.br/economia/feed/",                                  category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense – Economia",    url: "https://www.correiobraziliense.com.br/economia/feed",                             category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jornal de Brasília – Economia",     url: "https://jornaldebrasilia.com.br/noticias/economia/feed/",                         category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Economia",              url: "https://jovempan.com.br/noticias/economia/feed",                                  category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Notícias ao Minuto – Economia",     url: "https://www.noticiasaominuto.com.br/rss/economia",                               category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Revista Oeste – Economia",          url: "https://revistaoeste.com/economia/feed/",                                         category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Economia",              url: "https://www.infomoney.com.br/economia/feed/",                                     category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Mercados",              url: "https://www.infomoney.com.br/mercados/feed/",                                     category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Consumo",               url: "https://www.infomoney.com.br/consumo/feed/",                                      category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Business",              url: "https://www.infomoney.com.br/business/feed/",                                     category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InvestNews – Economia",             url: "https://investnews.com.br/economia/feed/",                                        category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InvestNews – Finanças",             url: "https://investnews.com.br/financas/feed/",                                        category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InvestNews – Investimentos",        url: "https://investnews.com.br/investimentos/feed/",                                   category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InvestNews – Negócios",             url: "https://investnews.com.br/negocios/feed/",                                        category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Finsiders – Negócios em Fintechs",  url: "https://finsidersbrasil.com.br/negocios-em-fintechs/feed/",                      category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Finsiders – Economia Open",         url: "https://finsidersbrasil.com.br/economia-open/feed/",                             category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Negócios",             url: "https://www.metropoles.com/negocios/feed",                                        category: "economia",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Esportes ──────────────────────────────────────────────────────────────
  { name: "Agência Brasil – Esportes",         url: "https://agenciabrasil.ebc.com.br/rss/esportes/feed.xml",                         category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Brasil de Fato – Esportes",         url: "https://www.brasildefato.com.br/editoria/esportes/feed/",                        category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Esportes",              url: "https://jovempan.com.br/esportes/feed",                                           category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Esportes",             url: "https://www.metropoles.com/esportes/feed",                                        category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Notícias ao Minuto – Esportes",     url: "https://www.noticiasaominuto.com.br/rss/esporte",                                category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Esportes",              url: "https://www.infomoney.com.br/esportes/feed/",                                     category: "esportes",   active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Cultura ───────────────────────────────────────────────────────────────
  { name: "Agência Brasil – Cultura",          url: "https://agenciabrasil.ebc.com.br/radioagencia-nacional/rss/cultura/feed.xml",    category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Notícias ao Minuto – Cultura",      url: "https://www.noticiasaominuto.com.br/rss/cultura",                                category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Correio Braziliense – Arte",        url: "https://www.correiobraziliense.com.br/diversao-e-arte/feed",                      category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Entretenimento",       url: "https://www.metropoles.com/entretenimento/feed",                                  category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Entretenimento",        url: "https://jovempan.com.br/entretenimento/feed",                                     category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Vida e Estilo",        url: "https://www.metropoles.com/vida-e-estilo/feed",                                   category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jornal de Brasília – Estilo",       url: "https://jornaldebrasilia.com.br/estilo-de-vida/feed/",                            category: "cultura",    active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Segurança / Justiça ───────────────────────────────────────────────────
  { name: "Agência Brasil – Justiça",          url: "https://agenciabrasil.ebc.com.br/rss/justica/feed.xml",                          category: "seguranca",  active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Saúde ─────────────────────────────────────────────────────────────────
  { name: "Correio Braziliense – Saúde",       url: "https://www.correiobraziliense.com.br/ciencia-e-saude/feed",                      category: "saude",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Saúde",                url: "https://www.metropoles.com/saude/feed",                                           category: "saude",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Saúde",                 url: "https://jovempan.com.br/saude/feed",                                              category: "saude",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Saúde",                 url: "https://www.infomoney.com.br/saude/feed/",                                        category: "saude",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Tecnologia ────────────────────────────────────────────────────────────
  { name: "Notícias ao Minuto – Tech",         url: "https://www.noticiasaominuto.com.br/rss/tech",                                   category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Revista Oeste – Tecnologia",        url: "https://revistaoeste.com/tecnologia/feed/",                                       category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Ciência",              url: "https://www.metropoles.com/ciencia/feed",                                         category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Finsiders – Tecnologia FinTech",    url: "https://finsidersbrasil.com.br/tecnologia-para-fintechs/feed/",                  category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Finsiders – IA",                    url: "https://finsidersbrasil.com.br/ia/feed/",                                         category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InvestNews – Tecnologia",           url: "https://investnews.com.br/tecnologia/feed/",                                      category: "tecnologia", active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Cidade / Brasília e DF ────────────────────────────────────────────────
  { name: "Correio Braziliense (geral)",       url: "https://www.correiobraziliense.com.br/feed",                                      category: "cidade",     active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jornal de Brasília – DF",           url: "https://jornaldebrasilia.com.br/brasilia/feed/",                                  category: "cidade",     active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Distrito Federal",     url: "https://www.metropoles.com/distrito-federal/feed",                                category: "cidade",     active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },

  // ── Geral / Brasil ────────────────────────────────────────────────────────
  { name: "Correio Braziliense – Brasil",      url: "https://www.correiobraziliense.com.br/brasil/feed",                               category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jornal de Brasília – Brasil",       url: "https://jornaldebrasilia.com.br/noticias/brasil/feed/",                           category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Jovem Pan – Brasil",                url: "https://jovempan.com.br/noticias/brasil/feed",                                    category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – Brasil",               url: "https://www.metropoles.com/brasil/feed",                                          category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "InfoMoney – Brasil",                url: "https://www.infomoney.com.br/brasil/feed/",                                       category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
  { name: "Metrópoles – São Paulo",            url: "https://www.metropoles.com/sao-paulo/feed",                                       category: "geral",      active: false, scheduleHours: 0, giveCredit: true, autoMode: "none" },
];

// Persistent path relative to the built dist/ folder: dist/ → ../data/store.json
const _storeDir = join(dirname(fileURLToPath(import.meta.url)), "..", "data");
const STORE_FILE = join(_storeDir, "store.json");

const defaultStore: StoreData = {
  articles: [
    {
      id: "hero-1",
      title: "Câmara Legislativa aprova projeto que cria o programa Morar DF",
      subtitle: "Iniciativa prevê subsídio para famílias de baixa renda adquirirem a casa própria no Distrito Federal.",
      content: "A Câmara Legislativa do Distrito Federal aprovou nesta semana o projeto de lei que institui o programa Morar DF. A iniciativa prevê subsídio direto para famílias de baixa renda que desejam adquirir imóveis na capital. O programa deve beneficiar cerca de 15 mil famílias nos próximos dois anos.",
      category: "politica",
      tag: "POLÍTICA",
      imageUrl: "",
      author: "Bee News",
      publishedAt: new Date().toISOString(),
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    {
      id: "hero-2",
      title: "Obras no Eixão alteram trânsito neste fim de semana em Brasília",
      subtitle: "Motoristas devem ficar atentos às mudanças no tráfego durante o período de obras.",
      content: "O Departamento de Trânsito do DF informou que obras de manutenção no Eixo Monumental vão alterar o trânsito neste fim de semana. A interdição parcial ocorre entre as vias N2 e S2.",
      category: "transporte",
      tag: "TRÂNSITO",
      imageUrl: "",
      author: "Bee News",
      publishedAt: new Date().toISOString(),
      status: "published",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
  ],
  menuItems: [
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
  ],
  settings: {
    siteName: "Brasília Hoje",
    tagline: "A notícia da nossa capital, agora.",
    logoSize: 101,
    mobileEnabled: true,
    desktopEnabled: true,
    homeBlocks: DEFAULT_HOME_BLOCKS,
  },
  rssSources: [],
  ads: [],
  columnists: [
    {
      id: "c1", name: "Ana Paula Mendes", specialty: "Política" as const,
      bio: "Jornalista com 15 anos de cobertura do Congresso Nacional e Palácio do Planalto. Especialista em política externa e relações institucionais.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c2", name: "Carlos Eduardo Rocha", specialty: "Esporte" as const,
      bio: "Cronista esportivo, ex-atleta e comentarista. Cobertura de futebol, atletismo e esportes olímpicos há mais de 10 anos.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c3", name: "Beatriz Fonseca", specialty: "Economia" as const,
      bio: "Economista e analista de mercado. Escreve sobre finanças pessoais, macroeconomia e o impacto das políticas fiscais no cotidiano.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c4", name: "Rafael Martins", specialty: "Cultura" as const,
      bio: "Crítico de cinema, teatro e literatura. Doutor em comunicação pela UnB, escreve sobre arte, comportamento e identidade cultural brasileira.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c5", name: "Juliana Soares", specialty: "Segurança Pública" as const,
      bio: "Especialista em segurança pública e direitos humanos. Acompanha as políticas de segurança do DF e dos estados brasileiros.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
    {
      id: "c6", name: "Marcos Vinicius Costa", specialty: "Social" as const,
      bio: "Assistente social e colunista. Escreve sobre desigualdade, políticas públicas, habitação e os desafios das comunidades periféricas.",
      avatarBase64: "", active: true,
      createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
    },
  ],
  contactInfo: {
    supportEmail: "suporte@beemedia.ai",
    displayEmail: "redacao@brasiliaagora.com.br",
    phone: "(61) 99888-0000",
    whatsapp: "(61) 99888-0000",
    facebook: "",
    instagram: "",
    x: "",
    youtube: "",
    tiktok: "",
    address: "Brasília, Distrito Federal",
    cnpj: "",
    legalInfo: "",
    privacyPolicy: "",
    termsOfUse: "",
  },
};

function seedDefaultSources(data: StoreData): void {
  if ((data.seedVersion ?? 0) >= RSS_SEED_VERSION) return;
  if (!data.rssSources) data.rssSources = [];
  const existingUrls = new Set(data.rssSources.map((s) => s.url));
  for (const src of DEFAULT_RSS_SOURCES) {
    if (!existingUrls.has(src.url)) {
      data.rssSources.push({ ...src, id: randomUUID(), createdAt: new Date().toISOString() });
    }
  }
  data.seedVersion = RSS_SEED_VERSION;
  saveStore(data);
}

function loadStore(): StoreData {
  try {
    if (existsSync(STORE_FILE)) {
      const data = JSON.parse(readFileSync(STORE_FILE, "utf-8")) as StoreData;
      seedDefaultSources(data);
      return data;
    }
  } catch { /* ignore */ }
  const fresh = structuredClone(defaultStore);
  seedDefaultSources(fresh);
  return fresh;
}

function saveStore(data: StoreData): void {
  try {
    mkdirSync(_storeDir, { recursive: true });
    writeFileSync(STORE_FILE, JSON.stringify(data, null, 2), "utf-8");
  } catch { /* ignore */ }
}

let _store: StoreData = loadStore();

export const store = {
  // Articles
  getArticles: () => [..._store.articles],
  getArticle: (id: string) => _store.articles.find((a) => a.id === id) ?? null,
  isDuplicateArticle: (title: string, rssSourceUrl?: string): boolean => {
    const norm = title.trim().toLowerCase();
    return _store.articles.some(
      (a) =>
        a.title.trim().toLowerCase() === norm ||
        (rssSourceUrl && rssSourceUrl.length > 0 && a.rssSourceUrl === rssSourceUrl)
    );
  },
  createArticle: (data: Omit<Article, "id" | "createdAt" | "updatedAt">): Article => {
    const article: Article = {
      ...data,
      slug: data.slug ?? slugify(data.title),
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _store.articles.unshift(article);
    saveStore(_store);
    return article;
  },
  updateArticle: (id: string, data: Partial<Omit<Article, "id" | "createdAt">>): Article | null => {
    const idx = _store.articles.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    _store.articles[idx] = { ..._store.articles[idx]!, ...data, updatedAt: new Date().toISOString() };
    saveStore(_store);
    return _store.articles[idx]!;
  },
  deleteArticle: (id: string): boolean => {
    const before = _store.articles.length;
    _store.articles = _store.articles.filter((a) => a.id !== id);
    const deleted = _store.articles.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },

  // Menu
  getMenuItems: () => [..._store.menuItems].sort((a, b) => a.order - b.order),
  updateMenuItems: (items: MenuItem[]): MenuItem[] => {
    _store.menuItems = items;
    saveStore(_store);
    return [..._store.menuItems];
  },

  // Settings
  getSettings: () => ({ ..._store.settings }),
  updateSettings: (data: Partial<SiteSettings>): SiteSettings => {
    _store.settings = { ..._store.settings, ...data };
    saveStore(_store);
    return { ..._store.settings };
  },

  // Ads
  getAds: () => [..._store.ads],
  getAd: (id: string) => _store.ads.find((a) => a.id === id) ?? null,
  createAd: (data: Omit<Ad, "id" | "createdAt" | "updatedAt" | "clicks" | "impressions">): Ad => {
    const ad: Ad = {
      ...data,
      id: randomUUID(),
      clicks: 0,
      impressions: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _store.ads.push(ad);
    saveStore(_store);
    return ad;
  },
  updateAd: (id: string, data: Partial<Omit<Ad, "id" | "createdAt">>): Ad | null => {
    const idx = _store.ads.findIndex((a) => a.id === id);
    if (idx === -1) return null;
    _store.ads[idx] = { ..._store.ads[idx]!, ...data, updatedAt: new Date().toISOString() };
    saveStore(_store);
    return _store.ads[idx]!;
  },
  deleteAd: (id: string): boolean => {
    const before = _store.ads.length;
    _store.ads = _store.ads.filter((a) => a.id !== id);
    const deleted = _store.ads.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },
  trackAdClick: (id: string): boolean => {
    const idx = _store.ads.findIndex((a) => a.id === id);
    if (idx === -1 || !_store.ads[idx]!.active) return false;
    _store.ads[idx]!.clicks += 1;
    saveStore(_store);
    return true;
  },
  trackAdImpression: (id: string): boolean => {
    const idx = _store.ads.findIndex((a) => a.id === id);
    if (idx === -1) return false;
    _store.ads[idx]!.impressions = (_store.ads[idx]!.impressions ?? 0) + 1;
    saveStore(_store);
    return true;
  },

  // Columnists
  getColumnists: () => [..._store.columnists],
  getColumnist: (id: string) => _store.columnists.find((c) => c.id === id) ?? null,
  createColumnist: (data: Omit<Columnist, "id" | "createdAt" | "updatedAt">): Columnist => {
    const col: Columnist = {
      ...data,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    _store.columnists.push(col);
    saveStore(_store);
    return col;
  },
  updateColumnist: (id: string, data: Partial<Omit<Columnist, "id" | "createdAt">>): Columnist | null => {
    const idx = _store.columnists.findIndex((c) => c.id === id);
    if (idx === -1) return null;
    _store.columnists[idx] = { ..._store.columnists[idx]!, ...data, updatedAt: new Date().toISOString() };
    saveStore(_store);
    return _store.columnists[idx]!;
  },
  deleteColumnist: (id: string): boolean => {
    const before = _store.columnists.length;
    _store.columnists = _store.columnists.filter((c) => c.id !== id);
    const deleted = _store.columnists.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },

  // RSS Sources
  getRssSources: () => [...(_store.rssSources ?? [])],
  createRssSource: (data: Omit<RssSource, "id" | "createdAt">): RssSource => {
    const src: RssSource = { ...data, id: randomUUID(), createdAt: new Date().toISOString() };
    if (!_store.rssSources) _store.rssSources = [];
    _store.rssSources.push(src);
    saveStore(_store);
    return src;
  },
  updateRssSource: (id: string, data: Partial<Omit<RssSource, "id" | "createdAt">>): RssSource | null => {
    if (!_store.rssSources) _store.rssSources = [];
    const idx = _store.rssSources.findIndex((s) => s.id === id);
    if (idx === -1) return null;
    _store.rssSources[idx] = { ..._store.rssSources[idx]!, ...data };
    saveStore(_store);
    return _store.rssSources[idx]!;
  },
  deleteRssSource: (id: string): boolean => {
    if (!_store.rssSources) return false;
    const before = _store.rssSources.length;
    _store.rssSources = _store.rssSources.filter((s) => s.id !== id);
    const deleted = _store.rssSources.length < before;
    if (deleted) saveStore(_store);
    return deleted;
  },

  // RSS Prompts (hierarchy: source > category > global > DEFAULT_PROMPT_TEMPLATE)
  getRssPrompts: (): RssPrompts => ({ ...(_store.rssPrompts ?? {}) }),
  updateRssPrompts: (data: RssPrompts): RssPrompts => {
    _store.rssPrompts = { ...(_store.rssPrompts ?? {}), ...data };
    saveStore(_store);
    return { ..._store.rssPrompts };
  },

  // Contact Info
  getContactInfo: () => ({ ..._store.contactInfo }),
  updateContactInfo: (data: Partial<ContactInfo>): ContactInfo => {
    _store.contactInfo = { ..._store.contactInfo, ...data };
    saveStore(_store);
    return { ..._store.contactInfo };
  },
};
