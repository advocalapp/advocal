import { useState, useCallback } from 'react';
import { View, Text, Pressable, TextInput, FlatList, Modal, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import DateTimePicker from 'react-native-ui-datepicker';
import dayjs from 'dayjs';
import {
  Search, SlidersHorizontal, Bell, BellOff,
  Building2, Users, CheckSquare, CalendarX2, FileText,
  CheckCircle2, Trash2, X, MapPin, AlignLeft, RefreshCw, Flag, Pencil,
  CalendarDays, Clock, ChevronDown,
} from 'lucide-react-native';
import { getStoreTasks, setStoreTasks, subscribeStore, StoredTask } from '@/lib/taskStore';
import { CALENDAR_STYLES } from '@/lib/calendarStyles';
import { F } from '@/lib/fonts';
import { scheduleTaskReminder, cancelTaskReminder, TASK_CHANNEL_ID } from '@/lib/notifications';
import {
  getReminders as fetchRemindersFromDB,
  updateReminder as updateReminderInDB,
  deleteReminder as deleteReminderFromDB,
} from '@/db/api';

// ─── Category config (icon + color) ──────────────────────────────────────────
type ReminderType = 'Hearing' | 'Meeting' | 'Task' | 'Deadline' | 'Other';

const TYPE_CONFIG: Record<ReminderType, { icon: React.ComponentType<any>; color: string; bg: string }> = {
  Hearing:  { icon: Building2,   color: '#0078ff', bg: '#0078ff' },
  Meeting:  { icon: Users,       color: '#16A34A', bg: '#16A34A' },
  Task:     { icon: CheckSquare, color: '#D97706', bg: '#D97706' },
  Deadline: { icon: CalendarX2,  color: '#DC2626', bg: '#DC2626' },
  Other:    { icon: FileText,    color: '#0078ff', bg: '#0078ff' },
};

function getConfig(category: string) {
  return TYPE_CONFIG[(category as ReminderType)] ?? TYPE_CONFIG.Other;
}

// ─── Detail bottom sheet ──────────────────────────────────────────────────────
const PRIORITY_STYLE: Record<string, { label: string; color: string; bg: string }> = {
  high:   { label: 'High',   color: '#DC2626', bg: '#FEE2E2' },
  medium: { label: 'Medium', color: '#D97706', bg: '#FEF3C7' },
  low:    { label: 'Low',    color: '#16A34A', bg: '#DCFCE7' },
};

/** Single grey cell for the 2×2 grid — no icon, just label + bold value */
function DetailCell({ label, value }: { label: string; value: string }) {
  return (
    <View style={{
      flex: 1, backgroundColor: '#F3F4F6',
      borderRadius: 14, padding: 14, gap: 4,
      minWidth: 0,
    }}>
      <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.3, textTransform: 'uppercase' }}>{label}</Text>
      <Text style={{ fontSize: 14, fontFamily: F.extraBold, color: '#111827', lineHeight: 20 }}>{value}</Text>
    </View>
  );
}

function ReminderDetailSheet({
  item,
  onClose,
  onComplete,
  onDelete,
  onEdit,
}: {
  item: StoredTask;
  onClose: () => void;
  onComplete: () => void;
  onDelete: () => void;
  onEdit: () => void;
}) {
  const cfg      = getConfig(item.category);
  const Icon     = cfg.icon;
  const priStyle = PRIORITY_STYLE[item.priority] ?? PRIORITY_STYLE.medium;

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={() => {}} style={{ backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}>
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 14, marginBottom: 4 }} />

          {/* Close */}
          <Pressable onPress={onClose} hitSlop={10} style={{ position: 'absolute', top: 20, right: 20 }}>
            <X size={20} color="#9CA3AF" strokeWidth={2} />
          </Pressable>

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
          >
            {/* ── Header card ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 12, flexDirection: 'row', alignItems: 'center', gap: 14, boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.06)' }] } as any}>
              <View style={{ width: 54, height: 54, borderRadius: 16, backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Icon size={27} color="#fff" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 5 }}>
                  <View style={{ backgroundColor: priStyle.bg, borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                    <Text style={{ fontSize: 10, fontFamily: F.bold, color: priStyle.color }}>{priStyle.label} Priority</Text>
                  </View>
                  {item.done && (
                    <View style={{ backgroundColor: '#DCFCE7', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#16A34A' }}>✓ Complete</Text>
                    </View>
                  )}
                </View>
                <Text style={{ fontSize: 17, fontFamily: F.extraBold, color: '#111827', lineHeight: 22 }}>{item.title}</Text>
              </View>
            </View>

            {/* ── 2×2 grid row 1: Date + Time ── */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <DetailCell label="Date" value={item.dueLabel || 'Not set'} />
              <DetailCell label="Time" value={item.reminderTime || 'Not set'} />
            </View>

            {/* ── 2×2 grid row 2: Priority + Category ── */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <DetailCell label="Priority" value={priStyle.label} />
              <DetailCell label="Category" value={item.category} />
            </View>

            {/* ── 2×2 grid row 3: Location + Repeat ── */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 10 }}>
              <DetailCell label="Location / Court" value={item.location || 'Not specified'} />
              <DetailCell label="Repeat" value={item.repeat || 'Does not repeat'} />
            </View>

            {/* ── Description full-width cell (if any) ── */}
            {item.description ? (
              <View style={{ backgroundColor: '#F3F4F6', borderRadius: 14, padding: 14, marginBottom: 10, gap: 4 }}>
                <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.3, textTransform: 'uppercase' }}>Description</Text>
                <Text style={{ fontSize: 14, fontFamily: F.semiBold, color: '#111827', lineHeight: 21 }}>{item.description}</Text>
              </View>
            ) : null}

            {/* ── 3-button row: icon before text, full width each ── */}
            <View style={{ flexDirection: 'row', gap: 10, marginTop: 8 }}>
              {/* Complete */}
              <Pressable
                onPress={item.done ? undefined : onComplete}
                style={{
                  flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7,
                  paddingVertical: 14, borderRadius: 14,
                  backgroundColor: item.done ? '#DCFCE7' : '#0078ff',
                  opacity: item.done ? 0.75 : 1,
                }}
              >
                <CheckCircle2 size={17} color={item.done ? '#16A34A' : '#fff'} strokeWidth={2.2} />
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: item.done ? '#16A34A' : '#fff' }}>
                  {item.done ? 'Done' : 'Complete'}
                </Text>
              </Pressable>

              {/* Edit — grey with pencil icon */}
              <Pressable
                onPress={onEdit}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 14, backgroundColor: '#E5E7EB' }}
              >
                <Pencil size={17} color="#374151" strokeWidth={2.2} />
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#374151' }}>Edit</Text>
              </Pressable>

              {/* Delete */}
              <Pressable
                onPress={onDelete}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 7, paddingVertical: 14, borderRadius: 14, backgroundColor: '#FEE2E2' }}
              >
                <Trash2 size={17} color="#DC2626" strokeWidth={2.2} />
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#DC2626' }}>Delete</Text>
              </Pressable>
            </View>
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ─── Edit Reminder Sheet ──────────────────────────────────────────────────────
type EditReminderType = 'Hearing' | 'Meeting' | 'Task' | 'Deadline' | 'Other';
type EditPriority    = 'Low' | 'Medium' | 'High';
type EditRepeat      = 'Does not repeat' | 'Daily' | 'Weekly' | 'Monthly' | 'Yearly';
type EditReminderBefore = 'At event time' | '5 minutes before' | '10 minutes before' | '15 minutes before' | '30 minutes before' | '1 hour before' | '2 hours before' | '1 day before';

const EDIT_ADV_MAP: Record<EditReminderBefore, number> = {
  'At event time':     0,
  '5 minutes before':  5,
  '10 minutes before': 10,
  '15 minutes before': 15,
  '30 minutes before': 30,
  '1 hour before':     60,
  '2 hours before':    120,
  '1 day before':      1440,
};

const EDIT_REMINDER_BEFORE_OPTIONS: EditReminderBefore[] = [
  'At event time', '5 minutes before', '10 minutes before', '15 minutes before',
  '30 minutes before', '1 hour before', '2 hours before', '1 day before',
];

function advanceToLabel(minutes?: number): EditReminderBefore {
  switch (minutes) {
    case 5:    return '5 minutes before';
    case 10:   return '10 minutes before';
    case 15:   return '15 minutes before';
    case 30:   return '30 minutes before';
    case 60:   return '1 hour before';
    case 120:  return '2 hours before';
    case 1440: return '1 day before';
    default:   return 'At event time';
  }
}

const EDIT_TYPES: { key: EditReminderType; icon: React.ComponentType<any> }[] = [
  { key: 'Hearing',  icon: Building2 },
  { key: 'Meeting',  icon: Users },
  { key: 'Task',     icon: CheckSquare },
  { key: 'Deadline', icon: CalendarX2 },
  { key: 'Other',    icon: FileText },
];
const EDIT_PRIORITIES: EditPriority[] = ['Low', 'Medium', 'High'];
const EDIT_REPEATS: EditRepeat[]      = ['Does not repeat', 'Daily', 'Weekly', 'Monthly', 'Yearly'];
const PRI_DOT: Record<EditPriority, string> = { Low: '#22C55E', Medium: '#EAB308', High: '#EF4444' };

/** Parse "09:30 AM" → { hour, minute, ampm } */
function parseTimeStr(t?: string): { hour: number; minute: number; ampm: 'AM' | 'PM' } {
  if (!t) return { hour: 9, minute: 0, ampm: 'AM' };
  const m = t.match(/(\d+):(\d+)\s*(AM|PM)/i);
  if (!m) return { hour: 9, minute: 0, ampm: 'AM' };
  return { hour: parseInt(m[1], 10), minute: parseInt(m[2], 10), ampm: m[3].toUpperCase() as 'AM' | 'PM' };
}

function EditReminderSheet({
  item,
  onClose,
  onSave,
}: {
  item: StoredTask;
  onClose: () => void;
  onSave: (updated: StoredTask) => void;
}) {
  const parsed   = parseTimeStr(item.reminderTime);
  const initDate = item.rawDate ? new Date(item.rawDate) : new Date();

  const [title,       setTitle]       = useState(item.title);
  const [category,    setCategory]    = useState<EditReminderType>((item.category as EditReminderType) ?? 'Hearing');
  const [priority,    setPriority]    = useState<EditPriority>(
    item.priority === 'high' ? 'High' : item.priority === 'low' ? 'Low' : 'Medium',
  );
  const [repeat,          setRepeat]          = useState<EditRepeat>((item.repeat as EditRepeat) ?? 'Does not repeat');
  const [reminderBefore,  setReminderBefore]  = useState<EditReminderBefore>(advanceToLabel(item.reminderAdvance));
  const [location,        setLocation]        = useState(item.location ?? '');
  const [description,     setDescription]     = useState(item.description ?? '');
  const [date,            setDate]            = useState<Date>(initDate);
  const [hour,            setHour]            = useState(parsed.hour);
  const [minute,          setMinute]          = useState(parsed.minute);
  const [ampm,            setAmpm]            = useState<'AM' | 'PM'>(parsed.ampm);
  const [timePicked,      setTimePicked]      = useState(!!item.reminderTime);
  const [timeError,       setTimeError]       = useState('');

  const [showDate,          setShowDate]          = useState(false);
  const [showTime,          setShowTime]          = useState(false);
  const [showRepeat,        setShowRepeat]        = useState(false);
  const [showReminderSheet, setShowReminderSheet] = useState(false);
  const [error,             setError]             = useState('');

  /** Convert current hour/minute/ampm → h24 as Date on `d` */
  const buildTimeDate = (d: Date, h: number, m: number, ap: 'AM' | 'PM'): Date => {
    let h24 = h % 12;
    if (ap === 'PM') h24 += 12;
    const result = new Date(d);
    result.setHours(h24, m, 0, 0);
    return result;
  };

  const isDateToday = (d: Date) => dayjs(d).startOf('day').isSame(dayjs().startOf('day'));

  /** Returns error string if time is in the past for today, else '' */
  const checkTimePast = (h: number, m: number, ap: 'AM' | 'PM', d: Date): string => {
    if (!isDateToday(d)) return '';
    const selected = buildTimeDate(new Date(), h, m, ap);
    return selected <= new Date() ? 'That time has already passed. Pick a future time.' : '';
  };

  const timeLabel = (h: number, m: number, ap: 'AM' | 'PM') =>
    `${String(h === 0 ? 12 : h).padStart(2, '0')}:${String(m).padStart(2, '0')} ${ap}`;

  const smartLabel = (d: Date) => {
    const today = dayjs().startOf('day');
    const diff  = dayjs(d).startOf('day').diff(today, 'day');
    return diff === 0 ? 'Today' : diff === 1 ? 'Tomorrow' : dayjs(d).format('DD MMM YYYY');
  };

  const handleSave = async () => {
    if (!title.trim()) { setError('Title is required.'); return; }
    const today = dayjs().startOf('day');
    if (dayjs(date).startOf('day').isBefore(today)) {
      setError('Date cannot be in the past.'); return;
    }
    if (timePicked) {
      const tErr = checkTimePast(hour, minute, ampm, date);
      if (tErr) { setError(tErr); return; }
    }
    setError('');

    // Build fire time: task time minus advance
    let newFireAt: Date | null = null;
    if (timePicked) {
      const taskTime = buildTimeDate(date, hour, minute, ampm);
      const advanceMs = EDIT_ADV_MAP[reminderBefore] * 60 * 1000;
      newFireAt = advanceMs === 0 ? new Date(taskTime) : new Date(taskTime.getTime() - advanceMs);
      // If fire time is in the past, clear it
      if (newFireAt <= new Date()) newFireAt = null;
    }

    // Cancel old notification before scheduling new one
    if (item.notificationId) {
      await cancelTaskReminder(item.notificationId);
    }

    // Schedule new notification
    let newNotifId: string | undefined;
    if (newFireAt) {
      const id = await scheduleTaskReminder(title.trim(), newFireAt);
      newNotifId = id ?? undefined;
    }

    onSave({
      ...item,
      title:          title.trim(),
      category,
      priority:       priority.toLowerCase() as 'high' | 'medium' | 'low',
      dueLabel:       smartLabel(date),
      rawDate:        date.toISOString(),
      reminderTime:   timePicked ? timeLabel(hour, minute, ampm) : undefined,
      location:       location.trim() || undefined,
      description:    description.trim() || undefined,
      repeat:         repeat !== 'Does not repeat' ? repeat : undefined,
      reminderAt:     newFireAt,
      reminderAdvance: EDIT_ADV_MAP[reminderBefore],
      notificationId: newNotifId,
    });
  };

  /** Confirm time — block if past */
  const confirmTime = () => {
    const err = checkTimePast(hour, minute, ampm, date);
    if (err) { setTimeError(err); return; }
    setTimeError('');
    setTimePicked(true);
    setShowTime(false);
  };

  return (
    <Modal transparent animationType="slide" visible onRequestClose={onClose}>
      {/* Full-screen backdrop — tapping outside closes */}
      <KeyboardAvoidingView
        style={{ flex: 1, justifyContent: 'flex-end', backgroundColor: 'rgba(0,0,0,0.5)' }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
      >
        <Pressable style={{ flex: 1 }} onPress={onClose} />

        {/* Sheet */}
        <Pressable
          onPress={() => {}}
          style={{ backgroundColor: '#F9FAFB', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '92%' }}
        >
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#D1D5DB', alignSelf: 'center', marginTop: 14, marginBottom: 4 }} />

          {/* Header row */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingBottom: 12 }}>
            <Pressable onPress={onClose} hitSlop={10}>
              <X size={20} color="#9CA3AF" strokeWidth={2} />
            </Pressable>
            <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontFamily: F.extraBold, color: '#111827' }}>Edit Reminder</Text>
            <Pressable onPress={handleSave} style={{ backgroundColor: '#0078ff', borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 }}>
              <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#fff' }}>Save</Text>
            </Pressable>
          </View>

          {/* Inline error */}
          {error ? (
            <View style={{ marginHorizontal: 16, marginBottom: 8, backgroundColor: '#FEE2E2', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8 }}>
              <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#DC2626' }}>{error}</Text>
            </View>
          ) : null}

          <ScrollView
            contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {/* Title */}
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#6B7280', marginBottom: 6, marginTop: 4 }}>TITLE *</Text>
            <TextInput
              value={title} onChangeText={(v) => { setTitle(v); setError(''); }}
              placeholder="Reminder title" placeholderTextColor="#9CA3AF"
              style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 13, fontSize: 15, fontFamily: F.bold, color: '#111827', marginBottom: 14 }}
            />

            {/* Category chips */}
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#6B7280', marginBottom: 8 }}>CATEGORY</Text>
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginBottom: 14 }}>
              {EDIT_TYPES.map(({ key, icon: Icon }) => {
                const active = category === key;
                return (
                  <Pressable key={key} onPress={() => setCategory(key)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, marginRight: 8, backgroundColor: active ? '#0078ff' : '#F3F4F6' }}
                  >
                    <Icon size={14} color={active ? '#fff' : '#6B7280'} strokeWidth={2} />
                    <Text style={{ fontSize: 13, fontFamily: F.bold, color: active ? '#fff' : '#374151' }}>{key}</Text>
                  </Pressable>
                );
              })}
            </ScrollView>

            {/* Date + Time row */}
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              <Pressable onPress={() => setShowDate(true)}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 12, paddingVertical: 13 }}
              >
                <CalendarDays size={16} color="#0078ff" strokeWidth={2} />
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#111827' }}>{dayjs(date).format('DD MMM YYYY')}</Text>
              </Pressable>
              <Pressable onPress={() => { setTimeError(''); setShowTime(true); }}
                style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: timePicked ? '#E5E7EB' : '#E5E7EB', paddingHorizontal: 12, paddingVertical: 13 }}
              >
                <Clock size={16} color="#0078ff" strokeWidth={2} />
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: timePicked ? '#111827' : '#9CA3AF' }}>
                  {timePicked ? timeLabel(hour, minute, ampm) : 'Set time'}
                </Text>
              </Pressable>
            </View>

            {/* Reminder Before */}
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#6B7280', marginBottom: 6 }}>REMIND ME</Text>
            <Pressable onPress={() => setShowReminderSheet(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Bell size={16} color="#0078ff" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontFamily: F.bold, color: reminderBefore !== 'At event time' ? '#0078ff' : '#111827' }}>{reminderBefore}</Text>
              </View>
              <ChevronDown size={16} color="#9CA3AF" strokeWidth={2} />
            </Pressable>

            {/* Priority */}
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#6B7280', marginBottom: 8 }}>PRIORITY</Text>
            <View style={{ flexDirection: 'row', gap: 10, marginBottom: 14 }}>
              {EDIT_PRIORITIES.map((p) => (
                <Pressable key={p} onPress={() => setPriority(p)}
                  style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, borderRadius: 12, paddingVertical: 11, backgroundColor: priority === p ? '#0078ff' : '#F3F4F6' }}
                >
                  <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: priority === p ? '#fff' : PRI_DOT[p] }} />
                  <Text style={{ fontSize: 13, fontFamily: F.bold, color: priority === p ? '#fff' : '#374151' }}>{p}</Text>
                </Pressable>
              ))}
            </View>

            {/* Repeat */}
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#6B7280', marginBottom: 6 }}>REPEAT</Text>
            <Pressable onPress={() => setShowRepeat(true)}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingVertical: 13, marginBottom: 14 }}
            >
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <RefreshCw size={16} color="#0078ff" strokeWidth={2} />
                <Text style={{ fontSize: 14, fontFamily: F.bold, color: repeat !== 'Does not repeat' ? '#0078ff' : '#111827' }}>{repeat}</Text>
              </View>
              <ChevronDown size={16} color="#9CA3AF" strokeWidth={2} />
            </Pressable>

            {/* Location */}
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#6B7280', marginBottom: 6 }}>LOCATION / COURT</Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, marginBottom: 14 }}>
              <MapPin size={16} color="#9CA3AF" strokeWidth={2} />
              <TextInput value={location} onChangeText={setLocation} placeholder="Enter location or court" placeholderTextColor="#9CA3AF"
                style={{ flex: 1, fontSize: 14, fontFamily: F.bold, color: '#111827', paddingVertical: 13 }} />
            </View>

            {/* Description */}
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#6B7280', marginBottom: 6 }}>DESCRIPTION</Text>
            <View style={{ backgroundColor: '#fff', borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', paddingHorizontal: 14, paddingTop: 10, paddingBottom: 10, marginBottom: 16 }}>
              <TextInput value={description} onChangeText={setDescription} placeholder="Add notes..." placeholderTextColor="#9CA3AF"
                multiline numberOfLines={3}
                style={{ fontSize: 14, fontFamily: F.regular, color: '#111827', lineHeight: 20, minHeight: 60 }} />
            </View>

            {/* Save button */}
            <Pressable onPress={handleSave}
              style={{ backgroundColor: '#0078ff', borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginBottom: 8 }}
            >
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>Save Changes</Text>
            </Pressable>
          </ScrollView>
        </Pressable>

        {/* ── Date picker nested modal ── */}
        <Modal transparent animationType="slide" visible={showDate} onRequestClose={() => setShowDate(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setShowDate(false)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 12 }} />
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', marginBottom: 8, textAlign: 'center' }}>Select Date</Text>
              <View style={{ borderRadius: 14, overflow: 'hidden', borderWidth: 1.5, borderColor: '#E5E7EB' }}>
                <DateTimePicker
                  mode="single" date={date} minDate={new Date()}
                  onChange={({ date: d }) => { if (d) setDate(d instanceof Date ? d : new Date(d as string)); }}
                  styles={CALENDAR_STYLES}
                />
              </View>
              <Pressable onPress={() => setShowDate(false)}
                style={{ marginTop: 14, backgroundColor: '#0078ff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>Confirm — {dayjs(date).format('DD MMM YYYY')}</Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Time picker nested modal ── */}
        <Modal transparent animationType="slide" visible={showTime} onRequestClose={() => setShowTime(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setShowTime(false)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 20, paddingTop: 12, paddingBottom: 32 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', marginBottom: 14, textAlign: 'center' }}>Select Time</Text>
              <View style={{ flexDirection: 'row', gap: 12, marginBottom: 8 }}>
                {/* Hour */}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
                  <Pressable onPress={() => { setHour((v) => v === 1 ? 12 : v - 1); setTimeError(''); }} style={{ paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                    <Text style={{ fontSize: 18, fontFamily: F.bold, color: '#374151' }}>−</Text>
                  </Pressable>
                  <Text style={{ flex: 1, textAlign: 'center', fontSize: 20, fontFamily: F.extraBold, color: '#111827' }}>{String(hour).padStart(2, '0')}</Text>
                  <Pressable onPress={() => { setHour((v) => v === 12 ? 1 : v + 1); setTimeError(''); }} style={{ paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                    <Text style={{ fontSize: 18, fontFamily: F.bold, color: '#374151' }}>+</Text>
                  </Pressable>
                </View>
                {/* Minute */}
                <View style={{ flex: 1, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, overflow: 'hidden' }}>
                  <Pressable onPress={() => { setMinute((v) => v === 0 ? 55 : v - 5); setTimeError(''); }} style={{ paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                    <Text style={{ fontSize: 18, fontFamily: F.bold, color: '#374151' }}>−</Text>
                  </Pressable>
                  <Text style={{ flex: 1, textAlign: 'center', fontSize: 20, fontFamily: F.extraBold, color: '#111827' }}>{String(minute).padStart(2, '0')}</Text>
                  <Pressable onPress={() => { setMinute((v) => (v + 5) % 60); setTimeError(''); }} style={{ paddingHorizontal: 14, paddingVertical: 14, backgroundColor: '#E5E7EB' }}>
                    <Text style={{ fontSize: 18, fontFamily: F.bold, color: '#374151' }}>+</Text>
                  </Pressable>
                </View>
                {/* AM/PM */}
                <View style={{ gap: 6 }}>
                  {(['AM', 'PM'] as const).map((p) => (
                    <Pressable key={p} onPress={() => { setAmpm(p); setTimeError(''); }}
                      style={{ paddingHorizontal: 14, paddingVertical: 10, borderRadius: 10, backgroundColor: ampm === p ? '#0078ff' : '#F3F4F6' }}
                    >
                      <Text style={{ fontSize: 14, fontFamily: F.bold, color: ampm === p ? '#fff' : '#374151' }}>{p}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
              {/* Inline time error */}
              {timeError ? (
                <View style={{ backgroundColor: '#FEE2E2', borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, marginBottom: 10 }}>
                  <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#DC2626' }}>{timeError}</Text>
                </View>
              ) : null}
              <Pressable onPress={confirmTime}
                style={{ backgroundColor: '#0078ff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
              >
                <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>
                  Confirm — {String(hour).padStart(2, '0')}:{String(minute).padStart(2, '0')} {ampm}
                </Text>
              </Pressable>
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Repeat dropdown nested modal ── */}
        <Modal transparent animationType="slide" visible={showRepeat} onRequestClose={() => setShowRepeat(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setShowRepeat(false)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
              {EDIT_REPEATS.map((opt) => (
                <Pressable key={opt} onPress={() => { setRepeat(opt); setShowRepeat(false); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, backgroundColor: repeat === opt ? '#EEF4FF' : 'transparent', marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: repeat === opt ? '#0078ff' : '#374151' }}>{opt}</Text>
                  {repeat === opt && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#0078ff', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>

        {/* ── Remind Me dropdown nested modal ── */}
        <Modal transparent animationType="slide" visible={showReminderSheet} onRequestClose={() => setShowReminderSheet(false)}>
          <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }} onPress={() => setShowReminderSheet(false)}>
            <Pressable onPress={() => {}} style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingHorizontal: 16, paddingTop: 12, paddingBottom: 32 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', marginBottom: 8, textAlign: 'center' }}>Remind Me</Text>
              {EDIT_REMINDER_BEFORE_OPTIONS.map((opt) => (
                <Pressable key={opt} onPress={() => { setReminderBefore(opt); setShowReminderSheet(false); }}
                  style={{ paddingVertical: 14, paddingHorizontal: 12, borderRadius: 10, backgroundColor: reminderBefore === opt ? '#EEF4FF' : 'transparent', marginBottom: 4, flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}
                >
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: reminderBefore === opt ? '#0078ff' : '#374151' }}>{opt}</Text>
                  {reminderBefore === opt && (
                    <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: '#0078ff', alignItems: 'center', justifyContent: 'center' }}>
                      <Text style={{ color: '#fff', fontSize: 12 }}>✓</Text>
                    </View>
                  )}
                </Pressable>
              ))}
            </Pressable>
          </Pressable>
        </Modal>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ─── Reminder Card ────────────────────────────────────────────────────────────
function ReminderCard({ item, onPress, onToggleDone }: { item: StoredTask; onPress: () => void; onToggleDone: () => void }) {
  const cfg  = getConfig(item.category);
  const Icon = cfg.icon;
  const dateStr = [item.dueLabel, item.reminderTime].filter(Boolean).join(' • ');

  return (
    <Pressable
      onPress={onPress}
      style={{
        flexDirection: 'row', alignItems: 'center',
        backgroundColor: '#fff',
        borderRadius: 16,
        marginHorizontal: 16, marginBottom: 10,
        paddingHorizontal: 14, paddingVertical: 14,
        gap: 14,
        boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(0,0,0,0.07)' }],
      }}
    >
      {/* Category icon square */}
      <View style={{ width: 48, height: 48, borderRadius: 14, backgroundColor: cfg.bg, alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={24} color="#fff" strokeWidth={2} />
      </View>

      {/* Content */}
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 12, fontFamily: F.bold, color: cfg.color, marginBottom: 2 }}>
          {dateStr}
        </Text>
        <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', marginBottom: item.location ? 3 : 0, textDecorationLine: item.done ? 'line-through' : 'none' }} numberOfLines={2}>
          {item.title}
        </Text>
        {item.location ? (
          <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#6B7280' }} numberOfLines={1}>
            {item.location}
          </Text>
        ) : null}
      </View>

      {/* Bell icon */}
      <Pressable onPress={onToggleDone} hitSlop={8}>
        {item.done
          ? <BellOff size={22} color="#D1D5DB" strokeWidth={1.8} />
          : <Bell    size={22} color={cfg.color}  strokeWidth={1.8} />
        }
      </Pressable>
    </Pressable>
  );
}

// ─── Promo card (compact, no "How it works?" link) ────────────────────────────
function PromoCard() {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center',
      backgroundColor: '#EEF4FF',
      borderRadius: 14,
      marginHorizontal: 16, marginBottom: 10,
      paddingHorizontal: 12, paddingVertical: 10,
      gap: 10,
    }}>
      <Bell size={22} color="#0078ff" strokeWidth={1.8} />
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#0078ff' }}>
          Never miss an important date!
        </Text>
        <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#374151', lineHeight: 16, marginTop: 1 }}>
          AdvoCal will remind you before every hearing, meeting, task or deadline.
        </Text>
      </View>
    </View>
  );
}

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function RemindersScreen() {
  const router = useRouter();
  const [reminders, setReminders]           = useState<StoredTask[]>(getStoreTasks);
  const [tab, setTab]                       = useState<'all' | 'complete'>('all');
  const [query, setQuery]                   = useState('');
  const [selectedReminder, setSelected]     = useState<StoredTask | null>(null);
  const [editingReminder, setEditing]       = useState<StoredTask | null>(null);

  // On focus: load from Supabase and seed the in-memory store so all screens stay current
  useFocusEffect(
    useCallback(() => {
      (async () => {
        const rows = await fetchRemindersFromDB();
        const tasks: StoredTask[] = rows.map((r) => ({
          id:              r.id,
          title:           r.title,
          category:        r.category,
          priority:        r.priority as 'high' | 'medium' | 'low',
          done:            r.done,
          dueLabel:        r.due_label,
          rawDate:         r.raw_date ?? undefined,
          reminderTime:    r.reminder_time ?? undefined,
          location:        r.location ?? undefined,
          description:     r.description ?? undefined,
          repeat:          r.repeat ?? undefined,
          reminderAt:      r.reminder_at ? new Date(r.reminder_at) : undefined,
          reminderAdvance: r.reminder_advance,
          notificationId:  r.notification_id ?? undefined,
        }));
        setStoreTasks(tasks);
        setReminders([...tasks]);
      })();
      const unsub = subscribeStore(() => setReminders([...getStoreTasks()]));
      return unsub;
    }, []),
  );

  const markComplete = async (id: string) => {
    const next = getStoreTasks().map((t) => t.id === id ? { ...t, done: true } : t);
    setStoreTasks(next);
    setReminders([...next]);
    setSelected(null);
    await updateReminderInDB(id, { done: true });
  };

  const deleteReminder = async (id: string) => {
    // Cancel the scheduled OS notification before removing from store
    const task = getStoreTasks().find((t) => t.id === id);
    if (task?.notificationId) {
      await cancelTaskReminder(task.notificationId);
    }
    const next = getStoreTasks().filter((t) => t.id !== id);
    setStoreTasks(next);
    setReminders([...next]);
    setSelected(null);
    await deleteReminderFromDB(id);
  };

  const toggleDone = async (id: string) => {
    const task = getStoreTasks().find((t) => t.id === id);
    const newDone = !(task?.done ?? false);
    const next = getStoreTasks().map((t) => t.id === id ? { ...t, done: newDone } : t);
    setStoreTasks(next);
    setReminders([...next]);
    await updateReminderInDB(id, { done: newDone });
  };

  const filtered = reminders.filter((r) => {
    if (tab === 'all'      && r.done)  return false;
    if (tab === 'complete' && !r.done) return false;
    if (query.trim()) {
      const q = query.toLowerCase();
      if (!r.title.toLowerCase().includes(q) && !(r.location ?? '').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>

      {/* ── Header ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between',
        paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8,
      }}>
        <Text style={{ fontSize: 20, fontFamily: F.extraBold, color: '#202124', letterSpacing: -0.3 }}>
          Reminders
        </Text>
        <Pressable
          onPress={() => router.push('/(app)/add-reminder' as any)}
          style={{
            flexDirection: 'row', alignItems: 'center', gap: 7,
            backgroundColor: '#0078ff',
            borderRadius: 22, paddingHorizontal: 14, paddingVertical: 9,
          }}
        >
          <Bell size={15} color="#fff" strokeWidth={2.2} />
          <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#fff' }}>+ Add Reminder</Text>
        </Pressable>
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 }} />
      <View style={{
        flexDirection: 'row', marginHorizontal: 16, marginBottom: 14,
        backgroundColor: '#fff',
        borderRadius: 14,
        padding: 4,
        boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 4, color: 'rgba(0,0,0,0.06)' }],
      }}>
        {(['all', 'complete'] as const).map((t) => (
          <Pressable
            key={t}
            onPress={() => setTab(t)}
            style={{
              flex: 1, alignItems: 'center', paddingVertical: 10,
              borderRadius: 11,
              backgroundColor: tab === t ? '#0078ff' : 'transparent',
            }}
          >
            <Text style={{
              fontSize: 14, fontFamily: F.bold,
              color: tab === t ? '#fff' : '#374151',
            }}>
              {t === 'all' ? 'All' : 'Complete'}
            </Text>
          </Pressable>
        ))}
      </View>

      {/* ── Search row ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center', gap: 10,
        marginHorizontal: 16, marginBottom: 18,
      }}>
        <View style={{
          flex: 1, flexDirection: 'row', alignItems: 'center', gap: 8,
          backgroundColor: '#fff', borderRadius: 12,
          paddingHorizontal: 12, paddingVertical: 10,
          boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.05)' }],
        }}>
          <Search size={16} color="#9CA3AF" strokeWidth={2} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search reminders..."
            placeholderTextColor="#9CA3AF"
            style={{ flex: 1, fontSize: 14, fontFamily: F.regular, color: '#111827' }}
            returnKeyType="search"
          />
        </View>
        <Pressable
          onPress={() => {/* filter sheet — future */ }}
          style={{
            width: 42, height: 42, borderRadius: 12,
            backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center',
            boxShadow: [{ offsetX: 0, offsetY: 1, blurRadius: 3, color: 'rgba(0,0,0,0.06)' }],
          }}
        >
          <SlidersHorizontal size={18} color="#374151" strokeWidth={2} />
        </Pressable>
      </View>

      {/* ── List ── */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.id}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={{ paddingBottom: 16 }}
        ListHeaderComponent={
          <Text style={{
            fontSize: 14, fontFamily: F.semiBold, color: '#6B7280',
            marginHorizontal: 16, marginBottom: 10, letterSpacing: 0.1,
          }}>
            Upcoming Reminders
          </Text>
        }
        ListEmptyComponent={
          <View style={{ alignItems: 'center', paddingTop: 48, gap: 10 }}>
            <Bell size={44} color="#D1D5DB" strokeWidth={1.4} />
            <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#9CA3AF' }}>No reminders yet</Text>
            <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#D1D5DB', textAlign: 'center', paddingHorizontal: 40 }}>
              Tap + Add Reminder to create your first one
            </Text>
          </View>
        }
        renderItem={({ item }) => (
          <ReminderCard
            item={item}
            onPress={() => setSelected(item)}
            onToggleDone={() => toggleDone(item.id)}
          />
        )}
      />

      {/* ── Promo banner — always pinned at bottom, never overlays cards ── */}
      <PromoCard />

      {/* ── Detail sheet ── */}
      {selectedReminder && (
        <ReminderDetailSheet
          item={selectedReminder}
          onClose={() => setSelected(null)}
          onComplete={() => markComplete(selectedReminder.id)}
          onDelete={() => deleteReminder(selectedReminder.id)}
          onEdit={() => { setEditing(selectedReminder); setSelected(null); }}
        />
      )}

      {/* ── Edit sheet ── */}
      {editingReminder && (
        <EditReminderSheet
          item={editingReminder}
          onClose={() => setEditing(null)}
          onSave={async (updated) => {
            const next = getStoreTasks().map((t) => t.id === updated.id ? updated : t);
            setStoreTasks(next);
            setReminders([...next]);
            setEditing(null);
            // Persist edit to Supabase
            await updateReminderInDB(updated.id, {
              title:            updated.title,
              category:         updated.category,
              priority:         updated.priority,
              done:             updated.done,
              due_label:        updated.dueLabel,
              raw_date:         updated.rawDate ?? null,
              reminder_time:    updated.reminderTime ?? null,
              location:         updated.location ?? null,
              description:      updated.description ?? null,
              repeat:           updated.repeat ?? null,
              reminder_at:      updated.reminderAt ? updated.reminderAt.toISOString() : null,
              reminder_advance: updated.reminderAdvance ?? 0,
              notification_id:  updated.notificationId ?? null,
            });
          }}
        />
      )}
    </SafeAreaView>
  );
}
