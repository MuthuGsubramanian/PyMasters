# Keep JavaScriptInterface methods exposed to PyMasters WebView
-keep class net.pymasters.app.PyMastersBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepclassmembers class net.pymasters.app.PyMastersBridge {
    @android.webkit.JavascriptInterface <methods>;
}
-keepattributes JavascriptInterface

# Google Play Billing Library v7 R8/ProGuard rules
-keep class com.android.vending.billing.** { *; }
-keep class com.android.billingclient.** { *; }
