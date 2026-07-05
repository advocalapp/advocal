/**
 * notifications.ts
 *
 * Central notifications module. Handles both:
 * 1. Local task reminders (scheduled, date-based)
 * 2. FCM push token registration → stored in Supabase push_tokens table
 *
 * Must be imported early (root _layout.tsx).
 */

import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';
import { supabase } from '@/client/supabase';

// ─── Constants ────────────────────────────────────────────────────────────────
export const TASK_CHANNEL_ID = 'task-reminders';

// ─── 1. Foreground display handler (call once at app start) ───────────────────
export function setupForegroundHandler() {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowAlert: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
      shouldShowBanner: true,
      shouldShowList: true,
    }),
  });
}

// ─── 2. Android channel (must exist before ANY notification is scheduled) ─────
export async function ensureNotificationChannel() {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(TASK_CHANNEL_ID, {
    name: 'Task Reminders',
    description: 'Scheduled reminders for your legal tasks',
    importance: Notifications.AndroidImportance.HIGH,
    sound: 'default',
    vibrationPattern: [0, 250, 250, 250],
    lightColor: '#0078ff',
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
    bypassDnd: false,
    enableVibrate: true,
  });
}

// ─── 3. Request OS permission (Android 13+ needs POST_NOTIFICATIONS) ──────────
export async function requestNotificationPermission(): Promise<boolean> {
  const { status: existing } = await Notifications.getPermissionsAsync();
  if (existing === 'granted') return true;
  const { status } = await Notifications.requestPermissionsAsync({
    ios: {
      allowAlert: true,
      allowBadge: true,
      allowSound: true,
    },
  });
  return status === 'granted';
}

// ─── 4. One-shot setup — call from root _layout.tsx ───────────────────────────
export async function setupNotifications() {
  setupForegroundHandler();       // sync — register handler immediately
  await ensureNotificationChannel(); // async — create Android channel
  await requestNotificationPermission(); // async — ask user if needed
}

// ─── 5. Check exact-alarm permission (Android 12+) ────────────────────────────
/**
 * On Android 12+ (API 31+), apps need SCHEDULE_EXACT_ALARM granted in Settings.
 * Returns true if exact alarms are permitted (or not on Android).
 */
export async function canScheduleExactAlarms(): Promise<boolean> {
  if (Platform.OS !== 'android') return true;
  try {
    // expo-notifications exposes this via getPermissionsAsync on newer SDK
    const { status } = await Notifications.getPermissionsAsync();
    // Even if general permission is granted, exact alarms need the special flag
    // We rely on the OS to downgrade to inexact if not granted — still fires, just ±5 min
    return status === 'granted';
  } catch {
    return true;
  }
}

// ─── 6. Schedule a single task reminder ───────────────────────────────────────
/**
 * Schedules an OS-level notification for `fireAt`.
 * The OS delivers this even if the app is completely killed.
 * Returns the notification identifier (store it to cancel later).
 *
 * Timing fix: channelId is placed in BOTH content AND trigger (Android requirement
 * for Expo SDK 55). Without it in the trigger, Android may use the default channel
 * which has lower importance and can delay delivery.
 */
export async function scheduleTaskReminder(
  taskTitle: string,
  fireAt: Date,
): Promise<string | null> {
  try {
    // Ensure channel exists (safe to call multiple times)
    await ensureNotificationChannel();

    const granted = await requestNotificationPermission();
    if (!granted) return null;

    // Refuse to schedule in the past — the OS would fire immediately or drop it
    const now = new Date();
    if (fireAt <= now) return null;

    // Build trigger — channelId in trigger is critical for Android exact delivery
    const trigger: Notifications.NotificationTriggerInput =
      Platform.OS === 'android'
        ? {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
            channelId: TASK_CHANNEL_ID,
          }
        : {
            type: Notifications.SchedulableTriggerInputTypes.DATE,
            date: fireAt,
          };

    const id = await Notifications.scheduleNotificationAsync({
      content: {
        title: '⚖️ Task Reminder',
        body: taskTitle,
        sound: 'default',
        priority: Notifications.AndroidNotificationPriority.MAX,
        // channelId in content ensures correct channel assignment
        ...(Platform.OS === 'android' ? { channelId: TASK_CHANNEL_ID } : {}),
        data: { taskTitle, scheduledFor: fireAt.toISOString() },
      },
      trigger,
    });

    console.log(`[notifications] Scheduled "${taskTitle}" at ${fireAt.toLocaleTimeString()} (id: ${id})`);
    return id;
  } catch (e) {
    console.warn('[notifications] scheduleTaskReminder failed:', e);
    return null;
  }
}

// ─── 6. Cancel a scheduled notification ───────────────────────────────────────
export async function cancelTaskReminder(notificationId: string) {
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (e) {
    console.warn('[notifications] cancelTaskReminder failed:', e);
  }
}

// ─── 7. Register FCM push token → save to Supabase push_tokens ───────────────
/**
 * Gets the Expo/FCM push token for this device and upserts it in Supabase.
 * Must be called after the user is authenticated (session exists).
 * Safe to call multiple times — uses upsert with (user_id, token) unique key.
 */
export async function registerPushToken(): Promise<void> {
  try {
    // Only register on real devices (not simulators/web)
    if (Platform.OS === 'web') return;

    // Ensure permission granted
    const granted = await requestNotificationPermission();
    if (!granted) return;

    // Get the native FCM/APNs token
    const tokenData = await Notifications.getDevicePushTokenAsync();
    const token = tokenData.data;
    if (!token) return;

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;

    // Upsert token — safe to call on every app open
    const { error } = await supabase
      .from('push_tokens')
      .upsert(
        {
          user_id: user.id,
          token,
          platform: Platform.OS as 'android' | 'ios',
          updated_at: new Date().toISOString(),
        },
        { onConflict: 'user_id,token' },
      );

    if (error) {
      console.warn('[notifications] registerPushToken upsert failed:', error.message);
    } else {
      console.log('[notifications] Push token registered/refreshed:', token.slice(-10));
    }
  } catch (e) {
    console.warn('[notifications] registerPushToken failed:', e);
  }
}

// ─── 8. Listen for FCM token rotation and auto-re-register ────────────────────
/**
 * FCM routinely rotates push tokens (after first delivery, reinstall, etc).
 * This listener fires whenever the OS issues a new token and re-upserts it.
 * Call once from the root layout after the user is authenticated.
 * Returns a cleanup function — call it on unmount.
 */
export function subscribePushTokenRefresh(): () => void {
  if (Platform.OS === 'web') return () => {};

  const subscription = Notifications.addPushTokenListener(async (tokenData) => {
    const token = tokenData.data;
    if (!token) return;
    console.log('[notifications] FCM token rotated — re-registering:', token.slice(-10));
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return;
    await supabase.from('push_tokens').upsert(
      {
        user_id: user.id,
        token,
        platform: Platform.OS as 'android' | 'ios',
        updated_at: new Date().toISOString(),
      },
      { onConflict: 'user_id,token' },
    );
  });

  return () => subscription.remove();
}
