#!/bin/bash

# Holiday Park Monitor Deployment Script

set -e

PROJECT_ID="your-project-id"
REGION="europe-central2"
SERVICE_NAME="holiday-park-api"

echo "🚀 Starting deployment for Holiday Park Monitor"

# Build and deploy API to Cloud Run
echo "📦 Building and deploying API to Cloud Run..."
gcloud builds submit \
  --config cloudbuild.yaml \
  --substitutions=_PROJECT_ID=$PROJECT_ID

# Create Cloud Scheduler job if it doesn't exist
echo "⏰ Setting up Cloud Scheduler..."
gcloud scheduler jobs describe holiday-park-monitor \
  --location=$REGION 2>/dev/null || \
gcloud scheduler jobs create http holiday-park-monitor \
  --location=$REGION \
  --schedule="0 */2 * * *" \
  --uri="https://$SERVICE_NAME-$(gcloud config get-value project).run.app/api/webhooks/scheduler" \
  --http-method=POST \
  --headers="x-scheduler-token=${SCHEDULER_SECRET}" \
  --time-zone="Europe/Warsaw"

# Deploy web app to Vercel
echo "🌐 Deploying web app to Vercel..."
cd apps/web
vercel --prod

echo "✅ Deployment complete!"
echo ""
echo "API URL: https://$SERVICE_NAME-$PROJECT_ID.run.app"
echo "Don't forget to:"
echo "1. Set environment variables in Cloud Run console"
echo "2. Set environment variables in Vercel dashboard"
echo "3. Configure Firebase security rules"