export const publicScreens = ["login", "signup", "forgot", "reset"] as const;
export const protectedScreens = [
  "home",
  "search",
  "user",
  "friends",
  "messages",
  "notifications",
  "profile",
  "settings",
] as const;

export const screenIds = ["splash", ...publicScreens, ...protectedScreens] as const;
export type ScreenId = (typeof screenIds)[number];

const publicSet = new Set<string>(publicScreens);
const protectedSet = new Set<string>(protectedScreens);

export function isPublicScreen(screen: string): boolean {
  return publicSet.has(screen);
}

export function isProtectedScreen(screen: string): boolean {
  return protectedSet.has(screen);
}

/** Single auth gate for every screen transition. */
export function resolveScreen(input: {
  requested: ScreenId;
  authenticated: boolean;
  checking: boolean;
}): ScreenId {
  if (input.checking) return "splash";
  if (!input.authenticated && !isPublicScreen(input.requested)) return "login";
  if (input.authenticated && isPublicScreen(input.requested)) return "home";
  if (input.requested === "splash") return input.authenticated ? "home" : "login";
  return input.requested;
}

export function notificationDestination(type: string): ScreenId {
  if (type === "FRIEND_REQUEST" || type === "FRIEND_REQUEST_ACCEPTED") return "friends";
  if (type === "NEW_MESSAGE") return "messages";
  if (type === "SECURITY" || type === "ACCOUNT") return "settings";
  return "notifications";
}
