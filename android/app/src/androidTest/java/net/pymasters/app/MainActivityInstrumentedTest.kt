package net.pymasters.app

import android.content.Intent
import android.net.Uri
import android.view.View
import android.webkit.WebView
import android.widget.LinearLayout
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout
import androidx.test.core.app.ActivityScenario
import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class MainActivityInstrumentedTest {

    @Test
    fun launchesMainActivityAndInitializesWebViewAndNativeBridge() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val bridge = PyMastersBridge(context)
        assertTrue(bridge.isAndroidApp())
        assertEquals(BuildConfig.VERSION_NAME, bridge.getAppVersion())
        bridge.haptic(25)

        ActivityScenario.launch(MainActivity::class.java).use { scenario ->
            scenario.onActivity { activity ->
                val webView = activity.findViewById<WebView>(R.id.webView)
                val swipe = activity.findViewById<SwipeRefreshLayout>(R.id.swipeRefresh)
                val offline = activity.findViewById<LinearLayout>(R.id.offlineOverlay)

                assertNotNull(webView)
                assertNotNull(swipe)
                assertNotNull(offline)
                assertTrue(webView.settings.javaScriptEnabled)
                assertTrue(webView.settings.domStorageEnabled)
                assertTrue(webView.settings.userAgentString.contains("PyMastersAndroid/${BuildConfig.VERSION_NAME}"))
            }
        }
    }

    @Test
    fun handlesCustomSchemeDeepLinkIntentCleanly() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("pymasters://play")
        }
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            scenario.onActivity { activity ->
                val webView = activity.findViewById<WebView>(R.id.webView)
                assertNotNull(webView)
                assertEquals(View.VISIBLE, webView.visibility)
            }
        }
    }

    @Test
    fun handlesVerifiedHttpsAppLinkIntentCleanly() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val intent = Intent(context, MainActivity::class.java).apply {
            action = Intent.ACTION_VIEW
            data = Uri.parse("https://pymasters.net/dashboard/play")
        }
        ActivityScenario.launch<MainActivity>(intent).use { scenario ->
            scenario.onActivity { activity ->
                val webView = activity.findViewById<WebView>(R.id.webView)
                assertNotNull(webView)
                assertEquals(View.VISIBLE, webView.visibility)
            }
        }
    }
}
