import { Edit2, Trash2 } from "lucide-react";

interface BookedAppointmentsProps {
  appointments: any[];
}

export function BookedAppointments({ appointments }: BookedAppointmentsProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm h-[320px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">
          Completed Appointments
        </h3>
        <button className="text-gray-400">
          <span className="text-xl">⋮</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {appointments && appointments.length > 0 ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="text-left text-gray-400 border-b border-gray-50">
                <th className="py-2 font-medium">Doctor</th>
                <th className="py-2 font-medium">Patient</th>
                <th className="py-2 font-medium">Date</th>
                <th className="py-2 font-medium">Disease</th>
                <th className="py-2 font-medium">Actions</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {appointments.map((apt: any) => (
                <tr key={apt.visitId || apt.id} className="group">
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                       <div className="w-7 h-7 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-[10px]">
                        {apt.doctor?.name?.charAt(0) || "D"}
                      </div>
                      <span className="font-medium text-gray-700">
                        {apt.doctor?.name || "Dr. Sharma"}
                      </span>
                    </div>
                  </td>
                  <td className="py-3 text-gray-600">
                    {apt.patient?.name || apt.patientName || `ID: ${apt.patientId}`}
                  </td>
                  <td className="py-3 text-gray-500 font-medium">
                    {apt.createdAt ? new Date(apt.createdAt).toLocaleDateString("en-GB") : apt.date}
                  </td>
                  <td className="py-3">
                    <span className="px-2 py-0.5 bg-blue-50 text-blue-500 rounded-md text-[10px] font-semibold">
                      {apt.procedures || apt.diagnosis || apt.visitType || "Routine"}
                    </span>
                  </td>
                  <td className="py-3">
                    <div className="flex items-center gap-2">
                      <button className="p-1 text-gray-400 hover:text-blue-500 transition-colors">
                        <Edit2 size={12} />
                      </button>
                      <button className="p-1 text-gray-400 hover:text-red-500 transition-colors">
                        <Trash2 size={12} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            No appointments found.
          </div>
        )}
      </div>
    </div>
  );
}
