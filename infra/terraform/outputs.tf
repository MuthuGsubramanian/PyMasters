output "project_id" {
  value = var.project_id
}

output "region" {
  value = var.region
}

output "pymasters_cloud_run_url" {
  value       = "https://pymasters-977064896391.us-central1.run.app"
  description = "pymasters.net Cloud Run URL"
}

output "tfstate_bucket" {
  value = "${var.project_id}-tfstate"
}
