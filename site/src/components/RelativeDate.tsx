import { relativeDate } from "../lib/relative-time";

/** "3 days ago" with the exact date as a tooltip; computed in the browser so it never goes stale. */
export function RelativeDate({ date }: { date: string }) {
  return (
    <time dateTime={date} title={date}>
      {relativeDate(date)}
    </time>
  );
}
