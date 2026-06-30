function Legend() {
  return (
    <div className="absolute bottom-5 left-5 z-10 bg-white/90 backdrop-blur-md rounded-sm shadow-lg shadow-slate-900/5 ring-1 ring-slate-900/5 px-4 py-3 text-xs">
      <div className="font-semibold mb-2 text-slate-600">Speed (knots)</div>
      <div className="flex items-center gap-2 mb-1 text-slate-500">
        <span className="w-2.5 h-2.5 rounded-full bg-[#0a8754] inline-block" />
        &lt; 3
      </div>
      <div className="flex items-center gap-2 mb-1 text-slate-500">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ffc857] inline-block" />
        3 – 10
      </div>
      <div className="flex items-center gap-2 text-slate-500">
        <span className="w-2.5 h-2.5 rounded-full bg-[#ee6c4d] inline-block" />
        &gt; 10
      </div>
    </div>
  );
}

export default Legend;
