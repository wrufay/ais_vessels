function PanelHeader({
  name,
  description,
  className = "mb-6",
}: {
  name: string;
  description: string;
  className?: string;
}) {
  return (
    <div className={className}>
      <h2 className="text-sm font-semibold text-slate-700">{name}</h2>
      <p className="text-gray-400 text-xs font-fraunces">{description}</p>
    </div>
  );
}

export default PanelHeader;
