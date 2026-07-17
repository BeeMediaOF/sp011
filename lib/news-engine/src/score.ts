/**
 * Score de fidelidade e qualidade calculado em CÓDIGO (PRDs 01/02, Fase 1).
 *
 * Decisão de arquitetura: o provider primário de produção é um 7B em CPU —
 * pedir "score" ao próprio modelo custa tokens de saída (tempo) e devolve
 * ruído. Tudo aqui é determinístico, barato e testável:
 *
 * - `fidelityReport`: generaliza o gate anti-alucinação (incidente "Três
 *   Moços") para um percentual CONTÍNUO de cobertura dos termos distintivos
 *   do material do feed, e detecta NÚMEROS INVENTADOS (tokens numéricos da
 *   reescrita que não existem em lugar nenhum do material da fonte — placar,
 *   ano, valor, percentual trocado/criado).
 * - `qualityScore`: nota 0–100 com fidelidade dominante (peso do PRD 02).
 *
 * Este módulo é a base das primitivas de comparação; `quality.ts` importa
 * daqui (`normForCompare`, stopwords) — nunca o contrário (sem ciclos).
 */

/** Normalização p/ comparação: minúsculas e sem acentos (NFD - combining). */
export function normForCompare(s: string): string {
  return s.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/** Palavras comuns (pt/en, 4+ letras, SEM acentos — o texto é normalizado
 *  antes) que não contam como termo distintivo na cobertura de fidelidade. */
export const REWRITE_MATCH_STOPWORDS = new Set([
  // pt
  "para", "como", "mais", "menos", "sobre", "entre", "apos", "antes", "contra",
  "pelo", "pela", "pelos", "pelas", "seus", "suas", "essa", "esse", "esta",
  "este", "isso", "aquela", "aquele", "ainda", "onde", "quando", "porque",
  "muito", "muita", "muitos", "muitas", "foram", "sera", "serao", "pode",
  "podem", "deve", "devem", "anos", "dias", "hoje", "amanha", "ontem",
  "durante", "tambem", "depois", "nesta", "neste", "dessa", "desse", "desta",
  "deste", "toda", "todo", "todas", "todos", "outra", "outro", "outras",
  "outros", "quem", "qual", "quais", "ficou", "ficam", "fazer", "feito",
  // en
  "with", "that", "this", "from", "after", "before", "over", "into", "will",
  "have", "been", "says", "said", "more", "than", "what", "when", "where",
  "their", "there", "about", "against", "could", "would", "should",
]);

/** Números por extenso (pt/en, já normalizados sem acento) → forma canônica.
 *  Evita falso positivo de "cinco gols" na fonte virar "5 gols" na reescrita. */
const NUMBER_WORDS: Record<string, string> = {
  // pt
  um: "1", uma: "1", dois: "2", duas: "2", tres: "3", quatro: "4", cinco: "5",
  seis: "6", sete: "7", oito: "8", nove: "9", dez: "10", onze: "11",
  doze: "12", quinze: "15", vinte: "20", trinta: "30", quarenta: "40",
  cinquenta: "50", sessenta: "60", setenta: "70", oitenta: "80", noventa: "90",
  cem: "100", mil: "1000", milhao: "1000000", milhoes: "1000000",
  bilhao: "1000000000", bilhoes: "1000000000",
  // en
  one: "1", two: "2", three: "3", four: "4", five: "5", six: "6", seven: "7",
  eight: "8", nine: "9", ten: "10", eleven: "11", twelve: "12", twenty: "20",
  thirty: "30", forty: "40", fifty: "50", hundred: "100", thousand: "1000",
  million: "1000000", billion: "1000000000",
};

/** Forma canônica de um token numérico: só dígitos, sem separadores nem zeros
 *  à esquerda ("1.234"→"1234", "1,5"→"15", "007"→"7"). Conservador de
 *  propósito: prefere deixar passar a acusar invenção por formatação. */
function canonicalNumber(tok: string): string {
  const digits = tok.replace(/[.,\s]/g, "").replace(/^0+(?=\d)/, "");
  return digits;
}

/** Extrai os tokens numéricos de um texto (dígitos com separadores). */
function numberTokens(text: string): string[] {
  return text.match(/\d+(?:[.,]\d+)*/g) ?? [];
}

export interface FidelityReport {
  /** % (0–100) dos termos distintivos do material do feed presentes na reescrita. */
  coverage: number;
  matchedTokens: number;
  totalTokens: number;
  /** Números da reescrita que NÃO existem no material da fonte (originais, dedup, máx. 20). */
  inventedNumbers: string[];
}

/**
 * Relatório de fidelidade da reescrita.
 *
 * @param rewriteText texto da reescrita (título + texto visível, sem HTML)
 * @param feedText    material do FEED (título + descrição) — baseline da
 *                    cobertura, igual ao gate `off_topic` (um scrape quebrado
 *                    reescreve lixo que não bate com o feed)
 * @param fullSourceText material COMPLETO enviado à IA (título + descrição +
 *                    contentRaw). Baseline dos números: um número só é
 *                    "inventado" se não existir em NADA do material. Quando
 *                    omitido, usa o feedText.
 */
export function fidelityReport(
  rewriteText: string,
  feedText: string,
  fullSourceText?: string,
): FidelityReport {
  const tokens = new Set(
    (normForCompare(feedText).match(/[a-z0-9]{4,}/g) ?? [])
      .filter((w) => !REWRITE_MATCH_STOPWORDS.has(w)),
  );
  const hay = normForCompare(rewriteText);
  let matched = 0;
  for (const t of tokens) if (hay.includes(t)) matched++;
  const total = tokens.size;
  const coverage = total === 0 ? 100 : Math.round((matched / total) * 100);

  // Números inventados: canônicos da fonte (dígitos + números por extenso)
  const sourceNorm = normForCompare(fullSourceText ?? feedText);
  const sourceCanon = new Set(numberTokens(sourceNorm).map(canonicalNumber));
  for (const w of sourceNorm.match(/[a-z]+/g) ?? []) {
    const mapped = NUMBER_WORDS[w];
    if (mapped) sourceCanon.add(mapped);
  }
  const invented: string[] = [];
  const seen = new Set<string>();
  for (const tok of numberTokens(rewriteText)) {
    const canon = canonicalNumber(tok);
    if (!canon || sourceCanon.has(canon) || seen.has(canon)) continue;
    seen.add(canon);
    if (invented.length < 20) invented.push(tok);
  }
  return { coverage, matchedTokens: matched, totalTokens: total, inventedNumbers: invented };
}

/**
 * Nota 0–100 da reescrita, com fidelidade DOMINANTE (PRD 02):
 * base = 40 + 0.6×coverage; penalidades: número inventado −15 cada (teto 45),
 * issue block −25 cada (teto 50), issue warn −4 cada (teto 20).
 * Os pesos são deliberadamente simples e documentados — calibração fina
 * acontece na fase log-only com dados reais.
 */
export function qualityScore(input: {
  coverage: number;
  inventedNumbers: readonly string[];
  issues: ReadonlyArray<{ severity: "block" | "warn" }>;
}): number {
  const blocks = input.issues.filter((i) => i.severity === "block").length;
  const warns = input.issues.length - blocks;
  let score = 40 + 0.6 * Math.max(0, Math.min(100, input.coverage));
  score -= Math.min(45, input.inventedNumbers.length * 15);
  score -= Math.min(50, blocks * 25);
  score -= Math.min(20, warns * 4);
  return Math.max(0, Math.min(100, Math.round(score)));
}
