package net.pymasters.app

import java.net.URI

/**
 * Pure URL & deep-link routing rules for the PyMasters Android shell.
 */
object UrlRouter {
    const val DEFAULT_ORIGIN = "https://pymasters.net"
    const val DEFAULT_START_URL = "$DEFAULT_ORIGIN/dashboard"

    private val TRUSTED_BRIDGE_HOSTS = setOf(
        "pymasters.net",
        "www.pymasters.net",
        "pymasters.ai.studio"
    )

    private val IN_APP_HOSTS = TRUSTED_BRIDGE_HOSTS + setOf(
        "accounts.google.com"
    )

    /**
     * Resolves an incoming deep link (https://pymasters.net/... or pymasters://...) into a safe HTTPS URL.
     */
    fun resolveIncomingUrl(rawUri: String?, baseOrigin: String = DEFAULT_ORIGIN): String {
        val raw = rawUri?.trim().orEmpty()
        if (raw.isEmpty()) return "$baseOrigin/dashboard"

        return try {
            val uri = URI(raw)
            val scheme = uri.scheme?.lowercase().orEmpty()
            when (scheme) {
                "https", "http" -> {
                    val host = uri.host?.lowercase().orEmpty()
                    if (host in TRUSTED_BRIDGE_HOSTS) {
                        val path = uri.rawPath?.takeIf { it.isNotEmpty() } ?: "/"
                        val query = uri.rawQuery?.let { "?$it" }.orEmpty()
                        val fragment = uri.rawFragment?.let { "#$it" }.orEmpty()
                        val origin = if (host == "pymasters.ai.studio") "https://pymasters.ai.studio" else baseOrigin
                        "$origin$path$query$fragment"
                    } else {
                        "$baseOrigin/dashboard"
                    }
                }
                "pymasters" -> {
                    val hostPart = uri.host?.takeIf { it.isNotBlank() }?.let { "/$it" }.orEmpty()
                    val pathPart = uri.rawPath.orEmpty()
                    val combined = (hostPart + pathPart).ifEmpty { "/dashboard" }
                    val normalizedPath = when {
                        combined.startsWith("/dashboard") || combined == "/" -> combined
                        combined in listOf("/classroom", "/play", "/vaathiyaar", "/playground", "/paths", "/challenges", "/profile") ->
                            "/dashboard$combined"
                        else -> combined
                    }
                    val query = uri.rawQuery?.let { "?$it" }.orEmpty()
                    val fragment = uri.rawFragment?.let { "#$it" }.orEmpty()
                    "$baseOrigin$normalizedPath$query$fragment"
                }
                else -> "$baseOrigin/dashboard"
            }
        } catch (_: Exception) {
            "$baseOrigin/dashboard"
        }
    }

    /**
     * Returns true if the URL should load directly inside the PyMasters WebView.
     */
    fun shouldOpenInWebView(url: String?): Boolean {
        val raw = url?.trim().orEmpty()
        if (raw.isEmpty()) return false
        return try {
            val uri = URI(raw)
            val scheme = uri.scheme?.lowercase().orEmpty()
            if (scheme != "https" && scheme != "http") return false
            val host = uri.host?.lowercase().orEmpty()
            if (host in IN_APP_HOSTS) return true
            val rawPath = uri.rawPath.orEmpty()
            // Allow GitHub OAuth sign-in screen inside WebView, open general GitHub repos externally
            if (host == "github.com" && (rawPath.startsWith("/login") || rawPath.startsWith("/session"))) {
                return true
            }
            // Allow LinkedIn OAuth sign-in flow inside WebView, open LinkedIn profiles externally
            if ((host == "linkedin.com" || host == "www.linkedin.com") &&
                (rawPath.startsWith("/oauth/") || rawPath.startsWith("/uas/") || rawPath.startsWith("/checkpoint/"))
            ) {
                return true
            }
            false
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Returns true ONLY when the active WebView frame is on a first-party HTTPS PyMasters origin
     * allowed to invoke privileged native bridge operations (such as Google Play Billing).
     */
    fun isTrustedBridgeOrigin(url: String?): Boolean {
        val raw = url?.trim().orEmpty()
        if (raw.isEmpty()) return false
        return try {
            val uri = URI(raw)
            val scheme = uri.scheme?.lowercase().orEmpty()
            val host = uri.host?.lowercase().orEmpty()
            scheme == "https" && uri.userInfo == null && host in TRUSTED_BRIDGE_HOSTS
        } catch (_: Exception) {
            false
        }
    }
}
