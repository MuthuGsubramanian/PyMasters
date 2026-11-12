package net.pymasters.app

import android.content.ClipData
import android.content.ClipboardManager
import android.content.Context
import android.content.Intent
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.webkit.JavascriptInterface
import android.widget.Toast

/**
 * Lightweight native bridge exposed to JavaScript as `window.PyMastersAndroid`
 * (and `window.PyMastersBilling`).
 */
class PyMastersBridge(
    private val context: Context,
    private val billingManager: PlayBillingManager?,
    private val currentUrlProvider: () -> String?
) {
    constructor(context: Context) : this(
        context = context,
        billingManager = null,
        currentUrlProvider = { null }
    )

    private val mainHandler = Handler(Looper.getMainLooper())

    @JavascriptInterface
    fun isAndroidApp(): Boolean = true

    @JavascriptInterface
    fun getAppVersion(): String = BuildConfig.VERSION_NAME

    @JavascriptInterface
    fun isPlayBillingAvailable(): Boolean {
        val manager = billingManager ?: return false
        if (!UrlRouter.isTrustedBridgeOrigin(currentUrlProvider())) return false
        return manager.isAvailable()
    }

    @JavascriptInterface
    fun queryProducts(productIdsJson: String?, productType: String?) {
        val manager = billingManager ?: return
        mainHandler.post {
            if (!UrlRouter.isTrustedBridgeOrigin(currentUrlProvider())) return@post
            manager.queryProducts(productIdsJson, productType)
        }
    }

    @JavascriptInterface
    fun queryPlayProducts(productIdsJson: String?, productType: String?) {
        queryProducts(productIdsJson, productType)
    }

    @JavascriptInterface
    fun launchPlayBilling(productId: String?, productType: String?) {
        launchPlayBilling(productId, productType, null)
    }

    @JavascriptInterface
    fun launchPlayBilling(productId: String?, productType: String?, obfuscatedAccountId: String?) {
        val manager = billingManager ?: return
        mainHandler.post {
            if (!UrlRouter.isTrustedBridgeOrigin(currentUrlProvider())) return@post
            manager.launchBillingFlow(productId, productType, obfuscatedAccountId)
        }
    }

    @JavascriptInterface
    fun launchPurchase(productId: String?, planType: String?) {
        launchPlayBilling(productId, planType, null)
    }

    @JavascriptInterface
    fun launchPurchase(productId: String?, planType: String?, obfuscatedAccountId: String?) {
        launchPlayBilling(productId, planType, obfuscatedAccountId)
    }

    @JavascriptInterface
    fun haptic(durationMs: Int) {
        val clamped = durationMs.coerceIn(10, 250).toLong()
        try {
            val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vm = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vm?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }
            if (vibrator?.hasVibrator() == true) {
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                    vibrator.vibrate(VibrationEffect.createOneShot(clamped, VibrationEffect.DEFAULT_AMPLITUDE))
                } else {
                    @Suppress("DEPRECATION")
                    vibrator.vibrate(clamped)
                }
            }
        } catch (_: Exception) {
            // Never fail JS execution if vibration is unavailable
        }
    }

    @JavascriptInterface
    fun share(title: String?, text: String?, url: String?) {
        val body = listOfNotNull(
            text?.takeIf { it.isNotBlank() },
            url?.takeIf { it.isNotBlank() }
        ).joinToString("\n")
        if (body.isBlank()) return

        val sendIntent = Intent(Intent.ACTION_SEND).apply {
            type = "text/plain"
            putExtra(Intent.EXTRA_SUBJECT, title?.takeIf { it.isNotBlank() } ?: "PyMasters")
            putExtra(Intent.EXTRA_TEXT, body)
        }
        val chooser = Intent.createChooser(sendIntent, title?.takeIf { it.isNotBlank() } ?: "Share PyMasters").apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(chooser)
    }

    @JavascriptInterface
    fun copyText(text: String?) {
        if (text.isNullOrEmpty()) return
        val clipboard = context.getSystemService(Context.CLIPBOARD_SERVICE) as? ClipboardManager ?: return
        clipboard.setPrimaryClip(ClipData.newPlainText("PyMasters Code", text))
        Toast.makeText(context, "Copied to clipboard", Toast.LENGTH_SHORT).show()
    }
}
