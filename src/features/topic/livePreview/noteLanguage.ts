import { markdownKeymap, markdownLanguage } from "@codemirror/lang-markdown";
import { Language, LanguageSupport } from "@codemirror/language";
import { Prec } from "@codemirror/state";
import { keymap } from "@codemirror/view";
import type { MarkdownParser } from "@lezer/markdown";
import { wikilinkSyntax } from "./wikilinkSyntax";

/**
 * GFM markdown plus `[[wikilinks]]`. Built from `markdownLanguage` (same language data, so
 * markdown's Enter/Backspace list commands recognise it) rather than `markdown()`, which
 * would also bundle the HTML, CSS and JavaScript languages for embedded code.
 */
const noteLanguage = new Language(markdownLanguage.data, (markdownLanguage.parser as MarkdownParser).configure(wikilinkSyntax), [], "markdown");

export function noteMarkdown(): LanguageSupport {
  return new LanguageSupport(noteLanguage, [Prec.high(keymap.of(markdownKeymap))]);
}
