import { useState, useCallback, useEffect } from 'react';
import { View, Text, Pressable, Modal, ScrollView, ActivityIndicator } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';
import {
  CalendarDays, CalendarClock, X,
  ChevronRight, ChevronLeft, Building2, Check,
} from 'lucide-react-native';
import DateTimePicker from 'react-native-ui-datepicker';
import { CALENDAR_STYLES } from '@/lib/calendarStyles';
import dayjs from 'dayjs';
import { supabase } from '@/client/supabase';
import { getCases, updateCase } from '@/db/api';
import type { Case } from '@/types/types';
import { F } from '@/lib/fonts';

type HearingStep = 'cases' | 'date' | 'success';

interface Props {
  visible: boolean;
  onClose: () => void;
  /** When provided, skip the case-selection step and go straight to the date picker */
  preselectedCase?: Case | null;
  /** Called after a successful save with the newly saved date */
  onSaved?: (newDate: string) => void;
}

export function UpdateHearingModal({ visible, onClose, preselectedCase, onSaved }: Props) {
  const skipCaseStep = !!preselectedCase;

  const [step, setStep] = useState<HearingStep>(skipCaseStep ? 'date' : 'cases');
  const [cases, setCases] = useState<Case[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedCase, setSelectedCase] = useState<Case | null>(preselectedCase ?? null);
  const [selectedDate, setSelectedDate] = useState<string>(preselectedCase?.hearing_date ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const loadCases = useCallback(async () => {
    if (skipCaseStep) return;
    setLoading(true);
    setError('');
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) { setLoading(false); setError('Not signed in.'); return; }
    const result = await getCases(user.id);
    setCases(result);
    setLoading(false);
  }, [skipCaseStep]);

  useFocusEffect(useCallback(() => {
    if (visible && !skipCaseStep) loadCases();
  }, [visible, skipCaseStep, loadCases]));

  // Re-sync internal state whenever the modal opens or preselectedCase changes
  useEffect(() => {
    if (!visible) return;
    if (skipCaseStep && preselectedCase) {
      setStep('date');
      setSelectedCase(preselectedCase);
      setSelectedDate(preselectedCase.hearing_date ?? '');
      setError('');
      setSaving(false);
    } else {
      setStep('cases');
      setSelectedCase(null);
      setSelectedDate('');
      setError('');
      setSaving(false);
      loadCases();
    }
  }, [visible]);

  const reset = () => {
    setStep(skipCaseStep ? 'date' : 'cases');
    setSelectedCase(skipCaseStep ? (preselectedCase ?? null) : null);
    setSelectedDate(skipCaseStep ? (preselectedCase?.hearing_date ?? '') : '');
    setError('');
    setSaving(false);
  };

  const handleClose = () => { reset(); onClose(); };

  const handleSelectCase = (c: Case) => {
    setSelectedCase(c);
    setSelectedDate(c.hearing_date || '');
    setStep('date');
  };

  const handleSave = async () => {
    if (!selectedCase || !selectedDate) { setError('Please select a date.'); return; }
    setSaving(true);
    setError('');
    const { error: saveErr } = await updateCase(selectedCase.id, {
      hearing_date: selectedDate,
      next_hearing_date: selectedDate,
    });
    setSaving(false);
    if (saveErr) { setError('Failed to save. Please try again.'); return; }
    onSaved?.(selectedDate);
    setStep('success');
  };

  const formatDate = (d: string) =>
    d ? dayjs(d).format('dddd, D MMMM YYYY') : '';

  return (
    <Modal transparent animationType="slide" visible={visible} onRequestClose={handleClose}>
      <Pressable
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}
        onPress={handleClose}
      >
        <Pressable onPress={() => {}}>
          <SafeAreaView edges={['bottom']} style={{ backgroundColor: '#fff', borderTopLeftRadius: 26, borderTopRightRadius: 26 }}>
            {/* Handle + header */}
            <View style={{ paddingHorizontal: 20, paddingTop: 14, paddingBottom: 12 }}>
              <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 16 }} />
              <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                  {/* Only show back arrow in the full flow (not when case is preselected) */}
                  {step === 'date' && !skipCaseStep && (
                    <Pressable onPress={() => setStep('cases')} hitSlop={8}>
                      <ChevronLeft size={20} color="#0078ff" strokeWidth={2.5} />
                    </Pressable>
                  )}
                  <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#111827' }}>
                    {step === 'cases' ? 'Select Case' : step === 'date' ? 'Pick Hearing Date' : 'Date Updated!'}
                  </Text>
                </View>
                <Pressable
                  onPress={handleClose}
                  hitSlop={8}
                  style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}
                >
                  <X size={15} color="#6B7280" strokeWidth={2.5} />
                </Pressable>
              </View>
            </View>

            <View style={{ height: 1, backgroundColor: '#F3F4F6' }} />

            {/* Step: Cases list */}
            {step === 'cases' && (
              <ScrollView style={{ maxHeight: 420 }} showsVerticalScrollIndicator={false}>
                {loading ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center' }}>
                    <ActivityIndicator color="#0078ff" />
                    <Text style={{ marginTop: 10, fontSize: 15, fontFamily: F.regular, color: '#9CA3AF' }}>Loading cases...</Text>
                  </View>
                ) : cases.length === 0 ? (
                  <View style={{ paddingVertical: 40, alignItems: 'center', gap: 8 }}>
                    <Building2 size={36} color="#D1D5DB" strokeWidth={1.5} />
                    <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#9CA3AF' }}>No cases found</Text>
                    <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#D1D5DB' }}>Add a case first</Text>
                  </View>
                ) : (
                  <View style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
                    {error ? <Text style={{ fontSize: 15, color: '#EA4335', fontFamily: F.regular, marginBottom: 8 }}>{error}</Text> : null}
                    {cases.map((c) => (
                      <Pressable
                        key={c.id}
                        onPress={() => handleSelectCase(c)}
                        style={{
                          flexDirection: 'row', alignItems: 'center', gap: 12,
                          paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#F3F4F6',
                        }}
                      >
                        <View style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center' }}>
                          <Building2 size={18} color="#0078ff" strokeWidth={2} />
                        </View>
                        <View style={{ flex: 1, minWidth: 0 }}>
                          <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827' }} numberOfLines={1}>{c.case_title}</Text>
                          <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#9CA3AF', marginTop: 2 }} numberOfLines={1}>
                            {c.court_name}{c.hearing_date ? ` · ${formatDate(c.hearing_date)}` : ' · No hearing set'}
                          </Text>
                        </View>
                        <ChevronRight size={16} color="#D1D5DB" strokeWidth={2} />
                      </Pressable>
                    ))}
                    <View style={{ height: 16 }} />
                  </View>
                )}
              </ScrollView>
            )}

            {/* Step: Date picker */}
            {step === 'date' && selectedCase && (
              <View>
                <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 4 }}>
                  <View style={{ backgroundColor: '#E8F0FE', borderRadius: 12, padding: 12, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                    <Building2 size={16} color="#0078ff" strokeWidth={2} />
                    <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0078ff', flex: 1 }} numberOfLines={1}>
                      {selectedCase.case_title}
                    </Text>
                  </View>
                </View>

                <View style={{ paddingHorizontal: 8 }}>
                  <DateTimePicker
                    mode="single"
                    date={selectedDate ? dayjs(selectedDate).toDate() : undefined}
                    onChange={({ date }) => {
                      if (date) setSelectedDate(dayjs(date).format('YYYY-MM-DD'));
                    }}
                    styles={CALENDAR_STYLES}
                  />
                </View>

                {selectedDate ? (
                  <View style={{ paddingHorizontal: 16, paddingBottom: 4 }}>
                    <View style={{ backgroundColor: '#E6F4EA', borderRadius: 10, paddingHorizontal: 14, paddingVertical: 10, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                      <CalendarDays size={14} color="#34A853" strokeWidth={2} />
                      <Text style={{ fontSize: 12.5, fontFamily: F.semiBold, color: '#34A853' }}>
                        New date: {formatDate(selectedDate)}
                      </Text>
                    </View>
                  </View>
                ) : null}

                {error ? <Text style={{ fontSize: 15, color: '#EA4335', fontFamily: F.regular, paddingHorizontal: 16, marginBottom: 4 }}>{error}</Text> : null}

                <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 8 }}>
                  <Pressable
                    onPress={handleSave}
                    style={{
                      backgroundColor: saving ? '#99b3f0' : '#0078ff',
                      borderRadius: 14, paddingVertical: 15,
                      alignItems: 'center', flexDirection: 'row', justifyContent: 'center', gap: 8,
                    }}
                  >
                    {saving
                      ? <ActivityIndicator size="small" color="#fff" />
                      : <CalendarClock size={17} color="#fff" strokeWidth={2.5} />}
                    <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>
                      {saving ? 'Saving...' : 'Save Hearing Date'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            )}

            {/* Step: Success */}
            {step === 'success' && selectedCase && (
              <View style={{ paddingHorizontal: 20, paddingVertical: 32, alignItems: 'center', gap: 12 }}>
                <View style={{ width: 64, height: 64, borderRadius: 32, backgroundColor: '#E6F4EA', alignItems: 'center', justifyContent: 'center' }}>
                  <Check size={32} color="#34A853" strokeWidth={2.5} />
                </View>
                <Text style={{ fontSize: 17, fontFamily: F.bold, color: '#111827', textAlign: 'center' }}>Hearing Date Updated</Text>
                <Text style={{ fontSize: 15, fontFamily: F.regular, color: '#6B7280', textAlign: 'center', lineHeight: 20 }}>
                  <Text style={{ fontFamily: F.bold, color: '#0078ff' }}>{selectedCase.case_title}</Text>
                  {'\n'}next hearing set to{'\n'}
                  <Text style={{ fontFamily: F.bold, color: '#111827' }}>{formatDate(selectedDate)}</Text>
                </Text>
                <Pressable
                  onPress={handleClose}
                  style={{ marginTop: 8, backgroundColor: '#0078ff', borderRadius: 14, paddingVertical: 13, paddingHorizontal: 40 }}
                >
                  <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#fff' }}>Done</Text>
                </Pressable>
              </View>
            )}
          </SafeAreaView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
