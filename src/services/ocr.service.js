const OpenAI = require('openai');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3.config');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

// AI Confidence threshold for OCR
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
 * Upload image to S3
 */
async function uploadToS3(buffer, filename, mimetype) {
  const key = `business-cards/${Date.now()}_${sanitizeFilename(filename)}`;

  const command = new PutObjectCommand({
    Bucket: process.env.AWS_S3_BUCKET_NAME,
    Key: key,
    Body: buffer,
    ContentType: mimetype,
    ACL: 'public-read',
  });

  await s3Client.send(command);

  // Construct public URL
  const url = `https://${process.env.AWS_S3_BUCKET_NAME}.s3.${process.env.AWS_REGION}.amazonaws.com/${key}`;
  return url;
}

/**
 * Extract lead data from image using OpenAI Vision with improved prompt
 */
async function extractDataFromImage(imageBuffer) {
  const base64Image = imageBuffer.toString('base64');

  const completion = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a business card information extractor.
Extract all contact information from the business card image.
Extract as much information as possible, even if partial or unclear.
If you detect any text, names, or contact details, include them.
Return ONLY valid JSON with these exact keys:
name, email, phone, company, interest, ocrText

- name: Full name of the person
- email: Email address
- phone: Phone number
- company: Company name
- interest: Job title or role (if available)
- ocrText: All text extracted from the card

If any field is not found, use null.`
      },
      {
        role: "user",
        content: [
          {
            type: "image_url",
            image_url: {
              url: `data:image/jpeg;base64,${base64Image}`
            }
          },
          {
            type: "text",
            text: "Extract all contact information from this business card."
          }
        ]
      }
    ],
    response_format: { type: "json_object" },
    max_tokens: 1000
  });

  return JSON.parse(completion.choices[0].message.content);
}

/**
 * Calculate confidence score for OCR extraction
 */
function calculateOCRConfidence(extractedData) {
  let score = 0;
  let totalFields = 0;

  const fields = ['name', 'email', 'phone', 'company', 'interest'];
  fields.forEach(field => {
    totalFields++;
    if (extractedData[field] && extractedData[field].trim().length > 0) {
      score++;
    }
  });

  // Bonus for email format validation
  if (extractedData.email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(extractedData.email)) {
    score += 0.5;
  }

  // Check if OCR text is meaningful
  if (extractedData.ocrText && extractedData.ocrText.length < 10) {
    score -= 1;
  }

  const confidence = Math.max(0, Math.min(1, score / (totalFields + 0.5)));
  return confidence;
}

/**
 * Main function: Process image to lead data with AI fallback logic
 */
async function processImageToLead(imageBuffer, boothId, originalName) {
  try {
    // 1. Upload to S3 first
    const imageUrl = await uploadToS3(
      imageBuffer,
      originalName,
      'image/jpeg'
    );

    // 2. Extract data using OpenAI Vision
    const extractedData = await extractDataFromImage(imageBuffer);

    // 3. Calculate confidence score
    const confidence = calculateOCRConfidence(extractedData);

    // 4. AI Fallback Logic: If confidence is below threshold
    let remarks = null;
    if (confidence < CONFIDENCE_THRESHOLD) {
      // Store partial/low-confidence data in remarks field
      const partialData = [];
      if (extractedData.ocrText) partialData.push(`OCR Text: ${extractedData.ocrText}`);
      if (extractedData.name) partialData.push(`Name (low confidence): ${extractedData.name}`);
      if (extractedData.email) partialData.push(`Email (low confidence): ${extractedData.email}`);
      if (extractedData.phone) partialData.push(`Phone (low confidence): ${extractedData.phone}`);
      if (extractedData.company) partialData.push(`Company (low confidence): ${extractedData.company}`);
      if (extractedData.interest) partialData.push(`Interest (low confidence): ${extractedData.interest}`);
      
      remarks = partialData.join(' | ');
    }

    // 5. Return structured data
    return {
      boothId: boothId ? Number(boothId) : null,
      name: extractedData.name ?? null,
      email: extractedData.email ?? null,
      phone: extractedData.phone ?? null,
      company: extractedData.company ?? null,
      interest: extractedData.interest ?? null,
      ocrText: extractedData.ocrText ?? null,
      source: imageUrl,
      type: 'image',
      confidence: confidence,
      remarks: remarks
    };

  } catch (error) {
    console.error('OCR processing error:', error);
    throw new Error(`Failed to process business card: ${error.message}`);
  }
}

module.exports = { processImageToLead };
