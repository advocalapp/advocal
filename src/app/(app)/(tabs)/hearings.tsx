import { useState, useCallback, useMemo, useRef } from 'react';
import { View, Text, TextInput, FlatList, Pressable, ScrollView } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, useRouter } from 'expo-router';
import { Search } from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getCases, dataCache } from '@/db/api';
import type { Case } from '@/types/types';
import { F } from '@/lib/fonts';
import { HearingCard } from '@/components/CaseCard';
// Pre-seed case detail cache on tap so the detail screen opens with zero spinner
import { caseCache } from '@/app/(app)/case/[id]';

type FilterType = 'scheduled' | 'today' | 'tomorrow' | 'upcoming' | 'urgent' | 'no_date';

function toDateStr(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export default function HearingsScreen() {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<FilterType>('scheduled');
  const [cases, setCases] = useState<Case[]>(() => dataCache.cases ?? []);
  const [_loading, setLoading] = useState(false);

  // dataReady = false only on very first cold-start (no cache yet)
  const [dataReady, setDataReady] = useState(dataCache.cases !== null);

  // Track whether the first load has happened so re-focuses refresh silently
  const initialLoadDone = useRef(false);

  useFocusEffect(useCallback(() => {
    // Always silent — list renders immediately from existing state,
    // data updates in background without blocking spinner.
    const silent = initialLoadDone.current;
    if (!silent) initialLoadDone.current = true;
    loadCases(true);
  }, []));

  const loadCases = async (silent = false) => {
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
    } catch {
      // silently handle auth/network errors — list stays with previous data
    } finally {
      if (!silent) setLoading(false);
      setDataReady(true); // always mark ready after first fetch
    }
  };

  const todayStr = toDateStr(new Date());
  const tomorrowStr = (() => {
    const d = new Date();
    d.setDate(d.getDate() + 1);
    return toDateStr(d);
  })();

  const filtered = useMemo(() => {
    let list = cases;
    if (filter === 'scheduled') list = list.filter((c) => !!c.hearing_date);
    else if (filter === 'today')    list = list.filter((c) => c.hearing_date === todayStr);
    else if (filter === 'tomorrow') list = list.filter((c) => c.hearing_date === tomorrowStr);
    else if (filter === 'upcoming') list = list.filter((c) => c.hearing_date && c.hearing_date > todayStr);
    else if (filter === 'urgent')   list = list.filter((c) => c.status === 'urgent');
    else if (filter === 'no_date')  list = list.filter((c) => !c.hearing_date);

    if (query.trim()) {
      const q = query.toLowerCase();
      list = list.filter((c) =>
        c.case_title.toLowerCase().includes(q) ||
        c.court_name.toLowerCase().includes(q) ||
        (c.judge_name || '').toLowerCase().includes(q) ||
        (c.client_name || '').toLowerCase().includes(q) ||
        (c.case_number || '').toLowerCase().includes(q)
      );
    }
    return list.sort((a, b) => (a.hearing_date || 'zzzz') < (b.hearing_date || 'zzzz') ? -1 : 1);
  }, [cases, filter, query, todayStr, tomorrowStr]);

  const noDateCount = useMemo(() => cases.filter((c) => !c.hearing_date).length, [cases]);

  const FILTERS: { key: FilterType; label: string }[] = [
    { key: 'scheduled', label: 'Scheduled' },
    { key: 'today',     label: 'Today' },
    { key: 'tomorrow',  label: 'Tomorrow' },
    { key: 'upcoming',  label: 'Upcoming' },
    { key: 'urgent',    label: 'Urgent' },
    { key: 'no_date',   label: `No Date${noDateCount > 0 ? ` (${noDateCount})` : ''}` },
  ];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#fff' }} edges={['top']}>
      {/* Header */}
      <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8 }}>
        <Text style={{ fontSize: 20, fontFamily: F.extraBold, color: '#202124', letterSpacing: -0.3 }}>All Cases</Text>
        <View style={{ backgroundColor: '#F3F4F6', borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 }}>
          <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#202124' }}>{filtered.length} Cases</Text>
        </View>
      </View>

      {/* Divider */}
      <View style={{ height: 1, backgroundColor: '#F3F4F6', marginBottom: 12 }} />

      {/* Search bar */}
      <View style={{ marginHorizontal: 16, marginBottom: 10, flexDirection: 'row', alignItems: 'center', backgroundColor: '#F3F4F6', borderRadius: 12, paddingHorizontal: 12, paddingVertical: 9, gap: 8 }}>
        <Search size={15} color="#9CA3AF" strokeWidth={2} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search case, judge, court, client..."
          placeholderTextColor="#9CA3AF"
          style={{ flex: 1, fontSize: 13, fontFamily: F.regular, color: '#111827' }}
          returnKeyType="search"
        />
      </View>

      {/* Filter pills — horizontally scrollable */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: 16, gap: 8, marginBottom: 8 }}
        style={{ flexGrow: 0 }}
      >
        {FILTERS.map((f) => (
          <Pressable
            key={f.key}
            onPress={() => setFilter(f.key)}
            style={{
              paddingHorizontal: 14, paddingVertical: 7, borderRadius: 20,
              backgroundColor: filter === f.key ? '#111827' : '#F3F4F6',
            }}
          >
            <Text style={{ fontSize: 12, fontFamily: F.semiBold, color: filter === f.key ? '#fff' : '#374151' }}>{f.label}</Text>
          </Pressable>
        ))}
      </ScrollView>

      {/* List — skeleton while data not yet ready, real list once ready */}
      {!dataReady ? (
        // Skeleton case-card rows — never shows "No cases found" during initial load
        <View style={{ paddingTop: 4 }}>
          {[0,1,2,3,4].map((i) => (
            <View key={i} style={{ paddingHorizontal: 16, paddingVertical: 14, flexDirection: 'row', alignItems: 'center', gap: 12, borderBottomWidth: i < 4 ? 1 : 0, borderBottomColor: '#F1F3F4' }}>
              <View style={{ width: 42, height: 42, borderRadius: 12, backgroundColor: '#F0F0F0' }} />
              <View style={{ flex: 1, gap: 8 }}>
                <View style={{ height: 13, width: '70%', backgroundColor: '#F0F0F0', borderRadius: 6 }} />
                <View style={{ height: 11, width: '45%', backgroundColor: '#F5F5F5', borderRadius: 6 }} />
              </View>
              <View style={{ height: 11, width: 50, backgroundColor: '#F5F5F5', borderRadius: 6 }} />
            </View>
          ))}
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.id}
          renderItem={({ item, index }) => (
            <View style={{ backgroundColor: '#FFFFFF' }}>
              {index > 0 && <View style={{ height: 1, backgroundColor: '#F1F3F4', marginLeft: 64 }} />}
              <HearingCard
                item={item}
                onPress={() => {
                  // Pre-seed cache so detail screen renders instantly (no spinner)
                  if (!caseCache[item.id]) caseCache[item.id] = { caseData: item, hearingHistory: [] };
                  router.push(`/(app)/case/${item.id}`);
                }}
              />
            </View>
          )}
          contentContainerStyle={{ paddingTop: 0, paddingBottom: 24 }}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={<View style={{ height: 1, backgroundColor: '#E8EDF2' }} />}
          ListFooterComponent={filtered.length > 0 ? <View style={{ height: 1, backgroundColor: '#E8EDF2' }} /> : null}
          ListEmptyComponent={
            <View style={{ alignItems: 'center', paddingTop: 60 }}>
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#9CA3AF' }}>
                {filter === 'no_date' ? 'No cases without a hearing date' : 'No cases found'}
              </Text>
              <Text style={{ fontSize: 13, fontFamily: F.regular, color: '#D1D5DB', marginTop: 4, textAlign: 'center', paddingHorizontal: 32 }}>
                {filter === 'scheduled'
                  ? 'Cases added without a hearing date appear under "No Date"'
                  : filter === 'no_date'
                  ? 'All your cases have a hearing date scheduled'
                  : 'Try a different filter or search term'}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}
