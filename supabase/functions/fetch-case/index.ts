import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const ECOURTS_BASE      = 'https://services.ecourts.gov.in/ecourtindia_v6';
const HC_BASE           = 'https://hcservices.ecourts.gov.in/ecourtindiaHC';
const HCSERVICES_BASE   = 'https://hcservices.ecourts.gov.in/hcservices';
const STT_ENDPOINT = 'https://app-c90by552ew3l-api-DY8MNQoqOnMa.gateway.appmedo.com/v1/audio/transcriptions';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── HC State mapping ──────────────────────────────────────────────────────────
type HcInfo = { state_cd: number; stateNm: string; name: string };

// Primary map: 2-letter state code → HC info
// Keys are the official CNR prefix first-2-chars per the eCourts HC CNR Prefix List.
// Multiple keys can map to the same HC (e.g. PB/HR/PH all → Punjab & Haryana HC).
const HC_MAP: Record<string, HcInfo> = {
  MH: { state_cd: 1,  stateNm: 'Bombay',            name: 'Bombay High Court' },
  AP: { state_cd: 2,  stateNm: 'Andhra Pradesh',    name: 'High Court of Andhra Pradesh' },
  KA: { state_cd: 3,  stateNm: 'Karnataka',         name: 'High Court of Karnataka' },
  KL: { state_cd: 4,  stateNm: 'Kerala',            name: 'High Court of Kerala' },
  HP: { state_cd: 5,  stateNm: 'Himachal Pradesh',  name: 'High Court of Himachal Pradesh' },
  AS: { state_cd: 6,  stateNm: 'Assam',             name: 'Gauhati High Court' },
  MZ: { state_cd: 6,  stateNm: 'Assam',             name: 'Gauhati High Court' },          // MZHC — Mizoram (under Gauhati jurisdiction on portal)
  JH: { state_cd: 7,  stateNm: 'Jharkhand',         name: 'High Court of Jharkhand' },
  BR: { state_cd: 8,  stateNm: 'Patna',             name: 'Patna High Court' },
  RJ: { state_cd: 9,  stateNm: 'Rajasthan',         name: 'Rajasthan High Court' },
  TN: { state_cd: 10, stateNm: 'Madras',            name: 'Madras High Court' },
  OR: { state_cd: 11, stateNm: 'Odisha',            name: 'Orissa High Court' },            // legacy alias
  OD: { state_cd: 11, stateNm: 'Odisha',            name: 'Orissa High Court' },            // ODHC — official prefix per CNR list
  JK: { state_cd: 12, stateNm: 'Jammu and Kashmir', name: 'High Court of J&K' },
  UP: { state_cd: 13, stateNm: 'Uttar Pradesh',     name: 'Allahabad High Court' },
  UK: { state_cd: 15, stateNm: 'Uttarakhand',       name: 'Uttarakhand High Court' },
  WB: { state_cd: 16, stateNm: 'Calcutta',          name: 'Calcutta High Court' },
  GJ: { state_cd: 17, stateNm: 'Gujarat',           name: 'Gujarat High Court' },
  CG: { state_cd: 18, stateNm: 'Chhattisgarh',      name: 'Chhattisgarh High Court' },
  MP: { state_cd: 23, stateNm: 'Madhya Pradesh',    name: 'Madhya Pradesh High Court' },   // state_cd=23 per portal (was 19)
  TR: { state_cd: 20, stateNm: 'Tripura',           name: 'Tripura High Court' },
  ML: { state_cd: 21, stateNm: 'Meghalaya',         name: 'Meghalaya High Court' },
  PB: { state_cd: 22, stateNm: 'Punjab',            name: 'Punjab & Haryana High Court' }, // legacy alias
  HR: { state_cd: 22, stateNm: 'Punjab',            name: 'Punjab & Haryana High Court' }, // legacy alias
  PH: { state_cd: 22, stateNm: 'Punjab',            name: 'Punjab & Haryana High Court' }, // PHHC — official prefix per CNR list
  SK: { state_cd: 24, stateNm: 'Sikkim',            name: 'Sikkim High Court' },
  MN: { state_cd: 25, stateNm: 'Manipur',           name: 'Manipur High Court' },
  DL: { state_cd: 26, stateNm: 'Delhi',             name: 'Delhi High Court' },
  TS: { state_cd: 29, stateNm: 'Telangana',         name: 'Telangana High Court' },
};

// Reverse map: HC state code (number) → HC info
// Used for HC[STATE]-prefixed CNRs (e.g. HCMA, HCBM) where the 2-letter code
// after "HC" is NOT the same as our HC_MAP keys.
const _HC_STATECD_MAP: Record<number, HcInfo> = Object.fromEntries(
  // Deduplicate by state_cd — keep first entry when multiple states share one HC
  Object.values(HC_MAP).reduce((m, v) => {
    if (!m.has(v.state_cd)) m.set(v.state_cd, v);
    return m;
  }, new Map<number, HcInfo>()).entries(),
);

// Known HC[STATE] 2-letter abbreviation → state_cd mapping
// Covers courts that use the HC-prefix CNR format (e.g. HCMA01…)
const _HC_PREFIX_MAP: Record<string, number> = {
  MA: 10, // Madras (Tamil Nadu)
  BM: 1,  // Bombay (Maharashtra)
  AT: 13, // Allahabad (Uttar Pradesh)
  DL: 26, // Delhi
  KA: 3,  // Karnataka
  KL: 4,  // Kerala
  JP: 9,  // Jaipur bench, Rajasthan
  JO: 9,  // Jodhpur bench, Rajasthan
  GH: 6,  // Gauhati (Assam)
  CL: 16, // Calcutta
  PA: 8,  // Patna
};

// ── Helpers ───────────────────────────────────────────────────────────────────

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

function extractTableValue(html: string, label: string): string | null {
  const labelEsc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const re = new RegExp(`<th[^>]*>\\s*(?:<[^>]*>)*\\s*${labelEsc}\\s*(?:<\\/[^>]*>)*\\s*<\\/th>\\s*<td[^>]*>(.*?)<\\/td>`, 'is');
  const m = html.match(re);
  return m ? stripHtml(m[1]) : null;
}

function parseDate(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  const m1 = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
  if (m1) return `${m1[3]}-${m1[2].padStart(2, '0')}-${m1[1].padStart(2, '0')}`;
  const m2 = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m2) return `${m2[3]}-${m2[2].padStart(2, '0')}-${m2[1].padStart(2, '0')}`;
  const m3 = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (m3) return s;
  const monthMap: Record<string, string> = {
    january: '01', february: '02', march: '03', april: '04',
    may: '05', june: '06', july: '07', august: '08',
    september: '09', october: '10', november: '11', december: '12',
  };
  const m4 = s.match(/(\d{1,2})(?:st|nd|rd|th)?\s+(\w+)\s+(\d{4})/i);
  if (m4) {
    const mon = monthMap[m4[2].toLowerCase()];
    if (mon) return `${m4[3]}-${mon}-${m4[1].padStart(2, '0')}`;
  }
  return null;
}

function mapStatus(raw: string | null | undefined, natureOfDisposal?: string | null): string {
  if (!raw) return 'pending';
  const s = raw.toLowerCase();
  // A case with only "transfer" in status is still active — not completed.
  // Only mark completed when disposal is confirmed by "disposed" or "decided" or "closed"
  // AND there is a nature_of_disposal value (confirming the court actually closed it).
  const hasDisposalKeyword = s.includes('disposed') || s.includes('decided') || s.includes('closed');
  const isOnlyTransfer = !hasDisposalKeyword && s.includes('transfer');
  if (isOnlyTransfer) return 'ongoing'; // transferred but still active
  if (hasDisposalKeyword) {
    // Extra guard: if nature_of_disposal is empty, the case may not truly be closed
    if (natureOfDisposal && natureOfDisposal.trim()) return 'completed';
    // No nature of disposal recorded — treat as pending/ongoing
    return 'pending';
  }
  if (s.includes('adjourned')) return 'adjourned';
  if (s.includes('urgent')) return 'urgent';
  if (s.includes('pending')) return 'pending';
  return 'ongoing';
}

interface PartyInfo {
  name: string;
  advocate: string | null;
}

/** Parse all litigants + advocates from a party <ul> block */
function parsePartiesDetailed(html: string, ulClass: string): PartyInfo[] {
  const re = new RegExp(`<ul[^>]*class=['"][^'"]*${ulClass}[^'"]*['"][^>]*>(.*?)<\\/ul>`, 'is');
  const m = html.match(re);
  if (!m) return [];
  const parties: PartyInfo[] = [];
  const liRe = /<li>(.*?)<\/li>/gis;
  let li;
  while ((li = liRe.exec(m[1])) !== null) {
    const parts = li[1].split(/<br\s*\/?>/i);
    const rawName = parts[0].replace(/^\d+\)\s*/, '').trim();
    const name = stripHtml(rawName);
    if (!name) continue;
    // Advocate line: "   Advocate- XXXXX"
    const advPart = parts.find((p) => /advocate/i.test(p));
    const advocate = advPart ? stripHtml(advPart).replace(/^Advocate[-\s]*/i, '').trim() || null : null;
    parties.push({ name, advocate });
  }
  return parties;
}

/** Parse full case history rows from history_table */
interface HistoryRow {
  judge: string;
  business_date: string | null;
  hearing_date: string | null;
  purpose: string;
}

function parseCaseHistory(html: string): HistoryRow[] {
  const histRe = /<table[^>]*class=['"][^'"]*history_table[^'"]*['"][^>]*>(.*?)<\/table>/is;
  const histMatch = html.match(histRe);
  if (!histMatch) return [];
  const rows: HistoryRow[] = [];
  const rowRe = /<tr[^>]*>(.*?)<\/tr>/gis;
  let row;
  while ((row = rowRe.exec(histMatch[1])) !== null) {
    const cells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((c) => stripHtml(c[1]));
    // Skip header rows (th cells) and empty rows
    if (cells.length < 4) continue;
    const judge = cells[0];
    const businessDate = parseDate(cells[1]);
    const hearingDate = parseDate(cells[2]);
    const purpose = cells[3];
    if (!purpose && !businessDate) continue;
    rows.push({ judge, business_date: businessDate, hearing_date: hearingDate, purpose });
  }
  return rows;
}

/** Parse final orders table — extracts order details AND pdf_url from anchor tags */
interface OrderRow {
  order_number: string;
  order_date: string | null;
  order_details: string;
  pdf_url: string | null;
}

function parseFinalOrders(html: string): OrderRow[] {
  const orderRe = /<table[^>]*class=['"][^'"]*order_table[^'"]*['"][^>]*>(.*?)<\/table>/is;
  const orderMatch = html.match(orderRe);
  if (!orderMatch) return [];
  const orders: OrderRow[] = [];
  const rowRe = /<tr[^>]*>(.*?)<\/tr>/gis;
  let row;
  while ((row = rowRe.exec(orderMatch[1])) !== null) {
    // Extract raw cell HTML (before stripping, to capture href links)
    const rawCells = [...row[1].matchAll(/<td[^>]*>(.*?)<\/td>/gis)].map((c) => c[1]);
    if (rawCells.length < 3) continue;
    const orderNumber = stripHtml(rawCells[0]).trim();
    if (!orderNumber || orderNumber.toLowerCase().includes('order number')) continue;

    // Extract PDF URL from any anchor tag in the row
    let pdf_url: string | null = null;
    const rowHtml = row[1];
    const hrefMatch = rowHtml.match(/href=['"]([^'"]*(?:pdf|order|viewOrder|download)[^'"]*)['"]/i)
      || rowHtml.match(/href=['"]([^'"]+)['"]/i);
    if (hrefMatch) {
      const href = hrefMatch[1].trim();
      if (href && href !== '#' && !href.startsWith('javascript')) {
        // Make absolute URL if relative
        pdf_url = href.startsWith('http')
          ? href
          : `https://services.ecourts.gov.in${href.startsWith('/') ? '' : '/'}${href}`;
      }
    }

    // Also check for onclick that contains a URL (eCourts sometimes uses window.open)
    if (!pdf_url) {
      const onclickMatch = rowHtml.match(/onclick=['"][^'"]*(?:window\.open|location)\(['"]([^'"]+)['"]/i);
      if (onclickMatch) {
        const href = onclickMatch[1].trim();
        pdf_url = href.startsWith('http')
          ? href
          : `https://services.ecourts.gov.in${href.startsWith('/') ? '' : '/'}${href}`;
      }
    }

    orders.push({
      order_number: orderNumber,
      order_date: parseDate(stripHtml(rawCells[1])),
      order_details: stripHtml(rawCells[2]).trim(),
      pdf_url,
    });
  }
  return orders;
}

/** Parse Acts & Sections table — returns array of {act, sections} */
interface ActRow { act: string; sections: string; }
function parseActsUnder(html: string): ActRow[] {
  const tableRe = /<table[^>]*class=['"][^'"]*acts_table[^'"]*['"][^>]*>(.*?)<\/table>/is;
  const m = html.match(tableRe);
  if (!m) return [];
  const rows: ActRow[] = [];
  const rowRe = /<tr[^>]*>(.*?)<\/tr>/gis;
  let row;
  while ((row = rowRe.exec(m[1])) !== null) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map((c) => stripHtml(c[1]).trim());
    if (cells.length < 2) continue;
    const act = cells[0];
    const sections = cells[1];
    // Skip header row
    if (!act || act.toLowerCase().includes('under act')) continue;
    rows.push({ act, sections });
  }
  return rows;
}

/** Parse FIR Details section — returns {police_station, fir_number, year} */
interface FirDetails { police_station: string | null; fir_number: string | null; year: string | null; }
function parseFirDetails(html: string): FirDetails {
  // FIR section appears as a table after "FIR Details" heading/label
  const firSectionRe = /FIR Details.*?<table[^>]*>(.*?)<\/table>/is;
  const m = html.match(firSectionRe);
  const result: FirDetails = { police_station: null, fir_number: null, year: null };
  if (!m) return result;
  const rowRe = /<tr[^>]*>(.*?)<\/tr>/gis;
  let row;
  while ((row = rowRe.exec(m[1])) !== null) {
    const cells = [...row[1].matchAll(/<t[dh][^>]*>(.*?)<\/t[dh]>/gis)].map((c) => stripHtml(c[1]).trim());
    if (cells.length < 2) continue;
    const key = cells[0].toLowerCase();
    const val = cells[1];
    if (key.includes('police station'))  result.police_station = val || null;
    else if (key.includes('fir number') || key === 'fir no') result.fir_number = val || null;
    else if (key.includes('year'))       result.year = val || null;
  }
  return result;
}

/** Extract next future hearing from case history rows */
function getNextHearingFromHistory(rows: HistoryRow[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const future = rows
    .map((r) => r.hearing_date)
    .filter((d): d is string => !!d && d >= today)
    .sort();
  return future[0] ?? null;
}

/** Extract the most recent past hearing date from case history rows */
function getLastHearingFromHistory(rows: HistoryRow[]): string | null {
  const today = new Date().toISOString().slice(0, 10);
  const past = rows
    .map((r) => r.hearing_date ?? r.business_date)
    .filter((d): d is string => !!d && d < today)
    .sort()
    .reverse();
  return past[0] ?? null;
}

/** Extract judge name from case_status_table */
function extractJudge(html: string): string | null {
  const re = /Court Number and Judge.*?<td[^>]*><strong>(.*?)<\/strong>/is;
  const m = html.match(re);
  if (!m) return null;
  return stripHtml(m[1]).replace(/^\d+[-\s]+/, '').trim();
}

/** Extract status-table row value by label (handles both <th> and <td> labels) */
function extractStatusRow(html: string, label: string): string | null {
  const labelEsc = label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  // <th scope='row'>LABEL</th><td>VALUE</td>
  const re1 = new RegExp(`<t[hd][^>]*>\\s*(?:<strong>)?\\s*${labelEsc}\\s*(?:</strong>)?\\s*<\\/t[hd]>\\s*<td[^>]*>(.*?)<\\/td>`, 'is');
  const m1 = html.match(re1);
  return m1 ? stripHtml(m1[1]) : null;
}

// ── Main parse function ───────────────────────────────────────────────────────
function parseCaseHtml(html: string, crn: string) {
  // Court name
  const courtMatch = html.match(/<h2[^>]*id=['"]chHeading['"][^>]*>(.*?)<\/h2>/is);
  const court_name = courtMatch ? stripHtml(courtMatch[1]) : null;

  // Case details table
  const case_type = extractTableValue(html, 'Case Type');
  const filing_number_raw = extractTableValue(html, 'Filing Number');
  const filing_number = filing_number_raw?.replace(/\s+/g, ' ').trim() ?? null;
  const filing_date_raw = extractTableValue(html, 'Filing Date');
  const registration_number_raw = extractTableValue(html, 'Registration Number');
  const registration_number = registration_number_raw?.trim() ?? null;
  const registration_date_raw = extractTableValue(html, 'Registration Date');

  // Case status table
  const caseStatusRe = /<table[^>]*class=['"][^'"]*case_status_table[^'"]*['"][^>]*>(.*?)<\/table>/is;
  const statusTableMatch = html.match(caseStatusRe);
  const statusTableHtml = statusTableMatch ? statusTableMatch[1] : html;

  const first_hearing_raw = extractStatusRow(statusTableHtml, 'First Hearing Date');
  const decision_date_raw = extractStatusRow(statusTableHtml, 'Decision Date');
  const nature_of_disposal_raw = extractStatusRow(statusTableHtml, 'Nature of Disposal');

  let case_status_raw: string | null = null;
  const caseStatusRowRe = /Case Status.*?<td[^>]*><strong>(.*?)<\/strong>/is;
  const csm = statusTableHtml.match(caseStatusRowRe);
  if (csm) case_status_raw = stripHtml(csm[1]);

  // Parties with advocate details
  const petitionerParties = parsePartiesDetailed(html, 'Petitioner_Advocate_table');
  const respondentParties = parsePartiesDetailed(html, 'Respondent_Advocate_table');

  const petitioner = petitionerParties.map((p) => p.name).join(', ') || null;
  const respondent = respondentParties.map((p) => p.name).join(', ') || null;
  const petitioner_advocate = petitionerParties.map((p) => p.advocate).filter(Boolean).join(', ') || null;
  const respondent_advocate = respondentParties.map((p) => p.advocate).filter(Boolean).join(', ') || null;

  // Judge
  const judge_name = extractJudge(html);

  // Case history + orders
  const case_history = parseCaseHistory(html);
  const final_orders = parseFinalOrders(html);
  // Acts & Sections
  const acts_under = parseActsUnder(html);
  // FIR details
  const fir_details = parseFirDetails(html);

  // Determine if case is disposed
  const isDisposed = mapStatus(case_status_raw, nature_of_disposal_raw) === 'completed';

  // ── DEBUG: log every raw field that drives status so we can trace wrong results ──
  console.log(`[fetch-case][parseCaseHtml] CNR=${crn}`);
  console.log(`[fetch-case]  case_status_raw       = "${case_status_raw ?? 'NULL'}"`);
  console.log(`[fetch-case]  nature_of_disposal_raw= "${nature_of_disposal_raw ?? 'NULL'}"`);
  console.log(`[fetch-case]  decision_date_raw      = "${decision_date_raw ?? 'NULL'}"`);
  console.log(`[fetch-case]  → mapped status        = "${mapStatus(case_status_raw, nature_of_disposal_raw)}"`);
  console.log(`[fetch-case]  → isDisposed           = ${isDisposed}`);

  // Next hearing: only from future dates; null for disposed cases
  const next_hearing = isDisposed ? null : getNextHearingFromHistory(case_history);
  const last_hearing_date = getLastHearingFromHistory(case_history);
  // hearing_date: null for disposed, future date for live cases
  const hearing_date = next_hearing;

  const case_title = petitioner && respondent
    ? `${petitioner} vs ${respondent}`
    : `Case ${registration_number ?? filing_number ?? crn}`;

  return {
    cnr_number: crn,
    case_number: registration_number ?? filing_number ?? null,
    case_title,
    case_type: case_type ?? null,
    court_name: court_name ?? null,
    court_room: null,
    judge_name: judge_name ?? null,
    petitioner: petitioner ?? null,
    respondent: respondent ?? null,
    petitioner_advocate: petitioner_advocate ?? null,
    respondent_advocate: respondent_advocate ?? null,
    filing_date: parseDate(filing_date_raw),
    registration_date: parseDate(registration_date_raw),
    first_hearing_date: parseDate(first_hearing_raw),
    decision_date: parseDate(decision_date_raw),
    nature_of_disposal: nature_of_disposal_raw?.trim() ?? null,
    hearing_date,
    last_hearing_date,
    status: mapStatus(case_status_raw, nature_of_disposal_raw),
    case_status_label: case_status_raw ?? null,
    // debug fields — shown in preview to verify raw eCourts data
    _raw_case_status: case_status_raw ?? null,
    _raw_nature_of_disposal: nature_of_disposal_raw ?? null,
    _raw_decision_date: decision_date_raw ?? null,
    case_history,
    final_orders,
    petitioner_parties: petitionerParties,
    respondent_parties: respondentParties,
    acts_under,
    fir_details,
    subordinate_court: null,
  };
}

/** Get a fresh HC portal session for a specific court page */
async function getHcSession(state_cd: number, court_code: number, stateNm: string): Promise<HcSession | null> {
  try {
    const url = `${HC_BASE}/cases/c_index.php?state_cd=${state_cd}&dist_cd=1&court_code=${court_code}&stateNm=${encodeURIComponent(stateNm)}`;
    const res = await fetch(url, {
      method: 'GET',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    // Collect all Set-Cookie headers
    const cookies: string[] = [];
    res.headers.forEach((val, key) => {
      if (key.toLowerCase() === 'set-cookie') cookies.push(val);
    });
    let hcSessId = '';
    let jsession  = '';
    for (const c of cookies) {
      const hcm = c.match(/HCSERVICES_SESSID=([^;]+)/);
      if (hcm) hcSessId = hcm[1];
      const jsm = c.match(/JSESSION=([^;]+)/);
      if (jsm) jsession = jsm[1];
    }
    if (!hcSessId) return null;
    return { hcSessId, jsession };
  } catch {
    return null;
  }
}

/** Download the audio captcha WAV from HC portal, returns ArrayBuffer */
async function downloadHcCaptchaAudio(
  state_cd: number, court_code: number, stateNm: string,
  sess: HcSession,
): Promise<{ audioBuffer: ArrayBuffer; captchaPageHtml: string } | null> {
  try {
    const pageUrl = `${HC_BASE}/cases/c_index.php?state_cd=${state_cd}&dist_cd=1&court_code=${court_code}&stateNm=${encodeURIComponent(stateNm)}`;
    const cookieHeader = `HCSERVICES_SESSID=${sess.hcSessId}; JSESSION=${sess.jsession}`;
    const pageRes = await fetch(pageUrl, {
      headers: { 'User-Agent': UA, 'Cookie': cookieHeader },
      signal: AbortSignal.timeout(10_000),
    });
    if (!pageRes.ok) return null;
    const html = await pageRes.text();

    // Extract audio captcha play URL: securimage_play.php?id=XXXX
    const audioMatch = html.match(/securimage_play\.php\?id=([a-f0-9]+)/i);
    if (!audioMatch) {
      console.error('[fetch-case] No audio captcha URL found in HC page');
      return null;
    }
    const audioUrl = `${HC_BASE}/securimage/securimage_play.php?id=${audioMatch[1]}`;
    const audioRes = await fetch(audioUrl, {
      headers: { 'User-Agent': UA, 'Cookie': cookieHeader, 'Referer': pageUrl },
      signal: AbortSignal.timeout(12_000),
    });
    if (!audioRes.ok) return null;
    const audioBuffer = await audioRes.arrayBuffer();
    return { audioBuffer, captchaPageHtml: html };
  } catch (e) {
    console.error('[fetch-case] Error downloading captcha audio:', e);
    return null;
  }
}

/** Map a Whisper-transcribed spoken word to a single captcha character.
 *  Covers number words ("three"→"3"), letter names ("kay"→"K"), and
 *  single-char transcriptions that Whisper already got right ("K"→"K"). */
function wordToChar(word: string): string | null {
  const w = word.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (!w) return null;
  // Already a single alphanumeric → use directly
  if (/^[a-z0-9]$/.test(w)) return w.toUpperCase();
  // Number words
  const numbers: Record<string, string> = {
    zero: '0', oh: '0',
    one: '1', won: '1',
    two: '2', too: '2', to: '2',
    three: '3',
    four: '4', for: '4', fore: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8', ate: '8',
    nine: '9',
  };
  if (numbers[w]) return numbers[w];
  // Letter names (English phonetic alphabet + common TTS variants)
  const letters: Record<string, string> = {
    ay: 'A', aye: 'A', eh: 'A',
    bee: 'B', be: 'B',
    see: 'C', sea: 'C', cee: 'C',
    dee: 'D',
    ee: 'E',
    ef: 'F', eff: 'F',
    gee: 'G', ji: 'G',
    aitch: 'H', haitch: 'H',
    eye: 'I',
    jay: 'J', jey: 'J',
    kay: 'K',
    el: 'L', ell: 'L',
    em: 'M',
    en: 'N',
    pee: 'P',
    queue: 'Q', cue: 'Q', kew: 'Q',
    ar: 'R', are: 'R',
    es: 'S', ess: 'S',
    tee: 'T',
    you: 'U', yoo: 'U',
    vee: 'V',
    doubleyou: 'W', double: 'W',
    ex: 'X',
    why: 'Y', wai: 'Y',
    zee: 'Z', zed: 'Z', ze: 'Z',
  };
  if (letters[w]) return letters[w];
  // Multi-char fallback: if already short (≤3) and alphanumeric, take first char
  if (w.length <= 3 && /^[a-z0-9]+$/.test(w)) return w[0].toUpperCase();
  return null;
}

/** Parse Whisper verbose_json segments into a 5–6 char captcha string.
 *  Whisper may return all chars in ONE segment ("C G D L W") or separate
 *  timed segments. Both cases are handled. */
function parseCaptchaFromSegments(
  segments: Array<{ text: string; start: number; end: number }>,
): string {
  // Collect every word token across all segments
  const allWords: string[] = [];
  for (const seg of segments) {
    allWords.push(...seg.text.trim().split(/\s+/).filter(Boolean));
  }

  // Fast path: if every word is already a single alphanumeric char, join them directly
  // Keep original case — solveAudioCaptcha will lowercase the final result before submission
  const isSingleChars = allWords.every((w) => /^[A-Za-z0-9]$/.test(w.replace(/[^A-Za-z0-9]/g, '')));
  if (isSingleChars) {
    return allWords
      .map((w) => w.replace(/[^A-Za-z0-9]/g, ''))
      .join('');
  }

  // Otherwise map words that are character names (e.g. "kay"→"K", "three"→"3")
  const chars: string[] = [];
  for (const w of allWords) {
    const ch = wordToChar(w);
    if (ch) chars.push(ch);
  }
  return chars.join('');
}

/** Use Whisper to solve the audio captcha — returns 5-6 char string */
async function solveAudioCaptcha(audioBuffer: ArrayBuffer): Promise<string | null> {
  try {
    const apiKey = Deno.env.get('INTEGRATIONS_API_KEY');
    if (!apiKey) {
      console.error('[fetch-case] INTEGRATIONS_API_KEY not set');
      return null;
    }
    if (audioBuffer.byteLength < 1000) {
      console.error('[fetch-case] Audio buffer too small:', audioBuffer.byteLength);
      return null;
    }
    console.log(`[fetch-case] Transcribing ${audioBuffer.byteLength}b captcha audio via Whisper`);

    const formData = new FormData();
    formData.append('file', new Blob([audioBuffer], { type: 'audio/wav' }), 'captcha.wav');
    formData.append('response_format', 'verbose_json');
    // Prompt primes Whisper to expect individual space-separated alphanumeric characters
    formData.append('prompt', 'A 3 K 7 2 P 9 X M L');
    // No language hint — let Whisper auto-detect TTS voice language

    const res = await fetch(STT_ENDPOINT, {
      method: 'POST',
      headers: { 'X-Gateway-Authorization': `Bearer ${apiKey}` },
      body: formData,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      const errText = await res.text();
      console.error(`[fetch-case] Whisper API error: ${res.status} — ${errText.slice(0, 200)}`);
      return null;
    }

    const json = await res.json() as {
      text: string;
      segments?: Array<{ text: string; start: number; end: number }>;
    };
    const rawText = json.text ?? '';
    console.log(`[fetch-case] Whisper raw text: "${rawText}"`);

    // Strategy 1: parse via timed segments (most accurate)
    let captcha = '';
    if (json.segments && json.segments.length > 0) {
      captcha = parseCaptchaFromSegments(json.segments);
      console.log(`[fetch-case] Whisper segments→captcha: "${captcha}"`);
    }

    // Strategy 2: fallback — split raw text by whitespace/punctuation, map each token
    if (captcha.length < 4) {
      const tokens = rawText.trim().split(/[\s,.\-–;:!?]+/).filter(Boolean);
      const chars: string[] = [];
      for (const t of tokens) {
        const ch = wordToChar(t);
        if (ch) chars.push(ch);
      }
      captcha = chars.join('');
      console.log(`[fetch-case] Whisper token-map→captcha: "${captcha}"`);
    }

    // Strategy 3: strip non-alphanumeric as last resort
    if (captcha.length < 4) {
      captcha = rawText.replace(/[^A-Za-z0-9]/g, '');
      console.log(`[fetch-case] Whisper strip-fallback→captcha: "${captcha}"`);
    }

    // HC Securimage stores the code in lowercase and uses case-sensitive comparison.
    // Always submit lowercase to match the stored value.
    const result = captcha.slice(0, 6).toLowerCase() || null;
    console.log(`[fetch-case] Final captcha candidate (lowercase): "${result}"`);
    return result;
  } catch (e) {
    console.error('[fetch-case] Whisper solve error:', e);
    return null;
  }
}

interface HcCaseListItem {
  filing_no:  string;
  cino:       string;
  court_code: string;
  case_type:  string;
  token:      string;
  case_no:    string;
  court_name: string;
  status_raw: string;
  petitioner: string | null;
  respondent: string | null;
}

/** POST filling_no_qry.php with the solved captcha, return parsed case list */
async function queryHcFilingNumber(
  state_cd: number, court_code: number, dist_code: number,
  filing_no: string, rgyear: string, captcha: string,
  sess: HcSession,
): Promise<HcCaseListItem[] | 'captcha_error' | 'not_found' | 'error'> {
  try {
    const referer = `${HC_BASE}/cases/c_index.php?state_cd=${state_cd}&dist_cd=${dist_code}&court_code=${court_code}`;
    const cookieHeader = `HCSERVICES_SESSID=${sess.hcSessId}; JSESSION=${sess.jsession}`;
    const body = new URLSearchParams({
      action_code: 'showRecords',
      state_code:  String(state_cd),
      dist_code:   String(dist_code),
      court_code:  String(court_code),
      case_no:     filing_no,
      rgyear,
      captcha,
    });
    const res = await fetch(`${HC_BASE}/cases/filling_no_qry.php`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Referer': referer,
        'Cookie': cookieHeader,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return 'error';
    const text = (await res.text()).trim().replace(/^\uFEFF/, '');
    console.log(`[fetch-case] filling_no_qry response: "${text.slice(0, 80)}"`);

    // Captcha errors MUST be checked first — "Invalid Captcha" also starts with "Invalid"
    // so if this check comes after the not_found check it would be mis-classified.
    const lower = text.toLowerCase();
    if (
      lower.includes('invalid captcha') ||
      lower === 'error1' ||
      lower === 'error16'
    ) return 'captcha_error';

    // Not-found cases
    if (text === '' || lower === 'error12') return 'not_found';

    // Generic / rate-limit errors
    if (lower.startsWith('error')) return 'error';

    // Parse ## delimited records, each ~ delimited
    // Fields: [0]=filing_no, [1]=case_no, [2]=parties_display, [3]=cino,
    //         [4]=court_code, [5]=dist_code, [6]=court_name,
    //         [7]=case_type_code, [8]=status_html, [9]=token
    const records = text.split('##').filter((r) => r.trim());
    const items: HcCaseListItem[] = [];
    for (const rec of records) {
      const f = rec.split('~');
      if (f.length < 10) continue;
      // Parse party names from "PETITIONER<br/>Versus<br/>RESPONDENT"
      const partiesRaw = f[2]?.trim() ?? '';
      const partiesSplit = partiesRaw.split(/<br\s*\/?>\s*(?:Versus|VS|vs)\s*<br\s*\/?>/i);
      const petitioner = partiesSplit[0] ? stripHtml(partiesSplit[0]).trim() : null;
      const respondent = partiesSplit[1] ? stripHtml(partiesSplit[1]).trim() : null;
      items.push({
        filing_no:  f[0]?.trim() ?? '',
        case_no:    f[1]?.trim() ?? '',
        cino:       f[3]?.trim() ?? '',
        court_code: f[4]?.trim() ?? '',
        court_name: f[6] ? stripHtml(f[6]).trim() : '',
        case_type:  f[7]?.trim() ?? '',
        status_raw: f[8] ? stripHtml(f[8]).trim() : '',
        token:      f[9]?.trim() ?? '',
        petitioner,
        respondent,
      });
    }
    return items.length ? items : 'not_found';
  } catch (e) {
    console.error('[fetch-case] queryHcFilingNumber error:', e);
    return 'error';
  }
}

/** POST o_civil_case_history.php → return HTML case detail */
async function fetchHcCaseDetail(
  state_cd: number, court_code: number, dist_code: number,
  item: HcCaseListItem, sess: HcSession,
): Promise<string | null> {
  try {
    const cookieHeader = `HCSERVICES_SESSID=${sess.hcSessId}; JSESSION=${sess.jsession}`;
    const body = new URLSearchParams({
      state_code: String(state_cd),
      dist_code:  String(dist_code),
      court_code: item.court_code || String(court_code),
      cino:       item.cino,
      token:      item.token,
      case_no:    item.filing_no,
      appFlag:    '',
    });
    const res = await fetch(`${HC_BASE}/cases/o_civil_case_history.php`, {
      method: 'POST',
      headers: {
        'User-Agent': UA,
        'Content-Type': 'application/x-www-form-urlencoded',
        'X-Requested-With': 'XMLHttpRequest',
        'Cookie': cookieHeader,
        'Referer': `${HC_BASE}/cases/c_index.php?state_cd=${state_cd}&dist_cd=${dist_code}&court_code=${court_code}`,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const text = await res.text();
    return text;
  } catch (e) {
    console.error('[fetch-case] fetchHcCaseDetail error:', e);
    return null;
  }
}

// ── hcservices.ecourts.gov.in DIRECT CNR LOOKUP ──────────────────────────────
// This portal accepts any HC CNR directly (no filing-number parsing needed).
// It handles ALL CNR formats including non-HC-prefix ones like WBCHCA0024252022.
// URL: POST /hcservices/cases_qry/index_qry.php
//      action_code=fetchStateDistCourtNew & caseStatusSearchType=CNRNumber

interface HcServicesSession {
  sessId:   string;
  jsession: string;
}

/** Get a fresh session from hcservices main.php, also returns captchaId */
async function getHcServicesSession(): Promise<{ sess: HcServicesSession; captchaId: string } | null> {
  try {
    const res = await fetch(`${HCSERVICES_BASE}/main.php`, {
      method: 'GET',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;

    // Collect Set-Cookie headers
    let sessId = '';
    let jsession = '';
    res.headers.forEach((val, key) => {
      if (key.toLowerCase() !== 'set-cookie') return;
      const hcm = val.match(/HCSERVICES_SESSID=([^;]+)/);
      if (hcm) sessId = hcm[1];
      // Pick the JSESSION scoped to /hcservices (not /ecourtindiaHC)
      const jsm = val.match(/JSESSION=([^;]+)/);
      if (jsm && val.includes('/hcservices')) jsession = jsm[1];
    });
    // Fallback: accept any JSESSION if the scoped one wasn't found
    if (!jsession) {
      res.headers.forEach((val, key) => {
        if (key.toLowerCase() !== 'set-cookie') return;
        const jsm = val.match(/JSESSION=([^;]+)/);
        if (jsm && !jsession) jsession = jsm[1];
      });
    }
    if (!sessId) return null;

    // Extract captcha audio ID from page HTML
    const html = await res.text();
    const captchaMatch = html.match(/securimage_play\.php\?id=([a-f0-9]+)/i);
    if (!captchaMatch) {
      console.error('[fetch-case] hcservices: no captcha ID in page');
      return null;
    }

    return { sess: { sessId, jsession }, captchaId: captchaMatch[1] };
  } catch (e) {
    console.error('[fetch-case] getHcServicesSession error:', e);
    return null;
  }
}

/** Download audio captcha WAV from hcservices securimage */
async function downloadHcServicesCaptcha(
  captchaId: string,
  sess: HcServicesSession,
): Promise<ArrayBuffer | null> {
  try {
    const cookieHeader = sess.jsession
      ? `HCSERVICES_SESSID=${sess.sessId}; JSESSION=${sess.jsession}`
      : `HCSERVICES_SESSID=${sess.sessId}`;
    const url = `${HCSERVICES_BASE}/securimage/securimage_play.php?id=${captchaId}`;
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        'Cookie':     cookieHeader,
        'Referer':    `${HCSERVICES_BASE}/main.php`,
      },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    return res.arrayBuffer();
  } catch (e) {
    console.error('[fetch-case] downloadHcServicesCaptcha error:', e);
    return null;
  }
}

/** POST to hcservices direct CNR search. Returns HTML string, or special strings */
async function queryHcServicesCnr(
  crn: string,
  captcha: string,
  sess: HcServicesSession,
): Promise<string | 'captcha_error' | 'not_found' | 'error'> {
  try {
    const cookieHeader = sess.jsession
      ? `HCSERVICES_SESSID=${sess.sessId}; JSESSION=${sess.jsession}`
      : `HCSERVICES_SESSID=${sess.sessId}`;
    const body = new URLSearchParams({
      captcha,
      cino:                   crn,
      appFlag:                'web',
      action_code:            'fetchStateDistCourtNew',
      caseStatusSearchType:   'CNRNumber',
    });
    const res = await fetch(`${HCSERVICES_BASE}/cases_qry/index_qry.php`, {
      method: 'POST',
      headers: {
        'User-Agent':          UA,
        'Content-Type':        'application/x-www-form-urlencoded; charset=UTF-8',
        'X-Requested-With':    'XMLHttpRequest',
        'Referer':             `${HCSERVICES_BASE}/main.php`,
        'Cookie':              cookieHeader,
      },
      body: body.toString(),
      signal: AbortSignal.timeout(14_000),
    });
    if (!res.ok) return 'error';

    const text = (await res.text()).trim().replace(/^\uFEFF/, '');
    console.log(`[fetch-case] hcservices CNR response (first 120): "${text.slice(0, 120)}"`);

    const lower = text.toLowerCase();
    // Captcha-wrong responses
    if (lower.includes('invalid captcha') || text === 'THERE IS AN ERROR') return 'captcha_error';
    // Not found responses
    if (!text || lower.includes('record not found') || lower.includes('error_val')) return 'not_found';
    // Generic portal error
    if (lower.startsWith('error')) return 'error';

    return text;
  } catch (e) {
    console.error('[fetch-case] queryHcServicesCnr error:', e);
    return 'error';
  }
}

/**
 * Full hcservices direct CNR lookup with audio-captcha solving + up to 2 retries.
 * Returns a Response on success / definitive 404 / exhausted captcha.
 * Returns null if the portal is unreachable (caller should fall back).
 */
async function fetchHcServicesCase(crn: string): Promise<Response | null> {
  const stateCode = crn.slice(0, 2);
  const courtName = HC_MAP[stateCode]?.name ?? 'High Court';
  const MAX_ATTEMPTS = 2; // 2 attempts × ~35s each = ~70s, well within 120s client timeout

  console.log(`[fetch-case] hcservices direct CNR lookup: ${crn} (${courtName})`);

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[fetch-case] hcservices attempt ${attempt}/${MAX_ATTEMPTS}`);

    // Step 1: Fresh session + captcha ID
    const sessData = await getHcServicesSession();
    if (!sessData) {
      console.error('[fetch-case] hcservices: could not get session');
      continue;
    }

    // Step 2: Download audio captcha
    const audioBuffer = await downloadHcServicesCaptcha(sessData.captchaId, sessData.sess);
    if (!audioBuffer || audioBuffer.byteLength < 1000) {
      console.error('[fetch-case] hcservices: captcha audio too small or missing');
      continue;
    }

    // Step 3: Solve captcha via Whisper
    const captchaText = await solveAudioCaptcha(audioBuffer);
    if (!captchaText) {
      console.error(`[fetch-case] hcservices attempt ${attempt}: Whisper returned nothing`);
      continue;
    }
    console.log(`[fetch-case] hcservices attempt ${attempt}: captcha="${captchaText}"`);

    // Step 4: Submit CNR search with solved captcha
    const result = await queryHcServicesCnr(crn, captchaText, sessData.sess);

    if (result === 'captcha_error') {
      console.log(`[fetch-case] hcservices attempt ${attempt}: captcha rejected, retrying...`);
      continue;
    }
    if (result === 'not_found') {
      return new Response(
        JSON.stringify({ error: 'No case found for this CNR number in the High Court. Please verify the number and try again.' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
    if (result === 'error') {
      console.error(`[fetch-case] hcservices attempt ${attempt}: portal error`);
      continue;
    }

    // Step 5: Parse HTML response
    // Build a minimal HcCaseListItem from CNR to fill fallback fields
    const filingNo = String(parseInt(crn.slice(6, 12), 10));
    const year     = crn.slice(12, 16);
    const dummyItem: HcCaseListItem = {
      filing_no:  filingNo,
      cino:       crn,
      court_code: crn.slice(4, 6),
      case_type:  '',
      token:      '',
      case_no:    `${filingNo}/${year}`,
      court_name: courtName,
      status_raw: '',
      petitioner: null,
      respondent: null,
    };

    // Check HTML contains recognisable case data — include appeal-type labels
    const hasData = result.toLowerCase().includes('petitioner')
      || result.toLowerCase().includes('appellant')
      || result.toLowerCase().includes('applicant')
      || result.toLowerCase().includes('filing date')
      || result.toLowerCase().includes('case type');

    if (!hasData) {
      console.error(`[fetch-case] hcservices attempt ${attempt}: response has no case data`);
      continue;
    }

    const caseData = parseHcCaseHtml(result, crn, courtName, dummyItem);
    console.log(`[fetch-case] hcservices: parsed "${caseData.case_title}"`);

    // If party names couldn't be extracted, include a debug HTML snippet in
    // the response so the network log reveals the actual portal structure.
    if (!caseData.petitioner && !caseData.respondent) {
      const headingSnippet = result.match(/(<h[1-6][^>]*>[\s\S]*?<\/h[1-6]>)/gis)?.slice(0, 15).join('\n') ?? 'NO H-TAGS FOUND';
      const cleanHtml = result
        .replace(/<script[\s\S]*?<\/script>/gi, '')
        .replace(/<style[\s\S]*?<\/style>/gi, '')
        .slice(0, 4000);
      console.warn(`[fetch-case] party names NOT found for ${crn}. H-tags:\n${headingSnippet}`);
      return new Response(
        JSON.stringify({
          success: true,
          case: caseData,
          source: 'hcservices',
          _debug: {
            crn,
            h_tags: headingSnippet,
            html_snippet: cleanHtml,
          },
        }),
        { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    return new Response(
      JSON.stringify({ success: true, case: caseData, source: 'hcservices' }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // All captcha attempts exhausted — signal caller to try alternate flow
  console.log('[fetch-case] hcservices: all captcha attempts failed, signalling fallback');
  return null;
}

/** Full HC CNR lookup with audio-captcha solving + up to 3 retries */
async function fetchHighCourtCase(crn: string): Promise<Response> {
  const stateCode = crn.slice(0, 2);
  const courtNum  = parseInt(crn.slice(4, 6), 10) || 1;
  const filing_no = String(parseInt(crn.slice(6, 12), 10));  // strip leading zeros
  const rgyear    = crn.slice(12, 16);
  const hcInfo    = HC_MAP[stateCode];

  if (!hcInfo) {
    return new Response(
      JSON.stringify({ error: `High Court for state code "${stateCode}" is not supported. Please add the case manually.` }),
      { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  const { state_cd, stateNm, name: courtName } = hcInfo;
  const dist_code = 1;

  console.log(`[fetch-case] HC lookup: ${courtName}, filing=${filing_no}, year=${rgyear}`);

  const MAX_ATTEMPTS = 3;
  let lastError = 'Unknown error';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    console.log(`[fetch-case] HC captcha attempt ${attempt}/${MAX_ATTEMPTS}`);

    // Step 1: Fresh session for this court's filing-number page
    const sess = await getHcSession(state_cd, courtNum, stateNm);
    if (!sess) {
      lastError = 'Could not connect to High Court portal. Please try again.';
      continue;
    }

    // Step 2: Download audio captcha
    const audioResult = await downloadHcCaptchaAudio(state_cd, courtNum, stateNm, sess);
    if (!audioResult) {
      lastError = 'Could not load captcha from High Court portal. Please try again.';
      continue;
    }

    // Step 3: Solve captcha via Whisper
    const captchaText = await solveAudioCaptcha(audioResult.audioBuffer);
    if (!captchaText) {
      lastError = 'Could not solve captcha. Please try again.';
      console.error(`[fetch-case] HC attempt ${attempt}: Whisper returned no text`);
      continue;
    }
    console.log(`[fetch-case] HC attempt ${attempt}: submitting captcha="${captchaText}" filing=${filing_no} year=${rgyear}`);

    // Step 4: Submit filing number search with solved captcha
    const listResult = await queryHcFilingNumber(
      state_cd, courtNum, dist_code, filing_no, rgyear, captchaText, sess,
    );

    if (listResult === 'captcha_error') {
      console.log(`[fetch-case] HC attempt ${attempt}: captcha "${captchaText}" rejected, retrying with fresh session...`);
      lastError = 'Captcha could not be solved automatically. Please try again.';
      continue;
    }
    if (listResult === 'not_found') {
      return new Response(
        JSON.stringify({ error: 'No case found for this CNR number in the High Court. Please verify the number and try again.' }),
        { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }
    if (listResult === 'error') {
      lastError = 'High Court portal returned an unexpected error. Please try again.';
      continue;
    }

    // Step 5: Fetch case detail HTML for the first matching result
    const firstItem = listResult[0];
    const detailHtml = await fetchHcCaseDetail(state_cd, courtNum, dist_code, firstItem, sess);
    if (!detailHtml) {
      lastError = 'Could not retrieve case details from High Court portal.';
      continue;
    }

    // Step 6: Parse case data
    const caseData = parseHcCaseHtml(detailHtml, crn, courtName, firstItem);
    console.log(`[fetch-case] HC case parsed: ${caseData.case_title}`);

    return new Response(
      JSON.stringify({ success: true, case: caseData }),
      { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  // All captcha attempts exhausted — return error with portal link
  const hcPortalUrl = `${HC_BASE}/cases/s_kiosk_order.php?state_cd=${state_cd}&dist_cd=1&court_code=${courtNum}&stateNm=${encodeURIComponent(stateNm)}`;
  return new Response(
    JSON.stringify({
      error: lastError,
      isHighCourt: true,
      hcPortalUrl,
      courtName,
      parsedYear:   rgyear,
      parsedCaseNo: filing_no,
    }),
    { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
}

/** Parse HC case detail HTML from hcservices cases_qry/index_qry.php
 *
 *  hcservices uses the same eCourts HTML structure as the DC portal:
 *  - Party blocks:  <ul class="Petitioner_Advocate_table"> / <ul class="Respondent_Advocate_table">
 *  - Status table:  <table class="case_status_table">
 *  - History table: <table class="history_table">
 *  - Headings like "Petitioner(s)" may also appear in <h2> or <b><u> patterns — all handled below.
 */
function parseHcCaseHtml(
  html: string,
  crn: string,
  courtName: string,
  listItem: HcCaseListItem,
) {
  const getText = (re: RegExp) => {
    const m = html.match(re);
    return m ? stripHtml(m[1]) : null;
  };

  // ── Case type ──────────────────────────────────────────────────────────────
  const case_type = listItem.case_no?.split('/')[0]?.trim()
    || getText(/Case Type\s*[:<].*?[:>]\s*([^<]{1,30})/is)
    || listItem.case_type
    || null;

  const case_no_display = listItem.case_no;

  // ── Dates ──────────────────────────────────────────────────────────────────
  const filing_date_raw =
    getText(/Filing Date[^<]*[:>]\s*([\d/-]+)/i) ??
    getText(/Filing Date\s*<\/label>:?\s*([\d/-]+)/i);

  const registration_date_raw =
    getText(/Registration Date[^<]*[:>]\s*([\d/-]+)/i) ??
    getText(/Registration Date.*?:&nbsp;([\d/-]+)/i);

  // ── Party names — Strategy 1: same <ul class="Petitioner_Advocate_table"> as DC ──
  let petitionerParties = parsePartiesDetailed(html, 'Petitioner_Advocate_table');
  let respondentParties = parsePartiesDetailed(html, 'Respondent_Advocate_table');

  // ── Party names — Strategy 2: <ul class="Appellant_Advocate_table"> (appeal cases) ──
  if (!petitionerParties.length) {
    petitionerParties = parsePartiesDetailed(html, 'Appellant_Advocate_table');
  }
  if (!respondentParties.length) {
    respondentParties = parsePartiesDetailed(html, 'Respondent_Advocate_table') ||
                        parsePartiesDetailed(html, 'RespondentAdvocate_table');
  }

  // ── Party names — Strategy 3: <table> rows with "Petitioner(s)" / "Respondent(s)" label ──
  // Handles: <td>Petitioner(s)</td><td>1) NAME<br/>Advocate: X</td>
  if (!petitionerParties.length) {
    const petCell = html.match(/<t[dh][^>]*>\s*(?:<[^>]+>)*\s*Petitioner(?:\(s\))?\s*(?:<\/[^>]+>)*\s*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/is)?.[1]
      ?? html.match(/<t[dh][^>]*>\s*(?:<[^>]+>)*\s*Appellant(?:\(s\))?\s*(?:<\/[^>]+>)*\s*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/is)?.[1];
    if (petCell) {
      const names = petCell.split(/<br\s*\/?>/i)
        .map((s) => stripHtml(s).replace(/^\d+\)\s*/, '').trim())
        .filter((s) => s && !/^advocate/i.test(s) && s.length > 2);
      if (names.length) petitionerParties = names.map((n) => ({ name: n, advocate: null }));
    }
  }
  if (!respondentParties.length) {
    const respCell = html.match(/<t[dh][^>]*>\s*(?:<[^>]+>)*\s*Respondent(?:\(s\))?\s*(?:<\/[^>]+>)*\s*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/is)?.[1]
      ?? html.match(/<t[dh][^>]*>\s*(?:<[^>]+>)*\s*Opposite\s*Party(?:\(s\))?\s*(?:<\/[^>]+>)*\s*<\/t[dh]>\s*<td[^>]*>(.*?)<\/td>/is)?.[1];
    if (respCell) {
      const names = respCell.split(/<br\s*\/?>/i)
        .map((s) => stripHtml(s).replace(/^\d+\)\s*/, '').trim())
        .filter((s) => s && !/^advocate/i.test(s) && s.length > 2);
      if (names.length) respondentParties = names.map((n) => ({ name: n, advocate: null }));
    }
  }

  // ── Party names — Strategy 4: <h2> section headings (original HC pattern) ──
  let petSectionHtml = '';
  let respSectionHtml = '';
  if (!petitionerParties.length) {
    const petSection = html.match(/<h2[^>]*>.*?(?:Petitioner|Appellant|Applicant).*?<\/h2>(.*?)(?:<h2|<br\s*\/><h2)/is);
    if (petSection) {
      petSectionHtml = petSection[1];
      const numbered = petSectionHtml.match(/\d+\)\s*([A-Za-z][A-Za-z\s.'()-]+?)(?=<br|&nbsp;&nbsp;&nbsp;)/ig) ?? [];
      if (numbered.length) {
        petitionerParties = numbered.map((n) => ({ name: stripHtml(n).replace(/^\d+\)\s*/, '').trim(), advocate: null })).filter((p) => p.name);
      }
    }
  }
  if (!respondentParties.length) {
    const respSection = html.match(/<h2[^>]*>.*?(?:Respondent|Opposite\s*Party|Opp\.?\s*Party).*?<\/h2>(.*?)(?:<h2|<script)/is);
    if (respSection) {
      respSectionHtml = respSection[1];
      const numbered = respSectionHtml.match(/\d+\)\s*([A-Za-z][A-Za-z\s.'()-]+?)(?=<br|&nbsp;&nbsp;&nbsp;)/ig) ?? [];
      if (numbered.length) {
        respondentParties = numbered.map((n) => ({ name: stripHtml(n).replace(/^\d+\)\s*/, '').trim(), advocate: null })).filter((p) => p.name);
      }
    }
  }

  // ── Derive string summaries from party arrays ──────────────────────────────
  const petitioner = petitionerParties.map((p) => p.name).join(', ') || null;
  const respondent  = respondentParties.map((p) => p.name).join(', ') || null;
  const petitioner_advocate = petitionerParties.map((p) => p.advocate).filter(Boolean).join(', ') || null;
  const respondent_advocate = respondentParties.map((p) => p.advocate).filter(Boolean).join(', ') || null;

  // ── Advocates from section HTML (Strategy 4 fallback) ────────────────────
  const petAdv = petSectionHtml ? petSectionHtml.match(/Advocate[-:\s]+(.*?)(?:<br\s*\/><br|<\/span>)/is)?.[1] : null;
  const respAdv = respSectionHtml ? respSectionHtml.match(/Advocate[-:\s]+(.*?)(?:<br\s*\/><br|<\/span>)/is)?.[1] : null;
  const petitioner_advocate_final = petitioner_advocate || (petAdv ? stripHtml(petAdv).trim() : null) || null;
  const respondent_advocate_final = respondent_advocate || (respAdv ? stripHtml(respAdv).trim() : null) || null;

  // ── Judge ──────────────────────────────────────────────────────────────────
  const judgeMatches = html.match(/HONOURABLE (?:MR|MRS|MS)\.JUSTICE\s+([A-Z][A-Z\s.]+?)(?:<\/font>|&nbsp;)/ig) ?? [];
  const judge_name = judgeMatches.length
    ? stripHtml(judgeMatches[0] ?? '').replace(/HONOURABLE (?:MR|MRS|MS)\.JUSTICE\s+/i, '').trim()
    : extractJudge(html);

  // ── Status ─────────────────────────────────────────────────────────────────
  const status_raw =
    getText(/<font color=['"](?:green|red)['"]>\s*(.*?)\s*<\/font>/is) ??
    extractStatusRow(html, 'Case Status') ??
    null;

  // ── Next hearing date — try status table row first, then history ───────────
  const nextHearingRaw =
    extractStatusRow(html, 'Next Hearing Date') ??
    extractStatusRow(html, 'Next Date') ??
    null;

  // ── PDF order URLs ─────────────────────────────────────────────────────────
  const hcBase = 'https://hcservices.ecourts.gov.in/ecourtindiaHC/cases/';
  const pdfMatches = [...html.matchAll(/href\s*=\s*'(display_pdf\.php\?filename=[^']+)'/gi)];
  const pdfUrls = pdfMatches.map((m) => hcBase + m[1]);

  // ── Case history & orders ──────────────────────────────────────────────────
  const case_history = parseCaseHistory(html);
  let final_orders = parseFinalOrders(html);
  if (pdfUrls.length) {
    final_orders = final_orders.map((o, i) => ({ ...o, pdf_url: pdfUrls[i] ?? o.pdf_url }));
  }

  // ── Next hearing: prefer status-table date; fall back to history scan ──────
  const isDisposed = mapStatus(status_raw) === 'completed';
  const next_hearing = isDisposed
    ? null
    : (parseDate(nextHearingRaw) ?? getNextHearingFromHistory(case_history));
  const last_hearing_date = getLastHearingFromHistory(case_history);

  // ── Case title ────────────────────────────────────────────────────────────
  const finalPet = petitioner ?? listItem.petitioner;
  const finalResp = respondent ?? listItem.respondent;
  const titleP = finalPet && finalPet.length > 50 ? finalPet.split(',')[0].trim() : (finalPet ?? '');
  const titleR = finalResp && finalResp.length > 50 ? finalResp.split(',')[0].trim() : (finalResp ?? '');
  const case_title = finalPet && finalResp
    ? `${titleP} vs ${titleR}`
    : `${case_no_display || crn}`;

  console.log(`[fetch-case] parseHcCaseHtml: pet="${petitioner}" resp="${respondent}" next_hearing="${next_hearing}" last_hearing="${last_hearing_date}" strategies=[DC_ul, appeal_ul, td_label, h2]`);

  return {
    cnr_number:            crn,
    case_number:           case_no_display || null,
    case_title,
    case_type:             case_type ?? null,
    court_name:            courtName,
    court_room:            null,
    judge_name:            judge_name ?? null,
    petitioner:            petitioner ?? listItem.petitioner ?? null,
    respondent:            respondent ?? listItem.respondent ?? null,
    petitioner_advocate:   petitioner_advocate_final,
    respondent_advocate:   respondent_advocate_final,
    filing_date:           parseDate(filing_date_raw),
    registration_date:     parseDate(registration_date_raw),
    first_hearing_date:    case_history[0]?.hearing_date ?? null,
    decision_date:         null,
    nature_of_disposal:    null,
    hearing_date:          next_hearing,
    last_hearing_date,
    status:                mapStatus(status_raw),
    case_status_label:     status_raw?.trim() ?? null,
    case_history,
    final_orders,
    petitioner_parties:    petitionerParties,
    respondent_parties:    respondentParties,
    acts_under:            [],
    fir_details:           null,
    subordinate_court:     null,
  };
}

// ── DC Session helper ─────────────────────────────────────────────────────────
async function getSession(): Promise<string | null> {
  try {
    const res = await fetch(`${ECOURTS_BASE}/?p=home/index`, {
      method: 'GET',
      headers: { 'User-Agent': UA },
      signal: AbortSignal.timeout(8_000),
      redirect: 'follow',
    });
    const setCookie = res.headers.get('set-cookie') ?? '';
    const m = setCookie.match(/SERVICES_SESSID=([^;]+)/);
    return m ? m[1] : null;
  } catch {
    return null;
  }
}

// ── ecourtsindia.com fallback scraper ─────────────────────────────────────────
// Mirrors the same CNR search but via the third-party aggregator site.
// Returns parsed case data on success, null on any failure.
// The site proxies eCourts HTML so parseCaseHtml works identically on the response.
async function fetchFromEcourtsIndia(crn: string): Promise<Response | null> {
  const ECOURTS_INDIA_BASE = 'https://ecourtsindia.com';
  try {
    // Step 1: Get session cookie from the search page
    const homeRes = await fetch(`${ECOURTS_INDIA_BASE}/`, {
      headers: { 'User-Agent': UA, 'Accept': 'text/html,application/xhtml+xml,*/*' },
      signal: AbortSignal.timeout(10_000),
      redirect: 'follow',
    });
    const homeCookie = homeRes.headers.get('set-cookie') ?? '';
    const sessMatch = homeCookie.match(/(?:PHPSESSID|SERVICES_SESSID|SESS\w+)=([^;]+)/i);
    const sessId = sessMatch ? sessMatch[1] : null;
    const cookieHdr: Record<string, string> = sessId
      ? { 'Cookie': `PHPSESSID=${sessId}` }
      : {};

    // Step 2: POST CNR search — ecourtsindia mirrors the eCourts POST API
    const postData = new URLSearchParams({
      cino: crn,
      fcaptcha_code: '',
      ajax_req: 'true',
      app_token: '',
    });

    // Try the mirrored eCourts-style endpoint first
    const endpoints = [
      `${ECOURTS_INDIA_BASE}/?p=cnr_status/searchByCNR/`,
      `${ECOURTS_INDIA_BASE}/ecourts-services/?p=cnr_status/searchByCNR/`,
      `${ECOURTS_INDIA_BASE}/api/cnr`,
    ];

    for (const endpoint of endpoints) {
      try {
        const res = await fetch(endpoint, {
          method: 'POST',
          headers: {
            ...cookieHdr,
            'User-Agent': UA,
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Requested-With': 'XMLHttpRequest',
            'Referer': `${ECOURTS_INDIA_BASE}/`,
            'Accept': 'application/json, text/javascript, */*; q=0.01',
            'Origin': ECOURTS_INDIA_BASE,
          },
          body: postData.toString(),
          signal: AbortSignal.timeout(14_000),
        });

        if (!res.ok) continue;

        const rawText = await res.text();
        // Try JSON envelope first (same structure as official portal)
        let caseHtml = '';
        try {
          const parsed = JSON.parse(rawText);
          if (parsed?.errormsg) continue; // portal-level error
          caseHtml = parsed?.casetype_list ?? parsed?.data ?? '';
        } catch {
          // Plain HTML response — some endpoints return HTML directly
          caseHtml = rawText;
        }

        if (!caseHtml) continue;

        const lowerHtml = caseHtml.toLowerCase();
        const notFoundPhrases = [
          'does not exists', 'does not exist', 'record not found',
          'no record', 'invalid cino', 'case not found', 'no case found',
          'case number is not', 'not a valid',
        ];
        if (notFoundPhrases.some((p) => lowerHtml.includes(p))) {
          // Definitive 404 from ecourtsindia — propagate as null (let DC result decide)
          return null;
        }

        const hasData = lowerHtml.includes('case_status_table') || lowerHtml.includes('chheading') ||
          lowerHtml.includes('petitioner') || lowerHtml.includes('filing number');
        if (!hasData) continue; // not useful HTML — try next endpoint

        const caseData = parseCaseHtml(caseHtml, crn);
        console.log(`[fetch-case] ecourtsindia.com succeeded for CNR ${crn}: ${caseData.case_title}`);
        return new Response(
          JSON.stringify({ success: true, case: caseData, source: 'ecourtsindia' }),
          { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
        );
      } catch {
        // This endpoint failed — try next
        continue;
      }
    }
    return null; // all endpoints failed
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fetch-case] ecourtsindia.com error:', msg);
    return null;
  }
}

// ── Official DC portal fetch ───────────────────────────────────────────────────
// Returns structured Response on success/genuine 404, null if portal unreachable.
async function fetchFromOfficialDC(trimmedCrn: string): Promise<Response | null> {
  // Step 1: Get a session cookie
  const sessionId = await getSession();
  console.log(`[fetch-case][DC] Session obtained: ${sessionId ? 'yes' : 'no'}`);

  // Step 2: POST to eCourts CNR search — empty captcha bypasses validation
  const postData = new URLSearchParams({
    cino: trimmedCrn,
    fcaptcha_code: '',
    ajax_req: 'true',
    app_token: '',
  });

  const headers: Record<string, string> = {
    'User-Agent': UA,
    'Content-Type': 'application/x-www-form-urlencoded',
    'X-Requested-With': 'XMLHttpRequest',
    'Referer': `${ECOURTS_BASE}/?p=home/index`,
    'Accept': 'application/json, text/javascript, */*; q=0.01',
    'Accept-Language': 'en-US,en;q=0.9',
    'Origin': 'https://services.ecourts.gov.in',
  };
  if (sessionId) headers['Cookie'] = `SERVICES_SESSID=${sessionId}`;

  let portalRes: Response;
  try {
    portalRes = await fetch(`${ECOURTS_BASE}/?p=cnr_status/searchByCNR/`, {
      method: 'POST',
      headers,
      body: postData.toString(),
      signal: AbortSignal.timeout(12_000),
    });
  } catch (fetchErr: unknown) {
    const msg = fetchErr instanceof Error ? fetchErr.message : String(fetchErr);
    console.error('[fetch-case][DC] Network error:', msg);
    return null;
  }

  if (!portalRes.ok) {
    console.error(`[fetch-case][DC] Portal HTTP error: ${portalRes.status}`);
    return null;
  }

  // Step 3: Parse JSON envelope
  const rawText = await portalRes.text();
  let portalData: { casetype_list?: string; status?: number; errormsg?: string };
  try {
    portalData = JSON.parse(rawText);
  } catch {
    console.error('[fetch-case][DC] Response is not JSON:', rawText.slice(0, 200));
    return null;
  }

  if (portalData.errormsg) {
    console.error('[fetch-case][DC] Portal error message:', portalData.errormsg);
    return null;
  }

  const caseHtml = portalData.casetype_list ?? '';

  const notFoundPhrases = [
    'does not exists', 'does not exist', 'record not found', 'this case code does not',
    'no record', 'invalid cino', 'case not found', 'no case found',
    'case number is not', 'not a valid', 'enter valid',
  ];
  const lowerHtml = caseHtml.toLowerCase();
  if (!caseHtml || notFoundPhrases.some((p) => lowerHtml.includes(p))) {
    return new Response(
      JSON.stringify({ error: 'No case found for this CNR number. Please verify the number and try again.' }),
      { status: 404, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  }

  const hasData = lowerHtml.includes('case_status_table') || lowerHtml.includes('chheading') ||
    lowerHtml.includes('petitioner') || lowerHtml.includes('filing number');
  if (!hasData) {
    console.error('[fetch-case][DC] Unrecognised HTML (possible captcha):', caseHtml.slice(0, 200));
    return null;
  }

  const caseData = parseCaseHtml(caseHtml, trimmedCrn);
  console.log(`[fetch-case][DC] Success: ${caseData.case_title}`);
  return new Response(
    JSON.stringify({ success: true, case: caseData, source: 'ecourts_gov' }),
    { status: 200, headers: { ...CORS, 'Content-Type': 'application/json' } },
  );
}

// ── Edge Function ─────────────────────────────────────────────────────────────
serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS });
  }

  // Overall 45-second hard timeout guard
  const overallTimeout = setTimeout(() => {
    console.error('[fetch-case] 45s timeout warning — function still running');
  }, 45_000);

  try {
    const body = await req.json().catch(() => ({}));
    const crn = body?.crn ?? body?.cnr;  // accept both spellings defensively

    // Debug mode: run HC steps and return intermediate results (dev only)
    if (body?._debug === true && crn) {
      const trimmed = crn.trim().toUpperCase();
      const isHC = /^[A-Z]{2}HC/i.test(trimmed);
      if (isHC) {
        const { debugHcSteps } = await import('./debug-hc.ts');
        const result = await debugHcSteps(
          trimmed.startsWith('KL') ? 4 : trimmed.startsWith('MH') ? 1 : 5,
          parseInt(trimmed.slice(4, 6), 10) || 1,
          trimmed.startsWith('KL') ? 'Kerala' : 'Maharashtra',
        ).catch((e: Error) => ({ error: e.message }));
        return new Response(JSON.stringify(result, null, 2), {
          headers: { ...CORS, 'Content-Type': 'application/json' },
        });
      }
    }

    if (!crn || typeof crn !== 'string' || !crn.trim()) {
      return new Response(
        JSON.stringify({ error: 'CNR number is required.' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    const trimmedCrn = crn.trim().toUpperCase();

    // ── Special tribunal / non-eCourts CNR detection ─────────────────────────
    // These case types have their own portals and are NOT on eCourts DC/HC.
    // Detect by well-known prefixes and return a clear, actionable error.
    const TRIBUNAL_PREFIXES: Array<{ pattern: RegExp; name: string; portal: string }> = [
      { pattern: /^DRT/,   name: 'Debt Recovery Tribunal (DRT)',           portal: 'drt.gov.in' },
      { pattern: /^DRAT/,  name: 'Debt Recovery Appellate Tribunal (DRAT)',portal: 'drt.gov.in' },
      { pattern: /^NCLT/,  name: 'National Company Law Tribunal (NCLT)',   portal: 'nclt.gov.in' },
      { pattern: /^NCLAT/, name: 'National Company Law Appellate Tribunal (NCLAT)', portal: 'nclat.gov.in' },
      { pattern: /^NGT/,   name: 'National Green Tribunal (NGT)',          portal: 'greentribunal.gov.in' },
      { pattern: /^SAT/,   name: 'Securities Appellate Tribunal (SAT)',    portal: 'secappellatetribunal.gov.in' },
      { pattern: /^TDSAT/, name: 'TDSAT',                                  portal: 'tdsat.gov.in' },
      { pattern: /^ITAT/,  name: 'Income Tax Appellate Tribunal (ITAT)',   portal: 'itat.gov.in' },
      { pattern: /^CAT/,   name: 'Central Administrative Tribunal (CAT)', portal: 'cat.nic.in' },
    ];
    const tribunalMatch = TRIBUNAL_PREFIXES.find((t) => t.pattern.test(trimmedCrn));
    if (tribunalMatch) {
      console.log(`[fetch-case] Tribunal CNR detected: ${trimmedCrn} → ${tribunalMatch.name}`);
      return new Response(
        JSON.stringify({
          error: `"${trimmedCrn}" is a ${tribunalMatch.name} case number, not an eCourts CNR. ${tribunalMatch.name} cases are managed on a separate portal (${tribunalMatch.portal}) and cannot be fetched automatically. Please add this case manually using the "Edit Details Manually" option.`,
        }),
        { status: 422, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // Validate: eCourts CNR is exactly 16 alphanumeric characters
    if (!/^[A-Z0-9]{16}$/.test(trimmedCrn)) {
      return new Response(
        JSON.stringify({ error: 'CNR number must be exactly 16 alphanumeric characters (e.g. MHPN010000012024).' }),
        { status: 400, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    // ── HC CNR detection ─────────────────────────────────────────────────────
    // Three recognised formats:
    //   Format A — [STATE]HC[digits/filing][year]  e.g. BRHC01042915 2024, KLHC01042915 2024
    //              chars 0-1 = state code in HC_MAP, chars 2-3 = "HC"
    //   Format B — HC[STATE][digits]               e.g. HCMA0142915 2024
    //              starts with literal "HC" followed by 2 alpha chars
    //   Format C — [STATE][HC-abbrev][filing][year] e.g. WBCHCA002425 2022
    //              known non-"HC"-literal HC abbreviations (explicit whitelist)
    //
    // CRITICAL: District Court CNRs also start with a 2-char state code (e.g. BR, UP, MH)
    // followed by a 2-char DISTRICT code (e.g. BRPU, UPNN, MHPN).
    // We MUST NOT route district-court CNRs to the HC path.
    // Rule: only route to HC when chars 2-3 are literally "HC" (Format A),
    //       or starts with "HC" (Format B), or matches the Format C whitelist.
    const isHcPrefixed    = /^HC[A-Z]{2}/i.test(trimmedCrn);          // Format B: HCMA…
    const isHcFormatA     = /^[A-Z]{2}HC/i.test(trimmedCrn)           // Format A: BRHC…, KLHC…
                            && !!HC_MAP[trimmedCrn.slice(0, 2)];
    // Format C: [STATE][2-char HC court abbreviation] — Calcutta (WBCH), others as needed
    const HC_FORMAT_C_PREFIXES = ['WBCH', 'WBCA', 'WBCL'];            // extend as new patterns emerge
    const isHcFormatC     = HC_FORMAT_C_PREFIXES.some((p) => trimmedCrn.startsWith(p));

    const isStatePrefixHc = isHcFormatA || isHcFormatC;               // Format A + C (no false positives)

    // ── ALL HC formats: route directly to official hcservices portal ─────────
    if (isHcPrefixed || isStatePrefixHc) {
      const hcServicesResult = await fetchHcServicesCase(trimmedCrn);

      // Definitive response (success, 404, or captcha exhausted)
      if (hcServicesResult !== null) return hcServicesResult;

      // hcServicesResult === null → hcservices portal unreachable
      console.log('[fetch-case] hcservices unreachable — trying legacy ecourtindiaHC filing-no flow...');

      // Format A only ([STATE]HC): ecourtindiaHC filing-number search as final fallback
      if (isHcFormatA) {
        return await fetchHighCourtCase(trimmedCrn);
      }

      return new Response(
        JSON.stringify({ error: 'High Court portal could not be reached. Please try again in a moment.' }),
        { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } },
      );
    }

    console.log(`[fetch-case] Looking up DC CNR: ${trimmedCrn}`);

    // ── Race: official DC portal vs ecourtsindia.com — first to return valid data wins ──
    // Both fetches run simultaneously. Promise.any() resolves with the first
    // non-null successful Response. If both fail, we fall through to the error.
    const raceResult = await (async (): Promise<Response | null> => {
      // Wrap each source so it never rejects (converts null/throws to rejections for Promise.any)
      const dcPromise = fetchFromOfficialDC(trimmedCrn).then((r) => {
        if (r === null) throw new Error('DC null');
        return r;
      });

      const ecourtsIndiaPromise = fetchFromEcourtsIndia(trimmedCrn).then((r) => {
        if (r === null) throw new Error('ecourtsindia null');
        return r;
      });

      try {
        // First successful (non-null) Response wins
        const winner = await Promise.any([dcPromise, ecourtsIndiaPromise]);
        return winner;
      } catch {
        // AggregateError — both sources failed or returned null
        return null;
      }
    })();

    if (raceResult !== null) return raceResult;

    // Both sources unreachable or returned no data
    return new Response(
      JSON.stringify({ error: 'eCourts portal could not be reached right now. Please try again in a moment.' }),
      { status: 503, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('[fetch-case] Unhandled error:', msg);
    clearTimeout(overallTimeout);
    return new Response(
      JSON.stringify({ error: 'An unexpected error occurred. Please try again.' }),
      { status: 500, headers: { ...CORS, 'Content-Type': 'application/json' } },
    );
  } finally {
    clearTimeout(overallTimeout);
  }
});
