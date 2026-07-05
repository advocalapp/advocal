import { useState, useCallback } from 'react';
import { View, Text, Pressable, ActivityIndicator, Linking, ScrollView } from 'react-native';
import { Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ChevronLeft, CheckCircle2, Smartphone } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { PLANS, UPI_VPA, UPI_MERCHANT_NAME, PlanType } from '@/lib/razorpay';
import { F } from '@/lib/fonts';

// QR Code image — Razorpay UPI QR provided by user
const QR_IMAGE_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260620/QrCode.jpeg';

// UPI app configs
const UPI_APPS = [
  {
    name: 'GPay',
    scheme: `tez://upi/pay?pa=${UPI_VPA}&pn=${encodeURIComponent(UPI_MERCHANT_NAME)}&am=1&cu=INR&tn=${encodeURIComponent('AdvoCal Premium')}`,
    fallback: `upi://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(UPI_MERCHANT_NAME)}&am=1&cu=INR&tn=${encodeURIComponent('AdvoCal Premium')}`,
    color: '#0078ff',
    bg: '#EEF4FF',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f2/Google_Pay_Logo.svg/120px-Google_Pay_Logo.svg.png',
  },
  {
    name: 'PhonePe',
    scheme: `phonepe://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(UPI_MERCHANT_NAME)}&am=1&cu=INR&tn=${encodeURIComponent('AdvoCal Premium')}`,
    fallback: `upi://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(UPI_MERCHANT_NAME)}&am=1&cu=INR&tn=${encodeURIComponent('AdvoCal Premium')}`,
    color: '#5F259F',
    bg: '#F3ECFF',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/71/PhonePe_Logo.svg/120px-PhonePe_Logo.svg.png',
  },
  {
    name: 'Paytm',
    scheme: `paytmmp://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(UPI_MERCHANT_NAME)}&am=1&cu=INR&tn=${encodeURIComponent('AdvoCal Premium')}`,
    fallback: `upi://pay?pa=${UPI_VPA}&pn=${encodeURIComponent(UPI_MERCHANT_NAME)}&am=1&cu=INR&tn=${encodeURIComponent('AdvoCal Premium')}`,
    color: '#002970',
    bg: '#E8F0FF',
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/24/Paytm_Logo_%28standalone%29.svg/120px-Paytm_Logo_%28standalone%29.svg.png',
  },
];

export default function QRPaymentScreen() {
  const router = useRouter();
  const { plan } = useLocalSearchParams<{ plan: string }>();
  const planType: PlanType = plan === 'yearly' ? 'yearly' : 'monthly';
  const planInfo = PLANS[planType];

  const [confirming, setConfirming] = useState(false);
  const [error, setError]           = useState('');
  const [btnPressed, setBtnPressed] = useState(false);
  // Track pressed state per UPI app (no function-style Pressable — crashes NativeWind on web)
  const [pressedApp, setPressedApp] = useState<string | null>(null);

  const openUpiApp = useCallback(async (app: typeof UPI_APPS[0]) => {
    try {
      // Skip canOpenURL — unreliable for custom schemes without manifest declarations.
      // Directly attempt to open; catch error if app not installed.
      await Linking.openURL(app.scheme);
    } catch {
      try {
        // Fallback: generic upi:// intent — works on most Android UPI apps
        await Linking.openURL(app.fallback);
      } catch {
        setError(`${app.name} is not installed. Please scan the QR code instead.`);
        setTimeout(() => setError(''), 4000);
      }
    }
  }, []);

  const handleConfirmPayment = useCallback(async () => {
    setConfirming(true);
    setError('');
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { setError('Session expired. Please sign in again.'); setConfirming(false); return; }

      const now    = new Date();
      const expiry = new Date(now.getTime() + planInfo.days * 24 * 60 * 60 * 1000);
      const upiRef = `upi_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

      await supabase.from('payments').insert({
        user_id:             user.id,
        plan_type:           planType,
        amount:              planInfo.amount,
        currency:            'INR',
        razorpay_order_id:   upiRef,
        payment_status:      'pending',
        subscription_start:  now.toISOString(),
        subscription_expiry: expiry.toISOString(),
        webhook_verified:    false,
        error_description:   'Manual UPI QR payment — awaiting admin verification',
      });

      await supabase.from('profiles').update({
        subscription_status:     'premium',
        subscription_plan:       planType,
        subscription_start_date: now.toISOString(),
        subscription_end_date:   expiry.toISOString(),
        updated_at:              now.toISOString(),
      }).eq('id', user.id);

      router.replace('/(app)/payment-success' as any);
    } catch (e: any) {
      router.replace(`/(app)/payment-failed?reason=${encodeURIComponent(e?.message ?? 'Something went wrong. Please try again or contact support.')}` as any);
    } finally {
      setConfirming(false);
    }
  }, [planType, planInfo, router]);

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F5FF' }}>
      <StatusBar style="dark" backgroundColor="#F0F5FF" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{ alignItems: 'center', paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12 }}
          showsVerticalScrollIndicator={false}
          contentInsetAdjustmentBehavior="automatic"
        >
          {/* Back */}
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={{ alignSelf: 'flex-start', flexDirection: 'row', alignItems: 'center', gap: 4, marginBottom: 12 }}
          >
            <ChevronLeft size={18} color="#0078ff" strokeWidth={2.5} />
            <Text style={{ fontSize: 14, fontFamily: F.medium, color: '#0078ff' }}>Back</Text>
          </Pressable>

          {/* Header */}
          <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#0D1A3A', textAlign: 'center', marginBottom: 2 }}>
            Pay with UPI
          </Text>
          <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', marginBottom: 16 }}>
            Scan the QR code or tap an app below
          </Text>

          {/* Amount pill */}
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 8,
            backgroundColor: '#FFFFFF', borderRadius: 999, paddingHorizontal: 20, paddingVertical: 8,
            marginBottom: 18, borderWidth: 1.5, borderColor: '#0078ff',
            boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(26,86,219,0.12)' }],
          }}>
            <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#0078ff' }}>₹1</Text>
            <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#6B7280' }}>· AdvoCal Premium · {planType}</Text>
          </View>

          {/* QR Code Card */}
          <View style={{
            backgroundColor: '#FFFFFF', borderRadius: 24, padding: 12,
            marginBottom: 20, width: '100%', alignItems: 'center',
            boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.08)' }],
          }}>
            <Image
              source={{ uri: QR_IMAGE_URL }}
              style={{ width: 280, height: 350, borderRadius: 12 }}
              contentFit="contain"
            />
            <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#9CA3AF', marginTop: 8 }}>
              Powered by Razorpay · BHIM UPI
            </Text>
          </View>

          {/* Divider */}
          <View style={{ flexDirection: 'row', alignItems: 'center', width: '100%', marginBottom: 16, gap: 10 }}>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
            <Text style={{ fontSize: 12, fontFamily: F.medium, color: '#9CA3AF' }}>OR PAY DIRECTLY</Text>
            <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
          </View>

          {/* UPI App Buttons — useState pressed, not function-style style prop */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 14, marginBottom: 24, width: '100%' }}>
            {UPI_APPS.map((app) => (
              <Pressable
                key={app.name}
                onPress={() => openUpiApp(app)}
                onPressIn={() => setPressedApp(app.name)}
                onPressOut={() => setPressedApp(null)}
                style={{
                  flex: 1, alignItems: 'center', gap: 8,
                  backgroundColor: pressedApp === app.name ? app.bg : '#FFFFFF',
                  borderRadius: 16, paddingVertical: 14, paddingHorizontal: 8,
                  borderWidth: 1.5, borderColor: pressedApp === app.name ? app.color : '#E5E7EB',
                  boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 6, color: 'rgba(0,0,0,0.06)' }],
                }}
              >
                <Image
                  source={{ uri: app.logo }}
                  style={{ width: 40, height: 28 }}
                  contentFit="contain"
                />
                <Text style={{ fontSize: 11, fontFamily: F.bold, color: app.color }}>{app.name}</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Smartphone size={10} color="#9CA3AF" strokeWidth={2} />
                  <Text style={{ fontSize: 9, fontFamily: F.regular, color: '#9CA3AF' }}>Tap to open</Text>
                </View>
              </Pressable>
            ))}
          </View>

          {/* Error */}
          {!!error && (
            <View style={{ backgroundColor: '#FEF2F2', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14, width: '100%', borderWidth: 1, borderColor: '#FCA5A5' }}>
              <Text style={{ fontSize: 12, fontFamily: F.medium, color: '#DC2626', textAlign: 'center' }}>{error}</Text>
            </View>
          )}

          {/* Instructions */}
          <View style={{
            backgroundColor: '#FFFBEB', borderRadius: 14, padding: 14, marginBottom: 20,
            width: '100%', borderWidth: 1, borderColor: '#FDE68A', gap: 6,
          }}>
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#92400E', marginBottom: 4 }}>
              📋 How to Pay
            </Text>
            {[
              '1. Scan the QR code above with any UPI app',
              '2. Or tap GPay / PhonePe / Paytm to auto-open',
              '3. Pay ₹1 and complete the transaction',
              "4. Come back and tap \"I've Paid\" below",
            ].map((step) => (
              <Text key={step} style={{ fontSize: 11, fontFamily: F.regular, color: '#78350F', lineHeight: 17 }}>{step}</Text>
            ))}
          </View>

          {/* Confirm CTA */}
          <Pressable
            onPress={handleConfirmPayment}
            disabled={confirming}
            onPressIn={() => setBtnPressed(true)}
            onPressOut={() => setBtnPressed(false)}
            style={{
              width: '100%',
              backgroundColor: btnPressed ? '#15803D' : '#16A34A',
              borderRadius: 16, paddingVertical: 18, alignItems: 'center',
              opacity: confirming ? 0.75 : 1,
              flexDirection: 'row', justifyContent: 'center', gap: 10,
            }}
          >
            {confirming ? (
              <ActivityIndicator color="#fff" />
            ) : (
              <>
                <CheckCircle2 size={20} color="#FFFFFF" strokeWidth={2.5} />
                <Text style={{ fontSize: 17, fontFamily: F.extraBold, color: '#FFFFFF', letterSpacing: 0.3 }}>
                  I've Paid — Activate Premium
                </Text>
              </>
            )}
          </Pressable>

          <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#9CA3AF', textAlign: 'center', marginTop: 12 }}>
            Your subscription will be activated instantly after confirmation.
          </Text>

          {/* Legal links */}
          <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, marginTop: 14, marginBottom: 4, flexWrap: 'wrap' }}>
            <Pressable onPress={() => Linking.openURL('https://advocal.in/terms')}>
              <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff', textDecorationLine: 'underline' }}>Terms of Service</Text>
            </Pressable>
            <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#9CA3AF' }}>·</Text>
            <Pressable onPress={() => Linking.openURL('https://advocal.in/privacy')}>
              <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff', textDecorationLine: 'underline' }}>Privacy Policy</Text>
            </Pressable>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}
