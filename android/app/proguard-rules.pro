# Keep JavaScriptInterface methods exposed to PyMasters WebView
-keepclassmembers class net.pymasters.app.PyMastersBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface
