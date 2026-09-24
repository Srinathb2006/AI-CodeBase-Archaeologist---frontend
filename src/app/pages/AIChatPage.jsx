import { useState, useRef, useEffect, useCallback } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import {
  Bot,
  Send,
  Sparkles,
  Copy,
  ThumbsUp,
  AlertTriangle,
  X,
  RefreshCw,
  WifiOff,
  Clock,
  Database,
  FolderOpen,
  FileText,
  Zap,
} from "lucide-react";
import { motion, AnimatePresence } from "motion/react";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-python";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";

import { getRepositories, getChatHistory, saveChatHistory } from "../services/storageService";
import { buildFallbackResponse, GeminiApiError } from "../services/geminiService";
import { askRepositoryQuestion } from "../services/aiAnalysisService";

// ─── Constants ────────────────────────────────────────────────────────────────

const suggestedPrompts = [
  "Explain the project structure",
  "Summarize the technology stack",
  "List key configuration dependencies",
  "Explain how to run this application",
  "Propose 3 code quality improvements",
];

// ─── Error classification ─────────────────────────────────────────────────────

function classifyError(err) {
  if (!err) return { title: "AI Assistant Issue", icon: AlertTriangle, color: "red" };

  if (err instanceof GeminiApiError || err.name === "GeminiApiError") {
    if (err.status === 401 || err.message?.includes("API key")) {
      return {
        title: "API Key Not Configured",
        hint: "Set VITE_GEMINI_API_KEY in your .env file and restart the dev server.",
        icon: AlertTriangle,
        color: "red",
        retryable: false,
      };
    }
    if (err.status === 429) {
      return {
        title: "Gemini Is Rate-Limited",
        hint: "You've hit the API request quota. Wait a moment or upgrade your API plan.",
        icon: Clock,
        color: "amber",
        retryable: true,
      };
    }
    if (err.status === 503) {
      return {
        title: "Gemini Is Temporarily Unavailable",
        hint: "Google's servers are overloaded. Your request will be retried automatically.",
        icon: WifiOff,
        color: "amber",
        retryable: true,
      };
    }
    if (err.status === 0) {
      return {
        title: "Network Error",
        hint: "Could not reach the Gemini API. Check your internet connection.",
        icon: WifiOff,
        color: "amber",
        retryable: true,
      };
    }
  }

  return {
    title: "AI Assistant Issue",
    hint: err.message || "An unexpected error occurred.",
    icon: AlertTriangle,
    color: "red",
    retryable: false,
  };
}

// ─── Welcome message factory ──────────────────────────────────────────────────

const makeWelcomeMessage = (repoName = "") => {
  const introText = repoName
    ? `Hello! I have loaded the codebase context for **${repoName}**.`
    : `Hello! Please select a repository from the left sidebar to begin.`;

  return {
    role: "assistant",
    content: JSON.stringify({
      explanation: `${introText} I can help you analyze directory trees, review configuration dependencies, explain files, and suggest architectural enhancements. How can I assist you today?`,
      type: "general",
      complexity: null,
      edgeCases: null,
      confidenceScore: 100,
      testCases: null,
    }),
  };
};

// ─── Inline markdown helpers ──────────────────────────────────────────────────

function renderInlineStyles(text) {
  const parts = [];
  const regex = /(\*\*.*?\*\*|`.*?`)/g;
  let lastIndex = 0;
  let match;

  while ((match = regex.exec(text)) !== null) {
    const textBefore = text.substring(lastIndex, match.index);
    if (textBefore) parts.push(textBefore);

    const token = match[0];
    if (token.startsWith("**") && token.endsWith("**")) {
      parts.push(
        <strong className="text-white font-bold" key={match.index}>
          {token.slice(2, -2)}
        </strong>
      );
    } else if (token.startsWith("`") && token.endsWith("`")) {
      parts.push(
        <code
          className="bg-white/10 px-1.5 py-0.5 rounded text-xs text-purple-300 font-mono"
          key={match.index}
        >
          {token.slice(1, -1)}
        </code>
      );
    }
    lastIndex = regex.lastIndex;
  }

  const textAfter = text.substring(lastIndex);
  if (textAfter) parts.push(textAfter);

  return parts.length > 0 ? parts : text;
}

// ─── Code block component ─────────────────────────────────────────────────────

function CodeBlock({ language, code }) {
  const codeRef = useRef(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (codeRef.current) {
      try {
        Prism.highlightElement(codeRef.current);
      } catch (e) {
        console.warn("Failed to highlight code element:", e);
      }
    }
  }, [code, language]);

  const safeCopyText = async (text) => {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return Promise.resolve();
  };

  const handleCopy = async () => {
    try {
      await safeCopyText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Failed to copy code", err);
    }
  };

  const normalizedLanguage = language ? language.toLowerCase() : "javascript";

  return (
    <div className="relative rounded-xl overflow-hidden border border-white/10 my-4 font-mono bg-[#03030b]">
      <div className="flex items-center justify-between px-4 py-2 bg-white/[0.04] border-b border-white/10 text-xs text-slate-400">
        <span>{normalizedLanguage}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1.5 hover:text-white transition-colors cursor-pointer text-xs py-0.5 px-2 rounded hover:bg-white/5"
        >
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-xs leading-normal m-0 bg-transparent">
        <code ref={codeRef} className={`language-${normalizedLanguage}`}>
          {code}
        </code>
      </pre>
    </div>
  );
}

// ─── Markdown renderer ────────────────────────────────────────────────────────

function renderMarkdown(content) {
  const blocks = [];
  const codeBlockRegex = /```(\w*)\n([\s\S]*?)```/g;
  let lastIndex = 0;
  let match;

  while ((match = codeBlockRegex.exec(content)) !== null) {
    const textBefore = content.substring(lastIndex, match.index);
    if (textBefore) blocks.push({ type: "text", content: textBefore });
    blocks.push({ type: "code", language: match[1] || "code", content: match[2] });
    lastIndex = codeBlockRegex.lastIndex;
  }

  const textAfter = content.substring(lastIndex);
  if (textAfter) blocks.push({ type: "text", content: textAfter });

  return (
    <div className="space-y-4 text-sm leading-relaxed text-slate-300">
      {blocks.map((block, index) => {
        if (block.type === "code") {
          return <CodeBlock key={index} language={block.language} code={block.content.trim()} />;
        }
        return (
          <div key={index} className="space-y-2">
            {block.content.split("\n").map((line, lineIdx) => {
              const trimmed = line.trim();
              if (trimmed.startsWith("- ") || trimmed.startsWith("* ")) {
                return (
                  <ul key={lineIdx} className="list-disc pl-5 my-1 text-slate-300">
                    <li>{renderInlineStyles(trimmed.substring(2))}</li>
                  </ul>
                );
              }
              if (/^\d+\.\s/.test(trimmed)) {
                const matchNum = trimmed.match(/^(\d+\.\s)(.*)/);
                return (
                  <ol key={lineIdx} className="list-decimal pl-5 my-1 text-slate-300">
                    <li>{renderInlineStyles(matchNum[2])}</li>
                  </ol>
                );
              }
              if (trimmed.startsWith("### "))
                return <h4 key={lineIdx} className="text-base font-bold text-white mt-4 mb-2">{trimmed.substring(4)}</h4>;
              if (trimmed.startsWith("## "))
                return <h3 key={lineIdx} className="text-lg font-bold text-white mt-5 mb-3">{trimmed.substring(3)}</h3>;
              if (trimmed.startsWith("# "))
                return <h2 key={lineIdx} className="text-xl font-bold text-white mt-6 mb-4">{trimmed.substring(2)}</h2>;
              return line ? (
                <p key={lineIdx} className="mb-2 last:mb-0">{renderInlineStyles(line)}</p>
              ) : (
                <div key={lineIdx} className="h-2" />
              );
            })}
          </div>
        );
      })}
    </div>
  );
}

// ─── Message content parser ───────────────────────────────────────────────────

const parseMessageContent = (content) => {
  try {
    let cleanContent = content.trim();
    if (cleanContent.startsWith("```json") && cleanContent.endsWith("```")) {
      cleanContent = cleanContent.slice(7, -3).trim();
    } else if (cleanContent.startsWith("```") && cleanContent.endsWith("```")) {
      cleanContent = cleanContent.slice(3, -3).trim();
    }
    const parsed = JSON.parse(cleanContent);
    if (parsed && typeof parsed === "object" && (parsed.explanation || parsed.type)) {
      return parsed;
    }
  } catch (_) {
    // Not JSON — render as plain text
  }
  return {
    explanation: content,
    type: "general",
    complexity: null,
    edgeCases: null,
    confidenceScore: null,
    testCases: null,
  };
};

// ─── Structured response renderer ────────────────────────────────────────────

function AssistantStructuredResponse({ parsedResponse }) {
  const { explanation, type, complexity, edgeCases, confidenceScore, testCases, isFallback } =
    parsedResponse;
  const showStructuredInfo =
    type !== "general" && (complexity || edgeCases || confidenceScore || testCases);

  return (
    <div className="space-y-6">
      <div>
        {showStructuredInfo && (
          <div className="flex items-center gap-2 mb-3">
            <span className="text-[10px] bg-primary/20 text-primary px-2 py-0.5 rounded font-bold uppercase tracking-wider">
              {type === "code_review"
                ? "Code Review"
                : type === "debugging"
                ? "Debug Report"
                : type === "optimization"
                ? "Optimization Report"
                : "Solution"}
            </span>
          </div>
        )}
        {isFallback && (
          <div className="flex items-center gap-2 mb-3 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
            <Database className="w-3.5 h-3.5 text-amber-400 shrink-0" />
            <span className="text-[10px] text-amber-300 font-semibold uppercase tracking-wider">
              Local Analysis — Gemini unavailable
            </span>
          </div>
        )}
        <div className="prose prose-invert max-w-none">{renderMarkdown(explanation || "")}</div>
      </div>

      {showStructuredInfo && (
        <div className="space-y-6 pt-5 border-t border-white/10">
          {complexity && (complexity.time || complexity.space) && (
            <div className="space-y-2.5">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                Complexity Analysis
              </h4>
              <div className="flex flex-wrap gap-3">
                {complexity.time && (
                  <div className="bg-cyan-500/10 border border-cyan-500/20 px-3 py-1.5 rounded-xl">
                    <span className="text-[10px] text-cyan-400 font-semibold block uppercase font-sans">Time</span>
                    <code className="text-sm text-cyan-300 font-mono font-bold">{complexity.time}</code>
                  </div>
                )}
                {complexity.space && (
                  <div className="bg-purple-500/10 border border-purple-500/20 px-3 py-1.5 rounded-xl">
                    <span className="text-[10px] text-purple-400 font-semibold block uppercase font-sans">Space</span>
                    <code className="text-sm text-purple-300 font-mono font-bold">{complexity.space}</code>
                  </div>
                )}
              </div>
              {complexity.explanation && (
                <p className="text-xs text-slate-400 leading-relaxed pl-3 border-l border-white/5">
                  {complexity.explanation}
                </p>
              )}
            </div>
          )}

          {(edgeCases || confidenceScore !== undefined) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {edgeCases && edgeCases.length > 0 && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                    Edge Case Detection
                  </h4>
                  <ul className="space-y-2 pl-1">
                    {edgeCases.map((edge, idx) => (
                      <li key={idx} className="text-xs text-slate-300 flex items-start gap-2">
                        <span className="text-yellow-500/80 shrink-0 mt-0.5 text-[10px]">⚠️</span>
                        <span className="leading-relaxed">{edge}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {confidenceScore !== undefined && confidenceScore !== null && (
                <div className="space-y-2.5">
                  <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center justify-between">
                    <div className="flex items-center gap-1.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                      Confidence Score
                    </div>
                    <span
                      className={`text-xs font-bold ${
                        confidenceScore >= 90
                          ? "text-emerald-400"
                          : confidenceScore >= 70
                          ? "text-yellow-400"
                          : "text-red-400"
                      }`}
                    >
                      {confidenceScore}%
                    </span>
                  </h4>
                  <div className="w-full bg-white/10 h-2 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-500 ${
                        confidenceScore >= 90
                          ? "bg-emerald-500"
                          : confidenceScore >= 70
                          ? "bg-yellow-500"
                          : "bg-red-500"
                      }`}
                      style={{ width: `${confidenceScore}%` }}
                    />
                  </div>
                  <p className="text-[10px] text-slate-500 leading-relaxed font-sans">
                    Based on static correctness verification, parameter boundary coverage, and
                    algorithmic tradeoffs.
                  </p>
                </div>
              )}
            </div>
          )}

          {testCases && testCases.length > 0 && (
            <div className="space-y-2.5 pt-2">
              <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                Test Cases &amp; Validation
              </h4>
              <div className="border border-white/10 rounded-xl overflow-hidden bg-white/[0.01] text-xs">
                <div className="grid grid-cols-3 bg-white/[0.03] border-b border-white/10 p-3 font-semibold text-slate-300">
                  <div>Input Scenario</div>
                  <div>Expected Output</div>
                  <div>Description</div>
                </div>
                <div className="divide-y divide-white/5">
                  {testCases.map((tc, idx) => (
                    <div
                      key={idx}
                      className="grid grid-cols-3 p-3 text-slate-400 gap-3 font-mono text-[11px] leading-relaxed"
                    >
                      <div className="text-emerald-400 bg-emerald-500/5 p-1.5 rounded border border-emerald-500/10 break-all select-all">
                        {tc.input}
                      </div>
                      <div className="text-blue-400 bg-blue-500/5 p-1.5 rounded border border-blue-500/10 break-all select-all">
                        {tc.expectedOutput}
                      </div>
                      <div className="text-slate-300 font-sans flex items-center text-xs pr-1">
                        {tc.description}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Typing / retrying indicator ──────────────────────────────────────────────

function TypingIndicator({ retryState }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className="flex gap-4"
    >
      <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
        <Bot className="w-5 h-5 text-white" />
      </div>
      <Card className="border-white/5">
        <CardContent className="pt-4">
          {retryState ? (
            <div className="flex items-center gap-3">
              <RefreshCw className="w-4 h-4 text-amber-400 animate-spin shrink-0" />
              <div>
                <p className="text-xs text-amber-300 font-semibold">
                  Retrying ({retryState.attempt}/{retryState.total})…
                </p>
                <p className="text-[10px] text-slate-500 mt-0.5 font-mono">
                  Waiting {(retryState.delayMs / 1000).toFixed(0)}s before next attempt
                </p>
              </div>
            </div>
          ) : (
            <div className="flex gap-2 items-center">
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-75" />
              <div className="w-2 h-2 rounded-full bg-primary animate-pulse delay-150" />
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ─── Error banner ─────────────────────────────────────────────────────────────

function ErrorBanner({ error, onDismiss, onRetry, onUseFallback }) {
  const { title, hint, icon: Icon, color, retryable } = classifyError(error);

  const borderColor =
    color === "amber" ? "border-amber-500/30 bg-amber-500/10" : "border-red-500/30 bg-red-500/10";
  const titleColor = color === "amber" ? "text-amber-200" : "text-red-200";
  const textColor = color === "amber" ? "text-amber-300" : "text-red-300";
  const iconColor = color === "amber" ? "text-amber-400" : "text-red-400";
  const dismissColor = color === "amber" ? "text-amber-400 hover:text-amber-200" : "text-red-400 hover:text-red-200";

  return (
    <motion.div
      initial={{ opacity: 0, y: -10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -10 }}
      className={`flex items-start gap-3 p-4 rounded-xl border ${borderColor} text-sm ${textColor} mb-4`}
    >
      <Icon className={`w-5 h-5 ${iconColor} shrink-0 mt-0.5`} />
      <div className="flex-1 min-w-0">
        <p className={`font-semibold ${titleColor} mb-0.5`}>{title}</p>
        {hint && <p className="text-xs leading-relaxed opacity-80">{hint}</p>}
        <div className="flex flex-wrap gap-2 mt-3">
          {retryable && onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/30 transition-all cursor-pointer"
            >
              <RefreshCw className="w-3 h-3" />
              Retry
            </button>
          )}
          {onUseFallback && (
            <button
              type="button"
              onClick={onUseFallback}
              className="flex items-center gap-1.5 text-[11px] font-semibold px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 transition-all cursor-pointer"
            >
              <Database className="w-3 h-3" />
              Use Local Analysis
            </button>
          )}
        </div>
      </div>
      <button
        type="button"
        onClick={onDismiss}
        className={`${dismissColor} transition-colors cursor-pointer shrink-0`}
      >
        <X className="w-4 h-4" />
      </button>
    </motion.div>
  );
}

// ─── AI Status dot ────────────────────────────────────────────────────────────

function ApiStatusDot({ status }) {
  const config = {
    ok:       { color: "bg-emerald-500", pulse: true,  label: "Codebase context injected",    textColor: "text-emerald-400" },
    retrying: { color: "bg-amber-500",   pulse: true,  label: "Retrying Gemini request…",     textColor: "text-amber-400"   },
    degraded: { color: "bg-orange-500",  pulse: false, label: "Running on local analysis",    textColor: "text-orange-400"  },
    offline:  { color: "bg-red-500",     pulse: false, label: "Gemini offline — check key",   textColor: "text-red-400"     },
  }[status] || { color: "bg-emerald-500", pulse: true, label: "Codebase context injected", textColor: "text-emerald-400" };

  return (
    <div className={`text-xs ${config.textColor} flex items-center gap-1.5`}>
      <span className={`w-2 h-2 rounded-full ${config.color} ${config.pulse ? "animate-pulse" : ""}`} />
      {config.label}
    </div>
  );
}

// ─── Main page component ──────────────────────────────────────────────────────

export function AIChatPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);

  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const [helpfulMessageIndexes, setHelpfulMessageIndexes] = useState(() => new Set());

  // Error handling state
  const [error, setError] = useState(null);          // raw Error object
  const [retryState, setRetryState] = useState(null); // { attempt, total, delayMs }
  const [apiStatus, setApiStatus] = useState("ok");  // 'ok' | 'retrying' | 'degraded' | 'offline'
  const [lastFailedPrompt, setLastFailedPrompt] = useState(null);

  const messagesEndRef = useRef(null);

  // ── Load repos on mount / query param change ────────────────────────────────
  useEffect(() => {
    const loadData = async () => {
      try {
        const repos = await getRepositories();
        setRepositories(repos);

        const repoIdParam = searchParams.get("repoId");
        let activeRepo = null;

        if (repoIdParam) {
          activeRepo = repos.find((r) => String(r.id) === String(repoIdParam));
        }
        if (!activeRepo && repos.length > 0) {
          activeRepo = repos[0];
        }

        if (activeRepo) {
          setSelectedRepo(activeRepo);
          const history = await getChatHistory(activeRepo.id);
          setMessages(
            history && history.length > 0 ? history : [makeWelcomeMessage(activeRepo.name)]
          );
        } else {
          setMessages([makeWelcomeMessage()]);
        }
      } catch (err) {
        console.error("Failed to load chat initialization data:", err);
      }
    };
    loadData();
  }, [searchParams]);

  // ── Auto-scroll ─────────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // ── Repository selector ──────────────────────────────────────────────────────
  const handleSelectRepository = async (id) => {
    const found = repositories.find((r) => String(r.id) === String(id));
    if (!found) return;

    setSelectedRepo(found);
    setSearchParams({ repoId: id });
    setError(null);
    setLastFailedPrompt(null);
    setApiStatus("ok");

    try {
      const history = await getChatHistory(id);
      setMessages(
        history && history.length > 0 ? history : [makeWelcomeMessage(found.name)]
      );
    } catch (err) {
      console.error("Failed to load chat history:", err);
      setMessages([makeWelcomeMessage(found.name)]);
    }
  };

  // ── Core send logic (shared by handleSend + retry) ──────────────────────────
  const sendPrompt = useCallback(
    async (userPrompt, priorMessages) => {
      const userMessage = { role: "user", content: userPrompt };
      const updatedMessages = [...priorMessages, userMessage];
      setMessages(updatedMessages);
      setInput("");
      setIsTyping(true);
      setError(null);
      setRetryState(null);
      setApiStatus("ok");
      setLastFailedPrompt(userPrompt);

      await saveChatHistory(selectedRepo.id, updatedMessages);

      try {
        const response = await askRepositoryQuestion(selectedRepo.id, userPrompt);
        const responseText = response.answer;

        const aiResponse = {
          role: "assistant",
          content: responseText,
          sources: Array.isArray(response.sources) ? response.sources : [],
        };
        const newMessages = [...updatedMessages, aiResponse];
        setMessages(newMessages);
        await saveChatHistory(selectedRepo.id, newMessages);
        setApiStatus("ok");
        setRetryState(null);
        setLastFailedPrompt(null);
      } catch (err) {
        console.error("Gemini API call failed:", err);
        setError(err);
        setRetryState(null);
        setApiStatus("offline");
      } finally {
        setIsTyping(false);
      }
    },
    [selectedRepo]
  );

  // ── Primary send handler ─────────────────────────────────────────────────────
  const handleSend = async () => {
    if (!input.trim() || isTyping) return;
    if (!selectedRepo) {
      setError(
        Object.assign(new Error("Please select a repository from the global repository selector to analyze."), {
          status: -1,
          retryable: false,
        })
      );
      return;
    }

    try {
      await sendPrompt(input.trim(), messages);
    } catch (unexpectedErr) {
      // Safety net — should never reach here, but prevents component crash
      console.error("Unexpected error in handleSend:", unexpectedErr);
      setError(unexpectedErr);
      setIsTyping(false);
    }
  };

  // ── Retry last failed prompt ─────────────────────────────────────────────────
  const handleRetry = async () => {
    if (!lastFailedPrompt || !selectedRepo || isTyping) return;
    // Remove last user message (it was added during the failed attempt)
    const priorMessages = messages.filter((m) => m.content !== lastFailedPrompt);
    try {
      await sendPrompt(lastFailedPrompt, priorMessages.slice(0, -0));
    } catch (_) {
      // handled inside sendPrompt
    }
  };

  // ── Use local fallback ───────────────────────────────────────────────────────
  const handleUseFallback = async () => {
    if (!lastFailedPrompt || !selectedRepo) return;
    const fallbackContent = buildFallbackResponse(lastFailedPrompt, selectedRepo);
    const aiResponse = { role: "assistant", content: fallbackContent };
    const newMessages = [...messages, aiResponse];
    setMessages(newMessages);
    await saveChatHistory(selectedRepo.id, newMessages);
    setApiStatus("degraded");
    setError(null);
    setLastFailedPrompt(null);
  };

  const handlePromptClick = (prompt) => setInput(prompt);

  const handleMarkHelpful = (messageIndex) => {
    setHelpfulMessageIndexes((prev) => {
      const next = new Set(prev);
      next.add(messageIndex);
      return next;
    });
  };

  const copyToClipboard = async (text) => {
    if (!text) return;
    if (navigator.clipboard?.writeText) {
      return navigator.clipboard.writeText(text);
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    document.body.removeChild(textarea);
    return Promise.resolve();
  };

  // ─── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="h-[calc(100vh-150px)] max-w-7xl mx-auto">
      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col h-full">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardContent className="flex-1 flex flex-col pt-6 overflow-hidden">
            {/* Error Banner */}
            <AnimatePresence>
              {error && (
                <ErrorBanner
                  error={error}
                  onDismiss={() => setError(null)}
                  onRetry={lastFailedPrompt ? handleRetry : null}
                  onUseFallback={
                    lastFailedPrompt && selectedRepo ? handleUseFallback : null
                  }
                />
              )}
            </AnimatePresence>

            {/* Message Pane */}
            <div className="flex-1 overflow-y-auto space-y-6 mb-6 pr-2">
              {messages.map((message, index) => (
                <motion.div
                  key={index}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className={`flex gap-4 ${message.role === "user" ? "flex-row-reverse" : ""}`}
                >
                  <div
                    className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                      message.role === "user"
                        ? "bg-primary"
                        : "bg-gradient-to-br from-primary to-secondary"
                    }`}
                  >
                    {message.role === "user" ? (
                      <span className="text-white font-semibold">U</span>
                    ) : (
                      <Bot className="w-5 h-5 text-white" />
                    )}
                  </div>

                  <div className="flex-1 max-w-3xl">
                    <Card
                      className={
                        message.role === "user"
                          ? "bg-primary/10 border-primary/20"
                          : "border-white/5"
                      }
                    >
                      <CardContent className="pt-4">
                        {message.role === "user" ? (
                          <div className="prose prose-invert max-w-none">
                            {renderMarkdown(message.content)}
                          </div>
                        ) : (
                          <AssistantStructuredResponse
                            parsedResponse={parseMessageContent(message.content)}
                          />
                        )}

                        {message.role === "assistant" && (
                          <>
                            {Array.isArray(message.sources) && message.sources.length > 0 && (
                              <div className="mt-4 pt-4 border-t border-white/10">
                                <h4 className="text-xs font-semibold text-slate-300 uppercase tracking-wider mb-3">
                                  Sources Used
                                </h4>
                                <div className="space-y-2">
                                  {message.sources.map((source, sourceIndex) => {
                                    const fileName =
                                      (source.filePath || "").split("/").pop() || source.filePath || "Unknown file";
                                    return (
                                      <div
                                        key={`${source.filePath}-${source.startLine}-${source.endLine}-${sourceIndex}`}
                                        className="text-xs text-slate-400"
                                      >
                                        <div className="text-slate-200 font-medium">
                                          📄 {fileName}
                                        </div>
                                        <div className="text-[11px] text-slate-500 mt-0.5">
                                          Lines {source.startLine}–{source.endLine}
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                            )}
                            <div className="flex gap-2 mt-4 pt-4 border-t border-white/10">
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-2 cursor-pointer text-xs"
                                onClick={async () => {
                                  const parsed = parseMessageContent(message.content);
                                  await copyToClipboard(parsed.explanation || message.content);
                                }}
                              >
                                <Copy className="w-3.5 h-3.5" />
                                Copy
                              </Button>
                              <Button
                                type="button"
                                variant="ghost"
                                size="sm"
                                className="gap-2 cursor-pointer text-xs"
                                onClick={() => handleMarkHelpful(index)}
                                disabled={helpfulMessageIndexes.has(index)}
                              >
                                <ThumbsUp className="w-3.5 h-3.5" />
                                {helpfulMessageIndexes.has(index) ? "Marked Helpful" : "Helpful"}
                              </Button>
                            </div>
                          </>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </motion.div>
              ))}

              {/* Context Bar */}
              {selectedRepo ? (
                <Card className="border-white/5">
                  <CardContent className="flex flex-wrap items-center gap-6 px-4 py-3">
                    <div className="flex flex-col items-start">
                      <div className="text-xs text-muted-foreground">Repository</div>
                      <div className="font-medium text-slate-200">{selectedRepo.name}</div>
                    </div>
                    <div className="flex flex-col items-start">
                      <div className="text-xs text-muted-foreground">Files Analyzed</div>
                      <div className="font-medium text-slate-200">
                        {selectedRepo.files.toLocaleString()} files
                      </div>
                    </div>
                    <div className="flex flex-col items-start">
                      <div className="text-xs text-muted-foreground">AI Agent Status</div>
                      <ApiStatusDot status={apiStatus} />
                    </div>
                  </CardContent>
                </Card>
              ) : null}
              {/* Typing / Retrying Indicator */}
              <AnimatePresence>
                {isTyping && (
                  <TypingIndicator retryState={retryState} />
                )}
              </AnimatePresence>

              <div ref={messagesEndRef} />
            </div>

            {/* Suggested Prompts */}
            {messages.length === 1 && selectedRepo && (
              <div className="mb-4">
                <div className="flex items-center gap-2 mb-3">
                  <Sparkles className="w-4 h-4 text-primary" />
                  <span className="text-xs text-muted-foreground">Suggested prompts</span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {suggestedPrompts.map((prompt, index) => (
                    <Badge
                      key={index}
                      variant="default"
                      className="cursor-pointer hover:bg-primary/20"
                      onClick={() => handlePromptClick(prompt)}
                    >
                      {prompt}
                    </Badge>
                  ))}
                </div>
              </div>
            )}

            {/* Input Area */}
            <div className="flex gap-3">
              <Input
                id="chat-input"
                placeholder={
                  selectedRepo
                    ? `Ask anything about "${selectedRepo.name}"…`
                    : "Choose a repository to start chatting…"
                }
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyPress={(e) => e.key === "Enter" && handleSend()}
                className="flex-1"
                disabled={isTyping || !selectedRepo}
              />
              <Button
                id="chat-send-button"
                onClick={handleSend}
                className="gap-2 cursor-pointer"
                disabled={isTyping || !selectedRepo}
              >
                {isTyping ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Send className="w-4 h-4" />
                )}
                {isTyping ? "Thinking…" : "Send"}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>

          </div>
  );
}
