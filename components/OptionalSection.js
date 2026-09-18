export default function OptionalSection({ title, children, open = false }) {
  return (
    <details className="optional-section" open={open || undefined}>
      <summary>
        {title}
        <span className="optional-section-hint">Optional</span>
      </summary>
      <div className="space-y-3 pt-3">{children}</div>
    </details>
  );
}
