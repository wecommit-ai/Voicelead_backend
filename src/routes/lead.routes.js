const express = require('express');
const router = express.Router();
const multer = require('multer');
const { processAudioToLead } = require('../services/audio.service');
const { processImageToLead } = require('../services/ocr.service');
const authMiddleware = require('../middleware/auth.middleware');
const prisma = require('../lib/prisma');
const logger = require('../config/logger');

const upload = multer({ storage: multer.memoryStorage() });

// router.post("/process-audio", upload.single("audio"), async (req, res) => {
//   const { boothId } = req.body;

//   logger.info('🎤 Audio processing request received', {
//     boothId,
//     filename: req.file?.originalname,
//     mimetype: req.file?.mimetype,
//     size: req.file?.size
//   });

//   if (!req.file) {
//     logger.warn('⚠️ Audio processing failed - no file uploaded');
//     return res.status(400).json({ success: false, error: "No audio file" });
//   }

//   try {
//     const lead = await processAudioToLead(
//       req.file.buffer,
//       boothId,
//       req.file.originalname,
//       req.file.mimetype
//     );

//     logger.info('✅ Audio processing completed successfully', {
//       boothId,
//       confidence: lead.confidence,
//       hasRemarks: !!lead.remarks
//     });

//     res.json({ success: true, data: lead });
//   } catch (error) {
//     logger.error('❌ Audio processing endpoint error', {
//       error: error.message,
//       stack: error.stack,
//       boothId,
//       filename: req.file?.originalname
//     });
//     res.status(500).json({ success: false, error: error.message });
//   }
// });


router.post("/process-audio", upload.single("audio"), async (req, res) => {
  const { boothId } = req.body;

  logger.info("🎤 Audio upload request received", {
    boothId,
    filename: req.file?.originalname,
    size: req.file?.size,
    mimetype: req.file?.mimetype,
  });

  // ✅ Hard validation
  if (!req.file || !req.file.buffer || req.file.buffer.length === 0) {
    return res.status(400).json({
      success: false,
      error: "Invalid or empty audio file",
    });
  }

  try {
    // 🔥 Upload ONCE, quickly
    const audioUrl = await uploadAudioToS3(
      req.file.buffer,
      req.file.originalname,
      req.file.mimetype,
      false
    );

    // ✅ Respond immediately (NO AI HERE)
    res.status(202).json({
      success: true,
      message: "Audio uploaded and queued for processing",
      source: audioUrl,
    });

    // 🚀 Background processing (fire-and-forget)
    processAudioToLeadAsync({
      audioUrl,
      boothId,
      originalName: req.file.originalname,
      mimetype: req.file.mimetype,
    });
  } catch (error) {
    logger.error("❌ Audio upload failed", {
      error: error.message,
      stack: error.stack,
    });

    return res.status(500).json({
      success: false,
      error: "Audio upload failed",
    });
  }
});

router.post("/process-image", upload.single("image"), async (req, res) => {
  const { boothId } = req.body;

  logger.info('📷 Image processing request received', {
    boothId,
    filename: req.file?.originalname,
    mimetype: req.file?.mimetype,
    size: req.file?.size
  });

  // Validation
  if (!req.file) {
    logger.warn('⚠️ Image processing failed - no file uploaded');
    return res.status(400).json({ success: false, error: "No image file" });
  }

  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  if (!allowedMimes.includes(req.file.mimetype)) {
    logger.warn('⚠️ Image processing failed - invalid file type', {
      mimetype: req.file.mimetype
    });
    return res.status(400).json({
      success: false,
      error: "Invalid file type. Only JPG, PNG, and WebP allowed"
    });
  }

  const maxSize = 10 * 1024 * 1024; // 10MB
  if (req.file.size > maxSize) {
    logger.warn('⚠️ Image processing failed - file too large', {
      size: req.file.size,
      maxSize
    });
    return res.status(400).json({
      success: false,
      error: "File too large. Max 10MB"
    });
  }

  try {
    // Process
    const result = await processImageToLead(
      req.file.buffer,
      boothId,
      req.file.originalname
    );

    logger.info('✅ Image processing completed successfully', {
      boothId,
      confidence: result.confidence,
      hasRemarks: !!result.remarks
    });

    res.json({ success: true, data: result });
  } catch (error) {
    logger.error('❌ Image processing endpoint error', {
      error: error.message,
      stack: error.stack,
      boothId,
      filename: req.file?.originalname
    });
    res.status(500).json({ success: false, error: error.message });
  }
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
      ocrText,
      source,
      type,
      captureMode,
      confidence,
      remarks,
      rawAudioUrl,
    } = req.body;

    logger.info('📝 Lead capture request received', {
      boothId,
      type,
      captureMode,
      hasEmail: !!email,
      hasPhone: !!phone,
      hasName: !!name,
      confidence
    });

    console.log("📥 /capture - boothId received:", boothId);
    console.log("📥 /capture - boothId type:", typeof boothId);

    // ✅ Validation
    if (!boothId) {
      logger.warn('⚠️ Lead capture failed - missing boothId');
      return res.status(400).json({
        success: false,
        error: "boothId is required",
      });
    }

    // ✅ Require at least one field
    if (!email && !phone && !interest && !name && !company) {
      logger.warn('⚠️ Lead capture failed - no lead information provided');
      return res.status(400).json({
        success: false,
        error:
          "Please provide some lead information (at least one field).",
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
        ocrText: ocrText || null,
        source: source || null,
        type: type || null,
        confidence: confidence || null,
        remarks: remarks || null,
        rawAudioUrl: rawAudioUrl || null,
        status: "new",
        captureMode: captureMode || "manual",
      },
    });

    logger.info('✅ Lead captured successfully', {
      leadId: lead.id,
      boothId,
      type: lead.type,
      captureMode: lead.captureMode,
      confidence: lead.confidence
    });

    return res.json({
      success: true,
      data: lead,
    });
  } catch (error) {
    logger.error('❌ Lead capture failed', {
      error: error.message,
      stack: error.stack,
      boothId: req.body?.boothId
    });
    return res.status(500).json({
      success: false,
      error: "Failed to save lead. Please try again.",
    });
  }
});








module.exports = router;
