# Holiday Park Monitor - GCP Deployment Guide

## Prerequisites Verification
- ✅ GCP Project: `ai-lab-1-451411`
- ✅ APIs Enabled: Firestore, Cloud Run, Cloud Scheduler, Cloud Build, Secret Manager
- ✅ Service Accounts Created:
  - `holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com` (API service)
  - `holiday-park-scheduler@ai-lab-1-451411.iam.gserviceaccount.com` (Scheduler)
- ✅ Firestore Database Configured (europe-central2)
- ✅ Service Account Key: `service-account-key.json`
- ✅ Security Features Implemented:
  - JWT authentication
  - API key support
  - IP-based rate limiting
  - Security headers (Helmet.js)
  - Input validation and sanitization

## Phase 1: Environment Setup

### 1.1 Set up Google Cloud SDK
```bash
# Authenticate with GCP
gcloud auth login

# Set project
gcloud config set project ai-lab-1-451411

# Set default region
gcloud config set run/region europe-central2
```

### 1.2 Configure Service Account Authentication
```bash
# For local testing (if needed)
export GOOGLE_APPLICATION_CREDENTIALS="./service-account-key.json"
```

## Phase 2: Deploy API to Cloud Run

### 2.1 Build and Deploy Using Cloud Build
```bash
# From project root directory
cd /Users/fkalinski/dev/fkalinski/wakacje

# Submit build to Cloud Build (this will build and deploy automatically)
gcloud builds submit --config cloudbuild.yaml \
  --substitutions=_SERVICE_ACCOUNT=holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com
```

### 2.2 Alternative: Manual Docker Build and Deploy
```bash
# Build locally and push to Container Registry
docker build -t gcr.io/ai-lab-1-451411/holiday-park-api:latest -f apps/api/Dockerfile .
docker push gcr.io/ai-lab-1-451411/holiday-park-api:latest

# Deploy to Cloud Run with security environment variables
gcloud run deploy holiday-park-api \
  --image gcr.io/ai-lab-1-451411/holiday-park-api:latest \
  --platform managed \
  --region europe-central2 \
  --service-account holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com \
  --allow-unauthenticated \
  --port 8080 \
  --min-instances 0 \
  --max-instances 10 \
  --memory 512Mi \
  --cpu 1 \
  --timeout 300 \
  --set-env-vars NODE_ENV=production \
  --set-env-vars FIREBASE_PROJECT_ID=ai-lab-1-451411 \
  --set-env-vars SCHEDULER_TOKEN=jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80= \
  --set-env-vars JWT_SECRET=$(openssl rand -base64 32) \
  --set-env-vars JWT_ISSUER=holiday-park-api \
  --set-env-vars JWT_AUDIENCE=holiday-park-client \
  --set-env-vars CORS_ORIGIN=https://your-app.vercel.app
```

### 2.3 Set Security Secrets in Secret Manager (Recommended)
```bash
# Create security secrets
echo -n "your-firebase-private-key" | gcloud secrets create firebase-private-key --data-file=-
echo -n "your-firebase-client-email" | gcloud secrets create firebase-client-email --data-file=-
echo -n "jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80=" | gcloud secrets create scheduler-token --data-file=-
echo -n "$(openssl rand -base64 32)" | gcloud secrets create jwt-secret --data-file=-
echo -n "holiday-park-api" | gcloud secrets create jwt-issuer --data-file=-
echo -n "holiday-park-client" | gcloud secrets create jwt-audience --data-file=-

# Grant access to service account
gcloud secrets add-iam-policy-binding firebase-private-key \
  --member="serviceAccount:holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding firebase-client-email \
  --member="serviceAccount:holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding scheduler-token \
  --member="serviceAccount:holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com" \
  --role="roles/secretmanager.secretAccessor"

# Deploy with all security secrets
gcloud run deploy holiday-park-api \
  --update-secrets=FIREBASE_PRIVATE_KEY=firebase-private-key:latest,FIREBASE_CLIENT_EMAIL=firebase-client-email:latest,SCHEDULER_TOKEN=scheduler-token:latest,JWT_SECRET=jwt-secret:latest,JWT_ISSUER=jwt-issuer:latest,JWT_AUDIENCE=jwt-audience:latest
```

## Phase 2B: Security Configuration

### Generate JWT Tokens and API Keys
```bash
# Navigate to API directory
cd apps/api

# Generate admin user token for testing
npm run generate-token user admin-user admin@example.com admin

# Generate API key for external services
npm run generate-token api api-key-1 "Production API Key"

# Store generated tokens securely
```

### Configure Authentication Middleware
The API now includes:
- **JWT Authentication**: For user sessions
- **API Key Authentication**: For service-to-service communication  
- **Scheduler Token**: For Cloud Scheduler webhooks
- **Rate Limiting**: IP-based with adaptive thresholds

### Test Security Features
```bash
# Run security test suite
cd apps/api
./test-security.sh

# Test rate limiting
for i in {1..10}; do curl -s "$SERVICE_URL/api/searches"; done

# Test authentication
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" "$SERVICE_URL/api/execute/test"

# Test API key
curl -H "x-api-key: YOUR_API_KEY" "$SERVICE_URL/api/searches"
```

## Phase 3: Verify Deployment

### 3.1 Get Service URL
```bash
SERVICE_URL=$(gcloud run services describe holiday-park-api \
  --platform managed \
  --region europe-central2 \
  --format 'value(status.url)')

echo "API deployed at: $SERVICE_URL"
```

### 3.2 Test API Health
```bash
# Test health endpoint
curl "$SERVICE_URL/health"

# Should return:
# {"status":"healthy","service":"holiday-park-api","timestamp":"..."}
```

## Phase 4: Set Up Cloud Scheduler

### 4.1 Create Scheduler Job
```bash
# Create job to run every 2 hours
gcloud scheduler jobs create http holiday-park-monitor \
  --location europe-central2 \
  --schedule "0 */2 * * *" \
  --http-method POST \
  --uri "${SERVICE_URL}/api/webhooks/scheduler" \
  --headers "x-scheduler-token=jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80=" \
  --oidc-service-account-email holiday-park-scheduler@ai-lab-1-451411.iam.gserviceaccount.com \
  --oidc-token-audience "${SERVICE_URL}"
```

### 4.2 Test Scheduler Job
```bash
# Trigger job manually
gcloud scheduler jobs run holiday-park-monitor --location europe-central2

# Check logs
gcloud logging read "resource.type=cloud_scheduler_job" --limit 10
```

## Phase 5: Deploy Firestore Security Rules

### 5.1 Deploy Enhanced Security Rules
The project includes comprehensive security rules with authentication and authorization:

```bash
# The firestore.rules file is already in the project root with proper security
# Deploy the existing security rules
gcloud firestore rules deploy firestore.rules

# Or using Firebase CLI (if installed)
firebase deploy --only firestore:rules
```

### 5.2 Security Rules Overview
The deployed rules provide:
- **Authentication Required**: All operations require authentication
- **User Ownership**: Users can only access their own searches
- **Role-Based Access**: Admin role for privileged operations
- **API Key Support**: Special permissions for API keys
- **Read-Only Collections**: Availabilities and results are read-only for users

### 5.3 Verify Rules Deployment
```bash
# Check current rules
gcloud firestore operations list

# Test rules with authenticated request
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  "$SERVICE_URL/api/searches"
```

## Phase 6: Deploy Web Application to Vercel

### 6.1 Install Vercel CLI
```bash
npm i -g vercel
```

### 6.2 Configure Environment Variables
```bash
# Create .env.production in apps/web
cat > apps/web/.env.production << EOF
NEXT_PUBLIC_API_URL=${SERVICE_URL}
NEXT_PUBLIC_FIREBASE_API_KEY=your-firebase-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=ai-lab-1-451411.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=ai-lab-1-451411
EOF
```

### 6.3 Deploy to Vercel
```bash
cd apps/web
vercel --prod
```

## Phase 7: Post-Deployment Configuration

### 7.1 Update CORS in Cloud Run
```bash
# Update with your Vercel URL
gcloud run services update holiday-park-api \
  --update-env-vars CORS_ORIGIN=https://your-app.vercel.app
```

### 7.2 Set Up Monitoring
```bash
# Create uptime check
gcloud monitoring uptime-checks create http holiday-park-api-health \
  --resource-type=URL \
  --uri="${SERVICE_URL}/health" \
  --check-interval=5m
```

## Phase 8: Verification Checklist

### Basic Functionality
- [ ] API health endpoint responds: `curl $SERVICE_URL/health`
- [ ] Detailed health check works: `curl $SERVICE_URL/health/detailed`
- [ ] Cloud Scheduler job runs successfully
- [ ] Firestore has data after scheduler run
- [ ] Web app can connect to API

### Security Verification
- [ ] Authentication required on protected endpoints
- [ ] Rate limiting activates after threshold
- [ ] Security headers present (X-Frame-Options, CSP, etc.)
- [ ] CORS properly configured for production domain
- [ ] JWT tokens validate correctly
- [ ] API keys work as expected
- [ ] Scheduler webhook requires correct token
- [ ] Firestore rules enforce authentication
- [ ] Input validation and sanitization working
- [ ] No sensitive data in logs

## Troubleshooting Commands

```bash
# View Cloud Run logs
gcloud logging read "resource.type=cloud_run_revision AND resource.labels.service_name=holiday-park-api" --limit 50

# View Cloud Build logs
gcloud builds list --limit 5

# Check service status
gcloud run services describe holiday-park-api --region europe-central2

# View Firestore data
gcloud firestore operations list

# Check scheduler job status
gcloud scheduler jobs describe holiday-park-monitor --location europe-central2

# View detailed error logs
gcloud logging read "severity>=ERROR AND resource.type=cloud_run_revision" --limit 20 --format json

# Monitor real-time logs
gcloud alpha logging tail "resource.type=cloud_run_revision AND resource.labels.service_name=holiday-park-api"
```

## Quick Deployment Script

Save this as `deploy.sh` for one-command deployment with security:

```bash
#!/bin/bash
set -e

# Configuration
PROJECT_ID="ai-lab-1-451411"
REGION="europe-central2"
SERVICE_NAME="holiday-park-api"
SCHEDULER_TOKEN="jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80="

echo "🚀 Starting secure deployment to GCP..."

# Generate security secrets if not exists
echo "🔐 Setting up security secrets..."
if ! gcloud secrets describe jwt-secret &>/dev/null; then
  echo -n "$(openssl rand -base64 32)" | gcloud secrets create jwt-secret --data-file=-
  echo "✅ Created JWT secret"
fi

# Build and deploy
echo "📦 Building and deploying API with security features..."
gcloud builds submit --config cloudbuild.yaml

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

echo "✅ API deployed at: $SERVICE_URL"

# Deploy Firestore security rules
echo "🔒 Deploying Firestore security rules..."
gcloud firestore rules deploy firestore.rules

# Test health endpoints
echo "🏥 Testing health endpoints..."
curl -s "$SERVICE_URL/health" | jq .
curl -s "$SERVICE_URL/health/detailed" | jq .

# Test security
echo "🔐 Testing security features..."
# Test rate limiting
echo "Testing rate limiting..."
for i in {1..5}; do
  curl -s -o /dev/null -w "Request $i: %{http_code}\n" "$SERVICE_URL/api/searches"
done

# Test authentication requirement
echo "Testing authentication..."
curl -s -w "\nStatus: %{http_code}\n" "$SERVICE_URL/api/execute/test" | jq .

# Set up scheduler if it doesn't exist
if ! gcloud scheduler jobs describe holiday-park-monitor --location $REGION &>/dev/null; then
  echo "⏰ Creating Cloud Scheduler job..."
  gcloud scheduler jobs create http holiday-park-monitor \
    --location $REGION \
    --schedule "0 */2 * * *" \
    --http-method POST \
    --uri "${SERVICE_URL}/api/webhooks/scheduler" \
    --headers "x-scheduler-token=${SCHEDULER_TOKEN}" \
    --oidc-service-account-email holiday-park-scheduler@${PROJECT_ID}.iam.gserviceaccount.com \
    --oidc-token-audience "${SERVICE_URL}"
fi

echo "🎉 Secure deployment complete!"
echo "📊 View logs: gcloud logging tail \"resource.type=cloud_run_revision\""
echo "🌐 API URL: $SERVICE_URL"
echo "🔐 Generate tokens: cd apps/api && npm run generate-token"
echo "🧪 Run security tests: cd apps/api && ./test-security.sh"
```

## Cost Optimization Tips

1. **Cloud Run Configuration**
   - Min instances: 0 (scales to zero when not in use)
   - Max instances: 10 (prevent runaway costs)
   - Memory: 512Mi (sufficient for Node.js API)
   - CPU: 1 (adjust based on performance needs)

2. **Cloud Scheduler**
   - Run every 2 hours instead of more frequently
   - Consider time-based scheduling (e.g., only during daytime)

3. **Firestore**
   - Monitor read/write operations
   - Use efficient queries with proper indexes
   - Enable TTL for old data cleanup

4. **Budget Alerts**
   ```bash
   gcloud billing budgets create \
     --billing-account=YOUR_BILLING_ACCOUNT \
     --display-name="Holiday Park Monitor Budget" \
     --budget-amount=50 \
     --threshold-rule=percent=50 \
     --threshold-rule=percent=90 \
     --threshold-rule=percent=100
   ```

## Security Best Practices (Implemented)

1. **Authentication & Authorization** ✅
   - JWT-based authentication for users
   - API key authentication for services
   - Role-based access control (user, admin)
   - Scheduler token for webhooks

2. **Rate Limiting** ✅
   - IP-based rate limiting with express-rate-limit
   - Adaptive limits based on authentication status
   - Multiple tiers (strict, standard, public)
   - Rate limit headers in responses

3. **Security Headers** ✅
   - Helmet.js for comprehensive headers
   - CSP, XSS Protection, Frame Options
   - HSTS for HTTPS enforcement
   - CORS with configurable origins

4. **Input Validation** ✅
   - Automatic sanitization of all inputs
   - Zod schema validation
   - Express-validator rules
   - SQL injection prevention

5. **Firestore Security** ✅
   - Authentication required for all operations
   - User data isolation
   - Read-only collections for sensitive data
   - Admin-only write permissions

6. **Monitoring & Logging** ✅
   - Correlation IDs for request tracking
   - Comprehensive health checks
   - Request/response logging
   - Security event tracking

7. **Production Deployment**
   - Use Secret Manager for all secrets
   - Enable Cloud Armor for DDoS protection
   - Set up alerting for security events
   - Regular dependency updates
   - Rotate JWT secrets and API keys periodically

## Rollback Procedure

If deployment fails or issues arise:

```bash
# List recent revisions
gcloud run revisions list --service holiday-park-api --region europe-central2

# Rollback to previous revision
gcloud run services update-traffic holiday-park-api \
  --to-revisions=PREVIOUS_REVISION_ID=100 \
  --region europe-central2

# Or deploy a specific image tag
gcloud run deploy holiday-park-api \
  --image gcr.io/ai-lab-1-451411/holiday-park-api:PREVIOUS_COMMIT_SHA \
  --region europe-central2
```

## Maintenance Commands

```bash
# Update environment variables
gcloud run services update holiday-park-api \
  --update-env-vars KEY=VALUE

# Scale service
gcloud run services update holiday-park-api \
  --min-instances=1 \
  --max-instances=20

# Update memory/CPU
gcloud run services update holiday-park-api \
  --memory=1Gi \
  --cpu=2

# Pause scheduler
gcloud scheduler jobs pause holiday-park-monitor --location europe-central2

# Resume scheduler
gcloud scheduler jobs resume holiday-park-monitor --location europe-central2
```

## Support Resources

- [Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Cloud Build Documentation](https://cloud.google.com/build/docs)
- [Cloud Scheduler Documentation](https://cloud.google.com/scheduler/docs)
- [Firestore Documentation](https://cloud.google.com/firestore/docs)
- GCP Console: https://console.cloud.google.com/home/dashboard?project=ai-lab-1-451411

---

*Last Updated: 2025-08-31*
*Version: 2.0.0*
*Security Features: JWT Auth, API Keys, Rate Limiting, Helmet.js, Input Validation*