# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Holiday Park Monitor - A monorepo for monitoring Holiday Park vacation availabilities with three main components:
- **apps/api**: Express.js API service deployed to Google Cloud Run
- **apps/web**: Next.js web application deployed to Vercel  
- **apps/cli**: Local CLI tool for searching from laptop
- **packages/shared**: Shared TypeScript types

## Common Commands

### Development
```bash
# Run all services (API + Web)
npm run dev

# Run specific services
npm run api:dev   # API on port 8080
npm run web:dev   # Web on port 3000

# CLI development
cd apps/cli && npm run dev
```

### Building
```bash
# Build all packages
npm run build

# Build specific packages
npm run api:build
npm run web:build
cd apps/cli && npm run build
```

### Linting
```bash
# Lint all packages
npm run lint

# Lint CLI specifically
cd apps/cli && npm run lint
```

### CLI Usage
```bash
# From apps/cli directory
./hp search --interactive    # Interactive search
./hp list                    # List saved searches
./hp monitor --once          # Run searches once
./hp monitor -i 30           # Monitor every 30 minutes
```

## Architecture

### System Design
- **Web App (Vercel)** → **API (Cloud Run)** → **Holiday Park API**
- **Firebase Services**: Firestore (data), Cloud Scheduler (cron)
- **CLI**: Standalone tool with local SQLite storage

### Key Services

#### API (apps/api/src/services/)
- `holiday-park-client.ts`: Manages cookies, sessions, and API calls to Holiday Park
- `search-executor.ts`: Orchestrates search execution with rate limiting
- `rate-limiter.ts`: Adaptive rate limiting with jitter and backoff
- `notification-service.ts`: Email notifications via nodemailer
- `firebase-admin.ts`: Firestore data operations

#### CLI (apps/cli/src/services/)
- `holiday-park-client.ts`: Local version without Firebase dependencies
- `storage.ts`: SQLite persistence layer
- `search-executor.ts`: Local search execution with progress tracking
- `notifier.ts`: Console and system notifications

### Rate Limiting Strategy
The system uses sophisticated rate limiting to avoid being blocked:
- Configurable min/max delays (1-3 seconds default)
- Random jitter to avoid patterns
- Exponential backoff on failures
- Concurrency limits (2 searches, 1 API call in parallel)
- Adaptive mode based on response times

### Data Models (packages/shared/src/types.ts)
- `Search`: Search configuration with date ranges, resorts, stay lengths
- `Availability`: Individual availability result
- `SearchResult`: Complete search execution results with changes
- `SearchExecution`: Execution tracking and progress

## Deployment

### API to Cloud Run
```bash
# Build and deploy
gcloud builds submit --config cloudbuild.yaml

# Create scheduler job
gcloud scheduler jobs create http holiday-park-monitor \
  --location=europe-central2 \
  --schedule="0 */2 * * *" \
  --uri=https://your-api-url.run.app/api/webhooks/scheduler \
  --http-method=POST \
  --headers="x-scheduler-token=your-secret-token"
```

### Web to Vercel
Connected via GitHub - pushes to main branch auto-deploy

## Environment Variables

### API (.env)
- Firebase: `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`
- Email: `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`
- Rate Limiting: `RATE_LIMIT_DELAY_MIN`, `RATE_LIMIT_DELAY_MAX`, `MAX_CONCURRENT_SEARCHES`

### Web (.env.local)
- Firebase config: `NEXT_PUBLIC_FIREBASE_*`
- API URL: `NEXT_PUBLIC_API_URL`

## Resort and Accommodation IDs
- Resorts: 1=Pobierowo, 2=Ustronie Morskie, 5=Niechorze, 6=Rowy, 7=Kołobrzeg, 8=Mielno, 9=Cieplice
- Types: 1=Domek, 2=Apartament, 3=Apartament 55m², 4=Domek z ogrodem, 5=Apartament z ogrodem

## TypeScript Configuration
- Base config in `tsconfig.base.json`
- Shared package must have `"composite": true` for project references
- CLI uses ES modules with `.js` extensions in imports

## Testing Endpoints
```bash
# Health check
curl http://localhost:8080/health

# Rate limiter status
curl http://localhost:8080/api/monitoring/rate-limiter

# Execute search manually
curl -X POST http://localhost:8080/api/execute/{searchId}
```