

interface BookedAppointmentsProps {
  appointments: any[];
}

export function BookedAppointments({ appointments }: BookedAppointmentsProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Recent Appointments
        </h3>
      </div>

      <div className="max-h-[220px] overflow-y-auto">
        {appointments && appointments.length > 0 ? (
          <table className="w-full text-xs">
            <thead className="sticky top-0 bg-white z-10">
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-500">Patient</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Doctor</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Date</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Service</th>
              </tr>
            </thead>

            <tbody>
              {appointments.map((apt: any) => (
                <tr
                  key={apt.visitId || apt.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 px-2 text-gray-800">
                    {apt.patient?.name || apt.patientName || `ID: ${apt.patientId}`}
                  </td>
                  <td className="py-2 px-2 text-gray-800">
                    {apt.doctor?.name || apt.doctorName || `ID: ${apt.doctorId}`}
                  </td>
                  <td className="py-2 px-2 text-gray-700">
                    {apt.createdAt ? new Date(apt.createdAt).toLocaleDateString() : apt.date}
                  </td>
                  <td className="py-2 px-2 text-gray-700">
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-[10px]">
                      {apt.procedures || apt.disease || apt.visitType}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <div className="py-4 text-center text-sm text-gray-500">No appointments found.</div>
        )}
      </div>
    </div>
  );
}
