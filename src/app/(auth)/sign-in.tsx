import { useState, useRef, useEffect } from 'react';
import { ArrowLeft } from 'lucide-react-native';
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { supabase, fnClient } from '@/client/supabase';
import { getProfile, getSubscriptionInfo } from '@/db/api';
import { F } from '@/lib/fonts';

const LOGO_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260628/Homelogo.png';
const LOCK_ICON_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260612/password-protection.png';

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

// ── OTP 6-box input (full-width, square boxes matching screenshot) ────────────
function OtpBoxes({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  // Must use a single ref-array — calling useRef inside Array.from violates Rules of Hooks
  const inputRefs = useRef<(TextInput | null)[]>([null, null, null, null, null, null]);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  const handleChange = (idx: number, ch: string) => {
    const clean = ch.replace(/\D/g, '');
    if (!clean) {
      const next = [...digits]; next[idx] = '';
      onChange(next.join(''));
      if (idx > 0) inputRefs.current[idx - 1]?.focus();
      return;
    }
    const next = [...digits]; next[idx] = clean[clean.length - 1];
    onChange(next.join(''));
    if (idx < 5) inputRefs.current[idx + 1]?.focus();
    else inputRefs.current[idx]?.blur();
  };

  const handleKey = (idx: number, key: string) => {
    if (key === 'Backspace' && !digits[idx] && idx > 0) {
      const next = [...digits]; next[idx - 1] = '';
      onChange(next.join(''));
      inputRefs.current[idx - 1]?.focus();
    }
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4 }}>
      {digits.map((d, i) => (
        <TextInput
          key={i}
          ref={(r) => { inputRefs.current[i] = r; }}
          value={d}
          onChangeText={(ch) => handleChange(i, ch)}
          onKeyPress={({ nativeEvent }) => handleKey(i, nativeEvent.key)}
          keyboardType="number-pad" maxLength={1}
          style={{
            flex: 1, minWidth: 0, height: 52,
            borderRadius: 12, borderWidth: 1.5,
            borderColor: d ? '#0078ff' : '#c2c6d5',
            backgroundColor: d ? '#eef3fb' : '#f8f9fa',
            fontSize: 20, fontFamily: F.bold, color: '#171c20',
            textAlign: 'center',
          } as any}
        />
      ))}
    </View>
  );
}

// ── OTP 6-box input ───────────────────────────────────────────────────────────
function _OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hiddenRef = useRef<TextInput>(null);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  const handleHiddenChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 6);
    onChange(clean);
    if (clean.length === 6) hiddenRef.current?.blur();
  };

  return (
    <View style={{ flexDirection: 'row', justifyContent: 'center', gap: 10, marginVertical: 8 }}>
      {/* Hidden input captures SMS auto-fill (iOS oneTimeCode + Android sms-otp) */}
      <TextInput
        ref={hiddenRef}
        value={value}
        onChangeText={handleHiddenChange}
        keyboardType="number-pad"
        textContentType="oneTimeCode"
        autoComplete="sms-otp"
        autoFocus
        maxLength={6}
        style={{ position: 'absolute', opacity: 0, width: 1, height: 1 }}
      />
      {digits.map((d, i) => (
        <Pressable
          key={i}
          onPress={() => hiddenRef.current?.focus()}
          style={{
            flex: 1, aspectRatio: 1, borderRadius: 14, borderWidth: 2,
            borderColor: d ? '#0078ff' : (i === value.length ? '#0078ff' : '#DADCE0'),
            backgroundColor: d ? '#E8F0FE' : '#F8F9FA',
            alignItems: 'center', justifyContent: 'center',
            boxShadow: d ? [{ offsetX: 0, offsetY: 0, blurRadius: 0, spreadDistance: 3, color: 'rgba(0,120,255,0.12)' }] : [],
          } as any}
        >
          <Text style={{ fontSize: 22, fontFamily: F.bold, color: '#202124' }}>{d}</Text>
        </Pressable>
      ))}
    </View>
  );
}

// ── Decorative rings (purely visual) ─────────────────────────────────────────
function _HeroDecorations() {
  return (
    <>
      <View style={{ position: 'absolute', top: -40, right: -50, width: 180, height: 180, borderRadius: 90, borderWidth: 1, borderColor: 'rgba(255,255,255,0.18)' }} />
      <View style={{ position: 'absolute', top: -20, right: -30, width: 130, height: 130, borderRadius: 65, borderWidth: 1, borderColor: 'rgba(255,255,255,0.06)' }} />
      <View style={{ position: 'absolute', bottom: 10, left: -40, width: 120, height: 120, borderRadius: 60, borderWidth: 1, borderColor: 'rgba(255,255,255,0.2)' }} />
      <View style={{ position: 'absolute', top: 30, left: 24, width: 6, height: 6, borderRadius: 3, backgroundColor: 'rgba(255,255,255,0.15)' }} />
      <View style={{ position: 'absolute', bottom: 40, right: 36, width: 4, height: 4, borderRadius: 2, backgroundColor: 'rgba(0,120,255,0.4)' }} />
    </>
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
  const [resendTimer, setResendTimer] = useState(0);
  const [sendPressed, setSendPressed]   = useState(false);
  const [verifyPressed, setVerifyPressed] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

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
        // noAccount: true means user never signed up — show a clear message with Sign Up link
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

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    const digits = phone.replace(/\D/g, '');
    setError(''); setVerifying(true);
    try {
      const data = await callFn('verify-otp', { sessionId, otp, phone: digits, flow: 'login' });
      if (data.error) {
        setError(String(data.error));
      } else if (data.access_token) {
        const { error: sessionError, data: authData } = await supabase.auth.setSession({
          access_token:  String(data.access_token),
          refresh_token: String(data.refresh_token ?? ''),
        });
        if (sessionError) {
          setError(sessionError.message || 'Sign-in failed. Please try again.');
        } else {
          // Check subscription — expired trial users must pay before accessing app
          const uid = authData?.user?.id;
          if (uid) {
            const profile = await getProfile(uid);
            const info = getSubscriptionInfo(profile);
            if (info.status === 'expired') {
              // Session is set; gate to paywall — (app)/_layout.tsx will enforce on every nav
              router.replace('/(app)/payment' as any);
              return;
            }
          }
          router.replace('/');
        }
      } else {
        setError('Verification failed. Please try again.');
      }
    } catch {
      setError('Could not reach server. Check your internet and try again.');
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
          <ScrollView
            contentContainerStyle={{ flexGrow: 1 }}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            {/* ── Center wrapper ───────────────────────────────────── */}
            <View style={{ flex: 1, justifyContent: 'center', paddingVertical: 40 }}>

              {/* Logo + headline */}
              <View style={{ alignItems: 'center', marginBottom: 36 }}>
                <Image
                  source={{ uri: LOGO_URL }}
                  style={{
                    width: 112, height: 112, borderRadius: 26,
                    marginBottom: 24,
                    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 18, color: 'rgba(0,120,255,0.18)' }],
                  } as any}
                  contentFit="fill"
                  cachePolicy="memory-disk"
                />
                <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#171c20', letterSpacing: -0.3, textAlign: 'center', marginBottom: 6 }}>
                  Welcome
                </Text>
                <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#424753', textAlign: 'center', lineHeight: 19 }}>
                  Sign in with your mobile number.
                </Text>
              </View>

              {/* Form card */}
              <View style={{
                backgroundColor: '#ffffff',
                borderWidth: 1, borderColor: '#e0e4ec',
                boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.07)' }],
                padding: 20,
                marginBottom: 20,
              }}>
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#171c20', marginBottom: 10 }}>
                  Mobile Number
                </Text>

                {/* Phone input */}
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1,
                  borderColor: '#c2c6d5', height: 56, paddingHorizontal: 14,
                }}>
                  {/* Real India flag image */}
                  <Image
                    source={{ uri: 'https://flagcdn.com/w40/in.png' }}
                    style={{ width: 24, height: 16, borderRadius: 2, marginRight: 6 }}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                  />
                  <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#171c20', marginRight: 8 }}>+91</Text>
                  <View style={{ width: 1, height: 22, backgroundColor: '#c2c6d5', marginRight: 10 }} />
                  <TextInput
                    value={phone}
                    onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                    placeholder="Enter mobile number"
                    placeholderTextColor="#a0a8b4"
                    keyboardType="phone-pad"
                    maxLength={10}
                    returnKeyType="done"
                    onSubmitEditing={sendOtp}
                    style={{ flex: 1, fontSize: 15, fontFamily: F.semiBold, color: '#171c20', outlineWidth: 0 } as any}
                  />
                </View>

                {/* Error */}
                {error ? (
                  <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: 8 }}>{error}</Text>
                ) : null}

                {/* Send OTP */}
                <Pressable
                  onPress={sendOtp}
                  disabled={sending}
                  onPressIn={() => setSendPressed(true)}
                  onPressOut={() => setSendPressed(false)}
                  style={{
                    marginTop: 16, borderRadius: 10, height: 44,
                    alignItems: 'center', justifyContent: 'center',
                    backgroundColor: '#0078ff',
                    opacity: sendPressed || sending ? 0.88 : 1,
                  }}
                >
                  <Text style={{ color: '#ffffff', fontSize: 13, fontFamily: F.bold }}>
                    {sending ? 'Sending OTP…' : 'Send OTP'}
                  </Text>
                </Pressable>
              </View>

              {/* Sign Up footer */}
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#424753' }}>
                  Don't have an account?{' '}
                  <Text
                    onPress={() => router.push('/(auth)/sign-up')}
                    style={{ color: '#0058bd', fontFamily: F.bold }}
                  >
                    Sign Up
                  </Text>
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
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView
          contentContainerStyle={{ flexGrow: 1 }}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          <View style={{ flex: 1, paddingVertical: 40 }}>

            {/* Back button — matches About Us page style */}
            <Pressable
              onPress={() => { setStep('phone'); setOtp(''); setError(''); }}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 8, paddingHorizontal: 4 }}
            >
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                <ArrowLeft size={18} color="#374151" strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#374151' }}>Back</Text>
            </Pressable>

            {/* Same logo position as login — use lock icon for OTP page */}
            <View style={{ alignItems: 'center', marginBottom: 28, marginTop: 8 }}>
              <View style={{
                width: 96, height: 96, borderRadius: 22,
                backgroundColor: '#ffffff',
                boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.12)' }],
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Image source={{ uri: LOCK_ICON_URL }} style={{ width: 72, height: 72 }} contentFit="contain" cachePolicy="memory-disk" />
              </View>
            </View>

            {/* Title */}
            <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#171c20', textAlign: 'center', marginBottom: 10 }}>
              Verification
            </Text>

            {/* Subtitle with real phone */}
            <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#424753', textAlign: 'center', lineHeight: 20, marginBottom: 32 }}>
              Enter the 6-digit code sent to{'\n'}
              <Text style={{ color: '#171c20', fontFamily: F.extraBold }}>
                +91 {phone.slice(0, 5)} {phone.slice(5)}
              </Text>
            </Text>

            {/* OTP boxes — full width, square, evenly spaced */}
            <View style={{ paddingHorizontal: 16 }}>
              <OtpBoxes value={otp} onChange={setOtp} />
            </View>

            {/* Error + optional Sign Up link for incomplete-account errors */}
            {error ? (
              <View style={{ alignItems: 'center', marginTop: 12, paddingHorizontal: 16 }}>
                <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, textAlign: 'center' }}>{error}</Text>
                {error.toLowerCase().includes('sign up again') || error.toLowerCase().includes('incomplete') ? (
                  <Pressable onPress={() => router.push('/(auth)/sign-up')} style={{ marginTop: 8 }}>
                    <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff', textDecorationLine: 'underline' }}>
                      Go to Sign Up →
                    </Text>
                  </Pressable>
                ) : null}
              </View>
            ) : null}

            {/* Resend */}
            <View style={{ alignItems: 'center', marginTop: 36 }}>
              <Text style={{ fontSize: 13, color: '#727785', fontFamily: F.regular, marginBottom: 4 }}>
                Didn't receive the code?
              </Text>
              <Pressable onPress={resend} disabled={resendTimer > 0}>
                {resendTimer > 0 ? (
                  <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#727785' }}>Resend in {resendTimer}s</Text>
                ) : (
                  <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff' }}>Resend Code</Text>
                )}
              </Pressable>
            </View>

            {/* Verify — shown only when all 6 digits entered */}
            {otp.length === 6 && (
              <Pressable
                onPress={verifyOtp}
                disabled={verifying}
                onPressIn={() => setVerifyPressed(true)}
                onPressOut={() => setVerifyPressed(false)}
                style={{
                  marginTop: 24, marginHorizontal: 16, borderRadius: 10, height: 44,
                  alignItems: 'center', justifyContent: 'center',
                  backgroundColor: '#0078ff',
                  opacity: verifyPressed || verifying ? 0.88 : 1,
                }}
              >
                <Text style={{ color: '#ffffff', fontSize: 13, fontFamily: F.bold }}>
                  {verifying ? 'Verifying…' : 'Verify & Sign In'}
                </Text>
              </Pressable>
            )}

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}
