# Secret for Ollama API key used by pymasters.net
resource "google_secret_manager_secret" "ollama_api_key" {
  secret_id = "ollama-api-key"

  replication {
    auto {}
  }
}

# Secret for GitHub Personal Access Token (used by Cloud Build triggers)
resource "google_secret_manager_secret" "github_token" {
  secret_id = "github-token"

  replication {
    auto {}
  }
}

# Note: Secret values are set manually via gcloud CLI after terraform apply:
#   gcloud secrets versions add ollama-api-key --data-file=-
#   gcloud secrets versions add github-token --data-file=-
