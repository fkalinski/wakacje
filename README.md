# Holiday Park Monitor

Automated monitoring system for Holiday Park reservations with email notifications and web interface.

## Features

- 🔍 **Automated Search**: Monitor multiple date ranges and stay lengths
- 📧 **Email Notifications**: Get notified about new availabilities and changes
- 🌐 **Web Interface**: Manage searches via Next.js dashboard
- ☁️ **Cloud Native**: Runs on Google Cloud Run with Firebase
- 🔄 **Scheduled Execution**: Configurable check frequencies
- 📊 **Change Tracking**: See what's new and what's no longer available
- 🚦 **Smart Rate Limiting**: Adaptive delays, jitter, and retry logic to avoid rate limits
- ⚡ **Concurrency Control**: Manages parallel searches and requests efficiently

## Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Next.js App   │────▶│  Cloud Run API   │────▶│  Holiday Park   │
│   (Vercel)      │     │   (Express)      │     │      API        │
└────────┬────────┘     └────────┬─────────┘     └─────────────────┘
         │                       │
         ▼                       ▼
┌─────────────────────────────────────────┐
│           Firebase Services              │
│  - Firestore (data storage)              │
│  - Cloud Scheduler (cron jobs)           │
└───────────────────────────────────────────┘
```

## Project Structure

- `apps/api` - Express.js API service (Cloud Run)
- `apps/web` - Next.js web application (Vercel)
- `packages/shared` - Shared TypeScript types

## Setup

### Prerequisites

- Node.js 18+
- Google Cloud account with Firebase project
- Gmail account for sending notifications

### Installation

1. Clone the repository
2. Install dependencies:
```bash
npm install
```

3. Set up environment variables:

**apps/api/.env**
```env
PORT=8080
NODE_ENV=development

# Firebase
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
FIREBASE_CLIENT_EMAIL=firebase-adminsdk@your-project.iam.gserviceaccount.com

# Email
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-specific-password
EMAIL_FROM=Holiday Park Monitor <noreply@example.com>

# Holiday Park API
HOLIDAY_PARK_API_URL=https://rezerwuj.holidaypark.pl

# Cloud Scheduler
SCHEDULER_SECRET=your-secret-token
```

**apps/web/.env.local**
```env
NEXT_PUBLIC_FIREBASE_API_KEY=...
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=...
NEXT_PUBLIC_FIREBASE_PROJECT_ID=...
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=...
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=...
NEXT_PUBLIC_FIREBASE_APP_ID=...
NEXT_PUBLIC_API_URL=http://localhost:8080
```

### Development

Run both API and web app:
```bash
npm run dev
```

Or run separately:
```bash
npm run api:dev   # API on port 8080
npm run web:dev   # Web on port 3000
```

### Rate Limiting Configuration

The system includes smart rate limiting to avoid being blocked:

- **Configurable delays**: Set min/max delays between requests (1-3 seconds default)
- **Jitter**: Adds randomness to prevent synchronized request patterns
- **Adaptive mode**: Adjusts delays based on response times (experimental)
- **Retry logic**: Automatic retries with exponential backoff
- **Concurrency limits**: Controls parallel searches and API requests

Adjust in `.env`:
```env
RATE_LIMIT_DELAY_MIN=1000    # Min delay in ms
RATE_LIMIT_DELAY_MAX=3000    # Max delay in ms
RATE_LIMIT_JITTER=true        # Add randomness
MAX_CONCURRENT_SEARCHES=2     # Parallel searches
MAX_CONCURRENT_REQUESTS=1     # Parallel API calls
```

Monitor rate limiting status:
```bash
curl http://localhost:8080/api/monitoring/rate-limiter
```

### Building

```bash
npm run build
```

## Deployment

### Deploy API to Cloud Run

1. Build and push Docker image:
```bash
gcloud builds submit --config cloudbuild.yaml
```

2. Set environment variables in Cloud Run console

3. Create Cloud Scheduler job:
```bash
gcloud scheduler jobs create http holiday-park-monitor \
  --location=europe-central2 \
  --schedule="0 */2 * * *" \
  --uri=https://your-api-url.run.app/api/webhooks/scheduler \
  --http-method=POST \
  --headers="x-scheduler-token=your-secret-token"
```

### Deploy Web to Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy

## Usage

1. Open the web interface
2. Create a new search with:
   - Date ranges for your vacation periods
   - Preferred stay lengths (e.g., 7, 14 days)
   - Select resorts and accommodation types
   - Set notification email and frequency
3. The system will automatically check for availabilities
4. Receive email notifications when changes are detected

## API Endpoints

- `GET /api/searches` - List all searches
- `POST /api/searches` - Create new search
- `PUT /api/searches/:id` - Update search
- `DELETE /api/searches/:id` - Delete search
- `GET /api/searches/:id/results` - Get search results
- `POST /api/execute/:id` - Manually execute search
- `POST /api/webhooks/scheduler` - Cloud Scheduler webhook
- `GET /api/monitoring/rate-limiter` - Get rate limiter status
- `GET /health` - Health check endpoint

## License

MIT