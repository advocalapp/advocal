import { useEffect, useState } from 'react';
import { View, Text, Pressable, Modal, FlatList } from 'react-native';
import { Bell, BellOff, X, Tag } from 'lucide-react-native';
import { F } from '@/lib/fonts';
import { getReminderTasks, subscribeStore, type StoredTask } from '@/lib/taskStore';

const PRIORITY_DOT: Record<string, string> = {
  high:   '#EA4335',
  medium: '#FBBC05',
  low:    '#34A853',
};

const CATEGORY_COLOR: Record<string, string> = {
  'Case Work': '#0078ff',
  'Client':    '#EA4335',
  'Court':     '#34A853',
  'Admin':     '#9CA3AF',
  'Research':  '#8B5CF6',
  'Personal':  '#F97316',
};

function formatReminderTime(d: Date): string {
  const date = new Date(d);
  const now  = new Date();
  const todayStr = `${now.getFullYear()}-${now.getMonth()}-${now.getDate()}`;
  const dStr     = `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
  const timeStr  = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });
  if (todayStr === dStr) return `Today, ${timeStr}`;
  const tomorrow = new Date(now);
  tomorrow.setDate(now.getDate() + 1);
  const tStr = `${tomorrow.getFullYear()}-${tomorrow.getMonth()}-${tomorrow.getDate()}`;
  if (tStr === dStr) return `Tomorrow, ${timeStr}`;
  return `${date.toLocaleDateString([], { day: 'numeric', month: 'short' })}, ${timeStr}`;
}

interface Props {
  visible: boolean;
  onClose: () => void;
}

export function ReminderTasksModal({ visible, onClose }: Props) {
  const [tasks, setTasks] = useState<StoredTask[]>(() => getReminderTasks());

  // Keep in sync whenever the store changes
  useEffect(() => {
    const unsub = subscribeStore(() => setTasks(getReminderTasks()));
    return unsub;
  }, []);

  const renderItem = ({ item }: { item: StoredTask }) => {
    const priorityDot  = PRIORITY_DOT[item.priority] ?? '#9CA3AF';
    const categoryColor = CATEGORY_COLOR[item.category] ?? '#9CA3AF';
    const fireTime = item.reminderAt ? formatReminderTime(new Date(item.reminderAt)) : '';

    return (
      <View style={{
        flexDirection: 'row', alignItems: 'flex-start',
        backgroundColor: '#fff',
        borderRadius: 16, padding: 14, marginBottom: 10,
        boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.07)' }],
      }}>
        {/* Priority dot */}
        <View style={{
          width: 8, height: 8, borderRadius: 4,
          backgroundColor: priorityDot,
          marginTop: 6, marginRight: 12,
        }} />

        <View style={{ flex: 1, gap: 5 }}>
          {/* Title */}
          <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827' }} numberOfLines={2}>
            {item.title}
          </Text>

          {/* Category + case ref row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
              <Tag size={11} color={categoryColor} strokeWidth={2} />
              <Text style={{ fontSize: 15, fontFamily: F.regular, color: categoryColor }}>
                {item.category}
              </Text>
            </View>
            {item.caseRef ? (
              <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#9CA3AF' }}>
                · {item.caseRef}
              </Text>
            ) : null}
          </View>

          {/* Reminder time */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}>
            <Bell size={12} color="#0078ff" strokeWidth={2} />
            <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#0078ff' }}>
              {fireTime}
            </Text>
            {item.reminderAdvance ? (
              <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#9CA3AF' }}>
                ({item.reminderAdvance} min before)
              </Text>
            ) : null}
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        {/* Sheet — stop propagation so tapping inside doesn't close */}
        <Pressable onPress={() => {}} style={{
          backgroundColor: '#F4F6F9',
          borderTopLeftRadius: 28, borderTopRightRadius: 28,
          maxHeight: '82%',
          paddingBottom: 36,
        }}>
          {/* Handle */}
          <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 6 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#DADCE0' }} />
          </View>

          {/* Header */}
          <View style={{
            flexDirection: 'row', alignItems: 'center',
            justifyContent: 'space-between',
            paddingHorizontal: 20, paddingVertical: 12,
          }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{
                width: 36, height: 36, borderRadius: 18,
                backgroundColor: '#0078ff',
                alignItems: 'center', justifyContent: 'center',
              }}>
                <Bell size={17} color="#fff" strokeWidth={2.2} />
              </View>
              <View>
                <Text style={{ fontSize: 17, fontFamily: F.bold, color: '#202124' }}>
                  Reminders
                </Text>
                <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', marginTop: 1 }}>
                  {tasks.length} upcoming reminder{tasks.length !== 1 ? 's' : ''}
                </Text>
              </View>
            </View>
            <Pressable
              onPress={onClose} hitSlop={10}
              style={{
                width: 32, height: 32, borderRadius: 16,
                backgroundColor: '#F1F3F4',
                alignItems: 'center', justifyContent: 'center',
              }}
            >
              <X size={15} color="#5F6368" strokeWidth={2.5} />
            </Pressable>
          </View>

          {tasks.length === 0 ? (
            /* Empty state */
            <View style={{ alignItems: 'center', paddingVertical: 52, paddingHorizontal: 32 }}>
              <View style={{
                width: 72, height: 72, borderRadius: 36,
                backgroundColor: '#E8F0FE',
                alignItems: 'center', justifyContent: 'center', marginBottom: 16,
              }}>
                <BellOff size={34} color="#0078ff" strokeWidth={1.5} />
              </View>
              <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#202124', marginBottom: 6 }}>
                No reminders set
              </Text>
              <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 20 }}>
                Add tasks with reminders from the Tasks tab and they'll appear here.
              </Text>
            </View>
          ) : (
            <FlatList
              data={tasks}
              keyExtractor={(t) => t.id}
              renderItem={renderItem}
              contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 6 }}
              showsVerticalScrollIndicator={false}
            />
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}
