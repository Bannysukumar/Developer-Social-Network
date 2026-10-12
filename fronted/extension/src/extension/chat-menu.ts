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
  const block = action === "unblock"
    ? '<button class="btn quiet" type="button" data-act="menu-unblock" role="menuitem">Unblock user</button>'
    : action === "block"
      ? '<button class="btn quiet danger" type="button" data-act="menu-block" role="menuitem">Block user</button>'
      : "";
  return '<button class="btn quiet danger" type="button" data-act="clear-chat" role="menuitem">Clear chat</button>' + block;
}
