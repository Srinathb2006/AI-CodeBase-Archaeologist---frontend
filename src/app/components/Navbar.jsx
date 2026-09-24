import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { useState, useEffect, useRef } from "react";
import { Menu, Bell, User, FolderOpen, ChevronDown, Check } from "lucide-react";
import { Button } from "./Button";
import { getCurrentUser, logout } from "../services/authService";
import { getRepositories } from "../services/storageService";

export function Navbar({ onMenuClick, showMenu = true }) {
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [repoDropdownOpen, setRepoDropdownOpen] = useState(false);
  const [repositories, setRepositories] = useState([]);
  const [selectedRepoId, setSelectedRepoId] = useState("");
  const repoDropdownRef = useRef(null);
  const location = useLocation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [user, setUser] = useState(() => getCurrentUser() || {});

  useEffect(() => {
    const handleUpdate = () => {
      setUser(getCurrentUser() || {});
    };
    window.addEventListener("userProfileUpdated", handleUpdate);
    return () => window.removeEventListener("userProfileUpdated", handleUpdate);
  }, []);

  useEffect(() => {
    const handlePointerDown = (event) => {
      if (repoDropdownRef.current && !repoDropdownRef.current.contains(event.target)) {
        setRepoDropdownOpen(false);
      }
    };

    document.addEventListener("mousedown", handlePointerDown);
    return () => document.removeEventListener("mousedown", handlePointerDown);
  }, []);

  useEffect(() => {
    const loadRepositories = async () => {
      try {
        const data = await getRepositories();
        const repoList = Array.isArray(data) ? data : [];
        setRepositories(repoList);

        const repoIdFromUrl = searchParams.get("repoId");
        if (repoIdFromUrl) {
          setSelectedRepoId(repoIdFromUrl);
        } else if (repoList.length > 0) {
          setSelectedRepoId((current) => current || repoList[0].id);
        } else {
          setSelectedRepoId("");
        }
      } catch (error) {
        console.error("Failed to load repositories for navbar selector:", error);
      }
    };

    loadRepositories();
  }, [location.search]);

  const showRepositorySelector = !["/", "/auth"].includes(location.pathname);
  const selectedRepository = repositories.find((repo) => String(repo.id) === String(selectedRepoId));

  const handleRepositoryChange = (nextRepoId) => {
    setSelectedRepoId(nextRepoId);
    setRepoDropdownOpen(false);

    const nextSearchParams = new URLSearchParams(location.search);
    if (nextRepoId) {
      nextSearchParams.set("repoId", nextRepoId);
    } else {
      nextSearchParams.delete("repoId");
    }

    setSearchParams(nextSearchParams, { replace: true });
    navigate({ pathname: location.pathname, search: nextSearchParams.toString() ? `?${nextSearchParams.toString()}` : "" });
  };

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
          {showRepositorySelector && (
            <div ref={repoDropdownRef} className="hidden md:block relative z-[60]">
              <button
                id="global-repo-selector"
                type="button"
                aria-haspopup="listbox"
                aria-expanded={repoDropdownOpen}
                onClick={() => setRepoDropdownOpen((open) => !open)}
                className="flex min-w-[230px] max-w-[320px] items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#0f1020]/80 px-3 py-2 text-sm text-white shadow-lg shadow-black/20 backdrop-blur-xl transition-all hover:border-primary/50 hover:bg-[#171329]/90 focus:outline-none focus:ring-2 focus:ring-primary/50"
              >
                <span className="flex min-w-0 items-center gap-2">
                  <FolderOpen className="w-4 h-4 text-primary shrink-0" />
                  <span className="truncate">
                    {selectedRepository?.name || (repositories.length > 0 ? "Select repository" : "No repositories yet")}
                  </span>
                </span>
                <ChevronDown className={`w-4 h-4 text-slate-300 shrink-0 transition-transform ${repoDropdownOpen ? "rotate-180" : ""}`} />
              </button>

              {repoDropdownOpen && (
                <div
                  role="listbox"
                  aria-labelledby="global-repo-selector"
                  className="absolute right-0 mt-2 max-h-80 w-full min-w-[260px] overflow-y-auto rounded-xl border border-white/10 bg-[#111122]/95 p-1.5 text-white shadow-2xl shadow-black/40 backdrop-blur-xl z-[80]"
                >
                  {repositories.length > 0 ? (
                    repositories.map((repo) => {
                      const isSelected = String(repo.id) === String(selectedRepoId);
                      return (
                        <button
                          key={repo.id}
                          type="button"
                          role="option"
                          aria-selected={isSelected}
                          onClick={() => handleRepositoryChange(String(repo.id))}
                          className={`flex w-full items-center justify-between gap-3 rounded-lg px-3 py-2 text-left text-sm transition-colors ${
                            isSelected
                              ? "bg-primary/25 text-white"
                              : "text-slate-200 hover:bg-primary/15 hover:text-white"
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{repo.name}</span>
                            <span className="block truncate text-[11px] text-slate-400">
                              {(repo.files || 0).toLocaleString()} files
                            </span>
                          </span>
                          {isSelected && <Check className="w-4 h-4 text-primary shrink-0" />}
                        </button>
                      );
                    })
                  ) : (
                    <div className="px-3 py-2 text-sm text-slate-400">No repositories yet</div>
                  )}
                </div>
              )}
            </div>
          )}

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
