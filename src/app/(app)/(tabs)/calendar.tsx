import { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, ScrollView, Pressable, Modal } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { Bell, ChevronDown, ChevronLeft, ChevronRight, X } from 'lucide-react-native';
import { getReminderTasks, subscribeStore } from '@/lib/taskStore';
import { ReminderTasksModal } from '@/components/ReminderTasksModal';
import { supabase } from '@/client/supabase';
import { getCases, dataCache } from '@/db/api';
import type { Case, CaseStatus } from '@/types/types';
import { F } from '@/lib/fonts';
import { TodayCard, UpcomingCard } from '@/components/CaseCard';
// Pre-seed case detail cache on tap so the detail screen opens with zero spinner
import { caseCache } from '@/app/(app)/case/[id]';

const DAYS        = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTHS      = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

// Dot color per status — shown on calendar cell
const STATUS_DOT: Record<CaseStatus, string> = {
  urgent:    '#EA4335',
  ongoing:   '#0078ff',
  pending:   '#34A853',
  adjourned: '#FBBC05',
  completed: '#9AA0A6',
};

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ── Month/Year Picker ─────────────────────────────────────────────────────────
function MonthYearPicker({
  visible, year, month, onSelect, onClose,
}: { visible: boolean; year: number; month: number; onSelect: (y: number, m: number) => void; onClose: () => void }) {
  const [pickerYear, setPickerYear] = useState(year);
  const prevVisible = useRef(false);
  if (visible && !prevVisible.current) setPickerYear(year);
  prevVisible.current = visible;

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={onClose}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <View style={{
            backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28,
            paddingTop: 12, paddingBottom: 40, paddingHorizontal: 20,
            boxShadow: [{ offsetX: 0, offsetY: -4, blurRadius: 24, color: 'rgba(0,0,0,0.1)' }],
          }}>
            <View style={{ alignItems: 'center', marginBottom: 20 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#DADCE0', marginBottom: 18 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
                <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#202124' }}>Select Month & Year</Text>
                <Pressable onPress={onClose} hitSlop={10}
                  style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={14} color="#5F6368" strokeWidth={2.5} />
                </Pressable>
              </View>
            </View>

            {/* Year row */}
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 24, marginBottom: 22 }}>
              <Pressable
                onPress={() => setPickerYear((y) => y - 1)} hitSlop={10}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronLeft size={18} color="#202124" strokeWidth={2.5} />
              </Pressable>
              <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#202124', minWidth: 64, textAlign: 'center' }}>
                {pickerYear}
              </Text>
              <Pressable
                onPress={() => setPickerYear((y) => y + 1)} hitSlop={10}
                style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' }}
              >
                <ChevronRight size={18} color="#202124" strokeWidth={2.5} />
              </Pressable>
            </View>

            {/* Month grid */}
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 10 }}>
              {MONTHS_SHORT.map((m, idx) => {
                const isActive = pickerYear === year && idx === month;
                return (
                  <Pressable
                    key={m} onPress={() => onSelect(pickerYear, idx)}
                    style={{
                      width: '22%', paddingVertical: 12, borderRadius: 12,
                      alignItems: 'center',
                      backgroundColor: isActive ? '#0078ff' : '#F1F3F4',
                    }}
                  >
                    <Text style={{ fontSize: 15, fontFamily: isActive ? F.bold : F.semiBold, color: isActive ? '#fff' : '#202124' }}>
                      {m}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── Home Screen ───────────────────────────────────────────────────────────────
export default function CalendarScreen() {
  const router = useRouter();
  const today = new Date();

  const [viewDate, setViewDate]     = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [selectedDate, setSelectedDate] = useState<Date>(today);
  const [cases, setCases]           = useState<Case[]>(() => dataCache.cases ?? []);
  const [_loading, setLoading]       = useState(false);
  const [dataReady, setDataReady]   = useState(dataCache.cases !== null); // false only on cold start
  const [showPicker, setShowPicker] = useState(false);
  const [showReminders, setShowReminders] = useState(false);
  const [reminderCount, setReminderCount] = useState(() => getReminderTasks().length);

  // Keep reminder badge count in sync with the task store
  useEffect(() => {
    const unsub = subscribeStore(() => setReminderCount(getReminderTasks().length));
    return unsub;
  }, []);

  const initialLoadDone = useRef(false);

  useFocusEffect(useCallback(() => {
    // Always reload on focus — guarantees updated hearing dates show immediately
    // with no stale dots from previous state.
    // Never block the UI — always silent (grid renders from existing state).
    const _silent = initialLoadDone.current;
    initialLoadDone.current = true;
    loadData(true);   // always silent — grid visible immediately
  }, []));

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      // Use cached userId to skip auth round-trip on subsequent loads
      let uid = dataCache.userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
        if (uid) dataCache.setUserId(uid);
      }
      if (uid) setCases(await getCases(uid));
    } catch { /* keep previous data */ }
    finally {
      if (!silent) setLoading(false);
      setDataReady(true);
    }
  };

  const year         = viewDate.getFullYear();
  const month        = viewDate.getMonth();
  const firstDay     = new Date(year, month, 1).getDay();
  const daysInMonth  = new Date(year, month + 1, 0).getDate();
  const prevMonthDays= new Date(year, month, 0).getDate();

  // 6-week grid
  const cells: { day: number; currentMonth: boolean }[] = [];
  for (let i = 0; i < firstDay; i++)
    cells.push({ day: prevMonthDays - firstDay + 1 + i, currentMonth: false });
  for (let d = 1; d <= daysInMonth; d++)
    cells.push({ day: d, currentMonth: true });
  for (let d = 1; d <= 42 - cells.length; d++)
    cells.push({ day: d, currentMonth: false });

  // Hearing dot map
  const hearingDotMap: Record<string, string> = {};
  cases.forEach((c) => {
    if (c.hearing_date) {
      const priority: CaseStatus[] = ['urgent', 'ongoing', 'pending', 'adjourned', 'completed'];
      const existing = hearingDotMap[c.hearing_date];
      if (!existing || priority.indexOf(c.status) < priority.indexOf(existing as CaseStatus)) {
        hearingDotMap[c.hearing_date] = STATUS_DOT[c.status];
      }
    }
  });

  const todayStr    = toDateStr(today);
  const selectedStr = toDateStr(selectedDate);

  const todayCases    = cases.filter((c) => c.hearing_date === todayStr);
  const selectedCases = cases.filter((c) => c.hearing_date === selectedStr);
  const upcomingCases = cases
    .filter((c) => c.hearing_date && c.hearing_date > todayStr)
    .sort((a, b) => (a.hearing_date! > b.hearing_date! ? 1 : -1));

  const isSelectedToday = selectedStr === todayStr;
  const displayCases    = isSelectedToday ? todayCases : selectedCases;

  return (
    <View style={{ flex: 1, backgroundColor: '#F4F6F9' }}>
      <StatusBar style="dark" />

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <SafeAreaView edges={['top']} style={{ backgroundColor: '#F4F6F9' }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 20, paddingTop: 8, paddingBottom: 10 }}>
          <Text style={{ fontSize: 20, fontFamily: F.extraBold, color: '#202124', letterSpacing: -0.3 }}>Calendar</Text>
          <View style={{ marginTop: 0 }}>
            <Pressable onPress={() => setShowReminders(true)} hitSlop={10}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' }}>
              <Bell size={17} color="#202124" strokeWidth={2} />
            </Pressable>
            {reminderCount > 0 && (
              <View style={{
                position: 'absolute', top: -3, right: -3,
                minWidth: 16, height: 16, borderRadius: 8,
                backgroundColor: '#EA4335', borderWidth: 1.5, borderColor: '#F4F6F9',
                alignItems: 'center', justifyContent: 'center', paddingHorizontal: 3,
              }}>
                <Text style={{ fontSize: 9, fontFamily: F.bold, color: '#fff', fontWeight: '700', lineHeight: 11 }}>
                  {reminderCount > 99 ? '99+' : reminderCount}
                </Text>
              </View>
            )}
          </View>
        </View>
      </SafeAreaView>

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        style={{ backgroundColor: '#F4F6F9' }}
      >
        {/* ── Calendar Card ──────────────────────────────────────────────────── */}
        <View style={{
          backgroundColor: '#FFFFFF',
          borderBottomWidth: 1,
          borderBottomColor: '#E8EDF2',
          paddingTop: 6,
          paddingBottom: 8,
        }}>
          {/* Month/Year nav */}
          <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 6, gap: 4 }}>
            <Pressable
              onPress={() => setViewDate(new Date(year, month - 1, 1))}
              hitSlop={10}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronLeft size={15} color="#202124" strokeWidth={2.5} />
            </Pressable>

            <Pressable
              onPress={() => setShowPicker(true)}
              style={{ flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 6 }}
            >
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#202124' }}>{MONTHS[month]} {year}</Text>
              <ChevronDown size={13} color="#0078ff" strokeWidth={2.5} />
            </Pressable>

            <Pressable
              onPress={() => setViewDate(new Date(year, month + 1, 1))}
              hitSlop={10}
              style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: '#F1F3F4', alignItems: 'center', justifyContent: 'center' }}
            >
              <ChevronRight size={15} color="#202124" strokeWidth={2.5} />
            </Pressable>
          </View>

          <MonthYearPicker
            visible={showPicker}
            year={year} month={month}
            onSelect={(y, m) => { setViewDate(new Date(y, m, 1)); setShowPicker(false); }}
            onClose={() => setShowPicker(false)}
          />

          {/* Calendar grid */}
          <View style={{ paddingHorizontal: 10, paddingBottom: 10 }}>
            {/* Day headers */}
            <View style={{ flexDirection: 'row', marginBottom: 2 }}>
              {DAYS.map((d, i) => (
                <View key={d} style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}>
                  <Text style={{
                    fontSize: 13, fontFamily: F.semiBold,
                    color: i === 0 ? '#EA4335' : '#9AA0A6',
                  }}>{d}</Text>
                </View>
              ))}
            </View>

            {/* 6-week rows */}
            {Array.from({ length: 6 }).map((_, row) => (
              <View key={row} style={{ flexDirection: 'row' }}>
                {cells.slice(row * 7, row * 7 + 7).map((cell, col) => {
                  const cellDate = cell.currentMonth
                    ? new Date(year, month, cell.day)
                    : col < 3
                      ? new Date(year, month - 1, cell.day)
                      : new Date(year, month + 1, cell.day);
                  const cellStr  = toDateStr(cellDate);
                  const isToday  = cellStr === todayStr;
                  const isSelected = cellStr === selectedStr && !isToday;
                  const dot      = cell.currentMonth ? hearingDotMap[cellStr] : undefined;

                  return (
                    <Pressable
                      key={`${row}-${col}`}
                      onPress={() => setSelectedDate(cellDate)}
                      style={{ flex: 1, alignItems: 'center', paddingVertical: 3 }}
                    >
                      <View style={{
                        width: '80%', aspectRatio: 1, borderRadius: 999,
                        alignItems: 'center', justifyContent: 'center',
                        maxWidth: 36,
                        backgroundColor: isToday
                          ? '#0078ff'
                          : isSelected
                            ? '#E8F0FE'
                            : 'transparent',
                      }}>
                        <Text style={{
                          fontSize: 14,
                          fontFamily: F.bold,
                          color: isToday
                            ? '#FFFFFF'
                            : !cell.currentMonth
                              ? '#DADCE0'
                              : isSelected
                                ? '#0078ff'
                                : col === 0
                                  ? '#EA4335'
                                  : '#202124',
                        }}>
                          {cell.day}
                        </Text>
                      </View>
                      {/* Hearing dot */}
                      {dot && cell.currentMonth && !isToday ? (
                        <View style={{ width: 5, height: 5, borderRadius: 2.5, backgroundColor: '#EA4335', marginTop: 1 }} />
                      ) : (
                        <View style={{ width: 4, height: 4, marginTop: 1 }} />
                      )}
                    </Pressable>
                  );
                })}
              </View>
            ))}
          </View>
        </View>

        {/* Cases section — always rendered, no full-screen spinner */}
        <View style={{ paddingTop: 20, paddingBottom: 32, gap: 20 }}>

            {/* ── Today's Cases ──────────────────────────────────────────────── */}
            <View>
              {/* Section header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827', flex: 1, marginRight: 8 }} numberOfLines={1}>
                  {isSelectedToday
                    ? "Today's Cases"
                    : selectedDate.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' })}
                </Text>
                <View style={{ backgroundColor: '#F1F3F4', borderRadius: 4, paddingHorizontal: 10, paddingVertical: 4, flexShrink: 0 }}>
                  <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff' }}>
                    {displayCases.length} {displayCases.length === 1 ? 'Case' : 'Cases'}
                  </Text>
                </View>
              </View>

              {/* Card container — full width, no side margin */}
              <View style={{
                backgroundColor: '#FFFFFF',
                borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E8EDF2',
              }}>
                {!dataReady ? (
                  // Skeleton rows while data loads — never shows "No hearings scheduled"
                  <View>
                    {[0,1,2].map((i) => (
                      <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i < 2 ? 1 : 0, borderBottomColor: '#F1F3F4' }}>
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F0F0F0' }} />
                        <View style={{ flex: 1, gap: 8 }}>
                          <View style={{ height: 12, width: '65%', backgroundColor: '#F0F0F0', borderRadius: 6 }} />
                          <View style={{ height: 10, width: '40%', backgroundColor: '#F5F5F5', borderRadius: 6 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : displayCases.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center', gap: 12 }}>
                    <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#1A1A1A' }}>
                      {isSelectedToday ? 'No Cases Scheduled Today' : 'No Cases Scheduled'}
                    </Text>
                    <Pressable
                      onPress={() => router.push('/(app)/(tabs)/add-case' as any)}
                      style={{ flexDirection: 'row', alignItems: 'center', gap: 5 }}
                    >
                      <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff' }}>+</Text>
                      <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff' }}>Add New Case</Text>
                    </Pressable>
                  </View>
                ) : (
                  <>
                    {displayCases.map((c, idx) => (
                      <View key={c.id}>
                        {idx > 0 && <View style={{ height: 1, backgroundColor: '#F1F3F4', marginLeft: 66 }} />}
                        <TodayCard item={c} onPress={() => {
                        if (!caseCache[c.id]) caseCache[c.id] = { caseData: c, hearingHistory: [] };
                        router.push(`/(app)/case/${c.id}`);
                      }} />
                      </View>
                    ))}
                    {/* View All row */}
                    <View style={{ height: 1, backgroundColor: '#F1F3F4' }} />
                    <Pressable
                      onPress={() => router.push('/(app)/(tabs)/hearings')}
                      style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 }}
                    >
                      <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#0078ff' }}>View All Today's Cases</Text>
                      <ChevronRight size={16} color="#0078ff" strokeWidth={2.5} />
                    </Pressable>
                  </>
                )}
              </View>
            </View>

            {/* ── Upcoming Cases ─────────────────────────────────────────────── */}
            <View>
              {/* Section header */}
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, paddingHorizontal: 16 }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827' }}>Upcoming Cases</Text>
                <Pressable onPress={() => router.push('/(app)/(tabs)/hearings')}>
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff' }}>See All</Text>
                </Pressable>
              </View>

              {/* Card container — full width, no side margin */}
              <View style={{
                backgroundColor: '#FFFFFF',
                borderTopWidth: 1, borderBottomWidth: 1, borderColor: '#E8EDF2',
              }}>
                {!dataReady ? (
                  <View>
                    {[0,1].map((i) => (
                      <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i < 1 ? 1 : 0, borderBottomColor: '#F1F3F4' }}>
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#F0F0F0' }} />
                        <View style={{ flex: 1, gap: 8 }}>
                          <View style={{ height: 12, width: '60%', backgroundColor: '#F0F0F0', borderRadius: 6 }} />
                          <View style={{ height: 10, width: '35%', backgroundColor: '#F5F5F5', borderRadius: 6 }} />
                        </View>
                      </View>
                    ))}
                  </View>
                ) : upcomingCases.length === 0 ? (
                  <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                    <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#1A1A1A' }}>No Upcoming Hearings</Text>
                  </View>
                ) : (
                  upcomingCases.slice(0, 6).map((c, idx) => (
                    <View key={c.id}>
                      {idx > 0 && <View style={{ height: 1, backgroundColor: '#F1F3F4', marginLeft: 64 }} />}
                      <UpcomingCard item={c} onPress={() => {
                        if (!caseCache[c.id]) caseCache[c.id] = { caseData: c, hearingHistory: [] };
                        router.push(`/(app)/case/${c.id}`);
                      }} />
                    </View>
                  ))
                )}
              </View>
            </View>

          </View>
      </ScrollView>

      <ReminderTasksModal visible={showReminders} onClose={() => setShowReminders(false)} />
    </View>
  );
}
