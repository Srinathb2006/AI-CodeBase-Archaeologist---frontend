import { Link, useNavigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { Menu, Bell, User } from "lucide-react";
import { Button } from "./Button";
import { getCurrentUser, logout } from "../services/authService";

export function Navbar({ onMenuClick, showMenu = true }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const navigate = useNavigate();
  const [user, setUser] = useState(() => getCurrentUser() || {});

  useEffect(() => {
    const handleUpdate = () => {
      setUser(getCurrentUser() || {});
    };
    window.addEventListener("userProfileUpdated", handleUpdate);
    return () => window.removeEventListener("userProfileUpdated", handleUpdate);
  }, []);

  const handleLogout = async () => {
    try {
      await logout();
      setDropdownOpen(false);
      navigate("/auth");
    } catch (error) {
      console.error("Logout failed:", error);
    }
  };

  const userName = user.fullName || "User";
  const userPicture = user.picture;
  const userAvatarColor = user.avatarColor;
  const userAvatarInitials = user.avatarInitials;

  return (
    <nav className="border-b border-border bg-card/50 backdrop-blur-xl sticky top-0 z-50">
      <div className="px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-4">
          {showMenu && (
            <Button variant="ghost" size="sm" onClick={onMenuClick}>
              <Menu className="w-5 h-5" />
            </Button>
          )}
          <Link to="/" className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="font-bold text-white">A</span>
            </div>
            <span className="font-semibold">AI Codebase Archaeologist</span>
          </Link>
        </div>

        <div className="flex items-center gap-3 relative">
          <Button variant="ghost" size="sm">
            <Bell className="w-5 h-5" />
          </Button>
          <div className="relative">
            <Button variant="ghost" size="sm" onClick={() => setDropdownOpen(!dropdownOpen)} className="p-1.5 rounded-full overflow-hidden flex items-center justify-center">
              {userPicture ? (
                <img src={userPicture} alt={userName} className="w-6 h-6 rounded-full object-cover" referrerPolicy="no-referrer" />
              ) : userAvatarInitials ? (
                <div
                  className="w-6 h-6 rounded-full flex items-center justify-center text-white text-[10px] font-bold"
                  style={{ backgroundColor: userAvatarColor || "#7C3AED" }}
                >
                  {userAvatarInitials}
                </div>
              ) : (
                <User className="w-5 h-5" />
              )}
            </Button>
            {dropdownOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1e293b] border border-border rounded-xl shadow-xl py-1 z-50">
                <div className="px-4 py-2 border-b border-border text-xs text-muted-foreground font-medium truncate">
                  Logged in as {userName}
                </div>
                <Link
                  to="/settings"
                  className="block px-4 py-2 text-sm text-foreground hover:bg-slate-800 transition-colors"
                  onClick={() => setDropdownOpen(false)}
                >
                  Settings
                </Link>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="w-full text-left block px-4 py-2 text-sm text-red-500 hover:bg-slate-800 transition-colors font-medium cursor-pointer"
                >
                  Log out
                </button>
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
}
