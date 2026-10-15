// "3 days ago", computed in the browser so it never goes stale between builds.
const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

/**
 * `date` is YYYY-MM-DD. Counts whole calendar days in the viewer's time zone, so a release dated
 * today reads "today" all day long. Returns the date itself when it cannot be parsed or lies in the future.
 */
export const relativeDate = (date: string, now: number = Date.now()): string => {
  const match = DATE.exec(date);
  if (!match) return date;
  const then = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
  if (Number.isNaN(then.getTime())) return date;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  // Math.round absorbs the 23/25-hour days around DST changes.
  const days = Math.round((today.getTime() - then.getTime()) / 86_400_000);
  if (days < 0) return date;
  if (days < 30) return rtf.format(-days, "day");
  if (days < 365) return rtf.format(-Math.round(days / 30), "month");
  return rtf.format(-Math.round(days / 365), "year");
};
