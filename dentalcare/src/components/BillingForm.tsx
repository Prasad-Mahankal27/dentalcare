import { useState } from "react";
import {
  FileText,
  CheckCircle,
  QrCode,
  IndianRupee
} from "lucide-react";

interface Props {
  visit: any;
  token: string;
  onBillingDone?: () => void;
}

export default function BillingForm({
  visit,
  token,
  onBillingDone
}: Props) {

  const [currentCharges, setCurrentCharges] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [pendingCleared, setPendingCleared] = useState(0);

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const previousPending = visit?.previousPending || 0;

  const visitTotal = Math.max(currentCharges - discount, 0);
  const visitPending = Math.max(visitTotal - paidAmount, 0);

  const updatedPending = Math.max(
    previousPending - pendingCleared + visitPending,
    0
  );

  const isFormValid =
    currentCharges > 0 &&
    discount >= 0 &&
    discount <= currentCharges &&
    paidAmount >= 0 &&
    paidAmount <= visitTotal &&
    pendingCleared >= 0 &&
    pendingCleared <= previousPending;

  async function submitBilling() {
    if (!visit?.id) {
      alert("Visit not loaded properly");
      return;
    }

    try {
      setLoading(true);

      const res = await fetch(
        "http://localhost:4000/billing/create",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            visitId: visit.id,
            currentCharges,
            discount,
            paidAmount,
            pendingCleared
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Billing failed");
      }

      setSubmitted(true);
      onBillingDone?.();

    } catch (err: any) {
      alert(err.message || "Billing failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="bg-white rounded-lg border p-6">

      <div className="text-center mb-6">
        <h2 className="text-lg font-semibold">
          Billing & Payment
        </h2>
        <p className="text-sm text-gray-500">
          Includes previous outstanding
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <div>
          <div className="border rounded-lg p-4 text-center">
            <QrCode className="mx-auto w-6 h-6 text-emerald-600 mb-2" />
            <p className="text-sm mb-3">Scan to Pay (UPI)</p>
            <img
              src="/qr.png"
              alt="UPI QR"
              className="w-40 mx-auto"
            />
          </div>
        </div>

        <div className="lg:col-span-2 space-y-5">

          <div className="bg-gray-50 border rounded p-4">
            <div className="flex justify-between">
              <span>Previous Outstanding</span>
              <b>₹{previousPending}</b>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Pending Cleared (Old Dues)
            </label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min={0}
                max={previousPending}
                className="w-full pl-9 border rounded px-3 py-2"
                value={pendingCleared || ""}
                onWheel={e => e.currentTarget.blur()}
                onChange={e =>
                  setPendingCleared(
                    Math.min(
                      Math.max(+e.target.value, 0),
                      previousPending
                    )
                  )
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Visit Charges
            </label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min={0}
                className="w-full pl-9 border rounded px-3 py-2"
                value={currentCharges || ""}
                onWheel={e => e.currentTarget.blur()}
                onChange={e => {
                  const val = Math.max(+e.target.value, 0);
                  setCurrentCharges(val);
                  if (discount > val) setDiscount(val);
                }}
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Discount
            </label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min={0}
                max={currentCharges}
                className="w-full pl-9 border rounded px-3 py-2"
                value={discount || ""}
                onWheel={e => e.currentTarget.blur()}
                onChange={e =>
                  setDiscount(
                    Math.min(
                      Math.max(+e.target.value, 0),
                      currentCharges
                    )
                  )
                }
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">
              Paid for This Visit
            </label>
            <div className="relative">
              <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <input
                type="number"
                min={0}
                max={visitTotal}
                className="w-full pl-9 border rounded px-3 py-2"
                value={paidAmount || ""}
                onWheel={e => e.currentTarget.blur()}
                onChange={e =>
                  setPaidAmount(
                    Math.min(
                      Math.max(+e.target.value, 0),
                      visitTotal
                    )
                  )
                }
              />
            </div>
          </div>

          <div
            className={`border rounded p-4 ${
              updatedPending > 0
                ? "bg-orange-50"
                : "bg-emerald-50"
            }`}
          >
            <div className="flex justify-between">
              <span>Updated Outstanding</span>
              <b>₹{updatedPending}</b>
            </div>
          </div>

          {submitted && (
            <div className="bg-green-50 border rounded p-4 flex gap-2">
              <CheckCircle className="text-green-600" />
              <span className="text-sm">
                Bill generated successfully
              </span>
            </div>
          )}

          <button
            onClick={submitBilling}
            disabled={!isFormValid || loading || submitted}
            className="flex gap-2 items-center bg-emerald-600 text-white px-6 py-2 rounded disabled:opacity-50"
          >
            <FileText className="w-4 h-4" />
            {loading ? "Processing…" : "Generate Bill"}
          </button>

        </div>
      </div>
    </div>
  );
}
