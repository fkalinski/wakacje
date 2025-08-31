#!/bin/bash

# This script creates Cloud Build triggers AFTER GitHub has been connected via Console

echo "Creating Cloud Build triggers..."

# Production trigger
gcloud builds triggers create github \
    --repo-name="wakacje" \
    --repo-owner="fkalinski" \
    --branch-pattern="^main$" \
    --build-config="cloudbuild.yaml" \
    --name="deploy-api-production" \
    --description="Auto-deploy API to production on push to main"

# Staging trigger (optional)
gcloud builds triggers create github \
    --repo-name="wakacje" \
    --repo-owner="fkalinski" \
    --branch-pattern="^develop$" \
    --build-config="cloudbuild-staging.yaml" \
    --name="deploy-api-staging" \
    --description="Auto-deploy API to staging on push to develop"

echo "✅ Triggers created successfully!"
echo "View at: https://console.cloud.google.com/cloud-build/triggers?project=ai-lab-1-451411"