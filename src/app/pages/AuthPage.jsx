import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Terminal,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleLogin } from "@react-oauth/google";
import { isLoggedIn, login, signup, googleLogin as googleSignIn } from "../services/authService";

export function AuthPage() {
  const googleClientId = import.meta.env.VITE_GOOGLE_CLIENT_ID?.trim();
  const [isLogin, setIsLogin] = useState(true);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [loginMethod, setLoginMethod] = useState(null);
  const [errorMessage, setErrorMessage] = useState("");

  const navigate = useNavigate();

  // Handlers for the GoogleLogin component
  const handleGoogleSuccess = async (credentialResponse) => {
    setErrorMessage("");
    setLoginMethod("google");
    try {
      const idToken = credentialResponse?.credential;
      if (!idToken) {
        throw new Error("Google authentication failed: credential missing.");
      }
      await googleSignIn(idToken);
      navigate("/dashboard");
    } catch (err) {
      console.error("Google authentication error:", err);
      setErrorMessage(err.message || "Google sign-in failed. Please try again.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleError = (err) => {
    console.error("Google onError invoked:", err);
    setErrorMessage("Google sign-in failed. Please try again.");
    setIsLoading(false);
  };

  useEffect(() => {
    if (isLoggedIn()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage("");

    if (!email.trim() || !password.trim()) {
      setErrorMessage("Please fill out all credentials.");
      return;
    }

    if (!isLogin && !fullName.trim()) {
      setErrorMessage("Please enter your full name.");
      return;
    }

    if (password.length < 6) {
      setErrorMessage("Password must be at least 6 characters long.");
      return;
    }

    setIsLoading(true);
    setLoginMethod("email");

    try {
      if (isLogin) {
        await login(email, password);
      } else {
        await signup(email, password, fullName);
      }
      navigate("/dashboard");
    } catch (err) {
      setErrorMessage(err.message || "Authentication failed.");
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#070913] text-white flex flex-col justify-center items-center px-4 py-12 relative overflow-hidden font-sans">
      {/* Background Subtle Ambience */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:32px_32px] -z-10 pointer-events-none" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[350px] bg-purple-600/10 rounded-full blur-[140px] -z-10 pointer-events-none" />
      <div className="absolute bottom-1/4 left-1/2 -translate-x-1/2 translate-y-1/2 w-[500px] h-[300px] bg-indigo-600/10 rounded-full blur-[140px] -z-10 pointer-events-none" />

      {/* Centered Auth Card */}
      <div className="w-full max-w-[420px] relative z-10">
        <div className="bg-[#0b0e1b]/85 border border-white/10 rounded-2xl p-8 sm:p-9 shadow-2xl backdrop-blur-xl">
          {/* Header & Logo */}
          <div className="flex flex-col items-center text-center mb-8">
            <motion.div
              initial={{ scale: 0.85, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.4 }}
              className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-purple-500/20 mb-3.5 border border-purple-400/20"
            >
              <Terminal className="w-6 h-6 text-white" />
            </motion.div>
            <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
              AI Codebase Archaeologist
            </h1>
            <p className="text-slate-400 text-sm mt-1.5">
              {isLogin
                ? "Sign in to explore and analyze your codebases"
                : "Create an account to start analyzing repositories"}
            </p>
          </div>

          {/* Error Message */}
          <AnimatePresence mode="wait">
            {errorMessage && (
              <motion.div
                initial={{ opacity: 0, y: -8 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -8 }}
                className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 mb-5 flex items-start gap-2.5 text-red-400 text-xs"
              >
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                <div>
                  <span className="font-semibold">Authentication Error</span>
                  <p className="mt-0.5 opacity-90">{errorMessage}</p>
                </div>
              </motion.div>
            )}
          </AnimatePresence>

          {/* Google Login (if configured) */}
          <div className="space-y-4">
            {googleClientId ? (
              <div className="flex justify-center w-full">
                <GoogleLogin
                  theme="filled_black"
                  shape="pill"
                  width="356"
                  onSuccess={(credentialResponse) => {
                    setIsLoading(true);
                    handleGoogleSuccess(credentialResponse);
                  }}
                  onError={(err) => {
                    setIsLoading(false);
                    handleGoogleError(err);
                  }}
                />
              </div>
            ) : null}

            {googleClientId && (
              <div className="relative flex items-center justify-center my-5">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-white/[0.08]" />
                </div>
                <span className="relative px-3 bg-[#0b0e1b] text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                  Or continue with email
                </span>
              </div>
            )}
          </div>

          {/* Email / Password Form */}
          <form onSubmit={handleEmailSubmit} className="space-y-4">
            {!isLogin && (
              <motion.div
                initial={{ opacity: 0, height: 0 }}
                animate={{ opacity: 1, height: "auto" }}
                exit={{ opacity: 0, height: 0 }}
                className="space-y-1.5 overflow-hidden"
              >
                <label htmlFor="auth-full-name" className="text-xs font-semibold text-slate-300">
                  Full Name
                </label>
                <div className="relative group">
                  <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-purple-400 transition-colors">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    id="auth-full-name"
                    name="fullName"
                    type="text"
                    placeholder="Sarah Chen"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all disabled:opacity-50"
                  />
                </div>
              </motion.div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="auth-email" className="text-xs font-semibold text-slate-300">
                Email Address
              </label>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-purple-400 transition-colors">
                  <Mail className="w-4 h-4" />
                </div>
                <input
                  id="auth-email"
                  name="email"
                  type="email"
                  placeholder="you@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all disabled:opacity-50"
                />
              </div>
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label htmlFor="auth-password" className="text-xs font-semibold text-slate-300">
                  Password
                </label>
                {isLogin && (
                  <span className="text-xs text-purple-400/80 hover:text-purple-300 transition-colors cursor-pointer">
                    Forgot password?
                  </span>
                )}
              </div>
              <div className="relative group">
                <div className="absolute inset-y-0 left-0 pl-3.5 flex items-center pointer-events-none text-slate-500 group-focus-within:text-purple-400 transition-colors">
                  <Lock className="w-4 h-4" />
                </div>
                <input
                  id="auth-password"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                  className="w-full bg-white/[0.03] border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all disabled:opacity-50"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 transition-colors cursor-pointer"
                >
                  {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>
            </div>

            {isLogin && (
              <div className="flex items-center justify-between pt-0.5">
                <label
                  htmlFor="auth-remember-me"
                  className="flex items-center gap-2 cursor-pointer select-none"
                >
                  <input
                    id="auth-remember-me"
                    name="rememberMe"
                    type="checkbox"
                    checked={rememberMe}
                    onChange={(e) => setRememberMe(e.target.checked)}
                    disabled={isLoading}
                    className="rounded border-white/20 bg-white/[0.03] text-purple-600 focus:ring-0 focus:ring-offset-0 focus:outline-none w-3.5 h-3.5"
                  />
                  <span className="text-[11px] text-slate-400">Remember session for 30 days</span>
                </label>
              </div>
            )}

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-semibold py-2.5 rounded-xl transition-all shadow-lg shadow-purple-500/15 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2 active:scale-[0.99]"
            >
              {isLoading && loginMethod === "email" && (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              )}
              <span>{isLogin ? "Sign In" : "Create Account"}</span>
            </button>
          </form>

          {/* Toggle between Sign In / Sign Up */}
          <div className="mt-6 text-center text-xs text-slate-400 border-t border-white/[0.06] pt-5">
            <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>{" "}
            <button
              type="button"
              onClick={() => {
                setErrorMessage("");
                setIsLogin(!isLogin);
              }}
              className="text-purple-400 hover:text-purple-300 font-semibold cursor-pointer transition-colors ml-1"
            >
              {isLogin ? "Sign up" : "Sign in"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AuthPage;
