import { readFileSync } from "fs";
import { join } from "path";
import { describe, expect, test } from "bun:test";
import {
  interpretToastResult,
  powershellExecutable,
  shouldUseEditorFallback,
  showBackgroundNotice,
  toastLaunchArgs,
  windowsToastScriptPath,
  type ToastSpawn,
} from "../src/extension/os-notice";

const scriptSource = readFileSync(join(import.meta.dir, "../windows-toast.ps1"), "utf8");

function fakeSpawn(output: string, code: number | null, fail?: Error): ToastSpawn {
  return () => {
    const handlers: { error?: (error: Error) => void; close?: (code: number | null) => void; data?: (chunk: Buffer) => void } = {};
    const child = {
      stdout: { on(event: "data", listener: (chunk: Buffer) => void) { if (event === "data") handlers.data = listener; } },
      stderr: { on() { return undefined; } },
      on(event: "error" | "close", listener: ((error: Error) => void) | ((code: number | null) => void)) {
        if (event === "error") handlers.error = listener as (error: Error) => void;
        if (event === "close") handlers.close = listener as (code: number | null) => void;
      },
      kill() { return undefined; },
    };
    queueMicrotask(() => {
      if (fail) handlers.error?.(fail);
      else {
        handlers.data?.(Buffer.from(output));
        handlers.close?.(code);
      }
    });
    return child;
  };
}

describe("windows toast launcher", () => {
  test("resolves the script from the installed extension directory, including spaces", () => {
    const root = String.raw`C:\Users\Ada Lovelace\.vscode\extensions\Bannysukumar2255.devconnect-vscode-extension-0.4.30`;
    const script = windowsToastScriptPath(root);
    expect(script.endsWith("windows-toast.ps1")).toBe(true);
    expect(script).toContain("Ada Lovelace");
    const args = toastLaunchArgs(script);
    expect(args.at(-2)).toBe("-File");
    expect(args.at(-1)).toBe(script);
    expect(args.filter((part) => part === "-File")).toHaveLength(1);
    expect(powershellExecutable("C:\\Windows")).toBe(String.raw`C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe`);
  });

  test("treats TOAST_SHOWN as submitted and a Windows rejection as not submitted", () => {
    const shown = interpretToastResult(0, "TOAST_SHOWN\n");
    expect(shown.ok).toBe(true);
    expect(shown.submitted).toBe(true);
    expect(shouldUseEditorFallback(shown)).toBe(false);
    const rejected = interpretToastResult(2, "TOAST_REJECTED DisabledForUser");
    expect(rejected.ok).toBe(false);
    expect(rejected.submitted).toBe(false);
    expect(shouldUseEditorFallback(rejected)).toBe(true);
    const partial = interpretToastResult(null, "TOAST_SHOWN");
    expect(partial.submitted).toBe(true);
    expect(shouldUseEditorFallback(partial)).toBe(false);
  });

  test("does not spawn on other platforms, when the script is missing, or when PowerShell cannot start", async () => {
    expect(await showBackgroundNotice("C:\\ext\\windows-toast.ps1", "Ada sent you a message", "vscode://example/notice", { platform: "darwin" })).toEqual({
      ok: false,
      submitted: false,
      detail: "not-windows",
    });
    expect((await showBackgroundNotice("C:\\missing\\windows-toast.ps1", "Ada sent you a message", "vscode://example/notice", {
      platform: "win32",
      exists: () => false,
    })).detail).toBe("script-missing");
    const missing = await showBackgroundNotice("C:\\ext\\windows-toast.ps1", "Ada sent you a message", "vscode://example/notice", {
      platform: "win32",
      exists: () => true,
      powershell: "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe",
      spawn: fakeSpawn("", null, Object.assign(new Error("spawn powershell.exe ENOENT"), { code: "ENOENT" })),
    });
    expect(missing.ok).toBe(false);
    expect(missing.submitted).toBe(false);
    expect(missing.detail).toContain("ENOENT");
    expect(shouldUseEditorFallback(missing)).toBe(true);
  });

  test("records a failed process without treating it as a delivered toast", async () => {
    const failed = await showBackgroundNotice("C:\\ext\\windows-toast.ps1", "Ada sent you a message", "vscode://example/notice", {
      platform: "win32",
      exists: () => true,
      spawn: fakeSpawn("TOAST_REJECTED DisabledByGroupPolicy", 2),
    });
    expect(failed.submitted).toBe(false);
    expect(failed.detail).toContain("DisabledByGroupPolicy");
    const shown = await showBackgroundNotice("C:\\ext\\windows-toast.ps1", "Ada sent you a message", "vscode://example/notice", {
      platform: "win32",
      exists: () => true,
      spawn: fakeSpawn("TOAST_SHOWN", 0),
    });
    expect(shown.ok).toBe(true);
    expect(shouldUseEditorFallback(shown)).toBe(false);
  });

  test("the toast script builds XML in the DOM and refuses a disabled notifier", () => {
    expect(scriptSource).toContain("CreateToastNotifier");
    expect(scriptSource).toContain("TOAST_REJECTED");
    expect(scriptSource).toContain("InnerText");
    expect(scriptSource).not.toContain('launch="$');
    expect(scriptSource).not.toContain("$(env:");
    expect(scriptSource).toContain("System.AppUserModel");
    expect(scriptSource).not.toMatch(/Invoke-Expression|iex /);
  });
});
