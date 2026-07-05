import { useState } from 'react';
import { Tabs, useRouter } from 'expo-router';
import { View, Text, Pressable, Modal } from 'react-native';
import { Image } from 'expo-image';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  CalendarDays, Plus, Bell, User,
  FileText, CheckSquare, CalendarClock, X, ChevronRight,
} from 'lucide-react-native';
import { supabase as _supabase } from '@/client/supabase';
import { F } from '@/lib/fonts';
import { UpdateHearingModal } from '@/components/UpdateHearingModal';

const OVERVIEW_ICON_URI = 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260622/research.png';

// ─── Tab icon ────────────────────────────────────────────────────────────────
function TabIcon({ icon: Icon, imageUri, focused, label, color }: {
  icon?: any; imageUri?: string; focused: boolean; label: string; color: string;
}) {
  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', paddingTop: 4, gap: 2, minWidth: 52 }}>
      {imageUri ? (
        <Image
          source={{ uri: imageUri }}
          style={{ width: 24, height: 24, tintColor: color }}
          contentFit="contain"
        />
      ) : (
        <Icon size={21} color={color} strokeWidth={focused ? 2.4 : 1.8} />
      )}
      <Text style={{ fontSize: 10, color, fontFamily: F.bold }} numberOfLines={1}>
        {label}
      </Text>
    </View>
  );
}

// ─── Action Sheet ─────────────────────────────────────────────────────────────
interface ActionSheetProps {
  visible: boolean;
  onClose: () => void;
  onAddCase: () => void;
  onAddTask: () => void;
  onUpdateHearing: () => void;
}

function ActionSheet({ visible, onClose, onAddCase, onAddTask, onUpdateHearing }: ActionSheetProps) {
  const ITEMS = [
    {
      label: 'Add Case',
      sub: 'Register a new court case',
      icon: FileText,
      iconBg: '#0078ff',
      cardBg: '#EEF4FF',
      onPress: onAddCase,
    },
    {
      label: 'Reminder / Task',
      sub: 'Create a to-do or reminder',
      icon: CheckSquare,
      iconBg: '#34A853',
      cardBg: '#EDFAF2',
      onPress: onAddTask,
    },
    {
      label: 'Update Hearing Date',
      sub: 'Change next hearing for a case',
      icon: CalendarClock,
      iconBg: '#FBBC05',
      cardBg: '#FFFBEA',
      onPress: onUpdateHearing,
    },
  ];

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26, paddingHorizontal: 16, paddingTop: 14, paddingBottom: 36 }}>
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 18 }} />

          {/* Title */}
          <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', textAlign: 'center', letterSpacing: 1, textTransform: 'uppercase', marginBottom: 14 }}>
            Quick Actions
          </Text>

          {ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <Pressable
                key={item.label}
                onPress={item.onPress}
                style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: item.cardBg, borderRadius: 16,
                  paddingHorizontal: 16, paddingVertical: 14,
                  marginBottom: 10, gap: 14,
                }}
              >
                <View style={{ width: 44, height: 44, borderRadius: 12, backgroundColor: item.iconBg, alignItems: 'center', justifyContent: 'center' }}>
                  <Icon size={21} color="#fff" strokeWidth={2} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#111827' }}>{item.label}</Text>
                  <Text style={{ fontSize: 11.5, fontFamily: F.regular, color: '#6B7280', marginTop: 2 }}>{item.sub}</Text>
                </View>
                <ChevronRight size={15} color="#C4C9D4" strokeWidth={2.5} />
              </Pressable>
            );
          })}

          {/* Cancel */}
          <Pressable onPress={onClose} style={{ alignItems: 'center', paddingVertical: 12, marginTop: 2 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <X size={13} color="#9CA3AF" strokeWidth={2.5} />
              <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#9CA3AF' }}>Cancel</Text>
            </View>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Layout ───────────────────────────────────────────────────────────────────
export default function TabsLayout() {
  const router = useRouter();
  const [showMenu, setShowMenu] = useState(false);
  const [showHearing, setShowHearing] = useState(false);
  const insets = useSafeAreaInsets();

  const handleAddCase = () => {
    setShowMenu(false);
    setTimeout(() => router.push('/(app)/(tabs)/add-case'), 150);
  };

  const handleAddTask = () => {
    setShowMenu(false);
    setTimeout(() => router.push('/(app)/add-reminder' as any), 150);
  };

  const handleUpdateHearing = () => {
    setShowMenu(false);
    setTimeout(() => setShowHearing(true), 150);
  };

  return (
    <>
      <Tabs
        screenOptions={{
          headerShown: false,
          tabBarShowLabel: false,
          tabBarStyle: {
            height: 58 + insets.bottom,
            backgroundColor: '#fff',
            borderTopWidth: 1,
            borderTopColor: '#F3F4F6',
            paddingBottom: insets.bottom > 0 ? insets.bottom : 8,
            paddingTop: 4,
          },
          tabBarActiveTintColor: '#111827',
          tabBarInactiveTintColor: '#111827',
        }}
      >
        <Tabs.Screen
          name="calendar"
          options={{
            title: 'Calendar',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon icon={CalendarDays} focused={focused} label="Calendar" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="hearings"
          options={{
            title: 'Overview',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon imageUri={OVERVIEW_ICON_URI} focused={focused} label="Overview" color={color} />
            ),
          }}
        />
        <Tabs.Screen
          name="add-case"
          options={{
            title: 'Add',
            tabBarButton: () => (
              <Pressable
                onPress={() => setShowMenu(true)}
                style={{ flex: 1, alignItems: 'center', justifyContent: 'center' }}
              >
                <View style={{
                  width: 52, height: 52, borderRadius: 26,
                  backgroundColor: '#111827',
                  alignItems: 'center', justifyContent: 'center',
                  marginTop: -10,
                  boxShadow: '0 4px 16px rgba(0,0,0,0.30)',
                }}>
                  <Plus size={26} color="#fff" strokeWidth={2.5} />
                </View>
              </Pressable>
            ),
          }}
        />
        <Tabs.Screen
          name="tasks"
          options={{
            title: 'Reminders',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon icon={Bell} focused={focused} label="Reminders" color={focused ? '#0078ff' : color} />
            ),
          }}
        />
        <Tabs.Screen
          name="profile"
          options={{
            title: 'Profile',
            tabBarIcon: ({ focused, color }) => (
              <TabIcon icon={User} focused={focused} label="Profile" color={color} />
            ),
          }}
        />
      </Tabs>

      <ActionSheet
        visible={showMenu}
        onClose={() => setShowMenu(false)}
        onAddCase={handleAddCase}
        onAddTask={handleAddTask}
        onUpdateHearing={handleUpdateHearing}
      />

      <UpdateHearingModal
        visible={showHearing}
        onClose={() => setShowHearing(false)}
      />
    </>
  );
}
