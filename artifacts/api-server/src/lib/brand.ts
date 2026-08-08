/**
 * Identidade do PRÓPRIO blog, em tempo de execução.
 *
 * Isto aqui era uma CONSTANTE ("SBC Agora", "sbcagora.com.br", "Redação SBC
 * Agora"). A mesma imagem Docker serve os N blogs da rede (CLAUDE.md §13), então
 * a constante virava a marca de outro portal no publisher do AMP, no autor
 * padrão do webhook, no emissor do 2FA e no e-mail de boas-vindas de TODOS eles.
 *
 * Agora tudo sai de `settings.siteName`, que é o nome que o dono do blog salvou
 * no painel. Sem nome salvo, o texto é genérico — nunca a marca de um vizinho.
 */
import { store } from "./store.js";

/** Nome salvo no painel; `fallback` (ou "") enquanto não houver. */
export function siteName(fallback = ""): string {
  return store.getSettings().siteName?.trim() || fallback;
}

/**
 * Assinatura padrão de artigo criado sem autor. Respeita `bylineName`, que é a
 * assinatura configurável do portal (blog EN não pode nascer com "Redação").
 */
export function defaultAuthor(en = false): string {
  const byline = store.getSettings().bylineName?.trim();
  if (byline) return byline;
  const name = siteName();
  if (name) return en ? `${name} Newsroom` : `Redação ${name}`;
  return en ? "Newsroom" : "Redação";
}

/** Emissor exibido no app autenticador ao ativar o 2FA. */
export function adminIssuer(): string {
  return siteName("Painel Admin");
}
