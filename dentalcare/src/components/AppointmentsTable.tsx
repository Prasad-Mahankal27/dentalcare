interface AppointmentRecord {
  id: number;
  appointmentId: string;
  patientName?: string | null;
  patientPhone: string;
  scheduledAt: string;
  status: string;
  source: string;
  reason?: string | null;
  doctor?: {
    id: number;
    name: string;
  } | null;
  patient?: {
    patientId: string;
    name: string;
    phone: string;
  } | null;
}

interface AppointmentsTableProps {
  appointments: AppointmentRecord[];
  onOpenAppointment?: (appointmentId: string) => void;
}

const STATUS_CLASS_MAP: Record<string, string> = {
  REQUESTED: "bg-amber-50 text-amber-700 border border-amber-200",
  CONFIRMED: "bg-blue-50 text-blue-700 border border-blue-200",
  COMPLETED: "bg-green-50 text-green-700 border border-green-200"
};

function formatStatus(status: string): string {
  if (status === "REQUESTED") {
    return "Pending";
  }
  if (status === "CONFIRMED") {
    return "Confirmed";
  }
  if (status === "COMPLETED") {
    return "Completed";
  }
  return status;
}

function formatSource(source: string): string {
  return source
    .toLowerCase()
    .split("_")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

function formatDateTime(dateTimeIso: string): string {
  const parsed = new Date(dateTimeIso);
  if (Number.isNaN(parsed.getTime())) {
    return dateTimeIso;
  }

  return parsed.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true
  });
}

export function AppointmentsTable({ appointments, onOpenAppointment }: AppointmentsTableProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm min-h-[360px]">
      <div className="overflow-x-auto">
        {appointments.length === 0 ? (
          <div className="h-[280px] flex items-center justify-center text-sm text-gray-400">
            No appointments in this filter.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-gray-500 border-b border-gray-100">
                <th className="py-3 pr-4 font-medium">Patient</th>
                <th className="py-3 pr-4 font-medium">Date & Time</th>
                <th className="py-3 pr-4 font-medium">Status</th>
                <th className="py-3 pr-4 font-medium">Source</th>
                <th className="py-3 pr-4 font-medium">Doctor</th>
                <th className="py-3 font-medium">Reason</th>
                <th className="py-3 pl-4 font-medium text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {appointments.map((appointment) => {
                const statusClass =
                  STATUS_CLASS_MAP[appointment.status] || "bg-gray-50 text-gray-700 border border-gray-200";

                return (
                  <tr key={appointment.appointmentId || String(appointment.id)}>
                    <td className="py-3 pr-4">
                      <div className="font-medium text-gray-900">
                        {appointment.patient?.name || appointment.patientName || "Unknown"}
                      </div>
                      <div className="text-xs text-gray-500">{appointment.patientPhone}</div>
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{formatDateTime(appointment.scheduledAt)}</td>
                    <td className="py-3 pr-4">
                      <span className={`inline-flex px-2.5 py-1 rounded-full text-xs font-semibold ${statusClass}`}>
                        {formatStatus(appointment.status)}
                      </span>
                    </td>
                    <td className="py-3 pr-4 text-gray-700">{formatSource(appointment.source)}</td>
                    <td className="py-3 pr-4 text-gray-700">{appointment.doctor?.name || "Unassigned"}</td>
                    <td className="py-3 text-gray-600">{appointment.reason || "-"}</td>
                    <td className="py-3 pl-4 text-right">
                      <button
                        onClick={() => onOpenAppointment?.(appointment.appointmentId)}
                        className="px-3 py-1.5 rounded-md text-xs font-semibold border border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        Open
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
