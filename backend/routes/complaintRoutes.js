const express = require("express");
const protect = require("../middlewares/authMiddleware");
const requireRole = require("../middlewares/requireRole");
const { upload, verifyImage } = require("../middlewares/upload");
const { validateBody, validateObjectId } = require("../middlewares/validate");
const { createComplaintLimiter } = require("../middlewares/rateLimit");
const { createComplaintSchema, updateStatusSchema } = require("../validators/schemas");
const {
  createComplaint,
  getComplaints,
  getAllComplaintAdmin,
  updateStatus,
  getStats,
} = require("../controllers/complaintController");

const router = express.Router();

router.use(protect);

// order matters: limit first, then parse the upload, check it, then validate the fields
router.post(
  "/",
  createComplaintLimiter,
  upload.single("image"),
  verifyImage,
  validateBody(createComplaintSchema),
  createComplaint
);
router.get("/", getComplaints);
router.get("/all", requireRole("admin"), getAllComplaintAdmin);
router.get("/stats", requireRole("admin"), getStats);
router.put("/:id/status", requireRole("admin"), validateObjectId("id"), validateBody(updateStatusSchema), updateStatus);

module.exports = router;