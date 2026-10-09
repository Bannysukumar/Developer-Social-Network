import WebSocket from "ws";
import { z } from "zod";
import { messageSchema, notificationSchema, type MessageDto, type NotificationDto } from "../shared/api-types";
import { retryDelayMs } from "./realtime-state";

const serverFrameSchema = z.object({
  type: z.enum(["READY", "MESSAGE", "DELIVERED", "READ", "PONG", "ERROR", "NOTIFICATION", "PRESENCE_UPDATE", "TYPING_START", "TYPING_STOP", "MESSAGE_HIDDEN", "MESSAGE_DELETED"]),
  data: z.unknown().optional(),
}).passthrough();

export type ServerFrame = z.infer<typeof serverFrameSchema>;

/** Map the REST base URL to /ws/chat. HTTPS becomes WSS. HTTP becomes WS only for an already allowed base URL. */
export function chatSocketUrl(apiBaseUrl: string): string {
  const url = new URL(apiBaseUrl);
  url.protocol = url.protocol === "https:" ? "wss:" : "ws:";
  url.pathname = "/ws/chat";
  url.search = "";
  url.hash = "";
  return url.toString();
}

export function parseServerFrame(raw: string): ServerFrame | undefined {
  try {
    const parsed = serverFrameSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : undefined;
  } catch {
    return undefined;
  }
}

export function messageFromFrame(frame: ServerFrame): MessageDto | undefined {
  if (frame.type !== "MESSAGE") return undefined;
  const parsed = messageSchema.safeParse(frame.data);
  return parsed.success ? parsed.data : undefined;
}

export function notificationFromFrame(frame: ServerFrame): NotificationDto | undefined {
  if (frame.type !== "NOTIFICATION") return undefined;
  const parsed = notificationSchema.safeParse(frame.data);
  return parsed.success ? parsed.data : undefined;
}

const presenceSchema = z.object({
  userId: z.string().min(1),
  status: z.enum(["ONLINE", "OFFLINE"]),
  lastSeenAt: z.string().nullable().optional(),
}).passthrough();

export type PresenceUpdate = z.infer<typeof presenceSchema>;

const typingSchema = z.object({
  conversationId: z.string().min(1),
  userId: z.string().min(1),
}).passthrough();

export type TypingUpdate = z.infer<typeof typingSchema>;

export function presenceFromFrame(frame: ServerFrame): PresenceUpdate | undefined {
  if (frame.type !== "PRESENCE_UPDATE") return undefined;
  const parsed = presenceSchema.safeParse(frame.data);
  return parsed.success ? parsed.data : undefined;
}

export function typingFromFrame(frame: ServerFrame): { active: boolean; conversationId: string; userId: string } | undefined {
  if (frame.type !== "TYPING_START" && frame.type !== "TYPING_STOP") return undefined;
  const parsed = typingSchema.safeParse(frame.data);
  if (!parsed.success) return undefined;
  return { active: frame.type === "TYPING_START", conversationId: parsed.data.conversationId, userId: parsed.data.userId };
}

export type SocketStatus = "offline" | "connecting" | "connected" | "reconnecting";

export interface SocketHandlers {
  onFrame: (frame: ServerFrame) => void;
  onStatus: (status: SocketStatus, recovered: boolean) => void;
  onAuthLost?: () => void;
}

export interface ChatSocket {
  connect(
    url: string,
    accessToken: string,
    handlers: SocketHandlers,
    refreshToken?: () => Promise<string | undefined>,
    forceRefresh?: () => Promise<string | undefined>,
  ): void;
  send(frame: { type: string; conversationId?: string }): void;
  close(): void;
}

/** One extension-host socket per session. The access token is an Authorization header, never part of the URL. */
export class NodeChatSocket implements ChatSocket {
  private socket: WebSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private heartbeat: ReturnType<typeof setInterval> | undefined;
  private attempt = 0;
  private stopped = true;
  private url = "";
  private token = "";
  private refreshToken: () => Promise<string | undefined> = async () => this.token;
  private forceRefresh: () => Promise<string | undefined> = async () => undefined;
  private handlers: SocketHandlers = { onFrame: () => undefined, onStatus: () => undefined };
  private authFailures = 0;
  private authRejected = false;

  connect(
    url: string,
    accessToken: string,
    handlers: SocketHandlers,
    refreshToken?: () => Promise<string | undefined>,
    forceRefresh?: () => Promise<string | undefined>,
  ): void {
    this.stopSocket();
    this.stopped = false;
    this.attempt = 0;
    this.authFailures = 0;
    this.authRejected = false;
    this.url = url;
    this.token = accessToken;
    this.refreshToken = refreshToken ?? (async () => this.token);
    this.forceRefresh = forceRefresh ?? refreshToken ?? (async () => undefined);
    this.handlers = handlers;
    this.open(false);
  }

  send(frame: { type: string; conversationId?: string }): void {
    if (this.socket?.readyState === WebSocket.OPEN) {
      this.socket.send(JSON.stringify(frame));
    }
  }

  close(): void {
    const alreadyStopped = this.stopped;
    this.stopped = true;
    this.stopSocket();
    if (!alreadyStopped) this.handlers.onStatus("offline", false);
  }

  private open(retry: boolean): void {
    if (this.stopped) return;
    this.stopSocket();
    this.handlers.onStatus(retry ? "reconnecting" : "connecting", false);
    void this.refreshToken().then((token) => {
      if (this.stopped) return;
      if (!token) {
        this.loseAuth();
        return;
      }
      this.token = token;
      this.openSocket(retry);
    }).catch(() => {
      if (!this.stopped) this.schedule();
    });
  }

  private openSocket(retry: boolean): void {
    if (this.stopped) return;
    this.handlers.onStatus(retry ? "reconnecting" : "connecting", false);
    const socket = new WebSocket(this.url, {
      headers: { Authorization: `Bearer ${this.token}` },
    });
    this.socket = socket;
    socket.on("open", () => {
      if (this.socket !== socket) return;
      const recovered = this.attempt > 0;
      this.attempt = 0;
      this.authFailures = 0;
      this.handlers.onStatus("connected", recovered);
      socket.send(JSON.stringify({ type: "PING" }));
      this.heartbeat = setInterval(() => {
        if (this.socket === socket && socket.readyState === WebSocket.OPEN) {
          socket.send(JSON.stringify({ type: "PING" }));
        }
      }, 25_000);
    });
    socket.on("message", (data: WebSocket.RawData) => {
      const frame = parseServerFrame(data.toString());
      if (frame) this.handlers.onFrame(frame);
    });
    socket.on("unexpected-response", (_request, response) => {
      if (response.statusCode === 401) this.authRejected = true;
    });
    socket.on("close", () => {
      if (this.socket !== socket || this.stopped) return;
      this.socket = undefined;
      if (!this.authRejected) {
        this.schedule();
        return;
      }
      this.authRejected = false;
      this.authFailures += 1;
      if (this.authFailures > 1) {
        this.loseAuth();
        return;
      }
      void this.forceRefresh().then((token) => {
        if (this.stopped) return;
        if (!token) {
          this.loseAuth();
          return;
        }
        this.token = token;
        this.openSocket(true);
      }).catch(() => this.loseAuth());
    });
    socket.on("error", () => {
      socket.close();
    });
  }

  private loseAuth(): void {
    this.stopped = true;
    this.stopSocket();
    this.handlers.onStatus("offline", false);
    this.handlers.onAuthLost?.();
  }

  private schedule(): void {
    const delay = retryDelayMs(this.attempt);
    this.attempt += 1;
    this.handlers.onStatus("reconnecting", false);
    this.timer = setTimeout(() => this.open(true), delay);
  }

  private stopSocket(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = undefined;
    if (this.heartbeat) clearInterval(this.heartbeat);
    this.heartbeat = undefined;
    const socket = this.socket;
    this.socket = undefined;
    socket?.removeAllListeners();
    socket?.close();
  }
}
