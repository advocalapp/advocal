import { useEffect, useState } from 'react';
import { Stack, useRouter, useSegments } from 'expo-router';
import { useSession } from '@/ctx';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getProfile, getCases, getSubscriptionInfo, dataCache } from '@/db/api';
import { NEW_USER_KEY } from '@/app/_layout';
// RevenueCat removed — subscription status synced via Razorpay Edge Function
import { AlarmPermissionModal } from '@/components/AlarmPermissionModal';

export default function AppLayout() {
  const { session } = useSession();
  const router = useRouter();
  const segments = useSegments();
  const [_checked, setChecked] = useState(false);

  useEffect(() => {
    if (!session?.user?.id) return;

    let cancelled = false;
    (async () => {
      const uid = session.user.id;
      dataCache.setUserId(uid);

      // Gate: if new-user flag is set, always send back to plan page
      const newUserFlag = await AsyncStorage.getItem(NEW_USER_KEY);
      if (newUserFlag === 'true') {
        if (!segments.includes('premium-onboarding' as never)) {
          router.replace('/(app)/premium-onboarding' as any);
        }
        return;
      }

      const [profile] = await Promise.all([
        getProfile(uid),
        getCases(uid),
      ]);

      const info = getSubscriptionInfo(profile);
      if (cancelled) return;

      const onPayment = segments.includes('payment' as never) || segments.includes('qr-payment' as never) || segments.includes('payment-failed' as never) || segments.includes('payment-success' as never);
      const onPremiumOnboarding = segments.includes('premium-onboarding' as never);

      // Block incomplete profiles or users with no subscription from accessing tabs
      const incomplete = !profile?.address || !profile?.date_of_birth;
      if ((incomplete || info.status === 'none') && !onPremiumOnboarding && !onPayment) {
        // Re-set flag so the gate stays active
        await AsyncStorage.setItem(NEW_USER_KEY, 'true');
        router.replace('/(app)/premium-onboarding' as any);
        return;
      }

      if (info.status === 'expired' && !onPayment) {
        // Trial expired — gate to payment screen
        router.replace('/(app)/payment' as any);
      }
      setChecked(true);
    })();

    return () => { cancelled = true; };
  // Re-check whenever the user navigates to a new screen
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.user?.id, segments.join('/')]);

  return (
    <>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="case" />
        <Stack.Screen name="payment" />
        <Stack.Screen name="qr-payment" />
        <Stack.Screen name="payment-success" />
        <Stack.Screen name="payment-failed" />
        <Stack.Screen name="premium-onboarding" />
        <Stack.Screen name="subscription" />
        <Stack.Screen name="legal-content" />
        <Stack.Screen name="admin" />
        <Stack.Screen name="add-reminder" />
      </Stack>

      {/* Show once on first launch: guide user to enable exact alarms (Android 12+) */}
      <AlarmPermissionModal />
    </>
  );
}
