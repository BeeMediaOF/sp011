/**
 * Testes do enriquecimento de dimensões dos blocos de imagem (PageSpeed do
 * esporteagora, 2026-07-30: CLS 0,945 por falta de width/height).
 *
 * O foco é o que a função NÃO pode fazer: inventar dimensão, tocar em bloco que
 * não é de imagem local, ou aceitar nome de arquivo com travessia de caminho.
 * O caminho feliz (ler o arquivo com sharp) depende de disco e é coberto na
 * verificação em produção.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Antes de carregar o módulo: sem isto o import cria data/uploads no pacote.
process.env["UPLOADS_DIR"] = join(tmpdir(), "sp011-test-uploads");

const { withBlockImageDimensions } = await import("../src/lib/blockImageMeta.ts");

type Block = Parameters<typeof withBlockImageDimensions>[0] extends readonly (infer T)[] | undefined
  ? T : never;

function bloco(over: Partial<Block> = {}): Block {
  return { id: "b1", name: "Bloco", visible: true, order: 0, ...over } as Block;
}

test("lista vazia ou ausente passa direto", async () => {
  assert.equal(await withBlockImageDimensions(undefined), undefined);
  const vazia: Block[] = [];
  assert.equal(await withBlockImageDimensions(vazia), vazia);
});

test("bloco sem imagem sai intacto (mesma referência)", async () => {
  const blocos = [bloco(), bloco({ id: "b2", blockType: "html", html: "<p>oi</p>" })];
  assert.equal(await withBlockImageDimensions(blocos), blocos);
});

test("URL externa não é lida do disco", async () => {
  const blocos = [bloco({ imageUrl: "https://exemplo.com/banner.png" })];
  const out = await withBlockImageDimensions(blocos);
  assert.equal(out, blocos);
});

test("arquivo inexistente devolve o bloco sem width/height", async () => {
  const blocos = [bloco({ imageUrl: "/api/uploads/nao-existe-1234.png" })];
  const out = await withBlockImageDimensions(blocos);
  assert.equal(out?.[0]?.imageWidth, undefined);
  assert.equal(out?.[0]?.imageHeight, undefined);
  // e o resto do bloco continua igual
  assert.equal(out?.[0]?.imageUrl, "/api/uploads/nao-existe-1234.png");
});

test("travessia de caminho não vira leitura de arquivo", async () => {
  for (const url of [
    "/api/uploads/../../../etc/passwd",
    "/api/uploads/sub/dir/arquivo.png",
    "/api/uploads/..%2F..%2Fetc%2Fpasswd",
  ]) {
    const blocos = [bloco({ imageUrl: url })];
    const out = await withBlockImageDimensions(blocos);
    assert.equal(out?.[0]?.imageWidth, undefined, url);
  }
});

test("query e âncora não entram no nome do arquivo", async () => {
  // ?v= é usado pelo painel para furar cache do navegador ao trocar a imagem
  const blocos = [bloco({ imageUrl: "/api/uploads/banner-abc123.png?v=2" })];
  const out = await withBlockImageDimensions(blocos);
  assert.equal(out?.[0]?.imageUrl, "/api/uploads/banner-abc123.png?v=2");
});
