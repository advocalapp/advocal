import { useEffect, useRef, useState } from 'react';
import { Stack, useRouter } from 'expo-router';
import { PortalHost } from '@rn-primitives/portal';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { ActivityIndicator, View, StyleSheet } from 'react-native';
import {
  useFonts,
  Inter_400Regular,
  Inter_500Medium,
  Inter_600SemiBold,
  Inter_700Bold,
  Inter_800ExtraBold,
} from '@expo-google-fonts/inter';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Image } from 'expo-image';
import { SessionProvider, useSession } from '@/ctx';
import { setupNotifications } from '@/lib/notifications';
import { getProfile } from '@/db/api';
// RevenueCat removed — payments handled by Razorpay Edge Function
import '../global.css';

// Pre-warm remote images so they appear instantly on every screen
const PREWARM_URLS = [
  'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260628/Homelogo.png', // logo
  'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260612/password-protection.png',                 // lock icon
  'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260613/king.png',                                  // king icon
  'https://flagcdn.com/w40/in.png',                                                                                                         // India flag
];
Image.prefetch(PREWARM_URLS, 'memory-disk');

export const NEW_USER_KEY = 'advocal_new_user_pending';

function RootLayoutNav() {
  const { session, isLoading, resetToHome, clearResetHome } = useSession();
  const router = useRouter();

  const hasNavigated = useRef(false);
  const wasLoggedIn  = useRef<boolean | null>(null);
  // Keep overlay visible while async navigation decision is in flight
  const [isNavigating, setIsNavigating] = useState(false);

  useEffect(() => {
    if (isLoading) return;

    const loggedIn        = !!session;
    const firstTime       = !hasNavigated.current;
    const crossedBoundary = wasLoggedIn.current !== null && wasLoggedIn.current !== loggedIn;

    if (firstTime || crossedBoundary) {
      hasNavigated.current = true;
      wasLoggedIn.current  = loggedIn;

      if (loggedIn) {
        setIsNavigating(true);
        (async () => {
          try {
            const uid = session!.user.id;

            // If new-user flag is set, always gate on premium-onboarding
            // (flag is only cleared when user actually taps "Start Free Trial")
            const newUserFlag = await AsyncStorage.getItem(NEW_USER_KEY);
            if (newUserFlag === 'true') {
              router.replace('/(app)/premium-onboarding' as any);
              return;
            }
            const profile = await getProfile(uid);
            // Block incomplete profiles — must have address + DOB before accessing the app
            const incomplete = !profile?.address || !profile?.date_of_birth;
            const status     = profile?.subscription_status ?? 'none';
            if (incomplete || status === 'none') {
              // Re-set the flag so back-navigation from premium-onboarding stays gated
              await AsyncStorage.setItem(NEW_USER_KEY, 'true');
              router.replace('/(app)/premium-onboarding' as any);
            } else {
              router.replace('/(app)/(tabs)/calendar');
            }
          } catch {
            router.replace('/(app)/(tabs)/calendar');
          } finally {
            setIsNavigating(false);
          }
        })();
      } else {
        router.replace('/');
      }
    } else {
      wasLoggedIn.current = loggedIn;
    }
  }, [session, isLoading]);

  useEffect(() => {
    if (resetToHome && session) {
      clearResetHome();
      router.replace('/(app)/(tabs)/calendar');
    }
  }, [resetToHome]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(app)" />
        <Stack.Screen name="+not-found" />
      </Stack>

      {(isLoading || isNavigating) && (
        <View style={styles.overlay}>
          <ActivityIndicator color="#0078ff" size="large" />
        </View>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#fff',
    alignItems: 'center',
    justifyContent: 'center',
  },
});

export default function RootLayout() {
  const [fontsLoaded] = useFonts({
    'Inter-Regular': Inter_400Regular,
    'Inter-Medium': Inter_500Medium,
    'Inter-SemiBold': Inter_600SemiBold,
    'Inter-Bold': Inter_700Bold,
    'Inter-ExtraBold': Inter_800ExtraBold,
  });

  // Don't block startup forever — if fonts aren't ready within 4 s, proceed
  // with system fonts so the app is usable while fonts finish loading in bg.
  const [fontTimeout, setFontTimeout] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setFontTimeout(true), 4_000);
    return () => clearTimeout(t);
  }, []);

  // Set up notification channel + foreground handler as early as possible
  // so notifications are never silently dropped on Android 8+
  useEffect(() => {
    setupNotifications();
  }, []);

  if (!fontsLoaded && !fontTimeout) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: '#fff' }}>
        <ActivityIndicator color="#0078ff" size="large" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <StatusBar style="dark" backgroundColor="#fff" />
        <SessionProvider>
          <RootLayoutNav />
          <PortalHost />
        </SessionProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
