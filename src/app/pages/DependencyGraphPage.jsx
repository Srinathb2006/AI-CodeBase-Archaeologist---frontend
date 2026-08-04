import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import {
  Search,
  Filter,
  ZoomIn,
  ZoomOut,
  Maximize,
  Download,
  Layers,
} from "lucide-react";
import { motion } from "motion/react";
import { getRepositories } from "../services/storageService";
import { detectCodebaseArchitecture } from "../services/repoAnalyzer";

const typeColors = {
  controller: {
    bg: "from-purple-500 to-purple-600",
    border: "border-purple-500",
  },
  service: { bg: "from-blue-500 to-blue-600", border: "border-blue-500" },
  repository: { bg: "from-green-500 to-green-600", border: "border-green-500" },
  model: { bg: "from-orange-500 to-orange-600", border: "border-orange-500" },
  frontend: { bg: "from-sky-500 to-sky-600", border: "border-sky-500" },
  backend: { bg: "from-indigo-500 to-indigo-600", border: "border-indigo-500" },
  database: { bg: "from-emerald-500 to-green-600", border: "border-emerald-500" },
  external: { bg: "from-amber-500 to-orange-600", border: "border-amber-500" },
  library: { bg: "from-violet-500 to-fuchsia-600", border: "border-violet-500" },
};

export function DependencyGraphPage() {
  const [zoom, setZoom] = useState(1);
  const [selectedNode, setSelectedNode] = useState(null);
  const [filterLayer, setFilterLayer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [searchParams, setSearchParams] = useSearchParams();

  useEffect(() => {
    const loadRepositories = async () => {
      setLoadingRepos(true);
      const repos = await getRepositories();
      setRepositories(repos || []);

      const repoId = searchParams.get("repoId");
      let activeRepo = null;

      if (repoId) {
        activeRepo = repos.find((r) => String(r.id) === String(repoId));
      }

      if (!activeRepo && repos.length > 0) {
        activeRepo = repos[0];
      }

      setSelectedRepo(activeRepo);
      if (activeRepo && !repoId) {
        setSearchParams({ repoId: activeRepo.id });
      }
      setLoadingRepos(false);
    };

    loadRepositories();
  }, [searchParams, setSearchParams]);

  const graphData = selectedRepo
    ? selectedRepo.architecture || detectCodebaseArchitecture(selectedRepo.fileTree || [], selectedRepo.fileContents || {})
    : { nodes: [], connections: [] };

  const nodes = graphData?.nodes || [];
  const nodeTypes = Array.from(new Set(nodes.map((node) => node.type)));
  const formatTypeLabel = (type) =>
    type
      .split(/[-_]/)
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(" ");

  const filteredNodes = nodes.filter((node) => {
    const matchesSearch = node.name
      ? node.name.toLowerCase().includes(searchQuery.toLowerCase())
      : node.label.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesFilter = !filterLayer || node.type === filterLayer;
    return matchesSearch && matchesFilter;
  });

  const getConnections = () => {
    const connections = [];
    filteredNodes.forEach((node) => {
      if (!node.dependencies) return;
      node.dependencies.forEach((depId) => {
        const depNode = filteredNodes.find((n) => n.id === depId);
        if (depNode) {
          connections.push({ fromId: node.id, toId: depId });
        }
      });
    });
    return connections;
  };

  const connections = graphData?.connections
    ? graphData.connections
        .map((conn) => ({ fromId: conn.from, toId: conn.to }))
        .filter(
          (conn) =>
            filteredNodes.find((n) => n.id === conn.fromId) &&
            filteredNodes.find((n) => n.id === conn.toId),
        )
    : getConnections();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dependency Graph</h1>
          <p className="text-muted-foreground">
            Interactive visualization of code dependencies and relationships
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="text-sm text-muted-foreground">Repository:</span>
            {loadingRepos ? (
              <span className="text-sm text-muted-foreground">Loading repositories...</span>
            ) : repositories.length > 0 ? (
              <select
                id="dependency-graph-repo-select"
                name="repositoryId"
                value={selectedRepo?.id || ""}
                onChange={(e) => {
                  const repo = repositories.find(
                    (r) => String(r.id) === String(e.target.value),
                  );
                  if (repo) {
                    setSelectedRepo(repo);
                    setSearchParams({ repoId: repo.id });
                  }
                }}
                className="rounded-lg border border-input bg-background px-3 py-2 text-sm text-foreground"
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="text-sm text-muted-foreground">
                No repositories available. Upload a repo to view live dependencies.
              </span>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" className="gap-2">
            <Download className="w-4 h-4" />
            Export
          </Button>
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
            <ZoomOut className="w-4 h-4" />
          </Button>
          <Button variant="outline" size="sm">
            <Maximize className="w-4 h-4" />
          </Button>
        </div>
      </div>

      {/* Filters */}
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center gap-4">
            <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="dependency-graph-search"
                  name="searchQuery"
                  placeholder="Search nodes..."
                  className="pl-9"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
            </div>
            <div className="flex items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filter:</span>
              {nodeTypes.map((type) => (
                <Button
                  key={type}
                  variant={filterLayer === type ? "primary" : "outline"}
                  size="sm"
                  onClick={() => setFilterLayer(filterLayer === type ? null : type)}
                >
                  {formatTypeLabel(type)}
                </Button>
              ))}
              {filterLayer && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setFilterLayer(null)}
                >
                  Clear
                </Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-4 gap-6">
        {/* Graph Visualization */}
        <Card className="lg:col-span-3">
          <CardContent className="pt-6 h-[700px] relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
            <svg
              className="absolute inset-0 w-full h-full"
              style={{ transform: `scale(${zoom})` }}
            >
              {/* Connection Lines */}
              {connections.map((conn, index) => {
                const fromNode = nodes.find((n) => n.id === conn.fromId);
                const toNode = nodes.find((n) => n.id === conn.toId);
                if (!fromNode || !toNode) return null;

                return (
                  <motion.line
                    key={`${conn.fromId}-${conn.toId}`}
                    x1={`${fromNode.x}%`}
                    y1={`${fromNode.y}%`}
                    x2={`${toNode.x}%`}
                    y2={`${toNode.y}%`}
                    stroke={
                      selectedNode &&
                      (conn.fromId === selectedNode || conn.toId === selectedNode)
                        ? "#7C3AED"
                        : "rgba(124, 58, 237, 0.2)"
                    }
                    strokeWidth={
                      selectedNode &&
                      (conn.fromId === selectedNode || conn.toId === selectedNode)
                        ? "3"
                        : "2"
                    }
                    markerEnd="url(#arrowhead)"
                    initial={{ pathLength: 0 }}
                    animate={{ pathLength: 1 }}
                    transition={{ duration: 0.5, delay: index * 0.02 }}
                  />
                );
              })}

              <defs>
                <marker
                  id="arrowhead"
                  markerWidth="10"
                  markerHeight="7"
                  refX="9"
                  refY="3.5"
                  orient="auto"
                >
                  <polygon
                    points="0 0, 10 3.5, 0 7"
                    fill="rgba(124, 58, 237, 0.5)"
                  />
                </marker>
              </defs>
            </svg>

            {/* Nodes */}
            {filteredNodes.map((node, index) => (
              <motion.div
                key={node.id}
                className="absolute cursor-pointer"
                style={{
                  left: `${node.x}%`,
                  top: `${node.y}%`,
                  transform: `translate(-50%, -50%) scale(${zoom})`,
                }}
                initial={{ scale: 0, opacity: 0 }}
                animate={{ scale: zoom, opacity: 1 }}
                transition={{ duration: 0.3, delay: index * 0.03 }}
                onClick={() =>
                  setSelectedNode(node.id === selectedNode ? null : node.id)
                }
              >
                <div
                  className={`px-4 py-2 rounded-xl border-2 transition-all ${
                    selectedNode === node.id
                      ? `${typeColors[node.type].border} shadow-xl scale-110`
                      : "border-border"
                  } ${
                    selectedNode && node.id !== selectedNode ? "opacity-40" : ""
                  } bg-card/90 backdrop-blur-sm hover:border-primary/50`}
                >
                  <div
                    className={`w-3 h-3 rounded-full bg-gradient-to-br ${
                      typeColors[node.type].bg
                    } mb-1 mx-auto`}
                  />

                  <div className="text-xs font-medium text-center whitespace-nowrap">
                    {node.name || node.label}
                  </div>
                </div>
              </motion.div>
            ))}
          </CardContent>
        </Card>

        {/* Details Panel */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Layers className="w-5 h-5" />
                Legend
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {Object.entries(typeColors).map(([type, colors]) => (
                  <div key={type} className="flex items-center gap-3">
                    <div
                      className={`w-8 h-8 rounded-lg bg-gradient-to-br ${colors.bg}`}
                    />
                    <span className="capitalize text-sm">{type}s</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {selectedNode && (
            <Card>
              <CardHeader>
                <CardTitle>Node Details</CardTitle>
              </CardHeader>
              <CardContent>
                {(() => {
                  const node = nodes.find((n) => n.id === selectedNode);
                  if (!node) return null;

                                  const dependsOn = connections
                                    .filter((c) => c.fromId === node.id)
                                    .map((c) => nodes.find((n) => n.id === c.toId))
                    .filter(Boolean);
                                  const usedBy = connections
                                    .filter((c) => c.toId === node.id)
                                    .map((c) => nodes.find((n) => n.id === c.fromId))
                    .filter(Boolean);

                  return (
                    <div className="space-y-4">
                      <div>
                        <div
                          className={`w-12 h-12 rounded-xl bg-gradient-to-br ${
                            typeColors[node.type].bg
                          } mb-3`}
                        />

                        <h3 className="font-semibold mb-1">{node.name || node.label}</h3>
                        <Badge>{node.type}</Badge>
                        {node.confidence !== undefined && (
                          <div className="text-xs text-muted-foreground mt-2">
                            Confidence: <span className="font-semibold">{node.confidence}%</span>
                          </div>
                        )}
                        {node.evidence && node.evidence.length > 0 && (
                          <div className="mt-2">
                            <div className="text-xs font-semibold">Evidence</div>
                            <ul className="text-xs list-disc ml-5 mt-1">
                              {node.evidence.map((e, i) => (
                                <li key={i}>{e}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>

                      {dependsOn.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">
                            Depends On
                          </h4>
                          <div className="space-y-1">
                            {dependsOn.map((dep) => (
                              <div
                                key={dep.id}
                                className="text-xs p-2 rounded-lg bg-muted/50 flex items-center gap-2"
                              >
                                <div
                                  className={`w-2 h-2 rounded-full bg-gradient-to-br ${
                                    typeColors[dep.type].bg
                                  }`}
                                />

                                {dep.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {usedBy.length > 0 && (
                        <div>
                          <h4 className="text-sm font-semibold mb-2">
                            Used By
                          </h4>
                          <div className="space-y-1">
                            {usedBy.map((user) => (
                              <div
                                key={user.id}
                                className="text-xs p-2 rounded-lg bg-muted/50 flex items-center gap-2"
                              >
                                <div
                                  className={`w-2 h-2 rounded-full bg-gradient-to-br ${
                                    typeColors[user.type].bg
                                  }`}
                                />

                                {user.name}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      <div>
                        <h4 className="text-sm font-semibold mb-2">Metrics</h4>
                        <div className="space-y-2 text-sm">
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Dependencies
                            </span>
                            <span>{dependsOn.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Used by
                            </span>
                            <span>{usedBy.length}</span>
                          </div>
                          <div className="flex justify-between">
                            <span className="text-muted-foreground">
                              Complexity
                            </span>
                            <Badge variant="success">Low</Badge>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle>Statistics</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Nodes</span>
                  <span className="font-semibold">{nodes.length}</span>
                </div>
                {Object.entries(
                  nodes.reduce((acc, node) => {
                    acc[node.type] = (acc[node.type] || 0) + 1;
                    return acc;
                  }, {}),
                ).map(([type, count]) => (
                  <div key={type} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">
                      {formatTypeLabel(type)}
                    </span>
                    <span className="font-semibold">{count}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
