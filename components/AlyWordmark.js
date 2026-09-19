/** The rule measures the letters, not the surface's font size. */
export default function AlyWordmark({ as: Tag = "span", className = "", style }) {
  return (
    <Tag className={`aly-word font-display ${className}`} style={style} aria-label="Alyeska">
      <span className="aly-word-letters" aria-hidden="true">
        <span className="aly-word-prefix">Aly</span>eska
      </span>
    </Tag>
  );
}
