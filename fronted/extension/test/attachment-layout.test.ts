import { describe, expect, test } from "bun:test";
import { attachmentCaption, fileKind, fileTypeLabel } from "../src/extension/attachment-layout";
import { emptyHostState, renderWebview } from "../src/extension/webview";

describe("attachment layout", () => {
  test("a filename used as the message text is not repeated under the preview", () => {
    expect(attachmentCaption("John Wick (Keanu Reeves).jpeg", ["John Wick (Keanu Reeves).jpeg"])).toBe("");
    expect(attachmentCaption("notes.pdf, photo.png", ["notes.pdf", "photo.png"])).toBe("");
    expect(attachmentCaption("look at this", ["photo.png"])).toBe("look at this");
  });

  test("images and videos are identified from the mime type", () => {
    expect(fileKind("image/jpeg")).toBe("image");
    expect(fileKind("video/mp4")).toBe("video");
    expect(fileKind("application/pdf")).toBe("file");
    expect(fileTypeLabel("application/pdf", "report.pdf")).toBe("PDF");
    expect(fileTypeLabel("video/mp4", "clip.mp4")).toBe("Video");
    expect(fileTypeLabel("application/zip", "notes.zip")).toBe("Archive");
  });

  test("the chat stylesheet keeps media bubbles compact and text bubbles unchanged", () => {
    const html = renderWebview({ cspSource: "https://example.invalid" } as never, emptyHostState());
    expect(html).toContain(".msg { max-width: 78%");
    expect(html).toContain(".msg.media { width: max-content; max-width: min(320px, 100%)");
    expect(html).toContain("object-fit: contain");
    expect(html).toContain("max-height: 240px");
    expect(html).toContain('preload="none"');
    expect(html).not.toContain("autoplay");
    expect(html).toContain("video-stage");
    expect(html).toContain("file-card");
  });
});
