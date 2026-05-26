import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import webhookRouter from "./webhook";
import adsRouter from "./ads";
import contactRouter from "./contact";
import msgsRouter from "./msgs";
import articlesRouter from "./articles";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/publish", webhookRouter);
router.use("/ads", adsRouter);
router.use("/columnists", contactRouter);
router.use("/messages", msgsRouter);
router.use("/articles", articlesRouter);

export default router;
