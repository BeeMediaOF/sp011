import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

/**
 * INVARIANTE do repo (CLAUDE.md §10): o prompt de reescrita PT do pipeline
 * central (news-engine/prompts.ts) e o do pipeline interno do blog
 * (api-server/rssProcessor.ts, dormente) devem ser BYTE-IDÊNTICOS — o diff
 * tem que dar vazio. Este teste trava o invariante lendo os DOIS arquivos
 * como texto (import direto do rssProcessor puxaria store/DB do blog).
 */

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(here, "../../..");

/** Extrai o template literal de DEFAULT_PROMPT_TEMPLATE de um arquivo .ts.
 *  Backticks internos do template estão sempre escapados (\`), então o fim é
 *  o primeiro backtick NÃO precedido de backslash. */
function extractTemplate(file: string): string {
  const src = readFileSync(file, "utf8");
  const marker = "export const DEFAULT_PROMPT_TEMPLATE = `";
  const start = src.indexOf(marker);
  assert.ok(start >= 0, `DEFAULT_PROMPT_TEMPLATE não encontrado em ${file}`);
  let i = start + marker.length;
  while (i < src.length) {
    if (src[i] === "`" && src[i - 1] !== "\\") break;
    i++;
  }
  assert.ok(i < src.length, `fim do template não encontrado em ${file}`);
  // Normaliza só quebras de linha (git pode dar CRLF no Windows); o resto é byte a byte
  return src.slice(start + marker.length, i).replace(/\r\n/g, "\n");
}

test("prompt de reescrita PT é byte-idêntico entre central e blog (espelho)", () => {
  const central = extractTemplate(path.join(ROOT, "lib/news-engine/src/prompts.ts"));
  const blog = extractTemplate(path.join(ROOT, "artifacts/api-server/src/lib/rssProcessor.ts"));
  assert.equal(
    central, blog,
    "DEFAULT_PROMPT_TEMPLATE divergiu entre lib/news-engine/src/prompts.ts e " +
    "artifacts/api-server/src/lib/rssProcessor.ts — toda mudança no prompt deve ser espelhada nos DOIS.",
  );
});
