import { useState } from 'react';
import { View, Text, Pressable, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  Bell, Briefcase, Hash, Clock, CalendarDays, FileText,
} from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { startFreeTrial } from '@/db/api';
import { F } from '@/lib/fonts';

const FEATURES = [
  { icon: Bell,         title: 'Unlimited Hearing Reminders',    color: '#3B6FF0', bg: '#EEF4FF' },
  { icon: Briefcase,    title: 'Case Tracking & Management',      color: '#2A9D5C', bg: '#EEFBF1' },
  { icon: Hash,         title: 'Court & Room Number Tracking',    color: '#D48B2F', bg: '#FFF8EC' },
  { icon: Clock,        title: 'Hearing History Timeline',        color: '#6558F5', bg: '#F0EFFF' },
  { icon: CalendarDays, title: 'Upcoming Hearing Calendar',       color: '#1A8FE3', bg: '#EDF7FF' },
  { icon: FileText,     title: 'Get Case Details From CNR',       color: '#E53E3E', bg: '#FFF0F0' },
];

export default function SubscriptionScreen() {
  const router = useRouter();
  const [ctaPressed, setCtaPressed] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleStartTrial = async () => {
    setLoading(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) await startFreeTrial(user.id);
    } catch { /* non-blocking */ }
    finally { setLoading(false); }
    router.replace('/(app)/(tabs)/calendar' as any);
  };

  return (
    <View style={{ flex: 1, backgroundColor: '#FFFFFF' }}>
      <StatusBar style="dark" backgroundColor="#FFFFFF" />
      <SafeAreaView style={{ flex: 1, paddingHorizontal: 18, paddingTop: 4, paddingBottom: 8 }} edges={['top', 'bottom']}>

        {/* Badge */}
        <View style={{ alignItems: 'center', marginBottom: 8 }}>
          <View style={{
            flexDirection: 'row', alignItems: 'center', gap: 6,
            borderWidth: 1.5, borderColor: '#D97706', borderRadius: 20,
            paddingHorizontal: 14, paddingVertical: 5,
          }}>
            <Text style={{ fontSize: 11, color: '#F59E0B' }}>★</Text>
            <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#D97706', letterSpacing: 1.2 }}>ADVOCAL PREMIUM</Text>
          </View>
        </View>

        {/* Headline */}
        <View style={{ alignItems: 'center', marginBottom: 6 }}>
          <Text style={{ fontSize: 18, fontFamily: F.extraBold, color: '#0D1A3A', textAlign: 'center', lineHeight: 25, letterSpacing: -0.3 }}>
            Manage your legal practice{'\n'}professionally.
          </Text>
          <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 16, marginTop: 4 }}>
            Everything you need to track cases, hearings,{'\n'}and court schedules — in one app.
          </Text>
        </View>

        {/* Pricing card */}
        <View style={{
          backgroundColor: '#111827', borderRadius: 14, paddingHorizontal: 16,
          paddingVertical: 12, marginBottom: 8,
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 4, marginBottom: 8 }}>
            <Text style={{ fontSize: 28, fontFamily: F.extraBold, color: '#FFFFFF', letterSpacing: -0.5 }}>₹49</Text>
            <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#9CA3AF' }}>/month</Text>
          </View>
          {/* Trial badge */}
          <View style={{
            backgroundColor: '#166534', borderRadius: 8,
            paddingVertical: 7, alignItems: 'center', marginBottom: 8,
          }}>
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#22C55E' }}>● 7 Days Free Trial</Text>
          </View>
          <Text style={{ fontSize: 10, fontFamily: F.regular, color: '#9CA3AF' }}>
            Then ₹49/month after trial. Cancel anytime.
          </Text>
        </View>

        {/* Features — flex to fill remaining space */}
        <View style={{ flex: 1, justifyContent: 'space-evenly' }}>
          {FEATURES.map(({ icon: Icon, title, color, bg }) => (
            <View key={title} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 32, height: 32, borderRadius: 8,
                backgroundColor: bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <Icon size={15} color={color} strokeWidth={1.8} />
              </View>
              <Text style={{ fontSize: 12, fontFamily: F.semiBold, color: '#111827', flex: 1 }}>{title}</Text>
            </View>
          ))}
        </View>

        {/* Bottom info card */}
        <View style={{
          backgroundColor: '#F9FAFB', borderRadius: 12, borderWidth: 1,
          borderColor: '#E5E7EB', padding: 12, marginTop: 8, marginBottom: 10,
        }}>
          <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#111827', marginBottom: 2 }}>
            Start with 7 Days Free Trial
          </Text>
          <Text style={{ fontSize: 10, fontFamily: F.regular, color: '#6B7280', lineHeight: 14 }}>
            No payment required today. Access all premium features for 7 days, free.
          </Text>
        </View>

        {/* CTA */}
        <Pressable
          onPress={handleStartTrial}
          disabled={loading}
          onPressIn={() => setCtaPressed(true)}
          onPressOut={() => setCtaPressed(false)}
          style={{
            backgroundColor: ctaPressed ? '#1D4ED8' : '#2563EB',
            borderRadius: 14, paddingVertical: 15, alignItems: 'center',
            opacity: loading ? 0.75 : 1,
          }}
        >
          {loading
            ? <ActivityIndicator color="#fff" />
            : <Text style={{ fontSize: 15, fontFamily: F.extraBold, color: '#FFFFFF' }}>Start 7 Day Free Trial</Text>
          }
        </Pressable>

      </SafeAreaView>
    </View>
  );
}
