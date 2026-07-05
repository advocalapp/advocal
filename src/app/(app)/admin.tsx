/**
 * Admin Dashboard — Subscription Analytics + Legal Content Editor
 * Accessible only to users with role = 'admin'.
 */
import { useState, useCallback, useRef } from 'react';
import { View, Text, FlatList, Pressable, ActivityIndicator, TextInput, ScrollView, Modal } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, useFocusEffect } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import {
  ArrowLeft, Users, CreditCard, Clock, XCircle, RefreshCw,
  Calendar, BadgeCheck, Search, FileText, Save, Info, CalendarPlus,
  Eye, EyeOff, CheckCircle, ChevronDown,
} from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { F } from '@/lib/fonts';
import dayjs from 'dayjs';

// ── Legal pages types ────────────────────────────────────────────────────────
interface LegalPage { id: string; title: string; content: string; updated_at: string; }

const LEGAL_PAGES: { id: string; title: string }[] = [
  { id: 'about_us',         title: 'About Us' },
  { id: 'contact_us',       title: 'Contact Us' },
  { id: 'privacy_policy',   title: 'Privacy & Data' },
  { id: 'terms_conditions', title: 'Terms and Conditions' },
  { id: 'refund_policy',    title: 'Refund & Cancellation Policy' },
  { id: 'payment_checkout', title: 'Payment Checkout Flow' },
];

function LegalEditor() {
  const [pages, setPages]           = useState<Record<string, LegalPage>>({});
  const [loadingAll, setLoadingAll] = useState(true);
  const [saving, setSaving]         = useState<string | null>(null);
  const [saved, setSaved]           = useState<string | null>(null);
  const [errors, setErrors]         = useState<Record<string, string>>({});
  const [drafts, setDrafts]         = useState<Record<string, string>>({});

  useFocusEffect(useCallback(() => {
    let active = true;
    (async () => {
      setLoadingAll(true);
      const { data } = await supabase.from('legal_pages').select('*');
      if (!active) return;
      if (data) {
        const map: Record<string, LegalPage> = {};
        const draftMap: Record<string, string> = {};
        (data as LegalPage[]).forEach((p) => { map[p.id] = p; draftMap[p.id] = p.content; });
        setPages(map);
        setDrafts(draftMap);
      }
      setLoadingAll(false);
    })();
    return () => { active = false; };
  }, []));

  const handleSave = async (id: string) => {
    const content = drafts[id] ?? '';
    if (!content.trim()) { setErrors((e) => ({ ...e, [id]: 'Content cannot be empty.' })); return; }
    setErrors((e) => ({ ...e, [id]: '' }));
    setSaving(id);
    const now = new Date().toISOString();
    const { error } = await supabase
      .from('legal_pages')
      .upsert({ id, title: pages[id]?.title ?? id, content: content.trim(), updated_at: now });
    if (!error) {
      setPages((p) => ({ ...p, [id]: { ...p[id], content: content.trim(), updated_at: now } }));
      setSaved(id);
      setTimeout(() => setSaved(null), 2000);
    }
    setSaving(null);
  };

  if (loadingAll) {
    return (
      <View style={{ paddingVertical: 32, alignItems: 'center' }}>
        <ActivityIndicator color="#0078ff" />
      </View>
    );
  }

  return (
    <View style={{ gap: 16 }}>
      {LEGAL_PAGES.map(({ id, title }) => {
        const page = pages[id];
        const draft = drafts[id] ?? '';
        const isSaving = saving === id;
        const isSaved  = saved  === id;
        const err = errors[id] ?? '';
        return (
          <View key={id} style={{ backgroundColor: '#FFFFFF', borderRadius: 14, borderWidth: 1, borderColor: '#EEF2F7', overflow: 'hidden' }}>
            {/* Card header */}
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
              <View style={{ width: 32, height: 32, borderRadius: 8, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' }}>
                <FileText size={15} color="#0078ff" strokeWidth={2} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0D1A3A' }}>{title}</Text>
                {page?.updated_at && (
                  <Text style={{ fontSize: 10, fontFamily: F.regular, color: '#9CA3AF', marginTop: 1 }}>
                    Updated: {dayjs(page.updated_at).format('DD MMM YYYY, hh:mm A')}
                  </Text>
                )}
              </View>
            </View>

            {/* Text editor */}
            <View style={{ paddingHorizontal: 14, paddingTop: 12, paddingBottom: 8 }}>
              <TextInput
                value={draft}
                onChangeText={(v) => { setDrafts((d) => ({ ...d, [id]: v })); setErrors((e) => ({ ...e, [id]: '' })); }}
                multiline
                placeholder="Enter page content here..."
                placeholderTextColor="#C4CCDF"
                style={{
                  fontSize: 13, fontFamily: F.regular, color: '#374151',
                  lineHeight: 20, minHeight: 120,
                  textAlignVertical: 'top',
                } as any}
              />
              {!!err && (
                <Text style={{ fontSize: 11, fontFamily: F.medium, color: '#E53E3E', marginTop: 4 }}>{err}</Text>
              )}
            </View>

            {/* Save button */}
            <View style={{ paddingHorizontal: 14, paddingBottom: 14 }}>
              <Pressable
                onPress={() => handleSave(id)}
                disabled={isSaving}
                style={{
                  flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8,
                  backgroundColor: isSaved ? '#1E8A3C' : '#0078ff',
                  borderRadius: 10, paddingVertical: 11,
                  opacity: isSaving ? 0.7 : 1,
                }}
              >
                {isSaving
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <Save size={14} color="#fff" strokeWidth={2.5} />
                }
                <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#FFFFFF' }}>
                  {isSaved ? 'Saved!' : isSaving ? 'Saving...' : 'Save Changes'}
                </Text>
              </Pressable>
            </View>
          </View>
        );
      })}
    </View>
  );
}

interface AdminUser {
  id: string;
  email: string | null;
  full_name: string | null;
  phone_number: string | null;
  bar_registration_number: string | null;
  city: string | null;
  subscription_status: 'none' | 'trial' | 'premium' | 'expired' | null;
  subscription_plan: string | null;
  subscription_source: string | null;
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  premium_start_date: string | null;
  premium_end_date: string | null;
  case_count: number;
  updated_at: string | null;
  created_at: string;
}

interface UserDetail {
  profile: AdminUser & { trial_start_date?: string | null; trial_end_date?: string | null };
  latest_payment: {
    razorpay_payment_id: string | null;
    razorpay_order_id: string | null;
    payment_status: string | null;
    amount: number | null;
    plan_type: string | null;
    subscription_start: string | null;
    subscription_expiry: string | null;
    created_at: string | null;
  } | null;
  extension_history: {
    id: string;
    plan_type: string;
    reason: string;
    admin_name: string | null;
    previous_end_date: string | null;
    new_end_date: string;
    created_at: string;
  }[];
}

type FilterStatus = 'all' | 'trial' | 'premium' | 'expired' | 'none';

const STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  trial:   { bg: '#FFF8EC', text: '#D48B2F', label: 'Trial' },
  premium: { bg: '#E8F5E9', text: '#1E8A3C', label: 'Paid' },
  expired: { bg: '#FFF0F0', text: '#E53E3E', label: 'Expired' },
  none:    { bg: '#F3F4F6', text: '#9CA3AF', label: 'None' },
};

function StatCard({ icon: Icon, label, value, color, onPress, active }: {
  icon: typeof Users; label: string; value: number | string; color: string;
  onPress?: () => void; active?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={{ flex: 1, backgroundColor: active ? color + '22' : '#FFFFFF', borderRadius: 14, padding: 14, borderWidth: active ? 2 : 1, borderColor: active ? color : '#EEF2F7', gap: 6, alignItems: 'flex-start' }}>
      <View style={{ width: 34, height: 34, borderRadius: 10, backgroundColor: color + '18', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={17} color={color} strokeWidth={2} />
      </View>
      <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#0D1A3A' }}>{value}</Text>
      <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.8 }}>{label}</Text>
    </Pressable>
  );
}

// ── Detail row helper ─────────────────────────────────────────────────────────
function DetailRow({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <View style={{ flexDirection: 'row', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: '#F3F4F6' }}>
      <Text style={{ width: 130, fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 0.3 }}>{label}</Text>
      <Text style={{ flex: 1, fontSize: 12, fontFamily: F.semiBold, color: accent ? '#0078ff' : '#111827' }} numberOfLines={2}>{value}</Text>
    </View>
  );
}

// ── Extend Plan Dialog ────────────────────────────────────────────────────────
function ExtendPlanModal({
  visible, user, adminName, adminId,
  onClose, onSuccess,
}: {
  visible: boolean;
  user: AdminUser | null;
  adminName: string;
  adminId: string;
  onClose: () => void;
  onSuccess: (userId: string) => void;
}) {
  const [planType, setPlanType]   = useState<'monthly' | 'yearly'>('monthly');
  const [reason, setReason]       = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loading, setLoading]     = useState(false);
  const [error, setError]         = useState('');
  const [success, setSuccess]     = useState('');

  const reset = () => { setPlanType('monthly'); setReason(''); setPassword(''); setError(''); setSuccess(''); setLoading(false); };

  const handleConfirm = async () => {
    setError('');
    if (!reason.trim()) { setError('Please enter a reason for extending the plan.'); return; }
    if (!password)       { setError('Admin password is required.'); return; }
    setLoading(true);
    try {
      const { data, error: fnErr } = await supabase.functions.invoke('admin-extend-plan', {
        body: { user_id: user?.id, plan_type: planType, reason: reason.trim(), admin_password: password, admin_id: adminId, admin_name: adminName },
      });
      if (fnErr) throw fnErr;
      const res = data as { error?: string; new_end_date?: string };
      if (res?.error) { setError(res.error); setLoading(false); return; }
      const newExpiry = res.new_end_date ? dayjs(res.new_end_date).format('DD MMM YYYY') : '';
      setSuccess(`Plan extended! New expiry: ${newExpiry}`);
      setTimeout(() => { reset(); onSuccess(user?.id ?? ''); onClose(); }, 1800);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to extend plan. Try again.');
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={() => { reset(); onClose(); }}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={() => { reset(); onClose(); }}>
        <Pressable onPress={(e) => e.stopPropagation()} style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 24, gap: 16 }}>
          {/* Handle */}
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center', marginBottom: 4 }} />

          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View style={{ width: 38, height: 38, borderRadius: 10, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' }}>
              <CalendarPlus size={18} color="#0078ff" strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#0D1A3A' }}>Extend Plan</Text>
              <Text style={{ fontSize: 12, fontFamily: F.regular, color: '#6B7280' }} numberOfLines={1}>{user.full_name ?? 'Unknown'}</Text>
            </View>
          </View>

          {/* Current plan info */}
          <View style={{ backgroundColor: '#F8FAFF', borderRadius: 10, padding: 12, gap: 4 }}>
            <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: 0.4 }}>Current Status</Text>
            <Text style={{ fontSize: 13, fontFamily: F.semiBold, color: '#111827' }}>
              {user.subscription_status ? user.subscription_status.charAt(0).toUpperCase() + user.subscription_status.slice(1) : 'None'}
              {user.subscription_end_date ? `  ·  Expires ${dayjs(user.subscription_end_date).format('DD MMM YYYY')}` : ''}
            </Text>
          </View>

          {/* Plan Type toggle */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#111827', textTransform: 'uppercase', letterSpacing: 0.4 }}>Plan Type</Text>
            <View style={{ flexDirection: 'row', gap: 10 }}>
              {(['monthly', 'yearly'] as const).map((p) => (
                <Pressable key={p} onPress={() => setPlanType(p)}
                  style={{ flex: 1, paddingVertical: 11, borderRadius: 10, alignItems: 'center', backgroundColor: planType === p ? '#0078ff' : '#F3F4F6', borderWidth: planType === p ? 0 : 1, borderColor: '#E5E7EB' }}>
                  <Text style={{ fontSize: 13, fontFamily: F.bold, color: planType === p ? '#FFFFFF' : '#374151' }}>
                    {p === 'monthly' ? 'Monthly (30 days)' : 'Yearly (365 days)'}
                  </Text>
                </Pressable>
              ))}
            </View>
          </View>

          {/* Reason */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#111827', textTransform: 'uppercase', letterSpacing: 0.4 }}>Reason <Text style={{ color: '#E53E3E' }}>*</Text></Text>
            <TextInput
              value={reason}
              onChangeText={setReason}
              placeholder="Enter reason for extending plan..."
              placeholderTextColor="#C4CCDF"
              multiline
              numberOfLines={3}
              style={{ backgroundColor: '#F8FAFF', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', padding: 12, fontSize: 13, fontFamily: F.regular, color: '#111827', minHeight: 72, textAlignVertical: 'top' } as any}
            />
          </View>

          {/* Admin Password */}
          <View style={{ gap: 6 }}>
            <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#111827', textTransform: 'uppercase', letterSpacing: 0.4 }}>Admin Password <Text style={{ color: '#E53E3E' }}>*</Text></Text>
            <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#F8FAFF', borderRadius: 10, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12 }}>
              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter admin password"
                placeholderTextColor="#C4CCDF"
                secureTextEntry={!showPwd}
                style={{ flex: 1, fontSize: 13, fontFamily: F.regular, color: '#111827', paddingVertical: 12 } as any}
              />
              <Pressable onPress={() => setShowPwd(!showPwd)} hitSlop={8}>
                {showPwd ? <EyeOff size={16} color="#9CA3AF" strokeWidth={2} /> : <Eye size={16} color="#9CA3AF" strokeWidth={2} />}
              </Pressable>
            </View>
          </View>

          {/* Error / Success */}
          {!!error   && <Text style={{ fontSize: 12, fontFamily: F.semiBold, color: '#E53E3E', textAlign: 'center' }}>{error}</Text>}
          {!!success && (
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 }}>
              <CheckCircle size={16} color="#1E8A3C" strokeWidth={2} />
              <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#1E8A3C' }}>{success}</Text>
            </View>
          )}

          {/* Confirm button */}
          <Pressable
            onPress={handleConfirm}
            disabled={loading || !!success}
            style={{ backgroundColor: loading || !!success ? '#93C5FD' : '#0078ff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}>
            {loading
              ? <ActivityIndicator color="#fff" size="small" />
              : <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#FFFFFF' }}>Confirm Extension</Text>
            }
          </Pressable>

          <View style={{ height: 8 }} />
        </Pressable>
      </Pressable>
    </Modal>
  );
}

// ── User Detail Modal ─────────────────────────────────────────────────────────
function UserDetailModal({ visible, userId, onClose }: { visible: boolean; userId: string | null; onClose: () => void }) {
  const [detail, setDetail]   = useState<UserDetail | null>(null);
  const [loading, setLoading] = useState(false);

  const prevId = useRef<string | null>(null);

  const load = useCallback(async (uid: string) => {
    setLoading(true);
    setDetail(null);
    const { data } = await supabase.functions.invoke('admin-get-user-detail', { body: { user_id: uid } });
    setDetail((data as UserDetail) ?? null);
    setLoading(false);
  }, []);

  // load when userId changes
  if (visible && userId && userId !== prevId.current) {
    prevId.current = userId;
    load(userId);
  }
  if (!visible && prevId.current) prevId.current = null;

  const p   = detail?.profile;
  const pay = detail?.latest_payment;
  const ext = detail?.extension_history ?? [];

  const remainingDays = p?.subscription_end_date
    ? Math.max(0, dayjs(p.subscription_end_date).diff(dayjs(), 'day'))
    : null;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' }} onPress={onClose}>
        <Pressable onPress={(e) => e.stopPropagation()}
          style={{ backgroundColor: '#FFFFFF', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: '90%' }}>
          {/* Handle + header */}
          <View style={{ padding: 20, borderBottomWidth: 1, borderBottomColor: '#F3F4F6', gap: 8 }}>
            <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: '#E5E7EB', alignSelf: 'center' }} />
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
              <View style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' }}>
                <Info size={16} color="#0078ff" strokeWidth={2} />
              </View>
              <Text style={{ flex: 1, fontSize: 15, fontFamily: F.extraBold, color: '#0D1A3A' }}>Subscription Details</Text>
              <Pressable onPress={onClose} hitSlop={10}
                style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                <Text style={{ fontSize: 16, color: '#6B7280', lineHeight: 18 }}>✕</Text>
              </Pressable>
            </View>
          </View>

          <ScrollView contentContainerStyle={{ padding: 20, gap: 4, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            {loading && <ActivityIndicator color="#0078ff" style={{ marginTop: 40 }} />}
            {!loading && !detail && <Text style={{ textAlign: 'center', color: '#9CA3AF', marginTop: 40, fontFamily: F.regular }}>No data found.</Text>}

            {!loading && detail && (
              <>
                {/* Profile section */}
                <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#0078ff', textTransform: 'uppercase', letterSpacing: 0.6, marginBottom: 6, marginTop: 4 }}>Profile</Text>
                <DetailRow label="Full Name"     value={p?.full_name ?? '—'} />
                <DetailRow label="Mobile"        value={p?.phone_number ? `+91 ${p.phone_number}` : '—'} />
                <DetailRow label="Email"         value={p?.email ?? '—'} />
                <DetailRow label="Bar No."       value={p?.bar_registration_number ?? '—'} />

                {/* Subscription section */}
                <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#0078ff', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 6 }}>Subscription</Text>
                <DetailRow label="Current Plan"  value={p?.subscription_plan ? p.subscription_plan.charAt(0).toUpperCase() + p.subscription_plan.slice(1) : '—'} />
                <DetailRow label="Plan Status"   value={p?.subscription_status ? p.subscription_status.charAt(0).toUpperCase() + p.subscription_status.slice(1) : '—'} />
                <DetailRow label="Source"        value={p?.subscription_source ? p.subscription_source.charAt(0).toUpperCase() + p.subscription_source.slice(1) : '—'} />
                <DetailRow label="Activation"    value={p?.subscription_start_date ? dayjs(p.subscription_start_date).format('DD MMM YYYY, hh:mm A') : '—'} />
                <DetailRow label="Expiry"        value={p?.subscription_end_date ? dayjs(p.subscription_end_date).format('DD MMM YYYY, hh:mm A') : '—'} />
                <DetailRow label="Remaining Days" value={remainingDays !== null ? `${remainingDays} day${remainingDays !== 1 ? 's' : ''}` : '—'} accent />
                <DetailRow label="Last Updated"  value={p?.updated_at ? dayjs(p.updated_at).format('DD MMM YYYY, hh:mm A') : '—'} />

                {/* Payment section */}
                <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#0078ff', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 6 }}>Latest Payment</Text>
                {pay ? (
                  <>
                    <DetailRow label="Payment ID"   value={pay.razorpay_payment_id ?? '—'} />
                    <DetailRow label="Order ID"     value={pay.razorpay_order_id ?? '—'} />
                    <DetailRow label="Status"       value={pay.payment_status ?? '—'} />
                    <DetailRow label="Amount"       value={pay.amount != null ? `₹${(pay.amount / 100).toLocaleString('en-IN')}` : '—'} />
                    <DetailRow label="Plan Type"    value={pay.plan_type ? pay.plan_type.charAt(0).toUpperCase() + pay.plan_type.slice(1) : '—'} />
                    <DetailRow label="Payment Date" value={pay.created_at ? dayjs(pay.created_at).format('DD MMM YYYY, hh:mm A') : '—'} />
                  </>
                ) : (
                  <Text style={{ fontSize: 12, fontFamily: F.regular, color: '#9CA3AF', marginBottom: 4 }}>No Razorpay payment found.</Text>
                )}

                {/* Extension history */}
                {ext.length > 0 && (
                  <>
                    <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#0078ff', textTransform: 'uppercase', letterSpacing: 0.6, marginTop: 16, marginBottom: 6 }}>
                      Extension History ({ext.length})
                    </Text>
                    {ext.map((e, i) => (
                      <View key={e.id} style={{ backgroundColor: '#F8FAFF', borderRadius: 10, padding: 12, marginBottom: 8, borderWidth: 1, borderColor: '#EEF2F7' }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', marginBottom: 4 }}>
                          <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#0D1A3A' }}>
                            #{ext.length - i} · {e.plan_type.charAt(0).toUpperCase() + e.plan_type.slice(1)}
                          </Text>
                          <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#9CA3AF' }}>
                            {dayjs(e.created_at).format('DD MMM YY')}
                          </Text>
                        </View>
                        <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#374151' }}>
                          New expiry: {dayjs(e.new_end_date).format('DD MMM YYYY')}
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#374151' }}>
                          By: {e.admin_name ?? 'Admin'}
                        </Text>
                        <Text style={{ fontSize: 11, fontFamily: F.regular, color: '#6B7280', marginTop: 2 }}>
                          "{e.reason}"
                        </Text>
                      </View>
                    ))}
                  </>
                )}
              </>
            )}
          </ScrollView>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

export default function AdminScreen() {
  const router = useRouter();
  const [activeTab, setActiveTab]     = useState<'users' | 'legal'>('users');
  const [users, setUsers]             = useState<AdminUser[]>([]);
  const [total, setTotal]             = useState(0);
  const [loading, setLoading]         = useState(false);
  const [filter, setFilter]           = useState<FilterStatus>('all');
  const [search, setSearch]           = useState('');
  const [page, setPage]               = useState(0);
  const [stats, setStats]             = useState({ trial: 0, premium: 0, expired: 0, none: 0, monthly: 0, yearly: 0, revenue_monthly: 0, revenue_yearly: 0 });

  // Extend Plan modal
  const [extendUser, setExtendUser]   = useState<AdminUser | null>(null);
  // Info modal
  const [detailUserId, setDetailId]   = useState<string | null>(null);

  // Admin identity (fetched once)
  const [adminId, setAdminId]         = useState('');
  const [adminName, setAdminName]     = useState('Admin');

  const PAGE_SIZE = 20;

  const fetchAdminId = useCallback(async () => {
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      setAdminId(data.user.id);
      const { data: prof } = await supabase.from('profiles').select('full_name').eq('id', data.user.id).single();
      if (prof?.full_name) setAdminName(prof.full_name);
    }
  }, []);

  const fetchStats = useCallback(async () => {
    const [trial, premium, expired, none, monthly, yearly, revMonthly, revYearly] = await Promise.all([
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').eq('subscription_status', 'trial'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').eq('subscription_status', 'premium'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').eq('subscription_status', 'expired'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').eq('subscription_status', 'none'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').eq('subscription_plan', 'monthly'),
      supabase.from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'user').eq('subscription_plan', 'yearly'),
      supabase.from('payments').select('amount').eq('payment_status', 'captured').eq('plan_type', 'monthly'),
      supabase.from('payments').select('amount').eq('payment_status', 'captured').eq('plan_type', 'yearly'),
    ]);
    const sumAmounts = (rows: { amount: number }[] | null) =>
      (rows ?? []).reduce((acc, r) => acc + (r.amount ?? 0), 0) / 100;
    setStats({
      trial:           trial.count ?? 0,
      premium:         premium.count ?? 0,
      expired:         expired.count ?? 0,
      none:            none.count ?? 0,
      monthly:         monthly.count ?? 0,
      yearly:          yearly.count ?? 0,
      revenue_monthly: sumAmounts(revMonthly.data as { amount: number }[] | null),
      revenue_yearly:  sumAmounts(revYearly.data as { amount: number }[] | null),
    });
  }, []);

  const fetchUsers = useCallback(async (pageNum: number, status: FilterStatus, q: string) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-get-users', {
        body: { p_search: q, p_status: status, p_page: pageNum, p_pagesize: PAGE_SIZE },
      });
      if (error) throw error;
      const result = data as { data: AdminUser[]; count: number };
      if (pageNum === 0) setUsers(result.data ?? []);
      else setUsers((prev) => [...prev, ...(result.data ?? [])]);
      setTotal(result.count ?? 0);
    } catch (e) {
      console.warn('[Admin] fetchUsers error:', e);
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => {
    setPage(0);
    fetchAdminId();
    fetchStats();
    fetchUsers(0, filter, search);
  }, [fetchAdminId, fetchStats, fetchUsers, filter, search]));

  const handleFilterChange = (f: FilterStatus) => { setFilter(f); setPage(0); fetchUsers(0, f, search); };
  const handleSearch       = (q: string)        => { setSearch(q); setPage(0); fetchUsers(0, filter, q); };
  const handleLoadMore     = () => {
    if (loading || users.length >= total) return;
    const next = page + 1; setPage(next); fetchUsers(next, filter, search);
  };

  // After successful extend, refresh the specific user row
  const handleExtendSuccess = (userId: string) => {
    fetchStats();
    fetchUsers(0, filter, search);
    setExtendUser(null);
    // Update local row immediately
    setUsers((prev) => prev.map((u) => u.id === userId
      ? { ...u, subscription_status: 'premium' }
      : u
    ));
  };

  const FILTERS: { key: FilterStatus; label: string }[] = [
    { key: 'all', label: 'All' }, { key: 'trial', label: 'Trial' },
    { key: 'premium', label: 'Paid' }, { key: 'expired', label: 'Expired' }, { key: 'none', label: 'None' },
  ];

  return (
    <View style={{ flex: 1, backgroundColor: '#F5F7FF' }}>
      <StatusBar style="dark" />
      <SafeAreaView style={{ flex: 1 }} edges={['top', 'bottom']}>

        {/* Header */}
        <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 14, backgroundColor: '#FFFFFF', borderBottomWidth: 1, borderBottomColor: '#EEF2F7' }}>
          <Pressable onPress={() => router.back()} hitSlop={10}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' }}>
            <ArrowLeft size={18} color="#0078ff" strokeWidth={2} />
          </Pressable>
          <Text style={{ flex: 1, textAlign: 'center', fontSize: 17, fontFamily: F.bold, color: '#0D1A3A' }}>Admin Dashboard</Text>
          <Pressable onPress={() => { fetchStats(); fetchUsers(0, filter, search); }} hitSlop={10}
            style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F0F4FF', alignItems: 'center', justifyContent: 'center' }}>
            <RefreshCw size={16} color="#0078ff" strokeWidth={2} />
          </Pressable>
        </View>

        {/* Tab toggle */}
        <View style={{ flexDirection: 'row', marginHorizontal: 16, marginVertical: 12, backgroundColor: '#F0F4FF', borderRadius: 12, padding: 4 }}>
          {(['users', 'legal'] as const).map((tab) => (
            <Pressable key={tab} onPress={() => setActiveTab(tab)}
              style={{ flex: 1, paddingVertical: 9, borderRadius: 9, alignItems: 'center', backgroundColor: activeTab === tab ? '#0078ff' : 'transparent' }}>
              <Text style={{ fontSize: 13, fontFamily: F.bold, color: activeTab === tab ? '#FFFFFF' : '#6B7280', textTransform: 'capitalize' }}>
                {tab === 'users' ? 'Users' : 'Legal'}
              </Text>
            </Pressable>
          ))}
        </View>

        {/* Legal tab */}
        {activeTab === 'legal' && (
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>
            <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#111827', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 12 }}>
              Legal Content Editor
            </Text>
            <LegalEditor />
          </ScrollView>
        )}

        {/* Users tab */}
        {activeTab === 'users' && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
            <View style={{ minWidth: 660 }}>
              <FlatList
                data={users}
                keyExtractor={(u) => u.id}
                contentInsetAdjustmentBehavior="automatic"
                onEndReached={handleLoadMore}
                onEndReachedThreshold={0.5}
                showsVerticalScrollIndicator={false}
                ListHeaderComponent={() => (
                  <View style={{ paddingHorizontal: 16, paddingTop: 16, gap: 12 }}>
                    {/* Stats grid */}
                    <View style={{ gap: 8 }}>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <StatCard icon={Clock}      label="Trial Users"  value={stats.trial}   color="#D48B2F" onPress={() => handleFilterChange('trial')}   active={filter === 'trial'} />
                        <StatCard icon={BadgeCheck} label="Paid Users"   value={stats.premium} color="#1E8A3C" onPress={() => handleFilterChange('premium')} active={filter === 'premium'} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <StatCard icon={XCircle} label="Expired"  value={stats.expired} color="#E53E3E" onPress={() => handleFilterChange('expired')} active={filter === 'expired'} />
                        <StatCard icon={Users}   label="No Plan"  value={stats.none}    color="#9CA3AF" onPress={() => handleFilterChange('none')}    active={filter === 'none'} />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <StatCard icon={Calendar}   label="Monthly Subs" value={stats.monthly} color="#3B6FF0" />
                        <StatCard icon={CreditCard} label="Yearly Subs"  value={stats.yearly}  color="#6558F5" />
                      </View>
                      <View style={{ flexDirection: 'row', gap: 8 }}>
                        <StatCard icon={CreditCard} label="Monthly Rev." value={`₹${stats.revenue_monthly.toLocaleString('en-IN')}`} color="#0EA5E9" />
                        <StatCard icon={CreditCard} label="Yearly Rev."  value={`₹${stats.revenue_yearly.toLocaleString('en-IN')}`}  color="#8B5CF6" />
                      </View>
                      <View style={{ backgroundColor: '#EEF4FF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#C7D9FF' }}>
                        <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#111827' }}>Total Revenue (Razorpay)</Text>
                        <Text style={{ fontSize: 20, fontFamily: F.extraBold, color: '#0078ff' }}>
                          ₹{(stats.revenue_monthly + stats.revenue_yearly).toLocaleString('en-IN')}
                        </Text>
                      </View>
                    </View>

                    {/* Total */}
                    <View style={{ backgroundColor: '#FFFFFF', borderRadius: 14, padding: 14, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderWidth: 1, borderColor: '#EEF2F7' }}>
                      <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#111827' }}>Total Users</Text>
                      <Text style={{ fontSize: 22, fontFamily: F.extraBold, color: '#0078ff' }}>{total}</Text>
                    </View>

                    {/* Search */}
                    <View style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FFFFFF', borderRadius: 12, borderWidth: 1, borderColor: '#E5E7EB', paddingHorizontal: 12, gap: 8 }}>
                      <Search size={15} color="#9CA3AF" strokeWidth={2} />
                      <TextInput
                        value={search} onChangeText={handleSearch}
                        placeholder="Search by name, phone, email..."
                        placeholderTextColor="#C4CCDF"
                        style={{ flex: 1, fontSize: 14, fontFamily: F.regular, color: '#111827', paddingVertical: 12 }}
                      />
                    </View>

                    {/* Filter chips */}
                    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
                      {FILTERS.map(({ key, label }) => (
                        <Pressable key={key} onPress={() => handleFilterChange(key)}
                          style={{ paddingHorizontal: 14, paddingVertical: 7, borderRadius: 999, backgroundColor: filter === key ? '#0078ff' : '#FFFFFF', borderWidth: 1, borderColor: filter === key ? '#0078ff' : '#E5E7EB' }}>
                          <Text style={{ fontSize: 12, fontFamily: F.bold, color: filter === key ? '#FFFFFF' : '#6B7280' }}>{label}</Text>
                        </Pressable>
                      ))}
                    </View>

                    <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#111827', letterSpacing: 0.8, textTransform: 'uppercase' }}>
                      {users.length} of {total} Users
                    </Text>

                    {/* Table column headers — added Actions column */}
                    <View style={{ flexDirection: 'row', backgroundColor: '#F0F4FF', borderRadius: 10, paddingVertical: 9, paddingHorizontal: 10 }}>
                      <Text style={{ width: 120, fontSize: 11, fontFamily: F.bold, color: '#111827', letterSpacing: 0.5, textTransform: 'uppercase' }}>User</Text>
                      <Text style={{ width: 110, fontSize: 11, fontFamily: F.bold, color: '#111827', letterSpacing: 0.5, textTransform: 'uppercase' }}>Contact</Text>
                      <Text style={{ width: 100, fontSize: 11, fontFamily: F.bold, color: '#111827', letterSpacing: 0.5, textTransform: 'uppercase' }}>Bar No.</Text>
                      <Text style={{ width: 80,  fontSize: 11, fontFamily: F.bold, color: '#111827', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' }}>Plan</Text>
                      <Text style={{ width: 56,  fontSize: 11, fontFamily: F.bold, color: '#111827', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' }}>Cases</Text>
                      <Text style={{ width: 90,  fontSize: 11, fontFamily: F.bold, color: '#111827', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'right' }}>Expires</Text>
                      <Text style={{ width: 80,  fontSize: 11, fontFamily: F.bold, color: '#111827', letterSpacing: 0.5, textTransform: 'uppercase', textAlign: 'center' }}>Actions</Text>
                    </View>
                  </View>
                )}
                renderItem={({ item, index }) => {
                  const s = STATUS_COLORS[item.subscription_status ?? 'none'] ?? STATUS_COLORS.none;
                  // Plan badge shows subscription STATUS (Premium/Trial/Expired/None), not plan type
                  const statusLabel = s.label;
                  const expiry = item.subscription_end_date
                    ? dayjs(item.subscription_end_date).format('DD MMM YY')
                    : '—';
                  const isEven = index % 2 === 0;
                  return (
                    <View style={{
                      flexDirection: 'row', alignItems: 'center',
                      paddingVertical: 10, paddingHorizontal: 10,
                      marginHorizontal: 16, marginTop: 4,
                      backgroundColor: isEven ? '#FFFFFF' : '#F8FAFF',
                      borderRadius: 10, borderWidth: 1, borderColor: '#EEF2F7',
                    }}>
                      {/* User */}
                      <View style={{ width: 120, flexDirection: 'row', alignItems: 'center', gap: 7 }}>
                        <View style={{ width: 30, height: 30, borderRadius: 15, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#0078ff' }}>
                            {(item.full_name ?? item.email ?? '?').charAt(0).toUpperCase()}
                          </Text>
                        </View>
                        <Text style={{ flex: 1, fontSize: 12, fontFamily: F.bold, color: '#0D1A3A' }} numberOfLines={2}>{item.full_name ?? 'Unknown'}</Text>
                      </View>
                      {/* Contact */}
                      <Text style={{ width: 110, fontSize: 11, fontFamily: F.regular, color: '#374151' }} numberOfLines={1}>
                        {item.phone_number ? `+91 ${item.phone_number}` : (item.email ?? '—')}
                      </Text>
                      {/* Bar No. */}
                      <Text style={{ width: 100, fontSize: 11, fontFamily: F.regular, color: '#374151' }} numberOfLines={1}>
                        {item.bar_registration_number ?? '—'}
                      </Text>
                      {/* Plan — shows subscription status: Premium / Trial / Expired / None */}
                      <View style={{ width: 80, alignItems: 'center' }}>
                        <View style={{ backgroundColor: s.bg, borderRadius: 6, paddingHorizontal: 8, paddingVertical: 3 }}>
                          <Text style={{ fontSize: 10, fontFamily: F.bold, color: s.text }}>{statusLabel}</Text>
                        </View>
                      </View>
                      {/* Cases — numeric count */}
                      <Text style={{ width: 56, fontSize: 13, fontFamily: F.bold, color: '#111827', textAlign: 'center' }}>
                        {item.case_count}
                      </Text>
                      {/* Expires */}
                      <Text style={{ width: 90, fontSize: 11, fontFamily: F.semiBold, color: '#374151', textAlign: 'right' }} numberOfLines={1}>
                        {expiry}
                      </Text>
                      {/* Actions — ⓘ Info + Extend Plan */}
                      <View style={{ width: 80, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                        <Pressable onPress={() => setDetailId(item.id)} hitSlop={6}
                          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' }}>
                          <Info size={14} color="#0078ff" strokeWidth={2} />
                        </Pressable>
                        <Pressable onPress={() => setExtendUser(item)} hitSlop={6}
                          style={{ width: 30, height: 30, borderRadius: 8, backgroundColor: '#E8F5E9', alignItems: 'center', justifyContent: 'center' }}>
                          <CalendarPlus size={14} color="#1E8A3C" strokeWidth={2} />
                        </Pressable>
                      </View>
                    </View>
                  );
                }}
                ListFooterComponent={() => (
                  loading ? <ActivityIndicator style={{ marginVertical: 20 }} color="#0078ff" /> : null
                )}
                ListEmptyComponent={() => (
                  !loading ? (
                    <View style={{ alignItems: 'center', paddingTop: 48, gap: 8 }}>
                      <Users size={40} color="#D1D5DB" strokeWidth={1.5} />
                      <Text style={{ fontSize: 15, fontFamily: F.semiBold, color: '#9CA3AF' }}>No users found</Text>
                    </View>
                  ) : null
                )}
              />
            </View>
          </ScrollView>
        )}

        {/* Extend Plan Modal */}
        <ExtendPlanModal
          visible={!!extendUser}
          user={extendUser}
          adminName={adminName}
          adminId={adminId}
          onClose={() => setExtendUser(null)}
          onSuccess={handleExtendSuccess}
        />

        {/* User Detail Modal */}
        <UserDetailModal
          visible={!!detailUserId}
          userId={detailUserId}
          onClose={() => setDetailId(null)}
        />

      </SafeAreaView>
    </View>
  );
}
