import type { ReactNode } from 'react';

export function Section({
  title,
  sub,
  children,
  actions,
}: {
  title: string;
  sub?: ReactNode;
  children: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <section className="section">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="section-title">{title}</h2>
          {sub ? <p className="section-sub">{sub}</p> : <div className="mb-4" />}
        </div>
        {actions}
      </div>
      {children}
    </section>
  );
}
