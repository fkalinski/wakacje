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

## Authentication Architecture

### Google OAuth with Whitelist Implementation

The application uses **Google OAuth 2.0** for authentication with a **whitelist-based access control** system. Only pre-approved email addresses can access the application.

#### Whitelisted Users
```typescript
// Currently authorized users (defined in both web and API)
const ALLOWED_USERS = [
  'fkalinski@gmail.com'
  // Additional users can be added here
];
```

#### Authentication Flow
1. User visits the app → Redirected to `/login`
2. User signs in with Google OAuth
3. System verifies Firebase ID token
4. System checks if email is in whitelist
5. If authorized → Access granted with user-isolated data
6. If unauthorized → "Access Denied" message shown

#### Frontend Components
- **`AuthContext`** (`apps/web/contexts/AuthContext.tsx`): Manages authentication state and Google sign-in
- **`AuthGuard`** (`apps/web/components/auth/AuthGuard.tsx`): Protects routes from unauthorized access
- **`LoginPage`** (`apps/web/components/auth/LoginPage.tsx`): Google sign-in interface
- **`UserMenu`** (`apps/web/components/UserMenu.tsx`): Displays user info and sign-out option

#### Backend Middleware
- **`authMiddleware`** (`apps/api/src/middleware/auth.ts`): Verifies Firebase ID tokens and enforces whitelist
- All API routes require valid Firebase ID token in `Authorization: Bearer <token>` header
- User data isolation via `userId` field (using email as unique identifier)

#### Data Isolation
All data operations are filtered by `userId`:
```typescript
// Example: Get searches for authenticated user only
const searches = allSearches.filter(s => s.userId === req.user.email);
```

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

3. **Google OAuth** (Web Application):
   - Firebase Authentication with Google provider
   - ID tokens sent with all API requests
   - Whitelist enforcement on both client and server

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

**Default Configuration (.env.local)**
```bash
# Firebase Configuration (Production)
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD8fF0e8bL9vQ0rJ5Kz2xYM3nPWcT7aUhI
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ai-lab-1-451411.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ai-lab-1-451411
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ai-lab-1-451411.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=524125190961
NEXT_PUBLIC_FIREBASE_APP_ID=1:524125190961:web:app

# API Configuration (Cloud Run - Production)
NEXT_PUBLIC_API_URL=https://holiday-park-api-3q2xuaoyma-lm.a.run.app
```

**Local Development Override (.env.development.local)**
```bash
# Override API URL for local development
# This file is optional - only create if you want to force local API
NEXT_PUBLIC_API_URL=http://localhost:8080
# Firebase config is inherited from .env.local
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

#### Dual Environment Setup

The application supports two development modes:

1. **Cloud Mode (Default)** - Web connects to production Cloud Run API:
```bash
# From apps/web directory:
npm run dev
# Web app connects to: https://holiday-park-api-3q2xuaoyma-lm.a.run.app
# Uses Firebase Auth with production credentials
```

2. **Local Mode** - Web connects to local API:
```bash
# Option 1: Run both services with one command (from root)
npm run dev:local
# Starts API on port 8080 and Web on port 3000
# Web app connects to: http://localhost:8080

# Option 2: Run services separately
# Terminal 1 - Start API:
cd apps/api && npm run dev

# Terminal 2 - Start Web with local API:
cd apps/web && npm run dev:local
```

#### Other Commands
```bash
# Run all services with Turbo (uses default configs)
npm run dev

# Run specific services individually
npm run api:dev   # API on port 8080
npm run web:dev   # Web on port 3000 (Cloud API)
npm run web:dev:local # Web on port 3000 (Local API)

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

#### Prerequisites for Cloud Build

1. **Ensure all packages build locally first**:
   ```bash
   # Build all packages to verify no TypeScript errors
   npm run build
   ```

2. **Required files for deployment**:
   - `cloudbuild.yaml` in project root
   - `apps/api/Dockerfile` for containerization
   - All TypeScript must compile without errors

#### Deployment Command

```bash
# Build and deploy with commit SHA substitution
gcloud builds submit --config cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD)

# Note: Always run from project root directory
cd /path/to/project/root
gcloud builds submit --config cloudbuild.yaml --substitutions=COMMIT_SHA=$(git rev-parse --short HEAD)
```

#### Common Build Issues & Solutions

1. **TypeScript Compilation Errors**:
   - Ensure `npm run build` succeeds locally before deploying
   - Check for any `any` type errors with strict TypeScript settings
   - Verify all imports resolve correctly

2. **Missing Declaration Files**:
   - The shared package must be built with TypeScript declarations
   - Dockerfile builds shared package before API: `RUN npm run build` in `/app/packages/shared`

3. **Environment Variable Loading**:
   - In `apps/api/src/index.ts`, ensure `dotenv.config()` is called BEFORE any module imports that use env vars
   ```typescript
   import dotenv from 'dotenv';
   dotenv.config(); // Must be first!
   // Then import other modules
   ```

4. **Build Context**:
   - Cloud Build uploads entire project directory
   - Ensure no broken scripts or test files that might interfere
   - Remove any unused scripts that have compilation errors

#### Create Cloud Scheduler job
```bash
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

### Dual Environment Setup

The application supports two modes:
1. **Cloud Mode** (default): Web app connects to Cloud Run API
2. **Local Mode**: Web app connects to local API on port 8080

### API (.env)
```bash
# Firebase Admin SDK (Required)
FIREBASE_PROJECT_ID=ai-lab-1-451411
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@ai-lab-1-451411.iam.gserviceaccount.com

# Email Notifications (Optional)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password

# Rate Limiting
RATE_LIMIT_DELAY_MIN=1000
RATE_LIMIT_DELAY_MAX=3000
MAX_CONCURRENT_SEARCHES=2

# Security
SCHEDULER_TOKEN=your-secure-token
# Supports both local development and production
CORS_ORIGIN=http://localhost:3000,https://wakacje-ejy32w34d-fkalinskis-projects.vercel.app

# Port
PORT=8080
NODE_ENV=development
```

### Web (.env.local) - Production/Cloud Mode
```bash
# Firebase Client Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyD8fF0e8bL9vQ0rJ5Kz2xYM3nPWcT7aUhI
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ai-lab-1-451411.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ai-lab-1-451411
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=ai-lab-1-451411.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=524125190961
NEXT_PUBLIC_FIREBASE_APP_ID=1:524125190961:web:your-app-id

# API Configuration (Cloud Run)
NEXT_PUBLIC_API_URL=https://holiday-park-api-3q2xuaoyma-lm.a.run.app
```

### Web (.env.development.local) - Local Mode Override
```bash
# Override API URL for local development
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Environment Usage

**Cloud Mode (default)**:
```bash
cd apps/web
npm run dev
# Uses Cloud Run API automatically
# API URL: https://holiday-park-api-3q2xuaoyma-lm.a.run.app
```

**Local Mode**:
```bash
# Option 1: Run both API and Web together (from root)
npm run dev:local

# Option 2: Run services separately
# Terminal 1:
cd apps/api && npm run dev
# Terminal 2:
cd apps/web && npm run dev:local

# Option 3: Use .env.development.local override
# Create the file as shown above, then:
npm run dev
```

**Scripts Available**:
- `npm run dev` - Run all services with Turbo (default configs)
- `npm run dev:local` - Run API and Web locally with concurrently
- `npm run api:dev` - Run API only
- `npm run web:dev` - Run Web only (Cloud API)
- `npm run web:dev:local` - Run Web only (Local API)

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

### Authentication Security
- **Whitelist-based access**: Only pre-approved emails can access the app
- **Firebase ID token verification**: All API requests require valid tokens
- **User data isolation**: Each user only sees their own data via userId filtering
- **No public registration**: New users must be manually added to whitelist
- **Dual-layer validation**: Whitelist checked on both client and server

### API Security
- Use helmet.js for security headers
- Implement rate limiting per IP
- Validate all inputs with Zod
- Sanitize user-generated content
- Use HTTPS everywhere
- Firebase ID token verification on all protected routes

### Firebase Security
- Never expose service account keys
- Use Security Rules for client access
- Implement App Check for API abuse prevention
- Rotate OAuth2 refresh tokens periodically
- Whitelist enforcement in Security Rules

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
- **Update whitelist in both `AuthContext.tsx` and `auth.ts` when adding users**
- **Test authentication flow with both whitelisted and non-whitelisted accounts**
- **Ensure Firebase project configuration matches across environments**

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
- never commit without direct ask for it and confirmation
- always lint and tsc before committing