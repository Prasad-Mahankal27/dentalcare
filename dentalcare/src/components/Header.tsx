import { Menu } from "lucide-react";

interface HeaderProps {
  user: any;
  onLogout: () => void;
  searchQuery: string;
  setSearchQuery: (val: string) => void;
  onSearch: () => void;
  onMenuClick?: () => void;
}

export default function Header({
  user,
  searchQuery,
  setSearchQuery,
  onSearch,
  onMenuClick
}: HeaderProps) {
  return (
    <div className="h-14 bg-white border-b flex items-center px-3 sm:px-6 gap-3">
      
      <button
        onClick={onMenuClick}
        className="lg:hidden p-2 rounded hover:bg-gray-100"
      >
        <Menu className="w-5 h-5 text-gray-700" />
      </button>

      <div className="flex-1 flex justify-center">
        <div className="flex gap-2 w-full max-w-md">
          <input
            type="text"
            placeholder="Enter Patient ID or Phone"
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="flex-1 px-3 py-1.5 border rounded-md text-sm
                       focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button
            onClick={onSearch}
            className="bg-blue-600 text-white px-4 rounded-md
                       text-sm hover:bg-blue-700"
          >
            Search
          </button>
        </div>
      </div>

      <div className="flex items-center gap-3 sm:gap-4 whitespace-nowrap">
        <span className="hidden sm:block text-sm text-gray-600">
          {user.role === "DOCTOR" ? "Doctor" : "Receptionist"}
        </span>
      
      </div>
    </div>
  );
}
