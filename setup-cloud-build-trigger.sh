#!/bin/bash

# Cloud Build Trigger Setup Script for Holiday Park Monitor
# This script creates Cloud Build triggers for automatic deployment from GitHub

set -e

PROJECT_ID="ai-lab-1-451411"
REGION="europe-central2"
GITHUB_OWNER="fkalinski"
GITHUB_REPO="wakacje"

echo "🚀 Setting up Cloud Build triggers for automatic deployment..."

# Check if user is authenticated
if ! gcloud auth list --filter=status:ACTIVE --format="value(account)" > /dev/null 2>&1; then
    echo "❌ Not authenticated with GCP. Please run: gcloud auth login"
    exit 1
fi

echo "📋 Current project: $PROJECT_ID"
gcloud config set project $PROJECT_ID

echo ""
echo "⚠️  IMPORTANT: Before running this script, you need to:"
echo "1. Push your code to GitHub: https://github.com/$GITHUB_OWNER/$GITHUB_REPO"
echo "2. Connect GitHub to Cloud Build:"
echo "   - Go to: https://console.cloud.google.com/cloud-build/triggers/connect"
echo "   - Select 'GitHub' and authenticate"
echo "   - Select repository: $GITHUB_OWNER/$GITHUB_REPO"
echo "   - Grant permissions"
echo ""
read -p "Have you completed these steps? (y/n): " -n 1 -r
echo
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Please complete the GitHub connection first."
    exit 1
fi

# Create production trigger (main branch)
echo "🔧 Creating production trigger for main branch..."
gcloud builds triggers create github \
    --repo-name="$GITHUB_REPO" \
    --repo-owner="$GITHUB_OWNER" \
    --branch-pattern="^main$" \
    --build-config="cloudbuild.yaml" \
    --name="deploy-holiday-park-api-production" \
    --description="Deploy Holiday Park API to production on push to main" \
    --region="global" || echo "Trigger may already exist"

# Create staging trigger (develop branch)
echo "🔧 Creating staging trigger for develop branch..."
gcloud builds triggers create github \
    --repo-name="$GITHUB_REPO" \
    --repo-owner="$GITHUB_OWNER" \
    --branch-pattern="^develop$" \
    --build-config="cloudbuild-staging.yaml" \
    --name="deploy-holiday-park-api-staging" \
    --description="Deploy Holiday Park API to staging on push to develop" \
    --region="global" || echo "Trigger may already exist"

# Create feature branch trigger (optional)
echo "🔧 Creating feature branch trigger..."
gcloud builds triggers create github \
    --repo-name="$GITHUB_REPO" \
    --repo-owner="$GITHUB_OWNER" \
    --branch-pattern="^feature/.*$" \
    --build-config="cloudbuild-staging.yaml" \
    --name="deploy-holiday-park-api-feature" \
    --description="Deploy Holiday Park API feature branches" \
    --region="global" \
    --require-approval || echo "Trigger may already exist"

echo ""
echo "✅ Cloud Build triggers created successfully!"
echo ""
echo "📝 Trigger Summary:"
echo "  - Production: Push to 'main' → Deploy to holiday-park-api"
echo "  - Staging: Push to 'develop' → Deploy to holiday-park-api-staging"
echo "  - Features: Push to 'feature/*' → Manual approval required"
echo ""
echo "🔍 View your triggers at:"
echo "https://console.cloud.google.com/cloud-build/triggers?project=$PROJECT_ID"
echo ""
echo "🚀 To test automatic deployment:"
echo "1. Make a change to your code"
echo "2. Commit and push to main branch:"
echo "   git add ."
echo "   git commit -m 'Test automatic deployment'"
echo "   git push origin main"
echo "3. Watch the build at: https://console.cloud.google.com/cloud-build/builds?project=$PROJECT_ID"