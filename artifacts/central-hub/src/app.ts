import express from "express";
import helmet from "helmet";
import cors from "cors";
import { pinoHttp } from "pino-http";
import { logger } from "./lib/logger.js";
import router from "./routes/index.js";

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

// Nenhum scheduler é iniciado aqui (lição do blog): o boot em index.ts liga os
// workers somente depois de ensureSchema + initStore.

export default app;
