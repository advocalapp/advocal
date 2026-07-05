import { useEffect, useRef, useState } from 'react';
import { View, Text, Pressable, Animated } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { Home } from 'lucide-react-native';
import * as Haptics from 'expo-haptics';
import { F } from '@/lib/fonts';

// ── colours (DESIGN.md) ──────────────────────────────────────────────────────
const C = {
  bg:        '#F0F2F8',   // same light grey-blue page bg as payment-success
  errorOuter:'#FFE4E4',  // pale red ring
  errorInner:'#C0392B',  // solid dark red circle
  title:     '#111827',
  body:      '#374151',
  btnGreen:  '#1A6B3C',  // dark forest green matching design
  btnPress:  '#145530',
};

export default function PaymentFailedScreen() {
  const router = useRouter();
  const { reason: rawReason } = useLocalSearchParams<{ reason?: string }>();
  const reason = rawReason
    ? decodeURIComponent(rawReason)
    : 'Something went wrong with your transaction.\nPlease check your payment details and try again.';

  const [btnPressed, setBtnPressed] = useState(false);

  const scaleAnim = useRef(new Animated.Value(0.72)).current;
  const fadeAnim  = useRef(new Animated.Value(0)).current;
  const shakeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    // Scale + fade entrance
    Animated.parallel([
      Animated.spring(scaleAnim, { toValue: 1, friction: 6, tension: 60, useNativeDriver: true }),
      Animated.timing(fadeAnim,  { toValue: 1, duration: 380, useNativeDriver: true }),
    ]).start();

    // Shake the icon once to signal error
    Animated.sequence([
      Animated.delay(350),
      Animated.timing(shakeAnim, { toValue:  8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 60, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -6, duration: 55, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  0, duration: 45, useNativeDriver: true }),
    ]).start();

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
  }, []);

  return (
    <View style={{ flex: 1, backgroundColor: C.bg }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }} edges={['top', 'bottom']}>
        <Animated.View style={{ width: '100%', alignItems: 'center', transform: [{ scale: scaleAnim }], opacity: fadeAnim }}>

          {/* ── Double-ring error icon ───────────────────────────────────── */}
          <Animated.View style={{
            width: 100, height: 100, borderRadius: 50,
            backgroundColor: C.errorOuter,
            alignItems: 'center', justifyContent: 'center',
            marginBottom: 36,
            transform: [{ translateX: shakeAnim }],
          }}>
            {/* inner solid red circle */}
            <View style={{
              width: 68, height: 68, borderRadius: 34,
              backgroundColor: C.errorInner,
              alignItems: 'center', justifyContent: 'center',
            }}>
              {/* Exclamation mark — two shapes: bar + dot */}
              <View style={{ alignItems: 'center', gap: 5 }}>
                <View style={{ width: 4, height: 18, borderRadius: 2, backgroundColor: '#FFFFFF' }} />
                <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#FFFFFF' }} />
              </View>
            </View>
          </Animated.View>

          {/* ── Title ────────────────────────────────────────────────────── */}
          <Text style={{
            fontSize: 28, fontFamily: F.extraBold, color: C.title,
            textAlign: 'center', marginBottom: 20, lineHeight: 36,
          }}>
            Payment Failed
          </Text>

          {/* ── Body message ─────────────────────────────────────────────── */}
          <Text style={{
            fontSize: 14, fontFamily: F.semiBold, color: C.body,
            textAlign: 'center', lineHeight: 22, marginBottom: 48,
            paddingHorizontal: 8,
          }}>
            {reason}
          </Text>

          {/* ── Back to Home button ───────────────────────────────────────── */}
          <Pressable
            onPress={() => router.replace('/(app)/payment' as any)}
            onPressIn={() => setBtnPressed(true)}
            onPressOut={() => setBtnPressed(false)}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              backgroundColor: btnPressed ? C.btnPress : C.btnGreen,
              borderRadius: 16,
              paddingVertical: 18,
              alignSelf: 'stretch',
            }}
          >
            <Home size={20} color="#FFFFFF" strokeWidth={2.2} />
            <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#FFFFFF', letterSpacing: 0.2 }}>
              Back to Home
            </Text>
          </Pressable>

        </Animated.View>
      </SafeAreaView>
    </View>
  );
}
