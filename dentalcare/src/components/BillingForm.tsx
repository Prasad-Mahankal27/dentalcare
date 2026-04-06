import { useCallback, useEffect, useRef, useState } from "react";
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

interface BillingVisit {
  id?: number | string;
  previousPending?: number;
}

interface Props {
  visit?: BillingVisit | null;
  token: string;
  onBillingDone?: () => void;
}

type VerificationMode = "AUTO" | "MANUAL" | null;

const UPI_PAY_BASE_URL = (
  import.meta.env.VITE_UPI_PAY_BASE_URL || "http://localhost:3002"
).replace(/\/$/, "");
const QR_EXPIRY_MS = 5 * 60 * 1000;

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

  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  const [qrLoading, setQrLoading] = useState(false);
  const [manualApproving, setManualApproving] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);

  const [paymentVerified, setPaymentVerified] = useState(false);
  const [verificationMode, setVerificationMode] = useState<VerificationMode>(null);
  const [statusMessage, setStatusMessage] = useState("Generate QR to start verification.");
  const [orderId, setOrderId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [dynamicUpiId, setDynamicUpiId] = useState("");
  const [gatewayAmount, setGatewayAmount] = useState<number | null>(null);
  const [qrCreatedAt, setQrCreatedAt] = useState<number | null>(null);
  const [qrExpiresIn, setQrExpiresIn] = useState("");
  const [qrExpired, setQrExpired] = useState(false);

  const statusPollerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const hasPlayedCompletionRef = useRef(false);

  const previousPending = visit?.previousPending || 0;

  const visitTotal = Math.max(currentCharges - discount, 0);
  const visitPending = Math.max(visitTotal - paidAmount, 0);
  const totalToPay = paidAmount + pendingCleared;

  const payerFullName = [firstName.trim(), middleName.trim(), lastName.trim()]
    .filter(Boolean)
    .join(" ");
  const isPayerNameValid = firstName.trim().length > 0 && lastName.trim().length > 0;
  const requiresPayment = totalToPay > 0;
  const payableForQr = gatewayAmount ?? totalToPay;
  const displayedUpiId = dynamicUpiId || "UPI ID will appear after QR generation";

  const gatewayBusy = qrLoading || manualApproving;

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
    (!requiresPayment || (isPayerNameValid && paymentVerified));

  function getErrorMessage(error: unknown, fallback: string) {
    return error instanceof Error ? error.message : fallback;
  }

  function stopStatusPolling() {
    if (statusPollerRef.current) {
      clearInterval(statusPollerRef.current);
      statusPollerRef.current = null;
    }
    setCheckingStatus(false);
  }

  const ensureAudioContext = useCallback(() => {
    if (typeof window === "undefined") {
      return null;
    }

    const browserWindow = window as Window & {
      webkitAudioContext?: typeof AudioContext;
    };

    const AudioContextClass =
      window.AudioContext || browserWindow.webkitAudioContext;

    if (!AudioContextClass) {
      return null;
    }

    if (!audioContextRef.current) {
      audioContextRef.current = new AudioContextClass();
    }

    return audioContextRef.current;
  }, []);

  const primeAudioPlayback = useCallback(() => {
    const audioContext = ensureAudioContext();

    if (!audioContext || audioContext.state !== "suspended") {
      return;
    }

    void audioContext.resume().catch(() => {
      // Ignore browsers that still block audio until a later gesture.
    });
  }, [ensureAudioContext]);

  const playPaymentCompletedChime = useCallback(async () => {
    const audioContext = ensureAudioContext();

    if (!audioContext) {
      return;
    }

    if (audioContext.state === "suspended") {
      try {
        await audioContext.resume();
      } catch {
        return;
      }
    }

    const masterGain = audioContext.createGain();
    const startTime = audioContext.currentTime + 0.02;

    masterGain.gain.setValueAtTime(0.0001, startTime);
    masterGain.gain.exponentialRampToValueAtTime(0.18, startTime + 0.04);
    masterGain.gain.exponentialRampToValueAtTime(0.0001, startTime + 1.2);
    masterGain.connect(audioContext.destination);

    const notes = [
      { frequency: 783.99, duration: 0.24, delay: 0 },
      { frequency: 987.77, duration: 0.3, delay: 0.16 },
      { frequency: 1174.66, duration: 0.42, delay: 0.34 }
    ];

    notes.forEach(note => {
      const oscillator = audioContext.createOscillator();
      const noteGain = audioContext.createGain();
      const noteStart = startTime + note.delay;

      oscillator.type = "sine";
      oscillator.frequency.setValueAtTime(note.frequency, noteStart);

      noteGain.gain.setValueAtTime(0.0001, noteStart);
      noteGain.gain.exponentialRampToValueAtTime(0.6, noteStart + 0.03);
      noteGain.gain.exponentialRampToValueAtTime(0.0001, noteStart + note.duration);

      oscillator.connect(noteGain);
      noteGain.connect(masterGain);
      oscillator.start(noteStart);
      oscillator.stop(noteStart + note.duration);
      oscillator.onended = () => {
        oscillator.disconnect();
        noteGain.disconnect();
      };
    });

    window.setTimeout(() => {
      masterGain.disconnect();
    }, 1400);
  }, [ensureAudioContext]);

  function markPaymentCompleted(mode: Exclude<VerificationMode, null>, message: string) {
    stopStatusPolling();
    setPaymentVerified(true);
    setVerificationMode(mode);
    setStatusMessage(message);
  }

  function startStatusPolling(activeOrderId: string) {
    stopStatusPolling();
    setCheckingStatus(true);

    statusPollerRef.current = setInterval(async () => {
      try {
        const res = await fetch(`${UPI_PAY_BASE_URL}/status/${activeOrderId}`);
        const data = await res.json();

        if (res.ok && data.status === "PAID") {
          markPaymentCompleted("AUTO", "Payment completed and auto-verified from bank notification.");
        }
      } catch {
        // Keep polling; transient network issues should not block verification.
      }
    }, 2000);
  }

  // Reset verification artifacts if payer details or payable amount changes.
  useEffect(() => {
    stopStatusPolling();
    setPaymentVerified(false);
    setVerificationMode(null);
    setOrderId(null);
    setQrImage("");
    setDynamicUpiId("");
    setGatewayAmount(null);
    setQrCreatedAt(null);
    setQrExpiresIn("");
    setQrExpired(false);
    setStatusMessage("Generate QR to start verification.");
  }, [firstName, middleName, lastName, totalToPay]);

  useEffect(() => {
    return () => {
      stopStatusPolling();

      if (audioContextRef.current) {
        void audioContextRef.current.close().catch(() => {
          // Ignore cleanup failures during unmount.
        });
      }
    };
  }, []);

  useEffect(() => {
    if (!paymentVerified) {
      hasPlayedCompletionRef.current = false;
      return;
    }

    if (hasPlayedCompletionRef.current) {
      return;
    }

    hasPlayedCompletionRef.current = true;
    void playPaymentCompletedChime();
  }, [paymentVerified, playPaymentCompletedChime]);

  useEffect(() => {
    if (!qrCreatedAt || paymentVerified || !qrImage) {
      if (!qrImage) {
        setQrExpiresIn("");
      }
      return;
    }

    const updateExpiry = () => {
      const remaining = QR_EXPIRY_MS - (Date.now() - qrCreatedAt);

      if (remaining <= 0) {
        if (!qrExpired) {
          setQrExpired(true);
          setQrExpiresIn("QR Expired");
          setStatusMessage("QR expired. Generate a new QR to continue.");
          stopStatusPolling();
        }
        return false;
      }

      const minutes = Math.floor(remaining / 60000);
      const seconds = Math.floor((remaining % 60000) / 1000);

      setQrExpired(false);
      setQrExpiresIn(`Expires in ${minutes}:${seconds.toString().padStart(2, "0")}`);
      return true;
    };

    if (!updateExpiry()) {
      return;
    }

    const intervalId = window.setInterval(() => {
      if (!updateExpiry()) {
        window.clearInterval(intervalId);
      }
    }, 1000);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [paymentVerified, qrCreatedAt, qrExpired, qrImage]);

  async function generateDynamicQr() {
    if (!isPayerNameValid) {
      alert("Please enter first and last name as per Aadhaar.");
      return;
    }

    if (totalToPay <= 0) {
      alert("Total payable amount should be greater than 0.");
      return;
    }

    try {
      primeAudioPlayback();
      stopStatusPolling();
      setQrLoading(true);
      setPaymentVerified(false);
      setVerificationMode(null);
      setQrExpired(false);
      setQrExpiresIn("");
      setStatusMessage("Creating unique UPI order...");

      const res = await fetch(`${UPI_PAY_BASE_URL}/create-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          middleName: middleName.trim() || undefined,
          lastName: lastName.trim(),
          amount: totalToPay.toFixed(2)
        })
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Failed to generate QR code");
      }

      if (!data.orderId || !data.qr) {
        throw new Error("Invalid payment gateway response");
      }

      const resolvedUpiId =
        typeof data.upiId === "string" ? data.upiId.trim() : "";

      if (!resolvedUpiId) {
        throw new Error("Payment gateway did not return a configured UPI ID");
      }

      const finalAmount = Number(data.finalAmount);
      const resolvedCreatedAt = Number(data.createdAt);

      setOrderId(data.orderId);
      setQrImage(data.qr);
      setDynamicUpiId(resolvedUpiId);
      setGatewayAmount(Number.isFinite(finalAmount) ? finalAmount : totalToPay);
      setQrCreatedAt(Number.isFinite(resolvedCreatedAt) ? resolvedCreatedAt : Date.now());
      setStatusMessage("Waiting for payment...");

      startStatusPolling(data.orderId);
    } catch (err: unknown) {
      setStatusMessage("Unable to generate QR. Please retry.");
      alert(getErrorMessage(err, "Unable to generate payment QR"));
    } finally {
      setQrLoading(false);
    }
  }

  async function approvePaymentManually() {
    if (!orderId) {
      alert("Generate QR first, then approve payment manually.");
      return;
    }

    try {
      primeAudioPlayback();
      setManualApproving(true);

      const res = await fetch(`${UPI_PAY_BASE_URL}/manual-verify/${orderId}`, {
        method: "POST"
      });

      const data = await res.json().catch(() => ({}));

      if (!res.ok) {
        throw new Error(data.error || "Manual verification failed");
      }

      markPaymentCompleted("MANUAL", "Payment completed and approved by clinic staff.");
    } catch (err: unknown) {
      alert(getErrorMessage(err, "Failed to approve payment manually"));
    } finally {
      setManualApproving(false);
    }
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

    } catch (err: unknown) {
      alert(getErrorMessage(err, "Billing failed"));
    } finally {
      setLoading(false);
    }
  }

  async function proceedToPayment() {
    if (requiresPayment && !isPayerNameValid) {
      alert("Please fill first and last name before proceeding to payment.");
      return;
    }

    setStep(2);

    if (!requiresPayment || qrImage || orderId || gatewayBusy || paymentVerified) {
      return;
    }

    await generateDynamicQr();
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

            <div>
              <h3 className="text-sm font-bold text-gray-900 border-b pb-2 mb-4">Payer Name (Aadhaar)</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    First Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                    value={firstName}
                    onChange={e => setFirstName(e.target.value)}
                    placeholder="First name"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Middle Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                    value={middleName}
                    onChange={e => setMiddleName(e.target.value)}
                    placeholder="Middle name (optional)"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-gray-600 mb-1.5 uppercase tracking-wide">
                    Last Name
                  </label>
                  <input
                    type="text"
                    className="w-full px-3 py-3 bg-white border border-gray-200 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none transition-shadow"
                    value={lastName}
                    onChange={e => setLastName(e.target.value)}
                    placeholder="Last name"
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500 mt-2">
                First and last name are required to match bank notification format.
              </p>
            </div>
            
            <div className="pt-4 flex flex-col gap-4 items-end">
              <div className="text-right pb-4">
                 <p className="text-sm text-gray-500 mb-1">Total to collect from patient:</p>
                 <p className="text-2xl font-bold text-gray-900">₹{totalToPay.toFixed(2)}</p>
              </div>
              <button
                onClick={() => {
                  void proceedToPayment();
                }}
                disabled={(currentCharges === 0 && pendingCleared === 0) || gatewayBusy}
                className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-8 py-3 rounded-lg font-bold transition-transform active:scale-95 disabled:opacity-50"
              >
                {requiresPayment ? "Proceed to Payment & Generate QR" : "Proceed to Payment"}
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
                      <span className="text-emerald-600">₹{totalToPay.toFixed(2)}</span>
                    </div>
                    {requiresPayment && (
                      <>
                        <div className="flex justify-between text-gray-600">
                          <span>Payer Name</span>
                          <span className="font-medium text-right">{payerFullName || "-"}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Gateway Final Amount</span>
                          <span className="font-medium text-indigo-600">₹{payableForQr.toFixed(2)}</span>
                        </div>
                      </>
                    )}
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
              <div className="rounded-[28px] bg-[#e9edf2] p-6 shadow-inner">
                <div className={`mx-auto flex max-w-[380px] flex-col items-center text-center ${totalToPay > 0 ? "opacity-100" : "opacity-40"}`}>
                  <div className="w-full rounded-[30px] bg-white px-6 py-8 shadow-[0_10px_30px_rgba(0,0,0,0.10)]">
                    {paymentVerified ? (
                      <div
                        role="status"
                        className="flex min-h-[470px] flex-col items-center justify-center text-center"
                      >
                        <div className="relative flex h-24 w-24 items-center justify-center">
                          <span className="absolute inset-0 rounded-full bg-emerald-200/80 animate-ping" />
                          <span className="absolute inset-[10px] rounded-full bg-emerald-100 animate-pulse" />
                          <span className="relative flex h-24 w-24 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg shadow-emerald-300/70">
                            <ShieldCheck className="h-12 w-12 animate-bounce" />
                          </span>
                        </div>
                        <p className="mt-8 text-3xl font-extrabold text-emerald-600">
                          Payment Completed
                        </p>
                        <p className="mt-3 text-lg font-semibold text-gray-700">
                          {verificationMode === "MANUAL" ? "Verified manually by clinic staff" : "Verified automatically from bank notification"}
                        </p>
                        <p className="mt-4 text-4xl font-black text-gray-900">
                          ₹{payableForQr.toFixed(2)}
                        </p>
                      </div>
                    ) : (
                      <div className="flex min-h-[470px] flex-col items-center justify-center">
                        <div className="relative inline-block">
                          {qrImage ? (
                            <>
                              <img
                                src={qrImage}
                                alt="Dynamic payment QR"
                                className={`h-[260px] w-[260px] object-contain transition-opacity duration-300 ${qrExpired ? "opacity-20" : "opacity-100"}`}
                              />
                              <img
                                src="/gpay.gif"
                                alt="Google Pay"
                                className="absolute left-1/2 top-1/2 h-[60px] w-[60px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-white p-2 shadow-sm object-contain"
                              />
                            </>
                          ) : (
                            <div className="flex h-[260px] w-[260px] items-center justify-center rounded-xl border border-dashed border-gray-300 bg-gray-50 px-8">
                              <div className="flex flex-col items-center gap-3 text-center text-gray-500">
                                <QrCode className="h-10 w-10 text-gray-400" />
                                <span className="text-sm font-medium">Generate QR to begin payment</span>
                              </div>
                            </div>
                          )}
                        </div>

                        {qrImage && (
                          <>
                            <p className="mt-7 text-[18px] font-medium text-gray-600">
                              UPI ID: {displayedUpiId}
                            </p>
                            <p className="mt-4 text-[22px] font-black text-black">
                              Pay exactly: ₹{payableForQr.toFixed(2)}
                            </p>
                            <p className={`mt-5 text-[18px] font-medium ${qrExpired ? "text-red-700" : "text-[#d93025]"}`}>
                              {qrExpiresIn}
                            </p>
                            <p className={`mt-8 text-[22px] font-semibold ${qrExpired ? "text-red-600" : "text-gray-600"}`}>
                              {qrExpired ? "QR expired" : statusMessage}
                            </p>
                          </>
                        )}

                        {!qrImage && (
                          <p className="mt-8 text-lg font-medium text-gray-500">
                            Your dynamic QR will appear here.
                          </p>
                        )}
                      </div>
                    )}
                  </div>

                  <p className="mt-7 text-[18px] font-medium text-black">
                    Scan to pay with any UPI app
                  </p>

                  {orderId && !paymentVerified && (
                    <p className="mt-2 text-xs text-gray-500">Order ID: {orderId}</p>
                  )}
                </div>

                {totalToPay > 0 && (
                  <div className="mx-auto mt-8 max-w-[380px] space-y-3">
                    <button
                      onClick={generateDynamicQr}
                      disabled={gatewayBusy || !isPayerNameValid}
                      className="w-full flex justify-center items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 border border-indigo-200"
                    >
                      {qrLoading ? (
                        <>
                          <Loader2 className="w-5 h-5 animate-spin" />
                          Generating Dynamic QR...
                        </>
                      ) : (
                        qrImage ? "Regenerate Dynamic QR" : "Generate Dynamic QR"
                      )}
                    </button>

                    {!paymentVerified && (
                      <>
                        <button
                          onClick={approvePaymentManually}
                          disabled={gatewayBusy || !orderId || qrExpired}
                          className="w-full flex justify-center items-center gap-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 py-3 rounded-xl text-sm font-bold transition-colors disabled:opacity-50 border border-emerald-200"
                        >
                          {manualApproving ? (
                            <>
                              <Loader2 className="w-5 h-5 animate-spin" />
                              Approving Payment...
                            </>
                          ) : (
                            "Approve Payment Manually"
                          )}
                        </button>

                        {checkingStatus && !qrExpired && (
                          <div className="w-full flex items-center justify-center gap-2 text-xs text-gray-600 bg-gray-50 border border-gray-200 rounded-xl py-2 px-3">
                            <Loader2 className="w-4 h-4 animate-spin" />
                            Auto-checking bank notification...
                          </div>
                        )}
                      </>
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
