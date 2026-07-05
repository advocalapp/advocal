import { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, ScrollView, Pressable, ActivityIndicator, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { CircleCheck, ShieldCheck, FlaskConical, ChevronLeft, Star } from 'lucide-react-native';
import { useSession } from '@/ctx';
import { PLANS, PlanType, probeTestMode, createOrder, markPaymentCancelled } from '@/lib/razorpay';
import { supabase } from '@/client/supabase';
import { F } from '@/lib/fonts';
import { getSubscriptionInfo } from '@/db/api';
import * as WebBrowser from 'expo-web-browser';

const FEATURES = [
  { title: 'Smart Case Tracking',   desc: 'Effortlessly organize and monitor your practice.' },
  { title: 'Court & Room Tracking', desc: 'Precise room and court identification.' },
  { title: 'Hearing Timeline',      desc: 'Detailed, chronological record of every event.' },
  { title: 'CNR Extraction',        desc: 'Instantly pull case details from official records.' },
  { title: 'Unlimited Reminders',   desc: 'Automated SMS and WhatsApp alerts.' },
];

const POLL_INTERVAL_MS = 3000;
const POLL_TIMEOUT_MS  = 300000;

export default function PaymentScreen() {
  const router                            = useRouter();
  const { session }                       = useSession();
  const [selectedPlan, setSelectedPlan]   = useState<PlanType>('monthly');
  const [paying, setPaying]               = useState<PlanType | null>(null);
  const [polling, setPolling]             = useState(false);
  const [error, setError]                 = useState('');
  const [testMode, setTestMode]           = useState<boolean | null>(null);
  const [userProfile, setUserProfile]     = useState<any>(null);

  const pollTimerRef  = useRef<ReturnType<typeof setInterval> | null>(null);
  const pollStartRef  = useRef<number>(0);
  const prevEndDate   = useRef<string | null>(null); // snapshot before payment to detect NEW activation

  useEffect(() => { probeTestMode().then((r) => setTestMode(r)); }, []);

  // Load user profile to determine current plan
  useFocusEffect(useCallback(() => {
    if (!session?.user?.id) return;
    supabase.from('profiles').select('subscription_status, subscription_plan, subscription_end_date')
      .eq('id', session.user.id).single()
      .then(({ data }) => setUserProfile(data));
    return () => stopPolling();
  }, [session?.user?.id]));

  const stopPolling = () => {
    if (pollTimerRef.current) { clearInterval(pollTimerRef.current); pollTimerRef.current = null; }
    setPolling(false);
  };

  const startPolling = (userId: string) => {
    setPolling(true);
    pollStartRef.current = Date.now();
    pollTimerRef.current = setInterval(async () => {
      if (Date.now() - pollStartRef.current > POLL_TIMEOUT_MS) {
        stopPolling(); setPaying(null);
        router.replace(`/(app)/payment-failed?reason=${encodeURIComponent('Payment timed out. If you completed the payment, please contact support with your Razorpay payment ID.')}` as any);
        return;
      }
      const { data } = await supabase.from('profiles')
        .select('subscription_status, subscription_end_date')
        .eq('id', userId).single();
      // Only navigate when end_date is genuinely newer than what we had before paying
      const newEndDate = data?.subscription_end_date ?? null;
      const isNewActivation = data?.subscription_status === 'premium' &&
        newEndDate !== prevEndDate.current &&
        (!prevEndDate.current || new Date(newEndDate) > new Date(prevEndDate.current));
      if (isNewActivation) {
        stopPolling();
        const { data: pmt } = await supabase.from('payments').select('razorpay_payment_id')
          .eq('user_id', userId).eq('payment_status', 'captured')
          .order('created_at', { ascending: false }).limit(1).single();
        router.replace(`/(app)/payment-success?payment_id=${encodeURIComponent(pmt?.razorpay_payment_id ?? '')}` as any);
      }
    }, POLL_INTERVAL_MS);
  };

  const handleCheckStatus = useCallback(async () => {
    if (!session?.user?.id) return;
    setError('');
    const { data } = await supabase.from('profiles').select('subscription_status').eq('id', session.user.id).single();
    if (data?.subscription_status === 'premium') {
      stopPolling();
      const { data: pmt } = await supabase.from('payments').select('razorpay_payment_id')
        .eq('user_id', session.user.id).eq('payment_status', 'captured')
        .order('created_at', { ascending: false }).limit(1).single();
      router.replace(`/(app)/payment-success?payment_id=${encodeURIComponent(pmt?.razorpay_payment_id ?? '')}` as any);
    } else {
      setError('Payment not confirmed yet. Please complete payment on Razorpay first.');
    }
  }, [session, router]);

  const handlePurchase = useCallback(async (planType: PlanType) => {
    if (!session?.user?.id) { setError('You must be signed in to subscribe.'); return; }
    stopPolling(); setPaying(planType); setError('');
    try {
      // Snapshot current end_date so polling can detect a genuinely NEW activation
      const { data: snap } = await supabase.from('profiles')
        .select('subscription_end_date').eq('id', session.user.id).single();
      prevEndDate.current = snap?.subscription_end_date ?? null;

      const order = await createOrder(planType);
      if (!order.success) {
        router.replace(`/(app)/payment-failed?reason=${encodeURIComponent(order.error ?? 'Could not create payment order. Please try again.')}` as any);
        setPaying(null); return;
      }
      await Linking.openURL(order.paymentLinkUrl);
      startPolling(session.user.id);
    } catch (e: any) {
      router.replace(`/(app)/payment-failed?reason=${encodeURIComponent(e?.message ?? 'Could not open payment page. Please try again.')}` as any);
      setPaying(null);
    }
  }, [session]);

  const sub     = getSubscriptionInfo(userProfile);
  const isActive = sub.status === 'premium';
  const canRenew = isActive && sub.daysLeft <= 7;

  // Determine button state for each plan
  const planDisabled = (planType: PlanType): boolean => {
    if (!isActive) return false;                        // expired/trial → both enabled
    if (userProfile?.subscription_plan === planType) return !canRenew; // same plan → disabled unless ≤7 days
    return false;                                       // different plan → always enabled (upgrade)
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#E8F3FC' }}>
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 36, paddingTop: 20 }}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Back */}
          <Pressable onPress={() => router.back()} hitSlop={12}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 16 }}>
            <ChevronLeft size={18} color="#0078ff" strokeWidth={2.5} />
            <Text style={{ fontSize: 14, fontFamily: F.medium, color: '#0078ff' }}>Back</Text>
          </Pressable>

          {/* Test mode badge */}
          {testMode === true && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#FEF3C7', borderRadius: 999, paddingHorizontal: 14, paddingVertical: 6, marginBottom: 18, borderWidth: 1, borderColor: '#F59E0B' }}>
              <FlaskConical size={13} color="#B45309" strokeWidth={2.5} />
              <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#B45309', letterSpacing: 0.3 }}>SANDBOX — Test payments only</Text>
            </View>
          )}

          <Text style={{ fontSize: 26, fontFamily: F.extraBold, color: '#0D1A3A', textAlign: 'center', lineHeight: 32, marginBottom: 8 }}>
            Choose Your Plan
          </Text>
          <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#374151', textAlign: 'center', lineHeight: 21, marginBottom: 22, paddingHorizontal: 4 }}>
            {isActive
              ? canRenew
                ? 'Your plan expires soon — renew now and your remaining days will carry over.'
                : 'Upgrade to yearly and your remaining days will be added on top.'
              : 'Unlock full Pro access and keep managing your legal practice without interruption.'}
          </Text>

          {/* Remaining days carry-over notice */}
          {isActive && (
            <View style={{ width: '100%', backgroundColor: '#FFFBEA', borderRadius: 12, borderWidth: 1, borderColor: '#F59E0B', paddingVertical: 10, paddingHorizontal: 14, marginBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
              <Star size={14} color="#D97706" strokeWidth={2} />
              <Text style={{ flex: 1, fontSize: 12, fontFamily: F.bold, color: '#92400E' }}>
                {sub.daysLeft} day{sub.daysLeft !== 1 ? 's' : ''} remaining — these will be added on top of your new plan.
              </Text>
            </View>
          )}

          {/* ── Billing toggle ── */}
          <View style={{
            flexDirection: 'row', backgroundColor: '#EBEBEB',
            borderRadius: 999, padding: 4, marginBottom: 20, alignSelf: 'center',
          }}>
            {(['monthly', 'yearly'] as PlanType[]).map((pt) => (
              <Pressable
                key={pt}
                onPress={() => setSelectedPlan(pt)}
                style={{
                  paddingHorizontal: 32, paddingVertical: 10, borderRadius: 999,
                  backgroundColor: selectedPlan === pt ? '#FFFFFF' : 'transparent',
                  boxShadow: selectedPlan === pt
                    ? [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.12)' }]
                    : undefined,
                }}
              >
                <Text style={{
                  fontSize: 14,
                  fontFamily: selectedPlan === pt ? F.bold : F.medium,
                  color: selectedPlan === pt ? '#0D1A3A' : '#6B7280',
                }}>
                  {pt === 'monthly' ? 'Monthly' : 'Yearly'}
                </Text>
              </Pressable>
            ))}
          </View>

          {/* ── Single plan card for selected plan ── */}
          {(() => {
            const planType  = selectedPlan;
            const plan      = PLANS[planType];
            const isCurrent = isActive && userProfile?.subscription_plan === planType;
            const disabled  = planDisabled(planType);
            const isLoading = paying === planType;

            return (
              <View key={planType} style={{
                width: '100%', backgroundColor: '#FFFFFF',
                borderRadius: 20, borderWidth: isCurrent ? 2 : 1.5,
                borderColor: isCurrent ? '#F59E0B' : '#0078ff',
                padding: 20, marginBottom: 16,
                boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: isCurrent ? 'rgba(245,158,11,0.12)' : 'rgba(26,86,219,0.10)' }],
              }}>
                <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 6 }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                    <Text style={{ fontSize: 11, fontFamily: F.bold, color: isCurrent ? '#92400E' : '#0078ff', letterSpacing: 1.1, textTransform: 'uppercase' }}>
                      {plan.label}
                    </Text>
                    {isCurrent && (
                      <View style={{ backgroundColor: '#F59E0B', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontFamily: F.bold, color: '#fff', letterSpacing: 0.5 }}>CURRENT PLAN</Text>
                      </View>
                    )}
                    {planType === 'yearly' && !isCurrent && (
                      <View style={{ backgroundColor: '#1E8A3C', borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 }}>
                        <Text style={{ fontSize: 9, fontFamily: F.bold, color: '#fff', letterSpacing: 0.5 }}>SAVE 15%</Text>
                      </View>
                    )}
                  </View>
                  <ShieldCheck size={32} color={isCurrent ? '#D97706' : '#1E8A3C'} strokeWidth={1.6} />
                </View>

                <Text style={{ fontSize: 34, fontFamily: F.extraBold, color: '#0D1A3A', marginBottom: 16 }}>
                  {plan.displayPrice}<Text style={{ fontSize: 16, fontFamily: F.regular, color: '#6B7280' }}>{plan.period}</Text>
                </Text>

                <View style={{ gap: 12, marginBottom: 20 }}>
                  {FEATURES.map(({ title, desc }) => (
                    <View key={title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
                      <CircleCheck size={18} color="#1E8A3C" strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
                      <View style={{ flex: 1 }}>
                        <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0D1A3A', lineHeight: 18 }}>{title}</Text>
                        <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#6B7280', lineHeight: 16 }}>{desc}</Text>
                      </View>
                    </View>
                  ))}
                </View>

                {disabled ? (
                  <View style={{ backgroundColor: '#E5E7EB', borderRadius: 14, paddingVertical: 15, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#9CA3AF' }}>
                      {canRenew ? `Renew ${plan.displayPrice}` : 'Active Plan'}
                    </Text>
                    {!canRenew && (
                      <Text style={{ fontSize: 11, fontFamily: F.medium, color: '#9CA3AF', marginTop: 2 }}>
                        Renew unlocks when 7 days are left ({sub.daysLeft - 7} days to go)
                      </Text>
                    )}
                  </View>
                ) : (
                  <Pressable
                    onPress={() => handlePurchase(planType)}
                    disabled={!!paying || polling}
                    style={{
                      backgroundColor: isLoading ? '#145C2A' : (isCurrent ? '#F59E0B' : '#1E6E36'),
                      borderRadius: 14, paddingVertical: 15, alignItems: 'center',
                      opacity: (paying && !isLoading) ? 0.5 : 1,
                    }}
                  >
                    {isLoading
                      ? <ActivityIndicator color="#fff" />
                      : <Text style={{ fontSize: 15, fontFamily: F.extraBold, color: '#FFFFFF', letterSpacing: 0.3 }}>
                          {isCurrent ? `Renew — ${plan.displayPrice}` : `Get ${plan.label} — ${plan.displayPrice}`}
                        </Text>
                    }
                  </Pressable>
                )}
              </View>
            );
          })()}

          {!!error && (
            <Text style={{ fontSize: 12, fontFamily: F.medium, color: '#E53E3E', textAlign: 'center', marginBottom: 10 }}>{error}</Text>
          )}

          {/* Polling state */}
          {polling && (
            <View style={{ width: '100%', gap: 12, marginTop: 4 }}>
              <View style={{ backgroundColor: '#F0FDF4', borderRadius: 12, padding: 16, alignItems: 'center', gap: 8, borderWidth: 1, borderColor: '#BBF7D0' }}>
                <ActivityIndicator color="#1E6E36" />
                <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#1E6E36', textAlign: 'center' }}>Waiting for payment confirmation…</Text>
                <Text style={{ fontSize: 12, fontFamily: F.regular, color: '#6B7280', textAlign: 'center' }}>Complete your payment on Razorpay, then return here.</Text>
              </View>
              <Pressable onPress={handleCheckStatus} style={{ backgroundColor: '#0078ff', borderRadius: 14, paddingVertical: 14, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#FFFFFF' }}>I Already Paid — Check Now</Text>
              </Pressable>
              <Pressable onPress={() => { stopPolling(); setPaying(null); setError(''); }} style={{ paddingVertical: 10, alignItems: 'center' }}>
                <Text style={{ fontSize: 13, fontFamily: F.medium, color: '#6B7280' }}>Cancel</Text>
              </Pressable>
            </View>
          )}

          {/* Legal links */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 20, flexWrap: 'wrap' }}>
            <Pressable onPress={() => WebBrowser.openBrowserAsync('https://advocal.in/terms')}>
              <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff', textDecorationLine: 'underline' }}>Terms of Service</Text>
            </Pressable>
            <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#9CA3AF' }}>·</Text>
            <Pressable onPress={() => WebBrowser.openBrowserAsync('https://advocal.in/privacy')}>
              <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff', textDecorationLine: 'underline' }}>Privacy Policy</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

