import { Router, type IRouter } from "express";
import healthRouter from "./health";
import adminRouter from "./admin";
import webhookRouter from "./webhook";

const router: IRouter = Router();

router.use(healthRouter);
router.use("/admin", adminRouter);
router.use("/publish", webhookRouter);

export default router;
