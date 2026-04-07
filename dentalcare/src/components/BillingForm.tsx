import { useState, useEffect, useRef } from "react";
import {
  FileText,
  CheckCircle,
  QrCode,
  IndianRupee,
  ArrowRight,
  ArrowLeft
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

  const [step, setStep] = useState<1 | 2>(1);
  const [currentCharges, setCurrentCharges] = useState(0);
  const [discount, setDiscount] = useState(0);
  const [paidAmount, setPaidAmount] = useState(0);
  const [pendingCleared, setPendingCleared] = useState(0);

  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);

  // Real UPI payment states
  const [paymentVerified, setPaymentVerified] = useState(false);
  const [generatingQr, setGeneratingQr] = useState(false);
  const [manuallyVerifying, setManuallyVerifying] = useState(false);
  const [paymentStatusText, setPaymentStatusText] = useState("Waiting for payment...");
  const [paymentStatusTone, setPaymentStatusTone] = useState<"neutral" | "success" | "error">("neutral");
  const [qrOrderId, setQrOrderId] = useState<string | null>(null);
  const [qrImage, setQrImage] = useState("");
  const [qrUpiId, setQrUpiId] = useState("");
  const [qrFinalAmount, setQrFinalAmount] = useState<number | null>(null);
  const [qrCreatedAt, setQrCreatedAt] = useState<number | null>(null);
  const [qrSecondsLeft, setQrSecondsLeft] = useState(0);
  const [qrError, setQrError] = useState("");
  const [showPaymentSuccessOverlay, setShowPaymentSuccessOverlay] = useState(false);
  const [animatePaymentSuccessOverlay, setAnimatePaymentSuccessOverlay] = useState(false);

  const hasPlayedPaymentSuccessRef = useRef(false);
  const successAnimationTimeoutRef = useRef<number | null>(null);
  const paymentAudioContextRef = useRef<AudioContext | null>(null);

  // First and last name are mandatory; middle name is optional.
  const [firstName, setFirstName] = useState("");
  const [middleName, setMiddleName] = useState("");
  const [lastName, setLastName] = useState("");

  const PAYMENT_SERVER_BASE_URL = "http://localhost:3002";
  const QR_VALIDITY_MS = 5 * 60 * 1000;

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
  const namesComplete =
    firstName.trim().length > 0 &&
    lastName.trim().length > 0;
  const canGenerateQr = totalToPay > 0 && namesComplete && !generatingQr && !loading;
  const isQrVisible = qrImage.length > 0;
  const isQrExpired = isQrVisible && !paymentVerified && qrSecondsLeft <= 0;

  const timerLabel = `${Math.floor(qrSecondsLeft / 60)}:${String(qrSecondsLeft % 60).padStart(2, "0")}`;

  function splitPatientName(fullName: string) {
    const parts = fullName.trim().split(/\s+/).filter(Boolean);

    if (parts.length === 0) {
      return { first: "", middle: "", last: "" };
    }

    if (parts.length === 1) {
      return { first: parts[0], middle: "", last: "" };
    }

    if (parts.length === 2) {
      return { first: parts[0], middle: "", last: parts[1] };
    }

    return {
      first: parts[0],
      middle: parts.slice(1, -1).join(" "),
      last: parts[parts.length - 1]
    };
  }

  function resetQrState() {
    setQrOrderId(null);
    setQrImage("");
    setQrUpiId("");
    setQrFinalAmount(null);
    setQrCreatedAt(null);
    setQrSecondsLeft(0);
    setManuallyVerifying(false);
    setShowPaymentSuccessOverlay(false);
    setAnimatePaymentSuccessOverlay(false);
    hasPlayedPaymentSuccessRef.current = false;
    if (successAnimationTimeoutRef.current) {
      window.clearTimeout(successAnimationTimeoutRef.current);
      successAnimationTimeoutRef.current = null;
    }
    setPaymentStatusText("Waiting for payment...");
    setPaymentStatusTone("neutral");
    setQrError("");
  }

  function getPaymentAudioContext() {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as Window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) {
        return null;
      }

      if (!paymentAudioContextRef.current || paymentAudioContextRef.current.state === "closed") {
        paymentAudioContextRef.current = new AudioContextClass();
      }

      const audioContext = paymentAudioContextRef.current;
      if (audioContext.state === "suspended") {
        void audioContext.resume();
      }

      return audioContext;
    } catch {
      return null;
    }
  }

  function playPaymentSuccessChime() {
    try {
      const audioContext = getPaymentAudioContext();
      if (!audioContext) {
        return;
      }

      const notes = [880, 1318.51];
      const baseTime = audioContext.currentTime + 0.01;

      notes.forEach((frequency, index) => {
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        const noteStart = baseTime + index * 0.16;

        oscillator.type = "sine";
        oscillator.frequency.setValueAtTime(frequency, noteStart);

        gainNode.gain.setValueAtTime(0.0001, noteStart);
        gainNode.gain.exponentialRampToValueAtTime(0.12, noteStart + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, noteStart + 0.2);

        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);

        oscillator.start(noteStart);
        oscillator.stop(noteStart + 0.22);
      });
    } catch {
      // Chime is best effort only; verification flow should continue silently if audio fails.
    }
  }

  useEffect(() => {
    if (!visit?.patient?.name) return;
    if (firstName || middleName || lastName) return;

    const parsedName = splitPatientName(visit.patient.name);
    setFirstName(parsedName.first);
    setMiddleName(parsedName.middle);
    setLastName(parsedName.last);
  }, [visit?.patient?.name, firstName, middleName, lastName]);

  // Reset verification if amount changes
  useEffect(() => {
    setPaymentVerified(false);
    resetQrState();
  }, [totalToPay]);

  useEffect(() => {
    if (!paymentVerified) {
      hasPlayedPaymentSuccessRef.current = false;
      setShowPaymentSuccessOverlay(false);
      setAnimatePaymentSuccessOverlay(false);
      if (successAnimationTimeoutRef.current) {
        window.clearTimeout(successAnimationTimeoutRef.current);
        successAnimationTimeoutRef.current = null;
      }
      return;
    }

    if (hasPlayedPaymentSuccessRef.current) {
      return;
    }

    hasPlayedPaymentSuccessRef.current = true;
    setShowPaymentSuccessOverlay(true);
    setAnimatePaymentSuccessOverlay(true);
    playPaymentSuccessChime();

    successAnimationTimeoutRef.current = window.setTimeout(() => {
      setAnimatePaymentSuccessOverlay(false);
      successAnimationTimeoutRef.current = null;
    }, 1400);
  }, [paymentVerified]);

  useEffect(() => {
    return () => {
      if (successAnimationTimeoutRef.current) {
        window.clearTimeout(successAnimationTimeoutRef.current);
      }

      if (paymentAudioContextRef.current && paymentAudioContextRef.current.state !== "closed") {
        void paymentAudioContextRef.current.close();
      }
      paymentAudioContextRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!qrCreatedAt || paymentVerified) return;

    const updateTimer = () => {
      const remainingMs = QR_VALIDITY_MS - (Date.now() - qrCreatedAt);
      const nextSeconds = Math.max(0, Math.ceil(remainingMs / 1000));
      setQrSecondsLeft(nextSeconds);

      if (remainingMs <= 0) {
        setPaymentStatusText("QR expired. Generate a new QR.");
        setPaymentStatusTone("error");
      }
    };

    updateTimer();
    const timerId = window.setInterval(updateTimer, 1000);

    return () => {
      window.clearInterval(timerId);
    };
  }, [qrCreatedAt, paymentVerified]);

  useEffect(() => {
    if (!qrOrderId || paymentVerified || isQrExpired) return;

    let cancelled = false;

    const pollId = window.setInterval(async () => {
      try {
        const res = await fetch(`${PAYMENT_SERVER_BASE_URL}/status/${qrOrderId}`);
        if (!res.ok) return;

        const data = await res.json();
        if (cancelled) return;

        if (data.status === "PAID") {
          setPaymentVerified(true);
          setPaymentStatusText("Payment successful!");
          setPaymentStatusTone("success");
        }
      } catch {
        // Keep polling; transient network issues should not fail the flow.
      }
    }, 2000);

    return () => {
      cancelled = true;
      window.clearInterval(pollId);
    };
  }, [qrOrderId, paymentVerified, isQrExpired]);

  async function generateDynamicQr() {
    if (!canGenerateQr) return;

    try {
      // Warm audio from a user gesture so async email verification can still play chime.
      void getPaymentAudioContext();
      setGeneratingQr(true);
      setManuallyVerifying(false);
      setPaymentVerified(false);
      setQrError("");
      setPaymentStatusText("Waiting for payment...");
      setPaymentStatusTone("neutral");

      const res = await fetch(`${PAYMENT_SERVER_BASE_URL}/create-payment`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          firstName: firstName.trim(),
          middleName: middleName.trim(),
          lastName: lastName.trim(),
          amount: Number(totalToPay.toFixed(2))
        })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Failed to generate UPI QR");
      }

      setQrOrderId(data.orderId);
      setQrImage(data.qr);
      setQrUpiId(data.upiId || "");
      setQrFinalAmount(Number(data.finalAmount));

      const createdAt =
        typeof data.createdAt === "number" && Number.isFinite(data.createdAt)
          ? data.createdAt
          : Date.now();

      setQrCreatedAt(createdAt);
      setQrSecondsLeft(Math.ceil(QR_VALIDITY_MS / 1000));
    } catch (err: any) {
      resetQrState();
      setQrError(err.message || "Failed to generate QR code");
    } finally {
      setGeneratingQr(false);
    }
  }

  async function verifyPaymentManually() {
    if (!qrOrderId || manuallyVerifying) return;

    try {
      // Keep context active before marking success on manual verification.
      void getPaymentAudioContext();
      setManuallyVerifying(true);
      setQrError("");

      const res = await fetch(`${PAYMENT_SERVER_BASE_URL}/manual-verify/${qrOrderId}`, {
        method: "POST"
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || "Manual verification failed");
      }

      setPaymentVerified(true);
      setPaymentStatusText("Payment verified manually.");
      setPaymentStatusTone("success");
    } catch (err: any) {
      setQrError(err.message || "Manual verification failed");
    } finally {
      setManuallyVerifying(false);
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
                type="button"
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
              type="button"
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
                    type="button"
                    onClick={submitBilling}
                    disabled={!isFormValid || loading || submitted}
                    className="w-full flex justify-center items-center gap-2 bg-gray-900 hover:bg-gray-800 text-white px-6 py-4 rounded-xl font-bold transition-transform active:scale-[0.98] disabled:opacity-50 disabled:active:scale-100 shadow-md"
                  >
                    <FileText className="w-5 h-5 opacity-80" />
                    {loading ? "Generating Bill..." : "Finalize & Submit Bill"}
                  </button>

                  {totalToPay > 0 && !paymentVerified && (
                    <p className="text-xs text-amber-700 mt-3 text-center">
                      Generate QR and wait for payment verification before finalizing.
                    </p>
                  )}
                </div>
              </div>

              {/* QR Code Section */}
              <div className="border border-gray-200 rounded-xl p-6 bg-slate-100/70 shadow-sm">
                <div className="flex flex-col items-center gap-2 mb-5 text-center">
                  <div className="p-3 bg-white rounded-full shadow-sm border border-gray-200">
                    <QrCode className="w-6 h-6 text-gray-700" />
                  </div>
                  <span className="font-bold text-gray-900 text-lg">Generate Dynamic UPI QR</span>
                  <span className="text-sm text-gray-600">Use patient name and finalized billing amount</span>
                </div>

                <div className="space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    <input
                      type="text"
                      value={firstName}
                      onChange={(e) => setFirstName(e.target.value)}
                      placeholder="First Name"
                      className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                    <input
                      type="text"
                      value={middleName}
                      onChange={(e) => setMiddleName(e.target.value)}
                      placeholder="Middle Name (Optional)"
                      className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                    <input
                      type="text"
                      value={lastName}
                      onChange={(e) => setLastName(e.target.value)}
                      placeholder="Last Name"
                      className="w-full px-3 py-2.5 text-sm bg-white border border-gray-200 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                    />
                  </div>

                  <p className="text-xs text-gray-500 text-center">
                    Fill first and last name exactly before generating QR. Middle name is optional.
                  </p>

                  <button
                    type="button"
                    onClick={generateDynamicQr}
                    disabled={!canGenerateQr}
                    className="w-full py-3 rounded-lg font-bold text-white bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {generatingQr ? "Generating QR..." : "Generate QR"}
                  </button>

                  {!namesComplete && totalToPay > 0 && (
                    <p className="text-xs text-amber-700 text-center">
                      First name and last name are mandatory.
                    </p>
                  )}

                  {totalToPay <= 0 && (
                    <p className="text-xs text-gray-500 text-center">
                      Enter a payable amount in billing details to enable QR generation.
                    </p>
                  )}

                  {qrError && (
                    <p className="text-xs text-red-600 text-center">{qrError}</p>
                  )}
                </div>

                {isQrVisible && (
                  <div className="mt-6 flex flex-col items-center">
                    <div className="bg-white rounded-[30px] px-7 py-6 w-full max-w-[360px] text-center shadow-md">
                      <div className={`relative inline-block ${isQrExpired ? "opacity-30" : "opacity-100"}`}>
                        <img
                          src={qrImage}
                          alt="UPI payment QR"
                          className="w-[260px] h-[260px] mx-auto"
                        />
                        <img
                          src={`${PAYMENT_SERVER_BASE_URL}/gpay.gif`}
                          alt="Google Pay"
                          className="absolute left-1/2 top-1/2 w-[60px] h-[60px] -translate-x-1/2 -translate-y-1/2 bg-white rounded-full p-2"
                        />

                        {showPaymentSuccessOverlay && (
                          <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-white/92 backdrop-blur-[1px]">
                            <div className="relative flex flex-col items-center">
                              {animatePaymentSuccessOverlay && (
                                <span className="absolute -top-2 h-20 w-20 rounded-full bg-emerald-200/80 animate-ping" />
                              )}

                              <span
                                className={`relative flex h-16 w-16 items-center justify-center rounded-full bg-emerald-500 text-white shadow-lg transition-transform duration-500 ${
                                  animatePaymentSuccessOverlay ? "scale-110" : "scale-100"
                                }`}
                              >
                                <CheckCircle className="h-9 w-9" />
                              </span>

                              <p className="mt-3 text-base font-bold text-emerald-700">
                                Payment Completed
                              </p>
                            </div>
                          </div>
                        )}
                      </div>

                      <div className="mt-4 text-gray-600 text-[15px]">
                        UPI ID: {qrUpiId}
                      </div>

                      <div className="mt-1 text-[20px] font-semibold text-gray-900">
                        Pay exactly: ₹{qrFinalAmount?.toFixed(2)}
                      </div>

                      <div className={`mt-1 text-[18px] ${paymentVerified ? "text-emerald-600" : "text-red-600"}`}>
                        {paymentVerified ? "Payment received" : isQrExpired ? "QR Expired" : `Expires in ${timerLabel}`}
                      </div>

                      <div
                        className={`mt-2 text-[18px] font-semibold ${
                          paymentStatusTone === "success"
                            ? "text-emerald-600"
                            : paymentStatusTone === "error"
                              ? "text-red-600"
                              : "text-gray-600"
                        }`}
                      >
                        {paymentStatusText}
                      </div>
                    </div>

                    <p className="mt-4 text-lg text-gray-900 text-center">
                      Scan to pay with any UPI app
                    </p>

                    {!paymentVerified && qrOrderId && (
                      <button
                        type="button"
                        onClick={verifyPaymentManually}
                        disabled={manuallyVerifying}
                        className="mt-4 w-full max-w-[360px] py-3 rounded-lg font-bold text-indigo-700 bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 disabled:opacity-60 disabled:cursor-not-allowed transition-colors"
                      >
                        {manuallyVerifying ? "Verifying manually..." : "Verify Manually"}
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
