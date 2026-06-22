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
const rawOrigins = process.env["ALLOWED_ORIGINS"] ?? "";
const allowedOrigins = rawOrigins.split(",").map((s) => s.trim()).filter(Boolean);

let corsOrigin: cors.CorsOptions["origin"];

if (allowedOrigins.length > 0) {
  // Explicit allow-list — only these origins are accepted
  corsOrigin = (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error(`Origem não permitida: ${origin}`));
  };
} else if (isProd) {
  // Production with no allow-list configured: block all cross-origin requests.
  // Set ALLOWED_ORIGINS to your domain(s) to fix this.
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
