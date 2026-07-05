import { useEffect, useRef, useState, useCallback } from 'react';
import { View, Text, Pressable, Animated, ActivityIndicator, ScrollView, Share } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { ShieldCheck, Home, Copy } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { supabase } from '@/client/supabase';
import { F } from '@/lib/fonts';

// ── colours from DESIGN.md ──────────────────────────────────────────────────
const C = {
  bg:          '#F0F2F8',   // very light grey-blue page background
  card:        '#FFFFFF',
  primary:     '#1DA34D',   // brand green
  primaryPale: '#E6F7ED',   // pale green ring / badge bg
  divider:     '#E8EAF0',
  labelGrey:   '#6B7280',
  valueDark:   '#111827',
  activeGreen: '#1DA34D',
};

export default function PaymentSuccessScreen() {
  const router    = useRouter();
  const { payment_id: rawPaymentId } = useLocalSearchParams<{ payment_id?: string }>();
  const paymentId = rawPaymentId ?? '';

  const [copied, setCopied]         = useState(false);
  const [copyPressed, setCopyPressed] = useState(false);
  const [homePressed, setHomePressed] = useState(false);
  const [loading, setLoading]     = useState(true);
  const [planLabel, setPlanLabel] = useState('Monthly Plan — ₹49/month');
  const [validTill, setValidTill] = useState('');

  const scaleAnim = useRef(new Animated.Value(0.72)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;

  // Entrance animation
  useEffect(() => {
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 420, useNativeDriver: true }),
    ]).start();
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
  }, []);

  // Load subscription details from DB
  useFocusEffect(useCallback(() => {
    (async () => {
      setLoading(true);
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from('profiles')
        .select('subscription_plan, subscription_end_date')
        .eq('id', session.user.id)
        .single();

      if (profile) {
        const type = profile.subscription_plan ?? 'monthly';
        setPlanLabel(type === 'yearly' ? 'Yearly Plan — ₹499/year' : 'Monthly Plan — ₹49/month');
        if (profile.subscription_end_date) {
          const d = new Date(profile.subscription_end_date);
          setValidTill(d.toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }));
        }
      }
      setLoading(false);
    })();
  }, []));

  const handleCopy = async () => {
    if (!paymentId) return;
    await Share.share({ message: paymentId });
    await Haptics.selectionAsync();
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 32 }}
          showsVerticalScrollIndicator={false}
        >
          <Animated.View style={{ width: '100%', alignItems: 'center', transform: [{ scale: scaleAnim }], opacity: fadeAnim }}>

            {/* ── Double-ring success icon ───────────────────────────────── */}
            <View style={{
              width: 100, height: 100, borderRadius: 50,
              backgroundColor: C.primaryPale,
              alignItems: 'center', justifyContent: 'center',
              marginBottom: 28,
            }}>
              {/* inner solid green circle */}
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: C.primary,
                alignItems: 'center', justifyContent: 'center',
              }}>
                <ShieldCheck size={36} color="#FFFFFF" strokeWidth={2.2} />
              </View>
            </View>

            {/* ── Title & subtitle ──────────────────────────────────────── */}
            <Text style={{
              fontSize: 28, fontFamily: F.extraBold, color: C.valueDark,
              textAlign: 'center', marginBottom: 8, lineHeight: 36,
            }}>
              Payment{'\n'}Successful!
            </Text>
            <Text style={{
              fontSize: 14, fontFamily: F.semiBold, color: C.labelGrey,
              textAlign: 'center', marginBottom: 20,
            }}>
              Your AdvoCal Premium is now active.
            </Text>

            {/* ── "Premium Activated" pill badge ────────────────────────── */}
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 6,
              backgroundColor: C.primaryPale,
              borderRadius: 999,
              borderWidth: 1, borderColor: '#B8E8CB',
              paddingVertical: 7, paddingHorizontal: 18,
              marginBottom: 32,
            }}>
              <Text style={{ fontSize: 13, color: C.primary, fontFamily: F.bold }}>
                ✦  Premium Activated
              </Text>
            </View>

            {/* ── Details card ──────────────────────────────────────────── */}
            <View style={{
              backgroundColor: C.card,
              borderRadius: 24,
              width: '100%',
              marginBottom: 28,
              overflow: 'hidden',
              // soft ambient shadow (object form — works on Android)
              boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 20, color: 'rgba(0,0,0,0.06)' }],
            } as any}>

              {loading ? (
                <ActivityIndicator color={C.primary} style={{ marginVertical: 36 }} />
              ) : (
                <>
                  {/* Plan row */}
                  <DetailRow label="Plan" value={planLabel} />

                  {/* Status row — green value */}
                  <DetailRow label="Status" value="Active  ✓" valueColor={C.activeGreen} />

                  {/* Valid Till row */}
                  <DetailRow label="Valid Till" value={validTill || '—'} last={!paymentId} />

                  {/* Payment ID row */}
                  {!!paymentId && (
                    <Pressable
                      onPress={handleCopy}
                      onPressIn={() => setCopyPressed(true)}
                      onPressOut={() => setCopyPressed(false)}
                      style={{
                        flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
                        paddingHorizontal: 20, paddingVertical: 16,
                        opacity: copyPressed ? 0.7 : 1,
                      }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: F.regular, color: C.labelGrey }}>
                        Payment ID
                      </Text>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexShrink: 1 }}>
                        <Text
                          style={{ fontSize: 13, fontFamily: F.regular, color: C.valueDark, flexShrink: 1 }}
                          numberOfLines={1}
                        >
                          {paymentId.length > 20 ? `${paymentId.slice(0, 20)}…` : paymentId}
                        </Text>
                        <Copy size={16} color={copied ? C.primary : '#9CA3AF'} strokeWidth={2} />
                      </View>
                    </Pressable>
                  )}
                </>
              )}
            </View>

            {/* ── Go to Home button ─────────────────────────────────────── */}
            <Pressable
              onPress={() => router.replace('/(app)/(tabs)' as any)}
              onPressIn={() => setHomePressed(true)}
              onPressOut={() => setHomePressed(false)}
              style={{
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
                backgroundColor: homePressed ? '#178B3E' : C.primary,
                borderRadius: 16,
                paddingVertical: 17,
                alignSelf: 'stretch',
              }}
            >
              <Home size={20} color="#FFFFFF" strokeWidth={2.2} />
              <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#FFFFFF', letterSpacing: 0.2 }}>
                Go to Home
              </Text>
            </Pressable>

          </Animated.View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
}

// ── Helper: single detail row with bottom divider ────────────────────────────
function DetailRow({
  label, value, valueColor, last = false,
}: { label: string; value: string; valueColor?: string; last?: boolean }) {
  return (
    <View style={{
      flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
      paddingHorizontal: 20, paddingVertical: 16,
      borderBottomWidth: last ? 0 : 1, borderBottomColor: '#E8EAF0',
    }}>
      <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#6B7280' }}>{label}</Text>
      <Text style={{
        fontSize: 14, fontFamily: F.bold,
        color: valueColor ?? '#111827',
        flexShrink: 1, textAlign: 'right', marginLeft: 12,
      }}>
        {value}
      </Text>
    </View>
  );
}
