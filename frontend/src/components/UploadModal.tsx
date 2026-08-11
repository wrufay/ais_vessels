// The "Upload data" modal, opened from the icon bar -- lets the user add a
// custom region (Shapefile) or mooring locations (CSV). The actual upload
// handling (parsing, adding to state) stays in Map.tsx since it's also
// triggered from the inline upload inputs inside the Regions/Mooring panels
// themselves -- this component only owns the modal's own markup.
function UploadModal({
  onClose,
  onShapefileUpload,
  onMooringUpload,
  onDownloadMooringTemplate,
}: {
  onClose: () => void;
  onShapefileUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onMooringUpload: (e: React.ChangeEvent<HTMLInputElement>) => void;
  onDownloadMooringTemplate: () => void;
}) {
  return (
    <div className="absolute inset-0 z-50 flex items-center justify-center bg-black/30 backdrop-blur-sm" onClick={onClose}>
      <div className="bg-white dark:bg-slate-900 rounded-xl shadow-xl w-[480px] max-w-[90vw] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between px-6 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800">
          <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-200">Upload data</h2>
          <button onClick={onClose} className="text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition">
            <svg className="w-4 h-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
        <div className="px-6 py-5 flex flex-col gap-4">
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#3d5a80] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <polygon points="3,6 9,3 15,6 21,3 21,18 15,21 9,18 3,21" />
              </svg>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Region / Shapefile</span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">Upload a zipped Shapefile (.zip) to define a custom region and analyse vessel activity within it.</p>
            <label className="self-start cursor-pointer px-3 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition">
              Choose .zip
              <input type="file" className="hidden" accept=".zip" onChange={onShapefileUpload} />
            </label>
          </div>
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg p-4 flex flex-col gap-2.5">
            <div className="flex items-center gap-2">
              <svg className="w-4 h-4 text-[#3d5a80] shrink-0" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="5" r="2"/><line x1="12" y1="7" x2="12" y2="19"/><line x1="8" y1="19" x2="16" y2="19"/>
              </svg>
              <span className="text-xs font-semibold text-slate-600 dark:text-slate-300">Mooring data</span>
            </div>
            <p className="text-xs text-slate-400 dark:text-slate-500 leading-relaxed">Upload mooring locations to display on the map. Use the CSV template for the correct format.</p>
            <div className="flex items-center gap-2">
              <label className="cursor-pointer px-3 py-1.5 rounded-md bg-[#3d5a80] text-white text-xs font-medium hover:bg-[#2e4460] transition">
                Choose .csv
                <input type="file" className="hidden" accept=".csv" onChange={onMooringUpload} />
              </label>
              <button onClick={onDownloadMooringTemplate} className="px-3 py-1.5 rounded-md border border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 text-xs font-medium hover:border-slate-400 dark:hover:border-slate-600 hover:text-slate-700 dark:hover:text-slate-200 transition">
                Download template
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default UploadModal;
