import { describe, it } from "node:test";
import assert from "node:assert/strict";

// crypto.ts resolve a chave uma única vez por carga de módulo; cada cenário
// importa o módulo fresco (query string única) com o ambiente desejado.
let caseId = 0;
async function freshCrypto(env: { SETTINGS_ENCRYPTION_KEY?: string; SESSION_SECRET?: string }) {
  process.env["SETTINGS_ENCRYPTION_KEY"] = env.SETTINGS_ENCRYPTION_KEY ?? "";
  process.env["SESSION_SECRET"] = env.SESSION_SECRET ?? "";
  caseId++;
  return (await import(`../src/crypto.ts?case=${caseId}`)) as typeof import("../src/crypto.ts");
}

describe("crypto (AES-256-GCM at-rest)", () => {
  it("roundtrip encrypt → decrypt com SETTINGS_ENCRYPTION_KEY", async () => {
    const c = await freshCrypto({ SETTINGS_ENCRYPTION_KEY: "chave-de-teste" });
    const enc = c.encryptSecret("minha-api-key-secreta");
    assert.ok(enc.startsWith("enc:v1:"));
    assert.equal(c.isEncrypted(enc), true);
    assert.equal(c.decryptSecret(enc), "minha-api-key-secreta");
  });

  it("fallback para SESSION_SECRET", async () => {
    const c = await freshCrypto({ SESSION_SECRET: "sessao" });
    assert.equal(c.encryptionAvailable(), true);
    assert.equal(c.decryptSecret(c.encryptSecret("x")), "x");
  });

  it("sem chave nenhuma → passa em texto puro (dev)", async () => {
    const c = await freshCrypto({});
    assert.equal(c.encryptionAvailable(), false);
    assert.equal(c.encryptSecret("plaintext"), "plaintext");
  });

  it("chave errada → devolve o valor bruto sem lançar", async () => {
    const a = await freshCrypto({ SETTINGS_ENCRYPTION_KEY: "chave-A" });
    const enc = a.encryptSecret("segredo");
    const b = await freshCrypto({ SETTINGS_ENCRYPTION_KEY: "chave-B" });
    assert.equal(b.decryptSecret(enc), enc); // não descriptografa, não explode
  });

  it("valor já criptografado não é re-criptografado", async () => {
    const c = await freshCrypto({ SETTINGS_ENCRYPTION_KEY: "chave" });
    const enc = c.encryptSecret("v");
    assert.equal(c.encryptSecret(enc), enc);
  });
});
