function Legend() {
  return (
    <div className="absolute bottom-0 z-10 bg-[#fcfffd]/90 backdrop-blur-md rounded-r-lg rounded-b-none shadow-sm px-2.5 py-2 text-[10px] w-16">
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
