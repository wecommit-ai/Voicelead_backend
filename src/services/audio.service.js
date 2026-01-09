const OpenAI = require("openai");
const prisma = require("../lib/prisma");
const fs = require("fs");
const path = require("path");
const os = require("os");
const { PutObjectCommand } = require("@aws-sdk/client-s3");
const s3Client = require("../config/s3.config");
const logger = require("../config/logger");

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// AI Confidence threshold - if below this, fallback to notes-based handling
const CONFIDENCE_THRESHOLD = 0.6;

/**
 * Sanitize filename for S3
 */
function sanitizeFilename(filename) {
  return filename
    .replace(/[^a-zA-Z0-9.-]/g, "_")
    .replace(/_{2,}/g, "_")
    .toLowerCase();
}

/**
 * Upload audio to S3 in voice-recordings folder
 * @param {Buffer} buffer - Audio file buffer
 * @param {string} filename - Original filename
 * @param {string} mimetype - File mimetype
 * @param {boolean} isTemporary - If true, store in temp folder (7-day retention)
 */
async function uploadAudioToS3(
  buffer,
  filename,
  mimetype,
  isTemporary = false
) {
  const folder = isTemporary ? "voice-recordings/temp" : "voice-recordings";
  const key = `${folder}/${Date.now()}_${sanitizeFilename(filename)}`;

  logger.info("📤 Uploading audio to S3", {
    filename: sanitizeFilename(filename),
    folder,
    size: buffer.length,
    mimetype,
    isTemporary,
  });

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    ACL: "public-read",
    ...(isTemporary && {
      // Set 7-day expiration for temporary files
      Expires: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    }),
  });

  try {
    await s3Client.send(command);

    // Construct public URL
    const url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;

    logger.info("✅ Audio uploaded successfully", {
      key,
      url: url.substring(0, 100),
    });
    return url;
  } catch (error) {
    logger.error("❌ Failed to upload audio to S3", {
      error: error.message,
      filename: sanitizeFilename(filename),
      folder,
    });
    throw error;
  }
}

/**
 * Calculate confidence score based on extracted data quality and transcription metadata
 * @param {Object} leadData - Extracted lead information
 * @param {string} transcriptionText - Transcribed text
 * @param {Object} metadata - Transcription metadata (duration, segments, words, etc.)
 */
function calculateConfidence(leadData, transcriptionText, metadata = {}) {
  logger.debug("🔍 Calculating confidence score", {
    textLength: transcriptionText.length,
    hasMetadata: !!metadata.duration,
    duration: metadata.duration,
    segmentCount: metadata.segments?.length || 0,
    wordCount: metadata.words?.length || 0,
  });

  let score = 0;
  let totalFields = 0;

  // Check if key fields are present and meaningful
  const fields = ["name", "email", "phone", "company", "interest"];
  fields.forEach((field) => {
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
      const avgSegmentLength =
        metadata.segments.reduce(
          (sum, seg) => sum + (seg.text ? seg.text.length : 0),
          0
        ) / metadata.segments.length;

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

  logger.info("📊 Confidence calculated", {
    confidence: confidence.toFixed(3),
    score,
    maxScore,
    fieldsPresent: Object.keys(leadData).filter((k) => leadData[k]).length,
  });

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
// async function processAudioToLead(audioBuffer, boothId, originalName, mimetype) {
//   logger.info('🎤 Starting audio processing', {
//     boothId,
//     originalName,
//     mimetype,
//     bufferSize: audioBuffer.length
//   });

//   const tempFilePath = path.join(
//     os.tmpdir(),
//     `upload_${Date.now()}_${originalName}`
//   );

//   fs.writeFileSync(tempFilePath, audioBuffer);
//   logger.debug('📁 Temporary file created', { tempFilePath });

//   try {
//     // 1️⃣ Upload raw audio file to S3 (temporary storage - 7 days)
//     const rawAudioUrl = await uploadAudioToS3(
//       audioBuffer,
//       originalName,
//       mimetype,
//       true // isTemporary = true
//     );

//     // 2️⃣ Upload permanent audio file to S3
//     const audioUrl = await uploadAudioToS3(
//       audioBuffer,
//       originalName,
//       mimetype,
//       false
//     );

//     // 3️⃣ Transcribe with verbose_json for detailed metadata
//     logger.info('🎧 Starting Whisper transcription', { model: 'whisper-1' });
//     const transcription = await openai.audio.transcriptions.create({
//       file: fs.createReadStream(tempFilePath),
//       model: "whisper-1",
//       response_format: "verbose_json", // Get detailed segment information
//       timestamp_granularities: ["word"] // Optional: get word-level timestamps
//     });

//     const transcriptionText = transcription.text || "";

//     // Extract metadata for better confidence calculation
//     const transcriptionMetadata = {
//       duration: transcription.duration || 0,
//       language: transcription.language || 'unknown',
//       segments: transcription.segments || [],
//       words: transcription.words || []
//     };

//     logger.info('✅ Transcription completed', {
//       textLength: transcriptionText.length,
//       duration: transcriptionMetadata.duration,
//       language: transcriptionMetadata.language,
//       segmentCount: transcriptionMetadata.segments.length,
//       wordCount: transcriptionMetadata.words.length,
//       preview: transcriptionText.substring(0, 100)
//     });

//     // 4️⃣ Extract structured data using JSON Schema with improved prompt
//     logger.info('🤖 Starting GPT-4o data extraction');
//     const completion = await openai.chat.completions.create({
//       model: "gpt-4o",
//       messages: [
//         {
//           role: "system",
//           content: `You are a helpful assistant that extracts lead information from text.
// Extract as much information as possible, even if partial or incomplete.
// If you detect any contact information, names, or relevant details, include them.
// Use null only if absolutely no information is available for a field.`,
//         },
//         {
//           role: "user",
//           content: transcriptionText,
//         },
//       ],
//       response_format: {
//         type: "json_schema",
//         json_schema: {
//           name: "lead_extraction",
//           strict: true,
//           schema: {
//             type: "object",
//             properties: {
//               name: {
//                 type: ["string", "null"],
//                 description: "The name of the person."
//               },
//               email: {
//                 type: ["string", "null"],
//                 description: "The email address of the person."
//               },
//               phone: {
//                 type: ["string", "null"],
//                 description: "The phone number."
//               },
//               company: {
//                 type: ["string", "null"],
//                 description: "The company name."
//               },
//               interest: {
//                 type: ["string", "null"],
//                 description: "The specific product or service interest."
//               }
//             },
//             // In Structured Outputs, all properties must be required
//             required: ["name", "email", "phone", "company", "interest"],
//             additionalProperties: false,
//           },
//         },
//       },
//     });

//     const leadData = JSON.parse(completion.choices[0].message.content);

//     logger.info('✅ Data extraction completed', {
//       name: leadData.name,
//       email: leadData.email,
//       company: leadData.company,
//       hasPhone: !!leadData.phone
//     });

//     // 5️⃣ Calculate AI confidence score using transcription metadata
//     const confidence = calculateConfidence(leadData, transcriptionText, transcriptionMetadata);

//     // 6️⃣ AI Fallback Logic: If confidence is below threshold
//     let remarks = null;
//     if (confidence < CONFIDENCE_THRESHOLD) {
//       logger.warn('⚠️ Low confidence detected - using AI fallback', {
//         confidence: confidence.toFixed(3),
//         threshold: CONFIDENCE_THRESHOLD
//       });

//       // Store partial/low-confidence data in remarks field
//       const partialData = [];
//       if (transcriptionText) partialData.push(`Transcript: ${transcriptionText}`);
//       if (transcriptionMetadata.language) partialData.push(`Language: ${transcriptionMetadata.language}`);
//       if (transcriptionMetadata.duration) partialData.push(`Duration: ${transcriptionMetadata.duration.toFixed(2)}s`);
//       if (leadData.name) partialData.push(`Name (low confidence): ${leadData.name}`);
//       if (leadData.email) partialData.push(`Email (low confidence): ${leadData.email}`);
//       if (leadData.phone) partialData.push(`Phone (low confidence): ${leadData.phone}`);
//       if (leadData.company) partialData.push(`Company (low confidence): ${leadData.company}`);
//       if (leadData.interest) partialData.push(`Interest (low confidence): ${leadData.interest}`);

//       remarks = partialData.join(' | ');
//     } else {
//       logger.info('✅ High confidence - structured data extracted');
//     }

//     logger.info('🎉 Audio processing completed successfully', {
//       confidence: confidence.toFixed(3),
//       usedFallback: confidence < CONFIDENCE_THRESHOLD,
//       hasRemarks: !!remarks
//     });

//     return {
//       name: leadData.name,
//       email: leadData.email,
//       phone: leadData.phone,
//       company: leadData.company,
//       interest: leadData.interest,
//       transcript: transcriptionText,
//       source: audioUrl,
//       type: 'voice',
//       confidence: confidence,
//       remarks: remarks,
//       rawAudioUrl: rawAudioUrl,
//     };
//   } catch (error) {
//     logger.error('❌ Audio processing failed', {
//       error: error.message,
//       stack: error.stack,
//       originalName,
//       boothId
//     });
//     throw error;
//   } finally {
//     if (fs.existsSync(tempFilePath)) {
//       fs.unlinkSync(tempFilePath);
//       logger.debug('🗑️ Temporary file cleaned up', { tempFilePath });
//     }
//   }
// }

async function processAudioToLeadAsync({
  audioUrl,
  boothId,
  originalName,
  mimetype,
}) {
  const tempFilePath = path.join(
    os.tmpdir(),
    `async_${Date.now()}_${originalName}`
  );

  try {
    logger.info("🚀 Background audio processing started", {
      boothId,
      audioUrl,
    });

    const audioBuffer = await downloadAudioFromS3(audioUrl);
    await fs.promises.writeFile(tempFilePath, audioBuffer);

    // 🎧 Whisper (KEEP verbose_json)
    const transcription = await openai.audio.transcriptions.create({
      file: fs.createReadStream(tempFilePath),
      model: "whisper-1",
      response_format: "verbose_json",
      timestamp_granularities: ["word"],
    });

    const transcriptionText = transcription.text || "";

    const transcriptionMetadata = {
      duration: transcription.duration || 0,
      language: transcription.language || "unknown",
      segments: transcription.segments || [],
      words: transcription.words || [],
    };

    // 🤖 GPT extraction (KEEP schema)
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: `
You are an expert lead intelligence extraction system.

Your goal is MAXIMUM RECALL, not precision.
Extract ANY possible lead-related information, even if:
- The data is partial
- The spelling may be wrong
- The speaker sounds unsure
- The information is implied, not explicit

Rules:
- NEVER guess or hallucinate missing values
- If some information is detected, include it
- Use null ONLY if there is absolutely zero signal
- Prefer partial data over null
- Do not drop fields due to uncertainty

If multiple values appear for a field, choose the most complete one.

You MUST return a valid JSON object matching the schema.
`,
        },
        {
          role: "user",
          content: transcriptionText,
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: LEAD_SCHEMA,
      },
    });

    const leadData = JSON.parse(completion.choices[0].message.content);

    const confidence = calculateConfidence(
      leadData,
      transcriptionText,
      transcriptionMetadata
    );

    let remarks = null;
    if (confidence < CONFIDENCE_THRESHOLD) {
      remarks = buildFallbackRemarks(
        leadData,
        transcriptionText,
        transcriptionMetadata
      );
    }

    await saveLeadToDatabase({
      boothId,
      ...leadData,
      transcript: transcriptionText,
      confidence,
      remarks,
      source: audioUrl,
      type: "voice",
    });

    logger.info("✅ Background processing completed", {
      boothId,
      confidence,
    });
  } catch (error) {
    logger.error("❌ Background processing failed", {
      error: error.message,
      stack: error.stack,
      boothId,
    });
  } finally {
    if (fs.existsSync(tempFilePath)) {
      fs.unlinkSync(tempFilePath);
    }
  }
}

module.exports = { uploadAudioToS3, processAudioToLeadAsync };
