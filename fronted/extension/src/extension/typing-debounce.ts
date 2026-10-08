export const TYPING_IDLE_MS = 2500;

/** One start while typing continues, then one stop when the box is cleared. */
export function typingCommand(typingOn: boolean, text: string): { typingOn: boolean; active: boolean | null; armIdle: boolean } {
  const trimmed = text.trim();
  if (trimmed.length > 0) {
    return { typingOn: true, active: typingOn ? null : true, armIdle: true };
  }
  if (typingOn) {
    return { typingOn: false, active: false, armIdle: false };
  }
  return { typingOn: false, active: null, armIdle: false };
}
