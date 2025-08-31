# GitHub Automatic Deployment Setup

This guide will help you set up automatic deployments to Google Cloud Run whenever you push to GitHub (similar to Vercel).

## Prerequisites

✅ GCP Project: `ai-lab-1-451411`
✅ Cloud Build API enabled
✅ Cloud Run service deployed: `holiday-park-api`
✅ `cloudbuild.yaml` configured for git triggers (using `$COMMIT_SHA`)

## Step 1: Create GitHub Repository

1. Create a new repository on GitHub:
   - Go to: https://github.com/new
   - Repository name: `wakacje`
   - Description: "Holiday Park Monitor - Monorepo for monitoring vacation availabilities"
   - Public or Private (your choice)
   - **Do NOT** initialize with README (we already have code)

2. Push your existing code:
   ```bash
   git remote add origin https://github.com/fkalinski/wakacje.git
   git branch -M main
   git push -u origin main
   ```

## Step 2: Connect GitHub to Cloud Build

### Option A: Using Cloud Console (Easiest)

1. **Open Cloud Build Triggers page:**
   https://console.cloud.google.com/cloud-build/triggers?project=ai-lab-1-451411

2. **Click "Connect Repository"**

3. **Select "GitHub"** as the source

4. **Authenticate with GitHub:**
   - Click "Authenticate"
   - Sign in with your GitHub account (fkalinski)
   - Authorize Google Cloud Build

5. **Select Repository:**
   - Choose `fkalinski/wakacje`
   - Click "Connect"

6. **Create Trigger:**
   - Name: `deploy-holiday-park-api-production`
   - Description: "Deploy to Cloud Run on push to main"
   - Event: Push to branch
   - Branch: `^main$`
   - Configuration: Cloud Build configuration file
   - Location: `/cloudbuild.yaml`
   - Click "Create"

### Option B: Using Command Line

1. **First, connect GitHub repository** (must be done via Console at least once):
   - Go to: https://console.cloud.google.com/cloud-build/triggers/connect
   - Follow authentication steps above

2. **Run the setup script:**
   ```bash
   ./setup-cloud-build-trigger.sh
   ```

## Step 3: Test Automatic Deployment

1. **Make a small change** (e.g., update README):
   ```bash
   echo "# Automatic deployment test" >> README.md
   git add README.md
   git commit -m "Test automatic deployment"
   git push origin main
   ```

2. **Monitor the build:**
   - Go to: https://console.cloud.google.com/cloud-build/builds
   - You should see a new build triggered automatically
   - Build will take ~3-5 minutes

3. **Verify deployment:**
   ```bash
   curl https://holiday-park-api-3q2xuaoyma-lm.a.run.app/health
   ```

## Build Status

Once configured, every push to GitHub will:
- `main` branch → Deploy to production (`holiday-park-api`)
- `develop` branch → Deploy to staging (`holiday-park-api-staging`)
- `feature/*` branches → Require manual approval

## Advanced Configuration

### Branch-Specific Deployments

We've included `cloudbuild-staging.yaml` for staging deployments:
- Different service name
- Lower resource limits
- Staging environment variables

### Build Notifications

To get Slack/Discord notifications:
1. Add a webhook step to `cloudbuild.yaml`
2. Use Cloud Build substitutions for build status

### Manual Trigger Control

View and manage triggers:
```bash
gcloud builds triggers list
gcloud builds triggers run deploy-holiday-park-api-production --branch=main
```

## Troubleshooting

### "Repository not found" error
- Ensure GitHub repository is connected in Cloud Console
- Check repository permissions

### Build fails with "COMMIT_SHA not found"
- This only works with GitHub triggers, not manual `gcloud builds submit`
- Ensure you're pushing to GitHub, not running locally

### Permission denied errors
- Grant Cloud Build service account necessary permissions:
  ```bash
  gcloud projects add-iam-policy-binding ai-lab-1-451411 \
    --member="serviceAccount:524125190961@cloudbuild.gserviceaccount.com" \
    --role="roles/run.admin"
  ```

## Summary

After setup, your deployment flow will be:

```
Git Push → GitHub → Cloud Build Trigger → Build Docker Image → Deploy to Cloud Run
```

This gives you:
- ✅ Automatic deployments on every push (like Vercel)
- ✅ Branch-based environments
- ✅ Rollback capability (using commit SHAs)
- ✅ Build history linked to commits
- ✅ Zero-downtime deployments