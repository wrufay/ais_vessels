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
    <div className="group relative flex flex-col gap-1">
      <label className="text-gray-500 text-xs">{label}</label>

      <button
        title={title}
        onClick={onClick}
        className={`w-12 h-12 rounded-full shadow-lg flex items-center justify-center transition ${
          active ? "bg-[#293241] ring-2" : "bg-[#3d5a80] hover:bg-[#293241]"
        } text-white`}
      >
        {icon}
      </button>
    </div>
  );
}

export default IconBarButton;
