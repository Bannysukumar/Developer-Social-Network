export type ChatBlockMenuAction = "block" | "unblock";

/** Block and Unblock are mutually exclusive. A person cannot block themselves. */
export function chatBlockMenuAction(input: {
  selfId?: string | null;
  peerId?: string | null;
  blockedByMe: boolean;
}): ChatBlockMenuAction | null {
  const peerId = input.peerId ?? "";
  if (!peerId || peerId === input.selfId) return null;
  return input.blockedByMe ? "unblock" : "block";
}

export function chatBlockMenuActionForState(state: {
  user?: { id: string } | null;
  conversations: readonly { id: string; participantIds: readonly string[] }[];
  activeConversationId: string | null;
  blockedUsers: readonly { id: string }[];
}): ChatBlockMenuAction | null {
  const selfId = state.user?.id ?? null;
  const conversation = state.conversations.find((item) => item.id === state.activeConversationId);
  const peerId = conversation?.participantIds.find((id) => id !== selfId) ?? null;
  const blockedByMe = !!peerId && state.blockedUsers.some((user) => user.id === peerId);
  return chatBlockMenuAction({ selfId, peerId, blockedByMe });
}

export function chatMenuMarkup(action: ChatBlockMenuAction | null): string {
  const icon = (path: string) => '<svg class="menu-ico" viewBox="0 0 16 16" aria-hidden="true">' + path + "</svg>";
  const block = action === "unblock"
    ? '<button class="btn quiet" type="button" data-act="menu-unblock" role="menuitem">' + icon('<path d="M4 4l8 8M12 4l-8 8" fill="none" stroke="currentColor" stroke-width="1.4"/>') + "Unblock user</button>"
    : action === "block"
      ? '<button class="btn quiet danger" type="button" data-act="menu-block" role="menuitem">' + icon('<circle cx="8" cy="8" r="5.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M4.4 11.6l7.2-7.2" fill="none" stroke="currentColor" stroke-width="1.4"/>') + "Block user</button>"
      : "";
  return '<button class="btn quiet" type="button" data-act="menu-search" role="menuitem">' + icon('<circle cx="7" cy="7" r="3.4" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9.6 9.6L13 13" fill="none" stroke="currentColor" stroke-width="1.4"/>') + "Search</button>"
    + '<button class="btn quiet" type="button" data-act="menu-media" role="menuitem">' + icon('<rect x="2.5" y="3.5" width="11" height="9" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.4"/><circle cx="6" cy="7" r="1" fill="currentColor"/><path d="M3.5 11.2l2.6-2.4 1.8 1.6 2-2.2 2.6 3" fill="none" stroke="currentColor" stroke-width="1.2"/>') + "Media</button>"
    + '<button class="btn quiet" type="button" data-act="menu-docs" role="menuitem">' + icon('<path d="M4 2.5h5.2L13 6.2V13.5H4z" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M9 2.8V6.2H12.4" fill="none" stroke="currentColor" stroke-width="1.4"/>') + "Docs</button>"
    + '<button class="btn quiet danger" type="button" data-act="clear-chat" role="menuitem">' + icon('<path d="M4 5.5h8M6.2 5.5V4.2h3.6v1.3M5.2 5.5l.6 7.2h4.4l.6-7.2" fill="none" stroke="currentColor" stroke-width="1.3"/>') + "Clear chat</button>"
    + block;
}
