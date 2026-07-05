import { useState, useEffect } from 'react';
import { View, Text, Pressable, ActivityIndicator, ScrollView, BackHandler, Modal, Linking } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  CircleCheck, ShieldCheck, ChevronLeft,
} from 'lucide-react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { supabase } from '@/client/supabase';
import { startFreeTrial, updateProfile } from '@/db/api';
import { F } from '@/lib/fonts';
import { NEW_USER_KEY } from '@/app/_layout';

const FEATURES = [
  { title: 'Smart Case Tracking',    desc: 'Effortlessly organize and monitor your practice.' },
  { title: 'Court & Room Tracking',  desc: 'Precise room and court identification.' },
  { title: 'Hearing Timeline',       desc: 'Detailed, chronological record of every event.' },
  { title: 'CNR Extraction',         desc: 'Instantly pull case details from official records.' },
  { title: 'Unlimited Reminders',    desc: 'Automated SMS and WhatsApp alerts.' },
];

export default function PremiumOnboardingScreen() {
  const router  = useRouter();
  const [loading,    setLoading]    = useState(false);
  const [pressed,    setPressed]    = useState(false);
  const [backPrsd,   setBackPrsd]   = useState(false);
  const [showBackDlg, setShowBackDlg] = useState(false);
  const [confirmPrsd, setConfirmPrsd] = useState(false);
  const [cancelPrsd,  setCancelPrsd]  = useState(false);

  /** Show confirmation dialog instead of going back immediately */
  const requestBack = () => setShowBackDlg(true);

  /** User confirmed going back → sign out + clear data → sign-in */
  const confirmBack = async () => {
    setShowBackDlg(false);
    try {
      await AsyncStorage.multiRemove(['advocal_pending_profile_data', NEW_USER_KEY]);
      await supabase.auth.signOut();
    } catch { /* best-effort */ }
    router.replace('/(auth)/sign-up');
  };

  // Intercept Android hardware back button — show dialog instead of popping
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      requestBack();
      return true; // prevent default pop
    });
    return () => sub.remove();
  }, []);

  /** Start Trial → save pending profile first, then activate trial */
  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();

      // Save deferred profile data collected during sign-up
      const raw = await AsyncStorage.getItem('advocal_pending_profile_data');
      if (raw && user) {
        const profileData = JSON.parse(raw) as Record<string, string | null>;
        await updateProfile(profileData.userId ?? user.id, {
          full_name:               profileData.full_name ?? undefined,
          company_name:            profileData.company_name ?? null,
          bar_registration_number: profileData.bar_registration_number ?? null,
          city:                    profileData.city ?? null,
          address:                 profileData.address ?? null,
          date_of_birth:           profileData.date_of_birth ?? null,
        } as any);
        await AsyncStorage.removeItem('advocal_pending_profile_data');
      }

      if (user) await startFreeTrial(user.id);

      // Only clear the gate flag AFTER trial is successfully activated
      await AsyncStorage.removeItem(NEW_USER_KEY);
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
    router.replace('/(app)/(tabs)/calendar' as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#F0F4FF' }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

        {/* Back button — outside card, top-left */}
        <View style={{ paddingHorizontal: 16, paddingTop: 8, paddingBottom: 4 }}>
          <Pressable
            onPress={requestBack}
            onPressIn={() => setBackPrsd(true)}
            onPressOut={() => setBackPrsd(false)}
            style={{
              flexDirection: 'row', alignItems: 'center', gap: 4,
              alignSelf: 'flex-start',
              backgroundColor: backPrsd ? '#0060cc' : '#0078ff',
              borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8,
            }}
          >
            <ChevronLeft size={15} color="#ffffff" strokeWidth={2.5} />
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#ffffff' }}>Back</Text>
          </Pressable>
        </View>

        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'center', paddingHorizontal: 20, paddingVertical: 12 }}
        >
          {/* ── Card ── */}
          <View style={{
            backgroundColor: '#FFFFFF',
            borderRadius: 24,
            borderWidth: 1.5,
            borderColor: '#C8DEFF',
            paddingHorizontal: 22,
            paddingTop: 22,
            paddingBottom: 26,
          }}>

            {/* Card header row: TRIAL PLAN label + shield icon */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
              <Text style={{ fontSize: 13, fontFamily: F.extraBold, color: '#0078ff', letterSpacing: 1.2, textDecorationLine: 'underline' }}>
                TRIAL PLAN
              </Text>
              <ShieldCheck size={28} color="#22C55E" strokeWidth={2} />
            </View>

            {/* Headline */}
            <Text style={{ fontSize: 36, fontFamily: F.extraBold, color: '#111827', lineHeight: 42, marginBottom: 4 }}>
              7 Days Free
            </Text>
            <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#6B7280', marginBottom: 20 }}>
              You won't be charged today
            </Text>

            {/* Feature list */}
            <View style={{ gap: 14, marginBottom: 28 }}>
              {FEATURES.map(({ title, desc }) => (
                <View key={title} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10 }}>
                  <CircleCheck size={22} color="#22C55E" strokeWidth={2} style={{ marginTop: 1, flexShrink: 0 }} />
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#111827', marginBottom: 2 }}>{title}</Text>
                    <Text style={{ fontSize: 12, fontFamily: F.regular, color: '#6B7280', lineHeight: 17 }}>{desc}</Text>
                  </View>
                </View>
              ))}
            </View>

            {/* CTA Button */}
            <Pressable
              onPress={handleStartTrial}
              disabled={loading}
              onPressIn={() => setPressed(true)}
              onPressOut={() => setPressed(false)}
              style={{
                backgroundColor: pressed ? '#1a6b2e' : '#226B35',
                borderRadius: 50,
                paddingVertical: 17,
                alignItems: 'center',
                justifyContent: 'center',
                opacity: loading ? 0.75 : 1,
                marginBottom: 14,
              }}
            >
              {loading
                ? <ActivityIndicator color="#fff" />
                : <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#FFFFFF', letterSpacing: 0.3 }}>
                    Start Free Trial
                  </Text>
              }
            </Pressable>

            {/* Footer note with legal links */}
            <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#9CA3AF', textAlign: 'center', letterSpacing: 1.0, marginBottom: 10 }}>
              CANCEL ANYTIME
            </Text>
            <View style={{ flexDirection: 'row', justifyContent: 'center', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
              <Pressable onPress={() => Linking.openURL('https://advocal.in/terms')}>
                <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff', textDecorationLine: 'underline' }}>Terms of Service</Text>
              </Pressable>
              <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#9CA3AF' }}>·</Text>
              <Pressable onPress={() => Linking.openURL('https://advocal.in/privacy')}>
                <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff', textDecorationLine: 'underline' }}>Privacy Policy</Text>
              </Pressable>
            </View>
          </View>
        </ScrollView>
      </SafeAreaView>

      {/* ── Back confirmation dialog ── */}
      <Modal transparent animationType="fade" visible={showBackDlg} onRequestClose={() => setShowBackDlg(false)}>
        <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', paddingHorizontal: 28 }}>
          <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 340 }}>
            {/* Icon */}
            <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: '#FFF3E0', alignItems: 'center', justifyContent: 'center', alignSelf: 'center', marginBottom: 14 }}>
              <Text style={{ fontSize: 26 }}>⚠️</Text>
            </View>
            {/* Title */}
            <Text style={{ fontSize: 17, fontFamily: F.extraBold, color: '#111827', textAlign: 'center', marginBottom: 8 }}>
              Leave Free Trial?
            </Text>
            {/* Body */}
            <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 20, marginBottom: 22 }}>
              Your 7-day free trial hasn't started yet. If you go back now your profile won't be saved and you'll need to sign up again.
            </Text>
            {/* Buttons */}
            <Pressable
              onPress={() => setShowBackDlg(false)}
              onPressIn={() => setConfirmPrsd(true)}
              onPressOut={() => setConfirmPrsd(false)}
              style={{
                backgroundColor: confirmPrsd ? '#0060cc' : '#0078ff',
                borderRadius: 12, paddingVertical: 14,
                alignItems: 'center', marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#fff' }}>Continue to Free Trial</Text>
            </Pressable>
            <Pressable
              onPress={confirmBack}
              onPressIn={() => setCancelPrsd(true)}
              onPressOut={() => setCancelPrsd(false)}
              style={{
                backgroundColor: cancelPrsd ? '#F3F4F6' : '#fff',
                borderRadius: 12, paddingVertical: 14,
                alignItems: 'center',
                borderWidth: 1, borderColor: '#E5E7EB',
              }}
            >
              <Text style={{ fontSize: 14, fontFamily: F.semiBold, color: '#6B7280' }}>Go Back to Login</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}
