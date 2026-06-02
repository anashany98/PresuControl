/**
 * Date utilities using date-fns.
 * Replaces manual Intl.DateTimeFormat calls with tree-shakeable, locale-aware functions.
 */
import {
  format,
  formatDistanceToNow,
  parseISO,
  isValid,
  isAfter,
  isBefore,
  differenceInDays,
  addDays,
  addWeeks,
  startOfDay,
  endOfDay,
} from 'date-fns'
import { es } from 'date-fns/locale'

/**
 * Format a date string or Date to Spanish locale (e.g. "15/03/2026").
 */
export function fmtDate(value: unknown): string {
  if (!value) return '—'
  const d = value instanceof Date ? value : parseISO(value as string)
  if (!isValid(d)) return '—'
  return format(d, 'dd/MM/yyyy', { locale: es })
}

/**
 * Format as ISO date string (YYYY-MM-DD) for input[type=date].
 */
export function isoDate(value?: string | null): string {
  if (!value) return ''
  const d = typeof value === 'string' ? parseISO(value) : new Date(value)
  if (!isValid(d)) return ''
  return format(d, 'yyyy-MM-dd')
}

/**
 * Human-readable relative time in Spanish (e.g. "hace 3 días").
 */
export function relativeTime(value: string | Date): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return '—'
  return formatDistanceToNow(d, { addSuffix: true, locale: es })
}

/**
 * Format date with time: "15 mar 2026 14:30".
 */
export function fmtDateTime(value: string | Date): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return '—'
  return format(d, "d MMM yyyy HH:mm", { locale: es })
}

/**
 * Days between two dates. Positive if end is after start.
 */
export function daysBetween(start: string | Date, end: string | Date): number {
  const s = typeof start === 'string' ? parseISO(start) : start
  const e = typeof end === 'string' ? parseISO(end) : end
  return differenceInDays(e, s)
}

/**
 * Check if a date is in the past.
 */
export function isPast(value: string | Date): boolean {
  const d = typeof value === 'string' ? parseISO(value) : value
  return isBefore(d, new Date())
}

/**
 * Check if a date is overdue (strictly before today).
 */
export function isOverdue(value: string | Date | null | undefined): boolean {
  if (!value) return false
  const d = typeof value === 'string' ? parseISO(value) : value
  if (!isValid(d)) return false
  return isBefore(startOfDay(d), startOfDay(new Date()))
}

/**
 * Today's date as ISO string.
 */
export function todayISO(): string {
  return format(new Date(), 'yyyy-MM-dd')
}

/**
 * Add days to a date, return ISO string.
 */
export function addDaysISO(value: string | Date, days: number): string {
  const d = typeof value === 'string' ? parseISO(value) : value
  return format(addDays(d, days), 'yyyy-MM-dd')
}

export { format, parseISO, isValid, isAfter, isBefore, differenceInDays, addDays, addWeeks, startOfDay, endOfDay }
