import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import router from "./routes/index.js";
import { errorResponseBody } from "./lib/errorResponse.js";

const isProd = process.env["NODE_ENV"] === "production";

const app = express();

app.set("trust proxy", 1); // atrás do Caddy

app.use(pinoHttp({ logger }));
app.use(helmet());

// CENTRAL_ALLOWED_ORIGINS restringe o CORS quando o painel roda em outra
// origem; sem ela, permite qualquer origem (auth é Bearer, sem cookies).
const allowedOrigins = (process.env["CENTRAL_ALLOWED_ORIGINS"] ?? "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
app.use(cors(allowedOrigins.length ? { origin: allowedOrigins } : {}));

app.use(express.json({ limit: "2mb" }));

app.use("/api", router);

// Handler de erro global (PRD-13/CWE-209): resposta JSON padronizada, SEM
// err.message/stack em produção; o detalhe fica só no log interno.
const errorHandler: express.ErrorRequestHandler = (err, req, res, next) => {
  logger.error({ err, reqId: (req as { id?: string }).id }, "unhandled route error (central)");
  if (res.headersSent) { next(err); return; }
  const { status, body } = errorResponseBody(err, isProd, (req as { id?: string }).id);
  res.status(status).json(body);
};
app.use(errorHandler);

// Nenhum scheduler é iniciado aqui (lição do blog): o boot em index.ts liga os
// workers somente depois de ensureSchema + initStore.

export default app;
