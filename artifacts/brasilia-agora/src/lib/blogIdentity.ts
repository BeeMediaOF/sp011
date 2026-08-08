/**
 * Identidade do PRÓPRIO blog — para exemplos, placeholders e textos padrão.
 *
 * A imagem é compartilhada pelos N blogs da rede, e por muito tempo os exemplos
 * do painel traziam a marca do primeiro portal ("SBC Agora", "sbcagora.com.br",
 * "Equipe SP011"). Num blog qualquer isso é pior que um exemplo vazio: parece
 * conteúdo pronto de outro site e às vezes vai salvo do jeito que está.
 *
 * Aqui o exemplo sai do próprio blog: o nome salvo em Configurações quando
 * existe, senão o domínio pelo qual o painel foi aberto. Nada é buscado na rede
 * (o host vem do navegador) — funções puras, testáveis com node --test.
 */

/** Só o hostname: sem protocolo, sem porta, sem `www.`, sem caminho. */
export function normalizeHost(input: string | null | undefined): string {
  let s = (input ?? "").trim().toLowerCase();
  if (!s) return "";
  s = s.replace(/^[a-z][a-z0-9+.-]*:\/\//, ""); // protocolo
  s = s.split("/")[0] ?? "";                     // caminho
  s = s.split("?")[0] ?? "";
  s = s.split("#")[0] ?? "";
  s = s.split(":")[0] ?? "";                     // porta
  return s.replace(/^www\./, "");
}

/** Host do blog em que o painel está aberto ("" fora do navegador). */
export function currentBlogHost(): string {
  if (typeof window === "undefined") return "";
  return normalizeHost(window.location.host);
}

/**
 * Nome apresentável a partir do domínio, para quando o blog ainda não tem nome
 * salvo: `ocomandante.midia.run` -> "Ocomandante", `aposta-ganha.midia.run` ->
 * "Aposta Ganha". Só o primeiro rótulo: o resto é o domínio da rede.
 */
export function brandNameFromHost(host: string | null | undefined): string {
  const label = normalizeHost(host).split(".")[0] ?? "";
  if (!label) return "";
  return label
    .split(/[-_]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ");
}

/** Arroba de exemplo para as redes sociais: `@ocomandante`. */
export function handleFromHost(host: string | null | undefined): string {
  const label = (normalizeHost(host).split(".")[0] ?? "").replace(/[^a-z0-9]/g, "");
  return label ? `@${label}` : "";
}

/**
 * Nome do blog para exibir: o configurado, senão o derivado do domínio, senão
 * um rótulo genérico — NUNCA a marca de outro blog da rede.
 */
export function blogDisplayName(siteName?: string | null, host?: string | null): string {
  const saved = (siteName ?? "").trim();
  if (saved) return saved;
  return brandNameFromHost(host ?? currentBlogHost()) || "Seu Portal";
}

/** Assinatura de e-mail/newsletter: "Equipe <blog>". */
export function blogTeamName(siteName?: string | null, host?: string | null): string {
  return `Equipe ${blogDisplayName(siteName, host)}`;
}

/** Autoria padrão dos exemplos de integração: "Redação <blog>". */
export function blogNewsroomName(siteName?: string | null, host?: string | null): string {
  return `Redação ${blogDisplayName(siteName, host)}`;
}

/** URL de exemplo do próprio blog (placeholder do campo de endereço). */
export function blogUrlExample(host?: string | null): string {
  const h = normalizeHost(host ?? currentBlogHost());
  return h ? `https://${h}` : "https://seudominio.com.br";
}

/** E-mail de exemplo no domínio do blog: `redacao@ocomandante.midia.run`. */
export function blogEmailExample(local: string, host?: string | null): string {
  const h = normalizeHost(host ?? currentBlogHost());
  return `${local}@${h || "seudominio.com.br"}`;
}
