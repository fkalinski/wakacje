# Holiday Park Monitor - GCP Deployment Guide

## Prerequisites Verification
- ✅ GCP Project: `ai-lab-1-451411`
- ✅ APIs Enabled: Firestore, Cloud Run, Cloud Scheduler, Cloud Build, Secret Manager
- ✅ Service Accounts Created
- ✅ Firestore Database Configured
- ✅ Service Account Key: `service-account-key.json`

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

# Deploy to Cloud Run with environment variables
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
  --set-env-vars SCHEDULER_TOKEN=jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80=
```

### 2.3 Set Environment Variables from Secret Manager (Recommended)
```bash
# Create secrets
echo -n "your-firebase-private-key" | gcloud secrets create firebase-private-key --data-file=-
echo -n "your-firebase-client-email" | gcloud secrets create firebase-client-email --data-file=-
echo -n "jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80=" | gcloud secrets create scheduler-token --data-file=-

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

# Deploy with secrets
gcloud run deploy holiday-park-api \
  --update-secrets=FIREBASE_PRIVATE_KEY=firebase-private-key:latest,FIREBASE_CLIENT_EMAIL=firebase-client-email:latest,SCHEDULER_TOKEN=scheduler-token:latest
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

### 5.1 Create firestore.rules file
```bash
cat > firestore.rules << 'EOF'
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /searches/{searchId} {
      allow read, write: if true; // Temporary for testing
    }
    match /results/{resultId} {
      allow read: if true;
      allow write: if false; // Only backend
    }
    match /availabilities/{document=**} {
      allow read: if true;
      allow write: if false; // Only backend
    }
  }
}
EOF
```

### 5.2 Deploy Rules
```bash
gcloud firestore rules deploy firestore.rules
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

- [ ] API health endpoint responds: `curl $SERVICE_URL/health`
- [ ] Can create a search via API: `curl -X POST $SERVICE_URL/api/searches -d '{...}'`
- [ ] Cloud Scheduler job runs successfully
- [ ] Firestore has data after scheduler run
- [ ] Web app can connect to API
- [ ] CORS is properly configured

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

Save this as `deploy.sh` for one-command deployment:

```bash
#!/bin/bash
set -e

# Configuration
PROJECT_ID="ai-lab-1-451411"
REGION="europe-central2"
SERVICE_NAME="holiday-park-api"

echo "🚀 Starting deployment to GCP..."

# Build and deploy
echo "📦 Building and deploying API..."
gcloud builds submit --config cloudbuild.yaml

# Get service URL
SERVICE_URL=$(gcloud run services describe $SERVICE_NAME \
  --platform managed \
  --region $REGION \
  --format 'value(status.url)')

echo "✅ API deployed at: $SERVICE_URL"

# Test health endpoint
echo "🏥 Testing health endpoint..."
curl -s "$SERVICE_URL/health" | jq .

# Set up scheduler if it doesn't exist
if ! gcloud scheduler jobs describe holiday-park-monitor --location $REGION &>/dev/null; then
  echo "⏰ Creating Cloud Scheduler job..."
  gcloud scheduler jobs create http holiday-park-monitor \
    --location $REGION \
    --schedule "0 */2 * * *" \
    --http-method POST \
    --uri "${SERVICE_URL}/api/webhooks/scheduler" \
    --headers "x-scheduler-token=jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80=" \
    --oidc-service-account-email holiday-park-scheduler@${PROJECT_ID}.iam.gserviceaccount.com \
    --oidc-token-audience "${SERVICE_URL}"
fi

echo "🎉 Deployment complete!"
echo "📊 View logs: gcloud logging tail \"resource.type=cloud_run_revision\""
echo "🌐 API URL: $SERVICE_URL"
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

## Security Best Practices

1. **Service Account Keys**
   - Never commit `service-account-key.json` to version control
   - Use Secret Manager for production
   - Rotate keys periodically

2. **API Security**
   - Keep scheduler token secret
   - Implement rate limiting
   - Use HTTPS only
   - Validate all inputs

3. **Firestore Rules**
   - Tighten rules for production
   - Implement user authentication
   - Audit access patterns

4. **Monitoring**
   - Enable Cloud Armor for DDoS protection
   - Set up alerting for suspicious activity
   - Regular security audits

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

*Last Updated: 2024*
*Version: 1.0.0*