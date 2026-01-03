/**
 * Audio Processing Test Runner
 * Tests audio transcription, confidence scoring, and AI fallback logic
 * 
 * Usage: 
 *   npm run test:audio [audio-file-path]
 *   or place files in src/tests/fixtures/ and run without arguments
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { processAudioToLead } = require('../services/audio.service');

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
 * Get MIME type from filename
 */
function getMimeType(filename) {
  const ext = path.extname(filename).toLowerCase();
  const mimeTypes = {
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.m4a': 'audio/m4a',
    '.webm': 'audio/webm',
    '.ogg': 'audio/ogg',
  };
  return mimeTypes[ext] || 'application/octet-stream';
}

/**
 * Process a single audio file and generate reports
 */
async function processAudioFile(audioPath) {
  const filename = path.basename(audioPath);
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const baseOutputName = `${path.parse(filename).name}_${timestamp}`;
  
  console.log('\n' + '='.repeat(70));
  console.log(`Processing: ${filename}`);
  console.log('='.repeat(70));

  try {
    // Read audio file
    const audioBuffer = fs.readFileSync(audioPath);
    const mimetype = getMimeType(filename);
    const fileSizeKB = (audioBuffer.length / 1024).toFixed(2);
    
    console.log(`File size: ${fileSizeKB} KB`);
    console.log(`MIME type: ${mimetype}`);
    console.log('\nProcessing audio with OpenAI Whisper...');

    // Process audio
    const startTime = Date.now();
    const result = await processAudioToLead(
      audioBuffer,
      'test-booth-id',
      filename,
      mimetype
    );
    const processingTime = ((Date.now() - startTime) / 1000).toFixed(2);

    console.log(`✅ Processing completed in ${processingTime}s`);
    console.log(`Confidence Score: ${(result.confidence * 100).toFixed(1)}%`);

    // Prepare detailed results
    const detailedResults = {
      metadata: {
        filename: filename,
        fileSizeKB: fileSizeKB,
        mimetype: mimetype,
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
      transcription: {
        text: result.transcript,
        length: result.transcript ? result.transcript.length : 0,
        wordCount: result.transcript ? result.transcript.split(/\s+/).length : 0,
      },
      fallbackInfo: {
        triggered: !!result.remarks,
        remarks: result.remarks,
      },
      storage: {
        permanentAudioUrl: result.source,
        temporaryAudioUrl: result.rawAudioUrl,
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
    console.log(`Transcription: ${detailedResults.transcription.wordCount} words, ${detailedResults.transcription.length} characters`);
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
  const { metadata, confidenceScore, extractedData, transcription, fallbackInfo, storage } = results;
  
  return `# Audio Processing Test Report

## File Information

| Property | Value |
|----------|-------|
| **Filename** | ${metadata.filename} |
| **File Size** | ${metadata.fileSizeKB} KB |
| **MIME Type** | ${metadata.mimetype} |
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

## Transcription

**Word Count:** ${transcription.wordCount} words  
**Character Count:** ${transcription.length} characters

### Full Transcript:
\`\`\`
${transcription.text || '(No transcription available)'}
\`\`\`

${fallbackInfo.triggered ? `## AI Fallback Information

**Fallback Triggered:** Yes

### Remarks (Low Confidence Data):
\`\`\`
${fallbackInfo.remarks}
\`\`\`

This data has been preserved in the remarks field due to low confidence score. The system detected partial or unclear information that may still be useful for manual review.
` : ''}

## Storage Information

| Property | Value |
|----------|-------|
| **Type** | ${storage.type} |
| **Permanent URL** | ${storage.permanentAudioUrl ? `[View Audio](${storage.permanentAudioUrl})` : '*Not uploaded*'} |
| **Temporary URL (7 days)** | ${storage.temporaryAudioUrl ? `[View Raw Audio](${storage.temporaryAudioUrl})` : '*Not uploaded*'} |

## Analysis

### Confidence Factors

The confidence score is calculated based on:
- ✅ Presence of contact fields (name, email, phone, company, interest)
- ✅ Email format validation
- ✅ Transcription quality and length
- ✅ Audio duration (from Whisper metadata)
- ✅ Segment quality analysis
- ✅ Speech pace validation

### Data Quality Assessment

${generateQualityAssessment(results)}

---

*Generated by VoiceLead Audio Test Runner*  
*Timestamp: ${new Date().toISOString()}*
`;
}

/**
 * Generate quality assessment text
 */
function generateQualityAssessment(results) {
  const { confidenceScore, extractedData, transcription } = results;
  const fieldsCount = Object.values(extractedData).filter(v => v).length;
  
  let assessment = '';
  
  if (confidenceScore.value >= 0.8) {
    assessment = '**Excellent Quality** - High confidence with most or all fields extracted. This audio recording was clear and contained comprehensive contact information.';
  } else if (confidenceScore.value >= 0.6) {
    assessment = '**Good Quality** - Acceptable confidence level. Some contact information was successfully extracted. The audio quality was sufficient for basic lead capture.';
  } else if (confidenceScore.value >= 0.4) {
    assessment = '**Moderate Quality** - Below confidence threshold. Partial information detected but may be incomplete or unclear. AI fallback has been triggered to preserve available data.';
  } else {
    assessment = '**Poor Quality** - Low confidence score. Minimal information could be extracted. This may indicate very short audio, poor recording quality, or lack of contact information in the speech. All available data has been preserved in the remarks field.';
  }
  
  assessment += '\n\n**Recommendations:**\n';
  
  if (fieldsCount < 3) {
    assessment += '- Consider requesting clearer audio recordings\n';
    assessment += '- Ensure speakers mention all relevant contact details\n';
  }
  
  if (transcription.length < 50) {
    assessment += '- Audio appears very short - encourage longer, more detailed recordings\n';
  }
  
  if (!extractedData.email && !extractedData.phone) {
    assessment += '- ⚠️ **Critical:** No contact method detected - cannot follow up with this lead\n';
  }
  
  return assessment;
}

/**
 * Main runner
 */
async function run() {
  console.log('🎤 VoiceLead Audio Test Runner\n');
  
  ensureOutputDir();
  
  // Check for command line argument
  const audioFilePath = process.argv[2];
  
  if (audioFilePath) {
    // Process single file
    if (!fs.existsSync(audioFilePath)) {
      console.error(`❌ Error: File not found: ${audioFilePath}`);
      process.exit(1);
    }
    
    await processAudioFile(audioFilePath);
    
  } else {
    // Process all files in fixtures folder
    const fixturesDir = path.join(__dirname, 'fixtures');
    
    if (!fs.existsSync(fixturesDir)) {
      console.error('❌ Error: Fixtures directory not found');
      console.log('\nUsage:');
      console.log('  node src/tests/audio-test-runner.js <audio-file-path>');
      console.log('  or add audio files to: src/tests/fixtures/');
      process.exit(1);
    }
    
    const audioFiles = fs.readdirSync(fixturesDir)
      .filter(f => /\.(mp3|wav|m4a|webm|ogg)$/i.test(f));
    
    if (audioFiles.length === 0) {
      console.log('⚠️  No audio files found in fixtures directory');
      console.log('\nAdd audio files to: src/tests/fixtures/');
      console.log('Supported formats: .mp3, .wav, .m4a, .webm, .ogg');
      process.exit(0);
    }
    
    console.log(`Found ${audioFiles.length} audio file(s) to process\n`);
    
    const results = [];
    for (const audioFile of audioFiles) {
      try {
        const audioPath = path.join(fixturesDir, audioFile);
        const result = await processAudioFile(audioPath);
        results.push({ success: true, filename: audioFile, result });
      } catch (error) {
        results.push({ success: false, filename: audioFile, error: error.message });
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

module.exports = { processAudioFile, run };
