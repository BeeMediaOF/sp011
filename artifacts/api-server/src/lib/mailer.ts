/**
 * Email service using Node.js built-in net/tls (no external dependencies).
 *
 * Dois modos de uso:
 *   1. `sendEmail(config, msg)` — envio parametrizado (remetente vindo das
 *      settings do blog). Base do motor de newsletter (PRD-NEWSLETTER-01).
 *   2. `sendWelcomeEmail(...)` — mantém o comportamento legado (SMTP via env).
 *
 * Env vars do modo legado:
 *   SMTP_HOST   — SMTP server host (e.g. smtp.gmail.com, smtp.office365.com)
 *   SMTP_PORT   — SMTP port: 587 = STARTTLS, 465 = SSL, 25 = plain
 *   SMTP_USER   — SMTP username / email address
 *   SMTP_PASS   — SMTP password or app password
 *   SMTP_FROM   — Sender address (e.g. "Meu Portal <no-reply@meuportal.com.br>")
 *
 * Gmail example:
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587
 *   SMTP_USER=seu@gmail.com   SMTP_PASS=<app-password-16-chars>
 *   SMTP_FROM="Meu Portal <seu@gmail.com>"
 */

import net from "node:net";
import tls from "node:tls";
import { randomUUID } from "node:crypto";
import { siteName } from "./brand.js";

type SocketLike = net.Socket | tls.TLSSocket;

/** Configuração de remetente SMTP (por blog, vinda das settings). */
export interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  /** "Nome <email>" — o From do cabeçalho. */
  from: string;
}

/** Uma mensagem a enviar. `headers` extras (List-Unsubscribe, Reply-To…) são
 *  injetados no cabeçalho; o Message-ID é sempre gerado pelo builder. */
export interface SendMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  headers?: Record<string, string>;
}

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

function extractEmail(address: string): string {
  const m = address.match(/<([^>]+)>/);
  return m?.[1] ?? address.trim();
}

/** Monta a mensagem MIME crua. Sempre injeta Message-ID; adiciona os headers
 *  extras (saneados contra injeção de CRLF). */
function buildRawMessage(from: string, msg: SendMessage): string {
  const boundary = `----=_Part_${Date.now()}_${Math.random().toString(36).slice(2)}`;
  const msgDate = new Date().toUTCString();
  const fromDomain = extractEmail(from).split("@")[1] || "localhost";
  const messageId = `<${randomUUID()}@${fromDomain}>`;

  const headerLines = [
    `Date: ${msgDate}`,
    `From: ${from}`,
    `To: ${msg.to}`,
    `Subject: =?UTF-8?B?${base64(msg.subject)}?=`,
    `Message-ID: ${messageId}`,
    `MIME-Version: 1.0`,
  ];
  // Headers extras (List-Unsubscribe, List-Unsubscribe-Post, Reply-To…).
  // Uma linha por header; valores saneados para não permitir header injection.
  for (const [k, v] of Object.entries(msg.headers ?? {})) {
    const key = k.replace(/[\r\n:]+/g, "").trim();
    const val = String(v).replace(/[\r\n]+/g, " ").trim();
    if (key && val) headerLines.push(`${key}: ${val}`);
  }
  headerLines.push(`Content-Type: multipart/alternative; boundary="${boundary}"`);

  return [
    ...headerLines,
    ``,
    `--${boundary}`,
    `Content-Type: text/plain; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64(msg.text),
    ``,
    `--${boundary}`,
    `Content-Type: text/html; charset=UTF-8`,
    `Content-Transfer-Encoding: base64`,
    ``,
    base64(msg.html),
    ``,
    `--${boundary}--`,
  ].join("\r\n");
}

const SMTP_TIMEOUT_MS = 20_000;

/**
 * Envia UM e-mail via SMTP (STARTTLS na 587 / TLS implícito na 465).
 * Endurecimento (revisão do PRD-NEWSLETTER-01):
 *  - `rejectUnauthorized: true` + `servername` no TLS (não aceita cert inválido);
 *  - timeout RE-ARMADO após o upgrade STARTTLS (o socket velho é trocado);
 *  - guarda `settled` — resolve/reject uma única vez.
 */
export async function sendEmail(config: SmtpConfig, msg: SendMessage): Promise<void> {
  const { host, port, user, pass, from } = config;
  const useImplicitTls = port === 465;
  const rawMsg = buildRawMessage(from, msg);

  return new Promise<void>((resolve, reject) => {
    let socket: SocketLike;
    let buf = "";
    let upgradedToTls = false;
    let step = 0;
    let settled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    function armTimeout() {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => fail(new Error("SMTP connection timed out")), SMTP_TIMEOUT_MS);
      if (timer.unref) timer.unref();
    }
    function succeed() {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket.destroy(); } catch { /* ignore */ }
      resolve();
    }
    function fail(err: Error) {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      try { socket.destroy(); } catch { /* ignore */ }
      reject(err);
    }

    function send(cmd: string) {
      socket.write(cmd + "\r\n");
    }

    function handleLine(line: string) {
      const code = parseInt(line.slice(0, 3), 10);
      const isLast = line[3] !== "-";
      if (!isLast) return;

      switch (step) {
        case 0: // banner
          if (code !== 220) { fail(new Error(`SMTP banner error: ${line}`)); return; }
          send(`EHLO localhost`);
          step = 1;
          break;
        case 1: // EHLO response
          if (code !== 250) { fail(new Error(`EHLO error: ${line}`)); return; }
          if (!useImplicitTls && !upgradedToTls) {
            send(`STARTTLS`);
            step = 2;
          } else {
            send(`AUTH LOGIN`);
            step = 3;
          }
          break;
        case 2: { // STARTTLS → upgrade da conexão
          if (code !== 220) { fail(new Error(`STARTTLS error: ${line}`)); return; }
          upgradedToTls = true;
          const rawSocket = socket as net.Socket;
          const tlsSock = tls.connect(
            { socket: rawSocket, host, servername: host, rejectUnauthorized: true },
            () => {
              socket = tlsSock;
              armTimeout(); // re-arma: o socket monitorado mudou
              socket.on("data", onData);
              send(`EHLO localhost`);
              step = 1;
            },
          );
          tlsSock.on("error", (e) => fail(e));
          break;
        }
        case 3: // AUTH LOGIN prompt
          if (code !== 334) { fail(new Error(`AUTH LOGIN error: ${line}`)); return; }
          send(base64(user));
          step = 4;
          break;
        case 4: // password prompt
          if (code !== 334) { fail(new Error(`AUTH user error: ${line}`)); return; }
          send(base64(pass));
          step = 5;
          break;
        case 5: // AUTH success
          if (code !== 235) { fail(new Error(`AUTH failed: ${line}`)); return; }
          send(`MAIL FROM:<${extractEmail(from)}>`);
          step = 6;
          break;
        case 6: // MAIL FROM
          if (code !== 250) { fail(new Error(`MAIL FROM error: ${line}`)); return; }
          send(`RCPT TO:<${extractEmail(msg.to)}>`);
          step = 7;
          break;
        case 7: // RCPT TO
          if (code !== 250) { fail(new Error(`RCPT TO error: ${line}`)); return; }
          send(`DATA`);
          step = 8;
          break;
        case 8: // DATA ready
          if (code !== 354) { fail(new Error(`DATA error: ${line}`)); return; }
          socket.write(rawMsg + "\r\n.\r\n");
          step = 9;
          break;
        case 9: // message accepted
          if (code !== 250) { fail(new Error(`Message send error: ${line}`)); return; }
          send(`QUIT`);
          step = 10;
          break;
        case 10: // QUIT
          succeed();
          break;
        default:
          fail(new Error(`Unexpected SMTP response at step ${step}: ${line}`));
      }
    }

    function onData(chunk: Buffer) {
      armTimeout(); // atividade = progresso: reinicia a janela de inatividade
      buf += chunk.toString("utf8");
      const lines = buf.split("\r\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) handleLine(line);
      }
    }

    function connect() {
      armTimeout();
      if (useImplicitTls) {
        socket = tls.connect(
          { host, port, servername: host, rejectUnauthorized: true },
          () => { socket.on("data", onData); },
        );
      } else {
        socket = net.connect({ host, port }, () => { socket.on("data", onData); });
      }
      socket.on("error", (e) => fail(e));
    }

    connect();
  });
}

function welcomeEmailHtml(name: string, email: string, tempPassword: string, portalUrl: string, brand: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo ao ${brand}</title>
</head>
<body style="margin:0;padding:0;background:#F0F4F8;font-family:'Helvetica Neue',Helvetica,Arial,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background:#F0F4F8;padding:40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,0.08);">

          <!-- Header -->
          <tr>
            <td style="background:#0B2A66;padding:32px 40px;text-align:center;">
              <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">BRASÍLIA</span>
              <span style="display:inline-block;width:5px;height:32px;background:#E71D36;margin:0 8px;border-radius:2px;vertical-align:middle;"></span>
              <span style="color:#ffffff;font-size:26px;font-weight:800;letter-spacing:-0.5px;">AGORA</span>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:40px 40px 32px;">
              <p style="margin:0 0 8px;color:#E71D36;font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;">Acesso ao Painel</p>
              <h1 style="margin:0 0 20px;color:#0B2A66;font-size:24px;font-weight:800;line-height:1.3;">Bem-vindo, ${name}!</h1>
              <p style="margin:0 0 24px;color:#4A5568;font-size:15px;line-height:1.6;">
                Seu acesso ao painel administrativo do <strong>${brand}</strong> foi criado com sucesso.
                Abaixo estão suas credenciais de acesso.
              </p>

              <!-- Credentials box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#F7F9FC;border:1px solid #E2E8F0;border-radius:10px;margin-bottom:28px;">
                <tr>
                  <td style="padding:24px 28px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding-bottom:16px;border-bottom:1px solid #E2E8F0;">
                          <p style="margin:0 0 4px;color:#718096;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">E-mail de acesso</p>
                          <p style="margin:0;color:#0B2A66;font-size:16px;font-weight:700;font-family:monospace;">${email}</p>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding-top:16px;">
                          <p style="margin:0 0 4px;color:#718096;font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:1px;">Senha temporária</p>
                          <p style="margin:0;color:#E71D36;font-size:18px;font-weight:800;font-family:monospace;letter-spacing:2px;">${tempPassword}</p>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Warning -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background:#FFF8E1;border-left:4px solid #F6AD55;border-radius:4px;margin-bottom:28px;">
                <tr>
                  <td style="padding:14px 18px;">
                    <p style="margin:0;color:#744210;font-size:13px;line-height:1.5;">
                      <strong>Importante:</strong> Por segurança, você será solicitado a criar uma nova senha no seu primeiro login. Mantenha suas credenciais em segurança.
                    </p>
                  </td>
                </tr>
              </table>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center">
                    <a href="${portalUrl}/admin/login" style="display:inline-block;background:#0B2A66;color:#ffffff;text-decoration:none;font-size:15px;font-weight:700;padding:14px 36px;border-radius:8px;letter-spacing:0.3px;">
                      Acessar o Painel &#x2192;
                    </a>
                  </td>
                </tr>
              </table>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background:#F7F9FC;border-top:1px solid #E2E8F0;padding:24px 40px;text-align:center;">
              <p style="margin:0 0 8px;color:#A0AEC0;font-size:12px;">
                Este e-mail foi enviado automaticamente pelo sistema do <strong style="color:#0B2A66;">${brand}</strong>.
              </p>
              <p style="margin:0;color:#A0AEC0;font-size:12px;">
                Em caso de dúvidas, entre em contato com o administrador do portal.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

export interface SendResult {
  sent: boolean;
  error?: string;
}

export async function sendWelcomeEmail(to: string, name: string, tempPassword: string): Promise<SendResult> {
  const host = process.env["SMTP_HOST"];
  const port = parseInt(process.env["SMTP_PORT"] ?? "587", 10);
  const user = process.env["SMTP_USER"];
  const pass = process.env["SMTP_PASS"];
  // Sem SMTP_FROM, o remetente e a propria conta SMTP; sem SITE_URL, o link do
  // painel fica relativo. Os antigos padroes eram o dominio de outro blog da
  // rede: e-mail assinado pelo portal errado e link para um site que nao e este.
  const baseUrl = (process.env["SITE_URL"] ?? "").replace(/\/+$/, "");
  const brand = siteName("seu portal");

  if (!host || !user || !pass) {
    return {
      sent: false,
      error: "SMTP não configurado (defina SMTP_HOST, SMTP_USER e SMTP_PASS nas variáveis de ambiente)",
    };
  }
  const from = process.env["SMTP_FROM"] ?? user;

  try {
    await sendEmail(
      { host, port, user, pass, from },
      {
        to,
        subject: `Bem-vindo ao ${brand} — Suas credenciais de acesso`,
        html: welcomeEmailHtml(name, to, tempPassword, baseUrl, brand),
        text: `Bem-vindo ao ${brand}!\n\nSeu acesso foi criado.\n\nE-mail: ${to}\nSenha temporária: ${tempPassword}\n\nAcesse: ${baseUrl}/admin/login\n\nVocê será solicitado a alterar sua senha no primeiro login.`,
      },
    );
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, error: msg };
  }
}
