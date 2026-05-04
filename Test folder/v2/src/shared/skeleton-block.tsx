export function SkeletonBlock({ rows = 3 }: { rows?: number }) {
  return (
    <div className="skeletonBlock" aria-hidden="true">
      {Array.from({ length: rows }).map((_, index) => (
        <span key={index} />
      ))}
    </div>
  );
}
