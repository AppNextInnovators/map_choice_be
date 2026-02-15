import { Router } from "express";
import { MapController } from "../controllers/mapController";

const router = Router();
const mapController = new MapController();

router.post("/parse", mapController.parseMapLink);

export default router;
