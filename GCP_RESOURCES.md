# GCP Resources Documentation

## Project Information
- **Project ID**: `ai-lab-1-451411`
- **Region**: `europe-central2`
- **Created**: 2025-08-31

## Created Resources

### 1. Enabled APIs
Successfully enabled the following Google Cloud APIs:
- ✅ **Firestore API** (`firestore.googleapis.com`)
- ✅ **Cloud Run API** (`run.googleapis.com`)
- ✅ **Cloud Scheduler API** (`cloudscheduler.googleapis.com`)
- ✅ **Cloud Build API** (`cloudbuild.googleapis.com`)
- ✅ **Secret Manager API** (`secretmanager.googleapis.com`)

### 2. Firestore Database
- **Name**: `(default)`
- **Location**: `europe-central2`
- **Type**: `FIRESTORE_NATIVE`
- **Mode**: `PESSIMISTIC`
- **Database ID**: `4c6b7dca-facc-4856-85ec-b93905e57f2c`
- **Status**: ✅ Created successfully

### 3. Service Accounts

#### API Service Account
- **Email**: `holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com`
- **Display Name**: Holiday Park API Service Account
- **Purpose**: Used by the Express.js API running on Cloud Run
- **Permissions**: 
  - `roles/datastore.user` - Read/write access to Firestore

#### Scheduler Service Account
- **Email**: `holiday-park-scheduler@ai-lab-1-451411.iam.gserviceaccount.com`
- **Display Name**: Holiday Park Scheduler Service Account
- **Purpose**: Used by Cloud Scheduler to invoke Cloud Run services
- **Permissions**:
  - `roles/run.invoker` - Permission to invoke Cloud Run services

### 4. Service Account Key
- **Created for**: `holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com`
- **Key ID**: `68fe924a5e1984c6d725ef47cf8a76c7c12c0265`
- **Location**: `./service-account-key.json`
- **Purpose**: Local development and CI/CD authentication

### 5. Environment Files

#### API Environment (`apps/api/.env`)
Updated with:
- GCP project configuration
- Firebase/Firestore credentials
- Service account details
- Scheduler token for webhook authentication

#### CLI Environment (`apps/cli/.env`)
Created with:
- GCP project configuration
- Firebase project ID for OAuth2 flow

### 6. Security Tokens
- **Scheduler Token**: Generated secure random token for webhook authentication
- **Stored in**: `apps/api/.env` as `SCHEDULER_TOKEN`

## Next Steps

### Deploy API to Cloud Run
```bash
# Build and push Docker image
gcloud builds submit --tag gcr.io/ai-lab-1-451411/holiday-park-api apps/api

# Deploy to Cloud Run
gcloud run deploy holiday-park-api \
  --image gcr.io/ai-lab-1-451411/holiday-park-api \
  --platform managed \
  --region europe-central2 \
  --service-account holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com \
  --set-env-vars NODE_ENV=production \
  --allow-unauthenticated
```

### Create Cloud Scheduler Job
```bash
# Get the Cloud Run service URL first
SERVICE_URL=$(gcloud run services describe holiday-park-api \
  --platform managed \
  --region europe-central2 \
  --format 'value(status.url)')

# Create scheduler job
gcloud scheduler jobs create http holiday-park-monitor \
  --location europe-central2 \
  --schedule "0 */2 * * *" \
  --http-method POST \
  --uri "${SERVICE_URL}/api/webhooks/scheduler" \
  --headers "x-scheduler-token=jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80=" \
  --oidc-service-account-email holiday-park-scheduler@ai-lab-1-451411.iam.gserviceaccount.com
```

### Configure Firestore Security Rules
```javascript
// Deploy these rules to Firestore
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    // Searches collection
    match /searches/{searchId} {
      allow read, write: if request.auth != null;
    }
    
    // Availabilities collection
    match /availabilities/{availabilityId} {
      allow read: if request.auth != null;
      allow write: if request.auth != null;
    }
    
    // Search results collection
    match /searchResults/{resultId} {
      allow read: if request.auth != null;
      allow write: if false; // Only backend can write
    }
  }
}
```

### Terraform Management
The `infrastructure.tf` file has been created to manage these resources declaratively. To use it:

```bash
# Initialize Terraform
terraform init

# Review planned changes
terraform plan

# Apply configuration
terraform apply
```

## Important Notes

### Security Considerations
1. **Service Account Key**: Keep `service-account-key.json` secure and never commit to version control
2. **Scheduler Token**: Rotate periodically for security
3. **Firestore Rules**: Currently permissive - tighten for production
4. **CORS**: Update `CORS_ORIGIN` in production environment

### Cost Optimization
1. **Cloud Run**: Configured with min instances = 0 for cost savings
2. **Firestore**: Using free tier with native mode
3. **Cloud Scheduler**: Running every 2 hours to minimize operations

### Monitoring
1. Set up Cloud Monitoring alerts for:
   - Cloud Run errors
   - Firestore quota usage
   - Failed scheduler jobs
2. Enable Cloud Logging for debugging

### Backup Strategy
1. Enable Firestore backups:
```bash
gcloud firestore operations export gs://ai-lab-1-451411-backups/$(date +%Y%m%d)
```

2. Schedule regular backups via Cloud Scheduler

## Resource Cleanup (if needed)
To remove all created resources:

```bash
# Delete service accounts
gcloud iam service-accounts delete holiday-park-api@ai-lab-1-451411.iam.gserviceaccount.com
gcloud iam service-accounts delete holiday-park-scheduler@ai-lab-1-451411.iam.gserviceaccount.com

# Delete Firestore (WARNING: This deletes all data)
gcloud firestore databases delete --database=(default)

# Or use Terraform
terraform destroy
```

## Support
For issues or questions about these resources:
- Check GCP Console: https://console.cloud.google.com/home/dashboard?project=ai-lab-1-451411
- Review logs in Cloud Logging
- Monitor metrics in Cloud Monitoring