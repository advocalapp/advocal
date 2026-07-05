/**
 * Shared DateTimePicker styles — matches the home calendar design.
 * Used in: add-case.tsx, case/[id].tsx, UpdateHearingModal.tsx, profile.tsx, tasks.tsx
 *
 * Design tokens:
 *   Primary blue   : #0078ff
 *   Today ring     : #0078ff border, no fill
 *   Selected circle: #0078ff filled, white label
 *   Day text       : #202124 (Inter Regular 13)
 *   Header month   : #202124 (Inter Bold 15)
 *   Weekday labels : #6B7280 (Inter SemiBold 11)
 *   Outside days   : #C5C9D0
 *   Disabled       : #D1D5DB
 */

import type { DatePickerBaseProps } from 'react-native-ui-datepicker';
import { F } from './fonts';

type Styles = NonNullable<DatePickerBaseProps['styles']>;

export const CALENDAR_STYLES: Styles = {
  // ── Header ──────────────────────────────────────────────────────────────
  header: {
    marginBottom: 6,
    paddingHorizontal: 4,
  },
  month_selector_label: {
    fontSize: 15,
    fontFamily: F.bold,
    color: '#202124',
  },
  year_selector_label: {
    fontSize: 15,
    fontFamily: F.bold,
    color: '#202124',
  },
  button_prev: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F3F4',
    alignItems: 'center',
    justifyContent: 'center',
  },
  button_next: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#F1F3F4',
    alignItems: 'center',
    justifyContent: 'center',
  },

  // ── Weekday row ──────────────────────────────────────────────────────────
  weekday_label: {
    fontSize: 11,
    fontFamily: F.semiBold,
    color: '#6B7280',
    textTransform: 'uppercase',
  },

  // ── Day cells ────────────────────────────────────────────────────────────
  day_cell: {
    paddingVertical: 3,
  },
  day: {
    borderRadius: 20,         // circular cells — matches home calendar
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day_label: {
    fontSize: 13,
    fontFamily: F.regular,
    color: '#202124',
  },

  // ── Selected day ─────────────────────────────────────────────────────────
  selected: {
    backgroundColor: '#0078ff',
    borderRadius: 20,
  },
  selected_label: {
    color: '#ffffff',
    fontFamily: F.bold,
    fontSize: 13,
  },

  // ── Today ────────────────────────────────────────────────────────────────
  today: {
    borderWidth: 1.5,
    borderColor: '#0078ff',
    borderRadius: 20,
  },
  today_label: {
    color: '#0078ff',
    fontFamily: F.bold,
    fontSize: 13,
  },

  // ── Outside-month days ───────────────────────────────────────────────────
  outside_label: {
    color: '#C5C9D0',
    fontSize: 13,
    fontFamily: F.regular,
  },

  // ── Disabled days ────────────────────────────────────────────────────────
  disabled_label: {
    color: '#D1D5DB',
    fontSize: 13,
  },

  // ── Month/year grid (when selector is open) ──────────────────────────────
  month_label: {
    fontSize: 13,
    fontFamily: F.semiBold,
    color: '#202124',
  },
  selected_month: {
    backgroundColor: '#0078ff',
    borderRadius: 8,
  },
  selected_month_label: {
    color: '#ffffff',
    fontFamily: F.bold,
  },
  year_label: {
    fontSize: 13,
    fontFamily: F.semiBold,
    color: '#202124',
  },
  selected_year: {
    backgroundColor: '#0078ff',
    borderRadius: 8,
  },
  selected_year_label: {
    color: '#ffffff',
    fontFamily: F.bold,
  },
};
