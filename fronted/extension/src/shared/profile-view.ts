export interface ProfileActions {
  readonly blocked: boolean;
  readonly privateLocked: boolean;
  readonly showBio: boolean;
  readonly statusLine: string;
  readonly showRequest: boolean;
  readonly requestSent: boolean;
  readonly requestReceived: boolean;
  readonly showMessage: boolean;
  readonly showUnfriend: boolean;
  readonly showBlock: boolean;
  readonly showUnblock: boolean;
}

export function profileActions(user: {
  readonly accountType?: string | null;
  readonly relationship?: string | null;
  readonly limited?: boolean | null;
  readonly bio?: string | null;
}): ProfileActions {
  const relationship = user.relationship ?? "NONE";
  const blocked = relationship === "BLOCKED";
  const friends = relationship === "FRIENDS";
  const privateLocked = user.accountType === "PRIVATE" && !friends && !blocked;
  return {
    blocked,
    privateLocked,
    showBio: !blocked && !user.limited,
    statusLine: blocked
      ? "You blocked this account."
      : privateLocked
        ? "This account is private."
        : user.bio?.trim() || "",
    showRequest: relationship === "NONE",
    requestSent: relationship === "OUTGOING_REQUEST",
    requestReceived: relationship === "INCOMING_REQUEST",
    showMessage: friends,
    showUnfriend: friends,
    showBlock: !blocked,
    showUnblock: blocked,
  };
}
