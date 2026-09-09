import type { ReactNode } from "react";
import "../../../styles/pt-hub-analytics.css";
import "../../../styles/pt-hub-leads.css";

export function LeadPanel({
  title,
  description,
  children,
  actions,
  contentClassName = "",
  className = "",
}: {
  title: string;
  description?: string;
  children: ReactNode;
  actions?: ReactNode;
  contentClassName?: string;
  className?: string;
  module?: string;
}) {
  return (
    <section className={`analytics-panel lead-panel ${className}`}>
      <header>
        <div>
          <h2>{title}</h2>
          {description && <p>{description}</p>}
        </div>
        {actions}
      </header>
      <div className={`lead-panel-content ${contentClassName}`}>{children}</div>
    </section>
  );
}
