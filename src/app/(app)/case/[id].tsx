import { useState, useCallback, useRef } from 'react';

// Module-level cache: stores last-fetched case data keyed by case id.
// Survives component unmount/remount so returning to the same case
// shows content immediately (from cache) while a silent background
// refresh keeps the data up to date.
// Exported so Hearings/Calendar screens can pre-seed it on card tap.
export const caseCache: Record<string, { caseData: Case; hearingHistory: HearingHistory[] }> = {};
import {
  View,
  Text,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  Modal,
  KeyboardAvoidingView,
  Platform,
  Image as RNImage,
} from 'react-native';
import { Image as _Image } from 'expo-image';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import {
  ArrowLeft, Users, Calendar,
  Clock, Gavel, AlertCircle,
  PenLine, CheckCircle2,
  XCircle, ChevronDown, ChevronUp,
  Trash2, ShieldAlert, ExternalLink,
  Scale, FileText, Siren, RotateCcw,
  X,
} from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { CALENDAR_STYLES } from '@/lib/calendarStyles';
import * as WebBrowser from 'expo-web-browser';
import { getCaseById, updateCase, deleteCase, getHearingHistory, addHearingHistory } from '@/db/api';
import { UpdateHearingModal } from '@/components/UpdateHearingModal';
import { supabase, fnClient } from '@/client/supabase';
import type { Case, ECourtHistoryRow, ECourtOrderRow, ActRow, FirDetails, PartyInfo, HearingHistory } from '@/types/types';
import { STATUS_COLORS as _STATUS_COLORS, STATUS_LABELS as _STATUS_LABELS, CASE_TYPES, type CaseStatus } from '@/types/types';
import { StatusBadge } from '@/components/StatusBadge';
import { getCourtIconUrl } from '@/components/CaseCard';
import { F } from '@/lib/fonts';
import { TimePickerField } from '@/components/TimePickerField';

function fmtDate(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function fmtDateShort(dateStr: string | null | undefined): string {
  if (!dateStr) return '—';
  const d = new Date(dateStr + 'T00:00:00');
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yy = String(d.getFullYear()).slice(-2);
  return `${dd}/${mm}/${yy}`;
}

function fmtTime(timeStr: string | null | undefined): string {
  if (!timeStr) return '';
  const [h, m] = timeStr.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${ampm}`;
}

// ── Sub-components ────────────────────────────────────────────────────────────

/** Two-column info field: UPPERCASE LABEL + bold value */
function InfoField({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 9, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', lineHeight: 16 }}>{value}</Text>
    </View>
  );
}

/** Full-width info row: UPPERCASE LABEL + bold value with bottom border */
function InfoRowFull({ label, value }: { label: string; value: string | null | undefined }) {
  if (!value) return null;
  return (
    <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eaeef4' }}>
      <Text style={{ fontSize: 9, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 }}>{label}</Text>
      <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', lineHeight: 16 }}>{value}</Text>
    </View>
  );
}

/** Derive a badge for a timeline item purpose string */
function getTimelineBadge(purpose: string): { label: string; bg: string; text: string } | null {
  const p = purpose.toLowerCase();
  if (p.includes('adjour'))                              return { label: 'Adjourned', bg: '#dee3e8', text: '#424753' };
  if (p.includes('admit'))                               return { label: 'Admitted',  bg: '#89fa9b', text: '#005320' };
  if (p.includes('filed') || p.includes('regist'))       return { label: 'Filed',     bg: '#d8e2ff', text: '#004494' };
  if (p.includes('dispos') || p.includes('decid'))       return { label: 'Disposed',  bg: '#89fa9b', text: '#005320' };
  if (p.includes('pending'))                             return { label: 'Pending',   bg: '#d8e2ff', text: '#004494' };
  if (p.includes('urgent'))                              return { label: 'Urgent',    bg: '#ffdad6', text: '#93000a' };
  return null;
}

// ── eCourts Section Heading ───────────────────────────────────────────────────
function SectionCard({ title, icon: Icon, iconColor, children }: {
  title: string;
  icon?: any;
  iconColor?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={{
      backgroundColor: '#ffffff', borderRadius: 20, marginBottom: 14,
      boxShadow: '0 2px 10px rgba(0,0,0,0.06)', overflow: 'hidden',
    }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingHorizontal: 18, paddingTop: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f4fa' }}>
        {Icon && (
          <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: `${iconColor ?? '#0058bd'}18`, alignItems: 'center', justifyContent: 'center' }}>
            <Icon size={14} color={iconColor ?? '#0058bd'} strokeWidth={2.2} />
          </View>
        )}
        <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', flex: 1 }}>{title}</Text>
      </View>
      <View style={{ paddingHorizontal: 18, paddingBottom: 16, paddingTop: 12 }}>
        {children}
      </View>
    </View>
  );
}

// ── Parties Card ──────────────────────────────────────────────────────────────
function PartiesCard({ petParties, respParties, petitioner, respondent, petAdv, respAdv }: {
  petParties: PartyInfo[] | null;
  respParties: PartyInfo[] | null;
  petitioner: string | null;
  respondent: string | null;
  petAdv: string | null;
  respAdv: string | null;
}) {
  // Build display lists: prefer detailed parties, fallback to flat strings
  const petList: PartyInfo[] = petParties?.length
    ? petParties
    : petitioner ? [{ name: petitioner, advocate: petAdv }] : [];
  const respList: PartyInfo[] = respParties?.length
    ? respParties
    : respondent ? [{ name: respondent, advocate: respAdv }] : [];

  if (!petList.length && !respList.length) return null;

  const PartyBlock = ({ parties, label, dotColor }: { parties: PartyInfo[]; label: string; dotColor: string }) => (
    <View style={{ flex: 1 }}>
      <Text style={{ fontSize: 9, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 8 }}>{label}</Text>
      {parties.map((p, i) => (
        <View key={i} style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: i < parties.length - 1 ? 10 : 0 }}>
          <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: dotColor, marginTop: 4, flexShrink: 0 }} />
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 11.5, fontFamily: F.bold, color: '#171c20', lineHeight: 17 }}>{p.name}</Text>
            {p.advocate ? (
              <Text style={{ fontSize: 10.5, fontFamily: F.regular, color: '#0058bd', marginTop: 1, lineHeight: 15 }}>
                Adv. {p.advocate}
              </Text>
            ) : null}
          </View>
        </View>
      ))}
    </View>
  );

  return (
    <SectionCard title="Parties" icon={Users} iconColor="#0058bd">
      <View style={{ flexDirection: 'row', gap: 14 }}>
        {petList.length > 0 && <PartyBlock parties={petList} label="Petitioner(s)" dotColor="#0058bd" />}
        {petList.length > 0 && respList.length > 0 && <View style={{ width: 1, backgroundColor: '#eaeef4', alignSelf: 'stretch' }} />}
        {respList.length > 0 && <PartyBlock parties={respList} label="Respondent(s)" dotColor="#ba1a1a" />}
      </View>
    </SectionCard>
  );
}

// ── Acts & Sections Card ──────────────────────────────────────────────────────
function ActsCard({ acts }: { acts: ActRow[] | null }) {
  if (!acts || acts.length === 0) return null;

  return (
    <SectionCard title="Acts & Sections" icon={Scale} iconColor="#7C3AED">
      {/* Table header */}
      <View style={{ flexDirection: 'row', backgroundColor: '#F5F3FF', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 10, marginBottom: 6 }}>
        <Text style={{ flex: 3, fontSize: 9, fontFamily: F.bold, color: '#7C3AED', letterSpacing: 0.5, textTransform: 'uppercase' }}>Under Act</Text>
        <Text style={{ flex: 2, fontSize: 9, fontFamily: F.bold, color: '#7C3AED', letterSpacing: 0.5, textTransform: 'uppercase' }}>Under Section(s)</Text>
      </View>
      {acts.map((row, i) => (
        <View
          key={i}
          style={{
            flexDirection: 'row',
            paddingVertical: 9,
            paddingHorizontal: 10,
            borderBottomWidth: i < acts.length - 1 ? 1 : 0,
            borderBottomColor: '#f0f4fa',
          }}
        >
          <Text style={{ flex: 3, fontSize: 15, fontFamily: F.semiBold, color: '#171c20', lineHeight: 16, paddingRight: 8 }}>{row.act}</Text>
          <Text style={{ flex: 2, fontSize: 15, fontFamily: F.regular, color: '#424753', lineHeight: 16 }}>{row.sections}</Text>
        </View>
      ))}
    </SectionCard>
  );
}

// ── FIR Details Card ──────────────────────────────────────────────────────────
function FirCard({ fir }: { fir: FirDetails | null }) {
  if (!fir || (!fir.police_station && !fir.fir_number)) return null;

  const rows: { label: string; value: string }[] = [];
  if (fir.police_station) rows.push({ label: 'Police Station', value: fir.police_station });
  if (fir.fir_number)     rows.push({ label: 'FIR Number', value: fir.fir_number });
  if (fir.year)           rows.push({ label: 'Year', value: fir.year });

  return (
    <SectionCard title="FIR Details" icon={Siren} iconColor="#DC2626">
      <View style={{ backgroundColor: '#FFF5F5', borderRadius: 10, overflow: 'hidden' }}>
        {rows.map((r, i) => (
          <View
            key={r.label}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 10,
              paddingHorizontal: 12,
              borderBottomWidth: i < rows.length - 1 ? 1 : 0,
              borderBottomColor: '#fee2e2',
            }}
          >
            <Text style={{ flex: 1.2, fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.4, textTransform: 'uppercase', paddingRight: 6 }}>{r.label}</Text>
            <Text style={{ flex: 2, fontSize: 14, fontFamily: F.bold, color: '#DC2626', flexShrink: 1 }}>{r.value}</Text>
          </View>
        ))}
      </View>
    </SectionCard>
  );
}

// ── eCourts Case History Table ─────────────────────────────────────────────────
function CaseHistoryTable({ history, orders }: { history: ECourtHistoryRow[]; orders: ECourtOrderRow[] }) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 5;

  // Sort history: most recent business date first
  const sorted = [...history].sort((a, b) => {
    const da = a.business_date ?? a.hearing_date ?? '';
    const db = b.business_date ?? b.hearing_date ?? '';
    return db > da ? 1 : db < da ? -1 : 0;
  });

  const visible = expanded ? sorted : sorted.slice(0, LIMIT);

  if (sorted.length === 0 && orders.length === 0) return null;

  const purposeChip = (purpose: string) => {
    const p = purpose.toLowerCase();
    if (p.includes('dispos') || p.includes('decid')) return { bg: '#DCFCE7', text: '#15803D' };
    if (p.includes('hearing'))                        return { bg: '#EFF6FF', text: '#1D4ED8' };
    if (p.includes('adjour'))                         return { bg: '#F3F4F6', text: '#374151' };
    if (p.includes('admit'))                          return { bg: '#F0FDF4', text: '#166534' };
    return { bg: '#F3F4F6', text: '#374151' };
  };

  return (
    <SectionCard title="Case History" icon={FileText} iconColor="#0058bd">
      {/* Table header — matches eCourts column layout */}
      <View style={{ flexDirection: 'row', backgroundColor: '#EFF6FF', borderRadius: 8, paddingVertical: 7, paddingHorizontal: 0, marginBottom: 4 }}>
        <Text style={{ flex: 2.5, fontSize: 8.5, fontFamily: F.bold, color: '#1D4ED8', letterSpacing: 0.4, textTransform: 'uppercase', paddingLeft: 10 }}>Judge</Text>
        <Text style={{ flex: 1.3, fontSize: 8.5, fontFamily: F.bold, color: '#1D4ED8', letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }}>Biz Date</Text>
        <Text style={{ flex: 1.3, fontSize: 8.5, fontFamily: F.bold, color: '#1D4ED8', letterSpacing: 0.4, textTransform: 'uppercase', textAlign: 'center' }}>Hearing</Text>
        <Text style={{ flex: 1.8, fontSize: 8.5, fontFamily: F.bold, color: '#1D4ED8', letterSpacing: 0.4, textTransform: 'uppercase', paddingRight: 10, textAlign: 'right' }}>Purpose</Text>
      </View>

      {visible.map((row, i) => {
        const chip = row.purpose ? purposeChip(row.purpose) : null;
        return (
          <View
            key={`${row.business_date}-${row.hearing_date}-${i}`}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              paddingVertical: 9,
              borderBottomWidth: i < visible.length - 1 ? 1 : 0,
              borderBottomColor: '#f0f4fa',
            }}
          >
            <Text style={{ flex: 2.5, fontSize: 10.5, fontFamily: F.regular, color: '#424753', lineHeight: 14, paddingLeft: 10, paddingRight: 4 }} numberOfLines={2}>
              {row.judge || '—'}
            </Text>
            <Text style={{ flex: 1.3, fontSize: 10, fontFamily: F.semiBold, color: '#171c20', textAlign: 'center' }} numberOfLines={1}>
              {row.business_date ? fmtDateShort(row.business_date) : '—'}
            </Text>
            <Text style={{ flex: 1.3, fontSize: 10, fontFamily: F.semiBold, color: '#0058bd', textAlign: 'center' }} numberOfLines={1}>
              {row.hearing_date ? fmtDateShort(row.hearing_date) : '—'}
            </Text>
            <View style={{ flex: 1.8, alignItems: 'flex-end', paddingRight: 10 }}>
              {chip ? (
                <View style={{ backgroundColor: chip.bg, borderRadius: 6, paddingHorizontal: 6, paddingVertical: 3 }}>
                  <Text style={{ fontSize: 9, fontFamily: F.semiBold, color: chip.text }} numberOfLines={1}>{row.purpose}</Text>
                </View>
              ) : <Text style={{ fontSize: 10.5, color: '#727785', fontFamily: F.regular }}>—</Text>}
            </View>
          </View>
        );
      })}

      {/* Show more */}
      {sorted.length > LIMIT && (
        <Pressable
          onPress={() => setExpanded(!expanded)}
          style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 8, paddingVertical: 9, borderRadius: 10, backgroundColor: '#EFF6FF' }}
        >
          {expanded
            ? <ChevronUp size={11} color="#0058bd" strokeWidth={2.5} />
            : <ChevronDown size={11} color="#0058bd" strokeWidth={2.5} />}
          <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#0058bd' }}>
            {expanded ? 'Show Less' : `Show all ${sorted.length} hearings`}
          </Text>
        </Pressable>
      )}

      {/* Final Orders sub-section */}
      {orders.length > 0 && (
        <View style={{ marginTop: 14, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#EFF6FF' }}>
          <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 8 }}>Final Orders / Judgements</Text>
          {orders.map((o) => (
            <View key={o.order_number} style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#f0f4fa' }}>
              <View style={{ width: 28, height: 28, borderRadius: 8, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0058bd' }}>#{o.order_number}</Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#171c20' }}>
                  {o.order_details || `Order ${o.order_number}`}
                  {o.order_date ? <Text style={{ fontFamily: F.regular, color: '#727785' }}>{`  ·  ${fmtDateShort(o.order_date)}`}</Text> : null}
                </Text>
              </View>
              {o.pdf_url ? (
                <Pressable
                  onPress={() => WebBrowser.openBrowserAsync(o.pdf_url!)}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 4, backgroundColor: '#EFF6FF', borderRadius: 8, paddingHorizontal: 8, paddingVertical: 5 }}
                >
                  <ExternalLink size={11} color="#0058bd" strokeWidth={2} />
                  <Text style={{ fontSize: 10.5, fontFamily: F.semiBold, color: '#0058bd' }}>PDF</Text>
                </Pressable>
              ) : null}
            </View>
          ))}
        </View>
      )}
    </SectionCard>
  );
}

// ── Hearing Timeline — matches the screenshot design ─────────────────────────

function HearingTimeline({
  caseData,
  history,
  orders,
  hearingHistoryRecords,
}: {
  caseData: Case;
  history: ECourtHistoryRow[];
  orders: ECourtOrderRow[];
  hearingHistoryRecords: HearingHistory[];
}) {
  const [expanded, setExpanded] = useState(false);
  const LIMIT = 5;

  interface TLItem {
    key: string;
    isNext: boolean;
    title: string;
    badge: { label: string; bg: string; text: string } | null;
    roomLabel?: string | null;
    date: string | null;
    time?: string | null;
    desc?: string | null;
    pdfUrl?: string | null;
  }

  const items: TLItem[] = [];

  // First item: Next Hearing (from case fields)
  if (caseData.hearing_date) {
    items.push({
      key: 'next',
      isNext: true,
      title: 'Next Hearing',
      badge: null,
      roomLabel: caseData.court_room ? `Court Room ${caseData.court_room}` : null,
      date: caseData.hearing_date,
      time: caseData.hearing_time,
      desc: caseData.notes ?? null,
    });
  }

  // Manual hearing date history (rescheduled dates), newest first
  const sortedManualHistory = [...hearingHistoryRecords].sort((a, b) =>
    (b.hearing_date > a.hearing_date ? 1 : -1)
  );
  for (const rec of sortedManualHistory) {
    items.push({
      key: `mh-${rec.id}`,
      isNext: false,
      title: 'Previous Hearing Date',
      badge: { label: 'Rescheduled', bg: '#FEF3C7', text: '#92400E' },
      date: rec.hearing_date,
      time: rec.hearing_time,
      desc: rec.notes ?? null,
    });
  }

  // History rows (newest first)
  const sortedHistory = [...history].sort((a, b) => {
    const da = a.business_date ?? '';
    const db = b.business_date ?? '';
    return db > da ? 1 : db < da ? -1 : 0;
  });
  for (const row of sortedHistory) {
    items.push({
      key: `h-${row.business_date}-${row.purpose}`,
      isNext: false,
      title: row.purpose || 'Hearing',
      badge: row.purpose ? getTimelineBadge(row.purpose) : null,
      date: row.business_date ?? null,
      desc: null,
    });
  }

  // Order items
  for (const o of orders) {
    items.push({
      key: `o-${o.order_number}`,
      isNext: false,
      title: `Order ${o.order_number}`,
      badge: { label: 'Order', bg: '#d8e2ff', text: '#004494' },
      date: o.order_date ?? null,
      pdfUrl: o.pdf_url,
    });
  }

  // Case Filed (if filing_date present and not already in history)
  if (caseData.filing_date) {
    items.push({
      key: 'filed',
      isNext: false,
      title: 'Case Filed',
      badge: { label: 'Admitted', bg: '#89fa9b', text: '#005320' },
      date: caseData.filing_date,
      desc: 'Initial petition filed and scrutinized.',
    });
  }

  const visible = expanded ? items : items.slice(0, LIMIT);

  if (items.length === 0) return null;

  return (
    <View style={{
      backgroundColor: '#ffffff',
      borderRadius: 24,
      marginBottom: 16,
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
      overflow: 'hidden',
    }}>
      {/* Section title */}
      <View style={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 16 }}>
        <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20' }}>Hearing Timeline</Text>
      </View>

      {/* Timeline items */}
      <View style={{ paddingHorizontal: 20, paddingBottom: 16 }}>
        {visible.map((item, idx) => {
          const isLast = idx === visible.length - 1;
          const dotColor = item.isNext ? '#0058bd' : '#c2c6d5';
          const dotSize  = item.isNext ? 12 : 10;

          return (
            <View key={item.key} style={{ flexDirection: 'row' }}>
              {/* Spine */}
              <View style={{ width: 24, alignItems: 'center', marginRight: 14 }}>
                <View style={{
                  width: dotSize, height: dotSize,
                  borderRadius: dotSize / 2,
                  backgroundColor: dotColor,
                  marginTop: 4,
                  zIndex: 1,
                }} />
                {!isLast && (
                  <View style={{ width: 2, flex: 1, backgroundColor: '#eaeef4', marginTop: 3, marginBottom: 0 }} />
                )}
              </View>

              {/* Content */}
              <View style={{ flex: 1, paddingBottom: isLast ? 0 : 20 }}>
                {/* Title row + badge */}
                <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', flex: 1, marginRight: 8 }}>{item.title}</Text>
                  {item.roomLabel ? (
                    <View style={{ backgroundColor: '#f0f4fa', borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 9, fontFamily: F.semiBold, color: '#424753' }}>{item.roomLabel}</Text>
                    </View>
                  ) : item.badge ? (
                    <View style={{ backgroundColor: item.badge.bg, borderRadius: 999, paddingHorizontal: 9, paddingVertical: 3 }}>
                      <Text style={{ fontSize: 9, fontFamily: F.semiBold, color: item.badge.text }}>{item.badge.label}</Text>
                    </View>
                  ) : null}
                </View>

                {/* Date • Time */}
                {item.date ? (
                  <Text style={{
                    fontSize: 15, fontFamily: F.semiBold,
                    color: item.isNext ? '#0058bd' : '#727785',
                    marginBottom: item.desc || item.pdfUrl ? 4 : 0,
                  }}>
                    {fmtDateShort(item.date)}{item.time ? ` • ${fmtTime(item.time)}` : ''}
                  </Text>
                ) : null}

                {/* Description */}
                {item.desc ? (
                  <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#EA4335', lineHeight: 16 }}>{item.desc}</Text>
                ) : null}

                {/* PDF button for orders */}
                {item.pdfUrl ? (
                  <Pressable
                    onPress={() => WebBrowser.openBrowserAsync(item.pdfUrl!)}
                    style={{ flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 4, alignSelf: 'flex-start' }}
                  >
                    <ExternalLink size={10} color="#0058bd" strokeWidth={2} />
                    <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#0058bd' }}>View PDF</Text>
                  </Pressable>
                ) : null}
              </View>
            </View>
          );
        })}

        {/* Show more / less */}
        {items.length > LIMIT && (
          <Pressable
            onPress={() => setExpanded(!expanded)}
            style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6, marginTop: 4, paddingVertical: 10, borderRadius: 10, backgroundColor: '#f0f4fa' }}
          >
            {expanded
              ? <ChevronUp size={11} color="#0058bd" strokeWidth={2.5} />
              : <ChevronDown size={11} color="#0058bd" strokeWidth={2.5} />}
            <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#0058bd' }}>
              {expanded ? 'Show Less' : `Show all ${items.length} entries`}
            </Text>
          </Pressable>
        )}
      </View>
    </View>
  );
}

// ── Edit Case Modal ───────────────────────────────────────────────────────────

function EditField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  keyboardType?: 'default' | 'numeric' | 'email-address';
}) {
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 }}>
        {label}
      </Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}…`}
        placeholderTextColor="#1a1a1a"
        keyboardType={keyboardType ?? 'default'}
        multiline={multiline}
        numberOfLines={multiline ? 3 : 1}
        underlineColorAndroid="transparent"
        style={{
          backgroundColor: '#f6faff',
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: '#dee3e8',
          paddingHorizontal: 13,
          paddingVertical: 11,
          fontSize: 15,
          fontFamily: F.bold,
          color: '#171c20',
          textAlignVertical: multiline ? 'top' : 'center',
          minHeight: multiline ? 80 : undefined,
          outlineStyle: 'none' as any,
        }}
      />
    </View>
  );
}

function SelectField<T extends string>({
  label,
  value,
  options,
  onSelect,
  getLabel,
}: {
  label: string;
  value: T;
  options: T[];
  onSelect: (v: T) => void;
  getLabel?: (v: T) => string;
}) {
  const [open, setOpen] = useState(false);
  const displayLabel = getLabel ? getLabel(value) : value;

  return (
    <>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 }}>
          {label}
        </Text>
        {/* Trigger — identical style to EditField, no color chip */}
        <Pressable
          onPress={() => setOpen(true)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: '#f6faff', borderRadius: 10,
            borderWidth: 1.5, borderColor: '#dee3e8',
            paddingHorizontal: 13, paddingVertical: 11,
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, fontFamily: F.bold, color: '#171c20' }}>
            {displayLabel}
          </Text>
          <ChevronDown size={14} color="#9ca3af" strokeWidth={2} />
        </Pressable>
      </View>

      {/* Options bottom-sheet modal */}
      <Modal visible={open} transparent animationType="fade">
        <Pressable
          style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.4)', justifyContent: 'flex-end' }}
          onPress={() => setOpen(false)}
        >
          <Pressable
            onPress={e => e.stopPropagation()}
            style={{ backgroundColor: '#fff', borderTopLeftRadius: 22, borderTopRightRadius: 22, paddingBottom: 36 }}
          >
            <View style={{ alignItems: 'center', paddingTop: 12, paddingBottom: 10 }}>
              <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: '#dee3e8' }} />
            </View>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', paddingHorizontal: 18, marginBottom: 8 }}>
              Select {label}
            </Text>
            {options.map((opt, i) => {
              const active = opt === value;
              return (
                <Pressable
                  key={opt}
                  onPress={() => { onSelect(opt); setOpen(false); }}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 12,
                    paddingHorizontal: 18, paddingVertical: 14,
                    backgroundColor: active ? '#f6f8fa' : '#fff',
                    borderTopWidth: i === 0 ? 0 : 1, borderTopColor: '#f3f4f6',
                  }}
                >
                  <Text style={{ flex: 1, fontSize: 15, fontFamily: active ? F.bold : F.regular, color: '#171c20' }}>
                    {getLabel ? getLabel(opt) : opt}
                  </Text>
                  {active && (
                    <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#374151' }}>✓</Text>
                  )}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}

function EditCaseModal({
  visible,
  caseData,
  onCancel,
  onSave,
}: {
  visible: boolean;
  caseData: Case;
  onCancel: () => void;
  onSave: (patch: Partial<Case>) => Promise<void>;
}) {
  const [saving, setSaving] = useState(false);

  // Editable fields
  const [caseTitle, setCaseTitle]       = useState(caseData.case_title ?? '');
  const [cnrNumber, setCnrNumber]       = useState(caseData.cnr_number ?? '');
  const [clientName, setClientName]     = useState(caseData.client_name ?? '');
  const [opponentName, setOpponentName] = useState(caseData.opponent_name ?? '');
  const [courtName, setCourtName]       = useState(caseData.court_name ?? '');
  const [judgeName, setJudgeName]       = useState(caseData.judge_name ?? '');
  const [caseType, setCaseType]         = useState(caseData.case_type ?? '');
  const [caseNumber, setCaseNumber]     = useState(caseData.case_number ?? '');
  const [courtRoom, setCourtRoom]       = useState(caseData.court_room ?? '');
  const [hearingTime, setHearingTime]   = useState(caseData.hearing_time ?? '');
  const [status, setStatus]             = useState<CaseStatus>(caseData.status);
  const [notes, setNotes]               = useState(caseData.notes ?? '');

  // Date picker
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [hearingDate, setHearingDate]       = useState<Date | null>(
    caseData.hearing_date ? new Date(caseData.hearing_date + 'T00:00:00') : null
  );

  const toDateStr = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const handleSave = async () => {
    setSaving(true);
    await onSave({
      case_title:    caseTitle.trim()    || caseData.case_title,
      cnr_number:    cnrNumber.trim()    || null,
      client_name:   clientName.trim()   || null,
      opponent_name: opponentName.trim() || null,
      court_name:    courtName.trim()    || caseData.court_name,
      judge_name:    judgeName.trim()    || null,
      case_type:     caseType.trim()     || null,
      case_number:   caseNumber.trim()   || null,
      court_room:    courtRoom.trim()    || null,
      hearing_date:  hearingDate ? toDateStr(hearingDate) : null,
      hearing_time:  hearingTime.trim()  || null,
      status,
      notes:         notes.trim()        || null,
    });
    setSaving(false);
  };

  const STATUS_OPTIONS: { value: CaseStatus; label: string; bg: string; text: string; activeBg: string }[] = [
    { value: 'pending',   label: 'Pending',   bg: '#f3f4f6', text: '#374151', activeBg: '#6B7280' },
    { value: 'ongoing',   label: 'Ongoing',   bg: '#dbeafe', text: '#1d4ed8', activeBg: '#2563EB' },
    { value: 'urgent',    label: 'Urgent',    bg: '#fee2e2', text: '#b91c1c', activeBg: '#DC2626' },
    { value: 'adjourned', label: 'Adjourned', bg: '#fef3c7', text: '#92400e', activeBg: '#D97706' },
    { value: 'completed', label: 'Disposed',  bg: '#d1fae5', text: '#065f46', activeBg: '#059669' },
  ];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet">
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f6faff' }} edges={['top', 'bottom']}>
        {/* Header */}
        <View style={{
          flexDirection: 'row', alignItems: 'center',
          paddingHorizontal: 16, paddingVertical: 12,
          backgroundColor: '#ffffff',
          borderBottomWidth: 1, borderBottomColor: '#dee3e8',
        }}>
          <Pressable
            onPress={onCancel}
            hitSlop={8}
            style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center', backgroundColor: '#f3f4f6' }}
          >
            <X size={18} color="#374151" strokeWidth={2.5} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 16, fontFamily: F.bold, color: '#171c20' }}>
            Edit Case
          </Text>
          <Pressable
            onPress={handleSave}
            disabled={saving}
            style={{
              paddingHorizontal: 18, paddingVertical: 8,
              backgroundColor: saving ? '#93c5fd' : '#0058bd',
              borderRadius: 10, alignItems: 'center', justifyContent: 'center',
              minWidth: 64,
            }}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>Save</Text>}
          </Pressable>
        </View>

        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={{ flex: 1 }}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            keyboardShouldPersistTaps="handled"
          >

            {/* ── Section: Case Info ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
                📋 Case Info
              </Text>
              {/* Case Title — full width */}
              <EditField label="Case Title" value={caseTitle} onChangeText={setCaseTitle} />
              {/* Case Number + CNR — 2-column */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <EditField label="Case Number" value={caseNumber} onChangeText={setCaseNumber} />
                </View>
                <View style={{ flex: 1 }}>
                  <EditField label="CNR Number" value={cnrNumber} onChangeText={setCnrNumber} placeholder="e.g. MHCC010012342023" />
                </View>
              </View>
              {/* Case Type + Status — dropdown selectors */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <SelectField<string>
                    label="Case Type"
                    value={caseType || CASE_TYPES[0]}
                    options={CASE_TYPES}
                    onSelect={setCaseType}
                  />
                </View>
                <View style={{ flex: 1 }}>
                  <SelectField<CaseStatus>
                    label="Status"
                    value={status}
                    options={STATUS_OPTIONS.map(o => o.value)}
                    onSelect={setStatus}
                    getLabel={(v) => STATUS_OPTIONS.find(o => o.value === v)?.label ?? v}
                  />
                </View>
              </View>
              {/* Court Name + Court Room — 2-column */}
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 2 }}>
                  <EditField label="Court Name" value={courtName} onChangeText={setCourtName} />
                </View>
                <View style={{ flex: 1 }}>
                  <EditField label="Court Room" value={courtRoom} onChangeText={setCourtRoom} placeholder="e.g. 5" />
                </View>
              </View>
            </View>

            {/* ── Section: Hearing ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
                📅 Next Hearing
              </Text>

              {/* Date + Time triggers — side-by-side */}
              <View style={{ flexDirection: 'row', gap: 10, marginBottom: showDatePicker ? 0 : 0 }}>
                {/* Hearing Date */}
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 }}>
                    Hearing Date
                  </Text>
                  <Pressable
                    onPress={() => setShowDatePicker(!showDatePicker)}
                    style={{
                      flexDirection: 'row', alignItems: 'center', gap: 8,
                      backgroundColor: '#f6faff', borderRadius: 10,
                      borderWidth: 1.5, borderColor: showDatePicker ? '#0078ff' : '#dee3e8',
                      paddingHorizontal: 11, paddingVertical: 11,
                    }}
                  >
                    <Calendar size={14} color={showDatePicker ? '#0078ff' : '#9ca3af'} strokeWidth={2} />
                    <Text style={{ flex: 1, fontSize: 12.5, fontFamily: hearingDate ? F.bold : F.regular, color: hearingDate ? '#171c20' : '#9ca3af' }} numberOfLines={1}>
                      {hearingDate
                        ? `${String(hearingDate.getDate()).padStart(2,'0')}/${String(hearingDate.getMonth()+1).padStart(2,'0')}/${hearingDate.getFullYear()}`
                        : 'Select date…'}
                    </Text>
                    {hearingDate
                      ? <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setHearingDate(null); setShowDatePicker(false); }}>
                          <X size={12} color="#9ca3af" strokeWidth={2.5} />
                        </Pressable>
                      : <ChevronDown size={12} color="#9ca3af" strokeWidth={2} />}
                  </Pressable>
                </View>

                {/* Hearing Time */}
                <View style={{ flex: 1 }}>
                  <TimePickerField value={hearingTime} onChange={setHearingTime} />
                </View>
              </View>

              {/* Calendar — expands full-width below both triggers */}
              {showDatePicker && (
                <View style={{ marginTop: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#dee3e8' }}>
                  <DateTimePicker
                    mode="single"
                    date={hearingDate ?? new Date()}
                    onChange={({ date }) => {
                      if (date) { setHearingDate(new Date(date as any)); }
                      setShowDatePicker(false);
                    }}
                    styles={CALENDAR_STYLES}
                  />
                </View>
              )}
            </View>

            {/* ── Section: Judge ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
                ⚖️ Judge
              </Text>
              <EditField label="Judge Name" value={judgeName} onChangeText={setJudgeName} />
            </View>

            {/* ── Section: Parties — 2-column ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
                👥 Parties
              </Text>
              <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                  <EditField label="Client (Petitioner)" value={clientName} onChangeText={setClientName} />
                </View>
                <View style={{ flex: 1 }}>
                  <EditField label="Opponent (Respondent)" value={opponentName} onChangeText={setOpponentName} />
                </View>
              </View>
            </View>

            {/* ── Section: Notes — full width ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
                📝 My Notes
              </Text>
              <EditField
                label="Notes"
                value={notes}
                onChangeText={setNotes}
                placeholder="Add notes about this case…"
                multiline
              />
            </View>

          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Delete Confirmation Modals ────────────────────────────────────────────────

const DELETE_PIN = '1707';

function DeleteConfirmModal({
  visible,
  caseName,
  onCancel,
  onConfirm,
}: {
  visible: boolean;
  caseName: string;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 }}>
          <View style={{ alignItems: 'center', marginBottom: 16 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <Trash2 size={26} color="#DC2626" strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 18, fontFamily: F.bold, color: '#111827', marginBottom: 8, textAlign: 'center' }}>Delete Case?</Text>
            <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 20 }}>
              This will permanently remove{'\n'}
              <Text style={{ fontFamily: F.bold, color: '#111827' }}>{caseName}</Text>
              {'\n'}and all its data. This cannot be undone.
            </Text>
          </View>
          <View style={{ flexDirection: 'row', gap: 12, marginTop: 8 }}>
            <Pressable
              onPress={onCancel}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#6B7280' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={onConfirm}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, backgroundColor: '#DC2626', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>Yes, Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

function DeletePinModal({
  visible,
  onCancel,
  onSuccess,
}: {
  visible: boolean;
  onCancel: () => void;
  onSuccess: () => void;
}) {
  const [pin, setPin] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState(false);

  const handleConfirm = () => {
    if (pin !== DELETE_PIN) {
      setError('Incorrect code. Please try again.');
      return;
    }
    setDeleting(true);
    onSuccess();
  };

  const handleCancel = () => {
    setPin('');
    setError('');
    setDeleting(false);
    onCancel();
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
        <View style={{ backgroundColor: '#fff', borderRadius: 20, padding: 24, width: '100%', maxWidth: 360 }}>
          <View style={{ alignItems: 'center', marginBottom: 20 }}>
            <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', marginBottom: 12 }}>
              <ShieldAlert size={26} color="#D97706" strokeWidth={2} />
            </View>
            <Text style={{ fontSize: 17, fontFamily: F.bold, color: '#111827', marginBottom: 6, textAlign: 'center' }}>Confirm Deletion</Text>
            <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 19 }}>
              Enter the 4-digit confirmation code to permanently delete this case.
            </Text>
          </View>

          {/* PIN display */}
          <View style={{ backgroundColor: '#FEF3C7', borderRadius: 14, paddingVertical: 14, alignItems: 'center', marginBottom: 16 }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#92400E', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 6 }}>Confirmation Code</Text>
            <Text style={{ fontSize: 32, fontFamily: F.extraBold, color: '#D97706', letterSpacing: 10 }}>{DELETE_PIN}</Text>
          </View>

          {/* PIN input */}
          <TextInput
            value={pin}
            onChangeText={(v) => { setPin(v); setError(''); }}
            placeholder="Enter code here"
            placeholderTextColor="#D1D5DB"
            keyboardType="number-pad"
            maxLength={4}
            style={{
              borderRadius: 12, borderWidth: 1.5,
              borderColor: error ? '#DC2626' : pin.length === 4 ? '#34A853' : '#E5E7EB',
              backgroundColor: '#F9FAFB', paddingHorizontal: 16, paddingVertical: 13,
              fontSize: 22, fontFamily: F.bold, color: '#111827', textAlign: 'center',
              letterSpacing: 10, marginBottom: 8,
              outlineStyle: 'none' as any,
            }}
            underlineColorAndroid="transparent"
          />
          {error ? (
            <Text style={{ fontSize: 12.5, fontFamily: F.medium, color: '#DC2626', textAlign: 'center', marginBottom: 10 }}>{error}</Text>
          ) : <View style={{ height: 18 }} />}

          <View style={{ flexDirection: 'row', gap: 12, marginTop: 4 }}>
            <Pressable
              onPress={handleCancel}
              style={{ flex: 1, paddingVertical: 13, borderRadius: 12, borderWidth: 1.5, borderColor: '#E5E7EB', alignItems: 'center' }}
            >
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#6B7280' }}>Cancel</Text>
            </Pressable>
            <Pressable
              onPress={handleConfirm}
              disabled={pin.length !== 4 || deleting}
              style={{
                flex: 1, paddingVertical: 13, borderRadius: 12,
                backgroundColor: pin.length === 4 ? '#DC2626' : '#F3F4F6',
                alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6,
              }}
            >
              {deleting
                ? <ActivityIndicator color="#fff" size="small" />
                : <Trash2 size={14} color={pin.length === 4 ? '#fff' : '#9CA3AF'} strokeWidth={2.5} />}
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: pin.length === 4 ? '#fff' : '#9CA3AF' }}>Delete</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

// ── Main Screen ───────────────────────────────────────────────────────────────

export default function CaseDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();

  // Seed state from cache immediately — zero-flicker on remount
  const cached = id ? caseCache[id] : undefined;
  const [caseData, setCaseData] = useState<Case | null>(cached?.caseData ?? null);
  const [loading, setLoading] = useState(!cached);
  const [notes, setNotes] = useState(cached?.caseData?.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const [savingNotes, setSavingNotes] = useState(false);

  // Delete flow state
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showDeletePin, setShowDeletePin] = useState(false);

  // Edit case modal
  const [showEditModal, setShowEditModal] = useState(false);

  // Quick "Update Next Date" modal (date-picker only, case pre-selected)
  const [showDateModal, setShowDateModal] = useState(false);

  // Manual hearing date history (logged whenever hearing date is updated)
  const [hearingHistoryRecords, setHearingHistoryRecords] = useState<HearingHistory[]>(cached?.hearingHistory ?? []);

  // eCourts refresh state
  const [refreshing, setRefreshing] = useState(false);
  const [refreshMsg, setRefreshMsg] = useState<{ type: 'ok' | 'err'; text: string } | null>(null);

  const handleRefreshFromEcourts = async () => {
    if (!caseData?.cnr_number || refreshing) return;
    setRefreshMsg(null);
    await triggerAutoRefresh(caseData);
  };

  // Show spinner only when there is truly no data at all (no cache, no prior load).
  // If cache already has this case (pre-seeded from hearings tap or prior visit),
  // always do a silent background refresh so content is visible immediately.
  const initialLoadDone = useRef(false);

  useFocusEffect(
    useCallback(() => {
      if (!id) return;
      // Silent if: re-focus after first load  OR  cache already has data
      const silent = initialLoadDone.current || !!caseCache[id];
      initialLoadDone.current = true;
      loadData(silent);
    }, [id])
  );

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      const [c, hh] = await Promise.all([
        getCaseById(id!),
        getHearingHistory(id!),
      ]);
      if (c) {
        // Populate cache so next remount is instant
        caseCache[id!] = { caseData: c, hearingHistory: hh };
      }
      setCaseData(c);
      setNotes(c?.notes ?? '');
      setHearingHistoryRecords(hh);

      // Auto-refresh from eCourts if case has a CNR but data looks stale:
      // A stale case has its case_title equal to case_number (fallback) or
      // contains no "vs" (meaning party names were never parsed successfully).
      if (c?.cnr_number) {
        const titleLooksStale =
          (c.case_number && c.case_title?.trim() === c.case_number?.trim()) ||
          !c.case_title?.toLowerCase().includes(' vs ');
        if (titleLooksStale) {
          // Trigger background refresh — don't await so screen shows immediately
          triggerAutoRefresh(c);
        }
      }
    } catch {
      // silently handle errors — case detail keeps previous data
    } finally {
      setLoading(false);
    }
  };

  /** Silently re-fetch from eCourts and patch the DB record when stale data is detected */
  const triggerAutoRefresh = async (c: Case) => {
    if (!c.cnr_number || refreshing) return;
    setRefreshing(true);
    try {
      const { data, error } = await fnClient.functions.invoke('fetch-case', {
        body: { crn: c.cnr_number },
        method: 'POST',
      });
      if (error || !data?.success || !data?.case) return;
      const fc = data.case;
      const patch: Partial<Case> = {
        case_title:           fc.case_title          ?? c.case_title,
        case_type:            fc.case_type           ?? c.case_type,
        case_number:          fc.case_number         ?? c.case_number,
        court_name:           fc.court_name          ?? c.court_name,
        judge_name:           fc.judge_name          ?? c.judge_name,
        hearing_date:         fc.hearing_date        ?? c.hearing_date,
        filing_date:          fc.filing_date         ?? c.filing_date,
        registration_date:    fc.registration_date   ?? c.registration_date,
        first_hearing_date:   fc.first_hearing_date  ?? c.first_hearing_date,
        decision_date:        fc.decision_date       ?? c.decision_date,
        nature_of_disposal:   fc.nature_of_disposal  ?? c.nature_of_disposal,
        case_status_label:    fc.case_status_label   ?? c.case_status_label,
        petitioner_advocate:  fc.petitioner_advocate ?? c.petitioner_advocate,
        respondent_advocate:  fc.respondent_advocate ?? c.respondent_advocate,
        ecourts_case_history: fc.case_history        ?? c.ecourts_case_history,
        ecourts_final_orders: fc.final_orders        ?? c.ecourts_final_orders,
        acts_under:           fc.acts_under          ?? c.acts_under,
        fir_details:          fc.fir_details         ?? c.fir_details,
        petitioner_parties:   fc.petitioner_parties?.length ? fc.petitioner_parties : c.petitioner_parties,
        respondent_parties:   fc.respondent_parties?.length ? fc.respondent_parties : c.respondent_parties,
      };
      await updateCase(c.id, patch);
      setCaseData((prev) => {
        const merged = prev ? { ...prev, ...patch } : prev;
        if (merged && id) caseCache[id] = { caseData: merged, hearingHistory: hearingHistoryRecords };
        return merged;
      });
      setRefreshMsg({ type: 'ok', text: 'Case data updated from eCourts.' });
    } catch {
      // silent — stale data stays, user can manually refresh
    } finally {
      setRefreshing(false);
    }
  };

  const saveNotes = async () => {
    if (!caseData) return;
    setSavingNotes(true);
    await updateCase(caseData.id, { notes });
    setSavingNotes(false);
    setEditingNotes(false);
    const updated = { ...caseData, notes };
    if (id) caseCache[id] = { caseData: updated, hearingHistory: hearingHistoryRecords };
    setCaseData(updated);
  };

  const handleDeleteConfirmed = async () => {
    setShowDeletePin(false);
    if (!caseData) return;
    await deleteCase(caseData.id);
    router.replace('/(app)/(tabs)/hearings');
  };

  /** Called by UpdateHearingModal after it saves the new date */
  const handleDateSaved = async (newDate: string) => {
    if (!caseData) return;
    const oldDate = caseData.hearing_date;
    // Log the old date to history if it actually changed
    if (oldDate && oldDate !== newDate) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await addHearingHistory({
          case_id: caseData.id,
          user_id: user.id,
          hearing_date: oldDate,
          hearing_time: caseData.hearing_time ?? null,
          outcome: 'Rescheduled',
          notes: `Updated to ${newDate}`,
        });
        const updated = await getHearingHistory(caseData.id);
        setHearingHistoryRecords(updated);
      }
    }
    // Update local case state immediately so the screen reflects the new date
    const updated = { ...caseData, hearing_date: newDate, next_hearing_date: newDate };
    if (id) caseCache[id] = { caseData: updated, hearingHistory: hearingHistoryRecords };
    setCaseData(updated);
  };

  const handleEditSave = async (patch: Partial<Case>) => {
    if (!caseData) return;

    // If hearing_date changed and there was an old one, log it to history
    const oldDate = caseData.hearing_date;
    const newDate = patch.hearing_date;
    if (newDate && oldDate && newDate !== oldDate) {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) {
        await addHearingHistory({
          case_id: caseData.id,
          user_id: user.id,
          hearing_date: oldDate,
          hearing_time: caseData.hearing_time ?? null,
          outcome: 'Rescheduled',
          notes: `Updated to ${newDate}`,
        });
        // Refresh hearing history list
        const updated = await getHearingHistory(caseData.id);
        setHearingHistoryRecords(updated);
      }
    }

    await updateCase(caseData.id, patch);
    const editUpdated = { ...caseData, ...patch };
    if (id) caseCache[id] = { caseData: editUpdated, hearingHistory: hearingHistoryRecords };
    setCaseData(editUpdated);
    setNotes(patch.notes ?? notes);
    setShowEditModal(false);
  };

  if (loading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f6faff', alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <ActivityIndicator color="#0058bd" size="large" />
      </SafeAreaView>
    );
  }

  if (!caseData) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#f6faff', alignItems: 'center', justifyContent: 'center' }} edges={['top']}>
        <AlertCircle size={40} color="#ba1a1a" strokeWidth={1.5} />
        <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#171c20', marginTop: 12 }}>Case not found</Text>
        <Pressable onPress={() => router.back()} style={{ marginTop: 16 }}>
          <Text style={{ color: '#0058bd', fontFamily: F.semiBold }}>Go Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  const isDisposed = caseData.status === 'completed';
  const history: ECourtHistoryRow[] = Array.isArray(caseData.ecourts_case_history) ? caseData.ecourts_case_history : [];
  const orders: ECourtOrderRow[] = Array.isArray(caseData.ecourts_final_orders) ? caseData.ecourts_final_orders : [];
  const acts: ActRow[] = Array.isArray(caseData.acts_under) ? caseData.acts_under : [];
  const fir: FirDetails | null = caseData.fir_details ?? null;
  const petParties: PartyInfo[] = Array.isArray(caseData.petitioner_parties) ? caseData.petitioner_parties : [];
  const respParties: PartyInfo[] = Array.isArray(caseData.respondent_parties) ? caseData.respondent_parties : [];

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#f6faff' }} edges={['top']}>

      {/* ── Top bar: ← | "Case Details" | ✏ ── */}
      <View style={{
        flexDirection: 'row', alignItems: 'center',
        paddingHorizontal: 16, paddingVertical: 12,
        borderBottomWidth: 1, borderBottomColor: '#dee3e8',
        backgroundColor: '#ffffff',
      }}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' }}
        >
          <ArrowLeft size={20} color="#171c20" strokeWidth={2} />
        </Pressable>
        <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontFamily: F.bold, color: '#0058bd' }}>
          Case Details
        </Text>
        <Pressable
          onPress={() => setShowEditModal(true)}
          hitSlop={8}
          style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#e8f0fe', alignItems: 'center', justifyContent: 'center' }}
        >
          <PenLine size={18} color="#0058bd" strokeWidth={2} />
        </Pressable>
      </View>

      {/* ── eCourts refresh feedback bar ── */}
      {refreshMsg && (
        <View style={{
          flexDirection: 'row', alignItems: 'center', gap: 8,
          paddingHorizontal: 16, paddingVertical: 8,
          backgroundColor: refreshMsg.type === 'ok' ? '#e6f9ee' : '#fff0ef',
          borderBottomWidth: 1,
          borderBottomColor: refreshMsg.type === 'ok' ? '#b7f0cc' : '#ffd6d3',
        }}>
          {refreshMsg.type === 'ok'
            ? <CheckCircle2 size={14} color="#006e2c" strokeWidth={2} />
            : <AlertCircle size={14} color="#ba1a1a" strokeWidth={2} />}
          <Text style={{ flex: 1, fontSize: 15, fontFamily: F.regular, color: refreshMsg.type === 'ok' ? '#006e2c' : '#ba1a1a' }}>
            {refreshMsg.text}
          </Text>
          <Pressable onPress={() => setRefreshMsg(null)} hitSlop={8}>
            <XCircle size={14} color="#9CA3AF" strokeWidth={2} />
          </Pressable>
        </View>
      )}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ padding: 16, paddingBottom: 48 }}
        style={{ backgroundColor: '#f6faff' }}
      >

        {/* ── Card 1: Case Summary ── */}
        <View style={{
          backgroundColor: '#ffffff',
          borderRadius: 24,
          padding: 20,
          marginBottom: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        }}>

          {/* Row 1: CNR chip + Status badge */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            {caseData.cnr_number ? (
              <View style={{ backgroundColor: '#eaeef4', borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 }}>
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#424753', letterSpacing: 0.3 }}>{caseData.cnr_number}</Text>
              </View>
            ) : (
              <View />
            )}
            <StatusBadge status={caseData.status} />
          </View>

          {/* Row 2: Refresh button — small, red, below CNR */}
          {caseData.cnr_number ? (
            <Pressable
              onPress={handleRefreshFromEcourts}
              hitSlop={8}
              disabled={refreshing}
              style={{
                flexDirection: 'row', alignItems: 'center', gap: 3,
                alignSelf: 'flex-start',
                backgroundColor: '#fff0f0', borderRadius: 999,
                borderWidth: 1, borderColor: '#ffcccc',
                paddingHorizontal: 8, paddingVertical: 3,
                opacity: refreshing ? 0.5 : 1,
                marginBottom: 8,
              }}
            >
              {refreshing
                ? <ActivityIndicator size={9} color="#c0392b" />
                : <RotateCcw size={9} color="#c0392b" strokeWidth={2.5} />}
              <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#c0392b' }}>
                {refreshing ? 'Refreshing…' : 'Refresh'}
              </Text>
            </Pressable>
          ) : <View style={{ marginBottom: 10 }} />}

          {/* Case title */}
          <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', lineHeight: 20, marginBottom: 14 }}>
            {caseData.case_title}
          </Text>

          {/* ── Divider ── */}
          <View style={{ height: 1, backgroundColor: '#eaeef4', marginBottom: 14 }} />

          {/* Info grid: 2-col rows */}
          {/* Row: Case Number | FIR Number */}
          {(caseData.case_number || caseData.filing_number) && (
            <View style={{ flexDirection: 'row', gap: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f4fa', marginBottom: 12 }}>
              <InfoField label="Case Number" value={caseData.case_number} />
              <InfoField label="FIR Number" value={caseData.filing_number} />
            </View>
          )}

          {/* Row: Case Register Date | Court Room */}
          {(caseData.filing_date || (caseData as any).registration_date || caseData.court_room) && (
            <View style={{ flexDirection: 'row', gap: 16, paddingBottom: 12, borderBottomWidth: 1, borderBottomColor: '#f0f4fa', marginBottom: 12 }}>
              <InfoField
                label="Case Register Date"
                value={fmtDate((caseData as any).registration_date ?? caseData.filing_date)}
              />
              <InfoField
                label="Court Room"
                value={caseData.court_room ? `Court Room ${caseData.court_room}` : null}
              />
            </View>
          )}

          {/* Court Name — with court type icon on right */}
          {caseData.court_name ? (
            <View style={{ paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#eaeef4', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flex: 1, marginRight: 10 }}>
                <Text style={{ fontSize: 9, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 3 }}>Court Name</Text>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20', lineHeight: 16 }}>{caseData.court_name}</Text>
              </View>
              <RNImage
                source={getCourtIconUrl(caseData.court_name)}
                style={{ width: 40, height: 40 }}
                resizeMode="contain"
              />
            </View>
          ) : null}

          {/* Judge — full width */}
          <InfoRowFull label="Judge" value={caseData.judge_name} />

          {/* Case Type */}
          {caseData.case_type && <InfoRowFull label="Case Type" value={caseData.case_type} />}

          {/* ── Divider ── */}
          <View style={{ height: 1, backgroundColor: '#eaeef4', marginTop: 6, marginBottom: 14 }} />

          {/* Client row */}
          {caseData.client_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Users size={12} color="#0058bd" strokeWidth={2} />
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#0058bd' }}>
                Client: {caseData.client_name}
                {caseData.petitioner_advocate ? ` (Petitioner)` : ''}
              </Text>
            </View>
          ) : null}

          {/* Opponent row */}
          {caseData.opponent_name ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, marginTop: caseData.client_name ? 8 : 0 }}>
              <Users size={12} color="#ba1a1a" strokeWidth={2} />
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#ba1a1a' }}>
                Opponent: {caseData.opponent_name}
                {caseData.respondent_advocate ? ` (Respondent)` : ''}
              </Text>
            </View>
          ) : null}

          {/* Disposed banner (inside card) */}
          {isDisposed && caseData.nature_of_disposal ? (
            <View style={{ marginTop: 14, backgroundColor: '#ffdea0', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <Gavel size={16} color="#765700" strokeWidth={2} />
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#765700' }}>Disposed</Text>
                <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#5c4300' }}>{caseData.nature_of_disposal}</Text>
                {caseData.decision_date ? (
                  <Text style={{ fontSize: 11.5, fontFamily: F.regular, color: '#765700', marginTop: 2 }}>
                    Decision: {fmtDate(caseData.decision_date)}
                  </Text>
                ) : null}
              </View>
            </View>
          ) : null}
        </View>

        {/* ── Card 2: Parties ── */}
        <PartiesCard
          petParties={petParties}
          respParties={respParties}
          petitioner={caseData.client_name ?? caseData.case_title.split(' vs ')[0] ?? null}
          respondent={caseData.opponent_name ?? caseData.case_title.split(' vs ')[1] ?? null}
          petAdv={caseData.petitioner_advocate}
          respAdv={caseData.respondent_advocate}
        />

        {/* ── Card 3: Acts & Sections ── */}
        <ActsCard acts={acts} />

        {/* ── Card 4: FIR Details ── */}
        <FirCard fir={fir} />

        {/* ── Card 5: eCourts Case History Table ── */}
        <CaseHistoryTable history={history} orders={orders} />

        {/* ── Card 6: Hearing Timeline (upcoming / next date) ── */}
        <HearingTimeline caseData={caseData} history={history} orders={orders} hearingHistoryRecords={hearingHistoryRecords} />

        {/* ── Card 7: My Notes ── */}
        <View style={{
          backgroundColor: '#ffffff', borderRadius: 24,
          padding: 20, marginBottom: 16,
          boxShadow: '0 2px 12px rgba(0,0,0,0.07)',
        }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#171c20' }}>My Notes</Text>
            {!editingNotes && (
              <Pressable onPress={() => setEditingNotes(true)}>
                <PenLine size={16} color="#727785" strokeWidth={2} />
              </Pressable>
            )}
          </View>
          {editingNotes ? (
            <View>
              <TextInput
                style={{ backgroundColor: '#f6faff', borderRadius: 10, borderWidth: 1.5, borderColor: '#0058bd', padding: 12, fontSize: 15, color: '#171c20', minHeight: 100, textAlignVertical: 'top', fontFamily: F.regular, outlineStyle: 'none' as any }}
                value={notes}
                onChangeText={setNotes}
                multiline
                placeholder="Add notes about this case..."
                placeholderTextColor="#c2c6d5"
                underlineColorAndroid="transparent"
                autoFocus
              />
              <View style={{ flexDirection: 'row', gap: 10, marginTop: 12 }}>
                <Pressable
                  onPress={saveNotes}
                  disabled={savingNotes}
                  style={{ flex: 1, backgroundColor: '#0058bd', borderRadius: 10, paddingVertical: 11, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 6 }}
                >
                  {savingNotes ? <ActivityIndicator color="#ffffff" size="small" /> : <CheckCircle2 size={14} color="#ffffff" strokeWidth={2.5} />}
                  <Text style={{ color: '#ffffff', fontFamily: F.bold, fontSize: 13 }}>Save Notes</Text>
                </Pressable>
                <Pressable
                  onPress={() => { setEditingNotes(false); setNotes(caseData.notes ?? ''); }}
                  style={{ paddingHorizontal: 16, paddingVertical: 11, borderRadius: 10, borderWidth: 1.5, borderColor: '#dee3e8', alignItems: 'center' }}
                >
                  <Text style={{ color: '#424753', fontFamily: F.semiBold, fontSize: 13 }}>Cancel</Text>
                </Pressable>
              </View>
            </View>
          ) : (
            <Pressable onPress={() => setEditingNotes(true)}>
              <Text style={{ fontSize: 15, color: notes ? '#424753' : '#c2c6d5', lineHeight: 22, fontFamily: F.regular }}>
                {notes || 'Tap to add case notes…'}
              </Text>
            </Pressable>
          )}
        </View>

        {/* ── Timestamps ── */}
        <View style={{ flexDirection: 'row', justifyContent: 'space-between', paddingHorizontal: 4, marginBottom: 24 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color="#c2c6d5" strokeWidth={2} />
            <Text style={{ fontSize: 15, color: '#c2c6d5', fontFamily: F.regular }}>Added {fmtDate(caseData.created_at.split('T')[0])}</Text>
          </View>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 4 }}>
            <Clock size={11} color="#c2c6d5" strokeWidth={2} />
            <Text style={{ fontSize: 15, color: '#c2c6d5', fontFamily: F.regular }}>Updated {fmtDate(caseData.updated_at.split('T')[0])}</Text>
          </View>
        </View>

        {/* ── Bottom action buttons: Update + Delete ── */}
        <View style={{ flexDirection: 'row', gap: 10, marginBottom: 8 }}>
          {/* Update Next Date */}
          <Pressable
            onPress={() => setShowDateModal(true)}
            style={{
              flex: 1,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 15, borderRadius: 14,
              backgroundColor: '#166534', borderWidth: 1.5, borderColor: '#14532d',
            }}
          >
            <PenLine size={17} color="#fff" strokeWidth={2.5} />
            <Text style={{ fontSize: 14.5, fontFamily: F.bold, color: '#fff' }}>Update Next Date</Text>
          </Pressable>

          {/* Delete Case */}
          <Pressable
            onPress={() => setShowDeleteConfirm(true)}
            style={{
              flex: 1,
              flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
              paddingVertical: 15, borderRadius: 14,
              backgroundColor: '#ffdad6', borderWidth: 1.5, borderColor: '#ba1a1a50',
            }}
          >
            <Trash2 size={17} color="#ba1a1a" strokeWidth={2.5} />
            <Text style={{ fontSize: 14.5, fontFamily: F.bold, color: '#ba1a1a' }}>Delete Case</Text>
          </Pressable>
        </View>
        <Text style={{ fontSize: 11.5, fontFamily: F.regular, color: '#727785', textAlign: 'center', marginBottom: 16 }}>
          This action is irreversible and cannot be undone.
        </Text>

      </ScrollView>

      {/* Edit Case Modal */}
      {showEditModal && (
        <EditCaseModal
          visible={showEditModal}
          caseData={caseData}
          onCancel={() => setShowEditModal(false)}
          onSave={handleEditSave}
        />
      )}

      {/* Delete Modals */}
      <DeleteConfirmModal
        visible={showDeleteConfirm}
        caseName={caseData.case_title}
        onCancel={() => setShowDeleteConfirm(false)}
        onConfirm={() => { setShowDeleteConfirm(false); setShowDeletePin(true); }}
      />
      <DeletePinModal
        visible={showDeletePin}
        onCancel={() => setShowDeletePin(false)}
        onSuccess={handleDeleteConfirmed}
      />

      {/* Update Next Date modal — date picker only, case pre-selected */}
      <UpdateHearingModal
        visible={showDateModal}
        onClose={() => setShowDateModal(false)}
        preselectedCase={caseData}
        onSaved={handleDateSaved}
      />
    </SafeAreaView>
  );
}
