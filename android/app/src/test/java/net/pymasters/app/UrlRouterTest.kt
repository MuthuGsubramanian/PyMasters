package net.pymasters.app

import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test

class UrlRouterTest {

    @Test
    fun resolvesBlankOrUnknownInputToDashboard() {
        assertEquals("https://pymasters.net/dashboard", UrlRouter.resolveIncomingUrl(null))
        assertEquals("https://pymasters.net/dashboard", UrlRouter.resolveIncomingUrl(""))
        assertEquals("https://pymasters.net/dashboard", UrlRouter.resolveIncomingUrl("https://evil.example.com/phish"))
    }

    @Test
    fun resolvesHttpsDeepLinksToCanonicalOrigin() {
        assertEquals(
            "https://pymasters.net/dashboard/play#arcade",
            UrlRouter.resolveIncomingUrl("https://www.pymasters.net/dashboard/play#arcade")
        )
        assertEquals(
            "https://pymasters.net/dashboard/classroom?lesson=loops",
            UrlRouter.resolveIncomingUrl("https://pymasters.net/dashboard/classroom?lesson=loops")
        )
        assertEquals(
            "https://pymasters.ai.studio/dashboard/upgrade?plan=pro",
            UrlRouter.resolveIncomingUrl("https://pymasters.ai.studio/dashboard/upgrade?plan=pro")
        )
    }

    @Test
    fun resolvesCustomSchemeShortcuts() {
        assertEquals(
            "https://pymasters.net/dashboard/play",
            UrlRouter.resolveIncomingUrl("pymasters://play")
        )
        assertEquals(
            "https://pymasters.net/dashboard/vaathiyaar",
            UrlRouter.resolveIncomingUrl("pymasters://vaathiyaar")
        )
    }

    @Test
    fun classifiesInAppVsExternalUrlsAndRejectsExternalWebPaymentGateways() {
        assertTrue(UrlRouter.shouldOpenInWebView("https://pymasters.net/dashboard"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://www.pymasters.net/pricing"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://pymasters.ai.studio/dashboard/upgrade"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://accounts.google.com/o/oauth2/v2/auth"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://github.com/login/oauth/authorize"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://github.com/session"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://www.linkedin.com/oauth/v2/authorization"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://www.linkedin.com/uas/login"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://linkedin.com/checkpoint/challenge/123"))

        // Google Play Payments Policy: external web payment gateways must NEVER open inside WebView
        assertFalse(UrlRouter.shouldOpenInWebView("https://checkout.razorpay.com/v1/checkout.js"))
        assertFalse(UrlRouter.shouldOpenInWebView("https://api.razorpay.com/v1/orders"))

        assertFalse(UrlRouter.shouldOpenInWebView("https://github.com/MuthuGsubramanian/PyMasters"))
        assertFalse(UrlRouter.shouldOpenInWebView("https://www.linkedin.com/in/muthu"))
        assertFalse(UrlRouter.shouldOpenInWebView("mailto:legal@pymasters.net"))
        assertFalse(UrlRouter.shouldOpenInWebView("upi://pay?pa=pymasters@icici"))
    }

    @Test
    fun enforcesStrictHttpsOriginForPrivilegedBillingBridge() {
        assertTrue(UrlRouter.isTrustedBridgeOrigin("https://pymasters.net/dashboard/upgrade"))
        assertTrue(UrlRouter.isTrustedBridgeOrigin("https://www.pymasters.net/pricing"))
        assertTrue(UrlRouter.isTrustedBridgeOrigin("https://pymasters.ai.studio/dashboard/upgrade"))

        assertFalse(UrlRouter.isTrustedBridgeOrigin(null))
        assertFalse(UrlRouter.isTrustedBridgeOrigin(""))
        assertFalse(UrlRouter.isTrustedBridgeOrigin("http://pymasters.net/pricing"))
        assertFalse(UrlRouter.isTrustedBridgeOrigin("https://accounts.google.com/o/oauth2/v2/auth"))
        assertFalse(UrlRouter.isTrustedBridgeOrigin("https://github.com/login"))
        assertFalse(UrlRouter.isTrustedBridgeOrigin("https://www.linkedin.com/oauth/v2/authorization"))
        assertFalse(UrlRouter.isTrustedBridgeOrigin("https://pymasters.net@evil.example.com/upgrade"))
        assertFalse(UrlRouter.isTrustedBridgeOrigin("https://evil.example.com"))
    }

    @Test
    fun protectsTouchGesturesOnPlayAndPlaygroundRoutes() {
        assertTrue(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/play"))
        assertTrue(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/play/linked_snake"))
        assertTrue(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/playground"))
        assertFalse(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/classroom"))
        assertFalse(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard"))
    }

    @Test
    fun parsesAndNormalizesPlayBillingSkusSafely() {
        assertEquals(
            listOf("pymasters_beginner_monthly", "pymasters_pro_monthly"),
            PlayBillingManager.parseProductIds("""["pymasters_beginner_monthly", "pymasters_pro_monthly"]""")
        )
        assertEquals(
            listOf("pymasters_pro_monthly"),
            PlayBillingManager.parseProductIds("pymasters_pro_monthly")
        )
        assertEquals(
            emptyList<String>(),
            PlayBillingManager.parseProductIds("""["bad sku with spaces", "<script>"]""")
        )
        assertEquals("subs", PlayBillingManager.normalizeProductType("subs", "pymasters_pro_monthly"))
        assertEquals("subs", PlayBillingManager.normalizeProductType("pro", "pymasters_pro_monthly"))
        assertEquals("inapp", PlayBillingManager.normalizeProductType("inapp", "pymasters_pro_30d"))
        assertEquals("inapp", PlayBillingManager.normalizeProductType(null, "pymasters_pro_30d"))
    }
}
