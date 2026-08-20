/**
 * Arquivo pedido pela URL: onde ele estaria em disco, e se o path é seguro.
 *
 * O `vite preview` sem `appType` explícito tem fallback single-page no servidor
 * estático: QUALQUER arquivo inexistente recebia o `index.html` com 200. Medido
 * em produção (20/08/2026): `/sitemap.xml`, `/sitemap_index.xml`,
 * `/manifest.json`, `/wp-login.php`, `/nada.xml` e `/assets/inexistente.js`
 * respondiam 200 `text/html`. Para um rastreador, é um site com infinitas
 * páginas; para uma aba antiga pedindo um chunk que o deploy substituiu, é um
 * erro de MIME em vez de um 404 que manda recarregar.
 *
 * A parte pura mora aqui — o plugin só faz `fs.existsSync` e `res.end`.
 */

/** Path com extensão de arquivo (`.js`, `.xml`, `.php`…). */
export function hasFileExtension(pathOnly: string): boolean {
  return /\.[a-zA-Z0-9]+$/.test(pathOnly);
}

/**
 * Caminho relativo, dentro do diretório publicado, correspondente à URL.
 * `null` = não olhar o disco.
 *
 * Recusa travessia (`..`, `%2e%2e`, barra invertida do Windows), byte nulo e
 * qualquer coisa que não seja um path absoluto simples. A decodificação é feita
 * ANTES da checagem, senão `%2e%2e%2f` passaria intacto pela verificação e só
 * viraria `../` na hora de tocar o filesystem.
 */
export function safeRelative(pathOnly: string): string | null {
  if (!pathOnly.startsWith("/")) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(pathOnly);
  } catch {
    return null; // percent-encoding quebrado: não é arquivo nosso
  }
  if (decoded.includes("\0") || decoded.includes("\\")) return null;
  const parts = decoded.split("/").filter((s) => s !== "");
  if (parts.length === 0) return null;
  for (const part of parts) {
    if (part === "." || part === "..") return null;
  }
  return parts.join("/");
}

/** Paths que este plugin nunca examina: quem responde por eles é outro. */
export function isStaticCandidate(pathOnly: string): boolean {
  if (!hasFileExtension(pathOnly)) return false; // rota de página, não arquivo
  if (pathOnly.startsWith("/api/")) return false; // proxy da API
  return true;
}
