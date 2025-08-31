# CLAUDE.md

This file provides comprehensive guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Holiday Park Monitor - A production-ready monorepo for monitoring Holiday Park vacation availabilities with multiple deployment targets:
- **apps/api**: Express.js API service deployed to Google Cloud Run (Node.js 18+)
- **apps/web**: Next.js 14 web application deployed to Vercel (App Router)
- **apps/cli**: Local CLI tool with dual persistence modes (SQLite/Firebase)
- **packages/shared**: Shared TypeScript types, interfaces, and persistence adapters

## Architecture Overview

### System Design
```
┌─────────────┐     ┌──────────────┐     ┌─────────────────┐
│  Next.js    │────▶│  Express API │────▶│ Holiday Park API│
│  (Vercel)   │     │ (Cloud Run)  │     └─────────────────┘
└─────────────┘     └──────────────┘
       │                    │
       └────────┬───────────┘
                │
         ┌──────▼──────┐
         │  Firebase   │
         │  Firestore  │
         └─────────────┘

┌─────────────┐     ┌─────────────────┐
│   CLI Tool  │────▶│ Holiday Park API│
└─────────────┘     └─────────────────┘
       │
┌──────▼──────────────┐
│ SQLite or Firebase  │
│ (Configurable)      │
└─────────────────────┘
```

### Persistence Layer Architecture

The application uses an **Adapter Pattern** with the `IPersistenceAdapter` interface:

```typescript
// Both adapters implement the same interface
interface IPersistenceAdapter {
  // Search Management
  createSearch(search: Search): Promise<string>
  getSearch(searchId: string): Promise<Search | null>
  getAllSearches(enabled?: boolean): Promise<Search[]>
  // ... other methods
}
```

**Adapters:**
- `FirebasePersistenceAdapter`: Supports both service account (API) and OAuth2 (CLI) authentication
- `SQLitePersistenceAdapter`: Local storage for offline CLI usage

## Technology Stack & Best Practices

### Firebase (Admin SDK v12 & Client SDK v10)

#### Authentication Modes
1. **Service Account** (API/CI/CD):
   - Used by Express API in Cloud Run
   - Requires `FIREBASE_PROJECT_ID`, `FIREBASE_PRIVATE_KEY`, `FIREBASE_CLIENT_EMAIL`
   - Full admin access to Firestore

2. **OAuth2** (Interactive CLI):
   - Browser-based Google authentication
   - Stores refresh tokens in `~/.holiday-park-cli/auth.json`
   - User-scoped access with automatic token refresh

#### Firestore Best Practices
- **Query Optimization**: Use composite indexes for complex queries
- **Pagination**: Implement cursor-based pagination for large datasets
- **Batch Operations**: Use batch writes for atomic updates (max 500 ops)
- **Cost Management**: 
  - Minimize document reads with efficient queries
  - Use `select()` to fetch only needed fields
  - Cache frequently accessed data

#### Security Rules (Firestore)
```javascript
// Example security rules for production
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /searches/{searchId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null && request.auth.uid == resource.data.userId;
    }
  }
}
```

### Next.js 14 (App Router)

#### Server Components vs Client Components
- **Server Components** (default): Data fetching, SEO, initial render
- **Client Components** (`'use client'`): Interactivity, browser APIs, state management

#### Deployment Optimization (Vercel)
- **ISR (Incremental Static Regeneration)**: For search results pages
- **Dynamic Imports**: Reduce initial bundle size
- **Image Optimization**: Use `next/image` with proper sizing
- **Edge Functions**: For lightweight API routes

#### Environment Variables
```bash
# .env.local (Web)
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_API_URL=https://api.example.com
```

### Express.js API (Cloud Run)

#### Middleware Stack (Order Matters!)
```typescript
app.use(cors(corsOptions))        // CORS handling
app.use(express.json())            // Body parsing
app.use(rateLimiter)              // Rate limiting
app.use(authMiddleware)           // Authentication
app.use(errorHandler)             // Error handling (last)
```

#### Cloud Run Configuration
```yaml
# Cloud Run optimizations
spec:
  containers:
    - image: gcr.io/PROJECT_ID/holiday-park-api
      resources:
        limits:
          cpu: '2'
          memory: '2Gi'
      env:
        - name: NODE_ENV
          value: 'production'
  scaling:
    minInstances: 0
    maxInstances: 100
    targetCPUUtilization: 70
```

### TypeScript Monorepo Configuration

#### Project References
```json
// tsconfig.base.json
{
  "compilerOptions": {
    "composite": true,
    "declaration": true,
    "declarationMap": true,
    "incremental": true
  }
}
```

#### Shared Package Requirements
- Must have `"composite": true` in tsconfig.json
- Build shared package before dependent packages
- Use `*.js` extensions in imports for ES modules

### Turbo Build Pipeline

```json
// turbo.json
{
  "pipeline": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": ["dist/**"]
    },
    "dev": {
      "cache": false,
      "persistent": true
    }
  }
}
```

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

# Use Firebase emulators for local development
firebase emulators:start
```

### Building
```bash
# Build all packages (uses Turbo cache)
npm run build

# Build specific packages
npm run api:build
npm run web:build
cd apps/cli && npm run build
```

### Testing
```bash
# Run tests with coverage
npm test -- --coverage

# Test specific persistence adapter
npm test -- --grep "FirebasePersistenceAdapter"
```

### CLI Usage
```bash
# Authentication & Configuration
./hp auth configure              # Set up Firebase project
./hp auth login                  # OAuth2 login
./hp config set-adapter firebase # Switch to Firebase storage

# Search Operations
./hp search --interactive        # Interactive search
./hp search --remote             # Use Firebase storage
./hp list --local                # Force local SQLite

# Monitoring
./hp monitor --once              # Run searches once
./hp monitor -i 30               # Monitor every 30 minutes
```

## Key Services & Components

### API Services (apps/api/src/services/)

| Service | Purpose | Key Features |
|---------|---------|--------------|
| `holiday-park-client.ts` | External API integration | Cookie management, session handling |
| `search-executor.ts` | Search orchestration | Rate limiting, parallel execution |
| `rate-limiter.ts` | Request throttling | Adaptive delays, exponential backoff |
| `notification-service.ts` | Email notifications | SMTP via nodemailer |
| `persistence.ts` | Data layer | Firebase adapter initialization |

### CLI Services (apps/cli/src/services/)

| Service | Purpose | Key Features |
|---------|---------|--------------|
| `storage.ts` | Adapter factory | SQLite/Firebase selection |
| `auth.ts` | OAuth2 flow | Token management, browser auth |
| `config.ts` | Configuration | Adapter preferences, credentials |
| `search-executor.ts` | Local execution | Progress tracking, notifications |

### Shared Package (packages/shared/src/)

| Component | Purpose | Key Features |
|-----------|---------|--------------|
| `interfaces/persistence.ts` | Adapter contract | Common interface for all adapters |
| `adapters/firebase-persistence.ts` | Firebase adapter | Dual auth modes |
| `adapters/sqlite-persistence.ts` | SQLite adapter | Local storage |
| `types/*.ts` | Type definitions | Shared across all packages |

## Rate Limiting Strategy

### Configuration
```typescript
// Adaptive rate limiting with jitter
const rateLimiter = {
  minDelay: 1000,      // 1 second minimum
  maxDelay: 3000,      // 3 seconds maximum
  jitter: 0.3,         // 30% randomization
  backoffMultiplier: 2, // Exponential backoff
  maxConcurrent: {
    searches: 2,       // Parallel search limit
    apiCalls: 1        // Sequential API calls
  }
}
```

### Anti-Detection Measures
- Random delays between requests
- User-Agent rotation
- Cookie persistence across sessions
- Graceful failure handling

## Data Models

### Core Types (packages/shared/src/types.ts)

```typescript
interface Search {
  id?: string
  name: string
  enabled: boolean
  dateRanges: DateRange[]
  stayLengths: number[]
  resorts: number[]
  accommodationTypes: number[]
  schedule: ScheduleConfig
  notifications: NotificationConfig
}

interface Availability {
  resortId: number
  resortName: string
  accommodationTypeId: number
  accommodationTypeName: string
  dateFrom: string
  dateTo: string
  nights: number
  priceTotal: number
  pricePerNight: number
  available: boolean
  link: string
}
```

## Deployment

### API to Google Cloud Run

```bash
# Build and deploy
gcloud builds submit --config cloudbuild.yaml

# Create Cloud Scheduler job
gcloud scheduler jobs create http holiday-park-monitor \
  --location=europe-central2 \
  --schedule="0 */2 * * *" \
  --uri=https://api-url.run.app/api/webhooks/scheduler \
  --http-method=POST \
  --headers="x-scheduler-token=SECRET_TOKEN" \
  --oidc-service-account-email=scheduler@project.iam.gserviceaccount.com
```

### Web to Vercel

```bash
# Automatic deployment via GitHub integration
# Settings in vercel.json
{
  "buildCommand": "npm run build",
  "outputDirectory": "apps/web/.next",
  "installCommand": "npm install",
  "framework": "nextjs"
}
```

#### Why Vercel Over GCP for Next.js Hosting

**Recommendation**: Use Vercel for the Next.js web application while keeping GCP for API/backend services.

**Key Benefits of Vercel:**
- **Native Next.js Optimization**: Built-in ISR, automatic image optimization, Edge Functions
- **Zero-Config Deployment**: GitHub integration with automatic preview deployments
- **Cost Efficiency**: Free tier (100GB bandwidth/month) vs ~$20+/month on Cloud Run
- **Superior Performance**: Edge Network optimized specifically for Next.js
- **Developer Experience**: No Docker/container management required

**When to Consider GCP Instead:**
- Traffic exceeds 100GB bandwidth/month (Vercel free tier limit)
- Specific GCP security requirements (Cloud Armor, VPC)
- Compliance needs for single vendor
- Very high traffic requiring detailed cost optimization

**Cost Comparison:**
- **Current (Vercel + GCP)**: ~$5-30/month (likely free tier for web)
- **All GCP**: ~$23-37/month (includes CDN for performance parity)

### CLI Distribution

```bash
# Build standalone executable
cd apps/cli
npm run build
pkg dist/index.js --targets node18-macos-x64
```

## Environment Variables

### API (.env)
```bash
# Firebase Admin
FIREBASE_PROJECT_ID=
FIREBASE_PRIVATE_KEY=
FIREBASE_CLIENT_EMAIL=

# Email Notifications
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=
SMTP_PASS=

# Rate Limiting
RATE_LIMIT_DELAY_MIN=1000
RATE_LIMIT_DELAY_MAX=3000
MAX_CONCURRENT_SEARCHES=2

# Security
SCHEDULER_TOKEN=
CORS_ORIGIN=https://web.example.com
```

### Web (.env.local)
```bash
# Firebase Client
NEXT_PUBLIC_FIREBASE_API_KEY=
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=
NEXT_PUBLIC_FIREBASE_PROJECT_ID=
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=
NEXT_PUBLIC_FIREBASE_APP_ID=

# API
NEXT_PUBLIC_API_URL=https://api.example.com
```

### CLI (.env)
```bash
# Optional: Google OAuth Client Secret for enhanced OAuth2 flow
GOOGLE_CLIENT_SECRET=
```

## Resort and Accommodation IDs

### Resorts
| ID | Name | Location |
|----|------|----------|
| 1 | Pobierowo | Baltic Sea |
| 2 | Ustronie Morskie | Baltic Sea |
| 5 | Niechorze | Baltic Sea |
| 6 | Rowy | Baltic Sea |
| 7 | Kołobrzeg | Baltic Sea |
| 8 | Mielno | Baltic Sea |
| 9 | Cieplice | Mountains |

### Accommodation Types
| ID | Type | Size |
|----|------|------|
| 1 | Domek | Standard |
| 2 | Apartament | Standard |
| 3 | Apartament 55m² | Large |
| 4 | Domek z ogrodem | With Garden |
| 5 | Apartament z ogrodem | With Garden |

## Performance Optimization

### Firebase Query Optimization
```typescript
// Use composite indexes for complex queries
firestore.collection('availabilities')
  .where('resortId', '==', 1)
  .where('dateFrom', '>=', '2024-01-01')
  .orderBy('dateFrom')
  .limit(50)

// Prefer select() to reduce data transfer
.select('resortName', 'dateFrom', 'priceTotal')
```

### Next.js Performance
```typescript
// Dynamic imports for heavy components
const HeavyComponent = dynamic(() => import('./HeavyComponent'), {
  loading: () => <Skeleton />,
  ssr: false
})

// Image optimization
<Image 
  src="/image.jpg" 
  width={800} 
  height={600}
  priority={isAboveFold}
  placeholder="blur"
/>
```

### Cloud Run Auto-scaling
```yaml
# Optimize cold starts
spec:
  containers:
    - image: gcr.io/PROJECT_ID/api
      startupProbe:
        httpGet:
          path: /health
        initialDelaySeconds: 0
        periodSeconds: 1
```

## Troubleshooting Guide

### Common Issues

#### Firebase Authentication Errors
```bash
# Error: Missing or insufficient permissions
Solution: Check Firebase Security Rules and service account permissions

# Error: OAuth2 token expired
Solution: Token refresh is automatic, but check ~/.holiday-park-cli/auth.json
```

#### CORS Issues
```typescript
// Correct CORS configuration for Express
const corsOptions = {
  origin: process.env.CORS_ORIGIN || 'http://localhost:3000',
  credentials: true,
  optionsSuccessStatus: 200
}
```

#### Rate Limiting Detection
```bash
# Signs of rate limiting:
- HTTP 429 responses
- Increasing response times
- Empty results despite known data

# Solution: Increase delays in rate limiter config
RATE_LIMIT_DELAY_MIN=2000
RATE_LIMIT_DELAY_MAX=5000
```

#### TypeScript Build Errors
```bash
# Error: Cannot find module '@holiday-park/shared'
Solution: Build shared package first: cd packages/shared && npm run build

# Error: Cannot use import statement outside a module
Solution: Ensure "type": "module" in package.json for ES modules
```

## Testing Strategies

### Unit Testing
```typescript
// Test persistence adapters
describe('FirebasePersistenceAdapter', () => {
  it('should switch between auth modes', async () => {
    const adapter = new FirebasePersistenceAdapter({
      authMode: 'oauth2',
      oauth2: { /* credentials */ }
    })
    // Test OAuth2 specific behavior
  })
})
```

### Integration Testing
```bash
# Test with Firebase emulators
firebase emulators:exec "npm test" --only firestore,auth

# Test API endpoints
curl -X POST http://localhost:8080/api/searches \
  -H "Content-Type: application/json" \
  -d '{"name": "Test Search", "dateRanges": [...]}'
```

### E2E Testing
```typescript
// Playwright example for web app
test('search flow', async ({ page }) => {
  await page.goto('/')
  await page.click('text=New Search')
  // ... complete search flow
})
```

## Security Best Practices

### API Security
- Use helmet.js for security headers
- Implement rate limiting per IP
- Validate all inputs with Zod
- Sanitize user-generated content
- Use HTTPS everywhere

### Firebase Security
- Never expose service account keys
- Use Security Rules for client access
- Implement App Check for API abuse prevention
- Rotate OAuth2 refresh tokens periodically

### Environment Variables
- Never commit .env files
- Use Secret Manager for production
- Rotate secrets regularly
- Audit access logs

## Monitoring & Observability

### Logging
```typescript
// Use Winston for structured logging
logger.info('Search executed', {
  searchId: search.id,
  duration: endTime - startTime,
  resultsCount: results.length
})
```

### Metrics to Track
- Search execution time
- API response times
- Rate limit violations
- Firebase read/write operations
- Error rates by service

### Alerts
- Set up Cloud Monitoring alerts for:
  - High error rates (> 1%)
  - Slow API responses (> 3s)
  - Failed scheduled jobs
  - Firebase quota warnings

## CI/CD Pipeline

### GitHub Actions Workflow
```yaml
name: Deploy
on:
  push:
    branches: [main]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - run: npm ci
      - run: npm test
  deploy-api:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: gcloud builds submit
  deploy-web:
    needs: test
    runs-on: ubuntu-latest
    steps:
      - run: vercel --prod
```

## Development Workflow

### Branch Strategy
- `main`: Production-ready code
- `develop`: Integration branch
- `feature/*`: New features
- `fix/*`: Bug fixes

### Commit Convention
```bash
feat: Add OAuth2 authentication
fix: Resolve rate limiting issue
docs: Update API documentation
refactor: Optimize Firebase queries
test: Add persistence adapter tests
```

### Code Review Checklist
- [ ] TypeScript types are properly defined
- [ ] Error handling is comprehensive
- [ ] Rate limiting is considered
- [ ] Security implications reviewed
- [ ] Performance impact assessed
- [ ] Tests are included
- [ ] Documentation is updated

## Future Enhancements

### Planned Features
1. **GraphQL API**: Replace REST with GraphQL for better query efficiency
2. **Redis Cache**: Add caching layer for frequently accessed data
3. **WebSocket Support**: Real-time availability updates
4. **Mobile App**: React Native client
5. **ML Price Predictions**: TensorFlow.js for price trend analysis

### Scalability Considerations
- Implement database sharding for large datasets
- Use Cloud CDN for static assets
- Consider multi-region deployment
- Implement event-driven architecture with Pub/Sub

## Important Notes

- **Never expose API keys or secrets in code**
- **Always test with Firebase emulators first**
- **Monitor costs - especially Firebase reads**
- **Keep dependencies updated for security**
- **Document all external API integrations**
- **Maintain backwards compatibility in shared package**

## Support & Resources

- [Firebase Documentation](https://firebase.google.com/docs)
- [Next.js 14 Documentation](https://nextjs.org/docs)
- [Google Cloud Run Guide](https://cloud.google.com/run/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [Turbo Documentation](https://turbo.build/repo/docs)

---

*Last Updated: 2024*
*Version: 2.0.0*
*Validated with context7 documentation fetch*