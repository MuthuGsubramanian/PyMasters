package net.pymasters.app

import java.net.URI

/**
 * Pure URL & deep-link routing rules for the PyMasters Android shell.
 */
object UrlRouter {
    const val DEFAULT_ORIGIN = "https://pymasters.net"
    const val DEFAULT_START_URL = "$DEFAULT_ORIGIN/dashboard"

    private val IN_APP_HOSTS = setOf(
        "pymasters.net",
        "www.pymasters.net",
        "checkout.razorpay.com",
        "api.razorpay.com",
        "accounts.google.com"
    )

    private val GESTURE_PROTECTED_PREFIXES = listOf(
        "/dashboard/play",
        "/dashboard/playground",
        "/play"
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
                    if (host == "pymasters.net" || host == "www.pymasters.net") {
                        val path = uri.rawPath?.takeIf { it.isNotEmpty() } ?: "/"
                        val query = uri.rawQuery?.let { "?$it" }.orEmpty()
                        val fragment = uri.rawFragment?.let { "#$it" }.orEmpty()
                        "$baseOrigin$path$query$fragment"
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
            // Allow GitHub OAuth sign-in screen inside WebView, open general GitHub repos externally
            if (host == "github.com" && (uri.rawPath?.startsWith("/login") == true || uri.rawPath?.startsWith("/session") == true)) {
                return true
            }
            false
        } catch (_: Exception) {
            false
        }
    }

    /**
     * Returns true for routes with touch-canvas games or code editors where vertical swipe
     * must not trigger SwipeRefreshLayout.
     */
    fun isSwipeGestureProtected(url: String?): Boolean {
        val raw = url?.trim().orEmpty()
        if (raw.isEmpty()) return false
        return try {
            val path = URI(raw).rawPath?.lowercase().orEmpty()
            GESTURE_PROTECTED_PREFIXES.any { path.startsWith(it) }
        } catch (_: Exception) {
            false
        }
    }
}
