import { 
  User, 
  Stethoscope, 
  ClipboardList, 
  Pill, 
  AlertCircle 
} from "lucide-react";

interface VisitReportProps {
  visit: any;
  patient: any;
}

const VisitReport: React.FC<VisitReportProps> = ({ visit, patient }) => {
  if (!visit || !patient) return null;

  const parseJson = (str: any) => {
    try {
      return typeof str === "string" ? JSON.parse(str) : str;
    } catch {
      return str;
    }
  };

  const medicines = parseJson(visit.medicines) || [];
  const symptoms = typeof visit.symptoms === "string" ? visit.symptoms.split(",").map((s: string) => s.trim()) : [];

  return (
    <div className="bg-white border rounded-lg shadow-sm overflow-hidden text-sm print:shadow-none print:border-none">
      {/* Header */}
      <div className="bg-emerald-600 text-white p-6 flex justify-between items-center">
        <div>
          <h1 className="text-2xl font-bold">Dental Care Report</h1>
          <p className="opacity-90">Visit Summary & Prescription</p>
        </div>
        <div className="text-right text-xs">
          <p>Date: {new Date(visit.createdAt).toLocaleDateString()}</p>
          <p>Visit ID: {visit.visitId}</p>
        </div>
      </div>

      <div className="p-6 space-y-6">
        {/* Patient Info */}
        <section>
          <div className="flex items-center gap-2 text-emerald-700 font-bold mb-3 border-b pb-1">
            <User className="w-4 h-4" />
            <h2>Patient Information</h2>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div><span className="text-gray-500">Name:</span> <b>{patient.name}</b></div>
            <div><span className="text-gray-500">ID:</span> <b>{patient.patientId}</b></div>
            <div><span className="text-gray-500">Phone:</span> <b>{patient.phone}</b></div>
            <div><span className="text-gray-500">Gender:</span> <b>{patient.gender || "—"}</b></div>
          </div>
        </section>

        {/* Clinical Details */}
        <section>
          <div className="flex items-center gap-2 text-emerald-700 font-bold mb-3 border-b pb-1">
            <Stethoscope className="w-4 h-4" />
            <h2>Clinical Assessment</h2>
          </div>
          <div className="space-y-3">
            {symptoms.length > 0 && (
              <div>
                <span className="text-gray-500 block mb-1">Symptoms:</span>
                <div className="flex flex-wrap gap-2">
                  {symptoms.map((s: string, i: number) => (
                    <span key={i} className="bg-gray-100 px-2 py-1 rounded text-xs">{s}</span>
                  ))}
                </div>
              </div>
            )}
            {visit.diagnosis && (
              <div>
                <span className="text-gray-500 block mb-1">Diagnosis:</span>
                <p className="bg-emerald-50 p-2 rounded border border-emerald-100 italic">
                  {visit.diagnosis}
                </p>
              </div>
            )}
            {visit.observations && (
              <div>
                <span className="text-gray-500 block mb-1">Observations:</span>
                <p className="text-gray-700">{visit.observations}</p>
              </div>
            )}
          </div>
        </section>

        {/* Treatment Plan */}
        {visit.treatmentPlan && (
          <section>
            <div className="flex items-center gap-2 text-emerald-700 font-bold mb-3 border-b pb-1">
              <ClipboardList className="w-4 h-4" />
              <h2>Recommended Treatment</h2>
            </div>
            <p className="text-gray-700 bg-gray-50 p-3 rounded">
              {visit.treatmentPlan}
            </p>
          </section>
        )}

        {/* Prescription */}
        {medicines.length > 0 && (
          <section>
            <div className="flex items-center gap-2 text-emerald-700 font-bold mb-3 border-b pb-1">
              <Pill className="w-4 h-4" />
              <h2>Prescription</h2>
            </div>
            <table className="w-full text-left border-collapse border">
              <thead>
                <tr className="bg-gray-50 text-[11px] uppercase tracking-wider text-gray-600">
                  <th className="p-2 border">Medicine</th>
                  <th className="p-2 border">Dosage</th>
                  <th className="p-2 border">Frequency</th>
                  <th className="p-2 border">Duration</th>
                </tr>
              </thead>
              <tbody>
                {medicines.map((m: any, i: number) => (
                  <tr key={i} className="text-xs hover:bg-gray-50">
                    <td className="p-2 border font-medium text-gray-900">{m.name}</td>
                    <td className="p-2 border text-gray-700">{m.dosage || "As directed"}</td>
                    <td className="p-2 border text-gray-700">{m.frequency || "—"}</td>
                    <td className="p-2 border text-gray-700">{m.duration || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}

        {/* Billing Summary */}
        {visit.bill && (
          <section>
            <div className="flex items-center gap-2 text-emerald-700 font-bold mb-3 border-b pb-1">
              <ClipboardList className="w-4 h-4" />
              <h2>Billing Summary</h2>
            </div>
            <div className="bg-gray-50 p-4 rounded-lg border">
              <div className="grid grid-cols-2 gap-y-2 text-xs">
                <div className="text-gray-500 font-medium">Consultation/Procedure Charges:</div>
                <div className="text-right font-bold text-gray-900">₹{visit.bill.currentCharges || 0}</div>
                
                <div className="text-gray-500 font-medium">Applied Discount:</div>
                <div className="text-right font-bold text-red-600">- ₹{visit.bill.discount || 0}</div>
                
                <div className="border-t pt-2 text-gray-700 font-bold">Total Payable:</div>
                <div className="border-t pt-2 text-right font-bold text-emerald-700">₹{(visit.bill.currentCharges || 0) - (visit.bill.discount || 0)}</div>
                
                <div className="text-emerald-600 font-medium">Amount Paid:</div>
                <div className="text-right font-bold text-emerald-600">₹{visit.bill.paidAmount || 0}</div>
                
                <div className="border-t pt-2 text-gray-700 font-bold">Current Visit Outstanding:</div>
                <div className="border-t pt-2 text-right font-bold text-orange-600">₹{visit.bill.pendingAmount || 0}</div>
              </div>
            </div>
          </section>
        )}

        {/* Follow-up Advice */}
        {visit.followUpAdvice && (
          <section className="bg-orange-50 p-4 border border-orange-200 rounded-lg">
            <div className="flex items-center gap-2 text-orange-700 font-bold mb-2">
              <AlertCircle className="w-4 h-4" />
              <h2>Follow-up Advice</h2>
            </div>
            <p className="text-orange-800 text-xs leading-relaxed">
              {visit.followUpAdvice}
            </p>
          </section>
        )}
      </div>

      <div className="bg-gray-100 p-4 text-center text-[10px] text-gray-500 border-t">
        <p className="font-semibold mb-1 italic text-emerald-700">Health is wealth. Keep smiling!</p>
        <p>This is a computer-generated report. No signature required.</p>
        <p className="mt-1 opacity-60">DentalCare Management System © 2026</p>
      </div>
    </div>
  );
};

export default VisitReport;
