# VoiceLead Backend - Voice-to-CRM Lead Capture System

Node.js/Express backend for VoiceLead - an AI-powered lead capture system that processes voice recordings and business card images from trade show booths, automatically extracting contact information using OpenAI's Whisper and GPT-4o models with intelligent AI fallback logic.

## 🎯 Features

### Core Functionality
- **🎤 Voice Processing**: Upload audio files and automatically transcribe + extract lead information
- **📷 Business Card OCR**: Scan business cards and extract contact details with AI vision
- **🔒 JWT Authentication**: Secure user signup and login
- **🏢 Booth Management**: Create and manage event booths (one per user for MVP)
- **👤 Lead Management**: Capture, view, and manage leads with multiple input methods

### AI Features
- **🤖 AI Fallback Logic**: Confidence threshold (60%) with automatic fallback for low-quality input
- **📊 Confidence Scoring**: Real-time quality assessment using Whisper metadata
- **💾 Data Preservation**: Partial/unclear data saved to remarks field - zero data loss
- **⏱️ 7-Day Audio Retention**: Temporary raw audio storage for recovery/debugging

### Technical Stack
- **Backend**: Node.js, Express.js, Prisma ORM
- **Database**: PostgreSQL (Neon Tech)
- **AI**: OpenAI Whisper (transcription), GPT-4o (extraction), GPT-4o Vision (OCR)
- **Storage**: AWS S3 (audio files, business card images)
- **Deployment**: Fly.io

## 📋 Prerequisites

- **Node.js** v18 or higher
- **PostgreSQL** database (or Neon Tech account)
- **OpenAI API Key** (with GPT-4o and Whisper access)
- **AWS Account** (S3 bucket configured)
- **Fly.io Account** (for deployment)

## 🚀 Installation

### 1. Clone and Install Dependencies

```bash
git clone <repository-url>
cd Voicelead_backend
pnpm install
```

### 2. Environment Configuration

Create a `.env` file in the root directory:

```env
# Database
DATABASE_URL="postgresql://user:password@host:5432/database?sslmode=require"

# Authentication
JWT_SECRET="your-super-secret-jwt-key-change-this"

# OpenAI
OPENAI_API_KEY="sk-..."

# AWS S3
AWS_ACCESS_KEY_ID="your-access-key"
AWS_SECRET_ACCESS_KEY="your-secret-key"
AWS_REGION="us-east-1"
AWS_S3_BUCKET_NAME="your-bucket-name"
```

### 3. Database Setup

```bash
# Generate Prisma client
npx prisma generate

# Run migrations
pnpm run migrate

# Or for production deployment
pnpm run migrate:deploy
```

## 💻 Running the Server

### Development Mode (with auto-reload)
```bash
pnpm run dev
```

### Production Mode
```bash
pnpm start
```

Server runs on `http://localhost:3000` (or PORT from environment)

## 🧪 Testing

### Audio Processing Test
Test voice transcription, confidence scoring, and AI fallback:

```bash
# Test specific audio file
pnpm run test:audio path/to/audio.mp3

# Test all files in src/tests/fixtures/
pnpm run test:audio
```

**Supported formats**: .mp3, .wav, .m4a, .webm, .ogg

### Business Card OCR Test
Test image processing and contact extraction:

```bash
# Test specific image file
pnpm run test:image path/to/business-card.jpg

# Test all files in src/tests/fixtures/
pnpm run test:image
```

**Supported formats**: .jpg, .jpeg, .png, .webp

### Test Output
Both tests generate detailed reports in `src/tests/output/`:
- **JSON files**: Machine-readable data with all metrics
- **Markdown files**: Human-readable reports with analysis and recommendations

### Adding Test Files
1. Create directory: `src/tests/fixtures/`
2. Add audio files or business card images
3. Run tests to generate reports

## 📡 API Endpoints

### Authentication

#### Sign Up
```http
POST /auth/signup
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123",
  "name": "John Doe"
}
```

**Response:**
```json
{
  "user": {
    "id": "uuid",
    "email": "user@example.com",
    "name": "John Doe"
  },
  "token": "jwt-token..."
}
```

#### Login
```http
POST /auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "securePassword123"
}
```

**Response:**
```json
{
  "user": { "id": "uuid", "email": "...", "name": "..." },
  "token": "jwt-token..."
}
```

### Booth Management

#### Create Booth
```http
POST /booths
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "Main Booth",
  "event": "TechConf 2025",
  "location": "Hall A"
}
```

#### Get All Booths
```http
GET /booths
Authorization: Bearer <token>
```

**Response:**
```json
{
  "booths": [
    {
      "id": 1,
      "name": "Main Booth",
      "event": "TechConf 2025",
      "location": "Hall A",
      "createdAt": "2025-01-03T...",
      "userId": "uuid"
    }
  ]
}
```

### Lead Capture & Processing

#### Process Audio (Voice Recording)
```http
POST /leads/process-audio
Authorization: Bearer <token>
Content-Type: multipart/form-data

audio: (binary file - mp3, wav, m4a, webm, ogg)
boothId: 1
```

**Response (High Confidence):**
```json
{
  "success": true,
  "lead": {
    "id": 1,
    "name": "Jane Smith",
    "email": "jane@example.com",
    "phone": "+1234567890",
    "company": "Acme Corp",
    "designation": "CTO",
    "source": "https://s3.amazonaws.com/bucket/voice-recordings/...",
    "type": "voice",
    "confidence": 0.85,
    "rawAudioUrl": "https://s3.amazonaws.com/bucket/voice-recordings/temp/...",
    "captureMode": "audio",
    "boothId": 1
  },
  "confidence": 0.85,
  "usedAIFallback": false
}
```

**Response (Low Confidence - AI Fallback):**
```json
{
  "success": true,
  "lead": {
    "id": 2,
    "name": null,
    "email": null,
    "phone": null,
    "company": null,
    "designation": null,
    "source": "https://s3.amazonaws.com/bucket/voice-recordings/...",
    "type": "voice",
    "confidence": 0.45,
    "remarks": "Hi my name is [unclear] from... company... reach me at...",
    "rawAudioUrl": "https://s3.amazonaws.com/bucket/voice-recordings/temp/...",
    "captureMode": "audio",
    "boothId": 1
  },
  "confidence": 0.45,
  "usedAIFallback": true,
  "fallbackReason": "Low confidence score (below 0.6 threshold)"
}
```

#### Process Image (Business Card Scan)
```http
POST /leads/capture
Authorization: Bearer <token>
Content-Type: multipart/form-data

image: (binary file - jpg, png, webp)
boothId: 1
type: image
```

**Processing handled by GPT-4o Vision with confidence scoring and fallback logic.**

#### Manual Lead Entry
```http
POST /leads/capture
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "John Smith",
  "email": "john@example.com",
  "phone": "+1234567890",
  "company": "Tech Inc",
  "designation": "CEO",
  "boothId": 1,
  "type": "manual",
  "captureMode": "manual"
}
```

#### Get All Leads
```http
GET /leads
Authorization: Bearer <token>
```

## 🤖 AI Processing Details

### Confidence Scoring System

The system uses a sophisticated confidence scoring mechanism based on OpenAI Whisper metadata:

**Factors Considered:**
- ✅ **Field Presence** (+1.0 per field): name, email, phone, company, designation
- ✅ **Email Validation** (+0.5): Valid email format
- ⚠️ **Audio Duration** (-0.5): Penalize very short recordings (<2 seconds)
- ✅ **Segment Quality** (+0.3): High-quality transcription segments
- ✅ **Speech Pace** (+0.2): Natural speaking rate (100-200 words per minute)
- ⚠️ **Text Length** (-1.0): Penalize very short transcriptions (<20 characters)

**Confidence Threshold:** 0.6 (60%)
- **Above threshold**: Extract structured data to fields
- **Below threshold**: Save full transcription to `remarks` field

### Audio Storage Strategy

**Permanent Storage** (`voice-recordings/`):
- High-quality audio files
- Permanent retention
- Linked via `source` field

**Temporary Storage** (`voice-recordings/temp/`):
- Raw audio for debugging/recovery
- 7-day retention (S3 lifecycle policy)
- Linked via `rawAudioUrl` field
- Auto-deleted after expiration

### Whisper API Configuration

```javascript
{
  model: "whisper-1",
  response_format: "verbose_json",
  timestamp_granularities: ["word"],
  language: "en"
}
```

Returns detailed metadata including:
- Duration
- Language detection
- Segment breakdown with timestamps
- Word-level timestamps
- Text content

## 🗄️ Database Schema

### Lead Model
```prisma
model Lead {
  id           Int       @id @default(autoincrement())
  name         String?
  email        String?
  phone        String?
  company      String?
  designation  String?
  source       String?   // Voice recording or image URL
  type         String?   // 'voice' | 'image' | 'manual'
  confidence   Float?    // 0.0 to 1.0
  remarks      String?   @db.Text // AI fallback field
  rawAudioUrl  String?   // 7-day temporary storage
  ocrText      String?   @db.Text // For image captures
  captureMode  String?   // 'audio' | 'image' | 'manual'
  boothId      Int
  booth        Booth     @relation(fields: [boothId], references: [id])
  createdAt    DateTime  @default(now())
}
```

### Booth Model
```prisma
model Booth {
  id        Int      @id @default(autoincrement())
  name      String
  event     String?
  location  String?
  userId    String
  user      User     @relation(fields: [userId], references: [id])
  leads     Lead[]
  createdAt DateTime @default(now())
}
```

### User Model
```prisma
model User {
  id       String  @id @default(uuid())
  email    String  @unique
  password String
  name     String
  booths   Booth[]
}
```

## 🚀 Deployment (Fly.io)

### Initial Setup

1. **Install Fly.io CLI**
```bash
# Windows (PowerShell)
iwr https://fly.io/install.ps1 -useb | iex

# macOS/Linux
curl -L https://fly.io/install.sh | sh
```

2. **Login to Fly.io**
```bash
fly auth login
```

3. **Create New App**
```bash
fly apps create voicelead-backend
```

### Configure Secrets

Set environment variables securely:

```bash
fly secrets set DATABASE_URL="postgresql://..." \
  JWT_SECRET="your-secret" \
  OPENAI_API_KEY="sk-..." \
  AWS_ACCESS_KEY_ID="..." \
  AWS_SECRET_ACCESS_KEY="..." \
  AWS_REGION="us-east-1" \
  AWS_S3_BUCKET_NAME="your-bucket"
```

Or use the PowerShell script:

```powershell
# Edit push-secrets.ps1 with your values
.\push-secrets.ps1
```

### Deploy Application

```bash
# First deployment
fly deploy

# Subsequent deployments
fly deploy
```

### Run Database Migrations

After deployment, run migrations:

```bash
fly ssh console -C "npm run migrate:deploy"
```

### Monitor Application

```bash
# View logs
fly logs

# Check app status
fly status

# Open in browser
fly open

# SSH into instance
fly ssh console
```

### Scaling

```bash
# Scale to 2 instances
fly scale count 2

# Scale VM size
fly scale vm shared-cpu-1x
```

### Useful Fly.io Commands

```bash
fly status              # Check app health
fly logs                # Stream logs
fly secrets list        # List secret names
fly ssh console         # SSH into instance
fly deploy --ha=false   # Deploy single instance
fly apps restart        # Restart application
fly postgres connect    # Connect to Fly Postgres (if using)
```

## 🛠️ Available Scripts

```bash
# Development
pnpm run dev            # Start with nodemon (auto-reload)
pnpm start              # Production server

# Database
pnpm run migrate        # Create and apply migration
pnpm run migrate:deploy # Apply migrations (production)
npx prisma studio       # Open Prisma Studio GUI
npx prisma generate     # Regenerate Prisma client

# Testing
pnpm run test:audio     # Test audio processing
pnpm run test:image     # Test image OCR

# Deployment
fly deploy              # Deploy to Fly.io
fly logs                # View deployment logs
```

## 📁 Project Structure

```
Voicelead_backend/
├── src/
│   ├── index.js                    # Express app entry point
│   ├── config/
│   │   └── s3.config.js           # AWS S3 client configuration
│   ├── controllers/
│   │   ├── auth.controller.js     # Signup/login handlers
│   │   └── booth.controller.js    # Booth CRUD handlers
│   ├── services/
│   │   ├── audio.service.js       # Whisper + GPT-4o processing
│   │   └── ocr.service.js         # GPT-4o Vision processing
│   ├── middleware/
│   │   └── auth.middleware.js     # JWT verification
│   ├── routes/
│   │   ├── auth.routes.js         # Auth endpoints
│   │   ├── booth.routes.js        # Booth endpoints
│   │   └── lead.routes.js         # Lead processing endpoints
│   ├── lib/
│   │   └── prisma.js              # Prisma client instance
│   └── tests/
│       ├── audio-test-runner.js   # Audio processing test
│       ├── image-test-runner.js   # Image OCR test
│       ├── fixtures/              # Test audio/image files
│       └── output/                # Test reports (JSON + MD)
├── prisma/
│   ├── schema.prisma              # Database schema
│   └── migrations/                # Migration history
├── .env                           # Environment variables (gitignored)
├── .gitignore                     # Git exclusions
├── Dockerfile                     # Container configuration
├── fly.toml                       # Fly.io deployment config
├── package.json                   # Dependencies and scripts
├── pnpm-lock.yaml                 # Lock file
├── push-secrets.ps1               # Fly.io secrets helper
└── README.md                      # This file
```

## 🐛 Troubleshooting

### Database Issues

**Problem:** `Can't reach database server`
```bash
# Check DATABASE_URL format
echo $DATABASE_URL
# Should be: postgresql://user:pass@host:5432/db?sslmode=require

# Test connection
npx prisma db pull
```

**Problem:** Migration errors
```bash
# Reset database (DEV ONLY - destroys data!)
npx prisma migrate reset

# Create new migration
pnpm run migrate
```

### OpenAI API Issues

**Problem:** `Insufficient quota` or `401 Unauthorized`
- Check API key validity at https://platform.openai.com/api-keys
- Verify billing and usage limits
- Ensure GPT-4o and Whisper models are accessible

**Problem:** Transcription quality is poor
- Check audio quality (clear speech, minimal background noise)
- Ensure audio is at least 2 seconds long
- Supported formats: mp3, wav, m4a, webm, ogg
- Check confidence score in response (below 0.6 triggers fallback)

### AWS S3 Issues

**Problem:** `Access Denied` or upload failures
```bash
# Verify credentials
aws s3 ls s3://your-bucket-name --profile default

# Check bucket policy allows uploads
# Ensure IAM user has s3:PutObject permission
```

**Problem:** Temporary files not auto-deleting
- Check S3 bucket lifecycle rules for `voice-recordings/temp/` prefix
- Should have 7-day expiration configured

### Authentication Issues

**Problem:** `Token expired` or `Invalid token`
- JWT tokens don't expire in current implementation
- Check Authorization header format: `Bearer <token>`
- Ensure JWT_SECRET matches between environments

### Test Runner Issues

**Problem:** `Cannot find module` errors
```bash
# Reinstall dependencies
pnpm install

# Check for form-data and axios
pnpm list form-data axios
```

**Problem:** No test reports generated
- Ensure `src/tests/output/` directory exists (auto-created)
- Check file permissions
- Verify test files are in `src/tests/fixtures/`

### Deployment Issues

**Problem:** Fly.io deployment fails
```bash
# Check logs
fly logs

# Verify secrets are set
fly secrets list

# Ensure Dockerfile is valid
docker build -t test .
```

**Problem:** Database migrations fail on Fly.io
```bash
# SSH and run manually
fly ssh console
npm run migrate:deploy
```

## 📝 Notes

- **MVP Limitation**: One booth per user currently
- **Audio Retention**: Raw audio auto-deleted after 7 days
- **No Data Loss**: Low-confidence captures saved to `remarks` field
- **Rate Limits**: OpenAI API has rate limits - implement queuing for high volume

## 🤝 Contributing

1. Create feature branch: `git checkout -b feature/new-feature`
2. Make changes and test thoroughly
3. Run tests: `pnpm run test:audio && pnpm run test:image`
4. Commit: `git commit -m "Add new feature"`
5. Push: `git push origin feature/new-feature`
6. Create Pull Request

## 📄 License

MIT License - see LICENSE file for details

---

**Built with ❤️ for VoiceLead - Making trade show lead capture effortless**
