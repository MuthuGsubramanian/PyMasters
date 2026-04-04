# Look up the billing account
data "google_billing_account" "pymasters" {
  display_name = "PyMasters startup"
  open         = true
}

# Budget with alerts at 50%, 80%, 100%
resource "google_billing_budget" "monthly" {
  billing_account = data.google_billing_account.pymasters.id
  display_name    = "PyMasters Monthly Budget"

  amount {
    specified_amount {
      currency_code = "INR"
      units         = tostring(var.monthly_budget_inr)
    }
  }

  budget_filter {
    projects = ["projects/${var.project_id}"]
  }

  threshold_rules {
    threshold_percent = 0.5
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 0.8
    spend_basis       = "CURRENT_SPEND"
  }

  threshold_rules {
    threshold_percent = 1.0
    spend_basis       = "CURRENT_SPEND"
  }

  all_updates_rule {
    monitoring_notification_channels = [
      google_monitoring_notification_channel.email.name
    ]
  }
}

# Email notification channel for alerts
resource "google_monitoring_notification_channel" "email" {
  display_name = "PyMasters Alert Email"
  type         = "email"

  labels = {
    email_address = var.alert_email
  }
}

# Uptime check for pymasters.net
resource "google_monitoring_uptime_check_config" "pymasters" {
  display_name = "pymasters.net health"
  timeout      = "10s"
  period       = "300s"

  http_check {
    path         = "/health"
    port         = 443
    use_ssl      = true
    validate_ssl = true
  }

  monitored_resource {
    type = "uptime_url"
    labels = {
      project_id = var.project_id
      host       = "pymasters-977064896391.us-central1.run.app"
    }
  }
}

# Alert policy for pymasters.net downtime
resource "google_monitoring_alert_policy" "pymasters_down" {
  display_name = "pymasters.net is DOWN"
  combiner     = "OR"

  conditions {
    display_name = "Uptime check failing"

    condition_threshold {
      filter          = "resource.type = \"uptime_url\" AND metric.type = \"monitoring.googleapis.com/uptime_check/check_passed\""
      comparison      = "COMPARISON_GT"
      threshold_value = 1
      duration        = "300s"

      aggregations {
        alignment_period     = "300s"
        per_series_aligner   = "ALIGN_NEXT_OLDER"
        cross_series_reducer = "REDUCE_COUNT_FALSE"
        group_by_fields      = ["resource.label.project_id"]
      }
    }
  }

  notification_channels = [
    google_monitoring_notification_channel.email.name
  ]

  alert_strategy {
    auto_close = "1800s"
  }
}
