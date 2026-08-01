/**
 * Re-exported from @pvsmartinez/shared.
 * Import directly from here so internal paths don't change.
 */
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz'
import { TZ_BR } from '@pvsmartinez/shared'

export {
  TZ_BR,
  formatDate,
  formatDateTime,
  formatTime,
  todayBR,
} from '@pvsmartinez/shared'

/**
 * Convert a stored calendar date (YYYY-MM-DD, São Paulo) into a UTC ISO instant.
 * The database stores plain dates without a timezone; naive apps append
 * "T00:00:00" which the browser parses in ITS local timezone, shifting the day
 * for users outside America/Sao_Paulo. This parses the date as São Paulo so
 * formatDate renders the exact stored day for every user.
 */
export function brDateToIso(dateStr: string): string {
  return fromZonedTime(`${dateStr}T00:00:00`, TZ_BR).toISOString()
}

/** YYYY-MM-DD math without touching the machine timezone. */
function addDaysStr(dateStr: string, days: number): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(Date.UTC(y, m - 1, d))
  dt.setUTCDate(dt.getUTCDate() + days)
  return dt.toISOString().slice(0, 10)
}

/** Day-of-week (0=Sun..6=Sat) for a YYYY-MM-DD string, timezone-independent. */
function dowOf(dateStr: string): number {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay()
}

/**
 * Monday-starting calendar week (pt-BR) containing `date`, as UTC instants
 * ({ start } = monday 00:00 Sāo Paulo; { end } = next monday 00:00 Sāo Paulo,
 * exclusive upper bound). Computed in America/Sao_Paulo so the same ISO strings
 * are produced regardless of the machine/browser timezone.
 *
 * Home and Agenda share this helper so their week queries produce the SAME
 * React Query cache key (no duplicate fetch when navigating Home → Agenda).
 */
export function weekRangeBR(date: Date): { start: string; end: string } {
  const day = formatInTimeZone(date, TZ_BR, 'yyyy-MM-dd')
  const monday = addDaysStr(day, -((dowOf(day) + 6) % 7))
  return {
    start: fromZonedTime(`${monday}T00:00:00`, TZ_BR).toISOString(),
    end:   fromZonedTime(`${addDaysStr(monday, 7)}T00:00:00`, TZ_BR).toISOString(),
  }
}
