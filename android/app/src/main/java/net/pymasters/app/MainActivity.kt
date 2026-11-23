package net.pymasters.app

import android.Manifest
import android.annotation.SuppressLint
import android.app.DownloadManager
import android.content.ActivityNotFoundException
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.graphics.Bitmap
import android.graphics.Color
import android.net.ConnectivityManager
import android.net.Network
import android.net.NetworkCapabilities
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Environment
import android.os.Looper
import android.os.SystemClock
import android.provider.Settings
import android.view.View
import android.webkit.CookieManager
import android.webkit.PermissionRequest
import android.webkit.URLUtil
import android.webkit.ValueCallback
import android.webkit.WebChromeClient
import android.webkit.WebResourceError
import android.webkit.WebResourceRequest
import android.webkit.WebSettings
import android.webkit.WebView
import android.webkit.WebViewClient
import android.widget.Button
import android.widget.FrameLayout
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.OnBackPressedCallback
import androidx.activity.enableEdgeToEdge
import androidx.activity.SystemBarStyle
import androidx.activity.result.contract.ActivityResultContracts
import androidx.browser.customtabs.CustomTabsIntent
import androidx.core.content.ContextCompat
import androidx.core.splashscreen.SplashScreen.Companion.installSplashScreen
import androidx.core.view.ViewCompat
import androidx.core.view.WindowInsetsCompat

class MainActivity : ComponentActivity() {

    private lateinit var rootContainer: FrameLayout
    private lateinit var webView: WebView
    private lateinit var topProgress: ProgressBar
    private lateinit var loadingOverlay: LinearLayout
    private lateinit var offlineOverlay: LinearLayout
    private lateinit var playBillingManager: PlayBillingManager

    @Volatile
    private var currentMainFrameUrl: String? = null

    private var splashReady = false
    private var mainFrameFailed = false
    private var lastRootBackPressMs = 0L
    private var pendingFileCallback: ValueCallback<Array<Uri>>? = null
    private var pendingWebPermissionRequest: PermissionRequest? = null
    private var networkCallback: ConnectivityManager.NetworkCallback? = null

    private val fileChooserLauncher = registerForActivityResult(
        ActivityResultContracts.StartActivityForResult()
    ) { result ->
        val callback = pendingFileCallback ?: return@registerForActivityResult
        pendingFileCallback = null
        val uris = WebChromeClient.FileChooserParams.parseResult(result.resultCode, result.data)
        callback.onReceiveValue(uris)
    }

    private val audioPermissionLauncher = registerForActivityResult(
        ActivityResultContracts.RequestPermission()
    ) { granted ->
        val req = pendingWebPermissionRequest ?: return@registerForActivityResult
        pendingWebPermissionRequest = null
        if (granted) {
            req.grant(req.resources)
        } else {
            req.deny()
        }
    }

    override fun onCreate(savedInstanceState: Bundle?) {
        val splashScreen = installSplashScreen()
        splashScreen.setKeepOnScreenCondition { !splashReady }

        enableEdgeToEdge(
            statusBarStyle = SystemBarStyle.dark(Color.parseColor("#020617")),
            navigationBarStyle = SystemBarStyle.dark(Color.parseColor("#020617"))
        )
        super.onCreate(savedInstanceState)
        setContentView(R.layout.activity_main)

        rootContainer = findViewById(R.id.rootContainer)
        webView = findViewById(R.id.webView)
        topProgress = findViewById(R.id.topProgress)
        loadingOverlay = findViewById(R.id.loadingOverlay)
        offlineOverlay = findViewById(R.id.offlineOverlay)
        val retryButton: Button = findViewById(R.id.retryButton)
        val wifiSettingsButton: Button = findViewById(R.id.wifiSettingsButton)

        playBillingManager = PlayBillingManager(this) {
            if (::webView.isInitialized) webView else null
        }

        applyWindowInsets()
        configureWebView()
        registerBackHandler()
        registerNetworkMonitor()
        playBillingManager.start()

        retryButton.setOnClickListener {
            if (isOnline()) {
                offlineOverlay.visibility = View.GONE
                mainFrameFailed = false
                webView.reload()
            } else {
                Toast.makeText(this, "Still offline — check Wi-Fi or mobile data", Toast.LENGTH_SHORT).show()
            }
        }

        wifiSettingsButton.setOnClickListener {
            val settingsIntent = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                Intent(Settings.Panel.ACTION_INTERNET_CONNECTIVITY)
            } else {
                Intent(Settings.ACTION_WIFI_SETTINGS)
            }
            try {
                startActivity(settingsIntent)
            } catch (_: ActivityNotFoundException) {
                try {
                    startActivity(Intent(Settings.ACTION_WIRELESS_SETTINGS))
                } catch (_: ActivityNotFoundException) {
                    Toast.makeText(this, "Open Android Settings to enable network", Toast.LENGTH_SHORT).show()
                }
            }
        }

        // Release splash screen quickly so branded loading curtain shows smoothly,
        // and guarantee curtain dismisses even on slow networks.
        rootContainer.postDelayed({ splashReady = true }, 650L)
        rootContainer.postDelayed({ dismissLoadingOverlay() }, 3500L)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
            currentMainFrameUrl = webView.url
            splashReady = true
            loadingOverlay.visibility = View.GONE
        } else {
            val targetUrl = UrlRouter.resolveIncomingUrl(intent?.dataString, BuildConfig.BASE_URL)
            loadTargetUrl(targetUrl)
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        val data = intent.dataString
        if (!data.isNullOrBlank()) {
            val targetUrl = UrlRouter.resolveIncomingUrl(data, BuildConfig.BASE_URL)
            loadTargetUrl(targetUrl)
        }
    }

    override fun onSaveInstanceState(outState: Bundle) {
        super.onSaveInstanceState(outState)
        webView.saveState(outState)
    }

    override fun onPause() {
        CookieManager.getInstance().flush()
        webView.onPause()
        super.onPause()
    }

    override fun onResume() {
        super.onResume()
        webView.onResume()
        if (::playBillingManager.isInitialized) {
            playBillingManager.onResume()
        }
    }

    override fun onDestroy() {
        unregisterNetworkMonitor()
        if (::playBillingManager.isInitialized) {
            playBillingManager.destroy()
        }
        webView.destroy()
        super.onDestroy()
    }

    private fun applyWindowInsets() {
        ViewCompat.setOnApplyWindowInsetsListener(rootContainer) { view, windowInsets ->
            val insets = windowInsets.getInsets(
                WindowInsetsCompat.Type.systemBars() or WindowInsetsCompat.Type.ime()
            )
            view.setPadding(insets.left, insets.top, insets.right, insets.bottom)
            WindowInsetsCompat.CONSUMED
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.setBackgroundColor(Color.parseColor("#020617"))
        webView.isVerticalScrollBarEnabled = true
        webView.isScrollbarFadingEnabled = true
        webView.isHorizontalScrollBarEnabled = false
        webView.overScrollMode = View.OVER_SCROLL_NEVER
        webView.isNestedScrollingEnabled = false

        val nativeBridge = PyMastersBridge(
            context = this,
            billingManager = playBillingManager,
            currentUrlProvider = ::activeFrameUrl,
            onThemeChanged = ::applySystemBarTheme
        )
        webView.addJavascriptInterface(nativeBridge, "PyMastersAndroid")
        webView.addJavascriptInterface(nativeBridge, "PyMastersBilling")

        webView.settings.apply {
            javaScriptEnabled = true
            domStorageEnabled = true
            mediaPlaybackRequiresUserGesture = false
            loadsImagesAutomatically = true
            mixedContentMode = WebSettings.MIXED_CONTENT_NEVER_ALLOW
            cacheMode = WebSettings.LOAD_DEFAULT
            allowFileAccess = false
            allowContentAccess = true
            setSupportZoom(false)
            builtInZoomControls = false
            displayZoomControls = false
            useWideViewPort = true
            loadWithOverviewMode = false
            userAgentString = "$userAgentString PyMastersAndroid/${BuildConfig.VERSION_NAME}"
        }

        webView.webViewClient = object : WebViewClient() {
            override fun shouldOverrideUrlLoading(view: WebView, request: WebResourceRequest): Boolean {
                val uri = request.url ?: return false
                val raw = uri.toString()

                if (UrlRouter.shouldOpenInWebView(raw)) {
                    return false
                }
                openExternalUri(uri)
                return true
            }

            override fun onPageStarted(view: WebView, url: String?, favicon: Bitmap?) {
                super.onPageStarted(view, url, favicon)
                currentMainFrameUrl = url ?: view.url
                mainFrameFailed = false
                topProgress.progress = 10
                topProgress.visibility = View.VISIBLE
            }

            override fun onPageCommitVisible(view: WebView, url: String?) {
                super.onPageCommitVisible(view, url)
                currentMainFrameUrl = url ?: view.url
                splashReady = true
                dismissLoadingOverlay()
                injectScrollHardeningCss(view)
                if (!mainFrameFailed) {
                    offlineOverlay.visibility = View.GONE
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                currentMainFrameUrl = url ?: view.url
                splashReady = true
                dismissLoadingOverlay()
                topProgress.visibility = View.GONE
                injectScrollHardeningCss(view)
                CookieManager.getInstance().flush()
                if (!mainFrameFailed) {
                    offlineOverlay.visibility = View.GONE
                }
            }

            override fun onReceivedError(
                view: WebView,
                request: WebResourceRequest,
                error: WebResourceError
            ) {
                super.onReceivedError(view, request, error)
                if (request.isForMainFrame) {
                    mainFrameFailed = true
                    splashReady = true
                    dismissLoadingOverlay()
                    topProgress.visibility = View.GONE
                    offlineOverlay.visibility = View.VISIBLE
                }
            }
        }

        webView.webChromeClient = object : WebChromeClient() {
            override fun onProgressChanged(view: WebView, newProgress: Int) {
                if (newProgress in 1..99) {
                    topProgress.visibility = View.VISIBLE
                    topProgress.progress = newProgress
                } else {
                    topProgress.visibility = View.GONE
                }
            }

            override fun onShowFileChooser(
                webView: WebView,
                filePathCallback: ValueCallback<Array<Uri>>,
                fileChooserParams: FileChooserParams
            ): Boolean {
                pendingFileCallback?.onReceiveValue(null)
                pendingFileCallback = filePathCallback
                return try {
                    val intent = fileChooserParams.createIntent()
                    fileChooserLauncher.launch(intent)
                    true
                } catch (_: ActivityNotFoundException) {
                    pendingFileCallback = null
                    false
                }
            }

            override fun onPermissionRequest(request: PermissionRequest) {
                val resources = request.resources ?: emptyArray()
                if (resources.contains(PermissionRequest.RESOURCE_AUDIO_CAPTURE)) {
                    if (ContextCompat.checkSelfPermission(
                            this@MainActivity,
                            Manifest.permission.RECORD_AUDIO
                        ) == PackageManager.PERMISSION_GRANTED
                    ) {
                        request.grant(arrayOf(PermissionRequest.RESOURCE_AUDIO_CAPTURE))
                    } else {
                        pendingWebPermissionRequest = request
                        audioPermissionLauncher.launch(Manifest.permission.RECORD_AUDIO)
                    }
                } else {
                    request.deny()
                }
            }
        }

        webView.setDownloadListener { url, userAgent, contentDisposition, mimeType, _ ->
            try {
                val fileName = URLUtil.guessFileName(url, contentDisposition, mimeType)
                val req = DownloadManager.Request(Uri.parse(url)).apply {
                    setMimeType(mimeType)
                    addRequestHeader("User-Agent", userAgent)
                    CookieManager.getInstance().getCookie(url)?.let { addRequestHeader("Cookie", it) }
                    setTitle(fileName)
                    setDescription("Downloading from PyMasters")
                    setNotificationVisibility(DownloadManager.Request.VISIBILITY_VISIBLE_NOTIFY_COMPLETED)
                    setDestinationInExternalPublicDir(Environment.DIRECTORY_DOWNLOADS, fileName)
                }
                val dm = getSystemService(Context.DOWNLOAD_SERVICE) as? DownloadManager
                dm?.enqueue(req)
                Toast.makeText(this, "Downloading $fileName…", Toast.LENGTH_SHORT).show()
            } catch (_: Exception) {
                openExternalUri(Uri.parse(url))
            }
        }
    }

    private fun loadTargetUrl(url: String) {
        currentMainFrameUrl = url
        if (!isOnline()) {
            offlineOverlay.visibility = View.VISIBLE
        }
        webView.loadUrl(url)
    }

    private fun activeFrameUrl(): String? =
        if (Looper.myLooper() == Looper.getMainLooper() && ::webView.isInitialized) {
            webView.url ?: currentMainFrameUrl
        } else {
            currentMainFrameUrl
        }

    private fun openExternalUri(uri: Uri) {
        val scheme = uri.scheme?.lowercase().orEmpty()
        val host = uri.host?.lowercase().orEmpty()
        val preferNativeApp = host in setOf("t.me", "telegram.me", "play.google.com")
        try {
            if (preferNativeApp) {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            } else if (scheme == "https" || scheme == "http") {
                val customTabs = CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build()
                customTabs.launchUrl(this, uri)
            } else {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        } catch (_: ActivityNotFoundException) {
            if (preferNativeApp && (scheme == "https" || scheme == "http")) {
                try {
                    CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, uri)
                    return
                } catch (_: ActivityNotFoundException) {
                }
            }
            Toast.makeText(this, "No app installed to open this link", Toast.LENGTH_SHORT).show()
        }
    }

    private fun registerBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (offlineOverlay.visibility == View.VISIBLE && webView.canGoBack()) {
                    offlineOverlay.visibility = View.GONE
                    webView.goBack()
                    return
                }
                // Let the React SPA close open mobile drawers, chat panels, or step back
                // from an active lesson phase before popping WebView history.
                webView.evaluateJavascript(
                    "(function(){ try { return !!(window.__pymastersHandleBack && window.__pymastersHandleBack()); } catch(e) { return false; } })()"
                ) { result ->
                    if (result == "true") {
                        return@evaluateJavascript
                    }
                    val currentPath = runCatching { Uri.parse(webView.url.orEmpty()).path.orEmpty() }
                        .getOrDefault("")
                        .trimEnd('/')
                    if (webView.canGoBack() && currentPath != "/dashboard" && currentPath != "/login") {
                        webView.goBack()
                    } else if (currentPath.startsWith("/dashboard/") && currentPath != "/dashboard") {
                        loadTargetUrl(BuildConfig.BASE_URL.trimEnd('/') + "/dashboard")
                    } else {
                        val now = SystemClock.elapsedRealtime()
                        if (now - lastRootBackPressMs < 2000L) {
                            isEnabled = false
                            onBackPressedDispatcher.onBackPressed()
                            isEnabled = true
                        } else {
                            lastRootBackPressMs = now
                            Toast.makeText(
                                this@MainActivity,
                                getString(R.string.back_press_exit_hint),
                                Toast.LENGTH_SHORT
                            ).show()
                        }
                    }
                }
            }
        })
    }

    private fun dismissLoadingOverlay() {
        if (!::loadingOverlay.isInitialized || loadingOverlay.visibility == View.GONE) return
        loadingOverlay.animate()
            .alpha(0f)
            .setDuration(220L)
            .withEndAction {
                loadingOverlay.visibility = View.GONE
                loadingOverlay.alpha = 1f
            }
            .start()
    }

    private fun applySystemBarTheme(isDark: Boolean) {
        val bgColor = if (isDark) Color.parseColor("#020617") else Color.parseColor("#F8FAFC")
        val barStyle = if (isDark) {
            SystemBarStyle.dark(bgColor)
        } else {
            SystemBarStyle.light(bgColor, Color.parseColor("#020617"))
        }
        enableEdgeToEdge(statusBarStyle = barStyle, navigationBarStyle = barStyle)
        rootContainer.setBackgroundColor(bgColor)
        webView.setBackgroundColor(bgColor)
    }

    private fun injectScrollHardeningCss(view: WebView) {
        view.evaluateJavascript(
            "(function(){try{var id='pym-webview-scroll-guard';if(document.getElementById(id))return;var s=document.createElement('style');s.id=id;s.textContent='html,body{overscroll-behavior-y:none !important;overscroll-behavior-x:none !important;}';(document.head||document.documentElement).appendChild(s);}catch(e){}})();",
            null
        )
    }

    private fun isOnline(): Boolean {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return true
        val network = cm.activeNetwork ?: return false
        val caps = cm.getNetworkCapabilities(network) ?: return false
        return caps.hasCapability(NetworkCapabilities.NET_CAPABILITY_INTERNET)
    }

    private fun registerNetworkMonitor() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        val cb = object : ConnectivityManager.NetworkCallback() {
            override fun onAvailable(network: Network) {
                runOnUiThread {
                    if (offlineOverlay.visibility == View.VISIBLE) {
                        offlineOverlay.visibility = View.GONE
                        mainFrameFailed = false
                        webView.reload()
                    }
                }
            }
        }
        networkCallback = cb
        try {
            cm.registerDefaultNetworkCallback(cb)
        } catch (_: Exception) {
            networkCallback = null
        }
    }

    private fun unregisterNetworkMonitor() {
        val cm = getSystemService(Context.CONNECTIVITY_SERVICE) as? ConnectivityManager ?: return
        networkCallback?.let {
            try {
                cm.unregisterNetworkCallback(it)
            } catch (_: Exception) {
            }
        }
        networkCallback = null
    }
}
