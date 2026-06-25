/**
 * Email service using Node.js built-in net/tls (no external dependencies).
 *
 * Required env vars:
 *   SMTP_HOST   — SMTP server host (e.g. smtp.gmail.com, smtp.office365.com)
 *   SMTP_PORT   — SMTP port: 587 = STARTTLS, 465 = SSL, 25 = plain
 *   SMTP_USER   — SMTP username / email address
 *   SMTP_PASS   — SMTP password or app password
 *   SMTP_FROM   — Sender address (e.g. "SBC Agora <no-reply@brasiliaagora.com.br>")
 *
 * Gmail example:
 *   SMTP_HOST=smtp.gmail.com  SMTP_PORT=587
 *   SMTP_USER=seu@gmail.com   SMTP_PASS=<app-password-16-chars>
 *   SMTP_FROM="SBC Agora <seu@gmail.com>"
 *
 * Hotmail/Outlook example:
 *   SMTP_HOST=smtp.office365.com  SMTP_PORT=587
 *   SMTP_USER=seu@hotmail.com     SMTP_PASS=<senha>
 *   SMTP_FROM="SBC Agora <seu@hotmail.com>"
 *
 * Generic SMTP example:
 *   SMTP_HOST=mail.seudominio.com.br  SMTP_PORT=587
 *   SMTP_USER=no-reply@seudominio.com.br  SMTP_PASS=<senha>
 *   SMTP_FROM="SBC Agora <no-reply@seudominio.com.br>"
 */

import net from "node:net";
import tls from "node:tls";

type SocketLike = net.Socket | tls.TLSSocket;

function base64(s: string): string {
  return Buffer.from(s, "utf8").toString("base64");
}

async function smtpSend(opts: {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
}): Promise<void> {
  const { host, port, user, pass, from, to, subject, html, text } = opts;
  const useImplicitTls = port === 465;

  return new Promise((resolve, reject) => {
    let socket: SocketLike;
    let buf = "";
    let upgradedToTls = false;
    let step = 0;

    const boundary = `----=_Part_${Date.now()}`;
    const msgDate = new Date().toUTCString();
    const rawMsg = [
      `Date: ${msgDate}`,
      `From: ${from}`,
      `To: ${to}`,
      `Subject: =?UTF-8?B?${base64(subject)}?=`,
      `MIME-Version: 1.0`,
      `Content-Type: multipart/alternative; boundary="${boundary}"`,
      ``,
      `--${boundary}`,
      `Content-Type: text/plain; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64(text),
      ``,
      `--${boundary}`,
      `Content-Type: text/html; charset=UTF-8`,
      `Content-Transfer-Encoding: base64`,
      ``,
      base64(html),
      ``,
      `--${boundary}--`,
    ].join("\r\n");

    function send(cmd: string) {
      socket.write(cmd + "\r\n");
    }

    function handleLine(line: string) {
      const code = parseInt(line.slice(0, 3), 10);
      const isLast = line[3] !== "-";

      if (!isLast) return;

      switch (step) {
        case 0: // banner
          if (code !== 220) { reject(new Error(`SMTP banner error: ${line}`)); return; }
          send(`EHLO localhost`);
          step = 1;
          break;
        case 1: // EHLO response
          if (code !== 250) { reject(new Error(`EHLO error: ${line}`)); return; }
          if (!useImplicitTls && !upgradedToTls) {
            send(`STARTTLS`);
            step = 2;
          } else {
            send(`AUTH LOGIN`);
            step = 3;
          }
          break;
        case 2: // STARTTLS
          if (code !== 220) { reject(new Error(`STARTTLS error: ${line}`)); return; }
          upgradedToTls = true;
          const rawSocket = socket as net.Socket;
          const tlsSock = tls.connect({ socket: rawSocket, host, rejectUnauthorized: false }, () => {
            socket = tlsSock;
            socket.on("data", onData);
            send(`EHLO localhost`);
            step = 1;
          });
          tlsSock.on("error", (e) => reject(e));
          break;
        case 3: // AUTH LOGIN prompt
          if (code !== 334) { reject(new Error(`AUTH LOGIN error: ${line}`)); return; }
          send(base64(user));
          step = 4;
          break;
        case 4: // password prompt
          if (code !== 334) { reject(new Error(`AUTH user error: ${line}`)); return; }
          send(base64(pass));
          step = 5;
          break;
        case 5: // AUTH success
          if (code !== 235) { reject(new Error(`AUTH failed: ${line}`)); return; }
          send(`MAIL FROM:<${extractEmail(from)}>`);
          step = 6;
          break;
        case 6: // MAIL FROM
          if (code !== 250) { reject(new Error(`MAIL FROM error: ${line}`)); return; }
          send(`RCPT TO:<${extractEmail(to)}>`);
          step = 7;
          break;
        case 7: // RCPT TO
          if (code !== 250) { reject(new Error(`RCPT TO error: ${line}`)); return; }
          send(`DATA`);
          step = 8;
          break;
        case 8: // DATA ready
          if (code !== 354) { reject(new Error(`DATA error: ${line}`)); return; }
          socket.write(rawMsg + "\r\n.\r\n");
          step = 9;
          break;
        case 9: // message accepted
          if (code !== 250) { reject(new Error(`Message send error: ${line}`)); return; }
          send(`QUIT`);
          step = 10;
          break;
        case 10: // QUIT
          socket.destroy();
          resolve();
          break;
        default:
          reject(new Error(`Unexpected SMTP response at step ${step}: ${line}`));
      }
    }

    function onData(chunk: Buffer) {
      buf += chunk.toString("utf8");
      const lines = buf.split("\r\n");
      buf = lines.pop() ?? "";
      for (const line of lines) {
        if (line.trim()) handleLine(line);
      }
    }

    function connect() {
      if (useImplicitTls) {
        socket = tls.connect({ host, port, rejectUnauthorized: false }, () => {
          socket.on("data", onData);
        });
      } else {
        socket = net.connect({ host, port }, () => {
          socket.on("data", onData);
        });
      }
      socket.on("error", (e) => reject(e));
      socket.setTimeout(15_000, () => {
        socket.destroy();
        reject(new Error("SMTP connection timed out"));
      });
    }

    connect();
  });
}

function extractEmail(address: string): string {
  const m = address.match(/<([^>]+)>/);
  return m?.[1] ?? address.trim();
}

function welcomeEmailHtml(name: string, email: string, tempPassword: string, portalUrl: string): string {
  return `<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Bem-vindo ao SBC Agora</title>
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
                Seu acesso ao painel administrativo do <strong>SBC Agora</strong> foi criado com sucesso.
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
                Este e-mail foi enviado automaticamente pelo sistema do <strong style="color:#0B2A66;">SBC Agora</strong>.
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
  const from = process.env["SMTP_FROM"] ?? user ?? "no-reply@brasiliaagora.com.br";
  const baseUrl = process.env["SITE_URL"] ?? "https://brasiliaagora.com.br";

  if (!host || !user || !pass) {
    return {
      sent: false,
      error: "SMTP não configurado (defina SMTP_HOST, SMTP_USER e SMTP_PASS nas variáveis de ambiente)",
    };
  }

  try {
    await smtpSend({
      host,
      port,
      user,
      pass,
      from,
      to,
      subject: "Bem-vindo ao SBC Agora — Suas credenciais de acesso",
      html: welcomeEmailHtml(name, to, tempPassword, baseUrl),
      text: `Bem-vindo ao SBC Agora!\n\nSeu acesso foi criado.\n\nE-mail: ${to}\nSenha temporária: ${tempPassword}\n\nAcesse: ${baseUrl}/admin/login\n\nVocê será solicitado a alterar sua senha no primeiro login.`,
    });
    return { sent: true };
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    return { sent: false, error: msg };
  }
}
