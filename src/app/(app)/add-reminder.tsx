import { useState, useMemo } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  Modal, KeyboardAvoidingView, Platform,
} from 'react-native';
import * as Notifications from 'expo-notifications';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  ArrowLeft, Building2, Users, CheckSquare, CalendarX2,
  MoreHorizontal, CalendarDays, Clock, MapPin, AlignLeft,
  Bell, RefreshCw, CheckCircle, ClipboardEdit, ChevronDown,
} from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { CALENDAR_STYLES } from '@/lib/calendarStyles';
import { scheduleTaskReminder, TASK_CHANNEL_ID } from '@/lib/notifications';
import { setStoreTasks, getStoreTasks } from '@/lib/taskStore';
import { F } from '@/lib/fonts';
import dayjs from 'dayjs';

// ─── Types ────────────────────────────────────────────────────────────────────
type ReminderType = 'Hearing' | 'Meeting' | 'Task' | 'Deadline' | 'Other';
type Priority = 'Low' | 'Medium' | 'High';
type ReminderBefore = 'At event time' | '5 minutes before' | '10 minutes before' | '15 minutes before' | '30 minutes before' | '1 hour before' | '2 hours before' | '1 day before';
type RepeatOption = 'Does not repeat' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';

// ─── Type chips config ────────────────────────────────────────────────────────
const TYPES: { key: ReminderType; icon: React.ComponentType<any>; color: string }[] = [
  { key: 'Hearing',  icon: Building2,    color: '#2563EB' },
  { key: 'Meeting',  icon: Users,        color: '#16A34A' },
  { key: 'Task',     icon: CheckSquare,  color: '#D97706' },
  { key: 'Deadline', icon: CalendarX2,   color: '#DC2626' },
  { key: 'Other',    icon: MoreHorizontal, color: '#6B7280' },
];

const REMINDER_BEFORE_OPTIONS: ReminderBefore[] = [
  'At event time', '5 minutes before', '10 minutes before', '15 minutes before',
  '30 minutes before', '1 hour before', '2 hours before', '1 day before',
];

const REPEAT_OPTIONS: RepeatOption[] = [
  'Does not repeat', 'Daily', 'Weekly', 'Monthly', 'Yearly',
];

const PRIORITY_CONFIG: { key: Priority; dot: string }[] = [
  { key: 'Low',    dot: '#22C55E' },
  { key: 'Medium', dot: '#EAB308' },
  { key: 'High',   dot: '#EF4444' },
];

// ─── Inline dropdown sheet ────────────────────────────────────────────────────
function DropdownSheet<T extends string>({
  visible, options, selected, onSelect, onClose,
}: {
  visible: boolean;
  options: T[];
  selected: T;
  onSelect: (v: T) => void;
  onClose: () => void;
}) {
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
          {options.map((opt) => (
            <Pressable
              key={opt}
              onPress={() => { onSelect(opt); onClose(); }}
              style={{
                paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10,
                backgroundColor: selected === opt ? '#EEF4FF' : 'transparent',
                marginBottom: 4,
                flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
              }}
            >
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: selected === opt ? '#0078ff' : '#374151' }}>
                {opt}
              </Text>
              {selected === opt && (
                <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#0078ff', alignItems: 'center', justifyContent: 'center' }}>
                  <Text style={{ color: '#fff', fontSize: 12, fontFamily: F.bold }}>✓</Text>
                </View>
              )}
            </Pressable>
          ))}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Date picker sheet ────────────────────────────────────────────────────────
function DateSheet({
  visible, selected, onSelect, onClose,
}: {
  visible: boolean;
  selected: Date | null;
  onSelect: (d: Date) => void;
  onClose: () => void;
}) {
  const [local, setLocal] = useState<Date>(selected ?? new Date());
  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 12 }} />
          <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', marginBottom: 8, textAlign: 'center' }}>Select Date</Text>
          <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#E5E7EB' }}>
            <DateTimePicker
              mode="single"
              date={local}
              minDate={new Date()}
              onChange={({ date }) => { if (date) setLocal(date instanceof Date ? date : new Date(date as string)); }}
              styles={CALENDAR_STYLES}
            />
          </View>
          <Pressable
            onPress={() => { onSelect(local); onClose(); }}
            style={{ marginTop: 14, backgroundColor: '#0078ff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>
              Confirm — {dayjs(local).format('DD MMM YYYY')}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Time picker sheet ────────────────────────────────────────────────────────
function TimeSheet({
  visible, hour, minute, ampm, onConfirm, onClose,
}: {
  visible: boolean;
  hour: number; minute: number; ampm: 'AM' | 'PM';
  onConfirm: (h: number, m: number, ap: 'AM' | 'PM') => void;
  onClose: () => void;
}) {
  const [h, setH] = useState(hour);
  const [m, setM] = useState(minute);
  const [ap, setAp] = useState<'AM' | 'PM'>(ampm);

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }}
        >
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
          <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', marginBottom: 16, textAlign: 'center' }}>Select Time</Text>

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: 20 }}>
            {/* Hour stepper */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
              <Pressable onPress={() => setH((v) => v === 1 ? 12 : v - 1)} style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 22, fontFamily: F.bold, color: '#0078ff', lineHeight: 24 }}>−</Text>
              </Pressable>
              <Text style={{ flex: 1, fontSize: 22, fontFamily: F.bold, color: '#111827', textAlign: 'center' }}>
                {String(h === 0 ? 12 : h).padStart(2, '0')}
              </Text>
              <Pressable onPress={() => setH((v) => v === 12 ? 1 : v + 1)} style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 22, fontFamily: F.bold, color: '#0078ff', lineHeight: 24 }}>+</Text>
              </Pressable>
            </View>

            <Text style={{ fontSize: 22, fontFamily: F.bold, color: '#374151' }}>:</Text>

            {/* Minute stepper */}
            <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
              <Pressable onPress={() => setM((v) => v === 0 ? 55 : v - 5)} style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 22, fontFamily: F.bold, color: '#0078ff', lineHeight: 24 }}>−</Text>
              </Pressable>
              <Text style={{ flex: 1, fontSize: 22, fontFamily: F.bold, color: '#111827', textAlign: 'center' }}>
                {String(m).padStart(2, '0')}
              </Text>
              <Pressable onPress={() => setM((v) => (v + 5) % 60)} style={{ paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 22, fontFamily: F.bold, color: '#0078ff', lineHeight: 24 }}>+</Text>
              </Pressable>
            </View>

            {/* AM/PM */}
            <View style={{ gap: 6 }}>
              {(['AM', 'PM'] as const).map((p) => (
                <Pressable
                  key={p}
                  onPress={() => setAp(p)}
                  style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: ap === p ? '#0078ff' : '#F3F4F6' }}
                >
                  <Text style={{ fontSize: 14, fontFamily: F.bold, color: ap === p ? '#fff' : '#6B7280' }}>{p}</Text>
                </Pressable>
              ))}
            </View>
          </View>

          <Pressable
            onPress={() => { onConfirm(h, m, ap); onClose(); }}
            style={{ backgroundColor: '#0078ff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>
              Confirm — {String(h === 0 ? 12 : h).padStart(2, '0')}:{String(m).padStart(2, '0')} {ap}
            </Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Field label ──────────────────────────────────────────────────────────────
function Label({ text, required }: { text: string; required?: boolean }) {
  return (
    <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#111827', marginBottom: 8 }}>
      {text}
      {required && <Text style={{ color: '#DC2626' }}> *</Text>}
    </Text>
  );
}

// ─── Main screen ──────────────────────────────────────────────────────────────
export default function AddReminderScreen() {
  const router = useRouter();

  // Form state
  const [title, setTitle]                   = useState('');
  const [type, setType]                     = useState<ReminderType>('Hearing');
  const [date, setDate]                     = useState<Date | null>(null);
  const [hour, setHour]                     = useState(9);
  const [minute, setMinute]                 = useState(0);
  const [ampm, setAmpm]                     = useState<'AM' | 'PM'>('AM');
  const [location, setLocation]             = useState('');
  const [description, setDescription]       = useState('');
  const [reminderBefore, setReminderBefore] = useState<ReminderBefore>('At event time');
  const [repeat, setRepeat]                 = useState<RepeatOption>('Does not repeat');
  const [priority, setPriority]             = useState<Priority>('Medium');
  const [error, setError]                   = useState('');
  const [saving, setSaving]                 = useState(false);

  // Picker visibility
  const [showDate, setShowDate]             = useState(false);
  const [showTime, setShowTime]             = useState(false);
  const [showReminderBefore, setShowReminderBefore] = useState(false);
  const [showRepeat, setShowRepeat]         = useState(false);
  // Track whether user has explicitly picked a time
  const [timePicked, setTimePicked]         = useState(false);

  // ── Advance minutes map ─────────────────────────────────────────────────────
  const ADV_MAP: Record<ReminderBefore, number> = {
    'At event time':     0,
    '5 minutes before':  5,
    '10 minutes before': 10,
    '15 minutes before': 15,
    '30 minutes before': 30,
    '1 hour before':     60,
    '2 hours before':    120,
    '1 day before':      1440,
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  const timeLabel = (): string => {
    if (!timePicked) return 'Select time';
    return `${String(hour === 0 ? 12 : hour).padStart(2, '0')}:${String(minute).padStart(2, '0')} ${ampm}`;
  };

  const hasTime = timePicked;

  // Task time as a Date (no advance subtraction)
  const buildTaskTime = (): Date | null => {
    if (!date || !timePicked) return null;
    let h = hour % 12;
    if (ampm === 'PM') h += 12;
    const d = new Date(date);
    d.setHours(h, minute, 0, 0);
    return d;
  };

  // Fire time = task time minus advance (0 advance = at event time)
  const buildFireTime = (): Date | null => {
    const taskTime = buildTaskTime();
    if (!taskTime) return null;
    const advanceMs = ADV_MAP[reminderBefore] * 60 * 1000;
    return advanceMs === 0 ? new Date(taskTime) : new Date(taskTime.getTime() - advanceMs);
  };

  // Live preview label shown below Reminder Before selector
  const firePreviewLabel = useMemo((): string | null => {
    const fireAt = buildFireTime();
    if (!fireAt || !date || !timePicked) return null;
    const fH24 = fireAt.getHours();
    const fM   = String(fireAt.getMinutes()).padStart(2, '0');
    const fAp  = fH24 >= 12 ? 'PM' : 'AM';
    const fH12 = fH24 % 12 === 0 ? 12 : fH24 % 12;
    const dateStr = dayjs(fireAt).format('DD MMM YYYY');
    return `🔔 You'll be notified at ${String(fH12).padStart(2, '0')}:${fM} ${fAp} on ${dateStr}`;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, timePicked, hour, minute, ampm, reminderBefore]);

  // ── Schedule repeat notifications (up to 10 occurrences) ──────────────────
  const scheduleRepeatNotifications = async (
    taskTitle: string,
    firstFireAt: Date,
  ): Promise<void> => {
    const OCCURRENCES = 10;
    const repeatMs: Record<RepeatOption, number | null> = {
      'Does not repeat': null,
      'Daily':   1000 * 60 * 60 * 24,
      'Weekly':  1000 * 60 * 60 * 24 * 7,
      'Monthly': 1000 * 60 * 60 * 24 * 30,
      'Yearly':  1000 * 60 * 60 * 24 * 365,
    };
    const ms = repeatMs[repeat];
    if (!ms) return; // "Does not repeat" — nothing extra to schedule

    for (let i = 1; i < OCCURRENCES; i++) {
      const nextFireAt = new Date(firstFireAt.getTime() + ms * i);
      if (nextFireAt <= new Date()) continue;
      try {
        const trigger: Notifications.NotificationTriggerInput =
          Platform.OS === 'android'
            ? { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextFireAt, channelId: TASK_CHANNEL_ID }
            : { type: Notifications.SchedulableTriggerInputTypes.DATE, date: nextFireAt };
        await Notifications.scheduleNotificationAsync({
          content: {
            title: '⚖️ Reminder',
            body: taskTitle,
            sound: 'default',
            ...(Platform.OS === 'android' ? { channelId: TASK_CHANNEL_ID } : {}),
          },
          trigger,
        });
      } catch { /* skip failed occurrences silently */ }
    }
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    if (!date)         { setError('Please select a date.'); return; }

    const now     = new Date();
    const today   = dayjs().startOf('day');
    const taskDay = dayjs(date).startOf('day');

    // Block past date
    if (taskDay.isBefore(today)) {
      setError('Date cannot be in the past.'); return;
    }

    // Block past time when date is today
    if (timePicked && taskDay.isSame(today)) {
      let h24 = hour % 12;
      if (ampm === 'PM') h24 += 12;
      const selectedTime = new Date(now);
      selectedTime.setHours(h24, minute, 0, 0);
      if (selectedTime <= now) {
        setError('Selected time has already passed. Please choose a future time.'); return;
      }
    }

    setSaving(true);

    const fireAt = buildFireTime();

    // Schedule the first (or only) notification
    let notifId: string | undefined;
    if (fireAt && fireAt > new Date()) {
      const id = await scheduleTaskReminder(title.trim(), fireAt);
      notifId = id ?? undefined;
      // Schedule repeat occurrences if needed
      if (repeat !== 'Does not repeat') {
        await scheduleRepeatNotifications(title.trim(), fireAt);
      }
    }

    // Smart date label: "Today" | "Tomorrow" | "22 Jun 2024"
    const diffDays = taskDay.diff(today, 'day');
    const smartLabel = diffDays === 0 ? 'Today' : diffDays === 1 ? 'Tomorrow' : dayjs(date).format('DD MMM YYYY');

    // Write to task store so reminders / calendar screens pick it up
    setStoreTasks([
      ...getStoreTasks(),
      {
        id: Date.now().toString(),
        title: title.trim(),
        category: type,
        priority: priority.toLowerCase() as 'high' | 'medium' | 'low',
        done: false,
        dueLabel: smartLabel,
        rawDate: date.toISOString(),
        reminderTime: timePicked ? timeLabel() : undefined,
        location: location.trim() || undefined,
        description: description.trim() || undefined,
        repeat: repeat !== 'Does not repeat' ? repeat : undefined,
        reminderAt: fireAt,
        reminderAdvance: ADV_MAP[reminderBefore],
        notificationId: notifId,
      },
    ]);

    setSaving(false);
    router.back();
  };

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top', 'bottom']}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">

        {/* ── Header ── */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 14,
          borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
        }}>
          <Pressable onPress={() => router.back()} hitSlop={10} style={{ marginRight: 12 }}>
            <ArrowLeft size={22} color="#111827" strokeWidth={2.2} />
          </Pressable>
          <Text style={{ flex: 1, fontSize: 18, fontFamily: F.bold, color: '#111827', textAlign: 'center', marginRight: 34 }}>
            Add Reminder
          </Text>
        </View>

        <ScrollView
          contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 20, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >

          {/* ── Banner ── */}
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14, marginBottom: 24 }}>
            <View style={{
              width: 52, height: 52, borderRadius: 26,
              backgroundColor: '#EEF4FF',
              alignItems: 'center', justifyContent: 'center', flexShrink: 0,
            }}>
              <CalendarDays size={26} color="#0078ff" strokeWidth={1.8} />
            </View>
            <Text style={{ flex: 1, fontSize: 14, fontFamily: F.bold, color: '#6B7280', lineHeight: 20 }}>
              Create a reminder for important{'\n'}hearings, tasks, meetings or deadlines.
            </Text>
          </View>

          {/* ── Title ── */}
          <View style={{ marginBottom: 20 }}>
            <Label text="Title" required />
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              borderWidth: 1.5, borderColor: error && !title ? '#DC2626' : '#E5E7EB',
              borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#fff',
            }}>
              <ClipboardEdit size={18} color="#9CA3AF" strokeWidth={1.8} />
              <TextInput
                value={title}
                onChangeText={(v) => { setTitle(v); setError(''); }}
                placeholder="Enter reminder title"
                placeholderTextColor="#C0C0C0"
                style={{ flex: 1, fontSize: 15, fontFamily: F.bold, color: '#111827', paddingVertical: 14, outlineWidth: 0 }}
                returnKeyType="next"
              />
            </View>
            {error && !title ? <Text style={{ fontSize: 12, color: '#DC2626', marginTop: 4, fontFamily: F.bold }}>{error}</Text> : null}
          </View>

          {/* ── Type ── */}
          <View style={{ marginBottom: 20 }}>
            <Label text="Type" required />
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
              {TYPES.map(({ key, icon: Icon, color }) => {
                const active = type === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setType(key)}
                    style={{
                      alignItems: 'center', justifyContent: 'center', gap: 6,
                      paddingVertical: 10, paddingHorizontal: 14,
                      borderRadius: 10, minWidth: 68,
                      borderWidth: active ? 1.5 : 1,
                      borderColor: active ? '#0078ff' : '#E5E7EB',
                      backgroundColor: active ? '#EEF4FF' : '#FAFAFA',
                    }}
                  >
                    <Icon size={22} color={color} strokeWidth={1.8} />
                    <Text style={{ fontSize: 12, fontFamily: F.bold, color: active ? '#0078ff' : '#374151' }}>
                      {key}
                    </Text>
                  </Pressable>
                );
              })}
            </ScrollView>
          </View>

          {/* ── Date + Time row ── */}
          <View style={{ flexDirection: 'row', gap: 12, marginBottom: 20 }}>
            {/* Date */}
            <View style={{ flex: 1 }}>
              <Label text="Date" required />
              <Pressable
                onPress={() => setShowDate(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  borderWidth: 1.5, borderColor: error && !date ? '#DC2626' : '#E5E7EB',
                  borderRadius: 12, paddingHorizontal: 10, paddingVertical: 13,
                  backgroundColor: '#fff',
                }}
              >
                <CalendarDays size={16} color="#6B7280" strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: F.bold, color: date ? '#111827' : '#C0C0C0' }} numberOfLines={1}>
                  {date ? dayjs(date).format('DD MMM YYYY') : 'Select date'}
                </Text>
                <ChevronDown size={14} color="#9CA3AF" strokeWidth={2} />
              </Pressable>
            </View>

            {/* Time */}
            <View style={{ flex: 1 }}>
              <Label text="Time" required />
              <Pressable
                onPress={() => setShowTime(true)}
                style={{
                  flexDirection: 'row', alignItems: 'center', gap: 8,
                  borderWidth: 1.5, borderColor: '#E5E7EB',
                  borderRadius: 12, paddingHorizontal: 10, paddingVertical: 13,
                  backgroundColor: '#fff',
                }}
              >
                <Clock size={16} color="#6B7280" strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 13, fontFamily: F.bold, color: hasTime ? '#111827' : '#C0C0C0' }} numberOfLines={1}>
                  {timeLabel()}
                </Text>
                <ChevronDown size={14} color="#9CA3AF" strokeWidth={2} />
              </Pressable>
            </View>
          </View>

          {/* ── Location ── */}
          <View style={{ marginBottom: 20 }}>
            <Label text="Location / Court / Venue" />
            <View style={{
              flexDirection: 'row', alignItems: 'center', gap: 10,
              borderWidth: 1.5, borderColor: '#E5E7EB',
              borderRadius: 12, paddingHorizontal: 12, backgroundColor: '#fff',
            }}>
              <MapPin size={18} color="#9CA3AF" strokeWidth={1.8} />
              <TextInput
                value={location}
                onChangeText={setLocation}
                placeholder="Enter location or court name"
                placeholderTextColor="#C0C0C0"
                style={{ flex: 1, fontSize: 15, fontFamily: F.bold, color: '#111827', paddingVertical: 14, outlineWidth: 0 }}
              />
            </View>
          </View>

          {/* ── Description ── */}
          <View style={{ marginBottom: 20 }}>
            <Label text="Description" />
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#9CA3AF', marginTop: -6, marginBottom: 8 }}>(Optional)</Text>
            <View style={{
              flexDirection: 'row', alignItems: 'flex-start', gap: 10,
              borderWidth: 1.5, borderColor: '#E5E7EB',
              borderRadius: 12, paddingHorizontal: 12, paddingTop: 12, paddingBottom: 8,
              backgroundColor: '#fff',
            }}>
              <AlignLeft size={18} color="#9CA3AF" strokeWidth={1.8} style={{ marginTop: 2 }} />
              <View style={{ flex: 1 }}>
                <TextInput
                  value={description}
                  onChangeText={(v) => setDescription(v.slice(0, 250))}
                  placeholder="Add details about this reminder..."
                  placeholderTextColor="#C0C0C0"
                  multiline
                  style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', minHeight: 80, textAlignVertical: 'top', outlineWidth: 0 }}
                />
                <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#C0C0C0', textAlign: 'right', marginTop: 4 }}>
                  {description.length}/250
                </Text>
              </View>
            </View>
          </View>

          {/* ── Reminder Before ── */}
          <View style={{ marginBottom: 20 }}>
            <Label text="Reminder Before" />
            <Pressable
              onPress={() => setShowReminderBefore(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                borderWidth: 1.5, borderColor: '#E5E7EB',
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
                backgroundColor: '#fff',
              }}
            >
              <Bell size={18} color="#6B7280" strokeWidth={1.8} />
              <Text style={{ flex: 1, fontSize: 15, fontFamily: F.bold, color: '#111827' }}>
                {reminderBefore}
              </Text>
              <ChevronDown size={16} color="#9CA3AF" strokeWidth={2} />
            </Pressable>
            {/* Live fire-time preview */}
            {firePreviewLabel ? (
              <View style={{
                marginTop: 8, paddingHorizontal: 12, paddingVertical: 10,
                backgroundColor: '#EEF4FF', borderRadius: 10,
                flexDirection: 'row', alignItems: 'center', gap: 8,
              }}>
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff', flex: 1 }}>
                  {firePreviewLabel}
                </Text>
              </View>
            ) : null}
          </View>

          {/* ── Repeat ── */}
          <View style={{ marginBottom: 20 }}>
            <Label text="Repeat" />
            <Pressable
              onPress={() => setShowRepeat(true)}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 10,
                borderWidth: 1.5, borderColor: '#E5E7EB',
                borderRadius: 12, paddingHorizontal: 14, paddingVertical: 14,
                backgroundColor: '#fff',
              }}
            >
              <RefreshCw size={18} color="#6B7280" strokeWidth={1.8} />
              <Text style={{ flex: 1, fontSize: 15, fontFamily: F.bold, color: repeat !== 'Does not repeat' ? '#0078ff' : '#111827' }}>
                {repeat}
              </Text>
              {repeat !== 'Does not repeat' && (
                <View style={{ backgroundColor: '#0078ff', borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2 }}>
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#fff' }}>ON</Text>
                </View>
              )}
              <ChevronDown size={16} color="#9CA3AF" strokeWidth={2} />
            </Pressable>
          </View>

          {/* ── Priority ── */}
          <View style={{ marginBottom: 28 }}>
            <Label text="Priority" />
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {PRIORITY_CONFIG.map(({ key, dot }) => {
                const active = priority === key;
                return (
                  <Pressable
                    key={key}
                    onPress={() => setPriority(key)}
                    style={{
                      flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                      paddingVertical: 13,
                      borderRadius: 10, borderWidth: active ? 1.5 : 1,
                      borderColor: active ? '#0078ff' : '#E5E7EB',
                      backgroundColor: '#fff',
                    }}
                  >
                    <View style={{ width: 12, height: 12, borderRadius: 6, backgroundColor: dot }} />
                    <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#111827' }}>{key}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>

          {/* Global error */}
          {error ? <Text style={{ fontSize: 12, color: '#DC2626', marginBottom: 12, fontFamily: F.bold }}>{error}</Text> : null}

          {/* ── Save button ── */}
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 10,
              backgroundColor: '#0078ff', borderRadius: 14,
              paddingVertical: 17, opacity: saving ? 0.7 : 1,
            }}
          >
            <CheckCircle size={20} color="#fff" strokeWidth={2.2} />
            <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#fff', letterSpacing: 0.3 }}>
              {saving ? 'Saving…' : 'Save Reminder'}
            </Text>
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* ── Pickers ─────────────────────────────────────────────────────── */}
      <DateSheet
        visible={showDate}
        selected={date}
        onSelect={setDate}
        onClose={() => setShowDate(false)}
      />

      <TimeSheet
        visible={showTime}
        hour={hour} minute={minute} ampm={ampm}
        onConfirm={(h, m, ap) => { setHour(h); setMinute(m); setAmpm(ap); setTimePicked(true); }}
        onClose={() => setShowTime(false)}
      />

      <DropdownSheet
        visible={showReminderBefore}
        options={REMINDER_BEFORE_OPTIONS}
        selected={reminderBefore}
        onSelect={setReminderBefore}
        onClose={() => setShowReminderBefore(false)}
      />

      <DropdownSheet
        visible={showRepeat}
        options={REPEAT_OPTIONS}
        selected={repeat}
        onSelect={setRepeat}
        onClose={() => setShowRepeat(false)}
      />
    </SafeAreaView>
  );
}
