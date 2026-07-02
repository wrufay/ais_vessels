function Legend() {
  return (
    <div className="absolute bottom-4 left-4 z-10 bg-white/90 backdrop-blur-md rounded-sm shadow-lg shadow-slate-900/5 px-2.5 py-2 text-[10px] w-[72px]">
      <div className="font-semibold mb-1.5 text-slate-500">Speed (kn)</div>
      <div className="flex items-center gap-1.5 mb-1 text-slate-400">
        <span className="w-2 h-2 rounded-full bg-[#0a8754] shrink-0" />
        &lt; 3
      </div>
      <div className="flex items-center gap-1.5 mb-1 text-slate-400">
        <span className="w-2 h-2 rounded-full bg-[#ffc857] shrink-0" />
        3 – 10
      </div>
      <div className="flex items-center gap-1.5 text-slate-400">
        <span className="w-2 h-2 rounded-full bg-[#ee6c4d] shrink-0" />
        &gt; 10
      </div>
    </div>
  );
}

export default Legend;
