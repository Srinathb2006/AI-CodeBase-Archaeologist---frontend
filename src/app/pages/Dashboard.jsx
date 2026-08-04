import { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import {
  TrendingUp,
  FolderOpen,
  Code,
  FileText,
  GitBranch,
  Clock,
  Activity,
  Plus
} from "lucide-react";
import {
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";

import { getRepositories } from "../services/storageService";
import { getLanguageColor } from "../services/languageColors";

export function Dashboard() {
  const [repositories, setRepositories] = useState([]);
  const navigate = useNavigate();

  useEffect(() => {
    getRepositories().then(setRepositories);
  }, []);

  // 1. Stats computations
  const totalRepos = repositories.length;
  
  const totalFiles = repositories.reduce((sum, repo) => sum + (repo.files || 0), 0);
  const totalFilesDisplay = totalFiles >= 1000 
    ? `${(totalFiles / 1000).toFixed(1)}K` 
    : String(totalFiles);

  const uniqueTechs = new Set();
  repositories.forEach((repo) => {
    if (repo.technologies) repo.technologies.forEach(t => uniqueTechs.add(t));
    if (repo.frameworks) repo.frameworks.forEach(t => uniqueTechs.add(t));
  });
  const totalTechs = uniqueTechs.size;

  const totalInsights = repositories.reduce((sum, repo) => {
    const insightsCount = repo.aiSummary?.insights?.length || 0;
    return sum + insightsCount;
  }, 0);

  const stats = [
    {
      title: "Repositories Analyzed",
      value: String(totalRepos),
      change: totalRepos > 0 ? "Active" : "None",
      icon: FolderOpen,
      color: "text-primary",
    },
    {
      title: "Files Indexed",
      value: totalFilesDisplay,
      change: totalFiles > 0 ? "Scanned" : "None",
      icon: Code,
      color: "text-secondary",
    },
    {
      title: "Technologies Detected",
      value: String(totalTechs),
      change: totalTechs > 0 ? "Mapped" : "None",
      icon: GitBranch,
      color: "text-accent",
    },
    {
      title: "AI Insights Compiled",
      value: String(totalInsights),
      change: totalInsights > 0 ? "Generated" : "None",
      icon: FileText,
      color: "text-green-500",
    },
  ];

  // 2. Aggregate language distribution across all repositories.
  // Strategy: use raw bytes when available; fall back to stored percentages
  // (which may be the only reliable data when ZIP bytes are 0).
  const languageBytesMap = {};
  const languagePctSumMap = {};  // sum of percentage values per language
  const languageRepoCountMap = {}; // number of repos contributing each language
  let totalBytesAll = 0;
  let hasByteData = false;

  repositories.forEach((repo) => {
    if (Array.isArray(repo.languages)) {
      repo.languages.forEach((lang) => {
        const bytes = Number(lang.bytes) || 0;
        const pct = Number(lang.value) || 0;
        if (bytes > 0) {
          languageBytesMap[lang.name] = (languageBytesMap[lang.name] || 0) + bytes;
          totalBytesAll += bytes;
          hasByteData = true;
        }
        if (pct > 0) {
          languagePctSumMap[lang.name] = (languagePctSumMap[lang.name] || 0) + pct;
          languageRepoCountMap[lang.name] = (languageRepoCountMap[lang.name] || 0) + 1;
        }
      });
    }
  });

  let languageData = [];

  if (hasByteData) {
    // --- Bytes-based path (most accurate) ---
    const sortedLangs = Object.entries(languageBytesMap).sort(([, a], [, b]) => b - a);
    const top5Langs = sortedLangs.slice(0, 5);
    const otherBytes = sortedLangs.slice(5).reduce((sum, [, b]) => sum + b, 0);
    const languageEntries = otherBytes > 0 ? [...top5Langs, ["Other", otherBytes]] : top5Langs;

    let assignedPct = 0;
    for (let i = 0; i < languageEntries.length; i++) {
      const [name, bytes] = languageEntries[i];
      let pct;
      if (i === languageEntries.length - 1) {
        pct = parseFloat((100 - assignedPct).toFixed(1));
      } else {
        pct = parseFloat(((bytes / totalBytesAll) * 100).toFixed(1));
      }
      assignedPct += pct;
      languageData.push({ name, value: pct, color: name === "Other" ? "#6B7280" : getLanguageColor(name) });
    }
  } else if (Object.keys(languagePctSumMap).length > 0) {
    // --- Percentage-average fallback (when bytes are all 0) ---
    // Average the stored percentages across repos, then re-normalise to 100%.
    const averaged = Object.entries(languagePctSumMap)
      .map(([name, pctSum]) => ({ name, avg: pctSum / languageRepoCountMap[name] }))
      .sort((a, b) => b.avg - a.avg);

    const top5 = averaged.slice(0, 5);
    const otherAvg = averaged.slice(5).reduce((s, e) => s + e.avg, 0);
    const entries = otherAvg > 0 ? [...top5, { name: "Other", avg: otherAvg }] : top5;

    const grandTotal = entries.reduce((s, e) => s + e.avg, 0);
    let assignedPct = 0;
    for (let i = 0; i < entries.length; i++) {
      const { name, avg } = entries[i];
      let pct;
      if (i === entries.length - 1) {
        pct = parseFloat((100 - assignedPct).toFixed(1));
      } else {
        pct = grandTotal > 0 ? parseFloat(((avg / grandTotal) * 100).toFixed(1)) : 0;
      }
      assignedPct += pct;
      languageData.push({ name, value: pct, color: name === "Other" ? "#6B7280" : getLanguageColor(name) });
    }
  }

  // 3. Generate dynamic analysis activities based on repositories
  const recentProjects = [...repositories]
    .sort((a, b) => new Date(b.updatedAt || b.lastAnalyzed) - new Date(a.updatedAt || a.lastAnalyzed))
    .slice(0, 4);

  // Compute relative time labels from real timestamps
  const getRelativeTime = (dateStr) => {
    if (!dateStr) return "Unknown";
    const now = Date.now();
    const then = new Date(dateStr).getTime();
    if (isNaN(then)) return dateStr; // fallback to raw string (e.g. locale string)
    const diffMs = now - then;
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return "Just now";
    if (diffMin < 60) return `${diffMin} min ago`;
    const diffHrs = Math.floor(diffMin / 60);
    if (diffHrs < 24) return `${diffHrs}h ago`;
    const diffDays = Math.floor(diffHrs / 24);
    if (diffDays === 1) return "1 day ago";
    return `${diffDays} days ago`;
  };

  const aiActivity = [];
  recentProjects.forEach((repo) => {
    const timeLabel = getRelativeTime(repo.updatedAt || repo.lastAnalyzed);
    
    aiActivity.push({
      action: `Scanned codebase of "${repo.name}" and identified ${repo.language}`,
      time: timeLabel
    });

    if (repo.aiSummary?.insights?.length > 0) {
      aiActivity.push({
        action: `Generated architectural insights for "${repo.name}" using Gemini`,
        time: timeLabel
      });
    }
  });

  // Fallback if empty
  if (aiActivity.length === 0) {
    aiActivity.push({
      action: "System ready. Import a repository to start generating archaeology records.",
      time: "Now"
    });
  }

  // Build weekly activity chart from actual repository analysis timestamps
  const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const dayCounts = { Mon: 0, Tue: 0, Wed: 0, Thu: 0, Fri: 0, Sat: 0, Sun: 0 };
  repositories.forEach((repo) => {
    const dateStr = repo.updatedAt || repo.lastAnalyzed;
    if (!dateStr) return;
    const d = new Date(dateStr);
    if (!isNaN(d.getTime())) {
      const dayName = dayNames[d.getDay()];
      dayCounts[dayName] = (dayCounts[dayName] || 0) + 1;
    }
  });
  const activityData = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].map(
    (date) => ({ date, analyses: dayCounts[date] })
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, index) => (
          <Card key={index} className="hover:border-primary/50 transition-all">
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div className={`p-3 rounded-xl bg-muted ${stat.color}`}>
                  <stat.icon className="w-6 h-6" />
                </div>
                <Badge variant="success" className="text-[10px] tracking-wide uppercase font-bold">{stat.change}</Badge>
              </div>
              <div className="text-3xl font-bold mb-1">{stat.value}</div>
              <div className="text-sm text-muted-foreground">{stat.title}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      {totalRepos > 0 ? (
        <>
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Activity Chart */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="w-5 h-5 text-primary" />
                  Analysis Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[300px] w-full">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={activityData}>
                      <CartesianGrid
                        strokeDasharray="3 3"
                        stroke="rgba(148, 163, 184, 0.1)"
                      />
                      <XAxis dataKey="date" stroke="#CBD5E1" fontSize={11} />
                      <YAxis stroke="#CBD5E1" fontSize={11} />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: "#1E293B",
                          border: "1px solid rgba(148, 163, 184, 0.1)",
                          borderRadius: "12px",
                          color: "#fff"
                        }}
                      />
                      <Bar dataKey="analyses" fill="#7C3AED" radius={[8, 8, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Language Distribution */}
            <Card>
              <CardHeader>
                <CardTitle>Language Distribution</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="h-[200px] w-full flex items-center justify-center">
                  {languageData.length > 0 && languageData[0].value > 0 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={languageData}
                          cx="50%"
                          cy="50%"
                          innerRadius={50}
                          outerRadius={75}
                          paddingAngle={4}
                          dataKey="value"
                        >
                          {languageData.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(val) => [`${val}%`, "Code Ratio"]}
                          contentStyle={{
                            backgroundColor: "#1E293B",
                            border: "1px solid rgba(148, 163, 184, 0.1)",
                            borderRadius: "12px",
                            color: "#fff"
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="text-xs text-slate-500">No language data compiled.</div>
                  )}
                </div>
                <div className="space-y-2 mt-4 max-h-[120px] overflow-y-auto pr-1 scrollbar-none">
                  {languageData.map((lang, index) => (
                    <div
                      key={index}
                      className="flex items-center justify-between text-sm"
                    >
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: lang.color }}
                        />
                        <span className="text-xs text-slate-300">{lang.name}</span>
                      </div>
                      <span className="text-xs text-muted-foreground font-mono">{lang.value}%</span>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="grid lg:grid-cols-3 gap-6">
            {/* Recent Projects */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Recent Projects</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {recentProjects.map((project, index) => (
                    <div
                      key={project.id}
                      onClick={() => navigate(`/repositories/${project.id}`)}
                      className="flex items-center justify-between p-4 rounded-xl bg-muted/40 hover:bg-muted/75 transition-all cursor-pointer border border-white/5"
                    >
                      <div className="flex items-center gap-4">
                        <div className="w-10 h-10 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
                          <FolderOpen className="w-5 h-5 text-white" />
                        </div>
                        <div>
                          <div className="font-semibold text-sm text-slate-200">{project.name}</div>
                          <div className="text-xs text-muted-foreground mt-0.5">
                            {project.language} • {project.files.toLocaleString()} files
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <Badge variant="success" className="text-[10px] font-bold uppercase tracking-wider">
                          Ready
                        </Badge>
                        <div className="text-[10px] text-muted-foreground mt-1 flex items-center gap-1 justify-end font-mono">
                          <Clock className="w-3 h-3" />
                          {project.lastAnalyzed}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* AI Activity Feed */}
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Activity className="w-5 h-5 text-primary" />
                  AI Activity
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-4 max-h-[300px] overflow-y-auto pr-1">
                  {aiActivity.map((activity, index) => (
                    <div key={index} className="flex gap-3 items-start">
                      <div className="w-1.5 h-1.5 rounded-full bg-primary mt-1.5 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="text-xs text-slate-300 leading-normal">{activity.action}</p>
                        <p className="text-[10px] text-muted-foreground mt-0.5 font-mono">
                          {activity.time}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </div>
        </>
      ) : (
        <Card className="max-w-4xl mx-auto">
          <CardContent className="pt-12 pb-12 text-center">
            <FolderOpen className="w-20 h-20 text-muted-foreground mx-auto mb-6 animate-pulse" />
            <h2 className="text-2xl font-bold mb-3">Welcome to AI Codebase Archaeologist</h2>
            <p className="text-muted-foreground text-sm max-w-lg mx-auto mb-8 leading-relaxed">
              Import a repository from GitHub or upload a local ZIP project. We will scan your files, identify technologies, analyze languages, and generate advanced AI architecture insights.
            </p>
            <Link to="/upload">
              <Button className="gap-2 cursor-pointer">
                <Plus className="w-4 h-4" />
                Analyze Your First Repository
              </Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
