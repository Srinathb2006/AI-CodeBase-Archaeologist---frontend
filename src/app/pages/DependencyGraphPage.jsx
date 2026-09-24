import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import { Search, Filter, Maximize, Download, Layers, Minimize2, Maximize2, AlertTriangle, Route } from "lucide-react";
import { ReactFlow, Controls, Background, MiniMap, applyNodeChanges, applyEdgeChanges, Handle, Position, useReactFlow, ReactFlowProvider } from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { getRepositories, getRepositoryGraph } from "../services/storageService";
import { toPng, toSvg } from "html-to-image";

const typeColors = {
  controller: { bg: "from-purple-500 to-purple-600", border: "border-purple-500" },
  service: { bg: "from-blue-500 to-blue-600", border: "border-blue-500" },
  repository: { bg: "from-green-500 to-green-600", border: "border-green-500" },
  model: { bg: "from-orange-500 to-orange-600", border: "border-orange-500" },
  entity: { bg: "from-orange-500 to-orange-600", border: "border-orange-500" },
  frontend: { bg: "from-sky-500 to-sky-600", border: "border-sky-500" },
  component: { bg: "from-sky-500 to-sky-600", border: "border-sky-500" },
  page: { bg: "from-indigo-500 to-indigo-600", border: "border-indigo-500" },
  backend: { bg: "from-indigo-500 to-indigo-600", border: "border-indigo-500" },
  database: { bg: "from-emerald-500 to-green-600", border: "border-emerald-500" },
  config: { bg: "from-gray-500 to-gray-600", border: "border-gray-500" },
  util: { bg: "from-yellow-500 to-yellow-600", border: "border-yellow-500" },
  hook: { bg: "from-pink-500 to-pink-600", border: "border-pink-500" },
  dto: { bg: "from-teal-500 to-teal-600", border: "border-teal-500" },
  library: { bg: "from-rose-500 to-rose-600", border: "border-rose-500" },
  default: { bg: "from-slate-500 to-slate-600", border: "border-slate-500" },
};

const miniMapColors = {
  controller: "#9333ea",
  service: "#2563eb",
  repository: "#16a34a",
  model: "#ea580c",
  entity: "#ea580c",
  frontend: "#0284c7",
  component: "#0284c7",
  page: "#4f46e5",
  backend: "#4f46e5",
  database: "#059669",
  config: "#4b5563",
  util: "#ca8a04",
  hook: "#db2777",
  dto: "#0d9488",
  library: "#e11d48",
  default: "#64748b",
};

const CustomNode = ({ data, selected }) => {
  return (
    <div
      className={`px-4 py-2 rounded-xl border-2 transition-all ${selected ? `${data.colorBorder} shadow-xl scale-110 z-50` : "border-border"
        } bg-card/90 backdrop-blur-sm hover:border-primary/50 relative ${data.dimmed ? 'opacity-20' : 'opacity-100'}`}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <div className={`w-3 h-3 rounded-full bg-gradient-to-br ${data.colorBg} mb-1 mx-auto`} />
      <div className="text-xs font-medium text-center whitespace-nowrap">
        {data.label}
      </div>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const CustomGroupNode = ({ data, selected }) => {
  return (
    <div
      className={`px-3 py-2 min-w-[200px] min-h-[50px] rounded-2xl border-2 transition-all ${selected ? 'border-primary shadow-xl bg-card/60' : 'border-dashed border-primary/40 bg-card/10'
        } backdrop-blur-md relative ${data.dimmed ? 'opacity-20' : 'opacity-100'}`}
    >
      <div className="flex justify-between items-center pb-1">
        <span className="font-semibold text-xs opacity-70 px-2">{data.label}</span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 p-0 hover:text-primary transition-colors text-muted-foreground"
          onClick={(e) => {
            e.stopPropagation();
            data.onToggleCollapse(data.id);
          }}
        >
          {data.collapsed ? <Maximize2 className="w-3 h-3" /> : <Minimize2 className="w-3 h-3" />}
        </Button>
      </div>
    </div>
  );
};


function DependencyGraphContent() {
  const { fitView } = useReactFlow();

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [rawGraph, setRawGraph] = useState({ nodes: [], edges: [] });
  const [selectedNodeId, setSelectedNodeId] = useState(null);
  const [targetNodeId, setTargetNodeId] = useState(null);
  const [collapsedGroups, setCollapsedGroups] = useState(new Set());

  const [filterLayer, setFilterLayer] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");

  const [cycleEdges, setCycleEdges] = useState(new Set());

  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [isProcessingLayout, setIsProcessingLayout] = useState(false);
  const workerRef = useRef(null);
  const [searchParams, setSearchParams] = useSearchParams();

  const nodeTypes = useMemo(() => ({ custom: CustomNode, customGroup: CustomGroupNode }), []);

  const handleToggleCollapse = useCallback((groupId) => {
    setCollapsedGroups(prev => {
      const next = new Set(prev);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }, []);

  useEffect(() => {
    const loadRepositories = async () => {
      setLoadingRepos(true);
      const repos = await getRepositories();
      setRepositories(repos || []);

      const repoId = searchParams.get("repoId");
      let activeRepo = null;
      if (repoId) activeRepo = repos.find((r) => String(r.id) === String(repoId));
      if (!activeRepo && repos.length > 0) activeRepo = repos[0];

      setSelectedRepo(activeRepo);
      if (activeRepo && !repoId) setSearchParams({ repoId: activeRepo.id });
      setLoadingRepos(false);
    };
    loadRepositories();
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    if (selectedRepo?.id) {
      getRepositoryGraph(selectedRepo.id).then(data => {
        setRawGraph(data || { nodes: [], edges: [] });
        setCollapsedGroups(new Set());
        setSelectedNodeId(null);
        setTargetNodeId(null);
      });
    }
  }, [selectedRepo]);

  // Main compilation of active flow elements
  useEffect(() => {
    if (!rawGraph.nodes || rawGraph.nodes.length === 0) return;

    if (workerRef.current) {
      workerRef.current.terminate();
    }

    workerRef.current = new Worker(new URL('../workers/graphLayoutWorker.js', import.meta.url), { type: 'module' });
    setIsProcessingLayout(true);

    workerRef.current.onmessage = (e) => {
      if (e.data.type === 'DONE') {
        const { nodes: layoutedNodes, edges: layoutedEdges, cycleEdges: detectedCycles } = e.data.payload;

        const finalNodes = layoutedNodes.map(n => {
          const typeKey = typeColors[n.data.type] ? n.data.type : "default";
          return {
            ...n,
            data: {
              ...n.data,
              colorBg: typeColors[typeKey].bg,
              colorBorder: typeColors[typeKey].border,
              onToggleCollapse: handleToggleCollapse
            }
          };
        });

        setNodes(finalNodes);
        setEdges(layoutedEdges);
        setCycleEdges(new Set(detectedCycles));
        setIsProcessingLayout(false);
      }
    };

    workerRef.current.postMessage({
      rawGraph,
      searchQuery,
      filterLayer,
      collapsedGroupsArray: Array.from(collapsedGroups),
      selectedNodeId,
      targetNodeId
    });

    return () => {
      if (workerRef.current) {
        workerRef.current.terminate();
        workerRef.current = null;
      }
    };
  }, [rawGraph, searchQuery, filterLayer, collapsedGroups, selectedNodeId, targetNodeId, handleToggleCollapse]);

  const onNodesChange = useCallback((changes) => setNodes((nds) => applyNodeChanges(changes, nds)), []);
  const onEdgesChange = useCallback((changes) => setEdges((eds) => applyEdgeChanges(changes, eds)), []);

  const onNodeClick = (_, node) => {
    // Shift-click for pathing
    if (_.shiftKey && selectedNodeId && selectedNodeId !== node.id) {
      setTargetNodeId(node.id);
    } else {
      setSelectedNodeId(node.id === selectedNodeId ? null : node.id);
      setTargetNodeId(null);
    }
  };
  const onPaneClick = () => {
    setSelectedNodeId(null);
    setTargetNodeId(null);
  };

  const handleExportPNG = () => {
    const rf = document.querySelector('.react-flow');
    if (rf) toPng(rf).then(dataUrl => download(dataUrl, 'dependency-graph.png'));
  };

  const handleExportSVG = () => {
    const rf = document.querySelector('.react-flow');
    if (rf) toSvg(rf).then(dataUrl => download(dataUrl, 'dependency-graph.svg'));
  };

  const handleExportJSON = () => {
    const data = JSON.stringify(rawGraph, null, 2);
    download(URL.createObjectURL(new Blob([data], { type: 'application/json' })), 'dependency-graph.json');
  };

  const download = (href, filename) => {
    const a = document.createElement('a');
    a.href = href;
    a.download = filename;
    a.click();
  };

  const formatTypeLabel = (type) =>
    (type || "default").split(/[-_]/).map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(" ");

  const availableTypes = Array.from(new Set(rawGraph.nodes?.map(n => n.type) || []));
  const selectedNode = rawGraph.nodes?.find(n => n.id === selectedNodeId);
  const selectedNodeFlow = nodes.find(n => n.id === selectedNodeId);
  const targetNode = rawGraph.nodes?.find(n => n.id === targetNodeId);

  const dependsOn = rawGraph.edges?.filter(e => e.source === selectedNodeId).map(e => rawGraph.nodes.find(n => n.id === e.target)).filter(Boolean) || [];
  const usedBy = rawGraph.edges?.filter(e => e.target === selectedNodeId).map(e => rawGraph.nodes.find(n => n.id === e.source)).filter(Boolean) || [];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Dependency Graph</h1>
          <p className="text-muted-foreground">Interactive visualization of code dependencies and relationships</p>
        </div>
        <div className="flex gap-2 relative">
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportPNG}>PNG</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportSVG}>SVG</Button>
          <Button variant="outline" size="sm" className="gap-2" onClick={handleExportJSON}><Download className="w-4 h-4" /> JSON</Button>
        </div>
      </div>

      <Card>
        <CardContent className="pt-6">
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="relative flex-1 w-full">
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
            <div className="flex flex-wrap items-center gap-2">
              <Filter className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">Filter:</span>
              {availableTypes.map((type) => {
                if (type === 'group') return null;
                return (
                  <Button
                    key={type}
                    variant={filterLayer === type ? "primary" : "outline"}
                    size="sm"
                    onClick={() => setFilterLayer(filterLayer === type ? null : type)}
                  >
                    {formatTypeLabel(type)}
                  </Button>
                );
              })}
              {filterLayer && <Button variant="ghost" size="sm" onClick={() => setFilterLayer(null)}>Clear</Button>}
            </div>
          </div>
          {cycleEdges.size > 0 && (
            <div className="mt-4 flex items-center gap-2 text-xs text-red-400 bg-red-500/10 border border-red-500/20 p-2 rounded-lg">
              <AlertTriangle className="w-3 h-3" />
              <span>{cycleEdges.size} cycle{cycleEdges.size === 1 ? "" : "s"} detected in the current graph.</span>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-4 gap-6">
        <Card className="lg:col-span-3">
          <CardContent className="p-0 h-[700px] relative overflow-hidden bg-gradient-to-br from-background via-background to-primary/5">
            {isProcessingLayout && (
              <div className="absolute inset-0 z-50 flex items-center justify-center bg-background/50 backdrop-blur-sm">
                <div className="flex flex-col items-center gap-2">
                  <div className="w-8 h-8 border-4 border-primary border-t-transparent rounded-full animate-spin"></div>
                  <span className="text-sm font-medium">Processing Graph Layout...</span>
                </div>
              </div>
            )}
            <ReactFlow
              nodes={nodes}
              edges={edges}
              nodeTypes={nodeTypes}
              onNodesChange={onNodesChange}
              onEdgesChange={onEdgesChange}
              onNodeClick={onNodeClick}
              onPaneClick={onPaneClick}
              fitView
              onlyRenderVisibleElements={true}
              attributionPosition="bottom-left"
            >
              <Background gap={20} color="#333" />
              <Controls />
              <MiniMap
                zoomable
                pannable
                nodeColor={(n) => {
                  if (n.type === 'customGroup') return 'rgba(100,116,139,0.28)';
                  const t = n.data?.type || 'default';
                  return miniMapColors[t] || miniMapColors.default;
                }}
              />
            </ReactFlow>
          </CardContent>
        </Card>

        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Layers className="w-5 h-5" /> Legend</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 gap-3">
                {Object.entries(typeColors).map(([type, colors]) => (
                  availableTypes.includes(type) && (
                    <div key={type} className="flex items-center gap-3">
                      <div className={`w-6 h-6 rounded-lg bg-gradient-to-br ${colors.bg}`} />
                      <span className="capitalize text-xs leading-tight">{formatTypeLabel(type)}</span>
                    </div>
                  )
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
                <div className="space-y-4">
                  <div>
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${selectedNodeFlow?.data?.colorBg || 'from-gray-500 to-gray-500'} mb-3`} />
                    <h3 className="font-semibold mb-1 break-all">{selectedNode.label}</h3>
                    <div className="flex gap-2 mt-2">
                      <Badge>{selectedNode.type}</Badge>
                      {selectedNode.language && <Badge variant="outline">{selectedNode.language}</Badge>}
                    </div>
                    {targetNode && (
                      <div className="mt-3 p-2 bg-primary/10 rounded-lg text-xs">
                        <strong>Path Trace target:</strong> {targetNode.label}
                      </div>
                    )}
                    {selectedNode.filePath && (
                      <div className="text-xs text-muted-foreground mt-3 break-all">
                        <span className="font-semibold">Path:</span> {selectedNode.filePath}
                      </div>
                    )}
                  </div>

                  {dependsOn.length > 0 && !targetNodeId && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Depends On</h4>
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-2">
                        {dependsOn.map((dep) => (
                          <div key={dep.id} className="text-xs p-2 rounded-lg bg-muted/50 flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full min-w-2 min-h-2 bg-gradient-to-br ${typeColors[typeColors[dep.type] ? dep.type : 'default'].bg}`} />
                            <span className="truncate">{dep.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {usedBy.length > 0 && !targetNodeId && (
                    <div>
                      <h4 className="text-sm font-semibold mb-2">Used By</h4>
                      <div className="space-y-1 max-h-32 overflow-y-auto pr-2">
                        {usedBy.map((user) => (
                          <div key={user.id} className="text-xs p-2 rounded-lg bg-muted/50 flex items-center gap-2">
                            <div className={`w-2 h-2 rounded-full min-w-2 min-h-2 bg-gradient-to-br ${typeColors[typeColors[user.type] ? user.type : 'default'].bg}`} />
                            <span className="truncate">{user.label}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
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
                  <span className="font-semibold">{nodes.filter(n => n.type !== 'customGroup').length}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">Total Edges</span>
                  <span className="font-semibold">{edges.length}</span>
                </div>
                {availableTypes.map((type) => {
                  if (type === 'group') return null;
                  const count = nodes.filter(n => n.data?.type === type).length;
                  if (count === 0) return null;
                  return (
                    <div key={type} className="flex justify-between text-sm">
                      <span className="text-muted-foreground">{formatTypeLabel(type)}</span>
                      <span className="font-semibold">{count}</span>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}

export function DependencyGraphPage() {
  return (
    <ReactFlowProvider>
      <DependencyGraphContent />
    </ReactFlowProvider>
  );
}
