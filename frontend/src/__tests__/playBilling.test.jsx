import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { render } from '../games/__tests__/render.js';

const mockUpdateUser = vi.fn();
const mockGetAccessStatus = vi.fn();
const mockGetPaymentConfig = vi.fn();
const mockCreatePaymentOrder = vi.fn();
const mockVerifyPayment = vi.fn();
const mockVerifyGooglePlayPayment = vi.fn();
const mockLoadRazorpay = vi.fn();

vi.mock('../context/AuthContext', () => ({
  useAuth: () => ({
    user: { id: 'u_42', name: 'Asha', email: 'asha@example.com' },
    updateUser: mockUpdateUser,
  }),
}));

vi.mock('../api', () => ({
  default: { get: vi.fn(() => Promise.resolve({ data: { lessons: 430, tracks: 24 } })) },
  getAccessStatus: (...args) => mockGetAccessStatus(...args),
  getPaymentConfig: (...args) => mockGetPaymentConfig(...args),
  createPaymentOrder: (...args) => mockCreatePaymentOrder(...args),
  verifyPayment: (...args) => mockVerifyPayment(...args),
  verifyGooglePlayPayment: (...args) => mockVerifyGooglePlayPayment(...args),
  submitAccessRequest: vi.fn(),
  submitIssueReport: vi.fn(),
}));

vi.mock('../lib/razorpay', () => ({
  loadRazorpay: (...args) => mockLoadRazorpay(...args),
}));

import {
  PLAN_TO_PLAY_SKU,
  isAndroidWebView,
  isPlayBillingAvailable,
  purchaseWithGooglePlay,
} from '../lib/playBilling';
import Upgrade from '../pages/Upgrade';
import Pricing from '../pages/Pricing';

const flush = () => new Promise((r) => setTimeout(r, 0));

describe('Google Play Billing routing & Android WebView compliance', () => {
  let mounted = [];
  const mount = (el) => {
    const r = render(<MemoryRouter>{el}</MemoryRouter>);
    mounted.push(r);
    return r;
  };

  beforeEach(() => {
    vi.clearAllMocks();
    delete window.PyMastersAndroid;
    delete window.PyMastersBilling;
    mockGetAccessStatus.mockResolvedValue({ data: { status: 'trial', trial_days_left: 5 } });
    mockGetPaymentConfig.mockResolvedValue({
      data: {
        enabled: true,
        key_id: 'rzp_live_123',
        currency: 'INR',
        google_play: {
          enabled: true,
          package_name: 'net.pymasters.app',
          products: {
            beginner: 'pymasters_beginner_monthly',
            pro: 'pymasters_pro_monthly',
          },
        },
      },
    });
    mockVerifyGooglePlayPayment.mockResolvedValue({
      data: { success: true, plan: 'pro' },
    });
  });

  afterEach(() => {
    mounted.forEach((r) => r.unmount());
    mounted = [];
    delete window.PyMastersAndroid;
    delete window.PyMastersBilling;
  });

  it('detects Android WebView and resolves purchaseWithGooglePlay from CustomEvent', async () => {
    expect(isAndroidWebView()).toBe(false);
    expect(isPlayBillingAvailable()).toBe(false);
    expect(PLAN_TO_PLAY_SKU).toEqual({
      beginner: 'pymasters_beginner_monthly',
      pro: 'pymasters_pro_monthly',
    });

    window.PyMastersAndroid = {
      isAndroidApp: () => true,
      isPlayBillingAvailable: () => true,
      launchPlayBilling: vi.fn((productId) => {
        setTimeout(() => {
          window.dispatchEvent(
            new CustomEvent('pymasters:play-purchase', {
              detail: {
                status: 'PURCHASED',
                ok: true,
                productId,
                purchaseToken: 'play_tok_abc',
                orderId: 'GPA.1234-5678',
                packageName: 'net.pymasters.app',
              },
            })
          );
        }, 5);
      }),
    };

    expect(isAndroidWebView()).toBe(true);
    expect(isPlayBillingAvailable()).toBe(true);

    const receipt = await purchaseWithGooglePlay('pro', { userId: 'u_42' });
    expect(window.PyMastersAndroid.launchPlayBilling).toHaveBeenCalledWith(
      'pymasters_pro_monthly',
      'subs',
      'u_42'
    );
    expect(receipt).toEqual({
      product_id: 'pymasters_pro_monthly',
      purchase_token: 'play_tok_abc',
      order_id: 'GPA.1234-5678',
      package_name: 'net.pymasters.app',
    });
  });

  it('Upgrade inside Android WebView never references Razorpay and completes Play purchase', async () => {
    window.PyMastersAndroid = {
      isAndroidApp: () => true,
      isPlayBillingAvailable: () => true,
      launchPlayBilling: vi.fn((productId) => {
        window.dispatchEvent(
          new CustomEvent('pymasters:play-purchase', {
            detail: {
              status: 'PURCHASED',
              ok: true,
              product_id: productId,
              purchase_token: 'tok_upgrade_pro',
              order_id: 'GPA.9999',
              package_name: 'net.pymasters.app',
            },
          })
        );
      }),
    };

    const r = mount(<Upgrade />);
    await r.act(async () => {
      await flush();
    });

    expect(r.container.textContent).not.toMatch(/Razorpay/i);
    expect(r.container.textContent).toMatch(/Google Play Subscriptions/i);
    expect(r.container.textContent).toMatch(/100% Ad-Free/i);

    const proBtn = [...r.container.querySelectorAll('button')].find((b) =>
      b.textContent.includes('Subscribe with Google Play · ₹999')
    );
    expect(proBtn).toBeTruthy();

    await r.act(async () => {
      proBtn.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      await flush();
    });

    expect(mockLoadRazorpay).not.toHaveBeenCalled();
    expect(mockCreatePaymentOrder).not.toHaveBeenCalled();
    expect(mockVerifyGooglePlayPayment).toHaveBeenCalledWith({
      product_id: 'pymasters_pro_monthly',
      purchase_token: 'tok_upgrade_pro',
      order_id: 'GPA.9999',
      package_name: 'net.pymasters.app',
    });
    expect(mockUpdateUser).toHaveBeenCalledWith({ plan: 'pro' });
  });

  it('Pricing inside Android WebView hides Razorpay and highlights Google Play + 100% Ad-Free', async () => {
    window.PyMastersAndroid = {
      isAndroidApp: () => true,
      isPlayBillingAvailable: () => true,
      launchPlayBilling: vi.fn(),
    };

    const r = mount(<Pricing />);
    await r.act(async () => {
      await flush();
    });

    expect(r.container.textContent).not.toMatch(/Razorpay/i);
    expect(r.container.textContent).toMatch(/Google Play Subscriptions/i);
    expect(r.container.textContent).toMatch(/100% Ad-Free/i);
  });
});
