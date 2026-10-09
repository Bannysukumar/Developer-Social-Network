import { spawn } from "child_process";

export interface OsNoticeResult {
  readonly ok: boolean;
  readonly detail: string;
}

function redact(value: string): string {
  return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/eyJ[A-Za-z0-9_-]{10,}/g, "[redacted]");
}

/** Windows toast for an unfocused VS Code window. showInformationMessage stays inside the editor. */
export function showBackgroundNotice(scriptPath: string, body: string, launch: string): Promise<OsNoticeResult> {
  if (process.platform !== "win32") return Promise.resolve({ ok: false, detail: "not-windows" });
  const text = body.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!text) return Promise.resolve({ ok: false, detail: "empty" });
  return new Promise((resolve) => {
    const child = spawn("powershell.exe", ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath], {
      windowsHide: true,
      env: {
        ...process.env,
        DC_NOTICE_TITLE: "DevConnect",
        DC_NOTICE_BODY: text,
        DC_NOTICE_LAUNCH: launch,
        DC_NOTICE_TARGET: process.execPath,
      },
    });
    let output = "";
    const timer = setTimeout(() => {
      child.kill();
      resolve({ ok: false, detail: "timeout" });
    }, 15000);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      resolve({ ok: false, detail: redact(error.message).slice(0, 240) });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      const detail = redact(output).replace(/\s+/g, " ").trim().slice(0, 240);
      resolve({ ok: code === 0 && detail.includes("TOAST_SHOWN"), detail: detail || `exit ${code ?? "unknown"}` });
    });
  });
}
