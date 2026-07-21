import { test } from "node:test";
import assert from "node:assert/strict";
import { adoptDecision } from "../src/routes/setupGuards.ts";

/** PRD-14 — adopt-guard endurecido: 4 casos. */

test("(a) sem instalação existente → allow", () => {
  assert.equal(adoptDecision({ hasExistingInstall: false }, {}, {}).allow, true);
});

test("(b) instalação existente sem a flag → deny (existing_install)", () => {
  const d = adoptDecision({ hasExistingInstall: true }, {}, {});
  assert.equal(d.allow, false);
  assert.equal(d.reason, "existing_install");
});

test("(c) existente + flag + NODE_ENV=production sem SETUP_ALLOW_ADOPT → deny", () => {
  const d = adoptDecision(
    { hasExistingInstall: true },
    { adoptExistingInstall: true },
    { NODE_ENV: "production" },
  );
  assert.equal(d.allow, false);
  assert.equal(d.reason, "adopt_needs_env_optin");
});

test("(d) existente + flag + SETUP_ALLOW_ADOPT=true → allow", () => {
  const d = adoptDecision(
    { hasExistingInstall: true },
    { adoptExistingInstall: true },
    { NODE_ENV: "production", SETUP_ALLOW_ADOPT: "true" },
  );
  assert.equal(d.allow, true);
});

test("existente + flag em ambiente não-produção → allow", () => {
  assert.equal(
    adoptDecision({ hasExistingInstall: true }, { adoptExistingInstall: true }, { NODE_ENV: "development" }).allow,
    true,
  );
});
