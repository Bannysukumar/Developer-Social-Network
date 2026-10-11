import { spawn, type SpawnOptions } from "child_process";
import { existsSync } from "fs";
import { join } from "path";

export interface OsNoticeResult {
  readonly ok: boolean;
  /** True only after Windows accepted the toast. A rejected toast is not submitted. */
  readonly submitted: boolean;
  readonly detail: string;
}

export interface ToastSpawn {
  (command: string, args: readonly string[], options: SpawnOptions): {
    stdout?: { on(event: "data", listener: (chunk: Buffer) => void): void } | null;
    stderr?: { on(event: "data", listener: (chunk: Buffer) => void): void } | null;
    on(event: "error", listener: (error: Error) => void): void;
    on(event: "close", listener: (code: number | null) => void): void;
    kill(): void;
  };
}

/** Script shipped at the extension root, including inside an installed VSIX. */
export function windowsToastScriptPath(extensionRoot: string): string {
  return join(extensionRoot, "windows-toast.ps1");
}

/** Windows PowerShell 5.1, which can load Windows Runtime toasts. Not taken from PATH. */
export function powershellExecutable(systemRoot = process.env.SystemRoot || "C:\\Windows"): string {
  return join(systemRoot, "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** Argument vector. The script path stays one argument, including spaces. */
export function toastLaunchArgs(scriptPath: string): string[] {
  return ["-NoProfile", "-NonInteractive", "-ExecutionPolicy", "Bypass", "-File", scriptPath];
}

export function interpretToastResult(code: number | null, output: string, spawnError?: string): OsNoticeResult {
  if (spawnError) return { ok: false, submitted: false, detail: redact(spawnError).slice(0, 240) };
  const detail = redact(output).replace(/\s+/g, " ").trim().slice(0, 240);
  const submitted = detail.includes("TOAST_SHOWN");
  return {
    ok: submitted && code === 0,
    submitted,
    detail: detail || `exit ${code ?? "unknown"}`,
  };
}

/** Fall back only when Windows did not accept a toast. A submitted toast must not be repeated. */
export function shouldUseEditorFallback(result: OsNoticeResult): boolean {
  return !result.submitted;
}

function redact(value: string): string {
  return value.replace(/Bearer\s+\S+/gi, "Bearer [redacted]").replace(/eyJ[A-Za-z0-9_-]{10,}/g, "[redacted]");
}

/** Native Windows toast. Non-Windows hosts return not-windows and do not spawn a shell. */
export function showBackgroundNotice(
  scriptPath: string,
  body: string,
  launch: string,
  deps: { platform?: NodeJS.Platform; spawn?: ToastSpawn; powershell?: string; exists?: (path: string) => boolean } = {},
): Promise<OsNoticeResult> {
  const platform = deps.platform ?? process.platform;
  if (platform !== "win32") return Promise.resolve({ ok: false, submitted: false, detail: "not-windows" });
  const text = body.replace(/\s+/g, " ").trim().slice(0, 180);
  if (!text) return Promise.resolve({ ok: false, submitted: false, detail: "empty" });
  const exists = deps.exists ?? existsSync;
  if (!exists(scriptPath)) return Promise.resolve({ ok: false, submitted: false, detail: "script-missing" });
  const command = deps.powershell ?? powershellExecutable();
  const launchProcess = deps.spawn ?? (spawn as ToastSpawn);
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result: OsNoticeResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };
    let output = "";
    let child: ReturnType<ToastSpawn>;
    try {
      child = launchProcess(command, toastLaunchArgs(scriptPath), {
        windowsHide: true,
        shell: false,
        env: {
          ...process.env,
          DC_NOTICE_TITLE: "DevConnect",
          DC_NOTICE_BODY: text,
          DC_NOTICE_LAUNCH: launch,
          DC_NOTICE_TARGET: process.execPath,
        },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "spawn failed";
      finish(interpretToastResult(null, "", message));
      return;
    }
    const timer = setTimeout(() => {
      const partial = interpretToastResult(null, output);
      if (!partial.submitted) child.kill();
      finish(partial.submitted ? { ...partial, ok: true } : { ok: false, submitted: false, detail: partial.detail || "timeout" });
    }, 20000);
    child.stdout?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.stderr?.on("data", (chunk: Buffer) => {
      output += chunk.toString("utf8");
    });
    child.on("error", (error) => {
      clearTimeout(timer);
      finish(interpretToastResult(null, output, error.message));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      finish(interpretToastResult(code, output));
    });
  });
}
