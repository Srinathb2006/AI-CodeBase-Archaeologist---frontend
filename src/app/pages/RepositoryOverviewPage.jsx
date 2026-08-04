import { useState, useEffect } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import {
  Folder,
  FolderOpen,
  FileCode,
  ChevronRight,
  ChevronDown,
  Code,
  Layers,
  TrendingUp,
  Clock,
  CheckCircle,
  AlertCircle,
  ArrowLeft,
  AlertTriangle,
  Loader2,
  Sparkles,
  GitFork,
  Star,
  Eye
} from "lucide-react";
import {
  PieChart,
  Pie,
  Cell,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
} from "recharts";

import { getRepository } from "../services/storageService";
import { buildHierarchicalTree, analyzeRepository, detectCodebaseArchitecture } from "../services/repoAnalyzer";
import { fetchRepoMetadata, fetchRepoLanguages, fetchRepoTree } from "../services/githubService";
import { generateRepoSummary } from "../services/geminiService";
import { getLanguageColor } from "../services/languageColors";
import { analyzeRepositoryWithBackend, explainArchitectureWithBackend } from "../services/aiAnalysisService";

// Collapsible file tree item
function RepositoryFileTreeItem({ item, level }) {
  const [isOpen, setIsOpen] = useState(level === 0);

  if (item.type === "folder") {
    return (
      <div>
        <button
          type="button"
          className="flex items-center gap-2 py-1.5 px-2 hover:bg-white/5 rounded text-slate-300 w-full text-left text-sm cursor-pointer"
          style={{ paddingLeft: `${level * 16 + 8}px` }}
          onClick={() => setIsOpen(!isOpen)}
        >
          {isOpen ? (
            <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
          ) : (
            <ChevronRight className="w-4 h-4 text-slate-500 shrink-0" />
          )}
          {isOpen ? (
            <FolderOpen className="w-4 h-4 text-primary shrink-0" />
          ) : (
            <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
          )}
          <span className="truncate">{item.name}</span>
        </button>
        {isOpen && item.children && (
          <div className="space-y-0.5">
            {item.children.map((child, idx) => (
              <RepositoryFileTreeItem key={idx} item={child} level={level + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="flex items-center gap-2 py-1.5 px-2 hover:bg-white/5 rounded text-slate-400 text-sm"
      style={{ paddingLeft: `${level * 16 + 24}px` }}
    >
      <FileCode className="w-4 h-4 text-accent shrink-0" />
      <span className="truncate">{item.name}</span>
      {item.size !== undefined && (
        <span className="text-[10px] text-muted-foreground ml-auto pr-2">
          {(item.size / 1024).toFixed(1)} KB
        </span>
      )}
    </div>
  );
}

export function RepositoryOverviewPage() {
  const { id } = useParams();
  const [repo, setRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [reanalyzing, setReanalyzing] = useState(false);
  const [reanalyzeError, setReanalyzeError] = useState("");
  const [reanalyzeSuccess, setReanalyzeSuccess] = useState(false);

  useEffect(() => {
    setLoading(true);
    setLoadError("");
    getRepository(id)
      .then((data) => {
        setRepo(data);
      })
      .catch((error) => {
        console.error("Error fetching repository:", error);
        setRepo(null);
        setLoadError(error?.message || "Failed to load repository.");
      })
      .finally(() => {
        setLoading(false);
      });
  }, [id]);

  const handleReanalyze = async () => {
    if (!repo || reanalyzing) return;

    setReanalyzing(true);
    setReanalyzeError("");
    setReanalyzeSuccess(false);

    try {
      const [summary, architecture] = await Promise.all([
        analyzeRepositoryWithBackend(id, { forceRefresh: true }),
        explainArchitectureWithBackend(id, { forceRefresh: true }),
      ]);
      const updatedData = {
        ...repo,
        lastAnalyzed: new Date(summary.createdAt || Date.now()).toLocaleString(),
        aiSummary: {
          repositorySummary: summary.result,
          architectureOverview: architecture.result,
          insights: [
            {
              title: "Backend AI Analysis Complete",
              description: `Generated with ${summary.provider} using ${summary.model}.`,
              status: "success",
            },
          ],
          suggestions: [
            "Open AI Chat to ask follow-up questions about specific files, flows, or dependencies.",
          ],
        },
      };

      setRepo(updatedData);
      setReanalyzeSuccess(true);
      setTimeout(() => setReanalyzeSuccess(false), 3000);
    } catch (e) {
      console.error("Re-analysis failed:", e);
      setReanalyzeError(`Re-analysis failed: ${e.message}`);
    } finally {
      setReanalyzing(false);
    }
  };

  // --- Loading ---
  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <Loader2 className="w-12 h-12 text-primary animate-spin" />
        <p className="text-muted-foreground text-sm">Loading repository archaeology...</p>
      </div>
    );
  }

  // --- Load error / Not found ---
  if (!repo) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <div className="w-20 h-20 rounded-full bg-red-500/10 flex items-center justify-center mx-auto mb-6">
              <AlertTriangle className="w-10 h-10 text-red-500" />
            </div>
            <h2 className="text-2xl font-bold mb-2">
              {loadError ? "Unable to load repository" : "Repository Not Found"}
            </h2>
            <p className="text-muted-foreground mb-6">
              {loadError
                ? loadError
                : "The repository you're looking for doesn't exist or may have been deleted."}
            </p>
            <Link to="/repositories">
              <Button className="gap-2 cursor-pointer">
                <ArrowLeft className="w-4 h-4" />
                Back to Repositories
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Parse structured AI Summary
  const aiSummary = repo.aiSummary || {
    repositorySummary: "Local project loaded with custom details.",
    architectureOverview: "No detailed architectural overview available. Run AI analysis to compile.",
    insights: [],
    suggestions: []
  };

  const name = repo.name || "Unnamed Repository";
  const description = repo.description || "No description provided.";
  const files = repo.files ?? 0;
  const lastAnalyzed = repo.lastAnalyzed || "Unknown";
  const languages = Array.isArray(repo.languages) && repo.languages.length > 0
    ? repo.languages
    : [{ name: "Unknown", value: 100, bytes: 0, color: "#6B7280" }];

  const primaryLang = languages[0]?.name || "Unknown";
  const fileStats = languages.map((lang) => ({
    type: lang.name,
    count: lang.bytes !== undefined ? parseFloat((lang.bytes / 1024).toFixed(1)) : Math.round((lang.value / 100) * files),
  }));

  // Render tech stack labels beautifully
  const techStack = (Array.isArray(repo.technologyStack) && repo.technologyStack.length > 0)
    ? repo.technologyStack.map((s) => ({ name: s.name, category: Array.isArray(s.categories) ? s.categories.join("/") : s.category || "Unknown", confidence: s.confidence, evidence: s.evidence }))
    : [
        ...repo.technologies.map(t => ({ name: t, category: "Language/Core" })),
        ...repo.frameworks.map(t => ({ name: t, category: "Framework/Library" })),
        ...repo.buildTools.map(t => ({ name: t, category: "Build/Pkg Tool" })),
        ...repo.tools.map(t => ({ name: t, category: "Linter/Utility" }))
      ];

  // Convert flat tree into hierarchical structure
  const hierarchicalTree = buildHierarchicalTree(repo.fileTree || []);

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Back link */}
      <Link
        to="/repositories"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <ArrowLeft className="w-4 h-4" />
        All Repositories
      </Link>

      {reanalyzeError && (
        <div className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm">
          <AlertCircle className="w-5 h-5 shrink-0" />
          <span>{reanalyzeError}</span>
        </div>
      )}

      {reanalyzeSuccess && (
        <div className="flex items-start gap-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-xl px-4 py-3 text-sm">
          <CheckCircle className="w-5 h-5 shrink-0" />
          <span>Repository analysis updated successfully!</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-start justify-between gap-4">
        <div className="flex items-start gap-4">
          <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
            <FolderOpen className="w-8 h-8 text-white" />
          </div>
          <div>
            <h1 className="text-3xl font-bold mb-2">{name}</h1>
            <p className="text-muted-foreground mb-3 text-sm md:text-base max-w-2xl">{description}</p>
            <div className="flex items-center gap-2 flex-wrap">
              <Badge variant="success" className="gap-1">
                <CheckCircle className="w-3 h-3" />
                Analysis Ready
              </Badge>
              <Badge variant="info">
                {files.toLocaleString()} files
              </Badge>
              <Badge variant="info">{primaryLang}</Badge>
              {repo.type === "github" && (
                <Badge variant="default" className="bg-[#24292e] text-white">
                  GitHub Repo
                </Badge>
              )}
              {repo.type === "zip" && (
                <Badge variant="default" className="bg-[#4a154b] text-white">
                  ZIP Upload
                </Badge>
              )}
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2 shrink-0 self-end md:self-start">
          {repo.type === "github" && (
            <div className="flex items-center gap-3 bg-slate-800/50 border border-slate-700/50 rounded-xl px-3 py-1.5 text-xs mr-2 text-slate-300">
              <span className="flex items-center gap-1" title="Stars"><Star className="w-3.5 h-3.5 text-yellow-400" /> {repo.stars || 0}</span>
              <span className="flex items-center gap-1" title="Forks"><GitFork className="w-3.5 h-3.5 text-blue-400" /> {repo.forks || 0}</span>
              <span className="flex items-center gap-1" title="Watchers"><Eye className="w-3.5 h-3.5 text-purple-400" /> {repo.watchers || 0}</span>
            </div>
          )}
          <Button variant="outline" className="cursor-pointer gap-2" onClick={handleReanalyze} disabled={reanalyzing}>
            {reanalyzing ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Analyzing...
              </>
            ) : (
              "Re-analyze"
            )}
          </Button>
          <Link to={`/ai-chat?repoId=${repo.id}`}>
            <Button className="gap-2 cursor-pointer">
              <Sparkles className="w-4 h-4" />
              Discuss Codebase
            </Button>
          </Link>
        </div>
      </div>

      {/* Quick Stats */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          {
            label: "Total Files",
            value: files.toLocaleString(),
            icon: Code,
            color: "text-primary",
          },
          {
            label: "Est. Lines of Code",
            value: (() => {
              // Estimate from real byte data: ~45 bytes per line of code on average
              const totalLangBytes = languages.reduce((sum, l) => sum + (l.bytes || 0), 0);
              if (totalLangBytes > 0) {
                const estLines = totalLangBytes / 45;
                return estLines >= 1000 ? `${(estLines / 1000).toFixed(1)}K` : String(Math.round(estLines));
              }
              return files > 0 ? `${(files * 40 / 1000).toFixed(1)}K` : "0";
            })(),
            icon: TrendingUp,
            color: "text-secondary",
          },
          {
            label: "Languages",
            value: String(languages.length),
            icon: Layers,
            color: "text-accent",
          },
          {
            label: "Last Analyzed",
            value: lastAnalyzed,
            icon: Clock,
            color: "text-green-500",
          },
        ].map((stat, index) => (
          <Card key={index}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3 mb-2">
                <div className={`p-2 rounded-lg bg-muted ${stat.color}`}>
                  <stat.icon className="w-5 h-5" />
                </div>
                <div className="text-xl md:text-2xl font-bold truncate">{stat.value}</div>
              </div>
              <div className="text-xs text-muted-foreground">{stat.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {/* Language Distribution */}
        <Card className="lg:col-span-2">
          <CardHeader>
            <CardTitle>Language Distribution</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid md:grid-cols-2 gap-8">
              <div className="h-[250px] w-full flex items-center justify-center">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={languages}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={95}
                      paddingAngle={4}
                      dataKey="value"
                    >
                      {languages.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip
                      formatter={(val) => [`${val}%`, "Percentage"]}
                      contentStyle={{
                        backgroundColor: "#1E293B",
                        border: "1px solid rgba(148, 163, 184, 0.1)",
                        borderRadius: "12px",
                        color: "#fff"
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
              <div className="flex flex-col justify-center space-y-3">
                {languages.map((lang, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between"
                  >
                    <div className="flex items-center gap-3">
                      <div
                        className="w-4 h-4 rounded"
                        style={{ backgroundColor: lang.color }}
                      />
                      <span className="text-sm font-medium">{lang.name}</span>
                    </div>
                    <div className="text-right">
                      <div className="text-sm font-semibold">
                        {lang.value}%
                      </div>
                      {lang.bytes !== undefined && (
                        <div className="text-xs text-muted-foreground font-mono">
                          {(lang.bytes / 1024).toFixed(1)} KB
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Technology Stack */}
        <Card>
          <CardHeader>
            <CardTitle>Technology Stack</CardTitle>
          </CardHeader>
          <CardContent className="max-h-[300px] overflow-y-auto">
            <div className="space-y-3">
              {techStack.length > 0 ? (
                techStack.map((tech, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 rounded-lg bg-muted/50 border border-white/5"
                  >
                    <div>
                      <div className="font-medium text-sm text-slate-200">{tech.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {tech.category}
                      </div>
                    </div>
                    <Badge
                      variant={tech.confidence !== undefined ? (tech.confidence >= 90 ? "success" : tech.confidence >= 75 ? "info" : "default") : "default"}
                      className="text-[10px] uppercase font-bold tracking-wider"
                      title={tech.evidence && tech.evidence.length ? tech.evidence.join(', ') : undefined}
                    >
                      {tech.confidence !== undefined ? `${tech.confidence}%` : "Active"}
                    </Badge>
                  </div>
                ))
              ) : (
                <div className="text-center py-8 text-xs text-slate-500">
                  No advanced framework dependencies detected.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* File Statistics Chart */}
      <Card>
        <CardHeader>
          <CardTitle>Code Size by Language</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={fileStats}>
                <XAxis dataKey="type" stroke="#CBD5E1" fontSize={11} />
                <YAxis stroke="#CBD5E1" fontSize={11} />
                <Tooltip
                  formatter={(val) => [`${val} KB`, "Size"]}
                  contentStyle={{
                    backgroundColor: "#1E293B",
                    border: "1px solid rgba(148, 163, 184, 0.1)",
                    borderRadius: "12px",
                    color: "#fff"
                  }}
                />
                <Bar dataKey="count" fill="#7C3AED" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Architecture & AI Summary */}
      <div className="grid md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Architecture Summary</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="p-4 rounded-xl bg-gradient-to-br from-primary/10 to-secondary/10 border border-primary/20">
              <div className="font-semibold text-base mb-1.5 text-slate-100">
                {repo.architecturePatterns && repo.architecturePatterns[0] ? repo.architecturePatterns[0] : "Monolithic Structure"}
              </div>
              <p className="text-sm text-slate-300 leading-relaxed">
                {aiSummary.repositorySummary}
              </p>
            </div>
            
            <div className="text-slate-300 text-sm leading-relaxed prose prose-invert max-w-none">
              <h4 className="font-semibold text-slate-200 mb-2">Architectural Blueprint</h4>
              <div className="bg-slate-900/50 p-4 rounded-xl border border-white/5 font-sans leading-relaxed whitespace-pre-wrap">
                {aiSummary.architectureOverview}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* AI Insights & Recommendations */}
        <Card className="border-primary/30 bg-gradient-to-br from-primary/5 to-secondary/5">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-primary animate-pulse" />
              AI Insights & Suggestions
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="space-y-3">
              {aiSummary.insights && aiSummary.insights.length > 0 ? (
                aiSummary.insights.map((insight, idx) => (
                  <div key={idx} className="flex items-start gap-3 p-3 rounded-xl bg-slate-900/40 border border-white/5">
                    {insight.status === "success" ? (
                      <CheckCircle className="w-5 h-5 text-green-500 shrink-0 mt-0.5" />
                    ) : insight.status === "warning" ? (
                      <AlertCircle className="w-5 h-5 text-yellow-500 shrink-0 mt-0.5" />
                    ) : (
                      <AlertTriangle className="w-5 h-5 text-red-500 shrink-0 mt-0.5" />
                    )}
                    <div>
                      <div className="font-medium text-sm text-slate-200 mb-0.5">{insight.title}</div>
                      <p className="text-xs text-muted-foreground leading-relaxed">{insight.description}</p>
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-6 text-xs text-slate-500">
                  No automated insights generated.
                </div>
              )}
            </div>

            {aiSummary.suggestions && aiSummary.suggestions.length > 0 && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <h4 className="font-semibold text-xs text-slate-300 uppercase tracking-wider">Suggested Refactorings</h4>
                <ul className="space-y-1.5 pl-4 list-disc text-xs text-slate-300 leading-relaxed">
                  {aiSummary.suggestions.map((sug, idx) => (
                    <li key={idx}>{sug}</li>
                  ))}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Codebase File Structure Tree View */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <FolderOpen className="w-5 h-5 text-primary" />
            File Explorer Tree
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-[#03030b] border border-white/10 rounded-xl p-4 max-h-[500px] overflow-y-auto font-mono scrollbar-thin">
            {hierarchicalTree.length > 0 ? (
              <div className="space-y-0.5">
                {hierarchicalTree.map((node, idx) => (
                  <RepositoryFileTreeItem key={idx} item={node} level={0} />
                ))}
              </div>
            ) : (
              <div className="text-center text-slate-500 py-10 text-sm">
                No files detected in the repository structure.
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
