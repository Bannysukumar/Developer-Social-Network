import WebSocket from "ws";
import { z } from "zod";
import { messageSchema, type MessageDto } from "../shared/api-types";

const serverFrameSchema = z.object({
  type: z.enum(["READY", "MESSAGE", "DELIVERED", "READ", "PONG", "ERROR"]),
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

export interface ChatSocket {
  connect(url: string, accessToken: string, onFrame: (frame: ServerFrame) => void): void;
  close(): void;
}

/** Extension-host socket. The access token is an Authorization header, never part of the URL. */
export class NodeChatSocket implements ChatSocket {
  private socket: WebSocket | undefined;

  connect(url: string, accessToken: string, onFrame: (frame: ServerFrame) => void): void {
    this.close();
    const socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    this.socket = socket;
    socket.on("message", (data: WebSocket.RawData) => {
      const frame = parseServerFrame(data.toString());
      if (frame) onFrame(frame);
    });
    socket.on("open", () => {
      socket.send(JSON.stringify({ type: "PING" }));
    });
  }

  close(): void {
    this.socket?.close();
    this.socket = undefined;
  }
}
