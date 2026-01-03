/**
 * Image/Business Card Processing Test Runner
 * Tests OCR extraction, confidence scoring, and AI fallback logic
 * 
 * Usage: 
 *   npm run test:image [image-file-path]
 *   or place files in src/tests/fixtures/ and run without arguments
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { processImageToLead } = require('../services/ocr.service');

// Output directory for results
const OUTPUT_DIR = path.join(__dirname, 'output');

/**
 * Ensure output directory exists
 */
function ensureOutputDir() {
  if (!fs.existsSync(OUTPUT_DIR)) {
    fs.mkdirSync(OUTPUT_DIR, { recursive: true });
  }
}

/**
 * Process a single image file and generate reports
 */
async function processImageFile(imagePath) {
  const filename = path.basename(imagePath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseOutputName = `${path.parse(filename).name}_${timestamp}`;
  
  console.log('\n' + '='.repeat(70));
  console.log(`Processing: ${filename}`);
  console.log('='.repeat(70));

  try {
    // Read image file
    const imageBuffer = fs.readFileSync(imagePath);
    const fileSizeKB = (imageBuffer.length / 1024).toFixed(2);
    
    console.log(`File size: ${fileSizeKB} KB`);
    console.log('\nProcessing image with OpenAI Vision...');

    // Process image
    const startTime = Date.now();
    const result = await processImageToLead(
      imageBuffer,
      'test-booth-id',
      filename
    );
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Processing completed in ${processingTime}s`);
    console.log(`Confidence Score: ${(result.confidence * 100).toFixed(1)}%`);

    // Prepare detailed results
    const detailedResults = {
      metadata: {
        filename: filename,
        fileSizeKB: fileSizeKB,
        processedAt: new Date().toISOString(),
        processingTimeSeconds: parseFloat(processingTime),
      },
      confidenceScore: {
        value: result.confidence,
        percentage: `${(result.confidence * 100).toFixed(1)}%`,
        threshold: 0.6,
        status: result.confidence >= 0.6 ? 'HIGH_CONFIDENCE' : 'LOW_CONFIDENCE_FALLBACK',
      },
      extractedData: {
        name: result.name,
        email: result.email,
        phone: result.phone,
        company: result.company,
        interest: result.interest,
      },
      ocrText: {
        fullText: result.ocrText,
        length: result.ocrText ? result.ocrText.length : 0,
      },
      fallbackInfo: {
        triggered: !!result.remarks,
        remarks: result.remarks,
      },
      storage: {
        imageUrl: result.source,
        type: result.type,
      },
    };

    // Save JSON report
    const jsonPath = path.join(OUTPUT_DIR, `${baseOutputName}.json`);
    fs.writeFileSync(jsonPath, JSON.stringify(detailedResults, null, 2));
    console.log(`\n📄 JSON report saved: ${jsonPath}`);

    // Generate and save Markdown report
    const markdown = generateMarkdownReport(detailedResults);
    const mdPath = path.join(OUTPUT_DIR, `${baseOutputName}.md`);
    fs.writeFileSync(mdPath, markdown);
    console.log(`📄 Markdown report saved: ${mdPath}`);

    // Display summary
    console.log('\n' + '='.repeat(70));
    console.log('SUMMARY');
    console.log('='.repeat(70));
    console.log(`Confidence: ${detailedResults.confidenceScore.percentage} (${detailedResults.confidenceScore.status})`);
    console.log(`OCR Text Length: ${detailedResults.ocrText.length} characters`);
    console.log(`Extracted Fields: ${Object.values(detailedResults.extractedData).filter(v => v).length}/5`);
    
    if (detailedResults.fallbackInfo.triggered) {
      console.log(`\n⚠️  FALLBACK TRIGGERED - Low confidence data stored in remarks`);
    } else {
      console.log(`\n✅ HIGH CONFIDENCE - Data extracted successfully`);
    }

    return detailedResults;

  } catch (error) {
    console.error(`\n❌ Error processing ${filename}:`, error.message);
    console.error(error.stack);
    
    // Save error report
    const errorReport = {
      error: {
        message: error.message,
        stack: error.stack,
      },
      metadata: {
        filename: filename,
        processedAt: new Date().toISOString(),
      },
    };
    
    const errorPath = path.join(OUTPUT_DIR, `${baseOutputName}_ERROR.json`);
    fs.writeFileSync(errorPath, JSON.stringify(errorReport, null, 2));
    console.log(`Error report saved: ${errorPath}`);
    
    throw error;
  }
}

/**
 * Generate Markdown report
 */
function generateMarkdownReport(results) {
  const { metadata, confidenceScore, extractedData, ocrText, fallbackInfo, storage } = results;
  
  return `# Business Card OCR Test Report

## File Information

| Property | Value |
|----------|-------|
| **Filename** | ${metadata.filename} |
| **File Size** | ${metadata.fileSizeKB} KB |
| **Processed At** | ${metadata.processedAt} |
| **Processing Time** | ${metadata.processingTimeSeconds}s |

## Confidence Score

| Metric | Value |
|--------|-------|
| **Score** | ${confidenceScore.percentage} |
| **Raw Value** | ${confidenceScore.value.toFixed(4)} |
| **Threshold** | ${confidenceScore.threshold} |
| **Status** | **${confidenceScore.status}** |

${confidenceScore.status === 'LOW_CONFIDENCE_FALLBACK' 
  ? '⚠️ **AI Fallback Triggered** - Confidence below threshold. Partial data saved to remarks field.\n' 
  : '✅ **High Confidence** - Data extraction successful.\n'}

## Extracted Contact Information

| Field | Value | Status |
|-------|-------|--------|
| **Name** | ${extractedData.name || '*(not detected)*'} | ${extractedData.name ? '✅' : '❌'} |
| **Email** | ${extractedData.email || '*(not detected)*'} | ${extractedData.email ? '✅' : '❌'} |
| **Phone** | ${extractedData.phone || '*(not detected)*'} | ${extractedData.phone ? '✅' : '❌'} |
| **Company** | ${extractedData.company || '*(not detected)*'} | ${extractedData.company ? '✅' : '❌'} |
| **Interest** | ${extractedData.interest || '*(not detected)*'} | ${extractedData.interest ? '✅' : '❌'} |

**Fields Extracted:** ${Object.values(extractedData).filter(v => v).length} / 5

## OCR Full Text

**Character Count:** ${ocrText.length} characters

\`\`\`
${ocrText.fullText || '(No text extracted)'}
\`\`\`

${fallbackInfo.triggered ? `## AI Fallback Information

**Fallback Triggered:** Yes

### Remarks (Low Confidence Data):
\`\`\`
${fallbackInfo.remarks}
\`\`\`

This data has been preserved in the remarks field due to low confidence score.
` : ''}

## Storage Information

| Property | Value |
|----------|-------|
| **Type** | ${storage.type} |
| **Image URL** | ${storage.imageUrl ? `[View Image](${storage.imageUrl})` : '*Not uploaded*'} |

## Analysis

### Quality Assessment

${generateQualityAssessment(results)}

---

*Generated by VoiceLead Image Test Runner*  
*Timestamp: ${new Date().toISOString()}*
`;
}

/**
 * Generate quality assessment text
 */
function generateQualityAssessment(results) {
  const { confidenceScore, extractedData } = results;
  const fieldsCount = Object.values(extractedData).filter(v => v).length;
  
  let assessment = '';
  
  if (confidenceScore.value >= 0.8) {
    assessment = '**Excellent Quality** - High confidence OCR extraction. Business card was clear and readable.';
  } else if (confidenceScore.value >= 0.6) {
    assessment = '**Good Quality** - Acceptable confidence level. Most information was extracted successfully.';
  } else if (confidenceScore.value >= 0.4) {
    assessment = '**Moderate Quality** - Below confidence threshold. Partial information detected. AI fallback triggered.';
  } else {
    assessment = '**Poor Quality** - Low confidence. Image may be blurry, incomplete, or not a business card.';
  }
  
  assessment += '\n\n**Recommendations:**\n';
  
  if (fieldsCount < 3) {
    assessment += '- Consider using higher quality images\n';
    assessment += '- Ensure business card is well-lit and in focus\n';
  }
  
  if (!extractedData.email && !extractedData.phone) {
    assessment += '- ⚠️ **Critical:** No contact method detected\n';
  }
  
  return assessment;
}

/**
 * Main runner
 */
async function run() {
  console.log('📷 VoiceLead Image/Business Card Test Runner\n');
  
  ensureOutputDir();
  
  // Check for command line argument
  const imageFilePath = process.argv[2];
  
  if (imageFilePath) {
    // Process single file
    if (!fs.existsSync(imageFilePath)) {
      console.error(`❌ Error: File not found: ${imageFilePath}`);
      process.exit(1);
    }
    
    await processImageFile(imageFilePath);
    
  } else {
    // Process all files in fixtures folder
    const fixturesDir = path.join(__dirname, 'fixtures');
    
    if (!fs.existsSync(fixturesDir)) {
      console.error('❌ Error: Fixtures directory not found');
      console.log('\nUsage:');
      console.log('  npm run test:image <image-file-path>');
      console.log('  or add image files to: src/tests/fixtures/');
      process.exit(1);
    }
    
    const imageFiles = fs.readdirSync(fixturesDir)
      .filter(f => /\.(jpg|jpeg|png|webp)$/i.test(f));
    
    if (imageFiles.length === 0) {
      console.log('⚠️  No image files found in fixtures directory');
      console.log('\nAdd business card images to: src/tests/fixtures/');
      console.log('Supported formats: .jpg, .jpeg, .png, .webp');
      process.exit(0);
    }
    
    console.log(`Found ${imageFiles.length} image file(s) to process\n`);
    
    const results = [];
    for (const imageFile of imageFiles) {
      try {
        const imagePath = path.join(fixturesDir, imageFile);
        const result = await processImageFile(imagePath);
        results.push({ success: true, filename: imageFile, result });
      } catch (error) {
        results.push({ success: false, filename: imageFile, error: error.message });
      }
    }
    
    // Generate summary report
    console.log('\n' + '='.repeat(70));
    console.log('BATCH PROCESSING SUMMARY');
    console.log('='.repeat(70));
    console.log(`Total Files: ${results.length}`);
    console.log(`Successful: ${results.filter(r => r.success).length}`);
    console.log(`Failed: ${results.filter(r => !r.success).length}`);
    
    const summaryPath = path.join(OUTPUT_DIR, `batch_summary_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(summaryPath, JSON.stringify(results, null, 2));
    console.log(`\n📄 Batch summary saved: ${summaryPath}`);
  }
  
  console.log('\n✅ Processing complete!');
  console.log(`📁 Results saved to: ${OUTPUT_DIR}`);
}

// Run if executed directly
if (require.main === module) {
  run().catch(error => {
    console.error('\n❌ Fatal error:', error);
    process.exit(1);
  });
}

module.exports = { processImageFile, run };
