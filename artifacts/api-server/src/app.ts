import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";

const isProd = process.env["NODE_ENV"] === "production";

// ── Startup check for ADMIN_DEFAULT_PASSWORD ──────────────────────────────────
if (!process.env["ADMIN_DEFAULT_PASSWORD"]) {
  logger.warn("ADMIN_DEFAULT_PASSWORD not set — admin seed will use weak default password.");
}
// SESSION_SECRET check is handled in auth.ts (throws in production if missing)

// ── CORS ─────────────────────────────────────────────────────────────────────
/** Normaliza um valor (URL ou origem) para "protocolo//host", ou null se inválido. */
function toOrigin(raw: string): string | null {
  const v = raw.trim();
  if (!v) return null;
  try {
    const u = new URL(v.includes("://") ? v : `https://${v}`);
    return `${u.protocol}//${u.host}`;
  } catch {
    return null;
  }
}

/** Dada uma origem, retorna as variantes apex E www (mesmo protocolo/porta). */
function withWwwVariants(origin: string): string[] {
  try {
    const u = new URL(origin);
    const bare = u.host.replace(/^www\./, "");
    return [`${u.protocol}//${bare}`, `${u.protocol}//www.${bare}`];
  } catch {
    return [origin];
  }
}

const rawOrigins = process.env["ALLOWED_ORIGINS"] ?? "";
const explicitOrigins = rawOrigins.split(",").map((s) => s.trim()).filter(Boolean);

// Deriva a origem do domínio público (APP_URL/SITE_URL) para que um esquecimento
// no ALLOWED_ORIGINS não derrube o frontend/login. Apex e www são incluídos
// automaticamente (ex.: definir https://sp011.com.br já libera www.sp011.com.br).
const publicUrlOrigins = [process.env["APP_URL"], process.env["SITE_URL"]]
  .map((v) => toOrigin(v ?? ""))
  .filter((v): v is string => !!v);

// Automatically include Replit-assigned domains (comma-separated in REPLIT_DOMAINS)
const replitDomains = (process.env["REPLIT_DOMAINS"] ?? "")
  .split(",")
  .map((d) => d.trim())
  .filter(Boolean)
  .flatMap((d) => [`https://${d}`, `http://${d}`]);

const allowedOrigins = [
  ...new Set(
    [...explicitOrigins, ...publicUrlOrigins, ...replitDomains].flatMap((o) => withWwwVariants(o)),
  ),
];

let corsOrigin: cors.CorsOptions["origin"];

if (allowedOrigins.length > 0) {
  // Explicit allow-list — only these origins are accepted
  corsOrigin = (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error(`Origem não permitida: ${origin}`));
  };
  if (isProd) logger.info({ allowedOrigins }, "CORS allow-list configured.");
} else if (isProd) {
  // Production with no allow-list configured: block all cross-origin requests.
  logger.warn(
    "ALLOWED_ORIGINS is not set in production — all cross-origin requests will be blocked. " +
    "Set ALLOWED_ORIGINS=https://yourdomain.com to allow your frontend."
  );
  corsOrigin = (origin, cb) => {
    if (!origin) cb(null, true); // same-origin / server-to-server requests
    else cb(new Error("Cross-origin requests are not allowed. Configure ALLOWED_ORIGINS."));
  };
} else {
  // Development: accept all origins with a clear warning
  logger.warn("CORS is open to all origins (development mode). Set ALLOWED_ORIGINS in production.");
  corsOrigin = true;
}

const corsOptions: cors.CorsOptions = {
  origin: corsOrigin,
  credentials: true,
  methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  maxAge: 86400,
};

const app: Express = express();

// Atrás do Caddy (1 hop): req.ip passa a ser o IP real do cliente extraído do
// X-Forwarded-For adicionado pelo proxy — sem confiar em valores forjados pelo
// cliente (com "1", só o último hop é confiável). Essencial para rate limiting
// e logs de auditoria corretos.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return { id: req.id, method: req.method, url: req.url?.split("?")[0] };
      },
      res(res) {
        return { statusCode: res.statusCode };
      },
    },
  }),
);

// ── Security headers (helmet + CSP) ──────────────────────────────────────────
// Applied to all responses including AMP pages and the sitemap.
// The frontend Vite app is served separately and has its own headers.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc:      ["'self'"],
        scriptSrc:       ["'self'", "'unsafe-inline'", "https://cdn.ampproject.org"],
        styleSrc:        ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
        imgSrc:          ["'self'", "data:", "https:"],
        fontSrc:         ["'self'", "https://fonts.gstatic.com"],
        connectSrc:      ["'self'"],
        frameAncestors:  ["'none'"],
        formAction:      ["'self'"],
        baseUri:         ["'self'"],
        objectSrc:       ["'none'"],
      },
    },
    referrerPolicy:            { policy: "strict-origin-when-cross-origin" },
    permittedCrossDomainPolicies: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(cors(corsOptions));

// ── Body parsing ──────────────────────────────────────────────────────────────
app.use((req, _res, next) => {
  const isUploadRoute =
    req.path.includes("/logo") ||
    req.path.includes("/avatar") ||
    req.path.includes("/favicon") ||
    req.path.includes("/og-image") ||
    req.path.includes("/ads") ||
    req.path.endsWith("/me") ||
    req.path.endsWith("/settings");
  express.json({ limit: isUploadRoute ? "10mb" : "512kb" })(req, _res, next);
});
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

app.use("/api", router);

startScheduler();

export default app;
