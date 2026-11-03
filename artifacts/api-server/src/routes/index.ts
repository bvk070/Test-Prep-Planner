import { Router, type IRouter } from "express";
import healthRouter from "./health";
import studyPlannerRouter from "./study-planner";

const router: IRouter = Router();

router.use(healthRouter);
router.use(studyPlannerRouter);

export default router;
