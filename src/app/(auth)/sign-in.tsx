import { useState, useRef, useEffect } from 'react';
import { ArrowLeft, CheckCircle2 } from 'lucide-react-native';
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import Animated, {
  useSharedValue, useAnimatedStyle,
  withSpring, withTiming, withSequence, withDelay,
  runOnJS,
} from 'react-native-reanimated';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase, fnClient } from '@/client/supabase';
import { getProfile, getSubscriptionInfo } from '@/db/api';
import { F } from '@/lib/fonts';
import { OtpInput } from '@/components/OtpInput';

/** Fire-and-forget warmup pings via fnClient so both functions are warm. */
function warmupFunctions() {
  fnClient.functions.invoke('send-otp', { method: 'GET' }).catch(() => {});
  fnClient.functions.invoke('verify-otp', { method: 'GET' }).catch(() => {});
}

/** Call a Supabase Edge Function via the dedicated functions client. */
async function callFn(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await fnClient.functions.invoke(name, { body });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

const LOGO_URL      = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260628/Homelogo.png';
const LOCK_ICON_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260612/password-protection.png';

// ── Success overlay (shown after successful verification) ─────────────────────
function SuccessOverlay({ visible }: { visible: boolean }) {
  const scale   = useSharedValue(0.4);
  const opacity = useSharedValue(0);
  const ring1   = useSharedValue(0.8);
  const ring2   = useSharedValue(0.8);

  useEffect(() => {
    if (visible) {
      opacity.value = withTiming(1, { duration: 200 });
      scale.value   = withSpring(1, { damping: 14, stiffness: 160 });
      ring1.value   = withDelay(150, withSpring(1.4, { damping: 10 }));
      ring2.value   = withDelay(250, withSpring(1.8, { damping: 10 }));
    }
  }, [visible, opacity, scale, ring1, ring2]);

  const iconStyle = useAnimatedStyle(() => ({
    opacity:   opacity.value,
    transform: [{ scale: scale.value }],
  }));
  const ring1Style = useAnimatedStyle(() => ({
    opacity:   withTiming(visible ? 0.15 : 0, { duration: 300 }),
    transform: [{ scale: ring1.value }],
  }));
  const ring2Style = useAnimatedStyle(() => ({
    opacity:   withTiming(visible ? 0.08 : 0, { duration: 400 }),
    transform: [{ scale: ring2.value }],
  }));
  const bgStyle = useAnimatedStyle(() => ({
    opacity: withTiming(visible ? 1 : 0, { duration: 250 }),
  }));

  if (!visible) return null;
  return (
    <Animated.View style={[bgStyle, {
      position: 'absolute', inset: 0,
      backgroundColor: '#ffffff',
      alignItems: 'center', justifyContent: 'center', zIndex: 99,
    }]}>
      {/* Pulsing rings */}
      <Animated.View style={[ring2Style, {
        position: 'absolute', width: 200, height: 200, borderRadius: 100,
        backgroundColor: '#0078ff',
      }]} />
      <Animated.View style={[ring1Style, {
        position: 'absolute', width: 160, height: 160, borderRadius: 80,
        backgroundColor: '#0078ff',
      }]} />
      {/* Icon circle */}
      <Animated.View style={[iconStyle, {
        width: 100, height: 100, borderRadius: 50,
        backgroundColor: '#0078ff',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,120,255,0.35)' }],
      } as any]}>
        <CheckCircle2 size={52} color="#ffffff" strokeWidth={2.5} />
      </Animated.View>
      <Animated.View style={[iconStyle, { marginTop: 28, alignItems: 'center', gap: 6 }]}>
        <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#111827', letterSpacing: -0.3 }}>
          Verified!
        </Text>
        <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#6b7280' }}>
          Signing you in…
        </Text>
      </Animated.View>
    </Animated.View>
  );
}

export default function SignIn() {
  const router = useRouter();
  const [step, setStep]               = useState<'phone' | 'otp'>('phone');
  const [phone, setPhone]             = useState('');
  const [sessionId, setSessionId]     = useState('');
  const [otp, setOtp]                 = useState('');
  const [error, setError]             = useState('');
  const [sending, setSending]         = useState(false);
  const [verifying, setVerifying]     = useState(false);
  const [showSuccess, setShowSuccess] = useState(false);
  const [resendTimer, setResendTimer] = useState(0);
  const [sendPressed, setSendPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Shake animation for error state
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));

  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }),
      withTiming(10,  { duration: 60 }),
      withTiming(-8,  { duration: 55 }),
      withTiming(8,   { duration: 55 }),
      withTiming(-4,  { duration: 50 }),
      withTiming(0,   { duration: 50 }),
    );
  };

  useEffect(() => { warmupFunctions(); }, []);

  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setInterval(() => setResendTimer((t) => t - 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resendTimer]);

  const sendOtp = async () => {
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    setError(''); setSending(true);
    try {
      const data = await callFn('send-otp', { phone: digits, flow: 'login' });
      if (data.error) {
        setError(String(data.error));
      } else if (data.sessionId) {
        setSessionId(String(data.sessionId));
        setStep('otp');
        setResendTimer(30);
      } else {
        setError('Could not send OTP. Please try again.');
      }
    } catch {
      setError('Could not reach server. Check your internet and try again.');
    } finally {
      setSending(false);
    }
  };

  const navigateAfterSuccess = (isExpired: boolean) => {
    if (isExpired) router.replace('/(app)/payment' as any);
    else router.replace('/');
  };

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    const digits = phone.replace(/\D/g, '');
    setError(''); setVerifying(true);
    try {
      const data = await callFn('verify-otp', { sessionId, otp, phone: digits, flow: 'login' });
      if (data.error) {
        setError(String(data.error));
        triggerShake();
      } else if (data.access_token) {
        const { error: sessionError, data: authData } = await supabase.auth.setSession({
          access_token:  String(data.access_token),
          refresh_token: String(data.refresh_token ?? ''),
        });
        if (sessionError) {
          setError(sessionError.message || 'Sign-in failed. Please try again.');
          triggerShake();
        } else {
          // Show success animation, then navigate
          let isExpired = false;
          const uid = authData?.user?.id;
          if (uid) {
            const profile = await getProfile(uid);
            const info = getSubscriptionInfo(profile);
            if (info.status === 'expired') isExpired = true;
          }
          setShowSuccess(true);
          setTimeout(() => runOnJS(navigateAfterSuccess)(isExpired), 1600);
        }
      } else {
        setError('Verification failed. Please try again.');
        triggerShake();
      }
    } catch {
      setError('Could not reach server. Check your internet and try again.');
      triggerShake();
    } finally {
      setVerifying(false);
    }
  };

  const resend = async () => {
    if (resendTimer > 0) return;
    setOtp(''); setError('');
    await sendOtp();
  };

  // ── Phone step ────────────────────────────────────────────────────────────
  if (step === 'phone') {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 40 }}>

              {/* Logo + headline */}
              <View style={{ alignItems: 'center', marginBottom: 36 }}>
                <Image
                  source={{ uri: LOGO_URL }}
                  style={{ width: 112, height: 112, borderRadius: 26, marginBottom: 24, boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 18, color: 'rgba(0,120,255,0.18)' }] } as any}
                  contentFit="fill" cachePolicy="memory-disk"
                />
                <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#171c20', letterSpacing: -0.3, textAlign: 'center', marginBottom: 6 }}>Welcome</Text>
                <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#424753', textAlign: 'center', lineHeight: 19 }}>Sign in with your mobile number.</Text>
              </View>

              {/* Form card */}
              <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e4ec', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.07)' }], padding: 20, marginBottom: 20 } as any}>
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#171c20', marginBottom: 10 }}>Mobile Number</Text>
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#c2c6d5', height: 56, paddingHorizontal: 14 }}>
                  <Image source={{ uri: 'https://flagcdn.com/w40/in.png' }} style={{ width: 24, height: 16, borderRadius: 2, marginRight: 6 }} contentFit="cover" cachePolicy="memory-disk" />
                  <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#171c20', marginRight: 8 }}>+91</Text>
                  <View style={{ width: 1, height: 22, backgroundColor: '#c2c6d5', marginRight: 10 }} />
                  <TextInput
                    value={phone}
                    onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                    placeholder="Enter mobile number" placeholderTextColor="#a0a8b4"
                    keyboardType="phone-pad" maxLength={10} returnKeyType="done" onSubmitEditing={sendOtp}
                    style={{ flex: 1, fontSize: 15, fontFamily: F.semiBold, color: '#171c20', outlineWidth: 0 } as any}
                  />
                </View>
                {error ? <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: 8 }}>{error}</Text> : null}
                <Pressable onPress={sendOtp} disabled={sending} onPressIn={() => setSendPressed(true)} onPressOut={() => setSendPressed(false)}
                  style={{ marginTop: 16, borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0078ff', opacity: sendPressed || sending ? 0.88 : 1 }}>
                  {sending
                    ? <ActivityIndicator color="#fff" />
                    : <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: F.bold }}>Send OTP</Text>}
                </Pressable>
              </View>

              {/* Sign Up footer */}
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#424753' }}>
                  Don't have an account?{' '}
                  <Text onPress={() => router.push('/(auth)/sign-up')} style={{ color: '#0058bd', fontFamily: F.bold }}>Sign Up</Text>
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── OTP step ──────────────────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar style="dark" />
      {/* Success overlay — sits above everything */}
      <SuccessOverlay visible={showSuccess} />

      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 40 }}>

            {/* Back button */}
            <Pressable onPress={() => { setStep('phone'); setOtp(''); setError(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 20 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeft size={18} color="#374151" strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 14, fontFamily: F.semiBold, color: '#374151' }}>Back</Text>
            </Pressable>

            {/* Lock icon */}
            <View style={{ alignItems: 'center', marginBottom: 24 }}>
              <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
                boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 20, color: 'rgba(0,120,255,0.14)' }] } as any}>
                <Image source={{ uri: LOCK_ICON_URL }} style={{ width: 60, height: 60 }} contentFit="contain" cachePolicy="memory-disk" />
              </View>
              <Text style={{ fontSize: 24, fontFamily: F.extraBold, color: '#111827', letterSpacing: -0.4, marginBottom: 8 }}>
                Verify Your Number
              </Text>
              <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#6b7280', textAlign: 'center', lineHeight: 21 }}>
                We sent a 6-digit code to{'\n'}
                <Text style={{ fontFamily: F.bold, color: '#111827' }}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
              </Text>
            </View>

            {/* OTP boxes with shake on error */}
            <Animated.View style={[shakeStyle, { marginBottom: 8 }]}>
              <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(''); }} hasError={!!error} />
            </Animated.View>

            {/* Error message */}
            {error ? (
              <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 4 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Text style={{ color: '#dc2626', fontSize: 13, fontFamily: F.medium, textAlign: 'center', flex: 1 }}>{error}</Text>
                </View>
                {(error.toLowerCase().includes('sign up again') || error.toLowerCase().includes('incomplete')) ? (
                  <Pressable onPress={() => router.push('/(auth)/sign-up')} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff', textDecorationLine: 'underline' }}>Go to Sign Up →</Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Verify button — always visible, disabled until 6 digits */}
            <Pressable
              onPress={verifyOtp}
              disabled={otp.length !== 6 || verifying}
              style={{
                marginTop: 28, borderRadius: 14, height: 52,
                alignItems: 'center', justifyContent: 'center',
                backgroundColor: otp.length === 6 ? '#0078ff' : '#e5e7eb',
              }}
            >
              {verifying
                ? <ActivityIndicator color={otp.length === 6 ? '#fff' : '#9ca3af'} />
                : <Text style={{ fontSize: 15, fontFamily: F.bold, color: otp.length === 6 ? '#ffffff' : '#9ca3af' }}>
                    Verify & Sign In
                  </Text>
              }
            </Pressable>

            {/* Resend section */}
            <View style={{ alignItems: 'center', marginTop: 32, gap: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#9ca3af' }}>
                Didn't receive the code?
              </Text>
              {resendTimer > 0 ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                  {/* Countdown pill */}
                  <View style={{ backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }}>
                    <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#374151' }}>
                      Resend in {resendTimer}s
                    </Text>
                  </View>
                </View>
              ) : (
                <Pressable onPress={resend} active:opacity-70 style={{ opacity: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#0078ff' }}>Resend Code</Text>
                </Pressable>
              )}
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
