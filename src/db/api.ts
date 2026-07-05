import { supabase } from '@/client/supabase';
import type { Case, HearingHistory, Profile, TeamMember } from '@/types/types';

// ─── Shared in-memory cache — survives tab switches, enables instant renders ──
// All screens read from these caches synchronously on mount; network refreshes
// happen silently in the background so the UI never shows a blank/loading state.
let _cachedUserId: string | null = null;
let _cachedProfile: Profile | null = null;
let _cachedCases: Case[] | null = null;

export const dataCache = {
  get userId()  { return _cachedUserId; },
  get profile() { return _cachedProfile; },
  get cases()   { return _cachedCases; },
  setUserId(id: string | null)  { _cachedUserId = id; },
  setProfile(p: Profile | null) { _cachedProfile = p; },
  setCases(c: Case[])           { _cachedCases = c; },
  /** Call after logout to wipe stale data */
  clear() { _cachedUserId = null; _cachedProfile = null; _cachedCases = null; },
};

// ─── Profile ────────────────────────────────────────────────────────────────

export async function getProfile(userId: string): Promise<Profile | null> {
  const { data } = await supabase
    .from('profiles')
    .select('*')
    .eq('id', userId)
    .maybeSingle();
  if (data) _cachedProfile = data; // keep cache fresh
  return data;
}

export async function updateProfile(userId: string, updates: Partial<Profile>) {
  const { error } = await supabase
    .from('profiles')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', userId);
  return { error };
}

/** Start free trial for a user — sets trial_start_date & subscription_status='trial' */
export async function startFreeTrial(userId: string) {
  const now = new Date().toISOString();
  const { error } = await supabase
    .from('profiles')
    .update({
      trial_start_date: now,
      subscription_status: 'trial',
      updated_at: now,
    })
    .eq('id', userId);
  return { error };
}

/** Activate premium subscription — 30 days + any remaining trial days */
export async function activatePremium(userId: string, extraDays = 0) {
  const now = new Date();
  const end = new Date(now);
  end.setDate(end.getDate() + 30 + extraDays);
  const { error } = await supabase
    .from('profiles')
    .update({
      subscription_status: 'premium',
      subscription_start_date: now.toISOString(),
      subscription_end_date: end.toISOString(),
      subscription_plan: 'monthly',
      updated_at: now.toISOString(),
    })
    .eq('id', userId);
  return { error, subscription_end_date: end.toISOString() };
}

/** Compute subscription info from profile — days remaining, status label */
export function getSubscriptionInfo(profile: Profile | null): {
  status: 'none' | 'trial' | 'premium' | 'expired';
  daysLeft: number;
  totalDays: number;
  progress: number; // 0–1
  label: string;
  endDateLabel: string;
} {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (!profile) return { status: 'none', daysLeft: 0, totalDays: 7, progress: 0, label: 'No Plan', endDateLabel: '' };

  const rawStatus = profile.subscription_status ?? 'none';

  // ── Free Trial ──────────────────────────────────────────────────────────
  if (rawStatus === 'trial' && profile.trial_start_date) {
    const start = new Date(profile.trial_start_date);
    start.setHours(0, 0, 0, 0);
    const elapsed = Math.floor((today.getTime() - start.getTime()) / 86400000);
    const daysLeft = Math.max(0, 7 - elapsed);
    const progress = Math.min(1, elapsed / 7);
    if (daysLeft === 0) {
      return { status: 'expired', daysLeft: 0, totalDays: 7, progress: 1, label: 'Trial Expired', endDateLabel: '' };
    }
    return {
      status: 'trial', daysLeft, totalDays: 7,
      progress, label: 'Free Trial',
      endDateLabel: `${daysLeft} Day${daysLeft === 1 ? '' : 's'} Left`,
    };
  }

  // ── Premium ─────────────────────────────────────────────────────────────
  if (rawStatus === 'premium' && profile.subscription_end_date) {
    const end = new Date(profile.subscription_end_date);
    end.setHours(0, 0, 0, 0);
    const start = profile.subscription_start_date ? new Date(profile.subscription_start_date) : new Date(end.getTime() - 30 * 86400000);
    start.setHours(0, 0, 0, 0);
    const totalDays = Math.round((end.getTime() - start.getTime()) / 86400000);
    const daysLeft = Math.max(0, Math.ceil((end.getTime() - today.getTime()) / 86400000));
    const elapsed = totalDays - daysLeft;
    const progress = Math.min(1, elapsed / totalDays);
    if (daysLeft === 0) {
      return { status: 'expired', daysLeft: 0, totalDays, progress: 1, label: 'Plan Expired', endDateLabel: '' };
    }
    const fmt = end.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
    return {
      status: 'premium', daysLeft, totalDays,
      progress, label: 'Premium Plan',
      endDateLabel: `Valid till ${fmt}`,
    };
  }

  // ── Expired explicit ────────────────────────────────────────────────────
  if (rawStatus === 'expired') {
    return { status: 'expired', daysLeft: 0, totalDays: 30, progress: 1, label: 'Plan Expired', endDateLabel: '' };
  }

  return { status: 'none', daysLeft: 0, totalDays: 7, progress: 0, label: 'No Plan', endDateLabel: '' };
}

// ─── Cases ───────────────────────────────────────────────────────────────────

export async function getCases(userId: string): Promise<Case[]> {
  const { data } = await supabase
    .from('cases')
    .select('*')
    .eq('user_id', userId)
    .order('hearing_date', { ascending: true })
    .limit(200);
  const result = Array.isArray(data) ? data : [];
  _cachedCases = result; // keep cache fresh
  return result;
}

export async function getCaseById(id: string): Promise<Case | null> {
  const { data } = await supabase
    .from('cases')
    .select('*')
    .eq('id', id)
    .maybeSingle();
  return data;
}

// Date columns in Postgres reject empty strings and full ISO datetime strings —
// normalise '' → null and "2021-12-15T00:00:00Z" → "2021-12-15" before insert.
const DATE_FIELDS: (keyof Case)[] = [
  'hearing_date', 'next_hearing_date', 'filing_date', 'decision_date',
  'first_hearing_date', 'registration_date',
];

function sanitizeDateValue(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  // Normalise ISO datetime to date-only (e.g. "2021-12-15T00:00:00Z" → "2021-12-15")
  if (/^\d{4}-\d{2}-\d{2}T/.test(v)) return v.substring(0, 10);
  // Reject anything that doesn't look like YYYY-MM-DD
  if (!/^\d{4}-\d{2}-\d{2}$/.test(v)) return null;
  return v;
}

/**
 * Postgres `time` column only accepts "HH:MM" or "HH:MM:SS".
 * Convert user-entered strings like "10:30 AM" / "2:30 PM" → "HH:MM:00".
 */
function sanitizeTimeValue(v: unknown): string | null {
  if (v === '' || v === null || v === undefined) return null;
  if (typeof v !== 'string') return null;
  const s = v.trim();
  // Already in HH:MM or HH:MM:SS — return as-is
  if (/^\d{1,2}:\d{2}(:\d{2})?$/.test(s)) {
    const parts = s.split(':');
    const hh = parts[0].padStart(2, '0');
    const mm = parts[1];
    return `${hh}:${mm}:00`;
  }
  // Parse 12-hour format: "10:30 AM", "2:30 PM", "10:30AM"
  const match12 = s.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (match12) {
    let h = parseInt(match12[1], 10);
    const m = match12[2];
    const ampm = match12[3].toUpperCase();
    if (ampm === 'AM' && h === 12) h = 0;
    if (ampm === 'PM' && h !== 12) h += 12;
    return `${String(h).padStart(2, '0')}:${m}:00`;
  }
  return null; // unparseable → send null
}

function sanitizeCasePayload(
  caseData: Omit<Case, 'id' | 'created_at' | 'updated_at'>,
): Omit<Case, 'id' | 'created_at' | 'updated_at'> {
  const sanitized = { ...caseData } as Record<string, unknown>;
  for (const field of DATE_FIELDS) {
    sanitized[field] = sanitizeDateValue(sanitized[field]);
  }
  sanitized['hearing_time'] = sanitizeTimeValue(sanitized['hearing_time']);
  return sanitized as Omit<Case, 'id' | 'created_at' | 'updated_at'>;
}

export async function createCase(caseData: Omit<Case, 'id' | 'created_at' | 'updated_at'>) {
  const { data, error } = await supabase
    .from('cases')
    .insert(sanitizeCasePayload(caseData));
  if (error) {
    console.error('[createCase] Supabase insert error:', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    });
  }
  return { data, error };
}

export async function updateCase(id: string, updates: Partial<Case>) {
  const { error } = await supabase
    .from('cases')
    .update({ ...updates, updated_at: new Date().toISOString() })
    .eq('id', id);
  return { error };
}

export async function deleteCase(id: string) {
  const { error } = await supabase.from('cases').delete().eq('id', id);
  return { error };
}

// ─── Hearing History ─────────────────────────────────────────────────────────

export async function getHearingHistory(caseId: string): Promise<HearingHistory[]> {
  const { data } = await supabase
    .from('hearing_history')
    .select('*')
    .eq('case_id', caseId)
    .order('hearing_date', { ascending: false })
    .limit(50);
  return Array.isArray(data) ? data : [];
}

export async function addHearingHistory(
  entry: Omit<HearingHistory, 'id' | 'created_at'>
) {
  const { error } = await supabase.from('hearing_history').insert(entry);
  return { error };
}

// ─── Team Members ────────────────────────────────────────────────────────────

export async function getTeamMembers(profileId: string): Promise<TeamMember[]> {
  const { data } = await supabase
    .from('team_members')
    .select('*')
    .eq('profile_id', profileId)
    .order('created_at', { ascending: true });
  return Array.isArray(data) ? data : [];
}

export async function addTeamMember(member: Omit<TeamMember, 'id' | 'created_at'>) {
  const { error } = await supabase.from('team_members').insert(member);
  return { error };
}

export async function removeTeamMember(id: string) {
  const { error } = await supabase.from('team_members').delete().eq('id', id);
  return { error };
}
