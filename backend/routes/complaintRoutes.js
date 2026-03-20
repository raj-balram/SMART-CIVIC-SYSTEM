const express = require("express");
const router = express.Router();
const protect = require("../middlewares/authMiddleware");
const upload = require("../middlewares/upload");
const { getStats } = require("../controllers/complaintController");
const { createComplaint, getComplaints, getAllComplaintAdmin, updateStatus } = require("../controllers/complaintController");

router.post("/", protect, upload.single("image"), createComplaint);
router.get("/", protect, getComplaints);
router.get("/all", protect, getAllComplaintAdmin);
router.put("/:id/status", protect, updateStatus);
router.get("/stats", protect, getStats);

module.exports = router;