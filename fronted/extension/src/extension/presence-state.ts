export type PresenceStatus = "ONLINE" | "OFFLINE";

export interface PresenceRecord {
  status: PresenceStatus;
  lastSeenAt?: string | null;
}

/** A socket update is current. A profile snapshot must not replace ONLINE with an older last-seen. */
export function mergePresence(
  current: PresenceRecord | undefined,
  incoming: PresenceRecord | null,
  source: "socket" | "snapshot",
): PresenceRecord | null {
  if (incoming == null) {
    return source === "snapshot" ? null : current ?? null;
  }
  if (incoming.status === "ONLINE") {
    return { status: "ONLINE", lastSeenAt: null };
  }
  if (source === "snapshot" && current?.status === "ONLINE") {
    return current;
  }
  return { status: "OFFLINE", lastSeenAt: incoming.lastSeenAt ?? null };
}

export type ChatActivity = "online" | "online-typing" | "typing" | "last-seen" | "offline" | "hidden";

/** ONLINE wins over lastSeen. Typing is shown with Online, and never with Offline. */
export function chatActivity(presence: PresenceRecord | null | undefined, typing: boolean, allowed: boolean): ChatActivity {
  if (!allowed) return "hidden";
  if (presence?.status === "ONLINE") return typing ? "online-typing" : "online";
  if (typing && !presence) return "typing";
  if (presence?.status === "OFFLINE" && presence.lastSeenAt) return "last-seen";
  if (presence?.status === "OFFLINE") return "offline";
  return "hidden";
}
