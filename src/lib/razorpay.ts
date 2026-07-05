/**
 * Razorpay billing service for AdvoCal
 * - Creates orders via Edge Function (server-side, keeps key secret)
 * - Verifies payment via Edge Function (HMAC-SHA256 signature check)
 * - Uses expo-web-browser to open Razorpay checkout page on Android/iOS
 *
 * NOTE: Razorpay does NOT have a native React Native SDK that works in
 * managed Expo. We use their standard web checkout URL approach via
 * expo-web-browser, which works on Android and iOS without any native module.
 */

import { supabase } from '@/client/supabase';

export const PLANS = {
  monthly: { amount: 4900,  label: 'Monthly Plan', period: '/month', displayPrice: '₹49', days: 30  },
  yearly:  { amount: 49900, label: 'Yearly Plan',  period: '/year',  displayPrice: '₹499', days: 365 },
} as const;

/** UPI Virtual Payment Address — update to your Razorpay UPI VPA */
export const UPI_VPA = 'advocal@razorpay';
export const UPI_MERCHANT_NAME = 'AdvoCal';

export type PlanType = keyof typeof PLANS;

/**
 * Returns true when the active Razorpay key is a test key (starts with "rzp_test_").
 * Used to show the sandbox mode banner on payment screens.
 */
export function isTestMode(keyId: string): boolean {
  return keyId.startsWith('rzp_test_');
}

export type OrderResult =
  | { success: true; paymentLinkUrl: string; linkId: string; amount: number; keyId: string }
  | { success: false; error: string };

export type VerifyResult =
  | { success: true;  plan_type: PlanType; subscription_expiry: string }
  | { success: false; cancelled: boolean; error: string };

export async function probeTestMode(): Promise<boolean | null> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return null;
    const { data, error } = await supabase.functions.invoke('razorpay-create-order', {
      body: { plan_type: 'monthly', probe_only: true },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });
    if (error || !data?.key_id) return null;
    return isTestMode(data.key_id as string);
  } catch {
    return null;
  }
}

/** Creates a Razorpay Payment Link and returns the hosted rzp.io URL */
export async function createOrder(planType: PlanType): Promise<OrderResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, error: 'Not authenticated' };

    const { data, error } = await supabase.functions.invoke('razorpay-create-order', {
      body: { plan_type: planType },
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) {
      // Extract real error body from FunctionsHttpError if available
      let msg = error.message ?? 'Payment link creation failed';
      try {
        const ctx = (error as any).context;
        if (ctx && typeof ctx.json === 'function') {
          const body = await ctx.json();
          if (body?.error) msg = body.error;
        }
      } catch { /* ignore */ }
      return { success: false, error: msg };
    }
    if (data?.error) return { success: false, error: data.error };

    return {
      success:        true,
      paymentLinkUrl: data.payment_link_url,
      linkId:         data.link_id,
      amount:         data.amount,
      keyId:          data.key_id,
    };
  } catch (e: any) {
    return { success: false, error: e?.message ?? 'Failed to create payment link' };
  }
}

/** Verify payment signature on the server and activate premium */
export async function verifyPayment(params: {
  order_id:   string;
  payment_id: string;
  signature:  string;
}): Promise<VerifyResult> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) return { success: false, cancelled: false, error: 'Not authenticated' };

    const { data, error } = await supabase.functions.invoke('razorpay-verify-payment', {
      body: params,
      headers: { Authorization: `Bearer ${session.access_token}` },
    });

    if (error) return { success: false, cancelled: false, error: error.message ?? 'Verification failed' };
    if (data?.error) return { success: false, cancelled: false, error: data.error };

    return {
      success:             true,
      plan_type:           data.plan_type,
      subscription_expiry: data.subscription_expiry,
    };
  } catch (e: any) {
    return { success: false, cancelled: false, error: e?.message ?? 'Verification failed' };
  }
}

/** Mark a payment as cancelled in DB */
export async function markPaymentCancelled(orderId: string): Promise<void> {
  await supabase
    .from('payments')
    .update({ payment_status: 'cancelled' })
    .eq('razorpay_order_id', orderId);
}

/** Mark a payment as failed in DB */
export async function markPaymentFailed(orderId: string, code: string, desc: string): Promise<void> {
  await supabase
    .from('payments')
    .update({ payment_status: 'failed', error_code: code, error_description: desc })
    .eq('razorpay_order_id', orderId);
}
