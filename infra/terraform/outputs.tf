output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "pymasters_cloud_run_url" {
  value       = google_cloud_run_v2_service.pymasters.uri
  description = "pymasters.net Cloud Run URL"
}

output "tfstate_bucket" {
  value = "${var.project_id}-tfstate"
}
