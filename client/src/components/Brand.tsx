export function Brand({
  onClick,
  onNavigate,
}: {
  onClick?: () => void;
  onNavigate?: () => void;
}) {
  const content = (
    <>
      <span className="brand-mark" aria-hidden="true">
        <i />
        <i />
      </span>
      <span>Strangely</span>
    </>
  );
  return onClick ? (
    <button
      className="brand"
      type="button"
      onClick={onClick}
      aria-label="Strangely home"
    >
      {content}
    </button>
  ) : (
    <a
      className="brand"
      href={onNavigate ? '#home' : '/#home'}
      aria-label="Strangely home"
      onClick={onNavigate}
    >
      {content}
    </a>
  );
}
