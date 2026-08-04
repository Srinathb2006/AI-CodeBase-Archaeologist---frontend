import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Badge } from "../components/Badge";
import {
  ZoomIn,
  ZoomOut,
  Server,
  Database,
  Globe,
  Smartphone,
  Cpu,
  Terminal,
  FolderOpen,
} from "lucide-react";
import { motion } from "motion/react";
import { getRepositories } from "../services/storageService";
import { detectCodebaseArchitecture } from "../services/repoAnalyzer";

const iconMap = {
  smartphone: Smartphone,
  server: Server,
  database: Database,
  globe: Globe,
  cpu: Cpu,
  terminal: Terminal,
};

export function ArchitecturePage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState(null);

  // Load repositories and auto-select active repository from query parameters
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
          setSelectedNode(null);
          // Set query param if not set
          if (!repoIdParam) {
            setSearchParams({ repoId: activeRepo.id });
          }
        }
      } catch (err) {
        console.error("Failed to load repositories:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [searchParams, setSearchParams]);

  const handleSelectRepository = (id) => {
    const found = repositories.find((r) => String(r.id) === String(id));
    if (!found) return;
    setSelectedRepo(found);
    setSelectedNode(null);
    setSearchParams({ repoId: id });
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-muted-foreground text-sm">Loading architecture modules...</p>
      </div>
    );
  }

  if (repositories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <FolderOpen className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">No Repositories Found</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              Upload a codebase ZIP or connect to GitHub to view dynamic architecture diagrams.
            </p>
            <Link to="/upload">
              <Button className="gap-2 cursor-pointer">
                Upload Repository
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Extract nodes and connections dynamically
  const { nodes, connections } = selectedRepo
    ? selectedRepo.architecture ||
      detectCodebaseArchitecture(selectedRepo.fileTree || [], selectedRepo.fileContents || {})
    : { nodes: [], connections: [] };

  const getIcon = (iconName) => {
    return iconMap[iconName] || Cpu;
  };

  const getMatchingFolders = (type) => {
    if (!selectedRepo || !selectedRepo.fileTree) return [];
    const folders = new Set();
    selectedRepo.fileTree.forEach((f) => {
      const parts = f.path.split("/");
      if (parts.length > 1) {
        const parent = parts[0];
        if (
          type === "frontend" &&
          ["components", "pages", "views", "client", "frontend", "ui", "styles", "app", "src"].includes(
            parent.toLowerCase(),
          )
        ) {
          folders.add(parent);
        }
        if (
          type === "backend" &&
          ["controllers", "services", "routes", "api", "server", "backend", "handlers", "src"].includes(
            parent.toLowerCase(),
          )
        ) {
          folders.add(parent);
        }
        if (
          type === "database" &&
          ["models", "entities", "db", "database", "migrations", "prisma", "schemas"].includes(
            parent.toLowerCase(),
          )
        ) {
          folders.add(parent);
        }
      }
    });
    return Array.from(folders).filter((f) => f.toLowerCase() !== "src");
  };

  const selectedNodeData = selectedNode ? nodes.find((n) => n.id === selectedNode) : null;

  return (
    <div className="h-[calc(100vh-150px)] flex gap-6 max-w-7xl mx-auto">
      {/* Repository Selector Sidebar */}
      <div className="w-64 shrink-0 flex flex-col h-full">
        <Card className="h-full flex flex-col">
          <CardContent className="pt-6 flex-1 flex flex-col overflow-hidden">
            <h3 className="font-semibold mb-4 text-slate-200">Select Repository</h3>
            <div className="space-y-2 overflow-y-auto flex-1 pr-1">
              {repositories.map((r) => (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => handleSelectRepository(r.id)}
                  className={`w-full text-left p-3 rounded-xl transition-all text-sm cursor-pointer border ${
                    selectedRepo?.id === r.id
                      ? "border-primary bg-primary/10 text-white"
                      : "border-white/5 hover:bg-muted/30 text-slate-400"
                  }`}
                >
                  <div className="font-medium truncate text-slate-200">{r.name}</div>
                  <div className="text-[10px] text-muted-foreground mt-1 font-mono">
                    {r.language} • {r.files.toLocaleString()} files
                  </div>
                </button>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Main Graph Area */}
      <div className="flex-1 flex flex-col h-full gap-6">
        <div className="flex items-center justify-between shrink-0">
          <div>
            <h1 className="text-3xl font-bold mb-2">Architecture Diagram</h1>
            <p className="text-muted-foreground text-sm">
              Dynamically mapped boundaries of {selectedRepo?.name} from repository files
            </p>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(Math.min(zoom + 0.1, 2))}
            >
              <ZoomIn className="w-4 h-4" />
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setZoom(Math.max(zoom - 0.1, 0.5))}
            >
              <ZoomIn className="w-4 h-4 rotate-180" />
            </Button>
            <Button variant="outline" size="sm" onClick={() => setZoom(1)}>
              Reset
            </Button>
          </div>
        </div>

        <Card className="flex-1 overflow-hidden relative">
          <CardContent className="p-0 h-full relative overflow-hidden bg-[#07070f] bg-radial-grid">
            {/* SVG Connections Layer */}
            <svg className="absolute inset-0 w-full h-full pointer-events-none">
              {connections.map((conn, index) => {
                const fromNode = nodes.find((n) => n.id === conn.from);
                const toNode = nodes.find((n) => n.id === conn.to);
                if (!fromNode || !toNode) return null;

                // Scale nodes coordinates based on zoom & translations
                return (
                  <g key={index}>
                    <motion.line
                      x1={`${fromNode.x}%`}
                      y1={`${fromNode.y}%`}
                      x2={`${toNode.x}%`}
                      y2={`${toNode.y}%`}
                      stroke="url(#purpleGradient)"
                      strokeWidth="2"
                      strokeDasharray="6,4"
                      initial={{ pathLength: 0 }}
                      animate={{ pathLength: 1 }}
                      transition={{ duration: 1.2, delay: index * 0.15 }}
                    />
                    <circle
                      cx={`${toNode.x}%`}
                      cy={`${toNode.y}%`}
                      r="4"
                      fill="#7C3AED"
                      className="animate-ping"
                      style={{ transformOrigin: `${toNode.x}% ${toNode.y}%` }}
                    />
                  </g>
                );
              })}

              <defs>
                <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
                  <stop offset="0%" stopColor="#7C3AED" stopOpacity="0.6" />
                  <stop offset="100%" stopColor="#2563EB" stopOpacity="0.6" />
                </linearGradient>
              </defs>
            </svg>

            {/* Nodes Layer */}
            {nodes.map((node, index) => {
              const IconComponent = getIcon(node.iconName);
              const isSelected = selectedNode === node.id;
              return (
                <motion.div
                  key={node.id}
                  className="absolute cursor-pointer z-10"
                  style={{
                    left: `${node.x}%`,
                    top: `${node.y}%`,
                    transform: "translate(-50%, -50%)",
                  }}
                  initial={{ scale: 0, opacity: 0 }}
                  animate={{ scale: zoom, opacity: 1 }}
                  transition={{ duration: 0.4, delay: index * 0.08 }}
                  onClick={() => setSelectedNode(isSelected ? null : node.id)}
                >
                  <div
                    className={`w-44 p-4 rounded-xl border bg-card/90 backdrop-blur-md transition-all text-center select-none ${
                      isSelected
                        ? "border-primary shadow-xl shadow-primary/20 scale-105"
                        : "border-white/10 hover:border-white/30"
                    }`}
                  >
                    <div
                      className={`w-12 h-12 rounded-xl bg-gradient-to-br ${node.color} flex items-center justify-center mx-auto mb-3 shadow-md`}
                    >
                      <IconComponent className="w-6 h-6 text-white" />
                    </div>
                    <div className="font-semibold text-xs truncate text-slate-100 mb-1">
                      {node.label}
                    </div>
                    <div className="flex flex-wrap gap-1 justify-center max-w-full overflow-hidden">
                      {node.technologies.slice(0, 2).map((tech) => (
                        <span
                          key={tech}
                          className="text-[9px] px-1.5 py-0.5 rounded bg-white/5 border border-white/5 text-slate-400 font-mono font-bold"
                        >
                          {tech}
                        </span>
                      ))}
                      {node.technologies.length > 2 && (
                        <span className="text-[9px] text-muted-foreground pl-0.5 pt-0.5">
                          +{node.technologies.length - 2}
                        </span>
                      )}
                    </div>
                  </div>
                </motion.div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      {/* Details Sidebar Panel */}
      <div className="w-80 shrink-0">
        <Card className="h-full flex flex-col">
          <CardHeader>
            <CardTitle>Architecture Details</CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {selectedNodeData ? (
              <div className="space-y-6">
                <div>
                  <div
                    className={`w-14 h-14 rounded-xl bg-gradient-to-br ${selectedNodeData.color} flex items-center justify-center mb-3 shadow-lg`}
                  >
                    {(() => {
                      const Icon = getIcon(selectedNodeData.iconName);
                      return <Icon className="w-7 h-7 text-white" />;
                    })()}
                  </div>
                  <h3 className="text-lg font-bold text-slate-100 mb-1">
                    {selectedNodeData.label}
                  </h3>
                  <Badge variant="default" className="text-[10px] uppercase font-bold tracking-wider">
                    {selectedNodeData.type} Layer
                  </Badge>
                </div>

                {/* Tech Stack list */}
                <div>
                  <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                    Technologies
                  </h4>
                  <div className="flex flex-wrap gap-1.5">
                    {selectedNodeData.technologies.map((tech) => (
                      <Badge variant="info" key={tech} className="text-xs">
                        {tech}
                      </Badge>
                    ))}
                  </div>
                </div>

                {/* Real matching folders */}
                {getMatchingFolders(selectedNodeData.type).length > 0 && (
                  <div>
                    <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                      Associated Directories
                    </h4>
                    <div className="space-y-1.5">
                      {getMatchingFolders(selectedNodeData.type).map((folder) => (
                        <div
                          key={folder}
                          className="flex items-center gap-2 text-xs p-2 rounded-lg bg-white/[0.02] border border-white/5 font-mono text-slate-300"
                        >
                          <span className="text-purple-400">📁</span>
                          <span>{folder}/</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Connected modules */}
                <div>
                  <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                    Component Interfaces
                  </h4>
                  <div className="space-y-2 text-xs">
                    {connections
                      .filter((c) => c.from === selectedNode || c.to === selectedNode)
                      .map((conn, index) => {
                        const isFromSelected = conn.from === selectedNode;
                        const targetId = isFromSelected ? conn.to : conn.from;
                        const targetNode = nodes.find((n) => n.id === targetId);
                        const targetLabel = targetNode ? targetNode.label : targetId;
                        return (
                          <div
                            key={index}
                            className="flex items-center gap-2 p-2 rounded-lg bg-white/[0.02] border border-white/5 text-slate-300"
                          >
                            <span className="text-emerald-400">
                              {isFromSelected ? "→" : "←"}
                            </span>
                            <span className="font-medium">{targetLabel}</span>
                          </div>
                        );
                      })}
                    {connections.filter((c) => c.from === selectedNode || c.to === selectedNode).length ===
                      0 && (
                      <div className="text-xs text-muted-foreground italic pl-1">
                        Isolated component interface.
                      </div>
                    )}
                  </div>
                </div>

                {/* Metrics */}
                <div>
                  <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                    Simulated Telemetry
                  </h4>
                  <div className="space-y-2 text-xs bg-white/[0.01] p-3 rounded-lg border border-white/5">
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">Status</span>
                      <span className="text-emerald-400 font-semibold">ONLINE</span>
                    </div>
                    {selectedNodeData.type === "frontend" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Main Thread Load</span>
                          <span className="text-slate-300">4%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">First Contentful Paint</span>
                          <span className="text-slate-300">0.8s</span>
                        </div>
                      </>
                    )}
                    {selectedNodeData.type === "backend" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Avg Latency</span>
                          <span className="text-slate-300">12ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">CPU Core Usage</span>
                          <span className="text-slate-300">14%</span>
                        </div>
                      </>
                    )}
                    {selectedNodeData.type === "database" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Query Response Time</span>
                          <span className="text-slate-300">1.8ms</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Active Connections</span>
                          <span className="text-slate-300">5</span>
                        </div>
                      </>
                    )}
                    {selectedNodeData.type === "external" && (
                      <>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Webhook Success Rate</span>
                          <span className="text-slate-300">100%</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-muted-foreground">Round Trip Time</span>
                          <span className="text-slate-300">82ms</span>
                        </div>
                      </>
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-16 text-xs leading-relaxed">
                Click on any node in the architecture graph to inspect its boundaries, interface
                connections, matching folder paths, and technologies.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
