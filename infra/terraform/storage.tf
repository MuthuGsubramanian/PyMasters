# Bucket for PyMasters data (models, backups, pipeline outputs)
resource "google_storage_bucket" "pymasters_data" {
  name          = "${var.project_id}-pymasters-data"
  location      = var.region
  force_destroy = false

  uniform_bucket_level_access = true

  lifecycle_rule {
    condition {
      age = 90
    }
    action {
      type          = "SetStorageClass"
      storage_class = "NEARLINE"
    }
  }

  lifecycle_rule {
    condition {
      age = 365
    }
    action {
      type = "Delete"
    }
  }
}

# Grant runtime SA access to the data bucket
resource "google_storage_bucket_iam_member" "runtime_data_access" {
  bucket = google_storage_bucket.pymasters_data.name
  role   = "roles/storage.objectAdmin"
  member = "serviceAccount:${google_service_account.pymasters_runtime.email}"
}
