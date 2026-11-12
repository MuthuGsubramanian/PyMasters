/**
 * Google Play Billing bridge for the PyMasters Android WebView shell.
 *
 * Google Play Payments Policy requires digital subscriptions inside the Android
 * app to use Google Play Billing rather than web checkout (Razorpay). When
 * `isAndroidWebView()` is true, Upgrade.jsx and Pricing.jsx route Beginner and
 * Pro subscriptions exclusively through `window.PyMastersAndroid` (backed by
 * PlayBillingManager.kt) and verify tokens via POST /api/payments/google-play/verify.
 */

export const PLAN_TO_PLAY_SKU = {
  beginner: 'pymasters_beginner_monthly',
  pro: 'pymasters_pro_monthly',
};

const PLAY_PURCHASE_EVENT = 'pymasters:play-purchase';
const PURCHASE_TIMEOUT_MS = 180_000;

function getNativeBridge() {
  if (typeof window === 'undefined') return null;
  return window.PyMastersAndroid || window.PyMastersBilling || null;
}

export function isAndroidWebView() {
  if (typeof window === 'undefined') return false;
  const bridge = getNativeBridge();
  try {
    if (typeof bridge?.isAndroidApp === 'function' && bridge.isAndroidApp()) {
      return true;
    }
  } catch {
    // Ignore bridge invocation errors and fall back to presence / UA detection.
  }
  if (bridge) return true;
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  return /PyMastersAndroid\//i.test(ua);
}

export function isPlayBillingAvailable() {
  if (!isAndroidWebView()) return false;
  const bridge = getNativeBridge();
  if (!bridge) return false;
  try {
    if (typeof bridge.isPlayBillingAvailable === 'function') {
      return Boolean(bridge.isPlayBillingAvailable());
    }
  } catch {
    return false;
  }
  return (
    typeof bridge.launchPlayBilling === 'function' ||
    typeof bridge.launchPurchase === 'function'
  );
}

function normalizePurchasePayload(raw, fallbackProductId) {
  const detail = typeof raw === 'string' ? JSON.parse(raw) : raw || {};
  const status = String(detail.status || '').toUpperCase();

  if (status === 'CANCELED' || status === 'CANCELLED') {
    const err = new Error(detail.error || 'Purchase canceled.');
    err.code = 'USER_CANCELED';
    err.canceled = true;
    throw err;
  }

  if (status === 'PENDING') {
    const err = new Error(
      detail.debugMessage ||
        'Your payment is pending confirmation in Google Play. Your plan will activate automatically once confirmed.'
    );
    err.code = 'PENDING';
    throw err;
  }

  const purchaseToken = (detail.purchase_token || detail.purchaseToken || '').trim();
  const isOk = status === 'PURCHASED' || detail.ok === true || Boolean(purchaseToken && !detail.error && status !== 'ERROR');

  if (!isOk || !purchaseToken) {
    const err = new Error(
      detail.error || detail.debugMessage || 'Google Play purchase could not be completed.'
    );
    err.code = status || 'PLAY_ERROR';
    throw err;
  }

  return {
    product_id: (detail.product_id || detail.productId || fallbackProductId || '').trim(),
    purchase_token: purchaseToken,
    order_id: (detail.order_id || detail.orderId || '').trim() || undefined,
    package_name: (detail.package_name || detail.packageName || '').trim() || undefined,
  };
}

/**
 * Launch Google Play Billing for `planKey` ('beginner' | 'pro') and resolve
 * with `{ product_id, purchase_token, order_id, package_name }` ready for
 * `POST /api/payments/google-play/verify`.
 */
export function purchaseWithGooglePlay(planKey, options = {}) {
  const normalizedPlan = String(planKey || '').trim().toLowerCase();
  const productId = (
    options.productId ||
    options.products?.[normalizedPlan] ||
    PLAN_TO_PLAY_SKU[normalizedPlan] ||
    ''
  ).trim();

  if (!productId) {
    return Promise.reject(new Error(`Unknown Google Play plan "${planKey}".`));
  }

  const bridge = getNativeBridge();
  if (
    !bridge ||
    (typeof bridge.launchPlayBilling !== 'function' && typeof bridge.launchPurchase !== 'function')
  ) {
    return Promise.reject(
      new Error('Google Play Billing is only available inside the PyMasters Android app.')
    );
  }

  const productType =
    options.productType ||
    (productId.endsWith('_30d') || productId.includes('_pass') ? 'inapp' : 'subs');
  const obfuscatedAccountId = options.userId ? String(options.userId).trim() : '';

  return new Promise((resolve, reject) => {
    let settled = false;
    const prevGlobalCallback = window.onPyMastersPlayPurchase;

    const cleanup = () => {
      window.removeEventListener(PLAY_PURCHASE_EVENT, onEvent);
      if (window.onPyMastersPlayPurchase === onDirectCallback) {
        window.onPyMastersPlayPurchase = prevGlobalCallback;
      }
      clearTimeout(timer);
    };

    const handleDetail = (detail) => {
      if (settled || !detail) return;
      const incomingProduct = (detail.product_id || detail.productId || '').trim();
      if (incomingProduct && incomingProduct !== productId) {
        return;
      }
      settled = true;
      cleanup();
      try {
        resolve(normalizePurchasePayload(detail, productId));
      } catch (err) {
        reject(err);
      }
    };

    function onEvent(event) {
      handleDetail(event?.detail);
    }

    function onDirectCallback(detail) {
      if (typeof prevGlobalCallback === 'function') {
        try {
          prevGlobalCallback(detail);
        } catch {
          // Ignore secondary listener failures
        }
      }
      handleDetail(detail);
    }

    const timer = setTimeout(() => {
      if (settled) return;
      settled = true;
      cleanup();
      const err = new Error('Google Play checkout timed out. If your purchase completed, reopen Upgrade to sync.');
      err.code = 'TIMEOUT';
      reject(err);
    }, options.timeoutMs || PURCHASE_TIMEOUT_MS);

    window.addEventListener(PLAY_PURCHASE_EVENT, onEvent);
    window.onPyMastersPlayPurchase = onDirectCallback;

    try {
      let maybeResult;
      if (typeof bridge.launchPlayBilling === 'function') {
        if (obfuscatedAccountId && bridge.launchPlayBilling.length !== 2) {
          try {
            maybeResult = bridge.launchPlayBilling(productId, productType, obfuscatedAccountId);
          } catch {
            maybeResult = bridge.launchPlayBilling(productId, productType);
          }
        } else {
          maybeResult = bridge.launchPlayBilling(productId, productType);
        }
      } else {
        maybeResult = obfuscatedAccountId
          ? bridge.launchPurchase(productId, productType, obfuscatedAccountId)
          : bridge.launchPurchase(productId, productType);
      }

      if (maybeResult && typeof maybeResult.then === 'function') {
        maybeResult.then(handleDetail).catch((err) => {
          if (settled) return;
          settled = true;
          cleanup();
          reject(err);
        });
      } else if (maybeResult && typeof maybeResult === 'object') {
        handleDetail(maybeResult);
      }
    } catch (err) {
      if (!settled) {
        settled = true;
        cleanup();
        reject(err);
      }
    }
  });
}

/**
 * Subscribe to unsolicited `pymasters:play-purchase` events fired by
 * PlayBillingManager.onResume() when recovering an interrupted purchase.
 */
export function onRecoveredPlayPurchase(callback) {
  if (typeof window === 'undefined' || typeof callback !== 'function') {
    return () => {};
  }
  const handler = (event) => {
    const detail = event?.detail;
    if (!detail) return;
    const status = String(detail.status || '').toUpperCase();
    if (status !== 'PURCHASED' && detail.ok !== true) return;
    try {
      const normalized = normalizePurchasePayload(detail, detail.product_id || detail.productId);
      callback(normalized);
    } catch {
      // Ignore non-actionable recovery payloads
    }
  };
  window.addEventListener(PLAY_PURCHASE_EVENT, handler);
  return () => window.removeEventListener(PLAY_PURCHASE_EVENT, handler);
}
