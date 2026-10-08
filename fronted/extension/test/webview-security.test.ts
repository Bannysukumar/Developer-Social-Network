import { describe, expect, test } from "bun:test";
import type { Webview } from "vscode";
import { emptyHostState, renderWebview } from "../src/extension/webview";

function render(): string {
  return renderWebview({ cspSource: "vscode-webview://local" } as Webview, emptyHostState());
}

describe("Webview security shell", () => {
  test("uses a fresh nonce and a restrictive CSP", () => {
    const first = render();
    const second = render();
    const nonce = first.match(/script-src 'nonce-([^']+)'/);
    expect(nonce?.[1]).toBeDefined();
    expect(first).toContain(`<script nonce="${nonce?.[1]}">`);
    expect(first).toContain("var(--vscode-foreground)");
    expect(first).toContain("var(--vscode-sideBar-background)");
    expect(first).toContain("@media (forced-colors: active)");
    expect(first).toContain("default-src 'none'");
    expect(first).toContain("connect-src 'none'");
    expect(first).not.toContain("unsafe-inline");
    expect(first.match(/script-src 'nonce-([^']+)'/)?.[1]).not.toBe(second.match(/script-src 'nonce-([^']+)'/)?.[1]);
  });

  test("includes splash, auth, and protected screens without remote scripts", () => {
    const html = render();
    expect(html).toContain("Connect. Collaborate. Code.");
    for (const screen of ["splash", "login", "signup", "forgot", "reset", "home", "search", "friends", "messages", "notifications", "profile", "settings"]) {
      expect(html).toContain(`data-screen="${screen}"`);
    }
    expect(html).toContain('"phase":"checking"');
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/https?:\/\//i);
    expect(html).toContain("← Messages");
    expect(html).toContain("Start the conversation by saying hello.");
    expect(html).not.toContain("No messages yet. Say hello.");
  });
});
