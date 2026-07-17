/**
 * Configurações do painel central — versão enxuta do store do blog.
 * Tabela `central_settings` (key/jsonb) com cache em memória e criptografia
 * at-rest dos campos secretos (news-engine/crypto, mesmos envelopes do blog).
 * Instância única (sem sync multiprocesso).
 */
import { db, centralSettingsTable } from "@workspace/central-db";
import { encryptSecret, decryptSecret, type PromptsBlob } from "@workspace/news-engine";
import { eq } from "drizzle-orm";
import { logger } from "./logger.js";

// ─── Tipos ────────────────────────────────────────────────────────────────────

export interface HubSettings {
  /** Provider principal da reescrita. */
  aiProvider: "gemini" | "openai" | "ollama";
  aiModel?: string;
  geminiApiKeys: string[];
  openaiApiKey?: string;
  /** Pool adicional de chaves OpenAI-compatíveis (rodízio; soma com a única). */
  openaiApiKeys?: string[];
  /** Endpoint compatível com OpenAI (Groq/OpenRouter/DeepSeek…). Vazio = api.openai.com. */
  openaiBaseUrl?: string;
  ollamaBaseUrl?: string;
  /** Fallback Ollama→Gemini ligado (padrão true). */
  fallbackToGemini?: boolean;
  /** Limite diário de REQUISIÇÕES de IA (não tokens). */
  aiDailyLimit?: number;

  // ── IAs de Apoio (mesmo card do blog) ──────────────────────────────────────
  /** Chave da Perplexity (painel tem prioridade sobre env PERPLEXITY_API_KEY). */
  perplexityApiKey?: string;
  /** Pool adicional de chaves Perplexity (rodízio; soma com a única/env). */
  perplexityApiKeys?: string[];
  /** Modelo Perplexity (padrão "sonar"). */
  perplexityModel?: string;
  /** Perplexity assume quando o Gemini está sem cota/chave (padrão true). */
  fallbackPerplexityEnabled?: boolean;
  /** Reforço: IAs de apoio drenam a fila em paralelo, sem esperar o Ollama falhar. */
  aiBoostEnabled?: boolean;
  aiBoostProvider?: "gemini" | "perplexity" | "both";
  /** Rajadas agendadas por dia (ex.: 2 = a cada 12h; 0 = desligado). */
  aiBoostTimesPerDay?: number;
  /** Artigos processados por rajada (padrão 10). */
  aiBoostBatchSize?: number;
  /** Reforço contínuo enquanto a fila ≥ N (0 = desligado). */
  aiBoostQueueThreshold?: number;
  /** Teto diário de reescritas via apoio (0 = sem teto). */
  aiBoostMaxPerDay?: number;

  collectionEnabled: boolean;
  collectionIntervalMinutes: number;
  collectionMaxPerCycle?: number;
  collectionMaxPerDay?: number;
  /** Janela em horário de Brasília; ausentes = 24h. */
  collectionStartHour?: number;
  collectionEndHour?: number;
  /** Dias permitidos 0(dom)–6(sáb); ausente = todos. */
  collectionDays?: number[];
  collectionDefaultFetchLimit?: number;
  /** Backpressure: adia coleta quando há mais que isso aguardando reescrita. */
  maxPendingRewrites: number;

  rewriteEnabled: boolean;
  deliveryEnabled: boolean;
  /** User-Agent usado na coleta/scraping. */
  userAgent?: string;

  // ── Tradução & Classificação (localizer — entregas p/ blogs em outro idioma) ─
  /** Provider da tradução/classificação (vazio = segue o aiProvider). */
  translationProvider?: "gemini" | "openai" | "ollama";
  translationModel?: string;
  /** Template custom do prompt de tradução (vazio = TRANSLATION_PROMPT_TEMPLATE). */
  translationPromptTemplate?: string;
  /** Teto diário de traduções (0/ausente = sem teto) — guarda de quota. */
  translationMaxPerDay?: number;

  // ── Qualidade & Validação (PRDs 01–05, 2026-07) ────────────────────────────
  /**
   * Política das validações de reescrita (validate/score do news-engine):
   * "off" = nem calcula; "log" = calcula, persiste e loga SEM bloquear
   * (default — fase de calibração); "enforce" = issues block/coverage abaixo
   * do piso entram no fluxo de retry→failed. Rollback instantâneo: voltar
   * para "log" (sem deploy).
   */
  validationMode?: "off" | "log" | "enforce";
  /** Fonte com menos texto visível que isto nem vai à IA (default 80). */
  minSourcePlainChars?: number;
  /** Reescrita com menos texto visível que isto é um toco (default 700). */
  minRewritePlainChars?: number;
  /** Piso de cobertura (%) do gate off_topic em enforce (default 0 = só o
   *  critério clássico de 2 termos; calibrar com dados do modo log). */
  fidelityMinCoverage?: number;
  /** Teto (%) da banda borderline que dispara a IA Auditora (default 60). */
  fidelityAuditBand?: number;
  /** Confiança mínima (0-100) da categoria do classificador (default 70). */
  categoryConfidenceMin?: number;
  /** IA Auditora (F5): só roda em casos borderline. Default false. */
  auditEnabled?: boolean;
  /** Provider da auditoria (default "gemini" — juiz melhor que o 7B local). */
  auditProvider?: "gemini" | "openai" | "ollama";
  auditModel?: string;

  // ── Automação Social (repostagem de vídeos TikTok/Instagram) ───────────────
  /** Liga os workers de download/publicação de vídeos (default false). */
  socialEnabled?: boolean;
  apifyToken?: string;
  /** Token reserva do Apify (assume em 402/429/quota). */
  apifyTokenBackup?: string;
  /** Actor do TikTok (default "clockworks/tiktok-scraper"). */
  apifyTiktokActor?: string;
  /** Actor do Instagram (default "apify/instagram-scraper"). */
  apifyInstagramActor?: string;
  /** App Meta usado no OAuth por blog (mesmo app dos blogs). */
  metaAppId?: string;
  metaAppSecret?: string;
  /** API key global do Buffer (override por blog em blog_social_accounts). */
  bufferApiKey?: string;
  /** Modelo Gemini da legenda (default "gemini-2.5-flash"). */
  captionModel?: string;
  /** Template custom do prompt de legenda ({{LEGENDA}} {{CREATOR}}). */
  socialCaptionPromptTemplate?: string;
  /** Dias que o mp4 fica no disco após publicado (default 7). */
  socialVideoRetentionDays?: number;
  /** Teto de tamanho do vídeo baixado em MB (default 300). */
  socialMaxVideoMB?: number;
  /** Teto de publicações por dia (0/ausente = sem teto). */
  socialDailyPostLimit?: number;
}

const DEFAULT_SETTINGS: HubSettings = {
  aiProvider: "gemini",
  geminiApiKeys: [],
  fallbackToGemini: true,
  collectionEnabled: true,
  collectionIntervalMinutes: 20,
  maxPendingRewrites: 30,
  rewriteEnabled: true,
  deliveryEnabled: true,
  validationMode: "log",
};

/** Campos secretos do blob hub_settings (criptografados at-rest). */
const SECRET_STRING_FIELDS = [
  "openaiApiKey",
  "perplexityApiKey",
  "apifyToken",
  "apifyTokenBackup",
  "metaAppSecret",
  "bufferApiKey",
] as const;

const SETTINGS_KEY = "hub_settings";
const PROMPTS_KEY = "rss_prompts";

// ─── Cache em memória ─────────────────────────────────────────────────────────

let _settings: HubSettings = { ...DEFAULT_SETTINGS };
let _prompts: PromptsBlob = {};
let _initialized = false;

/** Campos-array de chaves secretas (criptografados item a item). */
const SECRET_ARRAY_FIELDS = ["geminiApiKeys", "openaiApiKeys", "perplexityApiKeys"] as const;

function decryptSettings(raw: HubSettings): HubSettings {
  const out: HubSettings = { ...raw };
  for (const f of SECRET_STRING_FIELDS) {
    if (out[f]) out[f] = decryptSecret(out[f]!);
  }
  for (const f of SECRET_ARRAY_FIELDS) {
    if (out[f]) out[f] = out[f]!.map((k) => decryptSecret(k));
  }
  out.geminiApiKeys = out.geminiApiKeys ?? [];
  return out;
}

function encryptSettings(plain: HubSettings): HubSettings {
  const out: HubSettings = { ...plain };
  for (const f of SECRET_STRING_FIELDS) {
    if (out[f]) out[f] = encryptSecret(out[f]!);
  }
  for (const f of SECRET_ARRAY_FIELDS) {
    if (out[f]) out[f] = out[f]!.map((k) => encryptSecret(k));
  }
  out.geminiApiKeys = out.geminiApiKeys ?? [];
  return out;
}

async function persist(key: string, value: unknown): Promise<void> {
  await db
    .insert(centralSettingsTable)
    .values({ key, value: value as Record<string, unknown>, updatedAt: new Date() })
    .onConflictDoUpdate({
      target: centralSettingsTable.key,
      set: { value: value as Record<string, unknown>, updatedAt: new Date() },
    });
}

// ─── API ──────────────────────────────────────────────────────────────────────

export async function initStore(): Promise<void> {
  try {
    const rows = await db.select().from(centralSettingsTable);
    for (const row of rows) {
      if (row.key === SETTINGS_KEY) {
        _settings = decryptSettings({ ...DEFAULT_SETTINGS, ...(row.value as Partial<HubSettings>) });
      } else if (row.key === PROMPTS_KEY) {
        _prompts = (row.value as PromptsBlob) ?? {};
      }
    }
    _initialized = true;
    logger.info("Store central inicializado");
  } catch (err) {
    logger.error({ err }, "Falha ao inicializar store central");
    throw err;
  }
}

export function getSettings(): HubSettings {
  if (!_initialized) logger.warn("getSettings() antes do initStore() — usando defaults");
  return _settings;
}

export async function saveSettings(partial: Partial<HubSettings>): Promise<HubSettings> {
  _settings = { ...(_settings ?? DEFAULT_SETTINGS), ...partial };
  await persist(SETTINGS_KEY, encryptSettings(_settings));
  return _settings;
}

export function getPrompts(): PromptsBlob {
  return _prompts;
}

export async function savePrompts(prompts: PromptsBlob): Promise<PromptsBlob> {
  _prompts = prompts ?? {};
  await persist(PROMPTS_KEY, _prompts);
  return _prompts;
}

/** Remove a linha de settings (uso em testes). */
export async function _resetStoreForTests(): Promise<void> {
  await db.delete(centralSettingsTable).where(eq(centralSettingsTable.key, SETTINGS_KEY));
  _settings = { ...DEFAULT_SETTINGS };
  _initialized = false;
}
