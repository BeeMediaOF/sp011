/**
 * Contenção de memória do pipeline de imagem (2026-08-14).
 *
 * Dois api de blog levaram OOM-kill do cgroup em 12 e 13/08 com
 * `libvips worker invoked oom-killer` e ~2 GiB de RSS: uma dezena de
 * `/api/image` no mesmo segundo virava uma dezena de decodificações
 * simultâneas. Aqui ficam as três travas que vieram daquilo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import { withTransformSlot } from "../src/lib/imageTransform.ts";
import {
  isPermanentOriginError,
  isNegativeCached,
  rememberOriginFailure,
  clearNegativeCache,
} from "../src/lib/originFailures.ts";

/** Erro do safeFetch quando a origem passa do cap de 12 MiB. */
class FakeSsrfError extends Error {
  code: string;
  constructor(code: string, message: string) {
    super(message);
    this.code = code;
  }
}

test("semaforo: nunca mais de 2 transformacoes ao mesmo tempo", async () => {
  let simultaneas = 0;
  let pico = 0;
  const tarefas = Array.from({ length: 12 }, () =>
    withTransformSlot(async () => {
      simultaneas++;
      pico = Math.max(pico, simultaneas);
      await new Promise((r) => setTimeout(r, 5));
      simultaneas--;
      return true;
    }),
  );
  const r = await Promise.all(tarefas);
  assert.equal(r.length, 12, "toda requisicao tem que ser atendida, nao descartada");
  assert.ok(pico <= 2, `pico de ${pico} transformacoes simultaneas`);
  assert.equal(simultaneas, 0);
});

test("semaforo: falha libera a vaga (senao o proxy trava para sempre)", async () => {
  await assert.rejects(withTransformSlot(async () => { throw new Error("boom"); }));
  // Se a vaga tivesse vazado, estas duas ficariam presas e o teste estouraria.
  const ok = await Promise.all([
    withTransformSlot(async () => 1),
    withTransformSlot(async () => 2),
  ]);
  assert.deepEqual(ok, [1, 2]);
});

test("semaforo: ordem de chegada é respeitada", async () => {
  const ordem: number[] = [];
  await Promise.all(
    [0, 1, 2, 3, 4, 5].map((i) =>
      withTransformSlot(async () => {
        ordem.push(i);
        await new Promise((r) => setTimeout(r, 2));
      }),
    ),
  );
  assert.deepEqual(ordem, [0, 1, 2, 3, 4, 5]);
});

test("falha permanente: 4xx, nao-imagem, URL invalida e origem grande demais", () => {
  assert.equal(isPermanentOriginError(new FakeSsrfError("response_too_large", "resposta excede 12582912 bytes")), true);
  assert.equal(isPermanentOriginError(new Error("origin_error:404")), true);
  assert.equal(isPermanentOriginError(new Error("origin_error:403")), true);
  assert.equal(isPermanentOriginError(new Error("not_an_image")), true);
  assert.equal(isPermanentOriginError(new Error("invalid_url")), true);
});

test("falha transitoria NAO e permanente (o retry do 502 da central continua)", () => {
  assert.equal(isPermanentOriginError(new Error("origin_error:502")), false);
  assert.equal(isPermanentOriginError(new Error("origin_error:503")), false);
  assert.equal(isPermanentOriginError(new Error("fetch failed")), false);
  assert.equal(isPermanentOriginError(new FakeSsrfError("timeout", "abortado")), false);
  assert.equal(isPermanentOriginError(null), false);
  assert.equal(isPermanentOriginError(undefined), false);
});

test("cache negativo: guarda a URL, expira sozinho e nao vaza para outra", () => {
  clearNegativeCache();
  const url = "https://static.exemplo.com/gigante.jpg";
  const t0 = 1_000_000;

  assert.equal(isNegativeCached(url, t0), false);
  rememberOriginFailure(url, t0);
  assert.equal(isNegativeCached(url, t0 + 60_000), true, "deveria valer dentro do TTL");
  assert.equal(isNegativeCached("https://static.exemplo.com/outra.jpg", t0 + 60_000), false);

  // 10 min depois a origem volta a ser tentada (pode ter sido corrigida)
  assert.equal(isNegativeCached(url, t0 + 10 * 60_000 + 1), false);
  assert.equal(isNegativeCached(url, t0 + 60_000), false, "entrada vencida tem que sair do mapa");
  clearNegativeCache();
});
