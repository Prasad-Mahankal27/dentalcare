import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Users, UserPlus, UserCheck, CalendarDays, Activity } from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer, Legend, Tooltip } from "recharts";

interface DashboardStats {
  total_patients: number;
  new_patients_today: number;
  recurring_patients: number;
  appointments_today: number;
}

interface LogEntry {
  id: string;
  user: string;
  action: string;
  timestamp: string;
}

interface Appointment {
  id: string;
  patient_name: string;
  date_time: string;
  doctor_name: string;
}

const statCards = [
  { key: "total_patients", label: "Total Patients", icon: Users },
  { key: "new_patients_today", label: "New Patients (Today)", icon: UserPlus },
  { key: "recurring_patients", label: "Recurring Patients", icon: UserCheck },
  { key: "appointments_today", label: "Appointments Today", icon: CalendarDays },
] as const;

const CHART_COLORS = ["hsl(var(--primary))", "hsl(var(--muted-foreground))"];

export default function Dashboard() {
  const { data: stats, isLoading: statsLoading } = useQuery<DashboardStats>({
    queryKey: ["dashboard-stats"],
    queryFn: () => api.get("/dashboard/stats").then((r) => r.data),
    retry: false,
  });

  const { data: logs } = useQuery<LogEntry[]>({
    queryKey: ["recent-logs"],
    queryFn: () => api.get("/logs?limit=5").then((r) => r.data),
    retry: false,
  });

  const { data: todayAppts } = useQuery<Appointment[]>({
    queryKey: ["today-appointments"],
    queryFn: () => api.get("/appointments/today").then((r) => r.data),
    retry: false,
  });

  const chartData = stats
    ? [
        { name: "New Patients", value: stats.new_patients_today },
        { name: "Recurring Patients", value: stats.recurring_patients },
      ]
    : [];

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">Dashboard</h1>

      {/* Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map(({ key, label, icon: Icon }) => (
          <Card key={key}>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
              <Icon className="h-4 w-4 text-muted-foreground" />
            </CardHeader>
            <CardContent>
              {statsLoading ? (
                <Skeleton className="h-8 w-20" />
              ) : (
                <div className="text-3xl font-bold">
                  {stats?.[key] ?? 0}
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Chart + Today's Appointments */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">New vs Recurring Patients</CardTitle>
          </CardHeader>
          <CardContent>
            {statsLoading ? (
              <Skeleton className="h-52 w-full" />
            ) : chartData.every((d) => d.value === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-12">No patient data</p>
            ) : (
              <ResponsiveContainer width="100%" height={220}>
                <PieChart>
                  <Pie
                    data={chartData}
                    cx="50%"
                    cy="50%"
                    innerRadius={50}
                    outerRadius={80}
                    paddingAngle={4}
                    dataKey="value"
                    label={({ name, value }) => `${name}: ${value}`}
                  >
                    {chartData.map((_, idx) => (
                      <Cell key={idx} fill={CHART_COLORS[idx]} />
                    ))}
                  </Pie>
                  <Tooltip />
                  <Legend />
                </PieChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <CalendarDays className="h-4 w-4" /> Today's Appointments
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!todayAppts || todayAppts.length === 0 ? (
              <p className="text-sm text-muted-foreground">No appointments today</p>
            ) : (
              <ul className="space-y-3">
                {todayAppts.map((appt) => (
                  <li key={appt.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                    <div>
                      <span className="font-medium">{appt.patient_name}</span>
                      <span className="text-muted-foreground ml-2">Dr. {appt.doctor_name}</span>
                    </div>
                    <span className="text-muted-foreground text-xs">
                      {new Date(appt.date_time).toLocaleTimeString()}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent Activity */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Activity className="h-4 w-4" /> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {!logs || logs.length === 0 ? (
            <p className="text-sm text-muted-foreground">No recent activity</p>
          ) : (
            <ul className="space-y-3">
              {logs.map((log) => (
                <li key={log.id} className="flex justify-between text-sm border-b pb-2 last:border-0">
                  <div>
                    <span className="font-medium">{log.user}</span>{" "}
                    <span className="text-muted-foreground">{log.action}</span>
                  </div>
                  <span className="text-muted-foreground text-xs">
                    {new Date(log.timestamp).toLocaleString()}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
