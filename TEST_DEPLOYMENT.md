# Automatic Deployment Test

This file is used to test automatic deployments.

## Deployment Status

- **GitHub Repository**: ✅ Created (https://github.com/fkalinski/wakacje)
- **Vercel Integration**: ✅ Connected (auto-deploys web app)
- **Cloud Build Trigger**: ✅ Created and triggering (debugging Docker build)

## Test Deployments

When you push this file to GitHub, you should see:

1. **Vercel**: Automatic deployment of web app
   - Check: https://vercel.com/fkalinskis-projects/wakacje
   - Live URL: https://wakacje-5yqr8128p-fkalinskis-projects.vercel.app

2. **Cloud Run**: Automatic deployment of API (after trigger setup)
   - Check: https://console.cloud.google.com/cloud-build/builds?project=ai-lab-1-451411
   - API URL: https://holiday-park-api-3q2xuaoyma-lm.a.run.app

## Timestamp

Last update: 2025-08-31 22:00:00
Automatic deployment test: 2025-08-31 22:15:00 ✅

## Build Status

| Platform | Status | Details |
|----------|--------|---------|
| Vercel | ✅ Success | Auto-deploys on every push |
| Cloud Build | ⚠️ Failing | Docker build step fails - debugging in progress |

### Latest Build IDs
- Cloud Build: cb271d7d-834e-48c8-9dda-02ef16f62af9
- Issue: Docker build fails at step 2
- Next steps: Check logs in Cloud Console for detailed error