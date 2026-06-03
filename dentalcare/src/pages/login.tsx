import { useEffect, useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import '../index.css';
import loginHeroImage from "../assets/login.png";
import orisynLogo from "../assets/Orisyn_logo.png";

interface AuthPayload {
  token: string;
  id: number;
  name: string;
  email?: string | null;
  role: string;
  clinicId?: string | null;
}

interface BootstrapStatusResult {
  needsAdminSetup: boolean;
  hasLocalUsers?: boolean;
  remoteLoginAvailable?: boolean;
}

const BACKEND_BASE_URL = "http://127.0.0.1:4000";
const BOOTSTRAP_RETRY_DELAY_MS = 1200;
const BOOTSTRAP_RETRY_TIMEOUT_MS = 30000;

function backendUrl(path: string) {
  return `${BACKEND_BASE_URL}${path}`;
}

export default function Login({ onLogin }: any) {
  const [isLoadingSetupState, setIsLoadingSetupState] = useState(true);
  const [needsAdminSetup, setNeedsAdminSetup] = useState(false);
  const [hasLocalUsers, setHasLocalUsers] = useState(false);
  const [remoteLoginAvailable, setRemoteLoginAvailable] = useState(false);
  const [authMode, setAuthMode] = useState<"login" | "setup">("login");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

  const [setupName, setSetupName] = useState("System Admin");
  const [setupEmail, setSetupEmail] = useState("");
  const [setupPassword, setSetupPassword] = useState("");
  const [confirmSetupPassword, setConfirmSetupPassword] = useState("");
  const [showSetupPassword, setShowSetupPassword] = useState(false);

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");

  useEffect(() => {
    let active = true;
    const startedAt = Date.now();

    const checkSetupState = async () => {
      while (active) {
        try {
          const res = await fetch(backendUrl("/auth/bootstrap-status"));
          const data = await res.json() as BootstrapStatusResult;

          if (!active) {
            return;
          }

          if (res.ok) {
            setNeedsAdminSetup(Boolean(data.needsAdminSetup));
            setHasLocalUsers(Boolean(data.hasLocalUsers));
            setRemoteLoginAvailable(Boolean(data.remoteLoginAvailable));

            if (data.needsAdminSetup) {
              setAuthMode("setup");
            }

            setErrorMessage("");
            return;
          }

          setErrorMessage("Unable to check setup status. Please try again.");
          return;
        } catch {
          if (!active) {
            return;
          }

          if (Date.now() - startedAt >= BOOTSTRAP_RETRY_TIMEOUT_MS) {
            setErrorMessage("Backend is unavailable. Please make sure services are running.");
            return;
          }

          await new Promise((resolve) => setTimeout(resolve, BOOTSTRAP_RETRY_DELAY_MS));
        }
      }
    };

    void checkSetupState().finally(() => {
      if (active) {
        setIsLoadingSetupState(false);
      }
    });

    return () => {
      active = false;
    };
  }, []);

  async function handleLogin() {
    if (!email.trim() || !password) {
      setErrorMessage("Email and password are required.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const res = await fetch(backendUrl("/auth/login"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), password })
      });

      const data = await res.json() as AuthPayload & { message?: string };
      if (res.ok) {
        onLogin(data);
        return;
      }

      setErrorMessage(data.message || "Login failed");
    } catch {
      setErrorMessage("Login failed. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  async function handleCreateInitialAdmin() {
    const trimmedEmail = setupEmail.trim().toLowerCase();
    const trimmedName = setupName.trim();

    if (!trimmedEmail || !setupPassword) {
      setErrorMessage("Admin email and password are required.");
      return;
    }

    if (!/.+@.+\..+/.test(trimmedEmail)) {
      setErrorMessage("Please enter a valid admin email.");
      return;
    }

    if (setupPassword.length < 6) {
      setErrorMessage("Password must be at least 6 characters.");
      return;
    }

    if (setupPassword !== confirmSetupPassword) {
      setErrorMessage("Password confirmation does not match.");
      return;
    }

    try {
      setIsSubmitting(true);
      setErrorMessage("");

      const res = await fetch(backendUrl("/auth/bootstrap-admin"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: trimmedName || "System Admin",
          email: trimmedEmail,
          password: setupPassword
        })
      });

      const data = await res.json() as AuthPayload & { message?: string };
      if (res.ok) {
        onLogin(data);
        return;
      }

      setErrorMessage(data.message || "Failed to create admin account");
    } catch {
      setErrorMessage("Failed to create admin account. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const pageTitle = authMode === "setup" ? "Create Admin Account" : "Login";
  const pageSubtitle = "The AI Operating System for Dental Clinics";

  return (
    <div className="flex h-screen">

      <div className="w-1/2 relative bg-gradient-to-br from-cyan-50 to-blue-100">
        <img
          src={loginHeroImage}
          alt="Medical Professional"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
        
        <div className="absolute top-10 left-10">
          <div className="flex flex-col gap-2">
            <img
              src={orisynLogo}
              alt="Orisyn logo"
              className="h-12 w-12 rounded-lg object-cover"
            />
            <h1 className="text-3xl font-extrabold text-white drop-shadow-md">Orisyn</h1>
            <p className="max-w-xs text-xs font-medium text-white/90 drop-shadow-md">
              The AI Operating System for Dental Clinics
            </p>
          </div>
        </div>

        <div className="absolute bottom-12 left-10 right-10">
          <p className="text-white text-lg font-medium leading-relaxed drop-shadow-lg">
            Experienced Healthcare, Of Course at a Time that Meets Your Lifestyle. Your Comfort, Your Care.
          </p>
        </div>
      </div>

      {/* Right Side - Login Form */}
      <div className="w-1/2 flex items-center justify-center bg-white">
        <div className="w-full max-w-md px-12">
          <div className="flex justify-center mb-8">
            <img
              src={orisynLogo}
              alt="Orisyn logo"
              className="h-14 w-14 rounded-xl object-cover shadow-lg"
            />
          </div>

          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-800">{pageTitle}</h2>
            <p className="text-gray-500 text-sm mt-2">{pageSubtitle}</p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            {isLoadingSetupState ? (
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                Checking setup state...
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 rounded-xl border border-slate-200 bg-slate-100 p-1">
                  <button
                    type="button"
                    onClick={() => setAuthMode("setup")}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      authMode === "setup"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Setup Admin
                  </button>

                  <button
                    type="button"
                    onClick={() => setAuthMode("login")}
                    className={`rounded-lg px-4 py-2 text-sm font-semibold transition-colors ${
                      authMode === "login"
                        ? "bg-white text-slate-900 shadow-sm"
                        : "text-slate-600 hover:text-slate-900"
                    }`}
                  >
                    Login User
                  </button>
                </div>

                {needsAdminSetup ? (
                  <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
                    This device has no local admin yet. Create the first admin here, or use Login User to pull a synced user from another device.
                  </div>
                ) : null}

                {authMode === "login" && !hasLocalUsers && !remoteLoginAvailable ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    No local users are available yet and cloud sync is not configured. Use Setup Admin first.
                  </div>
                ) : null}

                {authMode === "setup" && !needsAdminSetup ? (
                  <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-700">
                    Initial admin is already configured on this device. Use Login User for regular access.
                  </div>
                ) : null}

                {authMode === "setup" && !remoteLoginAvailable ? (
                  <div className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-3 text-sm text-orange-800">
                    Cloud sync is not configured on this device. Setup Admin will create a local account only until backend Supabase env settings are added.
                  </div>
                ) : null}

                {authMode === "setup" ? (
                  <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Admin Name
                  </label>
                  <input
                    type="text"
                    placeholder="System Admin"
                    value={setupName}
                    onChange={(e) => setSetupName(e.target.value)}
                    className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Admin Email
                  </label>
                  <input
                    type="email"
                    placeholder="admin@clinic.com"
                    value={setupEmail}
                    onChange={(e) => setSetupEmail(e.target.value)}
                    className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showSetupPassword ? "text" : "password"}
                      placeholder="Create password"
                      value={setupPassword}
                      onChange={(e) => setSetupPassword(e.target.value)}
                      className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors bg-gray-50 focus:bg-white pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowSetupPassword(!showSetupPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showSetupPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Confirm Password
                  </label>
                  <input
                    type={showSetupPassword ? "text" : "password"}
                    placeholder="Confirm password"
                    value={confirmSetupPassword}
                    onChange={(e) => setConfirmSetupPassword(e.target.value)}
                    className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>

                <button
                  onClick={handleCreateInitialAdmin}
                  disabled={isSubmitting || !needsAdminSetup}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-3.5 rounded-lg transition-all shadow-md hover:shadow-xl transform hover:-translate-y-0.5 mt-8 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting
                    ? "CREATING..."
                    : needsAdminSetup
                      ? "CREATE ADMIN ACCOUNT"
                      : "SETUP COMPLETE"}
                </button>
              </>
                ) : (
              <>
                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Email
                  </label>
                  <input
                    type="email"
                    placeholder="you@clinic.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors bg-gray-50 focus:bg-white"
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-gray-700 mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      type={showPassword ? "text" : "password"}
                      placeholder="Enter your password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="w-full px-4 py-3 text-sm border-2 border-gray-200 rounded-lg focus:outline-none focus:border-cyan-500 transition-colors bg-gray-50 focus:bg-white pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                      {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                </div>

                <button
                  onClick={handleLogin}
                  disabled={isSubmitting}
                  className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-3.5 rounded-lg transition-all shadow-md hover:shadow-xl transform hover:-translate-y-0.5 mt-8 disabled:cursor-not-allowed disabled:opacity-70"
                >
                  {isSubmitting ? "LOGGING IN..." : "LOGIN"}
                </button>
              </>
                )}
              </>
            )}

            {errorMessage && (
              <div className="rounded-lg border border-rose-200 bg-rose-50 px-4 py-3 text-sm font-medium text-rose-700">
                {errorMessage}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}