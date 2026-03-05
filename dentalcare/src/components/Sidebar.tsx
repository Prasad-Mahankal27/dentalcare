import {
  LayoutDashboard,
  Calendar,
  Users,
  Settings,
  LogOut,
  Plus,
  X
} from "lucide-react";

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
  const menuItems = [
    { icon: LayoutDashboard, label: "Dashboard", hasAdd: false },
    { icon: Calendar, label: "Appointments", hasAdd: true },
    { icon: Users, label: "Doctors", hasAdd: true }
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
          lg:translate-x-0
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

        <nav className="px-3 space-y-1">
          {menuItems.map(item => {
            const isActive = activeItem === item.label;

            return (
              <div
                key={item.label}
                className={`flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer
                  ${
                    isActive
                      ? "bg-emerald-100 text-emerald-700 font-semibold"
                      : "text-gray-600 hover:bg-gray-50"
                  }`}
              >
                <div className="flex items-center gap-3">
                  <item.icon className="w-4 h-4" />
                  <span className="text-sm">{item.label}</span>
                </div>

                {item.hasAdd && (
                  <Plus className="w-4 h-4 text-gray-400" />
                )}
              </div>
            );
          })}
        </nav>

        <div className="absolute bottom-4 left-0 right-0 px-3 space-y-1">
          <div className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded">
            <Settings className="w-4 h-4" />
            <span className="text-sm">Setting</span>
          </div>

          <div
            onClick={onLogout}
            className="flex items-center gap-3 px-3 py-2 text-gray-600 hover:bg-gray-50 rounded cursor-pointer"
          >
            <LogOut className="w-4 h-4" />
            <span className="text-sm">Logout</span>
          </div>
        </div>
      </div>
    </>
  );
}
