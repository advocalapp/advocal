export type UserRole = 'user' | 'admin';

export type CaseStatus = 'pending' | 'ongoing' | 'completed' | 'adjourned' | 'urgent';

export interface Profile {
  id: string;
  email: string | null;
  role: UserRole;
  // Core identity (saved at sign-up)
  full_name: string | null;
  company_name: string | null;
  phone_number: string | null;
  address: string | null;
  city: string | null;
  date_of_birth: string | null;      // ISO date: YYYY-MM-DD
  bar_registration_number: string | null;
  avatar_url: string | null;         // Supabase storage public URL
  // Legacy / extended fields
  chamber_name: string | null;
  chamber_address: string | null;
  chamber_phone: string | null;
  profile_photo_url: string | null;
  location: string | null;
  notification_reminders: boolean;
  notification_same_day: boolean;
  notification_next_date: boolean;
  reminder_hours_before: number;
  date_format: string;
  time_format: string;
  subscription_plan: string;
  // Subscription & trial fields
  signup_date: string | null;
  profile_created_at: string | null;
  trial_start_date: string | null;
  subscription_status: 'none' | 'trial' | 'premium' | 'expired';
  subscription_start_date: string | null;
  subscription_end_date: string | null;
  created_at: string;
  updated_at: string;
}

export const INDIA_CITIES = [
  'Agra', 'Ahmedabad', 'Ajmer', 'Aligarh', 'Allahabad', 'Amritsar', 'Aurangabad',
  'Bengaluru', 'Bhopal', 'Bhubaneswar', 'Chandigarh', 'Chennai', 'Coimbatore',
  'Dehradun', 'Delhi', 'Dhanbad', 'Faridabad', 'Ghaziabad', 'Gurugram',
  'Guwahati', 'Hyderabad', 'Indore', 'Jabalpur', 'Jaipur', 'Jammu',
  'Jodhpur', 'Kanpur', 'Kochi', 'Kolkata', 'Kozhikode', 'Lucknow',
  'Ludhiana', 'Madurai', 'Mangaluru', 'Meerut', 'Mumbai', 'Mysuru',
  'Nagpur', 'Nashik', 'Noida', 'Patna', 'Pune', 'Raipur', 'Rajkot',
  'Ranchi', 'Srinagar', 'Surat', 'Thiruvananthapuram', 'Vadodara',
  'Varanasi', 'Vijayawada', 'Visakhapatnam',
] as const;

export interface ECourtHistoryRow {
  judge: string;
  business_date: string | null;
  hearing_date: string | null;
  purpose: string;
}

export interface ECourtOrderRow {
  order_number: string;
  order_date: string | null;
  order_details: string;
  pdf_url?: string | null; // direct PDF/order link from eCourts portal (may be absent for older records)
}

/** One row from the Acts & Sections table on eCourts */
export interface ActRow {
  act: string;
  sections: string;
}

/** FIR details block from eCourts */
export interface FirDetails {
  police_station: string | null;
  fir_number: string | null;
  year: string | null;
}

/** Detailed party entry (petitioner or respondent) with advocate */
export interface PartyInfo {
  name: string;
  advocate: string | null;
}

export interface ECourtParty {
  name: string;
  advocate: string | null;
}

export interface Case {
  id: string;
  user_id: string;
  case_title: string;
  case_type: string | null;
  case_number: string | null;
  cnr_number: string | null;
  filing_number: string | null;
  court_name: string;
  court_room: string | null;
  judge_name: string | null;
  client_name: string | null;
  opponent_name: string | null;
  status: CaseStatus;
  hearing_date: string | null;
  hearing_time: string | null;
  next_hearing_date: string | null;
  notes: string | null;
  // Extended eCourts fields
  filing_date: string | null;
  decision_date: string | null;
  first_hearing_date: string | null;
  nature_of_disposal: string | null;
  petitioner_advocate: string | null;
  respondent_advocate: string | null;
  ecourts_case_history: ECourtHistoryRow[] | null;
  ecourts_final_orders: ECourtOrderRow[] | null;
  // Raw status label from eCourts (e.g. "Case disposed", "Pending")
  case_status_label: string | null;
  registration_date: string | null;
  // Acts & Sections, FIR details, detailed parties
  acts_under: ActRow[] | null;
  fir_details: FirDetails | null;
  petitioner_parties: PartyInfo[] | null;
  respondent_parties: PartyInfo[] | null;
  created_at: string;
  updated_at: string;
}

export interface HearingHistory {
  id: string;
  case_id: string;
  user_id: string;
  hearing_date: string;
  hearing_time: string | null;
  outcome: string | null;
  notes: string | null;
  created_at: string;
}

export interface TeamMember {
  id: string;
  profile_id: string;
  name: string;
  role: string | null;
  email: string | null;
  phone: string | null;
  created_at: string;
}

export const STATUS_LABELS: Record<CaseStatus, string> = {
  pending: 'Pending',
  ongoing: 'Ongoing',
  completed: 'Completed',
  adjourned: 'Adjourned',
  urgent: 'Urgent',
};

export const STATUS_COLORS: Record<CaseStatus, { bg: string; text: string; dot: string }> = {
  pending:   { bg: '#d8e2ff', text: '#004494', dot: '#0058bd' },
  ongoing:   { bg: '#d8e2ff', text: '#004494', dot: '#0058bd' },
  completed: { bg: '#89fa9b', text: '#005320', dot: '#006e2c' },
  adjourned: { bg: '#ffdea0', text: '#5c4300', dot: '#765700' },
  urgent:    { bg: '#ffdad6', text: '#93000a', dot: '#ba1a1a' },
};

export const CASE_TYPES = [
  'Civil',
  'Criminal',
  'Family',
  'Corporate',
  'Constitutional',
  'Labour',
  'Tax',
  'Property',
  'Consumer',
  'Other',
];

export const SUBSCRIPTION_PLANS = [
  { id: 'free', label: 'Free', description: 'Manual case management & calendar access' },
  { id: 'starter', label: 'Starter', description: 'Up to 10 cases' },
  { id: 'professional', label: 'Professional', description: 'Up to 50 cases' },
  { id: 'enterprise', label: 'Enterprise', description: 'Unlimited cases' },
];
