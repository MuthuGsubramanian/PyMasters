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
    fun classifiesInAppVsExternalUrls() {
        assertTrue(UrlRouter.shouldOpenInWebView("https://pymasters.net/dashboard"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://checkout.razorpay.com/v1/checkout.js"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://accounts.google.com/o/oauth2/v2/auth"))
        assertTrue(UrlRouter.shouldOpenInWebView("https://github.com/login/oauth/authorize"))

        assertFalse(UrlRouter.shouldOpenInWebView("https://github.com/MuthuGsubramanian/PyMasters"))
        assertFalse(UrlRouter.shouldOpenInWebView("mailto:legal@pymasters.net"))
        assertFalse(UrlRouter.shouldOpenInWebView("upi://pay?pa=pymasters@icici"))
    }

    @Test
    fun protectsTouchGesturesOnPlayAndPlaygroundRoutes() {
        assertTrue(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/play"))
        assertTrue(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/play/linked_snake"))
        assertTrue(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/playground"))
        assertFalse(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard/classroom"))
        assertFalse(UrlRouter.isSwipeGestureProtected("https://pymasters.net/dashboard"))
    }
}
