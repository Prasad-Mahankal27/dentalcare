import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip
} from "recharts";
import { ChevronDown } from "lucide-react";

interface CommonDiseasesReportProps {
  data?: any[];
  categories?: string[];
}

// Curated palette – visually distinct, professional dental-dashboard blues/teals
const CATEGORY_COLORS = [
  "#3b82f6", // blue-500
  "#6366f1", // indigo-500
  "#0ea5e9", // sky-500
  "#14b8a6", // teal-500
  "#8b5cf6", // violet-500
  "#06b6d4", // cyan-500
  "#2563eb", // blue-600
  "#7c3aed", // violet-600
  "#0284c7", // sky-600
  "#0d9488", // teal-600
  "#4f46e5", // indigo-600
  "#0891b2", // cyan-600
];

function getCategoryColor(index: number): string {
  return CATEGORY_COLORS[index % CATEGORY_COLORS.length];
}

const defaultData: any[] = [];
const defaultCategories: string[] = [];

export function CommonDiseasesReport({
  data = defaultData,
  categories = defaultCategories
}: CommonDiseasesReportProps) {
  const hasData = Array.isArray(data) && data.length > 0;
  const hasCategories = Array.isArray(categories) && categories.length > 0;

  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4 min-w-0">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Dental Issues Report
          </h3>

          {hasCategories && (
            <div className="flex items-center gap-4 mt-1 text-xs text-gray-600 flex-wrap">
              {categories.map((cat, i) => (
                <div key={cat} className="flex items-center gap-1">
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: getCategoryColor(i) }}
                  />
                  {cat}
                </div>
              ))}
            </div>
          )}
        </div>

        <button className="flex items-center gap-1 px-2 py-1 text-xs border border-gray-200 rounded hover:bg-gray-50">
          {hasData 
            ? `${data[0].date} – ${data[data.length - 1].date}` 
            : "No Data"}
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {hasData && hasCategories ? (
        <div className="h-44 sm:h-52">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={data} barGap={4}>
              <CartesianGrid strokeDasharray="3 3" stroke="#f3f4f6" vertical={false} />
              <XAxis
                dataKey="date"
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                dy={10}
                minTickGap={14}
              />
              <YAxis
                axisLine={false}
                tickLine={false}
                tick={{ fill: "#9ca3af", fontSize: 10 }}
                dx={-6}
                allowDecimals={false}
              />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: "1px solid #e5e7eb"
                }}
              />
              {categories.map((cat, i) => (
                <Bar
                  key={cat}
                  dataKey={cat}
                  fill={getCategoryColor(i)}
                  radius={[4, 4, 0, 0]}
                  barSize={Math.max(6, Math.min(16, Math.floor(60 / categories.length)))}
                />
              ))}
            </BarChart>
          </ResponsiveContainer>
        </div>
      ) : (
        <div className="h-44 sm:h-52 flex items-center justify-center rounded-lg border border-dashed border-slate-200 text-sm text-slate-500">
          No dental issue data yet.
        </div>
      )}

      {hasCategories && (
        <div className="mt-4 flex items-center gap-6 text-xs font-medium text-gray-500 flex-wrap">
          {categories.map((cat, i) => (
            <div key={cat} className="flex items-center gap-2">
              <span
                className="w-3 h-3 rounded-full flex-shrink-0"
                style={{ backgroundColor: getCategoryColor(i) }}
              />
              {cat}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
