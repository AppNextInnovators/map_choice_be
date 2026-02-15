import { Router } from "express";
import mapRoutes from "./mapRoutes";

const router = Router();

router.use("/map", mapRoutes);

export default router;
