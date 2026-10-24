import { describe, expect, it } from "vitest";
import type { TopicSummary } from "../../../api/contract";
import { countChars, countWords, linkWikilinks, noteHeadings, plainText, resolveTopic, toggleTask, wikilinkHref, wikilinkTarget } from "./note";
import { topicOutline } from "./outline";

function topic(id: string, title: string, aliases: string[] = []): TopicSummary {
  return { id, title, aliases, state: "active", decay: 0.5, ideaCount: 1, summary: "", createdAt: "", lastActiveAt: "", checkInAt: null };
}

describe("noteHeadings", () => {
  it("finds ATX headings with their line numbers, skipping fenced code", () => {
    const body = "# Top\ntext\n## Sub with [[Link|shown]] and **bold**\n```\n# not a heading\n```\n### Deep ###";

    expect(noteHeadings(body)).toEqual([
      { level: 1, text: "Top", line: 1 },
      { level: 2, text: "Sub with shown and bold", line: 3 },
      { level: 3, text: "Deep", line: 7 },
    ]);
  });

  it("ignores hashes without a space and tilde fences", () => {
    expect(noteHeadings("#tag\n~~~\n## inside\n~~~")).toEqual([]);
  });
});

describe("linkWikilinks", () => {
  it("rewrites wikilinks as markdown links, keeping the shown text", () => {
    expect(linkWikilinks("See [[Decay scoring]] and [[Thinking in Systems|systems]].")).toBe(
      `See [Decay scoring](${wikilinkHref("Decay scoring")}) and [systems](${wikilinkHref("Thinking in Systems")}).`,
    );
  });

  it("turns embeds into plain links", () => {
    expect(linkWikilinks("![[Photo]]")).toBe(`[Photo](${wikilinkHref("Photo")})`);
  });

  it("isn't fooled by one-line fences or info strings inside a fence", () => {
    const body = "```inline``` [[A]]\n```\n```js\n[[B]]\n```\n[[C]]";
    const out = linkWikilinks(body);

    expect(out).toContain(`[A](${wikilinkHref("A")})`);
    expect(out).toContain("[[B]]");
    expect(out).toContain(`[C](${wikilinkHref("C")})`);
  });

  it("leaves code spans and fenced blocks alone and never changes line count", () => {
    const body = "`[[not a link]]` [[Yes]]\n```\n[[code]]\n```";
    const out = linkWikilinks(body);

    expect(out).toContain("`[[not a link]]`");
    expect(out).toContain("[[code]]");
    expect(out).toContain(`[Yes](${wikilinkHref("Yes")})`);
    expect(out.split("\n")).toHaveLength(body.split("\n").length);
  });
});

describe("wikilinkTarget", () => {
  it("round-trips titles, keeping any #part for the resolver", () => {
    expect(wikilinkTarget(wikilinkHref("Rust & async #1?"))).toBe("Rust & async #1?");
    expect(wikilinkTarget(wikilinkHref("C#"))).toBe("C#");
    expect(wikilinkTarget(wikilinkHref("Plain"))).toBe("Plain");
    expect(wikilinkTarget("https://example.com")).toBeNull();
    expect(wikilinkTarget("wikilink:%E0%A4%A")).toBeNull();
  });
});

describe("resolveTopic", () => {
  const topics = [topic("a", "Learning async Rust", ["tokio"]), topic("b", "Tokio internals")];

  it("matches titles before aliases, ignoring case", () => {
    expect(resolveTopic("learning ASYNC rust", topics)?.id).toBe("a");
    expect(resolveTopic("Tokio", topics)?.id).toBe("a");
    expect(resolveTopic("tokio internals", topics)?.id).toBe("b");
    expect(resolveTopic("nothing", topics)).toBeUndefined();
    expect(resolveTopic("  ", topics)).toBeUndefined();
  });

  it("ignores runs of whitespace, keeps punctuation, and never resolves a #heading link", () => {
    const named = [topic("c", "C"), topic("cs", "C#"), topic("h", "Open questions")];
    expect(resolveTopic("learning   async\tRust", topics)?.id).toBe("a");
    expect(resolveTopic("C#", named)?.id).toBe("cs");
    expect(resolveTopic("c", named)?.id).toBe("c");
    expect(resolveTopic("#Open questions", named)).toBeUndefined();
  });
});

describe("toggleTask", () => {
  it("flips only the task on the given line", () => {
    const body = "- [ ] one\n- [x] two\nplain\n  1. [X] three";

    expect(toggleTask(body, 1)).toBe("- [x] one\n- [x] two\nplain\n  1. [X] three");
    expect(toggleTask(body, 2)).toBe("- [ ] one\n- [ ] two\nplain\n  1. [X] three");
    expect(toggleTask(body, 4)).toBe("- [ ] one\n- [x] two\nplain\n  1. [ ] three");
    expect(toggleTask(body, 3)).toBe(body);
    expect(toggleTask("> [!todo]\n> - [ ] in a callout", 2)).toBe("> [!todo]\n> - [x] in a callout");
    expect(toggleTask(body, 99)).toBe(body);
  });
});

describe("counts", () => {
  it("counts words like a notes app and characters as a reader sees them", () => {
    expect(countWords("")).toBe(0);
    expect(countWords("It's a **stock** with an out-flow, 2 ways.")).toBe(8);
    expect(countChars("café 👍")).toBe(6);
  });

  it("strips markdown for plain text", () => {
    expect(plainText("**a** [b](http://x) `c` [[d|e]] [[f]]")).toBe("a b c e f");
  });
});

describe("topicOutline", () => {
  it("lists page sections in order with note headings nested under My notes", () => {
    const outline = topicOutline([], "## Plans\n### Soon\n## Done");

    expect(outline.map((o) => `${o.depth}:${o.label}`)).toEqual([
      "0:Current state",
      "0:My notes",
      "1:Plans",
      "2:Soon",
      "1:Done",
      "0:Pinned quotes",
      "0:Timeline",
      "0:Linked mentions",
      "0:Unlinked mentions",
    ]);
    expect(outline[2].section).toBe("note-L1");
  });
});
