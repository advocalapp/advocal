import { useState, useCallback } from 'react';
import { useFocusEffect, useRouter } from 'expo-router';
import {
  View,
  Text,
  TextInput,
  Pressable,
  ScrollView,
  KeyboardAvoidingView,
  ActivityIndicator,
  Modal,
  Image as RNImage,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import {
  ChevronDown, FileText, Hash, Search,
  AlertCircle, CheckCircle2, ChevronRight, PenLine,
  User, Calendar, Gavel, Scale, X,
  Landmark,
} from 'lucide-react-native';
import { Image } from 'expo-image';
import DateTimePicker from 'react-native-ui-datepicker';
import { CALENDAR_STYLES } from '@/lib/calendarStyles';
import dayjs from 'dayjs';
import { supabase, fnClient } from '@/client/supabase';
import { createCase } from '@/db/api';
import type { CaseStatus } from '@/types/types';
import { CASE_TYPES, STATUS_LABELS } from '@/types/types';
import { F } from '@/lib/fonts';
import { getCourtIconUrl } from '@/components/CaseCard';
import { TimePickerField } from '@/components/TimePickerField';

import districtCourtIconAsset from '../../../../assets/district-court.png';
import highCourtIconAsset from '../../../../assets/high-court.png';

// Icon assets reused from CaseCard — used in the court-type picker modal
const DISTRICT_COURT_ICON_URL = districtCourtIconAsset;
const HIGH_COURT_ICON_URL     = highCourtIconAsset;

// No prefetch needed — local assets load instantly


// ── Edit-Case-matching field components ───────────────────────────────────────

function EditStyleField({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  required,
  keyboardType,
}: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  placeholder?: string;
  multiline?: boolean;
  required?: boolean;
  keyboardType?: any;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={{ marginBottom: 14 }}>
      <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 }}>
        {label}{required && <Text style={{ color: '#EA4335' }}> *</Text>}
      </Text>
      <TextInput
        style={{
          backgroundColor: '#f6faff',
          borderRadius: 10,
          borderWidth: 1.5,
          borderColor: focused ? '#0078ff' : '#dee3e8',
          paddingHorizontal: 13,
          paddingVertical: 11,
          fontSize: 15,
          fontFamily: F.regular,
          color: '#171c20',
          minHeight: multiline ? 80 : undefined,
          textAlignVertical: multiline ? 'top' : undefined,
          outlineStyle: 'none' as any,
        }}
        placeholder={placeholder ?? `Enter ${label.toLowerCase()}`}
        placeholderTextColor="#9ca3af"
        value={value}
        onChangeText={onChangeText}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        keyboardType={keyboardType}
        multiline={multiline}
        underlineColorAndroid="transparent"
      />
    </View>
  );
}

function ModalSelectField<T extends string>({
  label,
  value,
  options,
  onSelect,
  getLabel,
  required,
  placeholder,
}: {
  label: string;
  value: T | '';
  options: T[];
  onSelect: (v: T) => void;
  getLabel?: (v: T) => string;
  required?: boolean;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const displayLabel = value ? (getLabel ? getLabel(value as T) : value) : null;

  return (
    <>
      <View style={{ marginBottom: 14 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 }}>
          {label}{required && <Text style={{ color: '#EA4335' }}> *</Text>}
        </Text>
        <Pressable
          onPress={() => setOpen(true)}
          style={{
            flexDirection: 'row', alignItems: 'center',
            backgroundColor: '#f6faff', borderRadius: 10,
            borderWidth: 1.5, borderColor: '#dee3e8',
            paddingHorizontal: 13, paddingVertical: 11,
          }}
        >
          <Text style={{ flex: 1, fontSize: 15, fontFamily: F.bold, color: displayLabel ? '#171c20' : '#9ca3af' }}>
            {displayLabel ?? (placeholder ?? `Select ${label.toLowerCase()}`)}
          </Text>
          <ChevronDown size={14} color="#9ca3af" strokeWidth={2} />
        </Pressable>
      </View>

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
                  {active && <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#374151' }}>✓</Text>}
                </Pressable>
              );
            })}
          </Pressable>
        </Pressable>
      </Modal>
    </>
  );
}


const STATUSES: CaseStatus[] = ['pending', 'ongoing', 'completed', 'adjourned', 'urgent'];

// ─── Fetched case shape from Edge Function ────────────────────────────────────
interface HistoryRow { judge: string; business_date: string | null; hearing_date: string | null; purpose: string; }
interface OrderRow { order_number: string; order_date: string | null; order_details: string; }
interface PartyInfo { name: string; advocate: string | null; }

interface FetchedCase {
  cnr_number: string;
  case_number: string | null;
  case_title: string | null;
  case_type: string | null;
  court_name: string | null;
  court_room: string | null;
  judge_name: string | null;
  petitioner: string | null;
  respondent: string | null;
  petitioner_advocate: string | null;
  respondent_advocate: string | null;
  filing_date: string | null;
  registration_date: string | null;
  first_hearing_date: string | null;
  decision_date: string | null;
  nature_of_disposal: string | null;
  hearing_date: string | null;
  last_hearing_date: string | null;
  status: string;
  case_status_label: string | null;
  // raw debug fields from eCourts HTML
  _raw_case_status: string | null;
  _raw_nature_of_disposal: string | null;
  _raw_decision_date: string | null;
  case_history: HistoryRow[];
  final_orders: OrderRow[];
  petitioner_parties: PartyInfo[];
  respondent_parties: PartyInfo[];
  // New fields
  acts_under: { act: string; sections: string }[];
  fir_details: { police_station: string | null; fir_number: string | null; year: string | null } | null;
  subordinate_court: { court_name: string | null; case_number: string | null; decision_date: string | null } | null;
}

// ─── Preview row component ────────────────────────────────────────────────────
function PreviewRow({ label, value, icon: Icon, iconColor }: {
  label: string;
  value: string | null | undefined;
  icon?: any;
  iconColor?: string;
}) {
  if (!value) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 10 }}>
      {Icon && (
        <View style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: `${iconColor ?? '#0078ff'}15`, alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
          <Icon size={14} color={iconColor ?? '#0078ff'} strokeWidth={2} />
        </View>
      )}
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827', lineHeight: 19 }}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Court-specific preview row (shows district/high court icon) ──────────────
function CourtPreviewRow({ value }: { value: string | null | undefined }) {
  if (!value) return null;
  const iconUrl = getCourtIconUrl(value);
  return (
    <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 10 }}>
      {/* White background so emblem colours render correctly; border gives definition */}
      <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <RNImage source={iconUrl} style={{ width: 34, height: 34 }} resizeMode="contain" />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.5, textTransform: 'uppercase', marginBottom: 2 }}>Court Name</Text>
        <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827', lineHeight: 19 }}>{value}</Text>
      </View>
    </View>
  );
}

// ─── Main screen ─────────────────────────────────────────────────────────────
export default function AddCaseScreen() {
  const router = useRouter();

  // 'crn' → CNR entry screen  |  'preview' → fetched result  |  'manual' → full manual form
  const [screen, setScreen] = useState<'crn' | 'preview' | 'manual'>('crn');

  // Court type selection — shown as popup before CNR entry
  const [courtType, setCourtType] = useState<'dc' | 'hc' | null>(null);
  const [showCourtPicker, setShowCourtPicker] = useState(true);

  // CNR lookup state
  const [crnInput, setCrnInput] = useState('');
  const [fetching, setFetching] = useState(false);
  const [fetchError, setFetchError] = useState('');
  const [fetchedCase, setFetchedCase] = useState<FetchedCase | null>(null);

  // Saving state
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');

  // Manual form fields (also populated from fetchedCase for preview→edit)
  const [caseTitle, setCaseTitle] = useState('');
  const [caseType, setCaseType] = useState('');
  const [courtName, setCourtName] = useState('');
  const [courtRoom, setCourtRoom] = useState('');
  const [judgeName, setJudgeName] = useState('');
  const [clientName, setClientName] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [filingNumber, setFilingNumber] = useState('');
  const [cnrNumber, setCnrNumber] = useState('');
  const [caseNumber, setCaseNumber] = useState('');
  const [hearingDate, setHearingDate] = useState('');
  const [hearingTime, setHearingTime] = useState('');
  const [status, setStatus] = useState<CaseStatus | ''>('');
  const [formError, setFormError] = useState('');
  const [showManualDatePicker, setShowManualDatePicker] = useState(false);

  // Reset all form state every time the screen gains focus.
  // add-case is a tab → it stays mounted between visits, so without this
  // the court picker stays hidden and previous inputs linger.
  useFocusEffect(useCallback(() => {
    setScreen('crn');
    setCourtType(null);
    setShowCourtPicker(true);
    setCrnInput('');
    setFetching(false);
    setFetchError('');
    setFetchedCase(null);
    setSaving(false);
    setSaveError('');
    setCaseTitle('');
    setCaseType('');
    setCourtName('');
    setCourtRoom('');
    setJudgeName('');
    setClientName('');
    setOpponentName('');
    setFilingNumber('');
    setCnrNumber('');
    setCaseNumber('');
    setHearingDate('');
    setHearingTime('');
    setStatus('');
    setFormError('');
    setShowManualDatePicker(false);
  }, []));

  // ── CNR fetch ──────────────────────────────────────────────────────────────
  const handleFetch = useCallback(async () => {
    const crn = crnInput.trim().toUpperCase();
    if (!crn) { setFetchError('Please enter a CNR number.'); return; }

    // Client-side early detection of tribunal/special court case numbers
    // These are NOT on eCourts and cannot be auto-fetched.
    const TRIBUNAL_PATTERNS: Array<{ pattern: RegExp; name: string }> = [
      { pattern: /^DRT/,   name: 'Debt Recovery Tribunal (DRT)' },
      { pattern: /^DRAT/,  name: 'Debt Recovery Appellate Tribunal (DRAT)' },
      { pattern: /^NCLT/,  name: 'National Company Law Tribunal (NCLT)' },
      { pattern: /^NCLAT/, name: 'National Company Law Appellate Tribunal (NCLAT)' },
      { pattern: /^NGT/,   name: 'National Green Tribunal (NGT)' },
      { pattern: /^SAT/,   name: 'Securities Appellate Tribunal (SAT)' },
      { pattern: /^TDSAT/, name: 'TDSAT' },
      { pattern: /^ITAT/,  name: 'Income Tax Appellate Tribunal (ITAT)' },
      { pattern: /^CAT/,   name: 'Central Administrative Tribunal (CAT)' },
    ];
    const tribunal = TRIBUNAL_PATTERNS.find((t) => t.pattern.test(crn));
    if (tribunal) {
      setFetchError(
        `"${crn}" is a ${tribunal.name} case — not an eCourts CNR. ` +
        `${tribunal.name} cases are on a separate government portal and cannot be fetched automatically. ` +
        `Please use "Add Case Manually" to enter the details yourself.`
      );
      return;
    }

    setFetchError('');
    setFetching(true);
    try {
      // 120-second timeout — High Court lookups require audio captcha solving (Whisper STT)
      // which adds 30-60s per attempt. DC CNRs return well under 30s regardless.
      const invokePromise = fnClient.functions.invoke('fetch-case', {
        body: { crn },
        method: 'POST',
      });
      const timeoutPromise = new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error('timeout')), 120_000)
      );
      const { data, error } = await Promise.race([invokePromise, timeoutPromise]);

      if (error) {
        const msg = await error?.context?.text().catch(() => '');
        let parsed: { error?: string } = {};
        try { parsed = JSON.parse(msg); } catch { /* noop */ }
        setFetchError(parsed.error ?? 'Failed to fetch case. Please try again.');
        return;
      }
      if (!data?.success || !data?.case) {
        setFetchError(data?.error ?? 'Case not found. Please check the CNR number.');
        return;
      }
      setFetchedCase(data.case as FetchedCase);
      // DEBUG: log full response so we can inspect HC HTML structure from console logs
      if (data._debug) {
      } else {
      }
      setScreen('preview');
    } catch (e) {
      const isTimeout = e instanceof Error && e.message === 'timeout';
      setFetchError(
        isTimeout
          ? 'High Court portal is taking too long (captcha solving can take up to 2 minutes). Please try again.'
          : 'Network error. Please check your connection and try again.'
      );
    } finally {
      setFetching(false);
    }
  }, [crnInput]);

  // ── Populate form from fetched data then go to manual ─────────────────────
  const populateFromFetched = (fc: FetchedCase) => {
    setCaseTitle(fc.case_title ?? '');
    setCaseType(fc.case_type ?? '');
    setCourtName(fc.court_name ?? '');
    setCourtRoom(fc.court_room ?? '');
    setJudgeName(fc.judge_name ?? '');
    setClientName(fc.petitioner ?? '');
    setOpponentName(fc.respondent ?? '');
    setCnrNumber(fc.cnr_number ?? '');
    setCaseNumber(fc.case_number ?? '');
    setHearingDate(fc.hearing_date ?? '');
    setStatus((fc.status as CaseStatus) ?? 'pending');
    setFormError('');
    setSaveError('');
  };

  // ── Save (either from preview or manual form) ─────────────────────────────
  const handleSave = async (fromPreview = false) => {
    setSaveError('');
    setFormError('');

    const title = fromPreview ? (fetchedCase?.case_title ?? '') : caseTitle.trim();
    const court = fromPreview ? (fetchedCase?.court_name ?? '') : courtName.trim();
    const hDate = fromPreview ? (fetchedCase?.hearing_date ?? '') : hearingDate.trim();

    if (!title) { setSaveError('Case title is required.'); if (!fromPreview) setFormError('Case title is required.'); return; }
    if (!court) { setSaveError('Court name is required.'); if (!fromPreview) setFormError('Court name is required.'); return; }
    // Hearing date is required on the manual form but NOT on the preview path —
    // CNR-fetched cases (especially HC) may not always include a parsed next
    // hearing date; we save the case and let the user set it later via edit.
    const isDisposedCase = fromPreview && fetchedCase?.status === 'completed';
    if (!fromPreview && !isDisposedCase && !hDate) {
      setFormError('Hearing date is required.');
      return;
    }
    if (hDate && !/^\d{4}-\d{2}-\d{2}$/.test(hDate)) {
      const msg = 'Hearing date must be in YYYY-MM-DD format.';
      if (fromPreview) setSaveError(msg); else setFormError(msg);
      return;
    }

    setSaving(true);
    try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      const msg = 'Not authenticated.';
      if (fromPreview) setSaveError(msg); else setFormError(msg);
      return;
    }

    const payload = fromPreview && fetchedCase ? {
      user_id: user.id,
      case_title: fetchedCase.case_title ?? title,
      case_type: fetchedCase.case_type ?? null,
      court_name: fetchedCase.court_name ?? court,
      court_room: fetchedCase.court_room ?? null,
      judge_name: fetchedCase.judge_name ?? null,
      client_name: fetchedCase.petitioner ?? null,
      opponent_name: fetchedCase.respondent ?? null,
      filing_number: (fetchedCase.case_number ?? filingNumber) || null,
      cnr_number: fetchedCase.cnr_number,
      case_number: fetchedCase.case_number ?? null,
      hearing_date: fetchedCase.hearing_date ?? null,
      next_hearing_date: fetchedCase.hearing_date ?? null,
      hearing_time: null,
      status: (fetchedCase.status as CaseStatus) ?? 'pending',
      notes: null,
      decision_date: fetchedCase.decision_date ?? null,
      first_hearing_date: fetchedCase.first_hearing_date ?? null,
      nature_of_disposal: fetchedCase.nature_of_disposal ?? null,
      petitioner_advocate: fetchedCase.petitioner_advocate ?? null,
      respondent_advocate: fetchedCase.respondent_advocate ?? null,
      filing_date: fetchedCase.filing_date ?? null,
      ecourts_case_history: fetchedCase.case_history?.length > 0 ? fetchedCase.case_history : null,
      ecourts_final_orders: fetchedCase.final_orders?.length > 0 ? fetchedCase.final_orders : null,
      case_status_label: fetchedCase.case_status_label ?? null,
      registration_date: fetchedCase.registration_date ?? null,
      acts_under: fetchedCase.acts_under?.length > 0 ? fetchedCase.acts_under : null,
      fir_details: fetchedCase.fir_details?.police_station || fetchedCase.fir_details?.fir_number ? fetchedCase.fir_details : null,
      petitioner_parties: fetchedCase.petitioner_parties?.length > 0 ? fetchedCase.petitioner_parties : null,
      respondent_parties: fetchedCase.respondent_parties?.length > 0 ? fetchedCase.respondent_parties : null,
    } : {
      user_id: user.id,
      case_title: caseTitle.trim(),
      case_type: caseType || null,
      court_name: courtName.trim(),
      court_room: courtRoom || null,
      judge_name: judgeName || null,
      client_name: clientName || null,
      opponent_name: opponentName || null,
      filing_number: filingNumber || null,
      cnr_number: cnrNumber || null,
      case_number: caseNumber || null,
      hearing_date: hearingDate,
      next_hearing_date: hearingDate,
      hearing_time: hearingTime || null,
      status: (status || 'pending') as CaseStatus,
      notes: null,
      filing_date: null,
      decision_date: null,
      first_hearing_date: null,
      nature_of_disposal: null,
      petitioner_advocate: null,
      respondent_advocate: null,
      ecourts_case_history: null,
      ecourts_final_orders: null,
      case_status_label: null,
      registration_date: null,
      acts_under: null,
      fir_details: null,
      petitioner_parties: null,
      respondent_parties: null,
    };

    const { error: e } = await createCase(payload);

    if (e) {
      const msg = 'Failed to save case. Please try again.';
      if (fromPreview) setSaveError(msg); else setFormError(msg);
      return;
    }

    router.replace('/(app)/(tabs)/hearings');
    } catch {
      const msg = 'Failed to save case. Please try again.';
      if (fromPreview) setSaveError(msg); else setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: CNR Entry
  // ──────────────────────────────────────────────────────────────────────────
  if (screen === 'crn') {
    const hcExample = 'e.g. KLHC01042915024';
    const dcExample = 'e.g. MHPN01000012025';
    const crnPlaceholder = courtType === 'hc' ? hcExample : courtType === 'dc' ? dcExample : 'e.g. MHPN01000012025';

    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFF' }} edges={['top']}>
        {/* ── Court-type picker overlay ──
            Rendered as an always-mounted absolutely-positioned View instead of
            a Modal so that both court images are decoded on component mount —
            not lazily when visible=true. This gives instant, zero-delay display. */}
        <View
          style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            zIndex: 100,
            backgroundColor: 'rgba(0,0,0,0.45)',
            justifyContent: 'flex-end',
            opacity: showCourtPicker ? 1 : 0,
          }}
          pointerEvents={showCourtPicker ? 'auto' : 'none'}
        >
          <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 28, borderTopRightRadius: 28, padding: 24, paddingBottom: 36 }}>
            {/* Handle */}
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 20 }} />
            <Text style={{ fontSize: 19, fontFamily: F.extraBold, color: '#111827', marginBottom: 6, textAlign: 'center' }}>Select Court Type</Text>
            <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', marginBottom: 24, lineHeight: 19 }}>
              Choose the court to help us fetch the right case details
            </Text>

            <View style={{ flexDirection: 'row', gap: 14, marginBottom: 8 }}>
              {/* District Court */}
              <Pressable
                onPress={() => { setCourtType('dc'); setShowCourtPicker(false); }}
                style={{ flex: 1, backgroundColor: '#F0F4FF', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#1A237E', gap: 10 }}
              >
                <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={DISTRICT_COURT_ICON_URL} style={{ width: 54, height: 54 }} contentFit="contain" />
                </View>
                <Text style={{ fontSize: 15, fontFamily: F.extraBold, color: '#1A237E', textAlign: 'center' }}>District Court</Text>
                <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 16 }}>Sessions, Civil,{'\n'}Family, Consumer courts</Text>
              </Pressable>

              {/* High Court */}
              <Pressable
                onPress={() => { setCourtType('hc'); setShowCourtPicker(false); }}
                style={{ flex: 1, backgroundColor: '#F9F0FF', borderRadius: 20, padding: 20, alignItems: 'center', borderWidth: 2, borderColor: '#7B1FA2', gap: 10 }}
              >
                <View style={{ width: 64, height: 64, borderRadius: 14, backgroundColor: '#fff', borderWidth: 1, borderColor: '#E2E8F0', alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={HIGH_COURT_ICON_URL} style={{ width: 54, height: 54 }} contentFit="contain" />
                </View>
                <Text style={{ fontSize: 15, fontFamily: F.extraBold, color: '#7B1FA2', textAlign: 'center' }}>High Court</Text>
                <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 16 }}>State & Division{'\n'}Bench matters</Text>
              </Pressable>
            </View>

            <Pressable onPress={() => setShowCourtPicker(false)} style={{ marginTop: 8, paddingVertical: 12, alignItems: 'center' }}>
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#9CA3AF' }}>Skip — I'll enter CNR directly</Text>
            </Pressable>
          </View>
        </View>

        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ flexGrow: 1 }} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
            {/* Header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
              <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' }}>
                <Text style={{ fontSize: 18, color: '#374151', marginTop: -1 }}>‹</Text>
              </Pressable>
              <Text style={{ fontSize: 20, fontFamily: F.extraBold, color: '#111827' }}>Add Case</Text>
            </View>

            {/* Court type chip — tappable to re-open picker */}
            {courtType && (
              <Pressable
                onPress={() => setShowCourtPicker(true)}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginHorizontal: 20, marginBottom: 10,
                  backgroundColor: courtType === 'hc' ? '#F9F0FF' : '#F0F4FF',
                  borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, alignSelf: 'flex-start',
                  borderWidth: 1, borderColor: courtType === 'hc' ? '#CE93D8' : '#7986CB' }}
              >
                <View style={{ width: 22, height: 22, borderRadius: 5, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' }}>
                  <Image source={courtType === 'hc' ? HIGH_COURT_ICON_URL : DISTRICT_COURT_ICON_URL} style={{ width: 18, height: 18 }} contentFit="contain" />
                </View>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: courtType === 'hc' ? '#7B1FA2' : '#1A237E' }}>
                  {courtType === 'hc' ? 'High Court' : 'District Court'}
                </Text>
                <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#9CA3AF' }}>· tap to change</Text>
              </Pressable>
            )}

            {/* Hero CNR card */}
            <View style={{ marginHorizontal: 16, marginTop: 8, backgroundColor: '#fff', borderRadius: 22, padding: 24, borderWidth: 1.5, borderColor: '#0078ff', boxShadow: '0 4px 20px rgba(0,120,255,0.12)' }}>
              {/* Badge */}
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 18 }}>
                <View style={{ backgroundColor: '#E8F0FE', borderRadius: 10, paddingHorizontal: 10, paddingVertical: 5, flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                  <Search size={13} color="#0078ff" strokeWidth={2.5} />
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.4 }}>RECOMMENDED</Text>
                </View>
              </View>

              <Text style={{ fontSize: 19, fontFamily: F.extraBold, color: '#111827', marginBottom: 6 }}>Fetch Case via CNR</Text>
              <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', lineHeight: 20, marginBottom: 22 }}>
                Enter the Case Reference Number to automatically import all case details from eCourts.
              </Text>

              {/* CNR Input */}
              <View style={{ marginBottom: 6 }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#374151', marginBottom: 8, letterSpacing: 0.5, textTransform: 'uppercase' }}>
                  CNR Number <Text style={{ color: '#EA4335' }}>*</Text>
                </Text>
                <View style={{
                  flexDirection: 'row', alignItems: 'center',
                  backgroundColor: '#F8FAFF', borderRadius: 14, borderWidth: 2,
                  borderColor: fetchError ? '#EA4335' : '#D8E6FF',
                  paddingHorizontal: 14, gap: 10,
                }}>
                  <Hash size={16} color="#0078ff" strokeWidth={2.5} />
                  <TextInput
                    value={crnInput}
                    onChangeText={(v) => { setCrnInput(v); setFetchError(''); }}
                    placeholder={crnPlaceholder}
                    placeholderTextColor="#C4CCDF"
                    autoCapitalize="characters"
                    autoCorrect={false}
                    returnKeyType="search"
                    onSubmitEditing={handleFetch}
                    underlineColorAndroid="transparent"
                    style={{ flex: 1, fontSize: 15, fontFamily: F.semiBold, color: '#111827', paddingVertical: 14, letterSpacing: 0.5, outlineStyle: 'none' as any }}
                  />
                  {crnInput.length > 0 && (
                    <Pressable onPress={() => { setCrnInput(''); setFetchError(''); }} hitSlop={8}>
                      <Text style={{ fontSize: 18, color: '#9CA3AF' }}>×</Text>
                    </Pressable>
                  )}
                </View>

                {fetchError ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 }}>
                    <AlertCircle size={13} color="#EA4335" strokeWidth={2} />
                    <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#EA4335', flex: 1 }}>{fetchError}</Text>
                  </View>
                ) : null}
              </View>

              {/* CNR format hint — adapts to court type */}
              <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#9CA3AF', marginBottom: 22, lineHeight: 16 }}>
                {courtType === 'hc'
                  ? `High Court CNR: State + "HC" + Court code + Number + Year\nExample: KLHC01042915024 or WBCHCA0050462023`
                  : courtType === 'dc'
                  ? `District Court CNR: State + District + Court code + Number + Year\nExample: MHPN01000012025`
                  : `Format: State code + Court code + Case number + Year\nExample: MHPN01000012025`}
              </Text>

              {/* Fetch button */}
              <Pressable
                onPress={handleFetch}
                disabled={fetching}
                style={{ backgroundColor: fetching ? '#99b3f0' : '#0078ff', borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, boxShadow: '0 4px 14px rgba(0,120,255,0.38)' }}
              >
                {fetching ? <ActivityIndicator color="#fff" size="small" /> : <Search size={18} color="#fff" strokeWidth={2.5} />}
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>
                  {fetching ? 'Fetching Case…' : 'Fetch Case'}
                </Text>
              </Pressable>
            </View>

            {/* Divider */}
            <View style={{ flexDirection: 'row', alignItems: 'center', marginHorizontal: 20, marginVertical: 22, gap: 12 }}>
              <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#9CA3AF', letterSpacing: 0.5 }}>OR</Text>
              <View style={{ flex: 1, height: 1, backgroundColor: '#E5E7EB' }} />
            </View>

            {/* Manual option */}
            <Pressable
              onPress={() => { setFetchedCase(null); setScreen('manual'); }}
              style={{ marginHorizontal: 16, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 14, borderRadius: 14, backgroundColor: '#34A853', marginBottom: 32 }}
            >
              <PenLine size={15} color="#fff" strokeWidth={2} />
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#fff' }}>Add Case Manually</Text>
              <ChevronRight size={14} color="#fff" strokeWidth={2} />
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: Preview (fetched case)
  // ──────────────────────────────────────────────────────────────────────────
  if (screen === 'preview' && fetchedCase) {
    const fc = fetchedCase;
    // Detect if this is a High Court case by CNR prefix or court name
    const isHC = /^[A-Z]{2}HC/i.test(fc.cnr_number) || (fc.court_name ?? '').toLowerCase().includes('high court');
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFF' }} edges={['top']}>
        <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
          {/* Header */}
          <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => setScreen('crn')} hitSlop={10} style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: '#E5E7EB' }}>
              <Text style={{ fontSize: 18, color: '#374151', marginTop: -1 }}>‹</Text>
            </Pressable>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 19, fontFamily: F.extraBold, color: '#111827' }}>Case Preview</Text>
              <Text style={{ fontSize: 11.5, fontFamily: F.regular, color: '#9CA3AF' }}>Review details before saving</Text>
            </View>
            {/* Court type badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: isHC ? '#F9F0FF' : '#F0F4FF', borderRadius: 16, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: isHC ? '#CE93D8' : '#7986CB' }}>
              <View style={{ width: 18, height: 18, alignItems: 'center', justifyContent: 'center' }}>
                <Image source={isHC ? HIGH_COURT_ICON_URL : DISTRICT_COURT_ICON_URL} style={{ width: 16, height: 16 }} contentFit="contain" />
              </View>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: isHC ? '#7B1FA2' : '#1A237E' }}>{isHC ? 'High Court' : 'District Court'}</Text>
            </View>
          </View>

          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 32 }}>
            {/* Status chip */}
            {fc.status === 'completed' ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFF3E0', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, borderWidth: 1.5, borderColor: '#FB8C00' }}>
                <AlertCircle size={16} color="#E65100" strokeWidth={2} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#E65100', marginBottom: 2 }}>Case Already Disposed</Text>
                  <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#BF360C', lineHeight: 17 }}>
                    This case was disposed on {fc.decision_date ?? 'unknown date'}. No upcoming hearings. You can still save it for your records.
                  </Text>
                </View>
              </View>
            ) : !fc.hearing_date ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 10, backgroundColor: '#FFF8E1', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, marginBottom: 14, borderWidth: 1.5, borderColor: '#FFD600' }}>
                <AlertCircle size={16} color="#F57F17" strokeWidth={2} style={{ marginTop: 1 }} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#F57F17', marginBottom: 2 }}>No Upcoming Hearing Scheduled</Text>
                  <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#795548', lineHeight: 17 }}>
                    {fc.last_hearing_date
                      ? `The last recorded hearing was on ${fc.last_hearing_date}. No future hearing date is available on eCourts.`
                      : 'No future hearing date is available on eCourts for this case.'}
                    {' '}You can still save it and set a date manually.
                  </Text>
                </View>
              </View>
            ) : (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E6F4EA', borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, marginBottom: 14 }}>
                <CheckCircle2 size={16} color="#34A853" strokeWidth={2.5} />
                <Text style={{ fontSize: 12.5, fontFamily: F.semiBold, color: '#137333', flex: 1 }}>Case details fetched successfully from eCourts</Text>
              </View>
            )}

            {/* CNR badge */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: '#E8F0FE', borderRadius: 10, paddingHorizontal: 12, paddingVertical: 8, alignSelf: 'flex-start', marginBottom: 14 }}>
              <Hash size={12} color="#0078ff" strokeWidth={2.5} />
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5 }}>{fc.cnr_number}</Text>
            </View>

            {/* ── Card 1: Case Details ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>Case Details</Text>
              <PreviewRow label="Case Title" value={fc.case_title} icon={Scale} iconColor="#0078ff" />
              <PreviewRow label="Case Number" value={fc.case_number} icon={Hash} iconColor="#9CA3AF" />
              <PreviewRow label="Case Type" value={fc.case_type} icon={FileText} iconColor="#8B5CF6" />
              <PreviewRow label="Filing Date" value={fc.filing_date} icon={Calendar} iconColor="#FBBC05" />
              <PreviewRow label="Registration Date" value={fc.registration_date} icon={Calendar} iconColor="#FBBC05" />
              <PreviewRow label="First Hearing" value={fc.first_hearing_date} icon={Calendar} iconColor="#34A853" />
              {!!fc.decision_date && <PreviewRow label="Decision Date" value={fc.decision_date} icon={Gavel} iconColor="#EA4335" />}
              {!!fc.nature_of_disposal && <PreviewRow label="Nature of Disposal" value={fc.nature_of_disposal} icon={FileText} iconColor="#6B7280" />}
            </View>

            {/* ── Card 2: Case Status ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#34A853', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>Case Status</Text>
              <PreviewRow label="Status" value={fc.case_status_label} icon={Gavel} iconColor="#34A853" />
              {fc.status !== 'completed' && <PreviewRow label="Next Hearing Date" value={fc.hearing_date} icon={Calendar} iconColor="#EA4335" />}
            </View>

            {/* ── Card 3: Court Details ── */}
            <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
              <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0097A7', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>Court Details</Text>
              <CourtPreviewRow value={fc.court_name} />
              <PreviewRow label="Judge" value={fc.judge_name} icon={Gavel} iconColor="#6B7280" />
            </View>

            {/* ── Card 4: Petitioner & Advocate ── */}
            {(fc.petitioner || fc.petitioner_advocate || (fc.petitioner_parties?.length > 0)) && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#1565C0', letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' }}>Petitioner and Advocate</Text>
                {fc.petitioner_parties?.length > 0
                  ? fc.petitioner_parties.map((p, i) => (
                    <View key={i} style={{ marginBottom: i < fc.petitioner_parties.length - 1 ? 12 : 0, paddingBottom: i < fc.petitioner_parties.length - 1 ? 12 : 0, borderBottomWidth: i < fc.petitioner_parties.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <User size={13} color="#1565C0" strokeWidth={2} />
                        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.4, textTransform: 'uppercase' }}>Petitioner {fc.petitioner_parties.length > 1 ? i + 1 : ''}</Text>
                      </View>
                      <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827', marginLeft: 19 }}>{p.name}</Text>
                      {p.advocate ? <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', marginTop: 2, marginLeft: 19 }}>Adv. {p.advocate}</Text> : null}
                    </View>
                  ))
                  : (
                    <View>
                      {fc.petitioner ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                          <User size={14} color="#1565C0" strokeWidth={2} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>Petitioner</Text>
                            <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827' }}>{fc.petitioner}</Text>
                          </View>
                        </View>
                      ) : null}
                      {fc.petitioner_advocate ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                          <Scale size={14} color="#0078ff" strokeWidth={2} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>Advocate</Text>
                            <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827' }}>{fc.petitioner_advocate}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )
                }
              </View>
            )}

            {/* ── Card 5: Respondent & Advocate ── */}
            {(fc.respondent || fc.respondent_advocate || (fc.respondent_parties?.length > 0)) && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#B71C1C', letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' }}>Respondent and Advocate</Text>
                {fc.respondent_parties?.length > 0
                  ? fc.respondent_parties.map((p, i) => (
                    <View key={i} style={{ marginBottom: i < fc.respondent_parties.length - 1 ? 12 : 0, paddingBottom: i < fc.respondent_parties.length - 1 ? 12 : 0, borderBottomWidth: i < fc.respondent_parties.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 3 }}>
                        <User size={13} color="#B71C1C" strokeWidth={2} />
                        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.4, textTransform: 'uppercase' }}>Respondent {fc.respondent_parties.length > 1 ? i + 1 : ''}</Text>
                      </View>
                      <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827', marginLeft: 19 }}>{p.name}</Text>
                      {p.advocate ? <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', marginTop: 2, marginLeft: 19 }}>Adv. {p.advocate}</Text> : null}
                    </View>
                  ))
                  : (
                    <View>
                      {fc.respondent ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                          <User size={14} color="#B71C1C" strokeWidth={2} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>Respondent</Text>
                            <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827' }}>{fc.respondent}</Text>
                          </View>
                        </View>
                      ) : null}
                      {fc.respondent_advocate ? (
                        <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 8 }}>
                          <Scale size={14} color="#EA4335" strokeWidth={2} style={{ marginTop: 2 }} />
                          <View style={{ flex: 1 }}>
                            <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.4, textTransform: 'uppercase', marginBottom: 2 }}>Advocate</Text>
                            <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827' }}>{fc.respondent_advocate}</Text>
                          </View>
                        </View>
                      ) : null}
                    </View>
                  )
                }
              </View>
            )}

            {/* ── Card 6: Acts ── */}
            {fc.acts_under?.length > 0 && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#6A1B9A', letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' }}>Acts</Text>
                {fc.acts_under.map((a, i) => (
                  <View key={i} style={{ flexDirection: 'row', gap: 10, marginBottom: i < fc.acts_under.length - 1 ? 10 : 0, paddingBottom: i < fc.acts_under.length - 1 ? 10 : 0, borderBottomWidth: i < fc.acts_under.length - 1 ? 1 : 0, borderBottomColor: '#F3F4F6' }}>
                    <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: '#6A1B9A', marginTop: 6, flexShrink: 0 }} />
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#111827', lineHeight: 18 }}>{a.act}</Text>
                      {a.sections ? <Text style={{ fontSize: 11.5, fontFamily: F.regular, color: '#6B7280', marginTop: 2 }}>Sections: {a.sections}</Text> : null}
                    </View>
                  </View>
                ))}
              </View>
            )}

            {/* ── Card 7: FIR Details (DC only) ── */}
            {fc.fir_details && (fc.fir_details.police_station || fc.fir_details.fir_number) && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#E65100', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>FIR Details</Text>
                <PreviewRow label="Police Station" value={fc.fir_details.police_station} icon={FileText} iconColor="#E65100" />
                <PreviewRow label="FIR Number" value={fc.fir_details.fir_number} icon={Hash} iconColor="#E65100" />
                <PreviewRow label="Year" value={fc.fir_details.year} icon={Calendar} iconColor="#E65100" />
              </View>
            )}

            {/* ── Card 8: Subordinate Court Information (HC only) ── */}
            {fc.subordinate_court && (fc.subordinate_court.court_name || fc.subordinate_court.case_number) && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 12, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#00695C', letterSpacing: 0.5, marginBottom: 10, textTransform: 'uppercase' }}>Subordinate Court Information</Text>
                <PreviewRow label="Court Name" value={fc.subordinate_court.court_name} icon={Landmark} iconColor="#00695C" />
                <PreviewRow label="Case Number" value={fc.subordinate_court.case_number} icon={Hash} iconColor="#00695C" />
                <PreviewRow label="Decision Date" value={fc.subordinate_court.decision_date} icon={Calendar} iconColor="#00695C" />
              </View>
            )}

            {/* ── Card 9: History of Case Hearing (all entries) ── */}
            {fc.case_history?.length > 0 && (
              <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 18, borderWidth: 1, borderColor: '#E8ECF0', marginBottom: 16, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#FBBC05', letterSpacing: 0.5, marginBottom: 12, textTransform: 'uppercase' }}>History of Case Hearing ({fc.case_history.length})</Text>
                {/* Table header */}
                <View style={{ flexDirection: 'row', paddingVertical: 6, borderBottomWidth: 1.5, borderBottomColor: '#E5E7EB', marginBottom: 4 }}>
                  <Text style={{ width: 72, fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 }}>Date</Text>
                  <Text style={{ width: 72, fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 }}>Next Date</Text>
                  <Text style={{ flex: 1, fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.3 }}>Purpose / Stage</Text>
                </View>
                {[...fc.case_history].reverse().map((row, i) => {
                  const dateStr = row.business_date ?? row.hearing_date ?? null;
                  const dd = dateStr ? (() => { const d = new Date(dateStr + 'T00:00:00'); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`; })() : '—';
                  const nd = row.hearing_date && row.hearing_date !== dateStr ? (() => { const d = new Date(row.hearing_date + 'T00:00:00'); return `${String(d.getDate()).padStart(2,'0')}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getFullYear()).slice(-2)}`; })() : '—';
                  return (
                    <View key={i} style={{ flexDirection: 'row', paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', alignItems: 'flex-start' }}>
                      <Text style={{ width: 72, fontSize: 11.5, fontFamily: F.semiBold, color: '#374151' }}>{dd}</Text>
                      <Text style={{ width: 72, fontSize: 11.5, fontFamily: F.regular, color: '#6B7280' }}>{nd}</Text>
                      <Text style={{ flex: 1, fontSize: 11.5, fontFamily: F.regular, color: '#374151', lineHeight: 17 }}>{row.purpose || '—'}</Text>
                    </View>
                  );
                })}
              </View>
            )}

            {saveError ? (
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
                <AlertCircle size={14} color="#EA4335" strokeWidth={2} />
                <Text style={{ fontSize: 12.5, color: '#EA4335', fontFamily: F.regular }}>{saveError}</Text>
              </View>
            ) : null}

            {/* Action buttons */}
            {fc.status !== 'completed' && (
              <Pressable
                onPress={() => handleSave(true)}
                disabled={saving}
                style={{ backgroundColor: saving ? '#99b3f0' : (fc.hearing_date ? '#0078ff' : '#F59E0B'), borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 12, boxShadow: '0 4px 14px rgba(0,120,255,0.25)' }}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <CheckCircle2 size={18} color="#fff" strokeWidth={2.5} />}
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>
                  {saving ? 'Saving…' : fc.hearing_date ? 'Save Case' : 'Save to Records (No Hearing Date)'}
                </Text>
              </Pressable>
            )}
            {fc.status === 'completed' && (
              <Pressable
                onPress={() => handleSave(true)}
                disabled={saving}
                style={{ backgroundColor: saving ? '#D1D5DB' : '#374151', borderRadius: 16, paddingVertical: 16, alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 10, marginBottom: 12 }}
              >
                {saving ? <ActivityIndicator color="#fff" size="small" /> : <CheckCircle2 size={18} color="#fff" strokeWidth={2.5} />}
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>
                  {saving ? 'Saving…' : 'Save to Records'}
                </Text>
              </Pressable>
            )}

            <Pressable
              onPress={() => { populateFromFetched(fc); setScreen('manual'); }}
              style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, paddingVertical: 13, borderRadius: 14, borderWidth: 1.5, borderColor: '#E5E7EB', backgroundColor: '#fff' }}
            >
              <PenLine size={14} color="#6B7280" strokeWidth={2} />
              <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#374151' }}>Edit Details Manually</Text>
            </Pressable>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    );
  }

  // ──────────────────────────────────────────────────────────────────────────
  // SCREEN: Manual Form
  // ──────────────────────────────────────────────────────────────────────────
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F8FAFF' }} edges={['top']}>
      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        <ScrollView showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }}>

          {/* Header */}
          <View style={{ paddingTop: 14, paddingBottom: 16, flexDirection: 'row', alignItems: 'center', gap: 12 }}>
            <Pressable onPress={() => setScreen('crn')} hitSlop={10}
              style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#dee3e8' }}>
              <Text style={{ fontSize: 18, color: '#374151', marginTop: -1 }}>‹</Text>
            </Pressable>
            <View>
              <Text style={{ fontSize: 19, fontFamily: F.extraBold, color: '#111827' }}>Add Case Manually</Text>
              <Text style={{ fontSize: 11.5, fontFamily: F.regular, color: '#9CA3AF' }}>Fill in case details below</Text>
            </View>
          </View>

          {/* ── Section: Case Info ── */}
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
              📋 Case Information
            </Text>
            <EditStyleField label="Case Title" value={caseTitle} onChangeText={setCaseTitle} required />
            {/* Case Number + CNR — 2-column */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <EditStyleField label="Case Number" value={caseNumber} onChangeText={setCaseNumber} placeholder="e.g. CS/123/2024" />
              </View>
              <View style={{ flex: 1 }}>
                <EditStyleField label="CNR Number" value={cnrNumber} onChangeText={setCnrNumber} placeholder="e.g. MHPN01…" />
              </View>
            </View>
            {/* Case Type + Status — 2-column modal selectors */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
                <View style={{ flex: 1 }}>
                <ModalSelectField<string>
                  label="Case Type"
                  value={caseType}
                  options={CASE_TYPES}
                  onSelect={setCaseType}
                />
              </View>
              <View style={{ flex: 1 }}>
                <ModalSelectField<CaseStatus>
                  label="Status"
                  value={status as CaseStatus | ''}
                  options={STATUSES}
                  onSelect={(v) => setStatus(v)}
                  getLabel={(v) => STATUS_LABELS[v] ?? v}
                />              </View>
            </View>
            <EditStyleField label="Filing Number" value={filingNumber} onChangeText={setFilingNumber} placeholder="Optional" />
          </View>

          {/* ── Section: Court ── */}
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
              🏛️ Court Details
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 2 }}>
                <EditStyleField label="Court Name" value={courtName} onChangeText={setCourtName} required />
              </View>
              <View style={{ flex: 1 }}>
                <EditStyleField label="Court Room" value={courtRoom} onChangeText={setCourtRoom} placeholder="e.g. 5" />
              </View>
            </View>
          </View>

          {/* ── Section: Judge ── */}
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
              ⚖️ Judge
            </Text>
            <EditStyleField label="Judge Name" value={judgeName} onChangeText={setJudgeName} />
          </View>

          {/* ── Section: Next Hearing ── */}
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
              📅 Next Hearing
            </Text>

            {/* Date + Time — side-by-side */}
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {/* Date trigger */}
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#727785', letterSpacing: 0.6, textTransform: 'uppercase', marginBottom: 5 }}>
                  Hearing Date <Text style={{ color: '#EA4335' }}>*</Text>
                </Text>
                <Pressable
                  onPress={() => setShowManualDatePicker(!showManualDatePicker)}
                  style={{
                    flexDirection: 'row', alignItems: 'center', gap: 8,
                    backgroundColor: '#f6faff', borderRadius: 10,
                    borderWidth: 1.5, borderColor: showManualDatePicker ? '#0078ff' : '#dee3e8',
                    paddingHorizontal: 11, paddingVertical: 11,
                  }}
                >
                  <Calendar size={14} color={showManualDatePicker ? '#0078ff' : '#9ca3af'} strokeWidth={2} />
                  <Text style={{ flex: 1, fontSize: 12.5, fontFamily: hearingDate ? F.bold : F.regular, color: hearingDate ? '#171c20' : '#9ca3af' }} numberOfLines={1}>
                    {hearingDate ? dayjs(hearingDate).format('DD/MM/YYYY') : 'Select date…'}
                  </Text>
                  {hearingDate
                    ? <Pressable hitSlop={8} onPress={(e) => { e.stopPropagation(); setHearingDate(''); setShowManualDatePicker(false); }}>
                        <X size={12} color="#9ca3af" strokeWidth={2.5} />
                      </Pressable>
                    : <ChevronDown size={12} color="#9ca3af" strokeWidth={2} />}
                </Pressable>
              </View>

              {/* Time trigger */}
              <View style={{ flex: 1 }}>
                <TimePickerField value={hearingTime} onChange={setHearingTime} />
              </View>
            </View>

            {/* Calendar expands full-width below both triggers */}
            {showManualDatePicker && (
              <View style={{ marginTop: 8, borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#dee3e8' }}>
                <DateTimePicker
                  mode="single"
                  date={hearingDate ? dayjs(hearingDate).toDate() : new Date()}
                  onChange={({ date }) => {
                    if (date) setHearingDate(dayjs(date as any).format('YYYY-MM-DD'));
                    setShowManualDatePicker(false);
                  }}
                  styles={CALENDAR_STYLES}
                />
              </View>
            )}
          </View>

          {/* ── Section: Parties ── */}
          <View style={{ backgroundColor: '#fff', borderRadius: 18, padding: 16, marginBottom: 14, boxShadow: '0 2px 8px rgba(0,0,0,0.05)' }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', letterSpacing: 0.5, marginBottom: 14 }}>
              👥 Parties
            </Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              <View style={{ flex: 1 }}>
                <EditStyleField label="Client (Petitioner)" value={clientName} onChangeText={setClientName} />
              </View>
              <View style={{ flex: 1 }}>
                <EditStyleField label="Opponent (Respondent)" value={opponentName} onChangeText={setOpponentName} />
              </View>
            </View>
          </View>

          {formError ? (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 12 }}>
              <AlertCircle size={14} color="#EA4335" strokeWidth={2} />
              <Text style={{ color: '#EA4335', fontSize: 12.5, fontFamily: F.regular }}>{formError}</Text>
            </View>
          ) : null}

          <Pressable
            onPress={() => handleSave(false)}
            disabled={saving}
            style={{
              backgroundColor: saving ? '#6fbf84' : '#34A853',
              borderRadius: 16, paddingVertical: 16,
              alignItems: 'center', opacity: saving ? 0.85 : 1,
              boxShadow: '0 4px 14px rgba(52,168,83,0.35)',
            }}
          >
            {saving
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>Save Case</Text>}
          </Pressable>

        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

