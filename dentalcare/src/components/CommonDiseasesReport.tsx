import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";
import { ChevronDown } from "lucide-react";

interface CommonDiseasesReportProps {
  data?: any[];
}

const defaultData: any[] = [];

export function CommonDiseasesReport({ data = defaultData }: CommonDiseasesReportProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Dental Issues Report
          </h3>

          <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-400"></span>
              Cavities
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-600"></span>
              Gum Disease
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-800"></span>
              Root Canals
            </div>
          </div>
        </div>

        <button className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">
          {data && data.length > 0 
            ? `${data[0].date} – ${data[data.length - 1].date}` 
            : "No Data"}
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      <div className="h-52">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={data} barGap={4}>
            <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" />
            <XAxis
              dataKey="date"
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
            />
            <YAxis
              axisLine={false}
              tickLine={false}
              tick={{ fill: "#9ca3af", fontSize: 10 }}
            />
            <Bar
              dataKey="cavities"
              fill="#60a5fa"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="gumDisease"
              fill="#2563eb"
              radius={[3, 3, 0, 0]}
            />
            <Bar
              dataKey="rootCanals"
              fill="#1e40af"
              radius={[3, 3, 0, 0]}
            />
          </BarChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
        <span>Recent Trend</span>
        <div className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-blue-600"></span>
          Common Issues
        </div>
      </div>
    </div>
  );
}
