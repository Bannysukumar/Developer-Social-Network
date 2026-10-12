export interface ReactionMark {
  readonly userId: string;
  readonly emoji: string;
}

export interface ReactionSummary {
  readonly emoji: string;
  readonly count: number;
  readonly mine: boolean;
  readonly userIds: readonly string[];
}

/** One reaction per user. A new emoji replaces the previous one. A null emoji removes it. */
export function applyUserReaction(items: readonly ReactionMark[] | undefined, userId: string, emoji: string | null): ReactionMark[] {
  const rest = (items ?? []).filter((item) => item.userId !== userId);
  if (!emoji) return rest;
  return [...rest, { userId, emoji }];
}

export function placePicker(
  anchor: { readonly top: number; readonly bottom: number; readonly left: number; readonly right: number },
  picker: { readonly width: number; readonly height: number },
  view: { readonly width: number; readonly height: number },
): { top: number; left: number } {
  const margin = 8;
  let top = anchor.top - picker.height - margin;
  if (top < margin) top = anchor.bottom + margin;
  if (top + picker.height > view.height - margin) top = Math.max(margin, view.height - picker.height - margin);
  let left = anchor.left;
  if (left + picker.width > view.width - margin) left = view.width - picker.width - margin;
  if (left < margin) left = margin;
  return { top, left };
}

export function summarizeReactions(items: readonly ReactionMark[], selfId: string | null): ReactionSummary[] {
  const groups = new Map<string, string[]>();
  for (const item of items) {
    const users = groups.get(item.emoji) ?? [];
    if (!users.includes(item.userId)) users.push(item.userId);
    groups.set(item.emoji, users);
  }
  return [...groups.entries()].map(([emoji, userIds]) => ({
    emoji,
    count: userIds.length,
    mine: selfId !== null && userIds.includes(selfId),
    userIds,
  }));
}
