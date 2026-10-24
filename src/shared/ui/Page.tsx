import type { ReactNode } from "react";
import s from "./Page.module.css";

interface Props {
  readonly eyebrow?: string;
  readonly title: ReactNode;
  readonly actions?: ReactNode;
  readonly children: ReactNode;
  readonly wide?: boolean;
}

export function Page({ eyebrow, title, actions, children, wide }: Props) {
  return (
    <div className={wide ? `${s.page} ${s.wide}` : s.page}>
      <header className={s.header}>
        <div>
          {eyebrow && <p className={s.eyebrow}>{eyebrow}</p>}
          <h1 className={s.title}>{title}</h1>
        </div>
        {actions && <div className={s.actions}>{actions}</div>}
      </header>
      {children}
    </div>
  );
}

export function EmptyState({ title, children }: { readonly title: string; readonly children?: ReactNode }) {
  return (
    <div className={s.empty}>
      <p className={s.emptyTitle}>{title}</p>
      {children && <div className={s.emptyBody}>{children}</div>}
    </div>
  );
}
