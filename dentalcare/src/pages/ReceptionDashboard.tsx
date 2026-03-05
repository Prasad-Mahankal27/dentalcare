import { useState } from "react";
import {
  UserPlus,
  Phone,
  User,
  MapPin,
  Calendar,
  Save,
  LogOut 
} from "lucide-react";

export default function ReceptionDashboard({ user }: any) {
  const token = user.token;

  const handleLogout = () => {
    localStorage.removeItem("user");
    window.location.reload(); 
  };

  const [form, setForm] = useState({
    name: "",
    phone: "",
    age: "",
    gender: "",
    address: ""
  });

  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function updateField(key: string, value: string) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  async function registerPatient() {
    setLoading(true);
    setError(null);
    setMessage(null);

    try {
      const res = await fetch(
        "http://localhost:4000/patients/register",
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({
            name: form.name.trim(),
            phone: form.phone.trim(),
            age: Number(form.age),
            gender: form.gender.trim(),
            address: form.address.trim()
          })
        }
      );

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.message || "Registration failed");
      }

      setMessage(`Patient registered successfully. ID: ${data.patientId}`);
      setForm({ name: "", phone: "", age: "", gender: "", address: "" });

    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-xl mx-auto mb-4 flex justify-between items-center bg-white p-4 rounded-lg border shadow-sm">
        <div className="text-sm text-gray-500">
          Logged in as: <span className="font-semibold">{user.role}</span>
        </div>
        <button 
          onClick={handleLogout}
          className="flex items-center gap-2 text-sm font-medium text-red-600 hover:text-red-800 transition-colors"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </button>
      </div>

      <div className="max-w-xl mx-auto bg-white rounded-lg border shadow-sm p-6">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <UserPlus className="w-6 h-6 text-emerald-600" />
          <h1 className="text-xl font-semibold text-gray-800">
            Patient Registration
          </h1>
        </div>

        {/* Messages */}
        {message && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-800 p-3 rounded">
            {message}
          </div>
        )}

        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-800 p-3 rounded">
            {error}
          </div>
        )}

        {/* Form */}
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={form.name}
                onChange={e => updateField("name", e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Phone</label>
            <div className="relative">
              <Phone className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                value={form.phone}
                onChange={e => updateField("phone", e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Age</label>
            <div className="relative">
              <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="number"
                value={form.age}
                onChange={e => updateField("age", e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Gender</label>
            <select
              value={form.gender}
              onChange={e => updateField("gender", e.target.value)}
              className="w-full px-3 py-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none"
            >
              <option value="">Select</option>
              <option value="Male">Male</option>
              <option value="Female">Female</option>
              <option value="Other">Other</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Address</label>
            <div className="relative">
              <MapPin className="absolute left-3 top-3 w-4 h-4 text-gray-400" />
              <textarea
                rows={3}
                value={form.address}
                onChange={e => updateField("address", e.target.value)}
                className="w-full pl-10 pr-3 py-2 border rounded focus:ring-2 focus:ring-emerald-500 outline-none resize-none"
              />
            </div>
          </div>
        </div>

        {/* Action */}
        <button
          onClick={registerPatient}
          disabled={loading}
          className="mt-6 w-full flex items-center justify-center gap-2 bg-emerald-600 text-white py-2 rounded hover:bg-emerald-700 disabled:opacity-50 transition-colors"
        >
          <Save className="w-4 h-4" />
          {loading ? "Saving..." : "Register Patient"}
        </button>
      </div>
    </div>
  );
}