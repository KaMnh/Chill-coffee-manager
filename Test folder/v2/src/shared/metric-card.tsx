export function MetricCard({
  label,
  value,
  tone,
  icon
}: {
  label: string;
  value: string;
  tone?: "good" | "warn" | "danger";
  icon?: string;
}) {
  return (
    <article className={`metricCard ${tone ?? ""}`}>
      <div className="metricTop">
        <span>{label}</span>
        {icon && (
          <b className="metricIcon" aria-hidden="true">
            {icon}
          </b>
        )}
      </div>
      <strong>{value}</strong>
    </article>
  );
}
