/**
 * Classificação do erro de conexão no boot: transitório (o banco volta sozinho)
 * x permanente (só o operador conserta).
 *
 * Nasceu de um incidente (ksports, 2026-09-19): o pg-blogs estava em
 * crash-recovery e o blog, ao reiniciar na mesma janela, recebeu
 * "the database system is starting up", foi rebaixado a modo recuperação e
 * passou a servir o ASSISTENTE DE INSTALAÇÃO no lugar do site — com o convite
 * a digitar uma conexão que sobrescreveria o db-config.enc bom.
 *
 * O contrato que estes testes fixam: erro desconhecido conta como TRANSITÓRIO.
 * Errar para o lado de "503 e tenta de novo" é uma falha que se conserta
 * sozinha; errar para o lado de "mostra o assistente" piora com o tempo.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

const { isTransientDbError } = await import("../src/lib/dbErrors.ts");

/** Erro no formato do node-postgres (código SQLSTATE + mensagem). */
const pgErr = (code: string, message = "") => Object.assign(new Error(message), { code });

test("Postgres subindo é transitório — é o caso que quebrou o ksports", () => {
  assert.equal(isTransientDbError(pgErr("57P03", "the database system is starting up")), true);
  // Mesmo sem código, só pela mensagem do driver.
  assert.equal(isTransientDbError(new Error("the database system is starting up")), true);
  assert.equal(isTransientDbError(new Error("the database system is in recovery mode")), true);
});

test("container fora do ar / rede é transitório", () => {
  for (const code of ["ECONNREFUSED", "ETIMEDOUT", "ECONNRESET", "ENOTFOUND", "EAI_AGAIN", "EPIPE"]) {
    assert.equal(isTransientDbError(pgErr(code)), true, `${code} deveria ser transitório`);
  }
});

test("desligamento e saturação do servidor são transitórios", () => {
  for (const code of ["57P01", "57P02", "53300", "08006", "08001"]) {
    assert.equal(isTransientDbError(pgErr(code)), true, `${code} deveria ser transitório`);
  }
});

test("credencial, catálogo e permissão são PERMANENTES — aí o assistente serve", () => {
  assert.equal(isTransientDbError(pgErr("28P01", "password authentication failed for user")), false);
  assert.equal(isTransientDbError(pgErr("28000", "no pg_hba.conf entry for host")), false);
  assert.equal(isTransientDbError(pgErr("3D000", "database \"ksports\" does not exist")), false);
  assert.equal(isTransientDbError(pgErr("42501", "permission denied for database")), false);
});

test("erro permanente reconhecido só pela mensagem, sem código", () => {
  // Pooler/driver que não propaga o SQLSTATE: sem isto, senha trocada ficaria
  // esperando para sempre em 503 e o operador nunca veria o assistente.
  assert.equal(isTransientDbError(new Error("password authentication failed for user \"ksports_user\"")), false);
  assert.equal(isTransientDbError(new Error("role \"ksports_user\" does not exist")), false);
  assert.equal(isTransientDbError(new Error("database \"ksports\" does not exist")), false);
  assert.equal(isTransientDbError(new Error("permission denied for database ksports")), false);
});

test("erro desconhecido conta como transitório (o padrão seguro)", () => {
  assert.equal(isTransientDbError(pgErr("XX000", "internal error")), true);
  assert.equal(isTransientDbError(new Error("algo que ninguem previu")), true);
  assert.equal(isTransientDbError(undefined), true);
  assert.equal(isTransientDbError(null), true);
  assert.equal(isTransientDbError("string solta"), true);
});

test("o código vence a mensagem quando os dois existem", () => {
  // Um 57P03 cuja mensagem mencione "database ... does not exist" por acaso
  // continua transitório: o código é o sinal forte.
  assert.equal(isTransientDbError(pgErr("57P03", "the database system is starting up")), true);
  // E o inverso: 28P01 é permanente mesmo com mensagem vazia.
  assert.equal(isTransientDbError(pgErr("28P01")), false);
});
