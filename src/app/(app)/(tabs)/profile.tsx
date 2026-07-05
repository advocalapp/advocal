import { useState, useCallback, useRef, useEffect } from 'react';
import {
  View, Text, ScrollView, Pressable, TextInput,
  ActivityIndicator, Modal, FlatList,
  Keyboard, useWindowDimensions, Linking,
} from 'react-native';import { SafeAreaView } from 'react-native-safe-area-context';
import { Image } from 'expo-image';
import { useFocusEffect, useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import { fetch as expoFetch } from 'expo/fetch';
import {
  Phone, Building2, MapPin, Hash, ChevronDown,
  Camera, Search, Calendar, LogOut, Check, X,
  Shield, SquarePen, ChevronRight, User,
  HelpCircle, Scale, ShieldCheck, Wallet, CreditCard, BadgeCheck,
  Mail, MessageCircle,
} from 'lucide-react-native';
import { supabase } from '@/client/supabase';
import { getProfile, updateProfile, getSubscriptionInfo, dataCache } from '@/db/api';
// RevenueCat removed — no logout needed
import type { Profile } from '@/types/types';
import { INDIA_CITIES } from '@/types/types';
import { F } from '@/lib/fonts';
import dayjs from 'dayjs';
import * as WebBrowser from 'expo-web-browser';
import DateTimePicker from 'react-native-ui-datepicker';
import { CALENDAR_STYLES } from '@/lib/calendarStyles';

// ── City picker modal ──────────────────────────────────────────────────────────
function CityPicker({ visible, selected, onSelect, onClose }: {
  visible: boolean; selected: string; onSelect: (c: string) => void; onClose: () => void;
}) {
  const [query, setQuery] = useState('');
  const searchRef = useRef<TextInput>(null);
  const { height: screenHeight } = useWindowDimensions();
  const [kbHeight, setKbHeight] = useState(0);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setKbHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setKbHeight(0));
    return () => { show.remove(); hide.remove(); };
  }, []);

  useEffect(() => {
    if (visible) {
      setQuery('');
      setTimeout(() => searchRef.current?.focus(), 300);
    } else {
      setKbHeight(0);
    }
  }, [visible]);

  const filtered = INDIA_CITIES.filter((c) => c.toLowerCase().includes(query.toLowerCase()));
  // paddingBottom on the backdrop physically lifts the sheet above the keyboard.
  // The sheet is capped at 55% screen height so there is always room for results.
  const sheetMaxH = screenHeight * 0.55;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View
        style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end', paddingBottom: kbHeight }}
      >
        <View
          style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, maxHeight: sheetMaxH }}
        >
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', padding: 20, borderBottomWidth: 1, borderBottomColor: '#F0F0F0' }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#0A0A0A', letterSpacing: 0.2 }}>Select City</Text>
            <Pressable onPress={onClose} hitSlop={10}><Text style={{ fontSize: 24, color: '#9CA3AF' }}>×</Text></Pressable>
          </View>
          {/* Search box */}
          <View style={{ flexDirection: 'row', alignItems: 'center', margin: 12, paddingHorizontal: 14, backgroundColor: '#F5F5F5', borderRadius: 12, gap: 8 }}>
            <Search size={15} color="#9CA3AF" strokeWidth={2} />
            <TextInput
              ref={searchRef}
              value={query} onChangeText={setQuery}
              placeholder="Search city…" placeholderTextColor="#C0C0C0"
              style={{ flex: 1, fontSize: 15, fontFamily: query ? F.bold : F.regular, color: '#0A0A0A', paddingVertical: 11, outlineWidth: 0 }}
              returnKeyType="search"
            />
            {query.length > 0 && (
              <Pressable onPress={() => setQuery('')} hitSlop={8}>
                <Text style={{ fontSize: 18, color: '#9CA3AF', lineHeight: 20 }}>×</Text>
              </Pressable>
            )}
          </View>
          {/* Results */}
          <FlatList
            data={filtered} keyExtractor={(c) => c}
            keyboardShouldPersistTaps="handled"
            contentContainerStyle={{ paddingHorizontal: 12, paddingBottom: 24 }}
            ListEmptyComponent={
              <View style={{ paddingVertical: 32, alignItems: 'center' }}>
                <Text style={{ fontSize: 15, color: '#9CA3AF' }}>No city found for "{query}"</Text>
              </View>
            }
            renderItem={({ item }) => (
              <Pressable
                onPress={() => { onSelect(item); onClose(); }}
                style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingVertical: 13, paddingHorizontal: 14, borderRadius: 10, backgroundColor: item === selected ? '#F0F0F0' : 'transparent', marginBottom: 2 }}
              >
                <Text style={{ fontSize: 15, fontFamily: item === selected ? F.bold : F.regular, color: item === selected ? '#0A0A0A' : '#374151' }}>{item}</Text>
                {item === selected && (
                  <View style={{ width: 18, height: 18, borderRadius: 9, backgroundColor: '#0A0A0A', alignItems: 'center', justifyContent: 'center' }}>
                    <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>✓</Text>
                  </View>
                )}
              </Pressable>
            )}
          />
        </View>
      </View>
    </Modal>
  );
}

// ── DOB picker modal (uses react-native-ui-datepicker — same on all platforms) ─
function DobPicker({ visible, value, onChange, onClose }: {
  visible: boolean; value: string; onChange: (d: string) => void; onClose: () => void;
}) {
  const [selected, setSelected] = useState<Date>(
    value ? dayjs(value).toDate() : dayjs().subtract(25, 'year').toDate()
  );

  useEffect(() => {
    if (visible) {
      setSelected(value ? dayjs(value).toDate() : dayjs().subtract(25, 'year').toDate());
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const handleConfirm = () => {
    onChange(dayjs(selected).format('YYYY-MM-DD'));
    onClose();
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={{ flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' }}>
        <View style={{ backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 20, paddingBottom: 32 }}>
          {/* Header */}
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <Text style={{ fontSize: 16, fontFamily: F.bold, color: '#111827' }}>Date of Birth</Text>
            <Pressable onPress={onClose} hitSlop={10}>
              <Text style={{ fontSize: 24, color: '#9CA3AF' }}>×</Text>
            </Pressable>
          </View>

          {/* Calendar picker */}
          <View style={{ borderRadius: 14, overflow: 'hidden', backgroundColor: '#fff', borderWidth: 1.5, borderColor: '#E5E7EB' }}>
            <DateTimePicker
              mode="single"
              date={selected}
              maxDate={dayjs().subtract(18, 'year').toDate()}
              onChange={({ date }) => { if (date) setSelected(date as Date); }}
              styles={CALENDAR_STYLES}
            />
          </View>

          {/* Confirm */}
          <Pressable
            onPress={handleConfirm}
            style={{ marginTop: 14, backgroundColor: '#0078ff', borderRadius: 12, paddingVertical: 14, alignItems: 'center' }}
          >
            <Text style={{ color: '#fff', fontSize: 15, fontFamily: F.bold }}>
              Confirm — {dayjs(selected).format('DD MMM YYYY')}
            </Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

// ── Section header with icon ──────────────────────────────────────────────────
function SectionHeader({ icon: Icon, title }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  title: string;
}) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 10, marginLeft: 2 }}>
      <View style={{ width: 26, height: 26, borderRadius: 7, backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={13} color="#0078ff" strokeWidth={2.2} />
      </View>
      <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#1A1A1A', letterSpacing: 0.2 }}>{title}</Text>
    </View>
  );
}

// ── Full-width single-column info row ─────────────────────────────────────────
function InfoRow({ icon: Icon, label, value }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  value: string | null | undefined;
}) {
  return (
    <View style={{
      flexDirection: 'row', alignItems: 'center', gap: 14,
      backgroundColor: '#fff', borderRadius: 12,
      paddingHorizontal: 14, paddingVertical: 13,
      borderWidth: 1, borderColor: '#E5E7EB',
      marginBottom: 8,
    }}>
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color="#0078ff" strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 1.1, textTransform: 'uppercase', marginBottom: 2 }}>{label}</Text>
        <Text style={{ fontSize: 14, fontFamily: F.bold, color: value ? '#111827' : '#C0C0C0' }} numberOfLines={2}>{value || '—'}</Text>
      </View>
    </View>
  );
}

// ── Full-width pressable row (Legal / Help items) ─────────────────────────────
function PressableRow({ icon: Icon, label, subLabel, onPress, danger }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string;
  subLabel?: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      style={{
        flexDirection: 'row', alignItems: 'center', gap: 14,
        backgroundColor: pressed ? (danger ? '#FFF5F5' : '#F5F8FF') : '#fff',
        borderRadius: 12,
        paddingHorizontal: 14, paddingVertical: subLabel ? 12 : 14,
        borderWidth: 1, borderColor: '#E5E7EB',
        marginBottom: 8,
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 9, backgroundColor: danger ? '#FEE2E2' : '#EFF6FF', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
        <Icon size={16} color={danger ? '#DC2626' : '#0078ff'} strokeWidth={2} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontFamily: F.bold, color: danger ? '#DC2626' : '#111827' }}>{label}</Text>
        {subLabel ? <Text style={{ fontSize: 11, fontFamily: F.bold, color: '#9CA3AF', marginTop: 1 }}>{subLabel}</Text> : null}
      </View>
      <ChevronRight size={15} color={danger ? '#DC2626' : '#9CA3AF'} strokeWidth={2} />
    </Pressable>
  );
}
function EditField({ label, value, onChangeText, placeholder, multiline, autoCapitalize, keyboardType }: {
  label: string; value: string; onChangeText: (v: string) => void;
  placeholder?: string; multiline?: boolean;
  autoCapitalize?: 'none' | 'sentences' | 'words' | 'characters';
  keyboardType?: 'default' | 'email-address' | 'phone-pad';
}) {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#1A1A1A', letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
      <TextInput
        style={{
          backgroundColor: '#FAFAFA', borderRadius: 12, borderWidth: 1.5, borderColor: '#E0E0E0',
          paddingHorizontal: 14, paddingVertical: multiline ? 12 : 14,
          fontSize: 15, color: '#0A0A0A', fontFamily: F.regular,
          minHeight: multiline ? 72 : undefined, textAlignVertical: multiline ? 'top' : 'center',
          outlineWidth: 0,
        }}
        placeholder={placeholder} placeholderTextColor="#C0C0C0"
        value={value} onChangeText={onChangeText}
        multiline={multiline}
        autoCapitalize={autoCapitalize ?? (multiline ? 'sentences' : 'words')}
        keyboardType={keyboardType ?? 'default'}
        autoCorrect={false}
      />
    </View>
  );
}

function getInitials(name: string | null | undefined): string {
  if (!name) return 'U';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

// ── SupportCard — pressable InfoCard-style tile for Support & Legal grid ──────
function SupportCard({ icon: Icon, label, value, onPress, danger }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string; value: string; onPress: () => void; danger?: boolean;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
      style={{
        flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10,
        backgroundColor: pressed ? (danger ? '#FFF5F5' : '#F0F4FF') : '#F9FAFB',
        borderRadius: 12, paddingHorizontal: 12, paddingVertical: 13,
        borderWidth: 1, borderColor: '#E5E7EB',
      }}
    >
      <View style={{
        width: 32, height: 32, borderRadius: 9,
        backgroundColor: danger ? '#FEE2E2' : '#EFF6FF',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <Icon size={15} color={danger ? '#EF4444' : '#111827'} strokeWidth={danger ? 1.8 : 2} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: danger ? '#9CA3AF' : '#1A73E8', letterSpacing: 1.1, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontSize: 12, fontFamily: F.bold, color: danger ? '#EF4444' : '#111827', lineHeight: 17 }} numberOfLines={2}>{value}</Text>
      </View>
    </Pressable>
  );
}


function MenuRow({ icon: Icon, label, value, url }: {
  icon: React.ComponentType<{ size: number; color: string; strokeWidth: number }>;
  label: string; value: string; url: string;
}) {
  const [pressed, setPressed] = useState(false);
  return (
    <Pressable
      onPress={() => WebBrowser.openBrowserAsync(url)}
      onPressIn={() => setPressed(true)} onPressOut={() => setPressed(false)}
      style={{
        flexDirection: 'row', alignItems: 'flex-start', gap: 14,
        paddingVertical: 14,
        backgroundColor: pressed ? '#F9FAFB' : '#FFFFFF',
        borderBottomWidth: 1, borderBottomColor: '#F0F0F0',
      }}
    >
      <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: '#FFFFFF', borderWidth: 1, borderColor: '#E8F0FE', alignItems: 'center', justifyContent: 'center', marginTop: 1 }}>
        <Icon size={15} color="#111827" strokeWidth={1.8} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#9CA3AF', letterSpacing: 1.2, textTransform: 'uppercase' }}>{label}</Text>
        <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#1A1A1A', lineHeight: 20 }}>{value}</Text>
      </View>
      <ChevronRight size={15} color="#9CA3AF" strokeWidth={2} style={{ marginTop: 12 }} />
    </Pressable>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────
export default function ProfileScreen() {
  const router = useRouter();
  const [profile, setProfile]     = useState<Profile | null>(() => dataCache.profile);
  const [_loading, setLoading]     = useState(false);
  const [profileLoaded, setProfileLoaded] = useState(dataCache.profile !== null);
  const [editing, setEditing]     = useState(false);
  const [saving, setSaving]       = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [showCity, setShowCity]   = useState(false);
  const [showDob, setShowDob]     = useState(false);

  // Edit form state
  const [fullName, setFullName]       = useState('');
  const [companyName, setCompanyName] = useState('');
  const [address, setAddress]         = useState('');
  const [city, setCity]               = useState('');
  const [dob, setDob]                 = useState('');
  const [avatarUri, setAvatarUri]     = useState('');   // local preview URI
  const [avatarUrl, setAvatarUrl]     = useState('');   // uploaded public URL
  const [activeTab, setActiveTab] = useState<'profile' | 'subscription' | 'legal' | 'help' | null>(null);

  // Only show spinner on the very first load; re-focuses refresh silently
  const initialLoadDone = useRef(false);

  useFocusEffect(useCallback(() => {
    const _silent = initialLoadDone.current;
    initialLoadDone.current = true;
    loadData(true);  // always silent — layout visible immediately
  }, []));

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    try {
      let uid = dataCache.userId;
      if (!uid) {
        const { data: { user } } = await supabase.auth.getUser();
        uid = user?.id ?? null;
        if (uid) dataCache.setUserId(uid);
      }
      if (uid) {
        const p = await getProfile(uid);
        if (p) setProfile(p); // dataCache.profile updated inside getProfile()
      }
    } catch {
      // silently handle errors — profile keeps previous data
    } finally {
      if (!silent) setLoading(false);
      setProfileLoaded(true);
    }
  };

  const startEdit = () => {
    if (!profile) return;
    setFullName(profile.full_name ?? '');
    setCompanyName(profile.company_name ?? '');
    setAddress(profile.address ?? profile.chamber_address ?? '');
    setCity(profile.city ?? '');
    setDob(profile.date_of_birth ?? '');
    setAvatarUri('');
    setAvatarUrl(profile.avatar_url ?? profile.profile_photo_url ?? '');
    setSaveError('');
    setEditing(true);
  };

  const cancelEdit = () => { setEditing(false); setSaveError(''); };

  const pickPhoto = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') { setSaveError('Photo library permission is required.'); return; }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'], allowsEditing: true, aspect: [1, 1], quality: 1,
    });
    if (result.canceled) return;
    const uri = result.assets[0].uri;
    const compressed = await manipulateAsync(uri, [{ resize: { width: 400 } }], { compress: 0.75, format: SaveFormat.JPEG });
    setAvatarUri(compressed.uri);
    setUploading(true);
    try {
      const resp = await expoFetch(compressed.uri);
      const buf  = await resp.arrayBuffer();
      const path = `avatars/${Date.now()}_${Math.random().toString(36).slice(2)}.jpg`;
      const { error: upErr } = await supabase.storage.from('avatars').upload(path, buf, { contentType: 'image/jpeg', upsert: true });
      if (!upErr) {
        const { data: urlData } = supabase.storage.from('avatars').getPublicUrl(path);
        setAvatarUrl(urlData.publicUrl);
      } else {
        setSaveError('Photo upload failed. Profile picture will not be updated.');
      }
    } catch { setSaveError('Photo upload failed.'); }
    setUploading(false);
  };

  const handleSave = async () => {
    setSaveError('');
    if (!fullName.trim()) { setSaveError('Full name is required.'); return; }
    if (!profile) return;
    setSaving(true);
    const { error } = await updateProfile(profile.id, {
      full_name:    fullName.trim(),
      company_name: companyName.trim() || null,
      address:      address.trim() || null,
      city:         city || null,
      date_of_birth: dob || null,
      avatar_url:   avatarUrl || null,
    });
    setSaving(false);
    if (error) { setSaveError('Save failed. Please try again.'); return; }
    await loadData();
    setEditing(false);
  };

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const displayName   = profile?.full_name ?? 'Advocate';
  const displayAvatar = (editing ? avatarUri || avatarUrl : profile?.avatar_url ?? profile?.profile_photo_url) ?? '';
  const phoneNumber   = profile?.phone_number;
  const barId         = profile?.bar_registration_number;

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: '#F5F5F5' }} edges={['top']}>
      <ScrollView contentContainerStyle={{ paddingBottom: 48 }} showsVerticalScrollIndicator={false}>

        {/* ── Compact profile header ────────────────────────────────────── */}
        <View style={{ backgroundColor: '#FFFFFF', paddingHorizontal: 16, paddingTop: 14, paddingBottom: 14, borderBottomWidth: 1, borderBottomColor: '#F0F4FF' }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 14 }}>

            {/* Avatar */}
            <Pressable onPress={editing ? pickPhoto : undefined} style={{ position: 'relative' }}>
              <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: '#E8F0FE', backgroundColor: '#EEF4FF', alignItems: 'center', justifyContent: 'center', overflow: 'hidden' }}>
                {!profileLoaded ? (
                  // Skeleton avatar — no initials flash before data arrives
                  <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: '#E5E7EB' }} />
                ) : displayAvatar ? (
                  <Image source={{ uri: displayAvatar }} style={{ width: 60, height: 60 }} contentFit="cover" cachePolicy="memory-disk" />
                ) : (
                  <Image source={{ uri: 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260622/person.png' }} style={{ width: 44, height: 44 }} contentFit="contain" cachePolicy="memory-disk" />
                )}
              </View>
              {editing && (
                <View style={{ position: 'absolute', bottom: 0, right: 0, width: 22, height: 22, borderRadius: 11, backgroundColor: '#0078ff', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#fff' }}>
                  {uploading ? <ActivityIndicator size="small" color="#fff" /> : <Camera size={10} color="#fff" strokeWidth={2.5} />}
                </View>
              )}
            </Pressable>

            {/* Identity */}
            <View style={{ flex: 1, gap: 2 }}>
              <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#0D1A3A', letterSpacing: -0.2 }} numberOfLines={1}>{displayName}</Text>
              {barId ? (
                <View style={{ flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 3 }}>
                  <Image source={{ uri: 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260622/advocate.png' }} style={{ width: 16, height: 16 }} contentFit="contain" />
                  <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#111827', letterSpacing: 1 }}>BAR: {barId}</Text>
                </View>
              ) : null}
            </View>

            {/* Edit / Save / Cancel buttons */}
            {!editing ? (
              <Pressable
                onPress={startEdit}
                style={{ flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: '#EEF4FF', paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}
              >
                <SquarePen size={13} color="#111827" strokeWidth={2} />
                <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#111827' }}>Edit</Text>
              </Pressable>
            ) : (
              <View style={{ flexDirection: 'row', gap: 8 }}>
                <Pressable onPress={cancelEdit} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#F3F4F6', alignItems: 'center', justifyContent: 'center' }}>
                  <X size={15} color="#6B7280" strokeWidth={2.5} />
                </Pressable>
                <Pressable onPress={handleSave} disabled={saving} style={{ width: 36, height: 36, borderRadius: 10, backgroundColor: '#0078ff', alignItems: 'center', justifyContent: 'center', opacity: saving ? 0.6 : 1 }}>
                  {saving ? <ActivityIndicator size="small" color="#fff" /> : <Check size={15} color="#fff" strokeWidth={2.5} />}
                </Pressable>
              </View>
            )}
          </View>

          {saveError ? <Text style={{ fontSize: 15, color: '#C0392B', fontFamily: F.medium, marginTop: 8 }}>{saveError}</Text> : null}
        </View>

        {/* ── Thin accent line ───────────────────────────────────────────── */}
        <View style={{ height: 3, backgroundColor: '#3B6FF0' }} />

        {/* ── Golden subscription banner (always visible above menu) ─────── */}
        {!editing && profileLoaded && (() => {
          const sub = getSubscriptionInfo(profile);
          if (sub.status === 'premium') return (
            <View style={{
              marginHorizontal: 16, marginTop: 14,
              borderRadius: 14,
              backgroundColor: '#FFFBEA',
              borderWidth: 1.5, borderColor: '#F59E0B',
              paddingVertical: 12, paddingHorizontal: 16,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(245,158,11,0.18)' }],
            }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Image source={{ uri: 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260622/advoc.png' }} style={{ width: 26, height: 26 }} contentFit="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: F.extraBold, color: '#111827', letterSpacing: 1, textTransform: 'uppercase' }}>Pro Plan</Text>
                <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#111827', lineHeight: 22 }}>{sub.daysLeft} Days Remaining</Text>
              </View>
              {sub.daysLeft <= 7 ? (
                <Pressable onPress={() => router.push('/(app)/payment' as any)} style={{ backgroundColor: '#F59E0B', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#fff' }}>Renew</Text>
                </Pressable>
              ) : (
                <View style={{ backgroundColor: '#D1D5DB', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}>
                  <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#fff' }}>Renew</Text>
                </View>
              )}
            </View>
          );
          if (sub.status === 'trial') return (
            <View style={{
              marginHorizontal: 16, marginTop: 14,
              borderRadius: 14,
              backgroundColor: '#FFFBEA',
              borderWidth: 1.5, borderColor: '#F59E0B',
              paddingVertical: 12, paddingHorizontal: 16,
              flexDirection: 'row', alignItems: 'center', gap: 12,
              boxShadow: [{ offsetX: 0, offsetY: 2, blurRadius: 8, color: 'rgba(245,158,11,0.18)' }],
            }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEF3C7', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <Image source={{ uri: 'https://miaoda-conversation-file.s3cdn.medo.dev/user-c90ar68ml4hs/app-c90by552ew3l/20260622/advoc.png' }} style={{ width: 26, height: 26 }} contentFit="contain" />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: F.extraBold, color: '#111827', letterSpacing: 1, textTransform: 'uppercase' }}>Free Trial</Text>
                <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#111827', lineHeight: 22 }}>{sub.daysLeft} Day{sub.daysLeft !== 1 ? 's' : ''} Remaining</Text>
              </View>
              <Pressable onPress={() => router.push('/(app)/payment' as any)} style={{ backgroundColor: '#F59E0B', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#fff' }}>Upgrade</Text>
              </Pressable>
            </View>
          );
          if (sub.status === 'expired') return (
            <View style={{
              marginHorizontal: 16, marginTop: 14,
              borderRadius: 14,
              backgroundColor: '#FFF4F4',
              borderWidth: 1.5, borderColor: '#EF4444',
              paddingVertical: 12, paddingHorizontal: 16,
              flexDirection: 'row', alignItems: 'center', gap: 12,
            }}>
              <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: '#FEE2E2', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <BadgeCheck size={22} color="#EF4444" strokeWidth={1.8} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={{ fontSize: 11, fontFamily: F.extraBold, color: '#111827', letterSpacing: 1, textTransform: 'uppercase' }}>Expired</Text>
                <Text style={{ fontSize: 16, fontFamily: F.extraBold, color: '#111827', lineHeight: 22 }}>Renew to Continue</Text>
              </View>
              <Pressable onPress={() => router.push('/(app)/payment' as any)} style={{ backgroundColor: '#EF4444', borderRadius: 8, paddingVertical: 6, paddingHorizontal: 12 }}>
                <Text style={{ fontSize: 12, fontFamily: F.bold, color: '#fff' }}>Renew</Text>
              </Pressable>
            </View>
          );
          return null;
        })()}

        {/* ── Edit mode ─────────────────────────────────────────────────── */}
        {editing && (
          <View style={{ marginHorizontal: 16, marginTop: 20, gap: 14 }}>
            <Text style={{ fontSize: 15, fontFamily: F.bold, color: '#1A1A1A', letterSpacing: 0.2 }}>Edit Profile</Text>
            <EditField label="Full Name *" value={fullName} onChangeText={setFullName} placeholder="Full name as on BAR card" autoCapitalize="words" />
            <EditField label="Company / Chamber Name" value={companyName} onChangeText={setCompanyName} placeholder="Optional" autoCapitalize="words" />
            <EditField label="Address" value={address} onChangeText={setAddress} placeholder="Office / chamber address" multiline />
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#1A1A1A', letterSpacing: 1.2, textTransform: 'uppercase' }}>City</Text>
              <Pressable onPress={() => setShowCity(true)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, borderWidth: 1.5, borderColor: city ? '#1A1A1A' : '#E5E7EB', paddingHorizontal: 14, paddingVertical: 14, gap: 10 }}>
                <MapPin size={15} color={city ? '#1A1A1A' : '#9CA3AF'} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 15, fontFamily: city ? F.semiBold : F.regular, color: city ? '#1A1A1A' : '#C0C0C0' }}>{city || 'Select city'}</Text>
                <ChevronDown size={15} color="#9CA3AF" strokeWidth={2} />
              </Pressable>
            </View>
            <View style={{ gap: 6 }}>
              <Text style={{ fontSize: 10, fontFamily: F.bold, color: '#1A1A1A', letterSpacing: 1.2, textTransform: 'uppercase' }}>Date of Birth</Text>
              <Pressable onPress={() => setShowDob(true)} style={{ flexDirection: 'row', alignItems: 'center', backgroundColor: '#FAFAFA', borderRadius: 12, borderWidth: 1.5, borderColor: dob ? '#1A1A1A' : '#E5E7EB', paddingHorizontal: 14, paddingVertical: 14, gap: 10 }}>
                <Calendar size={15} color={dob ? '#1A1A1A' : '#9CA3AF'} strokeWidth={1.8} />
                <Text style={{ flex: 1, fontSize: 15, fontFamily: dob ? F.semiBold : F.regular, color: dob ? '#1A1A1A' : '#C0C0C0' }}>{dob ? dayjs(dob).format('DD MMM YYYY') : 'Select date of birth'}</Text>
              </Pressable>
            </View>
            <View style={{ backgroundColor: '#F5F5F5', borderRadius: 10, padding: 12, gap: 4, borderWidth: 1, borderColor: '#E5E5E5' }}>
              <Text style={{ fontSize: 13, fontFamily: F.bold, color: '#4B4B4B', letterSpacing: 0.3 }}>Cannot be changed</Text>
              <Text style={{ fontSize: 13, color: '#6B6B6B', lineHeight: 18 }}>Mobile number (+91 {phoneNumber}) and BAR ID ({barId ?? '—'}) are locked after registration.</Text>
            </View>
            {saveError ? <Text style={{ color: '#C0392B', fontSize: 15, fontFamily: F.medium }}>{saveError}</Text> : null}
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            MASTER — vertical menu list (shown when no section is open)
        ════════════════════════════════════════════════════════════════════ */}
        {!editing && activeTab === null && (
          <View style={{ marginHorizontal: 16, marginTop: 20, gap: 10 }}>
            <PressableRow icon={User}        label="Profile"        subLabel="Mobile, address, company & more"  onPress={() => setActiveTab('profile')} />
            <PressableRow icon={CreditCard}  label="Subscription"   subLabel="Plan status, expiry & renewal"     onPress={() => setActiveTab('subscription')} />
            <PressableRow icon={Scale}       label="Legal"          subLabel="Terms, privacy & policies"         onPress={() => setActiveTab('legal')} />
            <PressableRow icon={HelpCircle}  label="Help & Support" subLabel="Email, WhatsApp support"           onPress={() => setActiveTab('help')} />
            {/* ── Logout — always visible below all 4 menu items ── */}
            <PressableRow icon={LogOut} label="Logout" onPress={handleLogout} danger />
          </View>
        )}

        {/* ══════════════════════════════════════════════════════════════════
            DETAIL — back button + section content
        ════════════════════════════════════════════════════════════════════ */}
        {!editing && activeTab !== null && (
          <View>
            {/* Back button */}
            <Pressable
              onPress={() => setActiveTab(null)}
              style={{ flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingTop: 16, paddingBottom: 4 }}
            >
              <ChevronRight size={18} color="#0078ff" strokeWidth={2.5} style={{ transform: [{ rotate: '180deg' }] }} />
              <Text style={{ fontSize: 14, fontFamily: F.bold, color: '#0078ff' }}>Back</Text>
            </Pressable>

            {/* Profile section */}
            {activeTab === 'profile' && (
              <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                <InfoRow icon={Phone}     label="Mobile"            value={phoneNumber ? `+91 ${phoneNumber}` : null} />
                <InfoRow icon={Calendar}  label="Date of Birth"     value={profile?.date_of_birth ? dayjs(profile.date_of_birth).format('DD MMM YYYY') : null} />
                <InfoRow icon={Building2} label="Company / Chamber" value={profile?.company_name} />
                <InfoRow icon={MapPin}    label="City"              value={profile?.city} />
                <InfoRow icon={Hash}      label="Bar Registration"  value={barId} />
                <InfoRow icon={MapPin}    label="Address"           value={profile?.address ?? profile?.chamber_address} />
              </View>
            )}

            {/* Subscription section */}
            {activeTab === 'subscription' && (
              <View>
                <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                  <InfoRow icon={ShieldCheck} label="Plan Status" value={profile?.subscription_status ? profile.subscription_status.charAt(0).toUpperCase() + profile.subscription_status.slice(1) : null} />
                  <InfoRow icon={BadgeCheck}  label="Plan Type"   value={profile?.subscription_plan   ? profile.subscription_plan.charAt(0).toUpperCase()   + profile.subscription_plan.slice(1)   : null} />
                  <InfoRow icon={Calendar}    label="Plan Expiry" value={profile?.subscription_end_date ? dayjs(profile.subscription_end_date).format('DD MMM YYYY') : null} />
                  <PressableRow icon={Wallet} label="Upgrade / Renew Plan" subLabel="View available plans & pricing" onPress={() => router.push('/(app)/payment' as any)} />
                </View>
              </View>
            )}

            {/* Legal section */}
            {activeTab === 'legal' && (
              <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                <PressableRow icon={HelpCircle}  label="About Us"             onPress={() => router.push({ pathname: '/(app)/legal-content' as any, params: { id: 'about_us' } })} />
                <PressableRow icon={Phone}       label="Contact Us"           onPress={() => router.push({ pathname: '/(app)/legal-content' as any, params: { id: 'contact_us' } })} />
                <PressableRow icon={ShieldCheck} label="Privacy & Data"       onPress={() => router.push({ pathname: '/(app)/legal-content' as any, params: { id: 'privacy_policy' } })} />
                <PressableRow icon={Scale}       label="Terms & Conditions"   onPress={() => router.push({ pathname: '/(app)/legal-content' as any, params: { id: 'terms_conditions' } })} />
                <PressableRow icon={Wallet}      label="Refund & Cancellation" onPress={() => router.push({ pathname: '/(app)/legal-content' as any, params: { id: 'refund_policy' } })} />
                <PressableRow icon={CreditCard}  label="Payment Checkout"     onPress={() => router.push({ pathname: '/(app)/legal-content' as any, params: { id: 'payment_checkout' } })} />
              </View>
            )}

            {/* Help & Support section */}
            {activeTab === 'help' && (
              <View style={{ marginHorizontal: 16, marginTop: 12 }}>
                <PressableRow
                  icon={Mail}
                  label="support@advocal.in"
                  onPress={() => Linking.openURL('mailto:support@advocal.in')}
                />
                <PressableRow
                  icon={MessageCircle}
                  label="+91 8097777676 (WhatsApp)"
                  onPress={() => Linking.openURL('whatsapp://send?phone=918097777676')}
                />
                {profile?.role === 'admin' && (
                  <PressableRow icon={Shield} label="Admin Dashboard" onPress={() => router.push('/(app)/admin' as any)} />
                )}
              </View>
            )}
          </View>
        )}

      </ScrollView>

      <CityPicker visible={showCity} selected={city} onSelect={setCity} onClose={() => setShowCity(false)} />
      <DobPicker visible={showDob} value={dob} onChange={setDob} onClose={() => setShowDob(false)} />
    </SafeAreaView>
  );
}
