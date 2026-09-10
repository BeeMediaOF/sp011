/**
 * Inventário de anúncio que NÃO está na tabela `ads`: blocos de HTML/imagem
 * marcados "É uma propaganda" (`isAd`) nas zonas de blocos das settings, mais o
 * pseudo-bloco do banner do cabeçalho.
 *
 * Existe como módulo puro por um motivo concreto: a varredura vivia copiada em
 * `routes/ads.ts` (que ACEITA o evento) e `routes/analytics.ts` (que LÊ o
 * relatório), e nada amarrava as duas. Atualizar só uma grava impressão no banco
 * e some com o anúncio do painel — divergência entre escrita e leitura, que é o
 * tipo de defeito mais caro de diagnosticar. Zona de blocos nova entra em
 * AD_BLOCK_ZONES e as duas rotas passam a enxergá-la de uma vez.
 *
 * Nenhuma das rotas tem teste que exercite isto (o de ads.ts injeta findAdBlock
 * como mock), então a cobertura mora em test/adBlocks.test.ts.
 */

/** Só o que a varredura precisa — evita depender do SiteSettings inteiro. */
export interface AdBlockLike {
  id: string;
  name: string;
  isAd?: boolean;
  visible?: boolean;
}

export interface AdBlockSettingsLike {
  homeBlocks?: AdBlockLike[];
  articleSidebarBlocks?: AdBlockLike[];
  articleFooterBlocks?: AdBlockLike[];
  headerBannerHtml?: string;
}

/** Chave fixa do banner do cabeçalho (settings.headerBannerHtml, que não é bloco). */
export const HEADER_BANNER_BLOCK_ID = "header-banner";

/**
 * As zonas varridas, com o rótulo que o operador lê no relatório. A ordem
 * importa: `findAdBlock` devolve a primeira ocorrência do id, e o rótulo do
 * relatório sai daqui — antes era o literal "bloco da home" para todas, o que
 * já mentia para a lateral da notícia.
 */
export const AD_BLOCK_ZONES = [
  { key: "homeBlocks",           label: "bloco da home" },
  { key: "articleSidebarBlocks", label: "lateral da notícia" },
  { key: "articleFooterBlocks",  label: "fim da notícia" },
] as const satisfies readonly { key: keyof AdBlockSettingsLike; label: string }[];

export interface AdBlockEntry {
  id: string;
  name: string;
  /** Visível no site (bloco com `visible: false` continua sendo inventário). */
  active: boolean;
  /** Rótulo da zona, para o relatório. */
  position: string;
}

/**
 * Valida um id de bloco-anúncio vindo de um evento público.
 * Devolve `null` quando o id não existe em zona nenhuma ou o bloco não está
 * marcado `isAd` — e é esse `null` que faz a rota DESCARTAR a métrica.
 */
export function findAdBlockIn(
  settings: AdBlockSettingsLike,
  blockId: string,
): { visible: boolean } | null {
  if (blockId === HEADER_BANNER_BLOCK_ID) {
    return settings.headerBannerHtml?.trim() ? { visible: true } : null;
  }
  for (const zone of AD_BLOCK_ZONES) {
    const list = settings[zone.key] as AdBlockLike[] | undefined;
    const b = list?.find((x) => x.id === blockId && x.isAd === true);
    if (b) return { visible: b.visible !== false };
  }
  return null;
}

/**
 * Todos os blocos marcados como propaganda, já com a zona de origem.
 * Primeira ocorrência vence: dois blocos com o mesmo id em zonas diferentes
 * compartilham a linha `block:<id>` do relatório, então o painel gera ids
 * distintos por zona (sufixo `-artigo-`/`-rodape-`).
 */
export function listAdBlocks(settings: AdBlockSettingsLike): AdBlockEntry[] {
  const out: AdBlockEntry[] = [];
  const seen = new Set<string>();
  for (const zone of AD_BLOCK_ZONES) {
    const list = (settings[zone.key] as AdBlockLike[] | undefined) ?? [];
    for (const b of list) {
      if (b.isAd !== true || seen.has(b.id)) continue;
      seen.add(b.id);
      out.push({ id: b.id, name: b.name, active: b.visible !== false, position: zone.label });
    }
  }
  return out;
}
