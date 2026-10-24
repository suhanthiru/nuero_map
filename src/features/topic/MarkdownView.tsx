import { Children, createContext, isValidElement, useContext, useMemo, useState, type MouseEvent, type ReactNode } from "react";
import Markdown, { defaultUrlTransform, type Components, type ExtraProps } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  AlertTriangle,
  Bug,
  Check,
  ChevronDown,
  CircleCheck,
  ClipboardList,
  Flame,
  HelpCircle,
  Info,
  List,
  Pencil,
  Quote,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { isExternalUrl, openExternal } from "../../shared/links/openExternal";
import { calloutKind, rehypeCallouts, type CalloutKind } from "./model/callouts";
import { isTopicTarget, type LinkTarget } from "./model/linkTarget";
import { linkWikilinks, resolveTopic, WIKILINK_SCHEME, wikilinkTarget } from "./model/note";
import { TopicPreview } from "./TopicPreview";
import s from "./Markdown.module.css";

const CALLOUT_ICON: Readonly<Record<CalloutKind, LucideIcon>> = {
  note: Pencil,
  abstract: ClipboardList,
  info: Info,
  todo: CircleCheck,
  tip: Flame,
  success: Check,
  question: HelpCircle,
  warning: AlertTriangle,
  failure: X,
  danger: Zap,
  bug: Bug,
  example: List,
  quote: Quote,
};

interface Props {
  readonly body: string;
  /** What `[[links]]` can point at: topics, and notes where the page offers them. */
  readonly topics: readonly LinkTarget[];
  /** Opens a link target by its id (a topic id, or `note:<id>`). */
  readonly onOpenTopic: (topicId: string, e: MouseEvent) => void;
  /** Called with the 1-based source line of a task whose checkbox was clicked. */
  readonly onToggleTask?: (line: number) => void;
}

interface CalloutState {
  readonly open: boolean;
  readonly foldable: boolean;
  readonly toggle: () => void;
  readonly type: string;
}

const CalloutContext = createContext<CalloutState | null>(null);

function prop(node: ExtraProps["node"], name: string): string | undefined {
  const v = node?.properties?.[name];
  return typeof v === "string" ? v : undefined;
}

function Callout({ kind, type, fold, children }: { readonly kind: CalloutKind; readonly type: string; readonly fold: string; readonly children: ReactNode }) {
  const [open, setOpen] = useState(fold !== "-");
  return (
    <CalloutContext.Provider value={{ open, foldable: fold !== "", toggle: () => setOpen((o) => !o), type }}>
      <div className={s.callout} data-callout={kind} role="note">
        {children}
      </div>
    </CalloutContext.Provider>
  );
}

function CalloutTitle({ kind, children }: { readonly kind: CalloutKind; readonly children: ReactNode }) {
  const ctx = useContext(CalloutContext);
  const Icon = CALLOUT_ICON[kind];
  const hasText = Array.isArray(children) ? children.length > 0 : !!children;
  const label = hasText ? children : (ctx?.type ?? kind).replace(/^./, (c) => c.toUpperCase());
  if (ctx?.foldable) {
    return (
      <button type="button" className={s.calloutTitle} aria-expanded={ctx.open} onClick={ctx.toggle}>
        <Icon size={17} aria-hidden /> <span>{label}</span>
        <ChevronDown size={16} aria-hidden className={s.calloutFold} />
      </button>
    );
  }
  return (
    <div className={s.calloutTitle}>
      <Icon size={17} aria-hidden /> <span>{label}</span>
    </div>
  );
}

function CalloutBody({ children }: { readonly children: ReactNode }) {
  const ctx = useContext(CalloutContext);
  return (
    <div className={s.calloutBody} hidden={ctx ? !ctx.open : false}>
      {children}
    </div>
  );
}

/** What the renderer's components need from the page, passed by context so the components stay stable. */
interface NoteEnv {
  readonly topics: readonly LinkTarget[];
  readonly onOpenTopic: Props["onOpenTopic"];
  readonly onToggleTask?: Props["onToggleTask"];
}

const NoteEnvContext = createContext<NoteEnv>({ topics: [], onOpenTopic: () => undefined });
/** A task's own text, so its checkbox can be named after it. */
const TaskLabelContext = createContext<string>("");

/** Topic links resolve by title or alias at render time, so renaming a topic in the app doesn't break old notes silently. */
function TopicLink({ target, children }: { readonly target: string; readonly children: ReactNode }) {
  const { topics, onOpenTopic } = useContext(NoteEnvContext);
  const topic = resolveTopic(target, topics) ?? resolveTopic(target.split("#")[0], topics);
  if (!topic) {
    return (
      <span className={`${s.link} ${s.unresolved}`} title={`Nothing called "${target}" yet`}>
        {children}
      </span>
    );
  }
  const button = (trigger: object) => (
    <button type="button" className={s.link} {...trigger} onClick={(e) => onOpenTopic(topic.id, e)} onAuxClick={(e) => onOpenTopic(topic.id, e)}>
      {children}
    </button>
  );
  return isTopicTarget(topic) ? <TopicPreview topic={topic}>{button}</TopicPreview> : button({});
}

/** Only links may use the wikilink scheme (an image pointing at one would just be broken). */
function urlTransform(url: string, key: string): string {
  return key === "href" && url.startsWith(WIKILINK_SCHEME) ? url : defaultUrlTransform(url);
}

function headingTag(level: number): "h3" | "h4" | "h5" | "h6" {
  return (["h3", "h4", "h5", "h6"] as const)[Math.min(3, Math.max(0, level - 1))];
}

function lineOf(node: ExtraProps["node"]): number | undefined {
  return node?.position?.start.line;
}

const HEADING_CLASS = [s.h1, s.h2, s.h3, s.h4];

function heading(level: number) {
  return function Heading({ node, children }: { readonly children?: ReactNode } & ExtraProps) {
    const Tag = headingTag(level);
    return (
      <Tag className={HEADING_CLASS[Math.min(3, level - 1)]} data-outline={`note-L${lineOf(node)}`}>
        {children}
      </Tag>
    );
  };
}

type HastNode = NonNullable<ExtraProps["node"]>["children"][number];

/** Text of a list item, leaving out the lists nested under it. */
function ownText(nodes: readonly HastNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "text") return n.value;
      if (n.type !== "element" || n.tagName === "ul" || n.tagName === "ol") return "";
      return ownText(n.children);
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim();
}

function Link({ href = "", children }: { readonly href?: string; readonly children?: ReactNode }) {
  const target = wikilinkTarget(href);
  if (target !== null) return <TopicLink target={target}>{children}</TopicLink>;
  if (!isExternalUrl(href)) return <span>{children}</span>;
  return (
    <a
      href={href}
      className={`${s.link} ${s.external}`}
      onClick={(e) => {
        e.preventDefault();
        openExternal(href);
      }}
    >
      {children}
    </a>
  );
}

function ListItem({ node, className, children }: { readonly className?: string; readonly children?: ReactNode } & ExtraProps) {
  if (!className?.includes("task-list-item")) return <li>{children}</li>;
  const checked = node?.children.some((c) => c.type === "element" && c.tagName === "input" && c.properties?.checked === true);
  // Strike through the item's own text, not the sub-items nested under it.
  const parts = Children.toArray(children);
  const nested = parts.filter((c) => isValidElement(c) && (c.type === "ul" || c.type === "ol"));
  const own = parts.filter((c) => !nested.includes(c));
  return (
    <li className={s.task} data-line={lineOf(node)}>
      <TaskLabelContext.Provider value={ownText(node?.children ?? [])}>
        <span className={checked ? s.taskDone : undefined}>{own}</span>
      </TaskLabelContext.Provider>
      {nested}
    </li>
  );
}

function TaskBox({ node, checked, type }: { readonly checked?: boolean; readonly type?: string } & ExtraProps) {
  const { onToggleTask } = useContext(NoteEnvContext);
  const label = useContext(TaskLabelContext);
  if (type !== "checkbox") return null;
  return (
    <input
      type="checkbox"
      className={s.checkbox}
      checked={!!checked}
      disabled={!onToggleTask}
      aria-label={label || "Task"}
      onChange={(e) => {
        const line = Number(e.currentTarget.closest("li")?.dataset.line ?? lineOf(node));
        if (line && onToggleTask) onToggleTask(line);
      }}
    />
  );
}

function BlockQuote({ node, children }: { readonly children?: ReactNode } & ExtraProps) {
  const kind = prop(node, "dataCallout");
  if (!kind) return <blockquote>{children}</blockquote>;
  return (
    <Callout kind={calloutKind(kind)} type={prop(node, "dataCalloutType") ?? kind} fold={prop(node, "dataCalloutFold") ?? ""}>
      {children}
    </Callout>
  );
}

function Div({ node, children }: { readonly children?: ReactNode } & ExtraProps) {
  const title = prop(node, "dataCalloutTitle");
  if (title) return <CalloutTitle kind={calloutKind(title)}>{children}</CalloutTitle>;
  if (prop(node, "dataCalloutBody")) return <CalloutBody>{children}</CalloutBody>;
  return <div>{children}</div>;
}

/** Module-level so React keeps each rendered block (and its fold state, focus) across renders. */
const COMPONENTS: Components = {
  h1: heading(1),
  h2: heading(2),
  h3: heading(3),
  h4: heading(4),
  h5: heading(5),
  h6: heading(6),
  a: Link,
  li: ListItem,
  input: TaskBox,
  blockquote: BlockQuote,
  div: Div,
};

const REMARK = [remarkGfm];
const REHYPE = [rehypeCallouts];

/**
 * Reading view of a note. Headings render two levels down (the page owns h1/h2) and
 * carry `data-outline="note-L<line>"` so the outline can jump to them.
 */
export function MarkdownView({ body, topics, onOpenTopic, onToggleTask }: Props) {
  const env = useMemo(() => ({ topics, onOpenTopic, onToggleTask }), [topics, onOpenTopic, onToggleTask]);
  const markdown = useMemo(() => linkWikilinks(body), [body]);
  return (
    <NoteEnvContext.Provider value={env}>
      <div className={s.markdown}>
        <Markdown remarkPlugins={REMARK} rehypePlugins={REHYPE} components={COMPONENTS} urlTransform={urlTransform}>
          {markdown}
        </Markdown>
      </div>
    </NoteEnvContext.Provider>
  );
}
