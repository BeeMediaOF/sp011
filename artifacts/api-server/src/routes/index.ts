import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import webhookRouter from "./webhook";
import adsRouter from "./ads";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/publish", webhookRouter);
router.use("/ads", adsRouter);

export default router;
