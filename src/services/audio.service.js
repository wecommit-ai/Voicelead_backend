const OpenAI = require('openai');
const prisma = require('../lib/prisma');
const fs = require('fs');
const path = require('path');
const os = require('os');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Processes audio buffer to lead data
 * @param {Buffer} audioBuffer - File buffer from Multer
 * @param {number} boothId - ID of the booth
 * @param {string} originalName - Original filename to determine extension
 */
async function processAudioToLead(audioBuffer, boothId, originalName) {
  const tempFilePath = path.join(
    os.tmpdir(),
    `upload_${Date.now()}_${originalName}`
  );

  fs.writeFileSync(tempFilePath, audioBuffer);

  try {
    // 1️⃣ Transcribe
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
    });

    // 2️⃣ Extract structured data
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You extract lead information from text.
Return ONLY valid JSON with keys:
name, email, phone, company, interest.
If unknown, use null.
          `.trim(),
        },
        {
          role: "user",
          content: transcription.text,
        },
      ],
      response_format: { type: "json_object" },
    });

    const leadData = JSON.parse(completion.choices[0].message.content);

    return {
      name: leadData.name ?? null,
      email: leadData.email ?? null,
      phone: leadData.phone ?? null,
      company: leadData.company ?? null,
      interest: leadData.interest ?? null,
      transcript: transcription.text, 
    };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}


module.exports = { processAudioToLead };
