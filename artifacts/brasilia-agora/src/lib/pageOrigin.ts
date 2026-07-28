/**
 * Origin (proto://host) da página, válido também no SSR.
 *
 * `window.location.origin` não existe no `renderToString`, e o fallback óbvio
 * (a constante BRAND) é o domínio do blog que BUILDOU a imagem Docker — a mesma
 * imagem serve os 8 blogs (CLAUDE.md §13). No JSON-LD do artigo isso não seria
 * só um dado errado: o servidor emitiria um `<script type="ld+json">` diferente
 * do que o cliente monta na hidratação → mismatch e React descartando o SSR.
 * O middleware manda o origin da requisição em `__SSR_DATA__` e os dois lados
 * semeiam aqui.
 */
import { BRAND } from "../brand";

let _origin = "";

export function seedOrigin(origin: string): void {
  _origin = origin;
}

export function pageOrigin(): string {
  if (typeof window !== "undefined") return window.location.origin;
  return _origin || BRAND.url;
}
