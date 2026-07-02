import type { ReactNode } from "react";

function IconBarButton({
  label,
  title,
  icon,
  active,
  onClick,
}: {
  label: string;
  title: string;
  icon: ReactNode;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="group relative flex flex-col gap-0.5 items-center">
      <label className="text-slate-500 text-[10px]">{label}</label>

      <button
        title={title}
        onClick={onClick}
        className={`w-10 h-10 rounded-full flex border border-slate-500 items-center bg-[#3d5a80] justify-center active:bg-slate-600 hover:opacity-100 active:scale-95 transition ${
          active ? "opacity-100" : "opacity-80"
        } text-white`}
      >
        {icon}
      </button>
    </div>
  );
}

export default IconBarButton;
