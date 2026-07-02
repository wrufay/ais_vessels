function ClosePanelBtn({
  onClick,
  displayType = "chevron",
}: {
  onClick: ((e: React.MouseEvent) => void) | (() => void);
  displayType?: "cross" | "chevron" | "chevron-left";
}) {
  return (
    <button
      onClick={(e) => onClick(e)}
      className="text-slate-600 opacity-80 hover:opacity-100 hover:scale-105 active:scale-95 transition"
    >
      {displayType === "cross" ? (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      ) : displayType === "chevron-left" ? (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="15 18 9 12 15 6" />
        </svg>
      ) : (
        <svg
          className="w-4 h-4"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <polyline points="9 18 15 12 9 6" />
        </svg>
      )}
    </button>
  );
}

export default ClosePanelBtn;
