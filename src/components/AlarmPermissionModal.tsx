/**
 * AlarmPermissionModal
 *
 * Shown ONCE on first app open (Android 12+ only).
 * Guides the user through 3 required settings so that task reminder
 * notifications fire at the exact scheduled time on Samsung / Android 12+:
 *   1. Allow Notifications
 *   2. Enable Alarms & Reminders
 *   3. Set Battery to Unrestricted (prevents Samsung from killing the app)
 *
 * Dismissed state is persisted in AsyncStorage — never shown again after "Got It".
 * "Remind Me Later" dismisses for the session but re-shows on next cold start.
 */

import { useState, useEffect } from 'react';
import {
  Modal, View, Text, Pressable, Linking, Platform, ScrollView,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  Bell, BatteryCharging, AlarmClock, ChevronRight, CheckCircle2, Settings,
} from 'lucide-react-native';
import { F } from '@/lib/fonts';

const STORAGE_KEY = 'advocal_alarm_permission_shown';

// Only relevant on Android 12+ (API 31+)
const NEEDS_ALARM_PERMISSION =
  Platform.OS === 'android' && (Platform.Version as number) >= 31;

const STEPS = [
  {
    icon: Bell,
    color: '#0078ff',
    bg: '#EEF4FF',
    number: '1',
    title: 'Allow Notifications',
    how: 'Settings → Apps → AdvoCal → Notifications',
    action: 'Turn ON "Allow notifications"',
    why: 'Without this, AdvoCal cannot show any reminders at all.',
  },
  {
    icon: AlarmClock,
    color: '#EA4335',
    bg: '#FEE9E8',
    number: '2',
    title: 'Allow Alarms & Reminders',
    how: 'Settings → Apps → AdvoCal → Alarms & Reminders',
    action: 'Turn ON "Allow setting alarms"',
    why: 'Required on Android 12+ for reminders to fire at the exact time.',
  },
  {
    icon: BatteryCharging,
    color: '#34A853',
    bg: '#E6F4EA',
    number: '3',
    title: 'Set Battery to Unrestricted',
    how: 'Settings → Apps → AdvoCal → Battery',
    action: 'Select "Unrestricted" (not Optimized)',
    why: 'Samsung restricts background apps — Unrestricted prevents reminders from being delayed or killed.',
  },
];

export function AlarmPermissionModal() {
  const [visible, setVisible] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (!NEEDS_ALARM_PERMISSION) return;
    AsyncStorage.getItem(STORAGE_KEY).then((val) => {
      if (val !== 'done') setVisible(true);
    });
  }, []);

  if (!visible) return null;

  const openSettings = async () => {
    await Linking.openSettings();
  };

  const dismiss = async (permanent: boolean) => {
    if (permanent) await AsyncStorage.setItem(STORAGE_KEY, 'done');
    setVisible(false);
  };

  const currentStep = STEPS[activeStep];
  const Icon = currentStep.icon;

  return (
    <Modal
      transparent
      animationType="slide"
      visible={visible}
      onRequestClose={() => dismiss(false)}
      statusBarTranslucent
    >
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.55)', justifyContent: 'flex-end' }}>
        <SafeAreaView
          edges={['bottom']}
          style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, maxHeight: '94%' }}
        >
          {/* Drag handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginTop: 12, marginBottom: 4 }} />

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 24, paddingBottom: 16 }}>

            {/* Header */}
            <View style={{ alignItems: 'center', paddingTop: 16, paddingBottom: 20, gap: 10 }}>
              <View style={{ width: 68, height: 68, borderRadius: 20, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' }}>
                <Bell size={32} color="#0078ff" strokeWidth={2} />
              </View>
              <Text style={{ fontSize: 20, fontFamily: F.extraBold, color: '#111827', textAlign: 'center' }}>
                Enable Reminders
              </Text>
              <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 19 }}>
                Complete these <Text style={{ fontFamily: F.bold, color: '#111827' }}>3 quick steps</Text> so AdvoCal reminders{'\n'}
                arrive on time — even when the app is closed.
              </Text>
            </View>

            {/* Step tabs */}
            <View style={{ flexDirection: 'row', gap: 8, marginBottom: 20 }}>
              {STEPS.map((s, i) => (
                <Pressable
                  key={i}
                  onPress={() => setActiveStep(i)}
                  style={{
                    flex: 1, paddingVertical: 10, borderRadius: 12, alignItems: 'center', gap: 4,
                    backgroundColor: activeStep === i ? s.bg : '#F9FAFB',
                    borderWidth: activeStep === i ? 1.5 : 1,
                    borderColor: activeStep === i ? s.color : '#E5E7EB',
                  }}
                >
                  <s.icon size={18} color={activeStep === i ? s.color : '#9CA3AF'} strokeWidth={2} />
                  <Text style={{ fontSize: 10, fontFamily: F.bold, color: activeStep === i ? s.color : '#9CA3AF' }}>
                    Step {i + 1}
                  </Text>
                </Pressable>
              ))}
            </View>

            {/* Active step card */}
            <View style={{
              borderRadius: 18, overflow: 'hidden',
              borderWidth: 1.5, borderColor: currentStep.color + '33',
            }}>
              {/* Card header */}
              <View style={{ backgroundColor: currentStep.bg, paddingHorizontal: 18, paddingVertical: 16, flexDirection: 'row', alignItems: 'center', gap: 14 }}>
                <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={24} color={currentStep.color} strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: currentStep.color, letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>
                    Step {currentStep.number} of {STEPS.length}
                  </Text>
                  <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#111827' }}>
                    {currentStep.title}
                  </Text>
                </View>
              </View>

              {/* Card body */}
              <View style={{ backgroundColor: '#fff', paddingHorizontal: 18, paddingVertical: 16, gap: 14 }}>
                {/* Path */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase' }}>Where to find it</Text>
                  <View style={{ backgroundColor: '#F9FAFB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                    <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#374151', lineHeight: 20 }}>
                      {currentStep.how}
                    </Text>
                  </View>
                </View>

                {/* Action */}
                <View style={{ gap: 6 }}>
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase' }}>What to do</Text>
                  <View style={{ backgroundColor: currentStep.bg, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <CheckCircle2 size={16} color={currentStep.color} strokeWidth={2} />
                    <Text style={{ flex: 1, fontSize: 13, fontFamily: F.bold, color: currentStep.color }}>
                      {currentStep.action}
                    </Text>
                  </View>
                </View>

                {/* Why */}
                <View style={{ backgroundColor: '#FFFBEB', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <Text style={{ fontSize: 12, fontFamily: F.regular, color: '#92400E', lineHeight: 17 }}>
                    ⚠️ {currentStep.why}
                  </Text>
                </View>
              </View>
            </View>

            {/* Step navigation */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 16 }}>
              {activeStep > 0 && (
                <Pressable
                  onPress={() => setActiveStep(s => s - 1)}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#F3F4F6' }}
                >
                  <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#374151' }}>← Previous</Text>
                </Pressable>
              )}
              {activeStep < STEPS.length - 1 ? (
                <Pressable
                  onPress={() => setActiveStep(s => s + 1)}
                  style={{ flex: 1, paddingVertical: 13, borderRadius: 14, alignItems: 'center', backgroundColor: '#0078ff' }}
                >
                  <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#fff' }}>Next Step →</Text>
                </Pressable>
              ) : null}
            </View>

            {/* Divider */}
            <View style={{ height: 1, backgroundColor: '#F3F4F6', marginVertical: 18 }} />

            {/* Open Settings button */}
            <Pressable
              onPress={openSettings}
              style={{
                backgroundColor: '#0078ff', borderRadius: 14, paddingVertical: 15,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <Settings size={17} color="#fff" strokeWidth={2} />
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>Open Phone Settings</Text>
              <ChevronRight size={16} color="#fff" strokeWidth={2.5} />
            </Pressable>

            {/* Done button */}
            <Pressable
              onPress={() => dismiss(true)}
              style={{
                marginTop: 10, backgroundColor: '#E6F4EA', borderRadius: 14, paddingVertical: 14,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              }}
            >
              <CheckCircle2 size={17} color="#34A853" strokeWidth={2} />
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#34A853' }}>All Done — Got It!</Text>
            </Pressable>

            <Pressable onPress={() => dismiss(false)} style={{ paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#9CA3AF' }}>Remind me later</Text>
            </Pressable>

          </ScrollView>
        </SafeAreaView>
      </View>
    </Modal>
  );
}
