import { useState, useRef, useEffect } from 'react';
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
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft, CheckCircle2 } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fnClient } from '@/client/supabase';
import { INDIA_CITIES } from '@/types/types';
import { F } from '@/lib/fonts';
import { NEW_USER_KEY } from '@/app/_layout';
import { OtpInput } from '@/components/OtpInput';

const LOGO_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260628/Homelogo.png';
const LOCK_ICON_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260612/password-protection.png';

/** Set before setSession so root layout knows to route to premium-onboarding */
const NEW_USER_KEY_LOCAL = 'advocal_new_user_pending'; // kept for legacy; use imported NEW_USER_KEY

// ── Success overlay ───────────────────────────────────────────────────────────
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
      <Animated.View style={[ring2Style, { position: 'absolute', width: 200, height: 200, borderRadius: 100, backgroundColor: '#0078ff' }]} />
      <Animated.View style={[ring1Style, { position: 'absolute', width: 160, height: 160, borderRadius: 80, backgroundColor: '#0078ff' }]} />
      <Animated.View style={[iconStyle, {
        width: 100, height: 100, borderRadius: 50, backgroundColor: '#0078ff',
        alignItems: 'center', justifyContent: 'center',
        boxShadow: [{ offsetX: 0, offsetY: 8, blurRadius: 32, color: 'rgba(0,120,255,0.35)' }],
      } as any]}>
        <CheckCircle2 size={52} color="#ffffff" strokeWidth={2.5} />
      </Animated.View>
      <Animated.View style={[iconStyle, { marginTop: 28, alignItems: 'center', gap: 6 }]}>
        <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#111827', letterSpacing: -0.3 }}>Verified!</Text>
        <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#6b7280' }}>Setting up your account…</Text>
      </Animated.View>
    </Animated.View>
  );
}
async function callFn(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await fnClient.functions.invoke(name, { body });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

export default function SignUp() {
  const router = useRouter();
  const [step, setStep] = useState<'phone' | 'otp' | 'profile'>('phone');

  // Step 1 — phone + name
  const [name, setName]   = useState('');
  const [phone, setPhone] = useState('');

  // Step 2 — OTP
  const [sessionId, setSessionId]     = useState('');
  const [otp, setOtp]                 = useState('');
  const [resendTimer, setResendTimer] = useState(0);
  const [showSuccess, setShowSuccess] = useState(false);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Pending session tokens (held until profile step completes)
  const [pendingAccess,  setPendingAccess]  = useState('');
  const [pendingRefresh, setPendingRefresh] = useState('');
  const [pendingUserId,  setPendingUserId]  = useState('');

  // Step 3 — profile details
  const [company,   setCompany]   = useState('');
  const [barId,     setBarId]     = useState('');
  const [city,      setCity]      = useState('');
  const [address,   setAddress]   = useState('');
  const [dob,       setDob]       = useState('');
  const [showCity,  setShowCity]  = useState(false);
  const [cityQuery, setCityQuery] = useState('');

  // Shared
  const [error,     setError]     = useState('');
  const [sending,   setSending]   = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [sendOtpPressed, setSendOtpPressed] = useState(false);
  const [finishPressed,  setFinishPressed]  = useState(false);

  // Shake animation for OTP error
  const shakeX = useSharedValue(0);
  const shakeStyle = useAnimatedStyle(() => ({ transform: [{ translateX: shakeX.value }] }));
  const triggerShake = () => {
    shakeX.value = withSequence(
      withTiming(-10, { duration: 60 }), withTiming(10, { duration: 60 }),
      withTiming(-8,  { duration: 55 }),  withTiming(8,  { duration: 55 }),
      withTiming(-4,  { duration: 50 }),  withTiming(0,  { duration: 50 }),
    );
  };

  useEffect(() => {
    if (resendTimer > 0) {
      timerRef.current = setInterval(() => setResendTimer((t) => t - 1), 1000);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [resendTimer]);

  const sendOtp = async () => {
    if (!name.trim()) { setError('Please enter your full name.'); return; }
    const digits = phone.replace(/\D/g, '');
    if (digits.length !== 10) { setError('Enter a valid 10-digit mobile number.'); return; }
    setError(''); setSending(true);
    try {
      const data = await callFn('send-otp', { phone: digits, flow: 'signup' });
      if (data.error) { setError(String(data.error)); }
      else if (data.sessionId) { setSessionId(String(data.sessionId)); setStep('otp'); setResendTimer(30); }
      else { setError('Unexpected response. Please try again.'); }
    } catch { setError('Could not reach server. Check your internet and try again.'); }
    finally { setSending(false); }
  };

  const goToProfile = () => setStep('profile');

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    const digits = phone.replace(/\D/g, '');
    setError(''); setVerifying(true);
    try {
      const data = await callFn('verify-otp', {
        sessionId, otp, phone: digits, flow: 'signup',
        profileData: { full_name: name.trim() },
      });
      if (data.error) { setError(String(data.error)); triggerShake(); }
      else if (data.access_token) {
        setPendingAccess(String(data.access_token));
        setPendingRefresh(String(data.refresh_token ?? ''));
        if (data.user && typeof data.user === 'object' && 'id' in data.user) {
          setPendingUserId(String((data.user as { id: string }).id));
        }
        // Show success animation, then go to profile step
        setShowSuccess(true);
        setTimeout(() => runOnJS(goToProfile)(), 1600);
      } else { setError('Verification failed. Please try again.'); triggerShake(); }
    } catch { setError('Could not reach server. Check your internet and try again.'); triggerShake(); }
    finally { setVerifying(false); }
  };

  // Per-field validation errors
  const [nameErr,    setNameErr]    = useState('');
  const [addressErr, setAddressErr] = useState('');
  const [dobErr,     setDobErr]     = useState('');
  const [cityErr,    setCityErr]    = useState('');

  const finishProfile = async () => {
    let valid = true;
    if (!name.trim())    { setNameErr('Full name is required.');  valid = false; } else { setNameErr(''); }
    if (!address.trim()) { setAddressErr('Address is required.'); valid = false; } else { setAddressErr(''); }
    if (!city)           { setCityErr('City is required.');       valid = false; } else { setCityErr(''); }
    const dobTrimmed = dob.trim();
    const dobIso = (() => {
      const dmyMatch = dobTrimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`;
      const isoMatch = dobTrimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) return dobTrimmed;
      return null;
    })();
    if (!dobTrimmed)  { setDobErr('Date of birth is required.'); valid = false; }
    else if (!dobIso) { setDobErr('Enter date as DD/MM/YYYY.');  valid = false; }
    else              { setDobErr(''); }
    if (!valid) return;

    setSaving(true); setError('');
    try {
      await AsyncStorage.setItem('advocal_pending_profile_data', JSON.stringify({
        full_name: name.trim() || null, company_name: company.trim() || null,
        bar_registration_number: barId.trim() || null, city: city || null,
        address: address.trim() || null, date_of_birth: dobIso || null,
        userId: pendingUserId,
      }));
      await AsyncStorage.setItem(NEW_USER_KEY, 'true');
      await supabase.auth.setSession({ access_token: pendingAccess, refresh_token: pendingRefresh });
    } catch { setError('Could not save profile. Please try again.'); setSaving(false); }
  };

  const handleDobChange = (raw: string) => {
    const stripped = raw.replace(/[^\d/]/g, '');
    const digits   = stripped.replace(/\//g, '');
    let formatted  = digits;
    if (digits.length > 2) formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4) formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
    setDob(formatted); setDobErr('');
  };

  const resend = async () => {
    if (resendTimer > 0) return;
    setOtp(''); setError('');
    await sendOtp();
  };

  const filteredCities = INDIA_CITIES.filter((c) => c.toLowerCase().includes(cityQuery.toLowerCase()));

  // ── Step 1: Phone + Name ──────────────────────────────────────────────────
  if (step === 'phone') {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}>
              <View style={{ alignItems: 'center', marginBottom: 36 }}>
                <Image source={{ uri: LOGO_URL }}
                  style={{ width: 112, height: 112, borderRadius: 26, marginBottom: 24, boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 18, color: 'rgba(0,120,255,0.18)' }] } as any}
                  contentFit="fill" cachePolicy="memory-disk" />
                <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#171c20', letterSpacing: -0.3, textAlign: 'center', marginBottom: 6 }}>Create Account</Text>
                <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#424753', textAlign: 'center', lineHeight: 19 }}>Sign up with your mobile number.</Text>
              </View>
              <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e4ec', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.07)' }], padding: 20, borderRadius: 16, marginBottom: 20 } as any}>
                <FieldLabel label="Full Name" />
                <FieldInput value={name} onChangeText={(v) => { setName(v); setError(''); }} placeholder="Enter your full name" autoCapitalize="words" returnKeyType="next" />
                <FieldLabel label="Mobile Number" />
                <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#ffffff', borderRadius: 12, borderWidth: 1, borderColor: '#c2c6d5', height: 56, paddingHorizontal: 14 }}>
                  <Image source={{ uri: 'https://flagcdn.com/w40/in.png' }} style={{ width: 24, height: 16, borderRadius: 2, marginRight: 6 }} contentFit="cover" cachePolicy="memory-disk" />
                  <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#171c20', marginRight: 8 }}>+91</Text>
                  <View style={{ width: 1, height: 22, backgroundColor: '#c2c6d5', marginRight: 10 }} />
                  <TextInput value={phone} onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                    placeholder="Enter mobile number" placeholderTextColor="#a0a8b4"
                    keyboardType="phone-pad" maxLength={10} returnKeyType="done" onSubmitEditing={sendOtp}
                    style={{ flex: 1, fontSize: 15, fontFamily: F.semiBold, color: '#171c20', outlineWidth: 0 } as any} />
                </View>
                {!!error && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: 8 }}>{error}</Text>}
                <Pressable onPress={sendOtp} disabled={sending}
                  onPressIn={() => setSendOtpPressed(true)} onPressOut={() => setSendOtpPressed(false)}
                  style={{ marginTop: 16, borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0078ff', opacity: sendOtpPressed || sending ? 0.88 : 1 }}>
                  {sending ? <ActivityIndicator color="#fff" /> : <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: F.bold }}>Send OTP</Text>}
                </Pressable>
              </View>
              <View style={{ alignItems: 'center' }}>
                <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#424753' }}>
                  Already have an account?{' '}
                  <Text onPress={() => router.replace('/(auth)/sign-in')} style={{ color: '#0058bd', fontFamily: F.bold }}>Sign In</Text>
                </Text>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </View>
    );
  }

  // ── Step 2: OTP Verification ──────────────────────────────────────────────
  if (step === 'otp') {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <StatusBar style="dark" />
        {/* Success overlay */}
        <SuccessOverlay visible={showSuccess} />

        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
              <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 32 }}>

                {/* Back */}
                <Pressable onPress={() => { setStep('phone'); setOtp(''); setError(''); }}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', marginBottom: 28 }}>
                  <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#f3f4f6', alignItems: 'center', justifyContent: 'center' }}>
                    <ChevronLeft size={18} color="#374151" strokeWidth={2} />
                  </View>
                  <Text style={{ fontSize: 14, fontFamily: F.semiBold, color: '#374151' }}>Back</Text>
                </Pressable>

                {/* Icon + title */}
                <View style={{ alignItems: 'center', marginBottom: 32 }}>
                  <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: '#eff6ff', alignItems: 'center', justifyContent: 'center', marginBottom: 20,
                    boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 20, color: 'rgba(0,120,255,0.14)' }] } as any}>
                    <Image source={{ uri: LOCK_ICON_URL }} style={{ width: 60, height: 60 }} contentFit="contain" cachePolicy="memory-disk" />
                  </View>
                  <Text style={{ fontSize: 24, fontFamily: F.extraBold, color: '#111827', letterSpacing: -0.4, marginBottom: 8 }}>Verify Your Number</Text>
                  <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#6b7280', textAlign: 'center', lineHeight: 21 }}>
                    We sent a 6-digit code to{'\n'}
                    <Text style={{ fontFamily: F.bold, color: '#111827' }}>+91 {phone.slice(0, 5)} {phone.slice(5)}</Text>
                  </Text>
                </View>

                {/* OTP boxes with shake */}
                <Animated.View style={[shakeStyle, { marginBottom: 8 }]}>
                  <OtpInput value={otp} onChange={(v) => { setOtp(v); setError(''); }} hasError={!!error} />
                </Animated.View>

                {/* Error */}
                {!!error && (
                  <View style={{ alignItems: 'center', marginTop: 10, marginBottom: 4 }}>
                    <View style={{ flexDirection: 'row', backgroundColor: '#fef2f2', borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8 }}>
                      <Text style={{ color: '#dc2626', fontSize: 13, fontFamily: F.medium, textAlign: 'center' }}>{error}</Text>
                    </View>
                  </View>
                )}

                {/* Verify button */}
                <Pressable onPress={verifyOtp} disabled={otp.length !== 6 || verifying}
                  style={{ marginTop: 28, borderRadius: 14, height: 52, alignItems: 'center', justifyContent: 'center', backgroundColor: otp.length === 6 ? '#0078ff' : '#e5e7eb' }}>
                  {verifying
                    ? <ActivityIndicator color={otp.length === 6 ? '#fff' : '#9ca3af'} />
                    : <Text style={{ fontSize: 15, fontFamily: F.bold, color: otp.length === 6 ? '#ffffff' : '#9ca3af' }}>Verify & Continue</Text>}
                </Pressable>

                {/* Resend */}
                <View style={{ alignItems: 'center', marginTop: 32, gap: 8 }}>
                  <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#9ca3af' }}>Didn't receive the code?</Text>
                  {resendTimer > 0 ? (
                    <View style={{ backgroundColor: '#f3f4f6', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }}>
                      <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#374151' }}>Resend in {resendTimer}s</Text>
                    </View>
                  ) : (
                    <Pressable onPress={resend} style={{ opacity: 1 }}>
                      <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#0078ff' }}>Resend Code</Text>
                    </Pressable>
                  )}
                </View>

              </View>
            </ScrollView>
          </KeyboardAvoidingView>
        </SafeAreaView>
      </View>
    );
  }

  // ── Step 3: Profile Setup ─────────────────────────────────────────────────
  return (
    <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
      <StatusBar style="dark" />
      <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          <View style={{ flex: 1, paddingHorizontal: 24, paddingVertical: 40 }}>

            <View style={{ alignItems: 'center', marginBottom: 32 }}>
              <Image
                source={{ uri: LOGO_URL }}
                style={{
                  width: 112, height: 112, borderRadius: 26,
                  marginBottom: 16,
                  boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 18, color: 'rgba(0,120,255,0.18)' }],
                } as any}
                contentFit="fill"
                cachePolicy="memory-disk"
              />
              <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#171c20', textAlign: 'center', marginBottom: 6 }}>Complete Your Profile</Text>
              <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#424753', textAlign: 'center', lineHeight: 19 }}>
                Add your professional details to get started.
              </Text>
            </View>

            <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e4ec', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.07)' }], padding: 20, borderRadius: 16, marginBottom: 20 } as any}>

              {/* Full name (pre-filled, editable) */}
              <FieldLabel label="Full Name" />
              <FieldInput
                value={name}
                onChangeText={(v) => { setName(v); setNameErr(''); }}
                placeholder="Your full name"
                autoCapitalize="words"
              />
              {!!nameErr && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: -10, marginBottom: 12 }}>{nameErr}</Text>}

              {/* Address — required */}
              <FieldLabel label="Address" />
              <FieldInput
                value={address}
                onChangeText={(v) => { setAddress(v); setAddressErr(''); }}
                placeholder="e.g. 12, Law Street, Mumbai"
                autoCapitalize="words"
              />
              {!!addressErr && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: -10, marginBottom: 12 }}>{addressErr}</Text>}

              {/* Date of Birth — required, auto-slash */}
              <FieldLabel label="Date of Birth" />
              <TextInput
                value={dob}
                onChangeText={handleDobChange}
                placeholder="DD/MM/YYYY"
                placeholderTextColor="#a0a8b4"
                keyboardType="number-pad"
                maxLength={10}
                style={{
                  fontSize: 15, fontFamily: F.semiBold, color: '#171c20',
                  borderWidth: 1, borderColor: dobErr ? '#ba1a1a' : '#c2c6d5', borderRadius: 12,
                  paddingHorizontal: 14, paddingVertical: 14,
                  marginBottom: dobErr ? 4 : 16, backgroundColor: '#f8f9fa', outlineWidth: 0,
                } as any}
              />
              {!!dobErr && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginBottom: 12 }}>{dobErr}</Text>}

              {/* Company / Chamber */}
              <FieldLabel label="Company / Chamber Name" optional />
              <FieldInput value={company} onChangeText={setCompany} placeholder="e.g. ABC Law Chambers" autoCapitalize="words" />

              {/* Bar Registration */}
              <FieldLabel label="Bar Registration Number" optional />
              <FieldInput value={barId} onChangeText={setBarId} placeholder="e.g. MH/12345/2020" autoCapitalize="characters" />

              {/* City picker */}
              <FieldLabel label="City" />
              <Pressable
                onPress={() => { setShowCity(true); setCityQuery(''); setCityErr(''); }}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
                  borderWidth: 1, borderColor: cityErr ? '#ba1a1a' : city ? '#0078ff' : '#c2c6d5', borderRadius: 12,
                  height: 56, paddingHorizontal: 14, marginBottom: cityErr ? 4 : 16, backgroundColor: '#f8f9fa',
                }}
              >
                <Text style={{ fontSize: 15, fontFamily: city ? F.semiBold : F.regular, color: city ? '#171c20' : '#a0a8b4' }}>
                  {city || 'Select your city'}
                </Text>
                <ChevronDown size={16} color="#9CA3AF" strokeWidth={2} />
              </Pressable>
              {!!cityErr && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: 0, marginBottom: 12 }}>{cityErr}</Text>}

              {/* City dropdown inline */}
              {showCity && (
                <View style={{ borderWidth: 1, borderColor: '#e0e4ec', borderRadius: 12, marginBottom: 16, maxHeight: 240, overflow: 'hidden' }}>
                  <View style={{ paddingHorizontal: 12, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f0f0' }}>
                    <TextInput
                      value={cityQuery} onChangeText={setCityQuery}
                      placeholder="Search city…" placeholderTextColor="#a0a8b4" autoFocus
                      style={{ fontSize: 14, fontFamily: F.regular, color: '#171c20', height: 36, outlineWidth: 0 } as any}
                    />
                  </View>
                  <ScrollView style={{ maxHeight: 180 }} keyboardShouldPersistTaps="always">
                    {filteredCities.slice(0, 30).map((c) => (
                      <Pressable key={c} onPress={() => { setCity(c); setShowCity(false); }}
                        style={{ paddingVertical: 11, paddingHorizontal: 14, borderBottomWidth: 1, borderBottomColor: '#f8f8f8' }}>
                        <Text style={{ fontSize: 14, fontFamily: c === city ? F.bold : F.regular, color: c === city ? '#0078ff' : '#171c20' }}>{c}</Text>
                      </Pressable>
                    ))}
                  </ScrollView>
                </View>
              )}

              {!!error && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginBottom: 8 }}>{error}</Text>}

              <Pressable onPress={finishProfile} disabled={saving}
                onPressIn={() => setFinishPressed(true)} onPressOut={() => setFinishPressed(false)}
                style={{ borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0078ff', opacity: finishPressed || saving ? 0.88 : 1 }}>
                {saving
                  ? <ActivityIndicator color="#fff" />
                  : <Text style={{ color: '#ffffff', fontSize: 14, fontFamily: F.bold }}>Continue →</Text>
                }
              </Pressable>
            </View>

          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function FieldLabel({ label, optional }: { label: string; optional?: boolean }) {
  return (
    <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#171c20', marginBottom: 8 }}>
      {label}{optional ? <Text style={{ fontFamily: F.regular, color: '#9CA3AF' }}> (optional)</Text> : null}
    </Text>
  );
}

function FieldInput({
  value, onChangeText, placeholder, autoCapitalize, returnKeyType, multiline,
}: {
  value: string; onChangeText: (v: string) => void; placeholder: string;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  returnKeyType?: 'done' | 'next';
  multiline?: boolean;
}) {
  return (
    <TextInput
      value={value} onChangeText={onChangeText}
      placeholder={placeholder} placeholderTextColor="#a0a8b4"
      autoCapitalize={autoCapitalize} returnKeyType={returnKeyType}
      multiline={multiline} numberOfLines={multiline ? 3 : 1}
      style={{
        fontSize: 15, fontFamily: F.semiBold, color: '#171c20',
        borderWidth: 1, borderColor: '#c2c6d5', borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: 14,
        marginBottom: 16, backgroundColor: '#f8f9fa',
        outlineWidth: 0, textAlignVertical: multiline ? 'top' : 'center',
      } as any}
    />
  );
}

