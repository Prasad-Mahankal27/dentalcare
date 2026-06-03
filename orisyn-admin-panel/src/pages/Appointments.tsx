import { useQuery } from "@tanstack/react-query";
import api from "@/lib/api";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { CalendarDays, Clock } from "lucide-react";

interface Appointment {
  id: string;
  patient_name: string;
  date_time: string;
  doctor_name: string;
}

function AppointmentCard({ appt }: { appt: Appointment }) {
  return (
    <Card>
      <CardContent className="p-4 flex items-center justify-between">
        <div>
          <p className="font-medium">{appt.patient_name}</p>
          <p className="text-sm text-muted-foreground">Dr. {appt.doctor_name}</p>
        </div>
        <div className="text-right text-sm text-muted-foreground flex items-center gap-1">
          <Clock className="h-3 w-3" />
          {new Date(appt.date_time).toLocaleString()}
        </div>
      </CardContent>
    </Card>
  );
}

export default function Appointments() {
  const { data: today, isLoading: todayLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments-today"],
    queryFn: () => api.get("/appointments/today").then((r) => r.data),
    retry: false,
  });

  const { data: upcoming, isLoading: upcomingLoading } = useQuery<Appointment[]>({
    queryKey: ["appointments-upcoming"],
    queryFn: () => api.get("/appointments/upcoming").then((r) => r.data),
    retry: false,
  });

  const renderSection = (
    title: string,
    data: Appointment[] | undefined,
    loading: boolean
  ) => (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold flex items-center gap-2">
        <CalendarDays className="h-4 w-4" /> {title}
      </h2>
      {loading ? (
        <div className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : !data || data.length === 0 ? (
        <p className="text-sm text-muted-foreground">No appointments</p>
      ) : (
        <div className="space-y-2">
          {data.map((appt) => (
            <AppointmentCard key={appt.id} appt={appt} />
          ))}
        </div>
      )}
    </div>
  );

  return (
    <div className="space-y-8">
      <h1 className="text-2xl font-bold">Appointments</h1>
      {renderSection("Today's Appointments", today, todayLoading)}
      {renderSection("Upcoming Appointments", upcoming, upcomingLoading)}
    </div>
  );
}
