import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Mail,
  Lock,
  User,
  Eye,
  EyeOff,
  Terminal,
  Sparkles,
  Network,
  Database,
  FileText,
  AlertTriangle,
  ArrowRight,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import { GoogleLogin } from "@react-oauth/google";
import { isLoggedIn, login, signup, googleLogin as googleSignIn } from "../services/authService";

const GoogleIcon = (props) => (
  <svg viewBox="0 0 24 24" width="18" height="18" xmlns="http://www.w3.org/2000/svg" {...props}>
    <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
    <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
    <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
    <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
  </svg>
);

const features = [
  {
    icon: Network,
    title: "Interactive AST Mapping",
    description: "Trace imports, components, and module dependencies in real-time.",
    color: "text-purple-400 bg-purple-500/10",
  },
  {
    icon: Sparkles,
    title: "Contextual AI Assistant",
    description: "Chat with an AI that understands variables, functions, and code flows.",
    color: "text-indigo-400 bg-indigo-500/10",
  },
  {
    icon: Database,
    title: "Relational Schema Engine",
    description: "Visualize table relationships, column types, and foreign key flows.",
    color: "text-blue-400 bg-blue-500/10",
  },
  {
    icon: FileText,
    title: "AI-Generated Docs & Exports",
    description: "Export complete, interactive project documentation instantly.",
    color: "text-emerald-400 bg-emerald-500/10",
  },
];

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

    // Handlers for the GoogleLogin component (receives credentialResponse.credential)
    const handleGoogleSuccess = async (credentialResponse) => {
      // eslint-disable-next-line no-console
      console.groupCollapsed("Google onSuccess callback invoked");
      // eslint-disable-next-line no-console
      console.debug("credentialResponse (raw):", credentialResponse);
      setErrorMessage("");
      setLoginMethod("google");
      try {
        // Log before extracting token
        // eslint-disable-next-line no-console
        console.debug("Auth flow: extracting idToken from credentialResponse");
        const idToken = credentialResponse?.credential;
        // Log presence/length of token (avoid printing full token)
        // eslint-disable-next-line no-console
        console.debug("Google credential received, length=", idToken ? idToken.length : 0);

        if (!idToken) {
          const err = new Error("Google authentication failed: idToken missing from credentialResponse.");
          // eslint-disable-next-line no-console
          console.error(err.stack || err);
          throw err;
        }

        // Before calling backend
        // eslint-disable-next-line no-console
        console.debug("Calling authService.googleLogin with idToken (length):", idToken.length);
        try {
          // Log around the async backend call
          // eslint-disable-next-line no-console
          console.debug("Auth flow: calling googleSignIn...");
          await googleSignIn(idToken);
          // eslint-disable-next-line no-console
          console.debug("Auth flow: googleSignIn resolved successfully");
        } catch (innerErr) {
          // Log full stack and rethrow to surface the error to outer catch
          // eslint-disable-next-line no-console
          console.error("googleSignIn threw:", innerErr.stack || innerErr);
          throw innerErr;
        }

        // Navigate on success
        // eslint-disable-next-line no-console
        console.debug("Navigation: moving to /dashboard");
        navigate("/dashboard");
      } catch (err) {
        // Log full error stack and update UI — do NOT swallow the error.
        // eslint-disable-next-line no-console
        console.error("Google authentication error:", err.stack || err);
        setErrorMessage((err && (err.stack || err.message)) || "Google login failed.");
        // Rethrow so the error is visible in devtools and not silently swallowed.
        throw err;
      } finally {
        setIsLoading(false);
        // eslint-disable-next-line no-console
        console.groupEnd();
      }
    };

    const handleGoogleError = (err) => {
      // Detailed error handler
      // eslint-disable-next-line no-console
      console.error("Google onError invoked:", err);
      setErrorMessage("Google login failed. Please try again.");
      setIsLoading(false);
    };

  useEffect(() => {
    if (isLoggedIn()) {
      navigate("/dashboard", { replace: true });
    }
  }, [navigate]);

  // Note: Google login is handled by the `GoogleLogin` component's callbacks below.

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
    <div className="min-h-screen bg-[#070913] text-white flex items-stretch relative overflow-hidden font-sans">
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#ffffff02_1px,transparent_1px),linear-gradient(to_bottom,#ffffff02_1px,transparent_1px)] bg-[size:32px_32px] -z-10" />
      <div className="absolute top-[-20%] left-[-10%] w-[60%] h-[55%] bg-purple-600/10 rounded-full blur-[140px] -z-10" />
      <div className="absolute bottom-[-10%] right-[-15%] w-[50%] h-[50%] bg-blue-600/10 rounded-full blur-[140px] -z-10 animate-pulse" />

      <div className="w-full grid lg:grid-cols-12 max-w-[1920px] mx-auto relative z-10">
        <div className="lg:col-span-6 xl:col-span-5 flex flex-col justify-center px-6 py-12 md:px-16 xl:px-24 bg-[#070913]/60 backdrop-blur-md">
          <div className="w-full max-w-md mx-auto space-y-8">
            <div className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ duration: 0.5 }}
                className="w-14 h-14 rounded-2xl bg-gradient-to-br from-purple-500 via-indigo-500 to-blue-600 flex items-center justify-center shadow-lg shadow-indigo-500/20 mb-4"
              >
                <Terminal className="w-7 h-7 text-white" />
              </motion.div>
              <h1 className="text-3xl font-extrabold tracking-tight bg-gradient-to-r from-white via-slate-100 to-slate-400 bg-clip-text text-transparent">
                AI Codebase Archaeologist
              </h1>
              <p className="text-slate-400 text-sm mt-2">
                {isLogin
                  ? "Welcome back. Unlock the blueprints of your repository."
                  : "Create an account to start scanning your codebases."}
              </p>
            </div>

            <AnimatePresence mode="wait">
              {errorMessage && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -10 }}
                  className="bg-red-500/10 border border-red-500/20 rounded-xl p-3 flex items-start gap-2.5 text-red-400 text-xs"
                >
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div>
                    <span className="font-semibold">Authentication Error</span>
                    <p className="mt-0.5 opacity-90">{errorMessage}</p>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            <div className="space-y-4">
              {googleClientId ? (
                <GoogleLogin
                  onSuccess={(credentialResponse) => {
                    setIsLoading(true);
                    handleGoogleSuccess(credentialResponse);
                  }}
                  onError={(err) => {
                    setIsLoading(false);
                    handleGoogleError(err);
                  }}
                />
              ) : (
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-400">
                  Google sign-in is unavailable because VITE_GOOGLE_CLIENT_ID is not configured.
                </div>
              )}
            </div>

            <div className="relative flex items-center justify-center my-6">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-white/[0.08]" />
              </div>
              <span className="relative px-3 bg-[#070913] text-[10px] uppercase tracking-wider text-slate-500 font-bold">
                Or use email
              </span>
            </div>

            <form onSubmit={handleEmailSubmit} className="space-y-4">
              {!isLogin && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  exit={{ opacity: 0, height: 0 }}
                  className="space-y-1.5 overflow-hidden"
                >
                  <label htmlFor="auth-full-name" className="text-xs font-semibold text-slate-300">Full Name</label>
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
                      className="w-full bg-white/[0.02] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all disabled:opacity-50"
                    />
                  </div>
                </motion.div>
              )}

              <div className="space-y-1.5">
                  <label htmlFor="auth-email" className="text-xs font-semibold text-slate-300">Email Address</label>
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
                    className="w-full bg-white/[0.02] border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all disabled:opacity-50"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label htmlFor="auth-password" className="text-xs font-semibold text-slate-300">Password</label>
                  {isLogin && (
                    <a href="#" className="text-xs text-purple-400 hover:text-purple-300 hover:underline font-medium">
                      Forgot password?
                    </a>
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
                    placeholder="��������"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={isLoading}
                    className="w-full bg-white/[0.02] border border-white/10 rounded-xl pl-10 pr-10 py-2.5 text-sm text-white placeholder-slate-600 focus:outline-none focus:border-purple-500/50 focus:ring-2 focus:ring-purple-500/10 transition-all disabled:opacity-50"
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
                <div className="flex items-center justify-between pt-1">
                  <label htmlFor="auth-remember-me" className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      id="auth-remember-me"
                      name="rememberMe"
                      type="checkbox"
                      checked={rememberMe}
                      onChange={(e) => setRememberMe(e.target.checked)}
                      disabled={isLoading}
                      className="rounded border-white/20 bg-white/[0.02] text-purple-600 focus:ring-0 focus:ring-offset-0 focus:outline-none w-3.5 h-3.5"
                    />
                    <span className="text-[11px] text-slate-400">Remember session for 30 days</span>
                  </label>
                </div>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="w-full bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white font-semibold py-3 rounded-xl transition-all shadow-lg shadow-purple-500/10 flex items-center justify-center gap-2 text-sm disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer mt-2 active:scale-[0.99]"
              >
                {isLoading && loginMethod === "email" && (
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                )}
                <span>{isLogin ? "Sign In with Email" : "Create Account"}</span>
              </button>
            </form>

            <div className="mt-8 text-center text-xs text-slate-400 border-t border-white/[0.05] pt-6">
              <span>{isLogin ? "Don't have an account?" : "Already have an account?"}</span>{" "}
              <button
                type="button"
                onClick={() => {
                  setErrorMessage("");
                  setIsLogin(!isLogin);
                }}
                className="text-purple-400 hover:text-purple-300 hover:underline font-bold cursor-pointer"
              >
                {isLogin ? "Sign up" : "Sign in"}
              </button>
            </div>
          </div>
        </div>

        <div className="hidden lg:flex lg:col-span-6 xl:col-span-7 flex-col justify-center px-12 md:px-20 py-12 border-l border-white/[0.06] bg-[#070913]/30">
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[550px] h-[550px] bg-gradient-to-tr from-purple-500/10 to-indigo-500/10 rounded-full blur-[120px] -z-10 animate-pulse" />
          <div className="max-w-xl mx-auto space-y-12">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-xs font-semibold">
                <Sparkles className="w-3.5 h-3.5 text-purple-400 animate-pulse" />
                <span>Version 2.4.1 Active</span>
              </div>
              <h2 className="text-4xl font-extrabold tracking-tight text-white leading-tight">
                Understand and scan <br />
                <span className="bg-gradient-to-r from-purple-400 via-indigo-400 to-blue-400 bg-clip-text text-transparent">
                  complex repositories in minutes.
                </span>
              </h2>
              <p className="text-slate-400 text-base leading-relaxed">
                Connect your codebase and let the AI Archaeologist dig deep into your project layouts, database links, and API structures.
              </p>
            </div>

            <div className="grid gap-6">
              {features.map((feat, idx) => {
                const IconComponent = feat.icon;
                return (
                  <motion.div
                    key={idx}
                    initial={{ opacity: 0, x: 20 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.1 }}
                    className="flex items-start gap-4 p-4 rounded-xl border border-white/[0.04] bg-white/[0.01] hover:border-white/[0.08] hover:bg-white/[0.02] transition-all group"
                  >
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${feat.color}`}>
                      <IconComponent className="w-5 h-5" />
                    </div>
                    <div>
                      <h4 className="font-semibold text-white group-hover:text-purple-300 transition-colors flex items-center gap-2">
                        <span>{feat.title}</span>
                        <ArrowRight className="w-3.5 h-3.5 text-slate-600 opacity-0 group-hover:opacity-100 group-hover:translate-x-1 transition-all" />
                      </h4>
                      <p className="text-slate-400 text-xs mt-1 leading-relaxed">{feat.description}</p>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
