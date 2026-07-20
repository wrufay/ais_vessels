const PAD = 6;

/**
 * Full-screen dark/blurred backdrop with a rectangular cutout over `rect`.
 * The cutout is a clip-path hole, not a separate layer, so the target
 * element underneath stays perfectly crisp and (since clip-path clips hit
 * testing too) fully clickable — no plain floating box over a dark screen.
 */
function TourOverlay({ rect }: { rect: DOMRect | null }) {
  const clipPath = rect
    ? `polygon(evenodd, 0 0, 100% 0, 100% 100%, 0 100%, 0 0, ` +
      `${rect.left - PAD}px ${rect.top - PAD}px, ` +
      `${rect.left - PAD}px ${rect.bottom + PAD}px, ` +
      `${rect.right + PAD}px ${rect.bottom + PAD}px, ` +
      `${rect.right + PAD}px ${rect.top - PAD}px, ` +
      `${rect.left - PAD}px ${rect.top - PAD}px)`
    : undefined;

  return (
    <>
      <div className="tour-overlay fixed inset-0 z-[100] animate-fade-in" style={{ clipPath }} />
      {rect && (
        <div
          className="tour-spotlight-ring fixed z-[101] pointer-events-none"
          style={{
            left: rect.left - PAD,
            top: rect.top - PAD,
            width: rect.width + PAD * 2,
            height: rect.height + PAD * 2,
          }}
        />
      )}
    </>
  );
}

export default TourOverlay;
