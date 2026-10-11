/** Local calendar parts. Today and Yesterday follow the viewer's timezone, not UTC. */
function calendarParts(value: Date): { year: number; month: number; day: number } {
  return { year: value.getFullYear(), month: value.getMonth(), day: value.getDate() };
}

function sameDay(left: Date, right: Date): boolean {
  const a = calendarParts(left);
  const b = calendarParts(right);
  return a.year === b.year && a.month === b.month && a.day === b.day;
}

/**
 * WhatsApp-style day label for a persisted timestamp.
 * `now` is the viewer's current local time. Labels use the local calendar day.
 */
export function dateSeparatorLabel(iso: string | undefined, now: Date | number = new Date()): string {
  if (!iso) return "";
  const date = new Date(iso);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return "";
  if (sameDay(date, current)) return "Today";
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  if (sameDay(date, yesterday)) return "Yesterday";
  const sameYear = date.getFullYear() === current.getFullYear();
  return date.toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    ...(sameYear ? {} : { year: "numeric" }),
  });
}

/** Older history loads only when the message list can scroll and the user is near the top. */
export function shouldLoadOlderHistory(input: {
  readonly hasMore: boolean;
  readonly loading: boolean;
  readonly scrollTop: number;
  readonly scrollHeight: number;
  readonly clientHeight: number;
}): boolean {
  if (!input.hasMore || input.loading) return false;
  if (input.scrollHeight <= input.clientHeight + 8) return false;
  return input.scrollTop < 48;
}
