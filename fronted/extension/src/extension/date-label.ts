/**
 * WhatsApp-style day label for a persisted timestamp.
 * `now` is the viewer's current local time. Labels use the local calendar day.
 * This function is copied into the webview, so it cannot call other module helpers.
 */
export function dateSeparatorLabel(iso: string | undefined, now: Date | number = new Date()): string {
  const parts = (value: Date) => ({ year: value.getFullYear(), month: value.getMonth(), day: value.getDate() });
  const same = (left: Date, right: Date) => {
    const a = parts(left);
    const b = parts(right);
    return a.year === b.year && a.month === b.month && a.day === b.day;
  };
  if (!iso) return "";
  const date = new Date(iso);
  const current = now instanceof Date ? now : new Date(now);
  if (Number.isNaN(date.getTime()) || Number.isNaN(current.getTime())) return "";
  if (same(date, current)) return "Today";
  const yesterday = new Date(current.getFullYear(), current.getMonth(), current.getDate() - 1);
  if (same(date, yesterday)) return "Yesterday";
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
