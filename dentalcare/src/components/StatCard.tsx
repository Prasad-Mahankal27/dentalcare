import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon?: LucideIcon;
  label: string;
  value: string;
  iconBgColor?: string;
  iconColor?: string;
  data?: number[];
  lineColor?: string;
}

export function StatCard({
  icon: Icon,
  label,
  value,
  iconBgColor,
  iconColor,
}: StatCardProps) {
  return (
    <div className="bg-white rounded-xl p-4 shadow-sm border border-gray-100 flex flex-col justify-center h-22">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-gray-500 mb-1">
            {label}
          </p>
          <p className="text-2xl font-bold text-gray-900">
            {value}
          </p>
        </div>

        {Icon && (
          <div className={`p-2 rounded-lg ${iconBgColor || 'bg-gray-50'}`}>
            <Icon className={iconColor || 'text-gray-400'} size={20} />
          </div>
        )}
      </div>
    </div>
  );
}
