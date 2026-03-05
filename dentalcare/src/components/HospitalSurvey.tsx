import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  ResponsiveContainer
} from "recharts";
import { ChevronDown } from "lucide-react";

interface HospitalSurveyProps {
  data?: any[];
}

const defaultData: any[] = [];

export function HospitalSurvey({ data = defaultData }: HospitalSurveyProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-4">
      <div className="flex items-start justify-between mb-2">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">
            Patient Survey
          </h3>

          <div className="flex items-center gap-4 mt-1 text-xs text-gray-600">
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-pink-500" />
              New Patients
            </div>
            <div className="flex items-center gap-1">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              Recurring Patients
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
          <LineChart data={data}>
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

            <Line
              type="monotone"
              dataKey="newPatients"
              stroke="#ec4899"
              strokeWidth={2}
              dot={false}
            />

            <Line
              type="monotone"
              dataKey="recurringPatients"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 flex items-center gap-4 text-xs text-gray-600">
        <span>Recent Trend</span>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-pink-500" />
          New Patients
        </div>
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-blue-500" />
          Recurring
        </div>
      </div>
    </div>
  );
}
