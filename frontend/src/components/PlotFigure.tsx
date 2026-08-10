// One analysis chart in the results modal: a caption, a download button,
// and the plot image itself (a base64 PNG returned by the backend).
function PlotFigure({
  caption,
  base64,
  filename,
  onDownload,
}: {
  caption: string;
  base64: string;
  filename: string;
  onDownload: (base64: string, filename: string) => void;
}) {
  return (
    <figure>
      <figcaption className="flex items-center justify-between mb-2.5">
        <span className="text-sm font-semibold text-slate-600 dark:text-slate-300 font-stack-headline">
          {caption}
        </span>
        <button
          onClick={() => onDownload(base64, filename)}
          className="text-xs font-medium text-[#98c1d9] hover:bg-[#98c1d9]/10 rounded-full px-3 py-1 transition"
        >
          ↓ Download
        </button>
      </figcaption>
      <img
        src={`data:image/png;base64,${base64}`}
        className="w-full rounded-sm ring-1 ring-slate-100"
      />
    </figure>
  );
}

export default PlotFigure;
