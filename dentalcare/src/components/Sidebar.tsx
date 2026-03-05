import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  LogOut,
  Plus,
  X
} from "lucide-react";
import { useNavigate } from "react-router-dom";

interface SidebarProps {
  activeItem?: string;
  onLogout?: () => void;
  isOpen?: boolean;
  onClose?: () => void;
}

export function Sidebar({
  activeItem = "Dashboard",
  onLogout,
  isOpen,
  onClose
}: SidebarProps) {
  const navigate = useNavigate();

  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", path: "/doctor", hasAdd: false },
    { icon: Calendar, label: "Appointments", path: "/doctor/appointments", hasAdd: true },
    { icon: Users, label: "Doctors", path: "/doctor/doctors", hasAdd: true }
  ];

  return (
    <>
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-black/30 z-40 lg:hidden"
        />
      )}

      <div
        className={`
          fixed lg:static inset-y-0 left-0 z-50
          w-52 bg-white border-r border-gray-200
          transform transition-transform duration-300
          ${isOpen ? "translate-x-0" : "-translate-x-full"}
          lg:translate-x-0 flex flex-col
        `}
      >
        <div className="flex items-center justify-between px-4 py-4">
          <h1 className="text-lg font-bold text-emerald-600">
            Smiles Dental Clinic
          </h1>

          <button
            onClick={onClose}
            className="lg:hidden p-1 hover:bg-gray-100 rounded"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <nav className="px-3 space-y-1 flex-1">
          {menuItems.map(item => {
            const isActive = activeItem === item.label;

            return (
              <div
                key={item.label}
                onClick={() => {
                  navigate(item.path);
                  onClose?.();
                }}
                className={`flex items-center justify-between px-3 py-2.5 rounded-lg cursor-pointer transition-colors
                  ${
                    isActive
                      ? "bg-emerald-50 text-emerald-700 font-bold"
                      : "text-gray-600 hover:bg-gray-50 font-medium"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className={`w-4 h-4 ${isActive ? "text-emerald-600" : "text-gray-500"}`} />
                  <span className="text-sm">{item.label}</span>
                </div>

                {item.hasAdd && (
                  <button className="p-0.5 hover:bg-gray-200 rounded-sm">
                    <Plus className="w-4 h-4 text-gray-400" />
                  </button>
                )}
              </div>
            );
          })}
        </nav>

        <div className="px-3 py-4 space-y-1 border-t border-gray-100">
          <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded-lg font-medium cursor-pointer">
            <Settings className="w-4 h-4 text-gray-500" />
            <span className="text-sm">Settings</span>
          </div>

          <div
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 text-red-600 hover:bg-red-50 rounded-lg cursor-pointer font-medium"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Logout</span>
          </div>
        </div>
      </div>
    </>
  );
}
