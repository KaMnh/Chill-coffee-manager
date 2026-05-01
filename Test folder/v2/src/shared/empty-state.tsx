export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="emptyState">
      <strong>{title}</strong>
      {description && <span>{description}</span>}
    </div>
  );
}
