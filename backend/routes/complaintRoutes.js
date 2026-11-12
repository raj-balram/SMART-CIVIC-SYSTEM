const express = require("express");
const protect = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { upload, verifyImage } = require("../middlewares/upload");
const { validateBody, validateQuery, validateObjectId } = require("../middlewares/validate");
const { createComplaintLimiter, supportLimiter } = require("../middlewares/rateLimit");
const {
  createComplaintSchema,
  updateStatusSchema,
  nearbyQuerySchema,
  adminListQuerySchema,
  mapQuerySchema,
} = require("../validators/schemas");
const {
  createComplaint,
  getComplaints,
  listComplaints,
  updateStatus,
  getNearby,
  supportComplaint,
  unsupportComplaint,
  getStats,
  getMap, getAnalytics
} = require("../controllers/complaintController");

const router = express.Router();

router.use(protect);

router.post(
  "/",
  createComplaintLimiter,
  upload.single("image"),
  verifyImage,
  validateBody(createComplaintSchema),
  createComplaint
);
router.get("/", getComplaints);
router.get("/nearby", validateQuery(nearbyQuerySchema), getNearby);
router.get("/list", requireRole("admin"), validateQuery(adminListQuerySchema), listComplaints);
router.get("/stats", requireRole("admin"), getStats);
router.get("/map", requireRole("admin"), validateQuery(mapQuerySchema), getMap);
router.get("/analytics", requireRole("admin"), getAnalytics);
router.post("/:id/support", supportLimiter, validateObjectId("id"), supportComplaint);
router.delete("/:id/support", supportLimiter, validateObjectId("id"), unsupportComplaint);
router.put("/:id/status", requireRole("admin"), validateObjectId("id"), validateBody(updateStatusSchema), updateStatus);

module.exports = router;