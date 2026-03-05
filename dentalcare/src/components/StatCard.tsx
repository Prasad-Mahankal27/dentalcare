import { LucideIcon } from "lucide-react";
import { LineChart, Line, ResponsiveContainer } from "recharts";

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
  data,
  lineColor
}: StatCardProps) {
  const chartData = data
    ? data.map((v, i) => ({ value: v, index: i }))
    : [];

  return (
    <div className="bg-white rounded-lg px-5 py-4 shadow-sm border border-gray-100">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-500 leading-tight">
            {label}
          </p>
          <p className="text-xl font-bold font-semibold text-gray-900 leading-tight">
            {value}
          </p>
        </div>

        {Icon && (
          <div
            className={`p-2.5 rounded-xl rounded-lg ${iconBgColor}`}
          >
            <Icon
              className={iconColor}
              size={16}
            />
          </div>
        )}
      </div>

      {data && lineColor && (
        <div className="h-7 mt-1">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData}>
              <Line
                type="monotone"
                dataKey="value"
                stroke={lineColor}
                strokeWidth={1.8}
                dot={false}
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
