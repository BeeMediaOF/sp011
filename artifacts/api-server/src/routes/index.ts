import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import webhookRouter from "./webhook";
import adsRouter from "./ads";
import contactRouter from "./contact";
import columnistsPublicRouter from "./columnists";
import msgsRouter from "./msgs";
import articlesRouter from "./articles";
import siteRouter from "./site";
import quotesRouter from "./quotes";
import sitemapRouter from "./sitemap";
import analyticsRouter from "./analytics";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/publish", webhookRouter);
router.use("/ads", adsRouter);
router.use("/columnists", columnistsPublicRouter);
router.use("/messages", msgsRouter);
router.use("/articles", articlesRouter);
router.use("/quotes", quotesRouter);
router.use(siteRouter);
router.use(sitemapRouter);
router.use("/analytics", analyticsRouter);

export default router;
