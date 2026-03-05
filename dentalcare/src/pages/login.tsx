import { useState } from "react";
import { Eye, EyeOff } from "lucide-react";
import '../index.css';

export default function Login({ onLogin }: any) {
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);

async function handleLogin() {
  const res = await fetch("http://localhost:4000/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ phone, password })
  });
  
  if (res.ok) {
    const data = await res.json();
    onLogin(data); 
  } else {
    const errorData = await res.json();
    alert(errorData.message || "Login failed");
  }
}

  return (
    <div className="flex h-screen">

      <div className="w-1/2 relative bg-gradient-to-br from-cyan-50 to-blue-100">
        <img
          src="src/assets/login.png"
          alt="Medical Professional"
          className="absolute inset-0 w-full h-full object-cover"
        />
        <div className="absolute inset-0 bg-gradient-to-t from-black/40 via-transparent to-transparent"></div>
        
        <div className="absolute top-10 left-10">
          <div className="flex items-center gap-3">
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
            <div className="bg-gradient-to-br from-cyan-500 to-blue-600 rounded-xl px-4 py-2 shadow-lg">
              <span className="text-white font-bold text-3xl">+</span>
            </div>
          </div>

          <div className="text-center mb-10">
            <h2 className="text-3xl font-bold text-gray-800">Login</h2>
            <p className="text-gray-500 text-sm mt-2">Welcome back! Please login to your account</p>
          </div>

          {/* Form */}
          <div className="space-y-6">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-2">
                Id
              </label>
              <input
                type="tel"
                placeholder="Enter your Unique id"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
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
              className="w-full bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 text-white font-semibold py-3.5 rounded-lg transition-all shadow-md hover:shadow-xl transform hover:-translate-y-0.5 mt-8"
            >
              LOGIN
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}