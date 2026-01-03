const OpenAI = require('openai');
const prisma = require('../lib/prisma');
const fs = require('fs');
const path = require('path');
const os = require('os');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3.config');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// AI Confidence threshold - if below this, fallback to notes-based handling
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Sanitize filename for S3
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .replace(/_{2,}/g, '_')
    .toLowerCase();
}

/**
 * Upload audio to S3 in voice-recordings folder
 * @param {Buffer} buffer - Audio file buffer
 * @param {string} filename - Original filename
 * @param {string} mimetype - File mimetype
 * @param {boolean} isTemporary - If true, store in temp folder (7-day retention)
 */
async function uploadAudioToS3(buffer, filename, mimetype, isTemporary = false) {
  const folder = isTemporary ? 'voice-recordings/temp' : 'voice-recordings';
  const key = `${folder}/${Date.now()}_${sanitizeFilename(filename)}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    ACL: 'public-read',
    ...(isTemporary && {
      // Set 7-day expiration for temporary files
      Expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
    })
  });

  await s3Client.send(command);

  // Construct public URL
  const url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return url;
}

/**
 * Calculate confidence score based on extracted data quality and transcription metadata
 * @param {Object} leadData - Extracted lead information
 * @param {string} transcriptionText - Transcribed text
 * @param {Object} metadata - Transcription metadata (duration, segments, words, etc.)
 */
function calculateConfidence(leadData, transcriptionText, metadata = {}) {
  let score = 0;
  let totalFields = 0;

  // Check if key fields are present and meaningful
  const fields = ['name', 'email', 'phone', 'company', 'interest'];
  fields.forEach(field => {
    totalFields++;
    if (leadData[field] && leadData[field].trim().length > 0) {
      score++;
    }
  });

  // Bonus for email format validation
  if (leadData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(leadData.email)) {
    score += 0.5;
  }

  // Penalty if transcription is too short (likely poor audio)
  if (transcriptionText.length < 20) {
    score -= 1;
  }

  // Use transcription metadata if available
  if (metadata.duration && metadata.segments) {
    // Check if audio duration is reasonable (not too short)
    if (metadata.duration < 2) {
      score -= 0.5; // Very short audio likely incomplete
    }
    
    // Check segment quality - if we have segments, we can assess consistency
    if (metadata.segments.length > 0) {
      // Calculate average segment length - longer segments usually mean clearer speech
      const avgSegmentLength = metadata.segments.reduce((sum, seg) => 
        sum + (seg.text ? seg.text.length : 0), 0) / metadata.segments.length;
      
      if (avgSegmentLength > 10) {
        score += 0.3; // Bonus for clear, substantial segments
      }
    }
  }

  // Check word density if available (words per second)
  if (metadata.words && metadata.duration && metadata.duration > 0) {
    const wordsPerSecond = metadata.words.length / metadata.duration;
    // Normal speech is around 2-3 words per second
    // Too fast or too slow might indicate issues
    if (wordsPerSecond >= 1.5 && wordsPerSecond <= 4) {
      score += 0.2; // Natural speech pace bonus
    }
  }

  // Normalize to 0-1 scale (adjusted for new scoring)
  const maxScore = totalFields + 1.5; // Adjusted for additional bonuses
  const confidence = Math.max(0, Math.min(1, score / maxScore));
  return confidence;
}

/**
 * Processes audio buffer to lead data with AI fallback logic
 * 
 * Uses OpenAI Whisper's verbose_json format to get detailed transcription metadata:
 * - duration: Audio duration in seconds
 * - language: Detected language code
 * - segments: Array of time-stamped text segments with start/end times
 * - words: Array of individual words with timestamps (if word-level granularity enabled)
 * 
 * This metadata enhances confidence scoring by analyzing:
 * - Audio duration (too short may indicate incomplete recording)
 * - Segment quality (longer segments = clearer speech)
 * - Word density (natural speech pace ~2-3 words/second)
 * 
 * @param {Buffer} audioBuffer - File buffer from Multer
 * @param {number} boothId - ID of the booth
 * @param {string} originalName - Original filename to determine extension
 * @param {string} mimetype - File mimetype
 */
async function processAudioToLead(audioBuffer, boothId, originalName, mimetype) {
  const tempFilePath = path.join(
    os.tmpdir(),
    `upload_${Date.now()}_${originalName}`
  );

  fs.writeFileSync(tempFilePath, audioBuffer);

  try {
    // 1️⃣ Upload raw audio file to S3 (temporary storage - 7 days)
    const rawAudioUrl = await uploadAudioToS3(
      audioBuffer,
      originalName,
      mimetype,
      true // isTemporary = true
    );

    // 2️⃣ Upload permanent audio file to S3
    const audioUrl = await uploadAudioToS3(
      audioBuffer,
      originalName,
      mimetype,
      false
    );

    // 3️⃣ Transcribe with verbose_json for detailed metadata
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      response_format: "verbose_json", // Get detailed segment information
      timestamp_granularities: ["word"] // Optional: get word-level timestamps
    });

    const transcriptionText = transcription.text || "";
    
    // Extract metadata for better confidence calculation
    const transcriptionMetadata = {
      duration: transcription.duration || 0,
      language: transcription.language || 'unknown',
      segments: transcription.segments || [],
      words: transcription.words || []
    };

    // 4️⃣ Extract structured data using JSON Schema with improved prompt
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `You are a helpful assistant that extracts lead information from text.
Extract as much information as possible, even if partial or incomplete.
If you detect any contact information, names, or relevant details, include them.
Use null only if absolutely no information is available for a field.`,
        },
        {
          role: "user",
          content: transcriptionText,
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

    // 5️⃣ Calculate AI confidence score using transcription metadata
    const confidence = calculateConfidence(leadData, transcriptionText, transcriptionMetadata);

    // 6️⃣ AI Fallback Logic: If confidence is below threshold
    let remarks = null;
    if (confidence < CONFIDENCE_THRESHOLD) {
      // Store partial/low-confidence data in remarks field
      const partialData = [];
      if (transcriptionText) partialData.push(`Transcript: ${transcriptionText}`);
      if (transcriptionMetadata.language) partialData.push(`Language: ${transcriptionMetadata.language}`);
      if (transcriptionMetadata.duration) partialData.push(`Duration: ${transcriptionMetadata.duration.toFixed(2)}s`);
      if (leadData.name) partialData.push(`Name (low confidence): ${leadData.name}`);
      if (leadData.email) partialData.push(`Email (low confidence): ${leadData.email}`);
      if (leadData.phone) partialData.push(`Phone (low confidence): ${leadData.phone}`);
      if (leadData.company) partialData.push(`Company (low confidence): ${leadData.company}`);
      if (leadData.interest) partialData.push(`Interest (low confidence): ${leadData.interest}`);
      
      remarks = partialData.join(' | ');
    }

    return {
      name: leadData.name,
      email: leadData.email,
      phone: leadData.phone,
      company: leadData.company,
      interest: leadData.interest,
      transcript: transcriptionText,
      source: audioUrl,
      type: 'voice',
      confidence: confidence,
      remarks: remarks,
      rawAudioUrl: rawAudioUrl,
    };
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}


module.exports = { processAudioToLead };
