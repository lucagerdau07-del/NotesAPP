import { describe, expect, it } from "vitest";
import { markdownToHtml, richHtmlOf, sanitizeRichHtml, shortcutCommand } from "../src/ink/richText.js";
import { createInkDocument, createInkHistory, executeInkCommand } from "../src/ink/inkDocument.js";

describe("sanitizeRichHtml", () => {
  it("keeps formatting and drops anything that could run or load", () => {
    const html = sanitizeRichHtml(
      '<h1 onclick="x()">T</h1><b>b</b><img src=x onerror="alert(1)"><script>alert(2)</script>' +
        '<a href="javascript:alert(3)">j</a><a href="https://a.de" target="_blank">ok</a>' +
        '<span style="color: red; background-image: url(x); font-size: 40px">c</span>' +
        '<ul data-check=""><li data-checked="true" class="x">done</li></ul><table><tr><td>cell</td></tr></table>',
    );
    expect(html).toBe(
      "<h1>T</h1><b>b</b><a>j</a><a href=\"https://a.de\">ok</a><span style=\"color: red\">c</span>" +
        '<ul data-check=""><li data-checked="true">done</li></ul>cell',
    );
  });

  it("strips colors from pasted content when asked", () => {
    expect(sanitizeRichHtml('<font color="#000">a</font><span style="background-color: white">b</span>', { colors: false })).toBe("ab");
  });
});

describe("rich text seeds", () => {
  it("turns the agent's markdown into formatting and leaves math alone", () => {
    expect(markdownToHtml("**Begriff**: _kurz_ $a_1 * b_2$ <x>")).toBe("<b>Begriff</b>: <i>kurz</i> $a_1 * b_2$ &lt;x&gt;");
  });

  it("escapes plain text instead of parsing it", () => {
    expect(richHtmlOf({ text: "<b>nicht fett</b>" })).toBe("&lt;b&gt;nicht fett&lt;/b&gt;");
  });
});

describe("shortcutCommand", () => {
  const key = (init) => ({ ctrlKey: false, metaKey: false, shiftKey: false, altKey: false, key: "", code: "", ...init });

  it("maps Google Docs shortcuts by physical key", () => {
    expect(shortcutCommand(key({ ctrlKey: true, shiftKey: true, key: "/", code: "Digit7" }))).toBe("insertOrderedList");
    expect(shortcutCommand(key({ ctrlKey: true, altKey: true, code: "Digit2" }))).toBe("h2");
    expect(shortcutCommand(key({ altKey: true, shiftKey: true, code: "Digit5" }))).toBe("strikeThrough");
  });

  it("leaves AltGr alone, which types ² and ³", () => {
    expect(shortcutCommand(key({ ctrlKey: true, altKey: true, code: "Digit2", getModifierState: (m) => m === "AltGraph" }))).toBeNull();
  });
});

describe("update-object", () => {
  it("drops stale formatting when only the plain text is replaced", () => {
    const doc = createInkDocument("d", 1);
    let history = createInkHistory(doc);
    const object = { id: "t", pageId: doc.pages[0].id, type: "text", x: 0, y: 0, width: 100, height: 30, text: "alt", html: "<b>alt</b>" };
    history = executeInkCommand(history, { type: "add-object", object });
    history = executeInkCommand(history, { type: "update-object", objectId: "t", changes: { text: "neu" } });
    expect(history.present.objects[0].html).toBe("");
    history = executeInkCommand(history, { type: "update-object", objectId: "t", changes: { text: "x", html: "<i>x</i>" } });
    expect(history.present.objects[0].html).toBe("<i>x</i>");
  });
});
