variable "project_id" {
  description = "GCP project ID for PyMasters"
  type        = string
}

variable "region" {
  description = "Default GCP region"
  type        = string
  default     = "us-central1"
}

variable "pymasters_repo_owner" {
  description = "GitHub org owning the repos"
  type        = string
  default     = "MuthuGsubramanian"
}

variable "pymasters_repo_name" {
  description = "PyMasters GitHub repo name"
  type        = string
  default     = "PyMasters"
}

variable "homie_repo_name" {
  description = "Homie GitHub repo name"
  type        = string
  default     = "Homie"
}

variable "monthly_budget_inr" {
  description = "Monthly budget cap in INR"
  type        = number
  default     = 20000
}

variable "alert_email" {
  description = "Email for budget and uptime alerts"
  type        = string
  default     = "muthu@pymasters.net"
}
