import express, { type Express } from "express";
import cors from "cors";
import helmet from "helmet";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { startScheduler } from "./lib/scheduler";

// ── Startup security warnings ─────────────────────────────────────────────────
if (!process.env["SESSION_SECRET"]) {
  logger.warn("SESSION_SECRET not set — using insecure default. Set it in production!");
}
if (!process.env["ADMIN_DEFAULT_PASSWORD"]) {
  logger.warn("ADMIN_DEFAULT_PASSWORD not set — admin seed will use weak default password.");
}

// ── CORS ─────────────────────────────────────────────────────────────────────
const rawOrigins = process.env["ALLOWED_ORIGINS"] ?? "";
const allowedOrigins = rawOrigins.split(",").map((s) => s.trim()).filter(Boolean);

const corsOptions: cors.CorsOptions = {
  origin: allowedOrigins.length > 0
    ? (origin, cb) => {
        if (!origin || allowedOrigins.includes(origin)) cb(null, true);
        else cb(new Error(`Origem não permitida: ${origin}`));
      }
    : true,
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
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);

// ── Security headers (helmet) ─────────────────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false,
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
  }),
);

app.use(cors(corsOptions));

// ── Body parsing ──────────────────────────────────────────────────────────────
// General routes get 512kb; upload routes (logo, avatar, images) get 10mb
app.use((req, _res, next) => {
  const isUploadRoute =
    req.path.includes("/logo") ||
    req.path.includes("/avatar") ||
    req.path.includes("/favicon") ||
    req.path.includes("/og-image") ||
    req.path.includes("/ads");
  express.json({ limit: isUploadRoute ? "10mb" : "512kb" })(req, _res, next);
});
app.use(express.urlencoded({ extended: true, limit: "512kb" }));

app.use("/api", router);

startScheduler();

export default app;
