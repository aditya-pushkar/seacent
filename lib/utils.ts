/**
 * Shared pure helpers. Nothing in this file performs I/O; the server pipeline
 * feeds it provider data and persists the result.
 */
import Decimal from 'decimal.js';
import { format, isValid, parse } from 'date-fns';
import type {
  Bbox,
  ConfidenceSource,
  ExtractedLineItem,
  ExtractedPage,
  FieldConfidence,
  FieldSourceLocation,
  InvoiceHeader,
  InvoiceLineItem,
  InvoiceMachineStatus,
  InvoiceStatus,
  IssueCode,
  IssueDraft,
  OcrWord,
  PageKind,
  Reconciliation,
  ValidationIssue,
  ValidationIssueType,
} from '@/lib/types';

export { cn } from 'cn';

/* ------------------------------------------------------------------ */
/* Display status                                                      */
/* ------------------------------------------------------------------ */

const DISPLAY_STATUS: Record<InvoiceMachineStatus, InvoiceStatus> = {
  queued: 'Queued',
  processing: 'Processing',
  succeeded: 'Succeeded',
  needs_review: 'Needs review',
  failed: 'Failed',
  rejected: 'Rejected',
};

export function toDisplayStatus(status: InvoiceMachineStatus): InvoiceStatus {
  return DISPLAY_STATUS[status];
}

/* ------------------------------------------------------------------ */
/* Text helpers                                                        */
/* ------------------------------------------------------------------ */

export function trimOrNull(value: string | null | undefined): string | null {
  if (value === null || value === undefined) return null;
  const trimmed = value.trim();
  if (trimmed === '' || /^(?:null|n\/a|nil|none|-|—)$/i.test(trimmed)) return null;
  return trimmed;
}

/** Case/punctuation-insensitive form used only for evidence matching. */
export function normalizeText(value: string): string {
  return value
    .normalize('NFKC')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '');
}

export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

export function roundScore(value: number): number {
  return Math.round(clamp(value, 0, 1) * 1000) / 1000;
}

/* ------------------------------------------------------------------ */
/* Decimal parsing                                                     */
/* ------------------------------------------------------------------ */

export type NumberStyle = { decimal: '.' | ','; thousands: ',' | '.' | null };
export type ParseResult = {
  value: string | null;
  decimal: Decimal | null;
  warning: 'W_AMBIGUOUS_NUMBER' | 'E_BAD_DECIMAL' | null;
};

const CURRENCY_MINOR_UNITS: Readonly<Record<string, number>> = {
  BIF: 0,
  CLP: 0,
  DJF: 0,
  GNF: 0,
  HUF: 0,
  ISK: 0,
  JPY: 0,
  KMF: 0,
  KRW: 0,
  PYG: 0,
  RWF: 0,
  UGX: 0,
  UYI: 0,
  VND: 0,
  VUV: 0,
  XAF: 0,
  XOF: 0,
  XPF: 0,
  BHD: 3,
  IQD: 3,
  JOD: 3,
  KWD: 3,
  LYD: 3,
  OMR: 3,
  TND: 3,
  CLF: 4,
  UYW: 4,
};

export function minorUnitsForCurrency(currency: string | null | undefined): number {
  if (!currency) return 2;
  return CURRENCY_MINOR_UNITS[currency.toUpperCase()] ?? 2;
}

export function isZeroDecimalCurrency(currency: string | null | undefined): boolean {
  return minorUnitsForCurrency(currency) === 0;
}

function cleanNumeric(raw: string): string {
  return raw
    .normalize('NFKC')
    .replace(/[\s\u00a0\u202f]/g, '')
    .replace(/[^\d.,()+\-]/g, '');
}

function digitsAfter(value: string, separator: string): number {
  const index = value.lastIndexOf(separator);
  if (index === -1) return 0;
  return value.slice(index + 1).replace(/\D/g, '').length;
}

/**
 * Infer the document's decimal separator only from unambiguous values.
 * A lone "1,234" / "1.234" remains ambiguous unless the currency is
 * zero-decimal (where it is a thousands group).
 */
export function inferNumberStyle(
  rawValues: Array<string | null | undefined>,
  options: { zeroDecimal?: boolean; minorUnits?: number } = {},
): NumberStyle | null {
  let dotVotes = 0;
  let commaVotes = 0;
  let groupedDot = 0;
  let groupedComma = 0;

  for (const raw of rawValues) {
    if (!raw) continue;
    const value = cleanNumeric(raw);
    if (!/\d/.test(value)) continue;
    const dots = (value.match(/\./g) ?? []).length;
    const commas = (value.match(/,/g) ?? []).length;

    if (dots > 0 && commas > 0) {
      if (value.lastIndexOf('.') > value.lastIndexOf(',')) dotVotes += 2;
      else commaVotes += 2;
      continue;
    }
    if (dots === 1) {
      const after = digitsAfter(value, '.');
      if (after === 1 || after === 2 || after >= 4 || (after === 3 && options.minorUnits === 3)) {
        dotVotes += 1;
      } else if (after === 3) groupedDot += 1;
    }
    if (commas === 1) {
      const after = digitsAfter(value, ',');
      if (after === 1 || after === 2 || after >= 4 || (after === 3 && options.minorUnits === 3)) {
        commaVotes += 1;
      } else if (after === 3) groupedComma += 1;
    }
  }

  if (dotVotes > commaVotes) return { decimal: '.', thousands: ',' };
  if (commaVotes > dotVotes) return { decimal: ',', thousands: '.' };

  if (options.zeroDecimal) {
    if (groupedComma > 0 && groupedComma >= groupedDot) {
      return { decimal: '.', thousands: ',' };
    }
    if (groupedDot > 0) return { decimal: ',', thousands: '.' };
  }

  return null;
}

/**
 * Parse a printed number without ever converting through JavaScript number.
 * Returns the normalized decimal string and a warning instead of guessing.
 */
export function parseDecimal(
  raw: string | null | undefined,
  style: NumberStyle | null = null,
  options: { zeroDecimal?: boolean; minorUnits?: number } = {},
): ParseResult {
  if (!raw) return { value: null, decimal: null, warning: null };
  const cleaned = cleanNumeric(raw);
  if (!/\d/.test(cleaned)) return { value: null, decimal: null, warning: 'E_BAD_DECIMAL' };

  const negative = cleaned.startsWith('(') && cleaned.endsWith(')');
  let value = cleaned.replace(/[()]/g, '').replace(/^\+/, '');
  if (value.startsWith('-')) {
    value = value.slice(1);
    if (!/\d/.test(value)) return { value: null, decimal: null, warning: 'E_BAD_DECIMAL' };
  }

  const dots = (value.match(/\./g) ?? []).length;
  const commas = (value.match(/,/g) ?? []).length;

  let decimalSeparator: '.' | ',' | null = null;
  let thousandsSeparator: '.' | ',' | null = null;
  let ambiguous = false;

  if (dots > 0 && commas > 0) {
    decimalSeparator = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ',';
    thousandsSeparator = decimalSeparator === '.' ? ',' : '.';
  } else if (dots === 1 || commas === 1) {
    const separator: '.' | ',' = dots === 1 ? '.' : ',';
    const after = digitsAfter(value, separator);
    if (style && separator === style.decimal) {
      decimalSeparator = separator;
      thousandsSeparator = style.thousands && style.thousands !== separator ? style.thousands : null;
    } else if (style && separator === style.thousands) {
      thousandsSeparator = separator;
    } else if (after === 1 || after === 2 || after >= 4) {
      decimalSeparator = separator;
    } else if (after === 3) {
      if (options.minorUnits === 3) {
        decimalSeparator = separator;
      } else if (options.zeroDecimal) {
        thousandsSeparator = separator;
      } else {
        ambiguous = true;
      }
    } else if (after === 0) {
      thousandsSeparator = separator;
    } else {
      ambiguous = true;
    }
  } else if (dots > 1 || commas > 1) {
    if (dots > 1 && commas > 1) {
      return { value: null, decimal: null, warning: 'E_BAD_DECIMAL' };
    }
    thousandsSeparator = dots > 1 ? '.' : ',';
  }

  if (ambiguous) return { value: null, decimal: null, warning: 'W_AMBIGUOUS_NUMBER' };

  if (thousandsSeparator) {
    value = value.split(thousandsSeparator).join('');
  }
  if (decimalSeparator) {
    value = value.replace(decimalSeparator, '.');
  } else {
    value = value.replace(/[.,]/g, '');
  }
  value = value.replace(/\.+$/, '');
  if (!/\d/.test(value)) return { value: null, decimal: null, warning: 'E_BAD_DECIMAL' };

  const normalized = (negative ? '-' : '') + value;
  try {
    const decimal = new Decimal(normalized);
    if (!decimal.isFinite()) return { value: null, decimal: null, warning: 'E_BAD_DECIMAL' };
    return { value: normalized, decimal, warning: null };
  } catch {
    return { value: null, decimal: null, warning: 'E_BAD_DECIMAL' };
  }
}

export function decimalString(value: Decimal, scale?: number): string {
  return scale === undefined ? value.toFixed() : value.toFixed(scale);
}

/* ------------------------------------------------------------------ */
/* Dates                                                               */
/* ------------------------------------------------------------------ */

export type DateStyle = 'DMY' | 'MDY';
export type ParsedDate = {
  value: string | null;
  warning: 'W_AMBIGUOUS_DATE' | 'E_BAD_DATE' | null;
};

export function inferDateStyle(rawValues: Array<string | null | undefined>): DateStyle | null {
  let dmy = 0;
  let mdy = 0;
  for (const raw of rawValues) {
    if (!raw) continue;
    const matches = raw.matchAll(/(?<!\d)(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})(?!\d)/g);
    for (const match of matches) {
      const first = Number(match[1]);
      const second = Number(match[2]);
      if (first > 12 && second <= 12) dmy += 1;
      else if (second > 12 && first <= 12) mdy += 1;
    }
  }
  if (dmy > mdy) return 'DMY';
  if (mdy > dmy) return 'MDY';
  return null;
}

const MONTH_NAME =
  '(?:January|February|March|April|May|June|July|August|September|October|November|December|Jan|Feb|Mar|Apr|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)';

function monthNameDates(text: string): string[] {
  const patterns = [
    new RegExp(`\\b${MONTH_NAME}\\s+\\d{1,2}(?:st|nd|rd|th)?,?\\s+\\d{4}\\b`, 'gi'),
    new RegExp(`\\b\\d{1,2}(?:st|nd|rd|th)?\\s+${MONTH_NAME},?\\s+\\d{4}\\b`, 'gi'),
  ];
  const found = patterns.flatMap((pattern) =>
    [...text.matchAll(pattern)].map((match) =>
      match[0].replace(/(\d)(?:st|nd|rd|th)\b/gi, '$1'),
    ),
  );
  return [...new Set(found)];
}

function utcDayNumber(ymd: string): number {
  const [year, month, day] = ymd.split('-').map(Number);
  return Date.UTC(year, month - 1, day) / 86_400_000;
}

function daysBetween(from: string, to: string): number {
  return Math.round(utcDayNumber(to) - utcDayNumber(from));
}

/**
 * Resolve an otherwise ambiguous numeric date by checking it against a
 * month-name due date printed on the page. Arithmetic alone is not enough:
 * the choice is only made when one reading matches a printed payment term
 * (for example "Net 30" and "by October 4, 2026").
 */
export function inferDateStyleFromDueDate(
  raw: string | null | undefined,
  texts: string[],
): DateStyle | null {
  const value = trimOrNull(raw);
  if (!value) return null;
  const combined = texts.join('\n');
  const dueDates = monthNameDates(combined)
    .map((date) => parseInvoiceDate(date).value)
    .filter((date): date is string => date !== null);
  if (dueDates.length === 0) return null;

  const dayTerms = new Set(
    [...combined.matchAll(/\b(\d{1,3})\s*days?\b/gi)].map((match) => Number(match[1])),
  );

  const scores: Array<{ style: DateStyle; score: number }> = [];
  for (const style of ['DMY', 'MDY'] as const) {
    const candidate = parseInvoiceDate(value, style).value;
    if (!candidate) continue;
    let score = 0;
    for (const due of dueDates) {
      const difference = daysBetween(candidate, due);
      if (difference <= 0 || difference > 400) continue;
      score += dayTerms.has(difference) ? 2 : 1;
    }
    scores.push({ style, score });
  }
  if (scores.length < 2) return null;
  scores.sort((a, b) => b.score - a.score);
  if (scores[0].score <= 0 || scores[0].score === scores[1].score) return null;
  return scores[0].style;
}

function validYmd(year: number, month: number, day: number): string | null {
  if (month < 1 || month > 12 || day < 1 || day > 31) return null;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }
  return format(date, 'yyyy-MM-dd');
}

export function parseInvoiceDate(
  raw: string | null | undefined,
  style: DateStyle | null = null,
): ParsedDate {
  const value = trimOrNull(raw);
  if (!value) return { value: null, warning: null };

  const cjk = value.normalize('NFKC').match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (cjk) {
    const ymd = validYmd(Number(cjk[1]), Number(cjk[2]), Number(cjk[3]));
    return ymd ? { value: ymd, warning: null } : { value: null, warning: 'E_BAD_DATE' };
  }

  const iso = value.match(/^(\d{4})[\/\-.](\d{1,2})[\/\-.](\d{1,2})$/);
  if (iso) {
    const ymd = validYmd(Number(iso[1]), Number(iso[2]), Number(iso[3]));
    return ymd ? { value: ymd, warning: null } : { value: null, warning: 'E_BAD_DATE' };
  }

  const textualFormats = [
    'd MMM yyyy',
    'd MMMM yyyy',
    'MMM d, yyyy',
    'MMMM d, yyyy',
    'MMM d yyyy',
    'MMMM d yyyy',
    'd-MMM-yyyy',
    'yyyy MMM d',
  ];
  for (const pattern of textualFormats) {
    const parsed = parse(value, pattern, new Date(2000, 0, 1));
    if (isValid(parsed)) return { value: format(parsed, 'yyyy-MM-dd'), warning: null };
  }

  const numeric = value.match(/^(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{2,4})$/);
  if (!numeric) return { value: null, warning: 'E_BAD_DATE' };

  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  const yearRaw = numeric[3];
  let day: number;
  let month: number;
  let order: DateStyle | null = style;
  if (!order) {
    if (first > 12 && second <= 12) order = 'DMY';
    else if (second > 12 && first <= 12) order = 'MDY';
  }
  if (!order) return { value: null, warning: 'W_AMBIGUOUS_DATE' };
  if (order === 'DMY') {
    day = first;
    month = second;
  } else {
    month = first;
    day = second;
  }

  let year = Number(yearRaw);
  if (yearRaw.length === 2) year += year < 50 ? 2000 : 1900;
  const ymd = validYmd(year, month, day);
  return ymd ? { value: ymd, warning: null } : { value: null, warning: 'E_BAD_DATE' };
}

/* ------------------------------------------------------------------ */
/* Units, HSN, tax IDs, currency                                       */
/* ------------------------------------------------------------------ */

const UOM_MAP: Record<string, string> = {
  pc: 'PCS',
  pcs: 'PCS',
  piece: 'PCS',
  pieces: 'PCS',
  unit: 'PCS',
  units: 'PCS',
  nos: 'PCS',
  no: 'PCS',
  ea: 'PCS',
  each: 'PCS',
  kg: 'KGS',
  kgs: 'KGS',
  kilogram: 'KGS',
  kilograms: 'KGS',
  m: 'MTR',
  mtr: 'MTR',
  mtrs: 'MTR',
  meter: 'MTR',
  meters: 'MTR',
  metre: 'MTR',
  metres: 'MTR',
  set: 'SET',
  sets: 'SET',
  reel: 'REEL',
  reels: 'REEL',
  stk: 'PCS',
  stck: 'PCS',
  stueck: 'PCS',
  'stück': 'PCS',
  satz: 'SET',
  'sätze': 'SET',
  jar: 'JAR',
  jars: 'JAR',
  pkt: 'PKT',
  packet: 'PKT',
  packets: 'PKT',
  pk: 'PK',
  pkg: 'PKG',
  pkgs: 'PKG',
  pack: 'PK',
  packs: 'PK',
  package: 'PKG',
  packages: 'PKG',
  box: 'BOX',
  boxes: 'BOX',
  bx: 'BOX',
  ctn: 'BOX',
  ctns: 'BOX',
  carton: 'BOX',
  cartons: 'BOX',
  cs: 'CS',
  case: 'CS',
  cases: 'CS',
  can: 'CAN',
  cans: 'CAN',
  l: 'LTR',
  ltr: 'LTR',
  ltrs: 'LTR',
  liter: 'LTR',
  liters: 'LTR',
  litre: 'LTR',
  litres: 'LTR',
  ml: 'ML',
  g: 'GMS',
  gm: 'GMS',
  gms: 'GMS',
  gram: 'GMS',
  grams: 'GMS',
  t: 'TON',
  ton: 'TON',
  tons: 'TON',
  tonne: 'TON',
  tonnes: 'TON',
  doz: 'DOZ',
  dozen: 'DOZ',
  pr: 'PR',
  pair: 'PR',
  pairs: 'PR',
  roll: 'ROLL',
  rolls: 'ROLL',
  bag: 'BAG',
  bags: 'BAG',
  drum: 'DRUM',
  drums: 'DRUM',
  pallet: 'PAL',
  pallets: 'PAL',
  sheet: 'SHT',
  sheets: 'SHT',
  sqm: 'SQM',
  m2: 'SQM',
  'm²': 'SQM',
  cbm: 'CBM',
  m3: 'CBM',
  'm³': 'CBM',
  ft: 'FT',
  feet: 'FT',
  yd: 'YRD',
  yard: 'YRD',
  yards: 'YRD',
};

export function normalizeUom(raw: string | null | undefined): {
  value: string | null;
  warning: 'W_UNKNOWN_UOM' | null;
} {
  const printed = trimOrNull(raw);
  if (!printed) return { value: null, warning: null };
  const key = normalizeText(printed);
  const mapped = UOM_MAP[key];
  return mapped ? { value: mapped, warning: null } : { value: null, warning: 'W_UNKNOWN_UOM' };
}

export function normalizeHsn(raw: string | null | undefined): {
  value: string | null;
  warning: 'W_HSN_UNSUPPORTED_LENGTH' | 'W_HSN_INVALID' | null;
} {
  const printed = trimOrNull(raw);
  if (!printed) return { value: null, warning: null };
  const digits = printed.replace(/\D/g, '');
  if (digits.length >= 6 && digits.length <= 8) return { value: digits, warning: null };
  if (digits.length === 10) return { value: null, warning: 'W_HSN_UNSUPPORTED_LENGTH' };
  return { value: null, warning: 'W_HSN_INVALID' };
}

export function normalizeTaxId(raw: string | null | undefined): string | null {
  return trimOrNull(raw);
}

export function normalizeIec(raw: string | null | undefined): string | null {
  const value = trimOrNull(raw)?.toUpperCase().replace(/\s+/g, '') ?? null;
  if (!value) return null;
  if (!/^[A-Z0-9]{9,12}$/.test(value)) return null;
  if (!/[A-Z]/.test(value) || !/\d/.test(value)) return null;
  return value;
}

const SYMBOL_CURRENCY: Record<string, string> = {
  '€': 'EUR',
  '£': 'GBP',
  '₹': 'INR',
};

const NAME_CURRENCY: Array<[RegExp, string]> = [
  [/\bus\s*dollars?\b/i, 'USD'],
  [/\bcanadian\s*dollars?\b/i, 'CAD'],
  [/\baustralian\s*dollars?\b/i, 'AUD'],
  [/\beuros?\b/i, 'EUR'],
  [/\b(?:japanese\s*)?yen\b/i, 'JPY'],
  [/\bpounds?\s*sterling\b/i, 'GBP'],
  [/\bindian\s*rupees?\b/i, 'INR'],
  [/\b(?:uae\s*)?dirhams?\b/i, 'AED'],
  [/\bsaudi\s*riyals?\b/i, 'SAR'],
  [/\b(?:chinese\s*)?yuan\b|\brenminbi\b|\brmb\b/i, 'CNY'],
];

const DOLLAR_CURRENCIES = new Set(['USD', 'CAD', 'AUD', 'NZD', 'SGD', 'HKD', 'MXN', 'ARS', 'CLP']);

const ISO_CURRENCIES = new Set([
  'AED', 'AFN', 'ALL', 'AMD', 'ANG', 'AOA', 'ARS', 'AUD', 'AWG', 'AZN',
  'BAM', 'BBD', 'BDT', 'BGN', 'BHD', 'BIF', 'BMD', 'BND', 'BOB', 'BOV',
  'BRL', 'BSD', 'BTN', 'BWP', 'BYN', 'BZD', 'CAD', 'CDF', 'CHE', 'CHF',
  'CHW', 'CLF', 'CLP', 'CNY', 'COP', 'COU', 'CRC', 'CUC', 'CUP', 'CVE',
  'CZK', 'DJF', 'DKK', 'DOP', 'DZD', 'EGP', 'ERN', 'ETB', 'EUR', 'FJD',
  'FKP', 'GBP', 'GEL', 'GHS', 'GIP', 'GMD', 'GNF', 'GTQ', 'GYD', 'HKD',
  'HNL', 'HRK', 'HTG', 'HUF', 'IDR', 'ILS', 'INR', 'IQD', 'IRR', 'ISK',
  'JMD', 'JOD', 'JPY', 'KES', 'KGS', 'KHR', 'KMF', 'KPW', 'KRW', 'KWD',
  'KYD', 'KZT', 'LAK', 'LBP', 'LKR', 'LRD', 'LSL', 'LYD', 'MAD', 'MDL',
  'MGA', 'MKD', 'MMK', 'MNT', 'MOP', 'MRU', 'MUR', 'MVR', 'MWK', 'MXN',
  'MXV', 'MYR', 'MZN', 'NAD', 'NGN', 'NIO', 'NOK', 'NPR', 'NZD', 'OMR',
  'PAB', 'PEN', 'PGK', 'PHP', 'PKR', 'PLN', 'PYG', 'QAR', 'RON', 'RSD',
  'RUB', 'RWF', 'SAR', 'SBD', 'SCR', 'SDG', 'SEK', 'SGD', 'SHP', 'SLE',
  'SLL', 'SOS', 'SRD', 'SSP', 'STN', 'SVC', 'SYP', 'SZL', 'THB', 'TJS',
  'TMT', 'TND', 'TOP', 'TRY', 'TTD', 'TWD', 'TZS', 'UAH', 'UGX', 'USD',
  'USN', 'UYI', 'UYU', 'UYW', 'UZS', 'VED', 'VES', 'VND', 'VUV', 'WST',
  'XAF', 'XAG', 'XAU', 'XBA', 'XBB', 'XBC', 'XBD', 'XCD', 'XDR', 'XOF',
  'XPD', 'XPF', 'XPT', 'XSU', 'XTS', 'XUA', 'YER', 'ZAR', 'ZMW', 'ZWL',
]);

function isIsoCurrency(value: string): boolean {
  return ISO_CURRENCIES.has(value);
}

export function normalizeCurrency(
  raw: string | null | undefined,
  context: { fallback?: string | null } = {},
): { value: string | null; warning: 'W_AMBIGUOUS_CURRENCY' | null } {
  const value = trimOrNull(raw);
  const fallback = trimOrNull(context.fallback)?.toUpperCase() ?? null;
  const safeFallback = fallback && isIsoCurrency(fallback) ? fallback : null;
  if (!value) {
    return safeFallback
      ? { value: safeFallback, warning: null }
      : { value: null, warning: null };
  }

  if (/^[A-Za-z]{3}$/.test(value)) {
    const code = value.toUpperCase();
    if (code === 'XXX' || !isIsoCurrency(code)) {
      return { value: null, warning: 'W_AMBIGUOUS_CURRENCY' };
    }
    return { value: code, warning: null };
  }

  for (const [pattern, code] of NAME_CURRENCY) {
    if (pattern.test(value)) return { value: code, warning: null };
  }

  for (const [symbol, code] of Object.entries(SYMBOL_CURRENCY)) {
    if (value.includes(symbol)) return { value: code, warning: null };
  }

  if (value.includes('$')) {
    if (safeFallback && DOLLAR_CURRENCIES.has(safeFallback)) {
      return { value: safeFallback, warning: null };
    }
    return { value: null, warning: 'W_AMBIGUOUS_CURRENCY' };
  }

  if (value.includes('¥') || value.includes('￥')) {
    if (safeFallback === 'JPY' || safeFallback === 'CNY') {
      return { value: safeFallback, warning: null };
    }
    return { value: null, warning: 'W_AMBIGUOUS_CURRENCY' };
  }

  const embedded = value.match(/\b([A-Z]{3})\b/);
  if (embedded && isIsoCurrency(embedded[1])) return { value: embedded[1], warning: null };

  return { value: null, warning: 'W_AMBIGUOUS_CURRENCY' };
}

export function toleranceForCurrency(currency: string | null | undefined): string {
  const units = minorUnitsForCurrency(currency);
  return new Decimal(10).pow(-units).toFixed(units);
}

/* ------------------------------------------------------------------ */
/* Evidence grounding                                                  */
/* ------------------------------------------------------------------ */

export type EvidencePage = { page: number; words: OcrWord[] };
export type EvidenceMatch = {
  page: number;
  bbox: Bbox;
  source: ConfidenceSource;
  confidence: number;
};

function unionBbox(boxes: Bbox[]): Bbox | null {
  if (boxes.length === 0) return null;
  return [
    Math.min(...boxes.map((box) => box[0])),
    Math.min(...boxes.map((box) => box[1])),
    Math.max(...boxes.map((box) => box[2])),
    Math.max(...boxes.map((box) => box[3])),
  ];
}

function wordBbox(word: OcrWord): Bbox {
  return [word.x0, word.y0, word.x1, word.y1];
}

function centerInside(word: OcrWord, bbox: Bbox): boolean {
  const cx = (word.x0 + word.x1) / 2;
  const cy = (word.y0 + word.y1) / 2;
  return cx >= bbox[0] - 0.01 && cx <= bbox[2] + 0.01 && cy >= bbox[1] - 0.01 && cy <= bbox[3] + 0.01;
}

/**
 * Find a contiguous word window whose normalized text equals the evidence.
 * Evidence is only a search hint: a hit supplies provenance, never validity.
 */
export function findEvidence(
  evidence: string | null | undefined,
  pages: EvidencePage[],
  options: { preferredPage?: number | null; withinBbox?: Bbox | null } = {},
): EvidenceMatch | null {
  const needleRaw = trimOrNull(evidence);
  if (!needleRaw) return null;
  const needle = normalizeText(needleRaw);

  const ordered = [...pages].sort((a, b) => {
    if (a.page === options.preferredPage) return -1;
    if (b.page === options.preferredPage) return 1;
    return a.page - b.page;
  });

  for (const page of ordered) {
    const words = page.words;
    if (words.length === 0) continue;

    const candidateWords =
      options.withinBbox && page.page === options.preferredPage
        ? words.filter((word) => centerInside(word, options.withinBbox!))
        : words;

    const searchSets = candidateWords === words ? [words] : [candidateWords, words];
    for (const set of searchSets) {
      if (set.length === 0) continue;

      if (!needle) {
        const symbol = set.find((word) => word.text.includes(needleRaw));
        if (symbol) {
          return {
            page: page.page,
            bbox: wordBbox(symbol),
            source: symbol.source,
            confidence: symbol.conf,
          };
        }
        continue;
      }

      const roughly = needleRaw.split(/\s+/).filter(Boolean).length;
      const lengths = Array.from(
        new Set([roughly, Math.max(1, roughly - 1), roughly + 1].filter((n) => n >= 1)),
      );

      for (const length of lengths) {
        if (length > set.length) continue;
        for (let index = 0; index + length <= set.length; index += 1) {
          const window = set.slice(index, index + length);
          const joined = normalizeText(window.map((word) => word.text).join(' '));
          const labelPrefixMatch =
            joined !== needle &&
            needle.length >= 5 &&
            /\p{L}/u.test(needle) &&
            joined.endsWith(needle);
          if (joined !== needle && !labelPrefixMatch) continue;
          const bbox = unionBbox(window.map(wordBbox));
          if (!bbox) continue;
          const containsOcr = window.some((word) => word.source === 'ocr');
          const confidence =
            window.reduce((sum, word) => sum + word.conf, 0) / Math.max(1, window.length);
          return {
            page: page.page,
            bbox,
            source: containsOcr ? 'ocr' : 'text_layer',
            confidence: clamp(confidence, 0, 1),
          };
        }
      }
    }
  }

  return null;
}

/* ------------------------------------------------------------------ */
/* Issue catalog                                                       */
/* ------------------------------------------------------------------ */

const ISSUE_DEFAULTS: Record<IssueCode, { severity: 'low' | 'medium' | 'high'; message: string }> = {
  E_MODEL_INVALID: { severity: 'high', message: 'Model output was invalid for this page.' },
  E_NOT_GROUNDED: { severity: 'medium', message: 'Extracted value could not be located in the source.' },
  E_BAD_DECIMAL: { severity: 'high', message: 'Printed amount is not a valid decimal.' },
  E_BAD_DATE: { severity: 'high', message: 'Printed date is not a valid calendar date.' },
  E_ARITH_LINE: { severity: 'high', message: 'Line amount does not equal quantity times unit price.' },
  E_ARITH_TOTAL: { severity: 'high', message: 'Invoice total does not reconcile with its components.' },
  E_ARITH_INCOMPLETE: { severity: 'medium', message: 'Arithmetic could not be verified because values are missing.' },
  E_PAGE_FAILED: { severity: 'high', message: 'A page could not be processed.' },
  W_AMBIGUOUS_NUMBER: { severity: 'medium', message: 'Number format is ambiguous.' },
  W_AMBIGUOUS_DATE: { severity: 'medium', message: 'Date format is ambiguous.' },
  W_CROSS_CURRENCY_CHARGE: { severity: 'low', message: 'Charge currency differs from the invoice currency; it is excluded from the invoice-currency total.' },
  W_CHARGE_INCLUSION_UNKNOWN: { severity: 'medium', message: 'It is unclear whether a charge is included in the total.' },
  W_CURRENCY_CONFLICT: { severity: 'high', message: 'Conflicting invoice currencies were detected.' },
  W_LOW_CONFIDENCE: { severity: 'medium', message: 'Field confidence is below the review threshold.' },
  W_MISSING_FIELD: { severity: 'high', message: 'A required invoice field is missing.' },
  W_UNKNOWN_UOM: { severity: 'low', message: 'Unit of measure is not in the conservative mapping.' },
  W_HSN_UNSUPPORTED_LENGTH: { severity: 'medium', message: 'HSN length is unsupported; the raw value was kept.' },
  W_HSN_INVALID: { severity: 'medium', message: 'HSN is not six to eight digits.' },
  W_AMBIGUOUS_CURRENCY: { severity: 'medium', message: 'Currency symbol or name is ambiguous.' },
  W_DUPLICATE_ROW: { severity: 'low', message: 'An exact duplicated page-boundary row was removed.' },
};

export function issue(
  code: IssueCode,
  overrides: Partial<Omit<IssueDraft, 'code'>> = {},
): IssueDraft {
  const base = ISSUE_DEFAULTS[code];
  return {
    code,
    severity: overrides.severity ?? base.severity,
    message: overrides.message ?? base.message,
    ...overrides,
  };
}

const ISSUE_TYPE: Record<IssueCode, ValidationIssueType> = {
  E_MODEL_INVALID: 'processing_failure',
  E_NOT_GROUNDED: 'missing_provenance',
  E_BAD_DECIMAL: 'ambiguous_text',
  E_BAD_DATE: 'ambiguous_text',
  E_ARITH_LINE: 'arithmetic_mismatch',
  E_ARITH_TOTAL: 'arithmetic_mismatch',
  E_ARITH_INCOMPLETE: 'arithmetic_mismatch',
  E_PAGE_FAILED: 'processing_failure',
  W_AMBIGUOUS_NUMBER: 'ambiguous_text',
  W_AMBIGUOUS_DATE: 'ambiguous_text',
  W_CROSS_CURRENCY_CHARGE: 'currency_mismatch',
  W_CHARGE_INCLUSION_UNKNOWN: 'currency_mismatch',
  W_CURRENCY_CONFLICT: 'currency_mismatch',
  W_LOW_CONFIDENCE: 'low_confidence',
  W_MISSING_FIELD: 'missing_field',
  W_UNKNOWN_UOM: 'ambiguous_text',
  W_HSN_UNSUPPORTED_LENGTH: 'ambiguous_text',
  W_HSN_INVALID: 'ambiguous_text',
  W_AMBIGUOUS_CURRENCY: 'ambiguous_text',
  W_DUPLICATE_ROW: 'ambiguous_text',
};

export function issueType(code: string): ValidationIssueType {
  return ISSUE_TYPE[code as IssueCode] ?? 'other';
}

export function toValidationIssue(draft: IssueDraft, index: number): ValidationIssue {
  return {
    id: `${draft.code}-${index}`,
    code: draft.code,
    type: issueType(draft.code),
    severity: draft.severity,
    message: draft.message,
    fieldName: draft.field ?? null,
    lineNumber: draft.lineNumber ?? null,
    expected: draft.expected ?? null,
    actual: draft.actual ?? null,
    source:
      draft.page && draft.bbox ? { page: draft.page, bbox: draft.bbox } : null,
  };
}

/* ------------------------------------------------------------------ */
/* Confidence                                                          */
/* ------------------------------------------------------------------ */

export function confidenceScore(input: {
  grounded: boolean;
  sourceScore: number;
  validationScore: number;
  arithmeticFailed?: boolean;
}): { score: number; components: { grounding: number; source: number; validation: number } } {
  const components = {
    grounding: input.grounded ? 1 : 0,
    source: clamp(input.sourceScore, 0, 1),
    validation: clamp(input.validationScore, 0, 1),
  };
  let score =
    components.grounding * 0.5 + components.source * 0.25 + components.validation * 0.25;
  if (!input.grounded) score = Math.min(score, 0.4);
  if (input.arithmeticFailed) score = Math.min(score, 0.6);
  return { score: roundScore(score), components };
}

/* ------------------------------------------------------------------ */
/* Normalization pipeline                                              */
/* ------------------------------------------------------------------ */

export type SourcePage = {
  page: number;
  kind: PageKind;
  words: OcrWord[];
  extraction: ExtractedPage | null;
  error: string | null;
};

export type NormalizedLineRow = {
  pageNumber: number | null;
  rowBbox: Bbox | null;
  flags: string[];
};

export type NormalizedInvoice = {
  header: InvoiceHeader;
  chargeFlags: {
    freightIncluded: boolean | null;
    insuranceIncluded: boolean | null;
    otherChargesIncluded: boolean | null;
    otherChargesCurrency: string | null;
  };
  headerRaws: Record<string, string | null>;
  lineItems: InvoiceLineItem[];
  lineRows: NormalizedLineRow[];
  confidences: FieldConfidence[];
  issues: IssueDraft[];
  isArithmeticValid: boolean;
  needsReview: boolean;
  reviewReasons: string[];
  reconciliation: Reconciliation;
};

const HEADER_FIELDS = [
  'invoice_number',
  'invoice_date',
  'seller_name',
  'seller_tax_id',
  'buyer_name',
  'buyer_tax_id',
  'buyer_iec',
  'currency',
  'total_invoice_value',
  'freight_charges',
  'freight_currency',
  'freight_included',
  'insurance_charges',
  'insurance_currency',
  'insurance_included',
  'other_charges',
  'other_charges_currency',
  'other_charges_included',
  'total_tax_amount',
] as const;

const AMOUNT_FIELDS = [
  'total_invoice_value',
  'freight_charges',
  'insurance_charges',
  'other_charges',
  'total_tax_amount',
  'quantity',
  'unit_price',
  'total_line_amount',
] as const;

const CORE_HEADER_FIELDS: Array<keyof InvoiceHeader> = [
  'invoice_number',
  'invoice_date',
  'seller_name',
  'currency',
  'total_invoice_value',
];

const STOP_HEADINGS = new Set([
  'subtotal',
  'sub total',
  'total',
  'grand total',
  'tax',
  'vat',
  'gst',
  'freight',
  'shipping',
  'insurance',
  'discount',
  'amount due',
  'balance due',
  'previous balance',
  'carried forward',
  'brought forward',
]);

const LINE_STOP_HEADINGS = new Set(
  [...STOP_HEADINGS].map((heading) => heading.replace(/\s+/g, '')),
);

function pageWords(pages: SourcePage[]): EvidencePage[] {
  return pages.map((page) => ({ page: page.page, words: page.words }));
}

function headerEvidence(
  extraction: ExtractedPage,
  field: string,
): string | null {
  const evidence = extraction.header_evidence?.[field];
  const raw = (extraction.header as unknown as Record<string, unknown>)[field];
  return trimOrNull(evidence) ?? (typeof raw === 'string' ? trimOrNull(raw) : null);
}

function headerRaw(extraction: ExtractedPage, field: string): string | null {
  const raw = (extraction.header as unknown as Record<string, unknown>)[field];
  return typeof raw === 'string' ? trimOrNull(raw) : null;
}

function headerBoolean(extraction: ExtractedPage, field: string): boolean | null {
  const raw = (extraction.header as unknown as Record<string, unknown>)[field];
  return typeof raw === 'boolean' ? raw : null;
}

function lineRaw(item: ExtractedLineItem, field: string): string | null {
  const raw = (item as unknown as Record<string, unknown>)[field];
  return typeof raw === 'string' ? trimOrNull(raw) : null;
}

function lineEvidence(item: ExtractedLineItem, field: string): string | null {
  return trimOrNull(item.evidence?.[field]) ?? lineRaw(item, field);
}

function isHeadingRow(item: ExtractedLineItem): boolean {
  const description = lineRaw(item, 'description');
  if (!description) return false;
  const key = normalizeText(description);
  if (!LINE_STOP_HEADINGS.has(key)) return false;
  return !lineRaw(item, 'quantity') && !lineRaw(item, 'unit_price');
}

function sameRow(a: ExtractedLineItem, b: ExtractedLineItem): boolean {
  const keys = ['description', 'quantity', 'unit_price', 'total_line_amount'] as const;
  return keys.every((key) => normalizeText(lineRaw(a, key) ?? '') === normalizeText(lineRaw(b, key) ?? ''));
}

function wordsToTextLines(words: OcrWord[]): string[] {
  if (words.length === 0) return [];
  const sorted = [...words].sort((a, b) => a.y0 - b.y0 || a.x0 - b.x0);
  const lines: Array<{ y: number; words: OcrWord[] }> = [];
  for (const word of sorted) {
    const line = lines[lines.length - 1];
    if (line && Math.abs(line.y - word.y0) <= 0.008) line.words.push(word);
    else lines.push({ y: word.y0, words: [word] });
  }
  return lines.map((line) =>
    [...line.words]
      .sort((a, b) => a.x0 - b.x0)
      .map((word) => word.text)
      .join(' ')
      .replace(/\s+/g, ' ')
      .trim(),
  );
}

type TextChargeField = 'freight_charges' | 'insurance_charges' | 'other_charges';
type TextChargeMatch = { raw: string; page: number; field: TextChargeField };

const TEXT_CHARGE_PATTERNS: Array<{ field: TextChargeField; pattern: RegExp }> = [
  {
    field: 'freight_charges',
    pattern: /\b(freight|furight|fright|fracht|shipping|versand|spedition|transportkosten)\b/i,
  },
  {
    field: 'insurance_charges',
    pattern: /\b(insurance|versicherung|transportversicherung)\b/i,
  },
  {
    field: 'other_charges',
    pattern: /\b(packing|verpackung|crating|handling|documentation fee|palleti[sz]ing|fuel surcharge)\b/i,
  },
];

function amountFromTextLine(
  line: string,
  style: NumberStyle | null,
  zeroDecimal: boolean,
  minorUnits: number,
): string | null {
  const hasCurrency =
    /[€£₹$¥￥]/.test(line) ||
    [...line.matchAll(/\b([A-Z]{3})\b/g)].some((match) => isIsoCurrency(match[1]));
  const tokens = [
    ...line.matchAll(/(?<![\dA-Za-z])\(?\d[\d.,]*(?:\s\d{3})*\)?(?![\dA-Za-z])/g),
  ];
  for (let index = tokens.length - 1; index >= 0; index -= 1) {
    const token = tokens[index][0];
    const after = line.slice(tokens[index].index! + token.length);
    if (after.startsWith('%')) continue;
    if (!/[.,]\d{2,4}(?:\D|$)/.test(token) && !hasCurrency) continue;
    const parsed = parseDecimal(token, style, { zeroDecimal, minorUnits });
    if (parsed.value !== null) return token.trim();
  }
  return null;
}

function textChargeFallbacks(input: {
  pages: SourcePage[];
  style: NumberStyle | null;
  zeroDecimal: boolean;
  minorUnits: number;
}): Partial<Record<TextChargeField, TextChargeMatch>> {
  const found: Partial<Record<TextChargeField, TextChargeMatch>> = {};
  for (const page of input.pages) {
    for (const line of wordsToTextLines(page.words)) {
      const matches = TEXT_CHARGE_PATTERNS.filter((entry) => entry.pattern.test(line));
      if (matches.length !== 1) continue;
      const field = matches[0].field;
      if (found[field]) continue;
      const raw = amountFromTextLine(line, input.style, input.zeroDecimal, input.minorUnits);
      if (raw !== null) found[field] = { raw, page: page.page, field };
    }
  }
  return found;
}

const DOCUMENT_EXCLUSION_PATTERN =
  /\b(?:not\s+included|not\s+part\s+of|billed\s+separately|charged\s+separately|separately\s+billed|excluded\s+from|outside\s+(?:the\s+)?(?:invoice|total)|not\s+invoiced|not\s+in\s+the\s+(?:invoice|total)|in\s+addition\s+to)\b/i;

const FOOTER_START_PATTERN =
  /\b(fob|free on board|goods value|warenwert|merchandise subtotal|sub\s*total|net goods|goods amount)\b/i;
const FOOTER_SKIP_PATTERN =
  /\b(tax|vat|gst|igst|cgst|sgst|duty|customs|assessable|landed|discount|rounding|round off|payment|bank|iban|swift|account|total|amount due|balance)\b/i;

function footerUnlabeledAmounts(input: {
  pages: SourcePage[];
  style: NumberStyle | null;
  zeroDecimal: boolean;
  minorUnits: number;
  printedTotal: Decimal | null;
}): Array<{ raw: string; page: number }> {
  if (!input.printedTotal) return [];
  const found: Array<{ raw: string; page: number }> = [];
  for (const page of input.pages) {
    const lines = wordsToTextLines(page.words);
    if (lines.length === 0) continue;

    let totalIndex = -1;
    for (let index = 0; index < lines.length; index += 1) {
      const raw = amountFromTextLine(lines[index], input.style, input.zeroDecimal, input.minorUnits);
      if (raw === null) continue;
      const parsed = parseDecimal(raw, input.style, { zeroDecimal: input.zeroDecimal, minorUnits: input.minorUnits });
      if (parsed.decimal?.equals(input.printedTotal)) totalIndex = index;
    }
    if (totalIndex < 0) continue;

    let start = -1;
    for (let index = 0; index < totalIndex; index += 1) {
      if (FOOTER_START_PATTERN.test(lines[index])) start = index + 1;
    }
    if (start < 0) continue;

    for (let index = start; index < totalIndex; index += 1) {
      const line = lines[index];
      if (TEXT_CHARGE_PATTERNS.some((entry) => entry.pattern.test(line))) continue;
      if (FOOTER_SKIP_PATTERN.test(line)) continue;
      const raw = amountFromTextLine(line, input.style, input.zeroDecimal, input.minorUnits);
      if (raw === null) continue;
      const parsed = parseDecimal(raw, input.style, { zeroDecimal: input.zeroDecimal, minorUnits: input.minorUnits });
      if (!parsed.decimal || parsed.decimal.lte(0)) continue;
      const residue = line.replace(raw, '').replace(/[^\p{L}\p{N}]+/gu, '');
      if (residue !== '') continue;
      found.push({ raw, page: page.page });
    }
  }
  return found;
}

export function buildNormalizedInvoice(input: {
  sourceFile: string;
  pages: SourcePage[];
  reviewThreshold: number;
}): NormalizedInvoice {
  const { pages, reviewThreshold } = input;
  const issues: IssueDraft[] = [];
  const confidences: FieldConfidence[] = [];
  const extractions = pages.filter((page) => page.extraction);

  for (const page of pages) {
    if (page.error) {
      issues.push(
        issue('E_PAGE_FAILED', {
          message: `Page ${page.page} could not be processed: ${page.error}`,
          page: page.page,
        }),
      );
    }
    if (!page.extraction) {
      issues.push(
        issue('E_MODEL_INVALID', {
          message: `Page ${page.page} did not return usable structured data.`,
          page: page.page,
        }),
      );
    }
  }

  const allHeaderValues = extractions.flatMap((page) =>
    HEADER_FIELDS.map((field) => headerRaw(page.extraction!, field)),
  );
  const allLineValues = extractions.flatMap((page) =>
    (page.extraction!.line_items ?? []).flatMap((item) =>
      AMOUNT_FIELDS.map((field) => lineRaw(item, field)),
    ),
  );

  const rawCurrency = extractions
    .map((page) => headerRaw(page.extraction!, 'currency'))
    .find((value) => value !== null) ?? null;
  const currencyProbe = normalizeCurrency(rawCurrency).value;
  const minorUnits = minorUnitsForCurrency(currencyProbe);
  const zeroDecimal = minorUnits === 0;
  const numberStyle = inferNumberStyle([...allHeaderValues, ...allLineValues], { zeroDecimal, minorUnits });
  const invoiceDateRaws = extractions.map((page) => headerRaw(page.extraction!, 'invoice_date'));
  const pageTextLines = pages.flatMap((page) => wordsToTextLines(page.words));
  const dateStyle =
    inferDateStyle([...invoiceDateRaws, ...pageTextLines]) ??
    inferDateStyleFromDueDate(
      invoiceDateRaws.find((value) => value !== null) ?? null,
      pageTextLines,
    );
  const textCharges = textChargeFallbacks({
    pages,
    style: numberStyle,
    zeroDecimal,
    minorUnits,
  });

  type SpecialKind = 'total' | 'tax' | 'freight' | 'insurance' | 'other' | 'ignore';
  type SpecialRow = { page: number; item: ExtractedLineItem; kind: SpecialKind };

  const specialRows: SpecialRow[] = [];
  const allRows = extractions.flatMap((page) =>
    (page.extraction!.line_items ?? []).map((item) => ({ page: page.page, item })),
  );
  for (const row of allRows) {
    const description = lineRaw(row.item, 'description');
    if (!description) continue;
    const key = description.trim().toLowerCase().replace(/\s+/g, ' ');
    if (
      /^(sub\s*total|brought\s+forward|carried\s+forward|amount\s+(brought|carried)\s+forward)\b/.test(
        key,
      )
    ) {
      specialRows.push({ ...row, kind: 'ignore' });
      continue;
    }
    if (lineRaw(row.item, 'quantity') || lineRaw(row.item, 'unit_price') || lineRaw(row.item, 'hsn_code')) {
      continue;
    }
    let kind: SpecialKind | null = null;
    if (
      /^(total\s+)?(tax|vat|gst|sales\s+tax|igst|cgst|sgst|mwst|ust|steuer)\b/.test(key) ||
      /^(消費税|税)\b/.test(key)
    ) {
      kind = 'tax';
    } else if (
      /^(total\s+)?(duty|customs\s+duty|excise|surcharge|discount|total\s+quantity|total\s+weight|total\s+packages|total\s+cartons|total\s+pcs)\b/.test(
        key,
      ) ||
      /(?:^|\s)(?:est\.?|estimated)\b/.test(key)
    ) {
      kind = 'ignore';
    } else if (
      /^(grand\s+total|invoice\s+total|amount\s+due|balance\s+due|total|rechnungsbetrag|gesamtbetrag|summe|montant\s+total|importe\s+total)\b/.test(
        key,
      ) ||
      /^(ご請求金額|合計|請求金額)\b/.test(key)
    ) {
      kind = 'total';
    } else if (
      /^(total\s+)?(freight|furight|fright|fracht|shipping|versand|spedition|transportkosten)\b/.test(
        key,
      )
    ) {
      kind = 'freight';
    } else if (/^(total\s+)?(insurance|versicherung|transportversicherung)\b/.test(key)) {
      kind = 'insurance';
    } else if (
      /^(packing|verpackung|crating|handling|documentation\s+fee|palleti[sz]ing|fuel\s+surcharge)\b/.test(
        key,
      )
    ) {
      kind = 'other';
    }
    if (kind) specialRows.push({ ...row, kind });
  }

  const rowsOf = (kind: SpecialKind) =>
    specialRows
      .filter((row) => row.kind === kind)
      .map((row) => ({
        raw: lineRaw(row.item, 'total_line_amount'),
        page: row.page,
      }))
      .filter((row): row is { raw: string; page: number } => row.raw !== null);

  const pick = (field: string, last: boolean): { raw: string | null; page: number | null } => {
    const candidates = extractions
      .map((page) => ({ raw: headerRaw(page.extraction!, field), page: page.page }))
      .filter((candidate) => candidate.raw !== null);
    const fallbackKind: Partial<Record<string, SpecialKind>> = {
      total_invoice_value: 'total',
      total_tax_amount: 'tax',
      freight_charges: 'freight',
      insurance_charges: 'insurance',
      other_charges: 'other',
    };
    const fallback = fallbackKind[field] ? rowsOf(fallbackKind[field]!) : [];
    const useFallback =
      fallback.length > 0 &&
      (field === 'total_invoice_value' || candidates.length === 0);
    if (useFallback) {
      const chosen = fallback[fallback.length - 1];
      return { raw: chosen.raw, page: chosen.page };
    }
    if (candidates.length > 0) {
      return last ? candidates[candidates.length - 1] : candidates[0];
    }
    const textCharge = textCharges[field as TextChargeField];
    if (textCharge) return { raw: textCharge.raw, page: textCharge.page };
    return { raw: null, page: null };
  };

  const header: InvoiceHeader = {
    source_file: input.sourceFile,
    invoice_number: null,
    invoice_date: null,
    seller_name: null,
    seller_tax_id: null,
    buyer_name: null,
    buyer_tax_id: null,
    buyer_iec: null,
    currency: null,
    total_invoice_value: null,
    freight_charges: null,
    freight_currency: null,
    insurance_charges: null,
    insurance_currency: null,
    other_charges: null,
    total_tax_amount: null,
  };
  const headerRaws: Record<string, string | null> = { source_file: input.sourceFile };
  const chargeFlags = {
    freightIncluded: null as boolean | null,
    insuranceIncluded: null as boolean | null,
    otherChargesIncluded: null as boolean | null,
    otherChargesCurrency: null as string | null,
  };

  const groundedPages = pageWords(pages);

  const addConfidence = (inputConfidence: {
    field: string;
    lineNumber: number | null;
    rawValue: string | null;
    normalizedValue: string | null;
    evidence: string | null;
    page: number | null;
    match: EvidenceMatch | null;
    validationScore: number;
    arithmeticFailed?: boolean;
  }) => {
    const scored = confidenceScore({
      grounded: !!inputConfidence.match,
      sourceScore:
        inputConfidence.match?.source === 'text_layer'
          ? 1
          : inputConfidence.match?.source === 'ocr'
            ? inputConfidence.match.confidence
            : 0,
      validationScore: inputConfidence.validationScore,
      arithmeticFailed: inputConfidence.arithmeticFailed,
    });
    confidences.push({
      field: inputConfidence.field,
      lineNumber: inputConfidence.lineNumber,
      score: scored.score,
      rawValue: inputConfidence.rawValue,
      normalizedValue: inputConfidence.normalizedValue,
      evidence: inputConfidence.evidence,
      page: inputConfidence.match?.page ?? inputConfidence.page ?? null,
      bbox: inputConfidence.match?.bbox ?? null,
      source: inputConfidence.match?.source ?? 'none',
      components: scored.components,
    });
    return { score: scored.score, match: inputConfidence.match };
  };

  const optionalAmountFields: ReadonlySet<keyof InvoiceHeader> = new Set([
    'total_tax_amount',
    'freight_charges',
    'insurance_charges',
    'other_charges',
  ]);

  const registerHeader = (
    field: keyof InvoiceHeader,
    raw: string | null,
    page: number | null,
    normalized: string | null,
    warning: IssueCode | null,
    validationScore: number,
  ) => {
    headerRaws[field] = raw;
    if (raw === null) {
      if (CORE_HEADER_FIELDS.includes(field)) {
        issues.push(issue('W_MISSING_FIELD', { field, message: `Required field "${field}" is missing.` }));
      }
      return;
    }
    if (warning) {
      issues.push(issue(warning, { field, actual: raw, page, message: `${ISSUE_DEFAULTS[warning].message} (${field})` }));
    }
    const evidence = extractions
      .filter((candidate) => candidate.page === page)
      .map((candidate) => headerEvidence(candidate.extraction!, field))
      .find((value) => value !== null) ?? raw;
    const match = findEvidence(evidence, groundedPages, { preferredPage: page });
    if (!match && optionalAmountFields.has(field)) {
      header[field] = null;
      headerRaws[field] = null;
      return;
    }
    addConfidence({
      field,
      lineNumber: null,
      rawValue: raw,
      normalizedValue: normalized,
      evidence,
      page,
      match,
      validationScore,
    });
    if (!match) {
      issues.push(
        issue('E_NOT_GROUNDED', {
          field,
          actual: raw,
          page,
          message: `Extracted ${field.replace(/_/g, ' ')} could not be located in the source document.`,
        }),
      );
    }
  };

  const textField = (
    field: keyof InvoiceHeader,
    transform: (raw: string) => string | null = (raw) => raw,
  ) => {
    const picked = pick(field, false);
    const normalized = picked.raw ? transform(picked.raw) : null;
    header[field] = normalized;
    registerHeader(field, picked.raw, picked.page, normalized, null, picked.raw ? 1 : 0);
  };

  const amountField = (field: keyof InvoiceHeader, last = false) => {
    const picked = pick(field, last);
    const parsed = parseDecimal(picked.raw, numberStyle, { zeroDecimal, minorUnits });
    header[field] = parsed.value;
    registerHeader(
      field,
      picked.raw,
      picked.page,
      parsed.value,
      parsed.warning,
      parsed.warning ? 0.5 : picked.raw ? 1 : 0,
    );
  };

  const currencyPicked = pick('currency', false);
  const normalizedCurrency = normalizeCurrency(currencyPicked.raw);
  header.currency = normalizedCurrency.value;
  registerHeader(
    'currency',
    currencyPicked.raw,
    currencyPicked.page,
    normalizedCurrency.value,
    normalizedCurrency.warning,
    normalizedCurrency.value ? 1 : 0,
  );

  const distinctCurrencies = new Set(
    extractions
      .map((page) => normalizeCurrency(headerRaw(page.extraction!, 'currency')).value)
      .filter((value): value is string => value !== null),
  );
  if (distinctCurrencies.size > 1) {
    issues.push(
      issue('W_CURRENCY_CONFLICT', {
        field: 'currency',
        expected: header.currency,
        actual: [...distinctCurrencies].join(', '),
      }),
    );
  }

  textField('invoice_number');
  const datePicked = pick('invoice_date', false);
  const parsedDate = parseInvoiceDate(datePicked.raw, dateStyle);
  header.invoice_date = parsedDate.value;
  registerHeader(
    'invoice_date',
    datePicked.raw,
    datePicked.page,
    parsedDate.value,
    parsedDate.warning,
    parsedDate.value ? 1 : datePicked.raw ? 0.4 : 0,
  );
  textField('seller_name');
  textField('seller_tax_id', normalizeTaxId);
  textField('buyer_name');
  textField('buyer_tax_id', normalizeTaxId);
  textField('buyer_iec', normalizeIec);
  amountField('total_invoice_value', true);
  amountField('freight_charges', true);
  amountField('insurance_charges', true);
  amountField('other_charges', true);
  amountField('total_tax_amount', true);

  const chargeCurrencyField = (
    field: 'freight_currency' | 'insurance_currency',
    amountField: 'freight_charges' | 'insurance_charges',
  ) => {
    const picked = pick(field, true);
    if (picked.raw === null) {
      header[field] = header[amountField] !== null ? header.currency : null;
      return;
    }
    const normalized = normalizeCurrency(picked.raw, { fallback: header.currency });
    header[field] = normalized.value;
    registerHeader(
      field,
      picked.raw,
      picked.page,
      normalized.value,
      normalized.warning,
      normalized.value ? 1 : 0,
    );
  };
  chargeCurrencyField('freight_currency', 'freight_charges');
  chargeCurrencyField('insurance_currency', 'insurance_charges');

  const otherCurrencyPicked = pick('other_charges_currency', true);
  chargeFlags.otherChargesCurrency =
    normalizeCurrency(otherCurrencyPicked.raw, { fallback: header.currency }).value ??
    (header.other_charges !== null ? header.currency : null);

  const flagFor = (field: string): boolean | null => {
    const candidates = extractions
      .map((page) => headerBoolean(page.extraction!, field))
      .filter((value): value is boolean => value !== null);
    return candidates.length > 0 ? candidates[candidates.length - 1] : null;
  };
  chargeFlags.freightIncluded = flagFor('freight_included');
  chargeFlags.insuranceIncluded = flagFor('insurance_included');
  chargeFlags.otherChargesIncluded = flagFor('other_charges_included');

  /* ---------------- line items ---------------- */

  type LineCandidate = { page: number; item: ExtractedLineItem };
  const specialItems = new Set(specialRows.map((row) => row.item));
  const filtered: LineCandidate[] = [];
  let previousPage: number | null = null;
  for (const candidate of allRows) {
    if (specialItems.has(candidate.item)) continue;
    if (isHeadingRow(candidate.item)) continue;
    const item = candidate.item;
    const empty =
      !lineRaw(item, 'description') &&
      !lineRaw(item, 'total_line_amount') &&
      !lineRaw(item, 'quantity') &&
      !lineRaw(item, 'unit_price') &&
      !lineRaw(item, 'hsn_code');
    if (empty) continue;
    if (
      !lineRaw(item, 'quantity') &&
      !lineRaw(item, 'unit_price') &&
      !lineRaw(item, 'total_line_amount')
    ) {
      continue;
    }

    const previous = filtered[filtered.length - 1];
    if (
      previous &&
      previousPage !== null &&
      previous.page !== candidate.page &&
      sameRow(previous.item, candidate.item)
    ) {
      issues.push(
        issue('W_DUPLICATE_ROW', {
          message: `Removed an exact duplicated row at the page ${candidate.page} boundary.`,
          page: candidate.page,
        }),
      );
      continue;
    }
    filtered.push(candidate);
    previousPage = candidate.page;
  }

  if (filtered.length === 0) {
    issues.push(
      issue('W_MISSING_FIELD', {
        field: 'line_items',
        message: 'No invoice line items were found.',
      }),
    );
  }

  const currencyUnits = minorUnitsForCurrency(header.currency);
  const lineTolerance = new Decimal(toleranceForCurrency(header.currency));
  const lineItems: InvoiceLineItem[] = [];
  const lineRows: NormalizedLineRow[] = [];
  const lineDecimalAmounts: Array<Decimal | null> = [];
  let lineMismatchCount = 0;
  let lineIncompleteCount = 0;

  for (const [index, candidate] of filtered.entries()) {
    const lineNumber = index + 1;
    const item = candidate.item;
    const flags: string[] = [];

    const description = lineRaw(item, 'description');
    const hsn = normalizeHsn(lineRaw(item, 'hsn_code'));
    const quantity = parseDecimal(lineRaw(item, 'quantity'), numberStyle, { zeroDecimal, minorUnits });
    const uom = normalizeUom(lineRaw(item, 'unit_of_measure'));
    const uomPrinted = lineRaw(item, 'unit_of_measure');
    const unitPrice = parseDecimal(lineRaw(item, 'unit_price'), numberStyle, { zeroDecimal, minorUnits });
    const rawAmount = lineRaw(item, 'total_line_amount');
    const printedAmount = parseDecimal(rawAmount, numberStyle, { zeroDecimal, minorUnits });

    const rowMargin = findEvidence(item.row_text ?? description, groundedPages, {
      preferredPage: candidate.page,
    });
    const rowBbox = rowMargin?.bbox ?? null;

    const uomEvidence = lineEvidence(item, 'unit_of_measure') ?? uomPrinted;
    const uomMatch = uomPrinted
      ? findEvidence(uomEvidence, groundedPages, {
          preferredPage: candidate.page,
          withinBbox: rowBbox,
        })
      : null;
    const acceptedUomPrinted = uomPrinted && uomMatch ? uomPrinted : null;
    const acceptedUom = acceptedUomPrinted ? uom : { value: null, warning: null };

    const expectedLineAmount =
      quantity.decimal && unitPrice.decimal
        ? quantity.decimal.times(unitPrice.decimal)
        : null;
    const amountEvidence = lineEvidence(item, 'total_line_amount') ?? rawAmount;
    const amountMatch = rawAmount
      ? findEvidence(amountEvidence, groundedPages, {
          preferredPage: candidate.page,
          withinBbox: rowBbox,
        })
      : null;
    const amountMatchesOperands =
      printedAmount.decimal !== null &&
      expectedLineAmount !== null &&
      printedAmount.decimal.equals(expectedLineAmount);
    const derivedLineAmount =
      expectedLineAmount !== null &&
      (printedAmount.decimal === null || (!amountMatch && amountMatchesOperands));
    const amount =
      derivedLineAmount && expectedLineAmount
        ? {
            value: decimalString(expectedLineAmount, currencyUnits),
            decimal: expectedLineAmount,
            warning: null,
          }
        : printedAmount;
    const lineMismatch =
      expectedLineAmount !== null &&
      amount.decimal !== null &&
      expectedLineAmount.minus(amount.decimal).abs().gt(lineTolerance);
    const lineIncomplete =
      !lineMismatch &&
      (amount.decimal !== null || quantity.decimal !== null || unitPrice.decimal !== null) &&
      (expectedLineAmount === null || amount.decimal === null);

    const fieldMatches: EvidenceMatch[] = [];
    const registerLineField = (
      field: string,
      raw: string | null,
      normalized: string | null,
      warning: IssueCode | null,
      validationScore: number,
      arithmeticFailed = false,
    ) => {
      if (raw === null) return null;
      if (warning) {
        issues.push(
          issue(warning, {
            field,
            lineNumber,
            actual: raw,
            page: candidate.page,
            message: `${ISSUE_DEFAULTS[warning].message} (line ${lineNumber} ${field.replace(/_/g, ' ')})`,
          }),
        );
      }
      const evidence = lineEvidence(item, field) ?? raw;
      const match = findEvidence(evidence, groundedPages, {
        preferredPage: candidate.page,
        withinBbox: rowBbox,
      });
      addConfidence({
        field,
        lineNumber,
        rawValue: raw,
        normalizedValue: normalized,
        evidence,
        page: candidate.page,
        match,
        validationScore,
        arithmeticFailed,
      });
      if (match) fieldMatches.push(match);
      if (!match) {
        issues.push(
          issue('E_NOT_GROUNDED', {
            field,
            lineNumber,
            page: candidate.page,
            actual: raw,
            message: `Line ${lineNumber} ${field.replace(/_/g, ' ')} could not be located in the source document.`,
          }),
        );
      }
      return match;
    };

    registerLineField(
      'item_description',
      description,
      description,
      null,
      description ? 1 : 0,
    );
    registerLineField(
      'hsn_code',
      lineRaw(item, 'hsn_code'),
      hsn.value,
      hsn.warning,
      hsn.warning ? 0.4 : lineRaw(item, 'hsn_code') ? 1 : 0,
    );
    const quantityMatch = registerLineField(
      'quantity',
      lineRaw(item, 'quantity'),
      quantity.value,
      quantity.warning,
      quantity.warning ? 0.5 : lineRaw(item, 'quantity') ? 1 : 0,
      lineMismatch,
    );
    registerLineField(
      'unit_of_measure',
      acceptedUomPrinted,
      acceptedUom.value,
      acceptedUom.warning,
      acceptedUom.warning ? 0.5 : acceptedUomPrinted ? 1 : 0,
    );
    const unitPriceMatch = registerLineField(
      'unit_price',
      lineRaw(item, 'unit_price'),
      unitPrice.value,
      unitPrice.warning,
      unitPrice.warning ? 0.5 : lineRaw(item, 'unit_price') ? 1 : 0,
      lineMismatch,
    );
    if (derivedLineAmount) {
      const derivedMatch =
        quantityMatch && unitPriceMatch
          ? {
              page: quantityMatch.page,
              bbox: unionBbox([quantityMatch.bbox, unitPriceMatch.bbox])!,
              source:
                quantityMatch.source === 'text_layer' && unitPriceMatch.source === 'text_layer'
                  ? ('text_layer' as const)
                  : ('ocr' as const),
              confidence: Math.min(quantityMatch.confidence, unitPriceMatch.confidence),
            }
          : null;
      addConfidence({
        field: 'total_line_amount',
        lineNumber,
        rawValue: amount.value,
        normalizedValue: amount.value,
        evidence: null,
        page: candidate.page,
        match: derivedMatch,
        validationScore: 1,
      });
      if (derivedMatch) fieldMatches.push(derivedMatch);
    } else {
      registerLineField(
        'total_line_amount',
        rawAmount,
        amount.value,
        amount.warning,
        amount.warning ? 0.5 : rawAmount ? 1 : 0,
        lineMismatch,
      );
    }

    if (lineMismatch && expectedLineAmount && amount.decimal) {
      lineMismatchCount += 1;
      flags.push('E_ARITH_LINE');
      issues.push(
        issue('E_ARITH_LINE', {
          field: 'total_line_amount',
          lineNumber,
          page: candidate.page,
          expected: decimalString(expectedLineAmount, currencyUnits),
          actual: amount.value,
          message: `Line ${lineNumber} amount ${amount.value} does not equal ${decimalString(expectedLineAmount, currencyUnits)} (quantity × unit price).`,
        }),
      );
    } else if (lineIncomplete) {
      lineIncompleteCount += 1;
      flags.push('E_ARITH_INCOMPLETE');
      issues.push(
        issue('E_ARITH_INCOMPLETE', {
          field: 'total_line_amount',
          lineNumber,
          page: candidate.page,
          message: `Line ${lineNumber} cannot be verified because quantity, unit price, or amount is missing.`,
        }),
      );
    }

    const union = unionBbox(fieldMatches.map((match) => match.bbox));
    lineItems.push({
      line_number: lineNumber,
      item_description: description,
      hsn_code: hsn.value,
      quantity: quantity.value,
      unit_of_measure: acceptedUom.value,
      uom_as_printed: acceptedUomPrinted,
      unit_price: unitPrice.value,
      total_line_amount: amount.value,
    });
    lineRows.push({
      pageNumber: rowMargin?.page ?? fieldMatches[0]?.page ?? candidate.page,
      rowBbox: union,
      flags,
    });
    lineDecimalAmounts.push(amount.decimal);
  }

  /* ---------------- header arithmetic ---------------- */

  const tolerance = new Decimal(toleranceForCurrency(header.currency));
  const lineSum = lineDecimalAmounts.every((value): value is Decimal => value !== null)
    ? lineDecimalAmounts.reduce((sum, value) => sum.plus(value), new Decimal(0))
    : null;

  const includedCharges: string[] = [];
  const excludedCharges: string[] = [];

  type ChargeCandidate = {
    label: string;
    amountField: keyof InvoiceHeader;
    flagField:
      | 'freightIncluded'
      | 'insuranceIncluded'
      | 'otherChargesIncluded';
    raw: string;
    value: string;
    decimal: Decimal;
    currency: string | null;
    modelIncluded: boolean | null;
    included: boolean;
    inclusionKnown: boolean;
  };

  const charges: Array<{
    label: string;
    amount: keyof InvoiceHeader;
    currency: keyof InvoiceHeader;
    flagField: ChargeCandidate['flagField'];
    included: boolean | null;
    overrideCurrency?: string | null;
  }> = [
    {
      label: 'freight',
      amount: 'freight_charges',
      currency: 'freight_currency',
      flagField: 'freightIncluded',
      included: chargeFlags.freightIncluded,
    },
    {
      label: 'insurance',
      amount: 'insurance_charges',
      currency: 'insurance_currency',
      flagField: 'insuranceIncluded',
      included: chargeFlags.insuranceIncluded,
    },
    {
      label: 'other charges',
      amount: 'other_charges',
      currency: 'currency',
      flagField: 'otherChargesIncluded',
      included: chargeFlags.otherChargesIncluded,
      overrideCurrency: chargeFlags.otherChargesCurrency,
    },
  ];

  const sameCurrencyCharges: ChargeCandidate[] = [];
  for (const charge of charges) {
    const rawAmount = headerRaws[charge.amount] ?? header[charge.amount];
    const parsed = parseDecimal(rawAmount, numberStyle, { zeroDecimal, minorUnits });
    if (!parsed.decimal || parsed.decimal.isZero() || parsed.value === null) continue;
    const chargeCurrency =
      charge.overrideCurrency ??
      normalizeCurrency(header[charge.currency] ?? null, { fallback: header.currency }).value;
    const sameCurrency = !!header.currency && chargeCurrency === header.currency;

    if (!sameCurrency) {
      excludedCharges.push(`${charge.label} ${parsed.value} ${chargeCurrency ?? 'unknown'}`);
      chargeFlags[charge.flagField] = false;
      issues.push(
        issue('W_CROSS_CURRENCY_CHARGE', {
          field: charge.amount,
          expected: header.currency,
          actual: chargeCurrency ?? parsed.value,
          message: `${charge.label} is in ${chargeCurrency ?? 'an unknown currency'}, not ${header.currency ?? 'the invoice currency'}; it was excluded from the invoice-currency total.`,
        }),
      );
      continue;
    }

    sameCurrencyCharges.push({
      label: charge.label,
      amountField: charge.amount,
      flagField: charge.flagField,
      raw: rawAmount ?? parsed.value,
      value: parsed.value,
      decimal: parsed.decimal,
      currency: chargeCurrency,
      modelIncluded: charge.included,
      included: charge.included === true,
      inclusionKnown: charge.included !== null,
    });
  }

  const tax = parseDecimal(headerRaws.total_tax_amount, numberStyle, { zeroDecimal, minorUnits });
  const printedTotal = parseDecimal(headerRaws.total_invoice_value, numberStyle, { zeroDecimal, minorUnits });

  const totalNeedle = printedTotal.value ? normalizeText(printedTotal.value) : null;
  let totalLineIndex = -1;
  if (totalNeedle) {
    for (let index = 0; index < pageTextLines.length; index += 1) {
      if (normalizeText(pageTextLines[index]).includes(totalNeedle)) totalLineIndex = index;
    }
  }

  function documentChargeInclusion(charge: ChargeCandidate): {
    included: boolean;
    known: boolean;
  } {
    const patternEntry = TEXT_CHARGE_PATTERNS.find(
      (entry) => entry.field === charge.amountField,
    );

    if (patternEntry) {
      let chargeLineIndex = -1;
      let excludedByText = false;
      for (let index = 0; index < pageTextLines.length; index += 1) {
        const line = pageTextLines[index];
        if (!patternEntry.pattern.test(line)) continue;
        const raw = amountFromTextLine(line, numberStyle, zeroDecimal, minorUnits);
        if (raw === null) continue;
        const parsed = parseDecimal(raw, numberStyle, { zeroDecimal, minorUnits });
        if (!parsed.decimal?.equals(charge.decimal)) continue;
        chargeLineIndex = index;
        const nearby = [line, pageTextLines[index - 1], pageTextLines[index + 1]];
        if (nearby.some((entry) => entry !== undefined && DOCUMENT_EXCLUSION_PATTERN.test(entry))) {
          excludedByText = true;
        }
      }

      if (chargeLineIndex >= 0 && excludedByText) {
        return { included: false, known: true };
      }
      if (chargeLineIndex >= 0 && totalLineIndex >= 0) {
        return { included: chargeLineIndex < totalLineIndex, known: true };
      }
    }

    if (charge.modelIncluded !== null) {
      return { included: charge.modelIncluded, known: true };
    }
    return { included: false, known: false };
  }


  if (lineSum && printedTotal.decimal && header.other_charges === null) {
    const base = lineSum.plus(tax.decimal ?? new Decimal(0));
    const footerAmounts = footerUnlabeledAmounts({
      pages,
      style: numberStyle,
      zeroDecimal,
      minorUnits,
      printedTotal: printedTotal.decimal,
    });
    const hasCifTerms = pageTextLines.some((line) => /\b(cif|cip)\b/i.test(line));
    const hasFreight = sameCurrencyCharges.some(
      (charge) => charge.amountField === 'freight_charges',
    );
    const target =
      hasCifTerms && hasFreight && header.insurance_charges === null
        ? { field: 'insurance_charges' as const, label: 'insurance', flag: 'insuranceIncluded' as const }
        : { field: 'other_charges' as const, label: 'other charges', flag: 'otherChargesIncluded' as const };

    for (const candidate of footerAmounts) {
      const parsed = parseDecimal(candidate.raw, numberStyle, { zeroDecimal, minorUnits });
      if (!parsed.decimal || parsed.decimal.isZero()) continue;
      const trial: ChargeCandidate = {
        label: target.label,
        amountField: target.field,
        flagField: target.flag,
        raw: candidate.raw,
        value: parsed.value ?? candidate.raw,
        decimal: parsed.decimal,
        currency: header.currency,
        modelIncluded: null,
        included: false,
        inclusionKnown: false,
      };
      const chargeSet = [...sameCurrencyCharges, trial];
      let matches = false;
      for (let mask = 0; mask < 2 ** chargeSet.length; mask += 1) {
        const total = chargeSet.reduce(
          (sum, charge, index) => ((mask & (1 << index)) !== 0 ? sum.plus(charge.decimal) : sum),
          base,
        );
        if (total.minus(printedTotal.decimal).abs().lte(tolerance)) {
          matches = true;
          break;
        }
      }
      if (!matches) continue;
      const match = findEvidence(candidate.raw, groundedPages, { preferredPage: candidate.page });
      if (!match) continue;
      header[target.field] = parsed.value;
      headerRaws[target.field] = candidate.raw;
      if (target.field === 'insurance_charges') {
        header.insurance_currency = header.currency;
      } else {
        chargeFlags.otherChargesCurrency = header.currency;
      }
      sameCurrencyCharges.push(trial);
      chargeFlags[target.flag] = null;
      addConfidence({
        field: target.field,
        lineNumber: null,
        rawValue: candidate.raw,
        normalizedValue: parsed.value,
        evidence: candidate.raw,
        page: candidate.page,
        match,
        validationScore: 0.8,
      });
      break;
    }
  }

  for (const charge of sameCurrencyCharges) {
    const resolved = documentChargeInclusion(charge);
    charge.included = resolved.included;
    charge.inclusionKnown = resolved.known;
    chargeFlags[charge.flagField] = resolved.known ? resolved.included : null;
  }

  for (const charge of sameCurrencyCharges) {
    if (charge.inclusionKnown) continue;
    issues.push(
      issue('W_CHARGE_INCLUSION_UNKNOWN', {
        field: charge.amountField,
        actual: charge.value,
        message: `It is unclear whether ${charge.label} is included in the printed total; it was not counted.`,
      }),
    );
  }

  let reconciliationStatus: Reconciliation['status'] = 'incomplete';
  let expectedTotal: Decimal | null = null;
  let delta: Decimal | null = null;
  let chargeSum = new Decimal(0);
  let message = 'Arithmetic could not be verified because required values are missing.';

  if (lineSum && printedTotal.decimal) {
    const taxValue = tax.decimal ?? new Decimal(0);
    const base = lineSum.plus(taxValue);
    const included = sameCurrencyCharges.filter((charge) => charge.included);

    expectedTotal = included.reduce((sum, charge) => sum.plus(charge.decimal), base);
    chargeSum = included.reduce(
      (sum, charge) => sum.plus(charge.decimal),
      new Decimal(0),
    );
    delta = expectedTotal.minus(printedTotal.decimal);
    const matches = delta.abs().lte(tolerance);
    reconciliationStatus = matches ? 'valid' : 'mismatch';

    for (const charge of sameCurrencyCharges) {
      const label = `${charge.label} ${charge.value} ${charge.currency}`;
      if (!charge.inclusionKnown) excludedCharges.push(`${label} (inclusion not confirmed)`);
      else if (charge.included) includedCharges.push(label);
      else excludedCharges.push(`${label} (not included)`);
    }

    if (matches) {
      message =
        lineMismatchCount + lineIncompleteCount > 0
          ? `Header total reconciles within ${tolerance.toString()}; ${lineMismatchCount + lineIncompleteCount} line item check(s) need review.`
          : `Total reconciles within ${tolerance.toString()}.`;
    } else {
      message = `Expected ${decimalString(expectedTotal, currencyUnits)} but the invoice prints ${printedTotal.value}.`;
      issues.push(
        issue('E_ARITH_TOTAL', {
          field: 'total_invoice_value',
          expected: decimalString(expectedTotal, currencyUnits),
          actual: printedTotal.value,
          message,
        }),
      );
    }
  } else {
    issues.push(
      issue('E_ARITH_INCOMPLETE', {
        field: !lineSum ? 'line_items' : 'total_invoice_value',
        message,
      }),
    );
  }

  const reconciliation: Reconciliation = {
    status: reconciliationStatus,
    lineSum: lineSum ? decimalString(lineSum, currencyUnits) : null,
    chargeSum: decimalString(chargeSum, currencyUnits),
    taxAmount: tax.value,
    expectedTotal: expectedTotal ? decimalString(expectedTotal, currencyUnits) : null,
    printedTotal: printedTotal.value,
    delta: delta ? decimalString(delta, currencyUnits) : null,
    tolerance: tolerance.toString(),
    includedCharges,
    excludedCharges,
    lineMismatchCount,
    lineIncompleteCount,
    message,
  };

  /* ---------------- low confidence + review ---------------- */

  for (const confidence of confidences) {
    if (confidence.score >= reviewThreshold) continue;
    if (confidence.source === 'none') continue;
    issues.push(
      issue('W_LOW_CONFIDENCE', {
        field: confidence.field,
        lineNumber: confidence.lineNumber,
        page: confidence.page,
        expected: reviewThreshold.toFixed(2),
        actual: confidence.score.toFixed(3),
        message:
          confidence.lineNumber === null
            ? `Confidence for ${confidence.field.replace(/_/g, ' ')} is ${confidence.score.toFixed(3)}, below ${reviewThreshold.toFixed(2)}.`
            : `Confidence for line ${confidence.lineNumber} ${confidence.field.replace(/_/g, ' ')} is ${confidence.score.toFixed(3)}, below ${reviewThreshold.toFixed(2)}.`,
      }),
    );
  }

  const severityRank = { high: 0, medium: 1, low: 2 } as const;
  const seenIssues = new Set<string>();
  const uniqueIssues = issues.filter((draft) => {
    const key = [draft.code, draft.field ?? '', draft.lineNumber ?? '', draft.message].join('|');
    if (seenIssues.has(key)) return false;
    seenIssues.add(key);
    return true;
  });
  uniqueIssues.sort((a, b) => severityRank[a.severity] - severityRank[b.severity]);
  for (const draft of uniqueIssues) {
    if (draft.page && draft.bbox) continue;
    const lineNumber = draft.lineNumber ?? null;
    const field = draft.field ?? null;
    if (field) {
      const match = confidences.find(
        (entry) =>
          entry.field === field &&
          entry.lineNumber === lineNumber &&
          entry.page !== null &&
          entry.bbox !== null,
      );
      if (match?.page && match.bbox) {
        draft.page = match.page;
        draft.bbox = match.bbox;
      }
      continue;
    }
    if (lineNumber !== null) {
      const row = lineRows[lineNumber - 1];
      if (row?.pageNumber && row.rowBbox) {
        draft.page = row.pageNumber;
        draft.bbox = row.rowBbox;
      }
    }
  }
  const reviewExempt: ReadonlySet<IssueCode> = new Set([
    'W_CROSS_CURRENCY_CHARGE',
    'W_DUPLICATE_ROW',
    'W_UNKNOWN_UOM',
  ]);
  const reviewableIssues = uniqueIssues.filter(
    (draft) => draft.severity !== 'low' && !reviewExempt.has(draft.code),
  );
  const reviewReasons = [...new Set(reviewableIssues.map((draft) => draft.message))];
  const isArithmeticValid =
    reconciliation.status === 'valid' &&
    lineMismatchCount === 0 &&
    lineIncompleteCount === 0;

  return {
    header,
    chargeFlags,
    headerRaws,
    lineItems,
    lineRows,
    confidences,
    issues: uniqueIssues,
    isArithmeticValid,
    needsReview: reviewableIssues.length > 0,
    reviewReasons,
    reconciliation,
  };
}

/* ------------------------------------------------------------------ */
/* Browser display helpers                                             */
/* ------------------------------------------------------------------ */

const ACTIVE_POLL_MS = 1_000;

export function getInvoiceListRefreshInterval(
  invoices: Array<{ machineStatus: InvoiceMachineStatus }> | undefined,
): number {
  return invoices?.some(
    (invoice) =>
      invoice.machineStatus === 'queued' || invoice.machineStatus === 'processing',
  )
    ? ACTIVE_POLL_MS
    : 0;
}

export function getInvoiceRefreshInterval(
  invoice: { machineStatus: InvoiceMachineStatus } | null | undefined,
): number {
  return invoice?.machineStatus === 'queued' || invoice?.machineStatus === 'processing'
    ? ACTIVE_POLL_MS
    : 0;
}

export function getConfidenceLabel(score: number | null | undefined): {
  label: string;
  tone: 'high' | 'medium' | 'low' | 'neutral';
} {
  if (score === null || score === undefined || Number.isNaN(score)) {
    return { label: 'Unavailable', tone: 'neutral' };
  }
  if (score >= 0.9) return { label: 'Very High', tone: 'high' };
  if (score >= 0.75) return { label: 'High', tone: 'high' };
  if (score >= 0.5) return { label: 'Medium', tone: 'medium' };
  if (score >= 0.25) return { label: 'Low', tone: 'low' };
  return { label: 'Very Low', tone: 'low' };
}

export function formatCurrency(
  amount: string | number | null,
  currency: string | null | undefined,
): string {
  if (amount === null || amount === undefined || amount === '') return 'Not found';
  return currency ? `${currency} ${amount}` : String(amount);
}

export function hasSource(source: FieldSourceLocation | null | undefined): boolean {
  return Boolean(
    source && source.page >= 1 && Array.isArray(source.bbox) && source.bbox.length === 4,
  );
}

export function copyJsonToClipboard(json: unknown): Promise<void> {
  const text = JSON.stringify(json, null, 2);
  if (typeof navigator !== 'undefined' && navigator.clipboard) {
    return navigator.clipboard.writeText(text);
  }
  const textarea = document.createElement('textarea');
  textarea.value = text;
  document.body.appendChild(textarea);
  textarea.select();
  document.execCommand('copy');
  document.body.removeChild(textarea);
  return Promise.resolve();
}

export function apiErrorMessage(error: unknown): string {
  if (error && typeof error === 'object' && 'response' in error) {
    const data = (error as { response?: { data?: unknown } }).response?.data;
    if (data && typeof data === 'object' && 'error' in data) {
      const body = (data as { error?: { message?: unknown } }).error;
      if (body && typeof body.message === 'string') return body.message;
    }
  }
  if (error instanceof Error) return error.message;
  return 'The request could not be completed.';
}
