const express = require('express');
const router = express.Router();
const multer = require('multer');
const { processAudioToLead } = require('../services/audio.service');
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





module.exports = router;
