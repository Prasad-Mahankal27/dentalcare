interface DoctorsListProps {
  doctors: any[];
}

export function DoctorsList({ doctors }: DoctorsListProps) {
  return (
    <div className="bg-white rounded-xl border border-gray-100 p-4 shadow-sm h-[320px] flex flex-col">
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-bold text-gray-900">
          Doctors List
        </h3>
        <button className="text-gray-400">
          <span className="text-xl">⋮</span>
        </button>
      </div>

      <div className="flex-1 overflow-y-auto">
        {doctors && doctors.length > 0 ? (
          <div className="space-y-4">
            <div className="flex justify-between text-[10px] font-medium text-gray-400 border-b border-gray-50 pb-2">
              <span>Doctor</span>
              <span>Status</span>
            </div>
            {doctors.map((doc: any) => (
              <div
                key={doc.id}
                className="flex items-center justify-between group"
              >
                <div className="flex items-center gap-3">
                  <div className="w-9 h-9 rounded-full bg-blue-100 text-blue-600 flex items-center justify-center font-bold text-xs border-2 border-white shadow-sm">
                    {doc.name?.charAt(0) || "D"}
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-gray-800 leading-tight">
                      {doc.name || "Dr. Ruben Bothman"}
                    </h4>
                    <p className="text-[10px] text-gray-400 leading-tight mt-0.5">
                      {doc.specialization || "Dental Surgeon"}
                    </p>
                  </div>
                </div>
                
                <div className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-gray-50">
                  {/* Mock status for UI demo as requested */}
                  <span className={`w-1.5 h-1.5 rounded-full ${Math.random() > 0.3 ? 'bg-green-500' : 'bg-gray-300'}`} />
                  <span className="text-[10px] font-medium text-gray-600">
                    {Math.random() > 0.3 ? 'Available' : 'Absent'}
                  </span>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="h-full flex items-center justify-center text-sm text-gray-400">
            No doctors found.
          </div>
        )}
      </div>
    </div>
  );
}
