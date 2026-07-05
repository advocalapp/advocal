import { View, Text, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { CalendarDays, Clock, ChevronRight } from 'lucide-react-native';
import type { Case, CaseStatus } from '@/types/types';
import { F } from '@/lib/fonts';

import districtCourtIcon from '../../assets/district-court.png';
import highCourtIcon from '../../assets/high-court.png';

const DISTRICT_COURT_ICON = districtCourtIcon;
const HIGH_COURT_ICON     = highCourtIcon;

interface CaseCardProps {
  item: Case;
}

const MONTHS_SHORT = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

/** Detect court level from court_name string */
export function getCourtIconUrl(courtName: string): number {
  const lower = courtName.toLowerCase();
  if (lower.includes('high court')) return HIGH_COURT_ICON;
  return DISTRICT_COURT_ICON; // default: district court
}

/** Court icon — white rounded square with border so emblem renders clearly */
function CourtIcon({ courtName }: { courtName: string }) {
  const iconUrl = getCourtIconUrl(courtName);
  return (
    <View style={{
      width: BADGE_W, height: BADGE_W, borderRadius: BADGE_W * 0.2,
      backgroundColor: '#fff',
      borderWidth: 1, borderColor: '#E2E8F0',
      alignItems: 'center', justifyContent: 'center',
    }}>
        <Image source={iconUrl} style={{ width: BADGE_W * 0.82, height: BADGE_W * 0.82 }} contentFit="contain" />
    </View>
  );
}

// Status pill label
const STATUS_LABEL: Record<CaseStatus, string> = {
  urgent:    'Urgent',
  ongoing:   'Hearing',
  pending:   'Pending',
  adjourned: 'Adjourned',
  completed: 'Disposed',
};

// Status pill colors — DESIGN.md palette
const STATUS_BADGE: Record<CaseStatus, { bg: string; text: string }> = {
  urgent:    { bg: '#ffdad6', text: '#93000a' },
  ongoing:   { bg: '#d8e2ff', text: '#004494' },
  pending:   { bg: '#d8e2ff', text: '#004494' },
  adjourned: { bg: '#ffdea0', text: '#5c4300' },
  completed: { bg: '#89fa9b', text: '#005320' },
};

function formatTime(t: string | null): string {
  if (!t) return '';
  const [hStr, mStr] = t.split(':');
  const h = parseInt(hStr, 10);
  const m = mStr ?? '00';
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2,'0')} ${ampm}`;
}

function formatUpcomingDate(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00');
  return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
}

// Shared size for the left-column icon badges (calendar, court)
const BADGE_W = 40;

// ── StatusBadge — auto-width pill that never clips long labels ────────────────
function StatusBadge({ status }: { status: CaseStatus }) {
  const { bg, text } = STATUS_BADGE[status];
  return (
    <View style={{
      backgroundColor: bg, borderRadius: 6,
      minWidth: BADGE_W, paddingVertical: 3, paddingHorizontal: 5,
      alignItems: 'center', alignSelf: 'flex-start',
    }}>
      <Text style={{ fontSize: 10, fontFamily: F.bold, color: text }}>{STATUS_LABEL[status]}</Text>
    </View>
  );
}

// ── CalendarBadge — green box: month above, date number below, same size as CourtIcon ──
function CalendarBadge({ dateStr }: { dateStr: string }) {
  const d = new Date(dateStr + 'T00:00:00');
  const month = MONTHS_SHORT[d.getMonth()].toUpperCase();
  const day   = String(d.getDate());
  return (
    <View style={{
      backgroundColor: '#dcfce7', borderRadius: 6,
      width: BADGE_W, height: BADGE_W,
      alignItems: 'center', justifyContent: 'center', gap: 1,
    }}>
      <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#166534', letterSpacing: 0.4, lineHeight: 11 }}>{month}</Text>
      <Text style={{ fontSize: 14, fontFamily: F.extraBold, color: '#166534', lineHeight: 16 }}>{day}</Text>
    </View>
  );
}

// ── TodayCard — used in "Today's Cases" list ──────────────────────────────────
// Layout: green left bar · calendar badge + case type (left) · time + title + court · status + chevron
export function TodayCard({ item, onPress }: { item: Case; onPress?: () => void }) {
  const router = useRouter();
  const handlePress = onPress ?? (() => router.push(`/(app)/case/${item.id}`));
  const time = formatTime(item.hearing_time);

  return (
    <Pressable onPress={handlePress}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingRight: 14 }}>
        {/* Green left bar */}
        <View style={{ width: 4, alignSelf: 'stretch', backgroundColor: '#34A853', borderRadius: 2, marginRight: 12 }} />

        {/* Calendar badge — left column */}
        <View style={{ marginRight: 10, flexShrink: 0, marginTop: 2, width: BADGE_W, alignItems: 'center' }}>
          {item.hearing_date
            ? <CalendarBadge dateStr={item.hearing_date} />
            : <View style={{ width: BADGE_W, height: BADGE_W, borderRadius: BADGE_W * 0.2, backgroundColor: '#f1f5f9' }} />}
        </View>

        {/* Content */}
        <View style={{ flex: 1, gap: 2 }}>
          {time ? (
            <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#0078ff', lineHeight: 15 }}>{time}</Text>
          ) : null}
          <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#111827', lineHeight: 18 }} numberOfLines={2}>
            {item.case_title}
          </Text>
          <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#6B7280', lineHeight: 15 }} numberOfLines={1}>
            {item.court_name}{item.court_room ? `, Court Room ${item.court_room}` : ''}
          </Text>
        </View>

        {/* Badge column — status only (right) */}
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginLeft: 8, flexShrink: 0, marginTop: 2 }}>
          <StatusBadge status={item.status} />
          <ChevronRight size={14} color="#9CA3AF" strokeWidth={2} />
        </View>
      </View>
    </Pressable>
  );
}

// ── UpcomingCard — used in "Upcoming Cases" list ──────────────────────────────
// Layout: calendar badge + case type (left) · title + court + time · status badge (right)
export function UpcomingCard({ item, onPress }: { item: Case; onPress?: () => void }) {
  const router = useRouter();
  const handlePress = onPress ?? (() => router.push(`/(app)/case/${item.id}`));
  const time    = formatTime(item.hearing_time);
  const dateLbl = item.hearing_date ? formatUpcomingDate(item.hearing_date) : null;

  return (
    <Pressable onPress={handlePress}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14 }}>
        {/* Calendar badge — left column */}
        <View style={{ marginRight: 10, flexShrink: 0, marginTop: 2, width: BADGE_W, alignItems: 'center' }}>
          {item.hearing_date
            ? <CalendarBadge dateStr={item.hearing_date} />
            : <View style={{ width: BADGE_W, height: BADGE_W, borderRadius: BADGE_W * 0.2, backgroundColor: '#f1f5f9' }} />}
        </View>

        {/* Content */}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#111827', lineHeight: 17 }} numberOfLines={2}>
            {item.case_title}
          </Text>
          <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#6B7280', lineHeight: 15 }} numberOfLines={1}>
            {item.court_name}{item.court_room ? `, Court Room ${item.court_room}` : ''}
          </Text>
          {(dateLbl || time) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              {dateLbl ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <CalendarDays size={9} color="#0078ff" strokeWidth={2} />
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#0078ff' }}>{dateLbl}</Text>
                </View>
              ) : null}
              {time ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} color="#0078ff" strokeWidth={2} />
                  <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff' }}>{time}</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>

        {/* Badge column — status only (right) */}
        <View style={{ marginLeft: 8, flexShrink: 0, marginTop: 2 }}>
          <StatusBadge status={item.status} />
        </View>
      </View>
    </Pressable>
  );
}

// ── HearingCard — used in the Hearings tab list ───────────────────────────────
// Layout: calendar badge + case type (left) · title + court + time · status badge (right)
export function HearingCard({ item, onPress }: { item: Case; onPress?: () => void }) {
  const router = useRouter();
  const handlePress = onPress ?? (() => router.push(`/(app)/case/${item.id}`));
  const time    = formatTime(item.hearing_time);
  const dateLbl = item.hearing_date ? formatUpcomingDate(item.hearing_date) : null;

  return (
    <Pressable onPress={handlePress}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 12, paddingHorizontal: 14 }}>
        {/* Calendar badge — left column */}
        <View style={{ marginRight: 10, flexShrink: 0, marginTop: 2, width: BADGE_W, alignItems: 'center' }}>
          {item.hearing_date
            ? <CalendarBadge dateStr={item.hearing_date} />
            : <CourtIcon courtName={item.court_name} />}
        </View>

        {/* Content */}
        <View style={{ flex: 1, gap: 2 }}>
          <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#111827', lineHeight: 17 }} numberOfLines={2}>
            {item.case_title}
          </Text>
          <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#6B7280', lineHeight: 15 }} numberOfLines={1}>
            {item.court_name}{item.court_room ? `, Court Room ${item.court_room}` : ''}
          </Text>
          {(dateLbl || time) ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: 2 }}>
              {dateLbl ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <CalendarDays size={9} color="#0078ff" strokeWidth={2} />
                  <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#0078ff' }}>{dateLbl}</Text>
                </View>
              ) : null}
              {time ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
                  <Clock size={10} color="#0078ff" strokeWidth={2} />
                  <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#0078ff' }}>{time}</Text>
                </View>
              ) : null}
            </View>
          ) : (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 2 }}>
              <CalendarDays size={9} color="#F59E0B" strokeWidth={2} />
              <Text style={{ fontSize: 11, fontFamily: F.semiBold, color: '#F59E0B' }}>No hearing scheduled</Text>
            </View>
          )}
        </View>

        {/* Badge column — status only (right) */}
        <View style={{ marginLeft: 8, flexShrink: 0, marginTop: 2 }}>
          <StatusBadge status={item.status} />
        </View>
      </View>
    </Pressable>
  );
}

// ── CaseCard — legacy wrapper ─────────────────────────────────────────────────
export function CaseCard({ item }: CaseCardProps) {
  return <UpcomingCard item={item} />;
}
