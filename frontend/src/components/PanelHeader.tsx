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
      <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-300">{name}</h2>
      <p className="text-slate-400 dark:text-slate-500 text-xs font-stack-headline">{description}</p>
    </div>
  );
}

export default PanelHeader;
