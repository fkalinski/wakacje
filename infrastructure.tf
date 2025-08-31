terraform {
  required_version = ">= 1.0"
  
  required_providers {
    google = {
      source  = "hashicorp/google"
      version = "~> 5.0"
    }
  }
}

provider "google" {
  project = var.project_id
  region  = var.region
}

# Variables
variable "project_id" {
  description = "GCP Project ID"
  type        = string
  default     = "ai-lab-1-451411"
}

variable "region" {
  description = "GCP Region"
  type        = string
  default     = "europe-central2"
}

variable "scheduler_token" {
  description = "Token for Cloud Scheduler authentication"
  type        = string
  sensitive   = true
  default     = "jpwBN0ro0+EW00QphAMMgewz1meAuPzHF9FlKI8GN80="
}

# Enable required APIs
resource "google_project_service" "firestore" {
  service = "firestore.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudrun" {
  service = "run.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudscheduler" {
  service = "cloudscheduler.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "cloudbuild" {
  service = "cloudbuild.googleapis.com"
  disable_on_destroy = false
}

resource "google_project_service" "secretmanager" {
  service = "secretmanager.googleapis.com"
  disable_on_destroy = false
}

# Firestore Database
resource "google_firestore_database" "database" {
  project     = var.project_id
  name        = "(default)"
  location_id = var.region
  type        = "FIRESTORE_NATIVE"

  concurrency_mode            = "PESSIMISTIC"
  app_engine_integration_mode = "DISABLED"
  delete_protection_state     = "DELETE_PROTECTION_DISABLED"
  deletion_policy            = "DELETE"

  depends_on = [google_project_service.firestore]
}

# Service Accounts
resource "google_service_account" "api_service_account" {
  account_id   = "holiday-park-api"
  display_name = "Holiday Park API Service Account"
  description  = "Service account for Holiday Park API running on Cloud Run"
}

resource "google_service_account" "scheduler_service_account" {
  account_id   = "holiday-park-scheduler"
  display_name = "Holiday Park Scheduler Service Account"
  description  = "Service account for Cloud Scheduler to invoke Cloud Run"
}

# IAM Bindings
resource "google_project_iam_member" "api_firestore_user" {
  project = var.project_id
  role    = "roles/datastore.user"
  member  = "serviceAccount:${google_service_account.api_service_account.email}"
}

resource "google_project_iam_member" "scheduler_run_invoker" {
  project = var.project_id
  role    = "roles/run.invoker"
  member  = "serviceAccount:${google_service_account.scheduler_service_account.email}"
}

# Service Account Key (optional - for local development)
resource "google_service_account_key" "api_key" {
  service_account_id = google_service_account.api_service_account.name
  private_key_type   = "TYPE_GOOGLE_CREDENTIALS_FILE"
}

# Cloud Run Service (placeholder - actual deployment via gcloud or CI/CD)
resource "google_cloud_run_v2_service" "api" {
  name     = "holiday-park-api"
  location = var.region
  
  template {
    service_account = google_service_account.api_service_account.email
    
    containers {
      image = "gcr.io/${var.project_id}/holiday-park-api:latest"
      
      env {
        name  = "NODE_ENV"
        value = "production"
      }
      
      env {
        name  = "FIREBASE_PROJECT_ID"
        value = var.project_id
      }
      
      env {
        name  = "SCHEDULER_TOKEN"
        value = var.scheduler_token
      }
      
      resources {
        limits = {
          cpu    = "2"
          memory = "2Gi"
        }
        cpu_idle = true
      }
      
      ports {
        container_port = 8080
      }
    }
    
    scaling {
      min_instance_count = 0
      max_instance_count = 100
    }
  }
  
  traffic {
    type    = "TRAFFIC_TARGET_ALLOCATION_TYPE_LATEST"
    percent = 100
  }
  
  depends_on = [
    google_project_service.cloudrun,
    google_service_account.api_service_account
  ]
}

# Cloud Run IAM - Allow unauthenticated access (optional)
resource "google_cloud_run_service_iam_member" "api_invoker" {
  service  = google_cloud_run_v2_service.api.name
  location = google_cloud_run_v2_service.api.location
  role     = "roles/run.invoker"
  member   = "serviceAccount:${google_service_account.scheduler_service_account.email}"
}

# Cloud Scheduler Job
resource "google_cloud_scheduler_job" "monitor_job" {
  name        = "holiday-park-monitor"
  description = "Trigger Holiday Park monitoring every 2 hours"
  schedule    = "0 */2 * * *"
  time_zone   = "Europe/Warsaw"
  region      = var.region
  
  retry_config {
    retry_count = 1
  }
  
  http_target {
    http_method = "POST"
    uri         = "${google_cloud_run_v2_service.api.uri}/api/webhooks/scheduler"
    
    headers = {
      "x-scheduler-token" = var.scheduler_token
    }
    
    oidc_token {
      service_account_email = google_service_account.scheduler_service_account.email
    }
  }
  
  depends_on = [
    google_project_service.cloudscheduler,
    google_cloud_run_v2_service.api
  ]
}

# Secrets (optional - for production use)
resource "google_secret_manager_secret" "scheduler_token" {
  secret_id = "scheduler-token"
  
  replication {
    auto {}
  }
  
  depends_on = [google_project_service.secretmanager]
}

resource "google_secret_manager_secret_version" "scheduler_token_version" {
  secret = google_secret_manager_secret.scheduler_token.id
  secret_data = var.scheduler_token
}

# Outputs
output "firestore_database" {
  value = google_firestore_database.database.name
  description = "Firestore database name"
}

output "api_service_account" {
  value = google_service_account.api_service_account.email
  description = "API service account email"
}

output "scheduler_service_account" {
  value = google_service_account.scheduler_service_account.email
  description = "Scheduler service account email"
}

output "cloud_run_url" {
  value = google_cloud_run_v2_service.api.uri
  description = "Cloud Run service URL"
}

output "service_account_key" {
  value     = google_service_account_key.api_key.private_key
  sensitive = true
  description = "Service account private key (base64 encoded)"
}