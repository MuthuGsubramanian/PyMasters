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
import android.os.Bundle
import android.os.Environment
import android.os.Looper
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
import androidx.swiperefreshlayout.widget.SwipeRefreshLayout

class MainActivity : ComponentActivity() {

    private lateinit var rootContainer: FrameLayout
    private lateinit var swipeRefresh: SwipeRefreshLayout
    private lateinit var webView: WebView
    private lateinit var topProgress: ProgressBar
    private lateinit var offlineOverlay: LinearLayout
    private lateinit var playBillingManager: PlayBillingManager

    @Volatile
    private var currentMainFrameUrl: String? = null

    private var splashReady = false
    private var mainFrameFailed = false
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
        swipeRefresh = findViewById(R.id.swipeRefresh)
        webView = findViewById(R.id.webView)
        topProgress = findViewById(R.id.topProgress)
        offlineOverlay = findViewById(R.id.offlineOverlay)
        val retryButton: Button = findViewById(R.id.retryButton)

        playBillingManager = PlayBillingManager(this) {
            if (::webView.isInitialized) webView else null
        }

        applyWindowInsets()
        configureSwipeRefresh()
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

        // Release splash screen within 900ms even on slow networks so the user sees live progress
        rootContainer.postDelayed({ splashReady = true }, 900L)

        if (savedInstanceState != null) {
            webView.restoreState(savedInstanceState)
            currentMainFrameUrl = webView.url
            splashReady = true
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

    private fun configureSwipeRefresh() {
        swipeRefresh.setColorSchemeColors(Color.parseColor("#38BDF8"))
        swipeRefresh.setProgressBackgroundColorSchemeColor(Color.parseColor("#0F172A"))
        // Prevent accidental pull-to-refresh inside Arcade games, Python Playground, or scrolled pages
        swipeRefresh.setOnChildScrollUpCallback { _, _ ->
            webView.scrollY > 0 || UrlRouter.isSwipeGestureProtected(webView.url)
        }
        swipeRefresh.setOnRefreshListener {
            mainFrameFailed = false
            webView.reload()
        }
    }

    @SuppressLint("SetJavaScriptEnabled")
    private fun configureWebView() {
        val cookieManager = CookieManager.getInstance()
        cookieManager.setAcceptCookie(true)
        cookieManager.setAcceptThirdPartyCookies(webView, true)

        webView.setBackgroundColor(Color.parseColor("#020617"))
        val nativeBridge = PyMastersBridge(
            context = this,
            billingManager = playBillingManager,
            currentUrlProvider = ::activeFrameUrl
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
            loadWithOverviewMode = true
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
                if (!mainFrameFailed) {
                    offlineOverlay.visibility = View.GONE
                }
            }

            override fun onPageFinished(view: WebView, url: String?) {
                super.onPageFinished(view, url)
                currentMainFrameUrl = url ?: view.url
                splashReady = true
                swipeRefresh.isRefreshing = false
                topProgress.visibility = View.GONE
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
                    swipeRefresh.isRefreshing = false
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
        try {
            if (scheme == "https" || scheme == "http") {
                val customTabs = CustomTabsIntent.Builder()
                    .setShowTitle(true)
                    .build()
                customTabs.launchUrl(this, uri)
            } else {
                startActivity(Intent(Intent.ACTION_VIEW, uri))
            }
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(this, "No app installed to open this link", Toast.LENGTH_SHORT).show()
        }
    }

    private fun registerBackHandler() {
        onBackPressedDispatcher.addCallback(this, object : OnBackPressedCallback(true) {
            override fun handleOnBackPressed() {
                if (offlineOverlay.visibility == View.VISIBLE && webView.canGoBack()) {
                    offlineOverlay.visibility = View.GONE
                    webView.goBack()
                } else if (webView.canGoBack()) {
                    webView.goBack()
                } else {
                    isEnabled = false
                    onBackPressedDispatcher.onBackPressed()
                }
            }
        })
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
