import { useState, useEffect } from "react";
import {
  FileText,
  CheckCircle,
  QrCode,
  IndianRupee,
  Loader2,
  ShieldCheck,
  ArrowRight,
  ArrowLeft
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";

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

  const [step, setStep] = useState<1 | 2>(1);
  const [currentCharges, setCurrentCharges] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [pendingCleared, setPendingCleared] = useState(0);

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  
  // Payment verification simulation states
  const [verifying, setVerifying] = useState(false);
  const [paymentVerified, setPaymentVerified] = useState(false);

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
    pendingCleared <= previousPending &&
    ((paidAmount + pendingCleared) === 0 || paymentVerified); // Require verification if there's a payment

  const totalToPay = paidAmount + pendingCleared;

  // Reset verification if amount changes
  useEffect(() => {
    setPaymentVerified(false);
  }, [totalToPay]);

  // Construct UPI intent URI
  // Uses the actual doctor UPI ID provided
  const upiId = "prasad.mahankal@okaxis";
  const upiName = "Prasad Ajay Mahankal";
  const upiUrl = `upi://pay?pa=${upiId}&pn=${encodeURIComponent(upiName)}&am=${totalToPay}&cu=INR`;

  async function simulatePaymentVerification() {
    setVerifying(true);
    // Simulate a network delay for checking the payment gateway
    await new Promise(resolve => setTimeout(resolve, 2500));
    setPaymentVerified(true);
    setVerifying(false);
  }

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
    <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-0 overflow-hidden">
      
      {/* Header */}
      <div className="bg-gray-50/50 border-b border-gray-100 px-6 py-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-500" />
            Billing & Payment
          </h2>
          <p className="text-sm text-gray-500 mt-0.5">
            {step === 1 ? "Step 1: Calculate charges for this visit" : "Step 2: Collect payment and generate invoice"}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500">Previous Outstanding</p>
          <p className="text-lg font-bold text-orange-600">₹{previousPending}</p>
        </div>
      </div>

      <div className="p-6 pb-8">
        {step === 1 ? (
          <div className="max-w-2xl mx-auto space-y-8">
            {/* Form Inputs */}
            <div>
              <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Charge Details</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Visit Charges
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      min={0}
                      className="w-full pl-9 pr-3 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                      value={currentCharges || ""}
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e => {
                        const val = Math.max(+e.target.value, 0);
                        setCurrentCharges(val);
                        if (discount > val) setDiscount(val);
                      }}
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Discount
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
                    <input
                      type="number"
                      min={0}
                      max={currentCharges}
                      className="w-full pl-9 pr-3 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                      value={discount || ""}
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e =>
                        setDiscount(Math.min(Math.max(+e.target.value, 0), currentCharges))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div>
              <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Payment Details</h3>
              <div className="grid grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Paid for This Visit
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-emerald-500" />
                    <input
                      type="number"
                      min={0}
                      max={visitTotal}
                      className="w-full pl-9 pr-3 py-3 bg-emerald-50/30 border border-emerald-200 rounded-lg text-sm font-medium text-emerald-900 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 outline-none transition-shadow"
                      value={paidAmount || ""}
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e =>
                        setPaidAmount(Math.min(Math.max(+e.target.value, 0), visitTotal))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Clear Old Dues
                  </label>
                  <div className="relative">
                    <IndianRupee className="absolute left-3 top-3 w-4 h-4 text-orange-400" />
                    <input
                      type="number"
                      min={0}
                      max={previousPending}
                      className="w-full pl-9 pr-3 py-3 bg-orange-50/30 border border-orange-200 rounded-lg text-sm font-medium text-orange-900 focus:ring-2 focus:ring-orange-500 focus:border-orange-500 outline-none transition-shadow disabled:bg-gray-50 disabled:text-gray-400"
                      value={pendingCleared || ""}
                      disabled={previousPending === 0}
                      onWheel={e => e.currentTarget.blur()}
                      onChange={e =>
                        setPendingCleared(Math.min(Math.max(+e.target.value, 0), previousPending))
                      }
                      placeholder="0.00"
                    />
                  </div>
                </div>
              </div>
            </div>
            
            <div className="pt-4 flex flex-col gap-4 items-end">
              <div className="text-right pb-4">
                 <p className="text-sm text-gray-500 mb-1">Total to collect from patient:</p>
                 <p className="text-2xl font-bold text-gray-900">₹{totalToPay}</p>
              </div>
              <button
                onClick={() => setStep(2)}
                disabled={currentCharges === 0 && pendingCleared === 0}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-bold transition-transform active:scale-95 disabled:opacity-50"
              >
                Proceed to Payment
                <ArrowRight className="w-5 h-5" />
              </button>
            </div>
          </div>
        ) : (
          <div className="max-w-4xl mx-auto">
            
            <button
              onClick={() => setStep(1)}
              className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 mb-6 font-medium transition-colors"
            >
              <ArrowLeft className="w-4 h-4" />
              Back to Edit Charges
            </button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
              {/* Summary Card */}
              <div className="bg-gray-50 border border-gray-100 rounded-xl p-6 flex flex-col justify-between">
                <div>
                  <h3 className="text-sm font-bold text-gray-900 mb-5">Payment Summary</h3>
                  <div className="space-y-4 text-sm">
                    <div className="flex justify-between text-gray-600">
                      <span>Visit Total <span className="text-xs">(Charges - Discount)</span></span>
                      <span className="font-medium">₹{visitTotal}</span>
                    </div>
                    {previousPending > 0 && (
                      <div className="flex justify-between text-gray-600">
                        <span>Previous Outstanding</span>
                        <span className="font-medium text-orange-600">₹{previousPending}</span>
                      </div>
                    )}
                    <div className="border-t border-gray-200 pt-4 flex justify-between text-gray-900 font-bold text-base">
                      <span>Total Amount Paid</span>
                      <span className="text-emerald-600">₹{totalToPay}</span>
                    </div>
                  </div>
                  
                  <div className={`mt-6 rounded-lg p-4 flex justify-between items-center bg-white border ${
                      updatedPending > 0 ? "border-orange-100 shadow-sm" : "border-emerald-100 shadow-sm"
                    }`}
                  >
                    <span className={`font-semibold text-sm ${updatedPending > 0 ? 'text-orange-800' : 'text-emerald-800'}`}>Updated Outstanding</span>
                    <span className={`font-bold text-xl ${updatedPending > 0 ? 'text-orange-600' : 'text-emerald-600'}`}>₹{updatedPending}</span>
                  </div>
                </div>

                <div className="mt-8">
                  {submitted && (
                    <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex gap-3 text-green-800 mb-4">
                      <CheckCircle className="w-5 h-5 text-green-600 shrink-0" />
                      <span className="text-sm font-medium">
                        Bill generated successfully!
                      </span>
                    </div>
                  )}

                  <button
                    onClick={submitBilling}
                    disabled={!isFormValid || loading || submitted}
                    className="w-full flex justify-center items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-4 rounded-xl font-bold transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-md"
                  >
                    <FileText className="w-5 h-5 opacity-80" />
                    {loading ? "Generating Bill..." : "Finalize & Submit Bill"}
                  </button>
                </div>
              </div>

              {/* QR Code Section */}
              <div className="border border-gray-100 rounded-xl p-8 flex flex-col items-center justify-center text-center bg-white shadow-sm">
                <div className="flex flex-col items-center gap-2 mb-6">
                  <div className="p-3 bg-indigo-50 rounded-full">
                    <QrCode className="w-6 h-6 text-indigo-600" />
                  </div>
                  <span className="font-bold text-gray-900 text-lg">Scan & Pay</span>
                  <span className="text-sm text-gray-500">Scan via Google Pay, PhonePe, etc.</span>
                </div>
                
                <div className={`transition-opacity duration-300 ${totalToPay > 0 ? 'opacity-100' : 'opacity-30 pointer-events-none'}`}>
                  <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 mb-4 mx-auto relative group flex items-center justify-center">
                    <QRCodeSVG 
                      value={upiUrl} 
                      size={180}
                      level="Q"
                      includeMargin={false}
                    />
                    {totalToPay === 0 && (
                      <div className="absolute inset-0 flex items-center justify-center bg-white/70 rounded-2xl backdrop-blur-[1px]">
                        <span className="text-xs font-bold text-gray-700 bg-white px-3 py-1.5 rounded-full shadow-sm border border-gray-200">No Payment Required</span>
                      </div>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 font-mono bg-gray-50 px-3 py-1.5 rounded-full border border-gray-100 inline-block">
                    {upiId}
                  </p>
                </div>

                {totalToPay > 0 && (
                  <div className="mt-8 w-full">
                    {paymentVerified ? (
                      <div className="flex flex-col items-center justify-center py-3 text-emerald-600 bg-emerald-50 rounded-xl border border-emerald-100">
                        <ShieldCheck className="w-8 h-8 mb-1.5" />
                        <span className="text-sm font-bold">Payment Verified!</span>
                      </div>
                    ) : (
                      <button
                        onClick={simulatePaymentVerification}
                        disabled={verifying}
                        className="w-full flex justify-center items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 border border-indigo-200"
                      >
                        {verifying ? (
                          <>
                            <Loader2 className="w-5 h-5 animate-spin" />
                            Checking Gateway...
                          </>
                        ) : (
                          "Verify UPI Payment"
                        )}
                      </button>
                    )}
                  </div>
                )}
              </div>

            </div>
          </div>
        )}
      </div>
    </div>
  );
}
