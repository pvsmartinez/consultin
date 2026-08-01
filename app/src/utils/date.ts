/**
 * Re-exported from @pvsmartinez/shared.
 * Import directly from here so internal paths don't change.
 */
import { fromZonedTime } from 'date-fns-tz'
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
