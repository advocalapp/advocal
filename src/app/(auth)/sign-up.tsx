import { useState, useRef, useEffect } from 'react';
import {
  View, Text, TextInput, Pressable, ScrollView,
  KeyboardAvoidingView, ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { StatusBar } from 'expo-status-bar';
import { useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { ChevronDown, ChevronLeft } from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase, fnClient } from '@/client/supabase';
import { INDIA_CITIES } from '@/types/types';
import { F } from '@/lib/fonts';
import { NEW_USER_KEY } from '@/app/_layout';

const LOGO_URL = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260628/Homelogo.png';

/** Set before setSession so root layout knows to route to premium-onboarding */
const NEW_USER_KEY_LOCAL = 'advocal_new_user_pending'; // kept for legacy; use imported NEW_USER_KEY

/** Call a Supabase Edge Function via the dedicated functions client. */
async function callFn(name: string, body: Record<string, unknown>): Promise<Record<string, unknown>> {
  const { data, error } = await fnClient.functions.invoke(name, { body });
  if (error) throw error;
  return (data ?? {}) as Record<string, unknown>;
}

function OtpInput({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  const hiddenRef = useRef<TextInput>(null);
  const digits = value.split('').concat(Array(6).fill('')).slice(0, 6);

  const handleHiddenChange = (text: string) => {
    const clean = text.replace(/\D/g, '').slice(0, 6);
    onChange(clean);
    if (clean.length === 6) hiddenRef.current?.blur();
  };

  return (
    <View style={{ flexDirection: 'row', gap: 8, paddingHorizontal: 4, marginVertical: 8 }}>
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
      {/* Visual digit boxes — tap any to focus hidden input */}
      {digits.map((d, i) => (
        <Pressable
          key={i}
          onPress={() => hiddenRef.current?.focus()}
          style={{
            flex: 1, minWidth: 0, height: 52,
            borderRadius: 12, borderWidth: 1.5,
            borderColor: d ? '#0078ff' : (i === value.length ? '#0078ff' : '#c2c6d5'),
            backgroundColor: d ? '#eef3fb' : '#f8f9fa',
            alignItems: 'center', justifyContent: 'center',
          }}
        >
          <Text style={{ fontSize: 20, fontFamily: F.bold, color: '#171c20' }}>{d}</Text>
        </Pressable>
      ))}
    </View>
  );
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
  const [error,    setError]    = useState('');
  const [sending,  setSending]  = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [sendOtpPressed,   setSendOtpPressed]   = useState(false);
  const [verifyOtpPressed, setVerifyOtpPressed] = useState(false);
  const [finishPressed,    setFinishPressed]    = useState(false);
  const [backOtpPressed,   setBackOtpPressed]   = useState(false);

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

  const verifyOtp = async () => {
    if (otp.length !== 6) return;
    const digits = phone.replace(/\D/g, '');
    setError(''); setVerifying(true);
    try {
      const data = await callFn('verify-otp', {
        sessionId, otp, phone: digits, flow: 'signup',
        profileData: { full_name: name.trim() },
      });
      if (data.error) { setError(String(data.error)); }
      else if (data.access_token) {
        // Store tokens — DON'T set session yet (would trigger root layout redirect)
        // Profile setup step first, then authenticate
        setPendingAccess(String(data.access_token));
        setPendingRefresh(String(data.refresh_token ?? ''));
        if (data.user && typeof data.user === 'object' && 'id' in data.user) {
          setPendingUserId(String((data.user as { id: string }).id));
        }
        setStep('profile');
      } else { setError('Verification failed. Please try again.'); }
    } catch { setError('Could not reach server. Check your internet and try again.'); }
    finally { setVerifying(false); }
  };

  // Per-field validation errors
  const [nameErr,    setNameErr]    = useState('');
  const [addressErr, setAddressErr] = useState('');
  const [dobErr,     setDobErr]     = useState('');
  const [cityErr,    setCityErr]    = useState('');

  const finishProfile = async () => {
    // Per-field validation
    let valid = true;
    if (!name.trim())    { setNameErr('Full name is required.');         valid = false; } else { setNameErr(''); }
    if (!address.trim()) { setAddressErr('Address is required.');        valid = false; } else { setAddressErr(''); }
    if (!city)           { setCityErr('City is required.');              valid = false; } else { setCityErr(''); }
    const dobTrimmed = dob.trim();    const dobIso = (() => {
      const dmyMatch = dobTrimmed.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
      if (dmyMatch) return `${dmyMatch[3]}-${dmyMatch[2].padStart(2,'0')}-${dmyMatch[1].padStart(2,'0')}`;
      const isoMatch = dobTrimmed.match(/^(\d{4})-(\d{2})-(\d{2})$/);
      if (isoMatch) return dobTrimmed;
      return null;
    })();
    if (!dobTrimmed)  { setDobErr('Date of birth is required.');         valid = false; }
    else if (!dobIso) { setDobErr('Enter date as DD/MM/YYYY.');          valid = false; }
    else              { setDobErr(''); }
    if (!valid) return;

    setSaving(true);
    setError('');
    try {
      // Store profile data so premium-onboarding can save it on "Start Free Trial"
      await AsyncStorage.setItem('advocal_pending_profile_data', JSON.stringify({
        full_name:               name.trim() || null,
        company_name:            company.trim() || null,
        bar_registration_number: barId.trim() || null,
        city:                    city || null,
        address:                 address.trim() || null,
        date_of_birth:           dobIso || null,
        userId:                  pendingUserId,
      }));

      // Mark as new user BEFORE setting session (root layout reads this)
      await AsyncStorage.setItem(NEW_USER_KEY, 'true');

      // Authenticate — triggers ctx onAuthStateChange → root layout → premium-onboarding
      // Profile is NOT saved yet; it will be saved when user taps "Start Free Trial"
      await supabase.auth.setSession({
        access_token: pendingAccess,
        refresh_token: pendingRefresh,
      });
      // Root layout will see NEW_USER_KEY and navigate to premium-onboarding
    } catch { setError('Could not save profile. Please try again.'); setSaving(false); }
    // No finally navigation — root layout handles it
  };

  /** Auto-insert slashes as user types DD/MM/YYYY */
  const handleDobChange = (raw: string) => {
    // Strip anything that isn't a digit or slash
    const stripped = raw.replace(/[^\d/]/g, '');
    // Remove all slashes then re-insert at correct positions
    const digits = stripped.replace(/\//g, '');
    let formatted = digits;
    if (digits.length > 2)  formatted = digits.slice(0, 2) + '/' + digits.slice(2);
    if (digits.length > 4)  formatted = digits.slice(0, 2) + '/' + digits.slice(2, 4) + '/' + digits.slice(4, 8);
    setDob(formatted);
    setDobErr('');
  };

  const resend = async () => {
    if (resendTimer > 0) return;
    setOtp(''); setError('');
    await sendOtp();
  };

  // ── City picker ─────────────────────────────────────────────────────────────
  const filteredCities = INDIA_CITIES.filter((c) =>
    c.toLowerCase().includes(cityQuery.toLowerCase())
  );

  // ── Step 1: Phone + Name ─────────────────────────────────────────────────
  if (step === 'phone') {
    return (
      <View style={{ flex: 1, backgroundColor: '#ffffff' }}>
        <StatusBar style="dark" />
        <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 40 }}>

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
                  <TextInput
                    value={phone}
                    onChangeText={(v) => { setPhone(v.replace(/\D/g, '').slice(0, 10)); setError(''); }}
                    placeholder="Enter mobile number" placeholderTextColor="#a0a8b4"
                    keyboardType="phone-pad" maxLength={10} returnKeyType="done" onSubmitEditing={sendOtp}
                    style={{ flex: 1, fontSize: 15, fontFamily: F.semiBold, color: '#171c20', outlineWidth: 0 } as any}
                  />
                </View>

                {!!error && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: 8 }}>{error}</Text>}

                <Pressable onPress={sendOtp} disabled={sending} 
                  onPressIn={() => setSendOtpPressed(true)} onPressOut={() => setSendOtpPressed(false)}
                  style={{ marginTop: 16, borderRadius: 10, height: 44, alignItems: 'center', justifyContent: 'center', backgroundColor: '#0078ff', opacity: sendOtpPressed || sending ? 0.88 : 1 }}>
                  <Text style={{ color: '#ffffff', fontSize: 13, fontFamily: F.bold }}>{sending ? 'Sending OTP…' : 'Send OTP'}</Text>
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
        <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>
          {/* Back button header */}
          <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
            <Pressable
              onPress={() => { setStep('phone'); setOtp(''); setError(''); }}
              onPressIn={() => setBackOtpPressed(true)}
              onPressOut={() => setBackOtpPressed(false)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 6,
                alignSelf: 'flex-start',
                backgroundColor: backOtpPressed ? '#0060cc' : '#0078ff',
                borderRadius: 10, paddingHorizontal: 14, paddingVertical: 9,
              }}
            >
              <ChevronLeft size={16} color="#ffffff" strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#ffffff', letterSpacing: 0.2 }}>Back</Text>
            </Pressable>
          </View>

          <KeyboardAvoidingView behavior={process.env.EXPO_OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
            <ScrollView
              contentContainerStyle={{ flexGrow: 1 }}
              keyboardShouldPersistTaps="handled"
              showsVerticalScrollIndicator={false}
            >
              <View style={{ flex: 1, justifyContent: 'center', paddingHorizontal: 24, paddingVertical: 24 }}>

                <View style={{ alignItems: 'center', marginBottom: 28 }}>
                  <View style={{ width: 88, height: 88, borderRadius: 22, backgroundColor: '#ffffff', boxShadow: [{ offsetX: 0, offsetY: 4, blurRadius: 16, color: 'rgba(0,0,0,0.12)' }], alignItems: 'center', justifyContent: 'center', marginBottom: 14 } as any}>
                    <Image source={{ uri: 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260612/password-protection.png' }} style={{ width: 64, height: 64 }} contentFit="contain" cachePolicy="memory-disk" />
                  </View>
                  <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#171c20', textAlign: 'center', marginBottom: 8 }}>Verify OTP</Text>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: '#eef3fb', borderRadius: 20, paddingHorizontal: 14, paddingVertical: 6 }}>
                    <Image source={{ uri: 'https://flagcdn.com/w40/in.png' }} style={{ width: 18, height: 12, borderRadius: 2 }} contentFit="cover" cachePolicy="memory-disk" />
                    <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff' }}>+91 {phone}</Text>
                  </View>
                </View>

                <View style={{ backgroundColor: '#ffffff', borderWidth: 1, borderColor: '#e0e4ec', boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 12, color: 'rgba(0,0,0,0.07)' }], padding: 20, borderRadius: 16, marginBottom: 16 } as any}>
                  <Text style={{ fontSize: 14, fontFamily: F.regular, color: '#424753', textAlign: 'center', marginBottom: 16 }}>Enter the 6-digit code sent to your mobile</Text>
                  <OtpInput value={otp} onChange={setOtp} />
                  {!!error && <Text style={{ color: '#ba1a1a', fontSize: 12, fontFamily: F.medium, marginTop: 8, textAlign: 'center' }}>{error}</Text>}

                  <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', marginTop: 16, gap: 6 }}>
                    <Text style={{ fontSize: 13, color: '#727785' }}>Didn't receive it?</Text>
                    <Pressable onPress={resend} disabled={resendTimer > 0}>
                      {resendTimer > 0
                        ? <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#727785' }}>Resend in {resendTimer}s</Text>
                        : <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff' }}>Resend OTP</Text>}
                    </Pressable>
                  </View>

                  <Pressable onPress={verifyOtp} disabled={otp.length !== 6 || verifying}
                    onPressIn={() => setVerifyOtpPressed(true)} onPressOut={() => setVerifyOtpPressed(false)}
                    style={{ marginTop: 16, borderRadius: 10, height: 48, alignItems: 'center', justifyContent: 'center', backgroundColor: otp.length !== 6 ? '#eaeef4' : '#0078ff', opacity: verifyOtpPressed ? 0.88 : 1 }}>
                    <Text style={{ color: otp.length !== 6 ? '#727785' : '#ffffff', fontSize: 14, fontFamily: F.bold }}>
                      {verifying ? 'Verifying…' : 'Verify & Continue'}
                    </Text>
                  </Pressable>
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

