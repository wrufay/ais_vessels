import PanelHeader from "./PanelHeader";

// The Impacts side-panel's content (everything inside <SidePanel>, which
// Map.tsx still renders directly since its open/width/registerTarget props
// are shared across all 5 side panels now). First pass -- just the entry
// point into the parameter-input modal; results display isn't built yet.
function ImpactsPanel({ onOpenModal }: { onOpenModal: () => void }) {
  return (
    <div className="px-5 pt-8 shrink-0">
      <PanelHeader
        name="Impacts"
        description="Calculate and view noise impacts results."
      />
      <button
        onClick={onOpenModal}
        className="px-3 py-1.5 rounded-full bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition"
      >
        Input parameters
      </button>
    </div>
  );
}

export default ImpactsPanel;
