package net.pymasters.app

import android.app.Activity
import android.os.Handler
import android.os.Looper
import android.webkit.WebView
import com.android.billingclient.api.AcknowledgePurchaseParams
import com.android.billingclient.api.BillingClient
import com.android.billingclient.api.BillingClientStateListener
import com.android.billingclient.api.BillingFlowParams
import com.android.billingclient.api.BillingResult
import com.android.billingclient.api.PendingPurchasesParams
import com.android.billingclient.api.ProductDetails
import com.android.billingclient.api.Purchase
import com.android.billingclient.api.PurchasesUpdatedListener
import com.android.billingclient.api.QueryProductDetailsParams
import com.android.billingclient.api.QueryPurchasesParams
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.ConcurrentHashMap

/**
 * Production Google Play Billing Library v7 manager for PyMasters Android.
 *
 * Handles BillingClient lifecycle, product detail queries, subscription & one-time
 * purchase flows, purchase acknowledgment, interrupted-purchase recovery on resume,
 * and origin-verified delivery to the WebView (`window.onPyMastersPlayPurchase` and
 * `CustomEvent('pymasters:play-purchase')`).
 */
class PlayBillingManager(
    private val activity: Activity,
    private val webViewProvider: () -> WebView?
) {
    private val mainHandler = Handler(Looper.getMainLooper())
    private val productDetailsCache = ConcurrentHashMap<String, ProductDetails>()
    private val pendingConnectionCallbacks = mutableListOf<(Boolean) -> Unit>()

    private var isConnecting = false
    private var isDestroyed = false

    @Volatile
    private var billingUnavailable = false

    private val purchasesUpdatedListener = PurchasesUpdatedListener { billingResult, purchases ->
        when (billingResult.responseCode) {
            BillingClient.BillingResponseCode.OK -> {
                if (!purchases.isNullOrEmpty()) {
                    for (purchase in purchases) {
                        handlePurchase(purchase, forceDeliver = true)
                    }
                }
            }

            BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED -> {
                // Re-deliver active Play entitlement so backend can idempotently sync the user's plan
                recoverActivePurchases(deliverAlreadyAcknowledged = true)
            }

            BillingClient.BillingResponseCode.USER_CANCELED -> {
                dispatchPurchasePayload(
                    JSONObject()
                        .put("status", "CANCELED")
                        .put("ok", false)
                        .put("responseCode", billingResult.responseCode)
                        .put("debugMessage", "Purchase canceled by user.")
                        .put("error", "Purchase canceled.")
                )
            }

            else -> {
                val msg = billingResult.debugMessage.ifBlank { "Google Play purchase could not be completed." }
                dispatchPurchasePayload(
                    JSONObject()
                        .put("status", "ERROR")
                        .put("ok", false)
                        .put("responseCode", billingResult.responseCode)
                        .put("debugMessage", msg)
                        .put("error", msg)
                )
            }
        }
    }

    private val billingClient: BillingClient = BillingClient.newBuilder(activity)
        .setListener(purchasesUpdatedListener)
        .enablePendingPurchases(
            PendingPurchasesParams.newBuilder()
                .enableOneTimeProducts()
                .build()
        )
        .build()

    fun isAvailable(): Boolean = !isDestroyed && !billingUnavailable

    fun start() {
        runOnMain {
            ensureConnected { connected ->
                if (connected) {
                    recoverActivePurchases(deliverAlreadyAcknowledged = false)
                }
            }
        }
    }

    fun onResume() {
        runOnMain {
            if (!isDestroyed && billingClient.isReady) {
                recoverActivePurchases(deliverAlreadyAcknowledged = false)
            }
        }
    }

    fun destroy() {
        runOnMain {
            isDestroyed = true
            pendingConnectionCallbacks.clear()
            productDetailsCache.clear()
            try {
                if (billingClient.isReady) {
                    billingClient.endConnection()
                }
            } catch (_: Exception) {
            }
        }
    }

    fun queryProducts(productIdsJson: String?, productType: String?) {
        val ids = parseProductIds(productIdsJson)
        if (ids.isEmpty()) {
            dispatchProductsPayload(
                JSONObject()
                    .put("status", "ERROR")
                    .put("ok", false)
                    .put("products", JSONArray())
                    .put("error", "No product IDs supplied.")
            )
            return
        }

        val resolvedType = normalizeProductType(productType, ids.first())
        runOnMain {
            ensureConnected { connected ->
                if (!connected) {
                    dispatchProductsPayload(
                        JSONObject()
                            .put("status", "ERROR")
                            .put("ok", false)
                            .put("products", JSONArray())
                            .put("error", "Google Play Billing is unavailable on this device.")
                    )
                    return@ensureConnected
                }

                val productList = ids.map { id ->
                    QueryProductDetailsParams.Product.newBuilder()
                        .setProductId(id)
                        .setProductType(resolvedType)
                        .build()
                }
                val params = QueryProductDetailsParams.newBuilder()
                    .setProductList(productList)
                    .build()

                billingClient.queryProductDetailsAsync(params) { billingResult, detailsList ->
                    val arr = JSONArray()
                    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                        for (details in detailsList) {
                            productDetailsCache[details.productId] = details
                            arr.put(serializeProductDetails(details))
                        }
                        dispatchProductsPayload(
                            JSONObject()
                                .put("status", "OK")
                                .put("ok", true)
                                .put("productType", resolvedType)
                                .put("products", arr)
                        )
                    } else {
                        val msg = billingResult.debugMessage.ifBlank { "Failed to query Google Play products." }
                        dispatchProductsPayload(
                            JSONObject()
                                .put("status", "ERROR")
                                .put("ok", false)
                                .put("responseCode", billingResult.responseCode)
                                .put("products", arr)
                                .put("error", msg)
                        )
                    }
                }
            }
        }
    }

    fun launchBillingFlow(productIdRaw: String?, productTypeRaw: String?, obfuscatedAccountId: String? = null) {
        val productId = productIdRaw?.trim().orEmpty()
        if (productId.isEmpty() || !PRODUCT_ID_REGEX.matches(productId)) {
            dispatchPurchasePayload(
                JSONObject()
                    .put("status", "ERROR")
                    .put("ok", false)
                    .put("productId", productId)
                    .put("error", "Invalid Google Play product ID.")
            )
            return
        }

        val resolvedType = normalizeProductType(productTypeRaw, productId)
        runOnMain {
            ensureConnected { connected ->
                if (!connected) {
                    dispatchPurchasePayload(
                        JSONObject()
                            .put("status", "ERROR")
                            .put("ok", false)
                            .put("productId", productId)
                            .put("error", "Google Play Billing is unavailable on this device.")
                    )
                    return@ensureConnected
                }

                val cached = productDetailsCache[productId]
                if (cached != null && cached.productType == resolvedType) {
                    launchWithDetails(cached, obfuscatedAccountId)
                    return@ensureConnected
                }

                val queryParams = QueryProductDetailsParams.newBuilder()
                    .setProductList(
                        listOf(
                            QueryProductDetailsParams.Product.newBuilder()
                                .setProductId(productId)
                                .setProductType(resolvedType)
                                .build()
                        )
                    )
                    .build()

                billingClient.queryProductDetailsAsync(queryParams) { billingResult, detailsList ->
                    val details = detailsList.firstOrNull()
                    if (billingResult.responseCode == BillingClient.BillingResponseCode.OK && details != null) {
                        productDetailsCache[details.productId] = details
                        runOnMain {
                            launchWithDetails(details, obfuscatedAccountId)
                        }
                    } else {
                        val msg = billingResult.debugMessage.ifBlank {
                            "Product '$productId' is not available in Google Play yet."
                        }
                        dispatchPurchasePayload(
                            JSONObject()
                                .put("status", "ERROR")
                                .put("ok", false)
                                .put("productId", productId)
                                .put("responseCode", billingResult.responseCode)
                                .put("debugMessage", msg)
                                .put("error", msg)
                        )
                    }
                }
            }
        }
    }

    private fun launchWithDetails(details: ProductDetails, obfuscatedAccountId: String?) {
        if (isDestroyed || activity.isFinishing || activity.isDestroyed) return

        val productParamsBuilder = BillingFlowParams.ProductDetailsParams.newBuilder()
            .setProductDetails(details)

        if (details.productType == BillingClient.ProductType.SUBS) {
            val offer = details.subscriptionOfferDetails?.firstOrNull()
            if (offer == null || offer.offerToken.isBlank()) {
                dispatchPurchasePayload(
                    JSONObject()
                        .put("status", "ERROR")
                        .put("ok", false)
                        .put("productId", details.productId)
                        .put("error", "No active subscription offer found for '${details.productId}'.")
                )
                return
            }
            productParamsBuilder.setOfferToken(offer.offerToken)
        }

        val flowBuilder = BillingFlowParams.newBuilder()
            .setProductDetailsParamsList(listOf(productParamsBuilder.build()))

        val cleanAccount = obfuscatedAccountId?.trim()?.takeIf { it.isNotEmpty() && it.length <= 64 }
        if (cleanAccount != null) {
            flowBuilder.setObfuscatedAccountId(cleanAccount)
        }

        val result = billingClient.launchBillingFlow(activity, flowBuilder.build())
        if (result.responseCode == BillingClient.BillingResponseCode.ITEM_ALREADY_OWNED) {
            recoverActivePurchases(deliverAlreadyAcknowledged = true)
        } else if (result.responseCode != BillingClient.BillingResponseCode.OK) {
            val msg = result.debugMessage.ifBlank { "Unable to open Google Play purchase sheet." }
            dispatchPurchasePayload(
                JSONObject()
                    .put("status", "ERROR")
                    .put("ok", false)
                    .put("productId", details.productId)
                    .put("responseCode", result.responseCode)
                    .put("debugMessage", msg)
                    .put("error", msg)
            )
        }
    }

    private fun recoverActivePurchases(deliverAlreadyAcknowledged: Boolean) {
        if (isDestroyed || !billingClient.isReady) return

        val types = listOf(BillingClient.ProductType.SUBS, BillingClient.ProductType.INAPP)
        for (type in types) {
            val params = QueryPurchasesParams.newBuilder()
                .setProductType(type)
                .build()
            billingClient.queryPurchasesAsync(params) { billingResult, purchasesList ->
                if (billingResult.responseCode == BillingClient.BillingResponseCode.OK) {
                    for (purchase in purchasesList) {
                        if (!purchase.isAcknowledged || deliverAlreadyAcknowledged) {
                            handlePurchase(
                                purchase = purchase,
                                forceDeliver = deliverAlreadyAcknowledged,
                                knownProductType = type
                            )
                        }
                    }
                }
            }
        }
    }

    private fun handlePurchase(
        purchase: Purchase,
        forceDeliver: Boolean,
        knownProductType: String? = null
    ) {
        val primaryProductId = purchase.products.firstOrNull().orEmpty()
        val resolvedType = knownProductType ?: normalizeProductType(null, primaryProductId)

        when (purchase.purchaseState) {
            Purchase.PurchaseState.PURCHASED -> {
                if (!purchase.isAcknowledged) {
                    val ackParams = AcknowledgePurchaseParams.newBuilder()
                        .setPurchaseToken(purchase.purchaseToken)
                        .build()
                    billingClient.acknowledgePurchase(ackParams) { ackResult ->
                        val ackOk = ackResult.responseCode == BillingClient.BillingResponseCode.OK
                        dispatchPurchasePayload(
                            buildPurchasedJson(
                                purchase = purchase,
                                productId = primaryProductId,
                                productType = resolvedType,
                                acknowledged = ackOk || purchase.isAcknowledged
                            )
                        )
                    }
                } else if (forceDeliver) {
                    dispatchPurchasePayload(
                        buildPurchasedJson(
                            purchase = purchase,
                            productId = primaryProductId,
                            productType = resolvedType,
                            acknowledged = true
                        )
                    )
                }
            }

            Purchase.PurchaseState.PENDING -> {
                dispatchPurchasePayload(
                    JSONObject()
                        .put("status", "PENDING")
                        .put("ok", false)
                        .put("productId", primaryProductId)
                        .put("product_id", primaryProductId)
                        .put("productType", resolvedType)
                        .put("product_type", resolvedType)
                        .put("purchaseToken", purchase.purchaseToken)
                        .put("purchase_token", purchase.purchaseToken)
                        .put("debugMessage", "Payment is pending confirmation in Google Play.")
                )
            }

            else -> {
                // UNSPECIFIED_STATE — ignore
            }
        }
    }

    private fun buildPurchasedJson(
        purchase: Purchase,
        productId: String,
        productType: String,
        acknowledged: Boolean
    ): JSONObject {
        val orderId = purchase.orderId.orEmpty()
        return JSONObject()
            .put("status", "PURCHASED")
            .put("ok", true)
            .put("responseCode", BillingClient.BillingResponseCode.OK)
            .put("productId", productId)
            .put("product_id", productId)
            .put("productType", productType)
            .put("product_type", productType)
            .put("purchaseToken", purchase.purchaseToken)
            .put("purchase_token", purchase.purchaseToken)
            .put("orderId", orderId)
            .put("order_id", orderId)
            .put("packageName", purchase.packageName)
            .put("package_name", purchase.packageName)
            .put("isAcknowledged", acknowledged)
            .put("acknowledged", acknowledged)
            .put("isAutoRenewing", purchase.isAutoRenewing)
            .put("purchaseTime", purchase.purchaseTime)
            .put("signature", purchase.signature)
            .put("originalJson", purchase.originalJson)
    }

    private fun serializeProductDetails(details: ProductDetails): JSONObject {
        val json = JSONObject()
            .put("productId", details.productId)
            .put("productType", details.productType)
            .put("title", details.title)
            .put("name", details.name)
            .put("description", details.description)

        if (details.productType == BillingClient.ProductType.SUBS) {
            val offer = details.subscriptionOfferDetails?.firstOrNull()
            val phase = offer?.pricingPhases?.pricingPhaseList?.lastOrNull()
            json.put("offerToken", offer?.offerToken.orEmpty())
            json.put("basePlanId", offer?.basePlanId.orEmpty())
            json.put("formattedPrice", phase?.formattedPrice.orEmpty())
            json.put("priceAmountMicros", phase?.priceAmountMicros ?: 0L)
            json.put("priceCurrencyCode", phase?.priceCurrencyCode.orEmpty())
            json.put("billingPeriod", phase?.billingPeriod.orEmpty())
        } else {
            val oneTime = details.oneTimePurchaseOfferDetails
            json.put("formattedPrice", oneTime?.formattedPrice.orEmpty())
            json.put("priceAmountMicros", oneTime?.priceAmountMicros ?: 0L)
            json.put("priceCurrencyCode", oneTime?.priceCurrencyCode.orEmpty())
        }
        return json
    }

    private fun ensureConnected(callback: (Boolean) -> Unit) {
        if (isDestroyed) {
            callback(false)
            return
        }
        if (billingClient.isReady) {
            callback(true)
            return
        }
        pendingConnectionCallbacks.add(callback)
        if (isConnecting) return

        isConnecting = true
        billingClient.startConnection(object : BillingClientStateListener {
            override fun onBillingSetupFinished(billingResult: BillingResult) {
                runOnMain {
                    isConnecting = false
                    val ok = billingResult.responseCode == BillingClient.BillingResponseCode.OK
                    if (billingResult.responseCode == BillingClient.BillingResponseCode.BILLING_UNAVAILABLE ||
                        billingResult.responseCode == BillingClient.BillingResponseCode.FEATURE_NOT_SUPPORTED
                    ) {
                        billingUnavailable = true
                    } else if (ok) {
                        billingUnavailable = false
                    }
                    val callbacks = pendingConnectionCallbacks.toList()
                    pendingConnectionCallbacks.clear()
                    for (cb in callbacks) {
                        cb(ok)
                    }
                }
            }

            override fun onBillingServiceDisconnected() {
                runOnMain {
                    isConnecting = false
                }
            }
        })
    }

    private fun dispatchPurchasePayload(payload: JSONObject) {
        dispatchToWebView(
            callbackName = "onPyMastersPlayPurchase",
            eventName = "pymasters:play-purchase",
            payload = payload
        )
    }

    private fun dispatchProductsPayload(payload: JSONObject) {
        dispatchToWebView(
            callbackName = "onPyMastersPlayProducts",
            eventName = "pymasters:play-products",
            payload = payload
        )
    }

    private fun dispatchToWebView(callbackName: String, eventName: String, payload: JSONObject) {
        runOnMain {
            if (isDestroyed) return@runOnMain
            val webView = webViewProvider() ?: return@runOnMain
            if (!UrlRouter.isTrustedBridgeOrigin(webView.url)) return@runOnMain

            val quotedJson = JSONObject.quote(payload.toString())
            val script = """
                (function() {
                    try {
                        var raw = $quotedJson;
                        var detail = JSON.parse(raw);
                        Object.defineProperty(detail, 'toString', { value: function() { return raw; }, enumerable: false });
                        if (typeof window.$callbackName === 'function') {
                            window.$callbackName(detail);
                        }
                        window.dispatchEvent(new CustomEvent('$eventName', { detail: detail }));
                    } catch (e) {}
                })();
            """.trimIndent()
            webView.evaluateJavascript(script, null)
        }
    }

    private fun runOnMain(block: () -> Unit) {
        if (Looper.myLooper() == Looper.getMainLooper()) {
            block()
        } else {
            mainHandler.post(block)
        }
    }

    companion object {
        private val PRODUCT_ID_REGEX = Regex("^[a-zA-Z0-9._-]{1,100}$")

        internal fun normalizeProductType(rawType: String?, productId: String): String {
            val lowered = rawType?.trim()?.lowercase().orEmpty()
            return if (
                lowered == BillingClient.ProductType.INAPP ||
                lowered == "one_time" ||
                lowered == "onetime" ||
                productId.endsWith("_30d") ||
                productId.contains("_pass")
            ) {
                BillingClient.ProductType.INAPP
            } else {
                BillingClient.ProductType.SUBS
            }
        }

        internal fun parseProductIds(raw: String?): List<String> {
            val trimmed = raw?.trim().orEmpty()
            if (trimmed.isEmpty()) return emptyList()
            val unwrapped = if (trimmed.startsWith("[") && trimmed.endsWith("]")) {
                trimmed.substring(1, trimmed.length - 1)
            } else {
                trimmed
            }
            return unwrapped.split(",")
                .map { it.trim().removeSurrounding("\"").removeSurrounding("'").trim() }
                .filter { it.isNotEmpty() && PRODUCT_ID_REGEX.matches(it) }
                .distinct()
        }
    }
}
