const OpenAI = require('openai');
const { PutObjectCommand } = require('@aws-sdk/client-s3');
const s3Client = require('../config/s3.config');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

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
 * Extract lead data from image using OpenAI Vision
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
 * Main function: Process image to lead data
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

    // 3. Return structured data
    return {
      boothId: boothId ? Number(boothId) : null,
      name: extractedData.name ?? null,
      email: extractedData.email ?? null,
      phone: extractedData.phone ?? null,
      company: extractedData.company ?? null,
      interest: extractedData.interest ?? null,
      ocrText: extractedData.ocrText ?? null,
      imageUrl: imageUrl
    };

  } catch (error) {
    console.error('OCR processing error:', error);
    throw new Error(`Failed to process business card: ${error.message}`);
  }
}

module.exports = { processImageToLead };
