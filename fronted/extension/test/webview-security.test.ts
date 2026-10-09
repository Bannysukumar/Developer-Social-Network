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
    const script = html.match(/<script nonce="[^"]+">([\s\S]*)<\/script>/)?.[1];
    expect(script).toBeDefined();
    new Function(script ?? "");
    expect(html).toContain("justify-content: flex-start");
    expect(html).not.toMatch(/#message-list\s*\{[^}]*justify-content:\s*(center|flex-end)/);
    expect(html).toContain("Start the conversation by saying hello.");
    expect(html).toContain("image-bubble");
    expect(html).toContain("file-card");
    expect(html).toContain("img-src vscode-webview://local data:");
    expect(html).toContain("Photos and images");
    expect(html).toContain("Documents and archives");
    expect(html).toContain("Browse files");
    expect(html).toContain("attach-menu");
    expect(html).toContain("prefers-reduced-motion: no-preference");
    expect(html).toContain("aria-label=\"Uploading\"");
    expect(html).toContain("pointer-events: none");
    expect(html).toContain("event.target instanceof Element");
    expect(html.match(/document\.body\.addEventListener\("click"/g)?.length).toBe(1);
    expect(html).not.toContain("View image");
    expect(html).not.toContain("No messages yet. Say hello.");
  });
});
