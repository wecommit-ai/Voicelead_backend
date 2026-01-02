const express = require('express');
const router = express.Router();
const multer = require('multer');
const { processAudioToLead } = require('../services/audio.service');
const { processImageToLead } = require('../services/ocr.service');
const authMiddleware = require('../middleware/auth.middleware');
const prisma = require('../lib/prisma');

const upload = multer({ storage: multer.memoryStorage() });

router.post("/process-audio", upload.single("audio"), async (req, res) => {
  const { boothId } = req.body;

  if (!req.file) {
    return res.status(400).json({ success: false, error: "No audio file" });
  }

  const lead = await processAudioToLead(
    req.file.buffer,
    boothId,
    req.file.originalname
  );

  res.json({ success: true, data: lead });
});

router.post("/process-image", upload.single("image"), async (req, res) => {
  const { boothId } = req.body;

  // Validation
  if (!req.file) {
    return res.status(400).json({ success: false, error: "No image file" });
  }

  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(req.file.mimetype)) {
    return res.status(400).json({
      success: false,
      error: "Invalid file type. Only JPG, PNG, and WebP allowed"
    });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.file.size > maxSize) {
    return res.status(400).json({
      success: false,
      error: "File too large. Max 10MB"
    });
  }

  // Process
  const result = await processImageToLead(
    req.file.buffer,
    boothId,
    req.file.originalname
  );

  res.json({ success: true, data: result });
});

router.post("/capture", async (req, res) => {
  try {
    const {
      boothId,
      name,
      email,
      company,
      phone,
      interest,
      transcript,
      imageUrl,
      source,
    } = req.body;

    console.log("📥 /capture - boothId received:", boothId); // ✅ ADD THIS
    console.log("📥 /capture - boothId type:", typeof boothId); // ✅ ADD THIS

    // ✅ ADD THIS VALIDATION
    if (!boothId) {
      return res.status(400).json({
        success: false,
        error: "boothId is required",
      });
    }

    // ✅ Require at least email OR phone
    if (!email && !phone && !interest && !name && !company) {
      return res.status(400).json({
        success: false,
        error:
          "Please provide Some lead information (at least email or phone).",
      });
    }

    const lead = await prisma.lead.create({
      data: {
        boothId: boothId,
        name: name || null,
        email: email || null,
        company: company || null,
        phone: phone || null,
        interest: interest || null,
        transcript: transcript || null,
        imageUrl: imageUrl || null,
        status: "new",
        source: source || "manual",
      },
    });

    return res.json({
      success: true,
      data: lead,
    });
  } catch (error) {
    console.error("Create lead error:", error);
    return res.status(500).json({
      success: false,
      error: "Failed to save lead. Please try again.",
    });
  }
});








module.exports = router;
