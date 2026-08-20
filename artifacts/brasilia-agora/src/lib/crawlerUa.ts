/**
 * Classificação de User-Agent do pré-render social.
 *
 * Mora aqui, e não dentro do `vite.config.ts`, pela mesma razão do
 * `ssrRoutes.ts`: é uma decisão de produto — "quem recebe o site e quem recebe
 * o card de compartilhamento" — e precisa de teste. Um falso positivo aqui não
 * é lentidão: é o buscador recebendo um resumo no lugar da matéria.
 *
 * O regex único de antes juntava buscador e rede social numa lista só. Como o
 * `socialOgPlugin` roda ANTES do SSR e ENCERRA a resposta, Googlebot e bingbot
 * recebiam o stub de Open Graph em vez do HTML editorial. Medido em produção
 * (20/08/2026, mesma URL de artigo): 3.053 B contra 88.636 B, e 0 blocos de
 * `application/ld+json` contra 2.
 */

/**
 * Crawlers de PREVIEW DE COMPARTILHAMENTO. Para estes o stub de Open Graph é o
 * comportamento correto — é exatamente o que eles vêm buscar, e o
 * `window.location.replace` do stub leva o humano que clica até a matéria.
 */
export const SOCIAL_CRAWLER_RE =
  /facebookexternalhit|Twitterbot|WhatsApp|LinkedInBot|Slackbot|TelegramBot|Discordbot|Pinterest|instagram|vkShare/i;

/*
 * Removidos desta lista em 20/08/2026 (P0 de indexação), com o motivo de cada um:
 *
 *   Googlebot      buscador — precisa do MESMO HTML editorial que o navegador
 *                  recebe (título, canonical, H1, corpo, links, structured data).
 *   bingbot        buscador — idem (3.007 B medidos no mesmo artigo).
 *   Applebot       buscador da Apple (Siri/Spotlight) — mesma classe dos dois
 *                  acima; o plugin fazia com ele exatamente o mesmo estrago.
 *   W3C_Validator  validador — validar um stub não valida o site.
 *
 * NÃO reintroduzir nenhum deles sem medir: entrar nesta lista significa deixar
 * de receber o site.
 *
 * Armadilha de diagnóstico registrada: o "Testar URL ativa" do Search Console
 * usa `Google-InspectionTool`, que NUNCA casou este regex — ele sempre viu a
 * página completa e por isso mascarava o defeito. A verificação válida do que o
 * Googlebot recebe é `curl -A 'Googlebot/2.1 (+http://www.google.com/bot.html)'`.
 */

/** `true` = entregar o card de compartilhamento; `false` = entregar o site. */
export function isSocialCrawler(ua: string | undefined | null): boolean {
  if (!ua) return false;
  return SOCIAL_CRAWLER_RE.test(ua);
}
