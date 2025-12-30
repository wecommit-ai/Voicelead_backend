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

    // 2️⃣ Extract structured data using JSON Schema
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a helpful assistant that extracts lead information from text.",
        },
        {
          role: "user",
          content: transcription.text,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "lead_extraction",
          strict: true,
          schema: {
            type: "object",
            properties: {
              name: {
                type: ["string", "null"],
                description: "The name of the person."
              },
              email: {
                type: ["string", "null"],
                description: "The email address of the person."
              },
              phone: {
                type: ["string", "null"],
                description: "The phone number."
              },
              company: {
                type: ["string", "null"],
                description: "The company name."
              },
              interest: {
                type: ["string", "null"],
                description: "The specific product or service interest."
              }
            },
            // In Structured Outputs, all properties must be required
            required: ["name", "email", "phone", "company", "interest"],
            additionalProperties: false,
          },
        },
      },
    });

    const leadData = JSON.parse(completion.choices[0].message.content);

    return {
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      company: leadData.company,
      interest: leadData.interest,
      transcript: transcription.text,
    };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}


module.exports = { processAudioToLead };
