import { describe, expect, it } from "vitest";

import { escapeHtml } from "./print-shell.js";

describe("escapeHtml", () => {
  it("escapes every character that can end an attribute or open a tag", () => {
    expect(escapeHtml(`<a href='x' title="y">&</a>`)).toBe(
      "&lt;a href=&#39;x&#39; title=&quot;y&quot;&gt;&amp;&lt;/a&gt;",
    );
  });
});
