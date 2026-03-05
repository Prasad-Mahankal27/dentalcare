interface DoctorsListProps {
  doctors: any[];
}

export function DoctorsList({ doctors }: DoctorsListProps) {
  return (
    <div className="bg-white rounded-lg border border-gray-200 p-3">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-sm font-semibold text-gray-900">
          Doctors List
        </h3>
      </div>

      <div className="max-h-[220px] overflow-y-auto">
        <table className="w-full text-xs">
          <thead className="sticky top-0 bg-white z-10">
            <tr className="border-b border-gray-200">
              <th className="text-left py-2 px-2 font-medium text-gray-500">
                Doctor
              </th>
            </tr>
          </thead>

          <tbody>
            {doctors && doctors.length > 0 ? (
              doctors.map((doctor: any) => (
                <tr
                  key={doctor.id}
                  className="border-b border-gray-100 hover:bg-gray-50"
                >
                  <td className="py-2 px-2">
                    <div className="flex items-center gap-2">
                      <div className="w-7 h-7 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[10px]">
                        {doctor.name.charAt(0)}
                      </div>
                      <div>
                        <div className="text-gray-800 font-medium">
                          {doctor.name}
                        </div>
                        <div className="text-gray-500 text-[10px]">
                          Role: {doctor.role || "Doctor"} | ID: {doctor.id}
                        </div>
                      </div>
                    </div>
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-4 text-center text-gray-500">No doctors found in database.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
