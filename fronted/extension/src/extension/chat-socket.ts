import WebSocket from "ws";
import { z } from "zod";
import { messageSchema, notificationSchema, type MessageDto, type NotificationDto } from "../shared/api-types";
import { retryDelayMs } from "./realtime-state";

const serverFrameSchema = z.object({
  type: z.enum(["READY", "MESSAGE", "DELIVERED", "READ", "PONG", "ERROR", "NOTIFICATION"]),
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

export type SocketStatus = "offline" | "connecting" | "connected" | "reconnecting";

export interface SocketHandlers {
  onFrame: (frame: ServerFrame) => void;
  onStatus: (status: SocketStatus, recovered: boolean) => void;
}

export interface ChatSocket {
  connect(url: string, accessToken: string, handlers: SocketHandlers, refreshToken?: () => Promise<string | undefined>): void;
  close(): void;
}

/** One extension-host socket per session. The access token is an Authorization header, never part of the URL. */
export class NodeChatSocket implements ChatSocket {
  private socket: WebSocket | undefined;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private attempt = 0;
  private stopped = true;
  private url = "";
  private token = "";
  private refreshToken: () => Promise<string | undefined> = async () => this.token;
  private handlers: SocketHandlers = { onFrame: () => undefined, onStatus: () => undefined };

  connect(
    url: string,
    accessToken: string,
    handlers: SocketHandlers,
    refreshToken?: () => Promise<string | undefined>,
  ): void {
    this.stopSocket();
    this.stopped = false;
    this.attempt = 0;
    this.url = url;
    this.token = accessToken;
    this.refreshToken = refreshToken ?? (async () => this.token);
    this.handlers = handlers;
    this.open(false);
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
      if (token) this.token = token;
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
      this.handlers.onStatus("connected", recovered);
      socket.send(JSON.stringify({ type: "PING" }));
    });
    socket.on("message", (data: WebSocket.RawData) => {
      const frame = parseServerFrame(data.toString());
      if (frame) this.handlers.onFrame(frame);
    });
    socket.on("close", () => {
      if (this.socket !== socket || this.stopped) return;
      this.socket = undefined;
      this.schedule();
    });
    socket.on("error", () => {
      socket.close();
    });
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
    const socket = this.socket;
    this.socket = undefined;
    socket?.removeAllListeners();
    socket?.close();
  }
}
