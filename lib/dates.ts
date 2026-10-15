// ISO weeks as Monday dates "YYYY-MM-DD", computed in UTC so the result
// doesn't shift with the server's timezone.
export function mondayOf(d: Date): string {
  const utc = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  const dow = (utc.getUTCDay() + 6) % 7; // Monday = 0
  utc.setUTCDate(utc.getUTCDate() - dow);
  return utc.toISOString().slice(0, 10);
}

export function addDays(isoDate: string, days: number): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export const addWeeks = (isoMonday: string, weeks: number) => addDays(isoMonday, weeks * 7);

// The last fully finished week before `now`.
export const lastCompletedWeek = (now: Date) => addWeeks(mondayOf(now), -1);
