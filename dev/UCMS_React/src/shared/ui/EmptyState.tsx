interface EmptyStateProps {
  title: string;
  body?: string;
}

export function EmptyState({ title, body }: EmptyStateProps) {
  return (
    <div className="empty-state">
      <h2>{title}</h2>
      {body ? <p>{body}</p> : null}
    </div>
  );
}
