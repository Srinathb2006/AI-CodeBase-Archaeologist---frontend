import { useState, useEffect, useCallback, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Badge } from "../components/Badge";
import {
  Database,
  Table,
  Key,
  Link as LinkIcon,
  RefreshCw,
  LayoutTemplate,
  Layers,
  Hash,
  Terminal,
  Download,
  Play,
  BookOpen,
  Bot,
  Sparkles,
  FolderGit2,
  AlertCircle,
} from "lucide-react";
import { Button } from "../components/Button";
import {
  ReactFlow,
  Controls,
  Background,
  MiniMap,
  applyNodeChanges,
  applyEdgeChanges,
  Handle,
  Position,
  useReactFlow,
  ReactFlowProvider,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import dagre from "dagre";
import {
  getDatabaseSchema,
  executeDatabaseQuery,
  explainDatabaseQuery,
  previewDatabaseTable,
  explainSchemaEntityAi,
  extractDatabaseSchemaFromRepo,
} from "../services/databaseService";
import { getRepositories, getRepository } from "../services/storageService";

const TYPE_ICONS = {
  table: <Table className="w-6 h-6 text-white" />,
  view: <LayoutTemplate className="w-6 h-6 text-white" />,
  sequence: <Hash className="w-6 h-6 text-white" />,
  enum: <Layers className="w-6 h-6 text-white" />,
};

function exportToCsv(data, filename) {
  if (!data || data.length === 0) return;
  const headers = Object.keys(data[0]);
  const rows = data.map((item) =>
    headers
      .map((header) => {
        let val = item[header];
        if (typeof val === "object") val = JSON.stringify(val);
        if (typeof val === "string") return `"${val.replace(/"/g, '""')}"`;
        return val;
      })
      .join(",")
  );
  const csvFormat = [headers.join(","), ...rows].join("\n");
  const blob = new Blob([csvFormat], { type: "text/csv;charset=utf-8;" });
  const link = document.createElement("a");
  const url = URL.createObjectURL(blob);
  link.setAttribute("href", url);
  link.setAttribute("download", filename);
  link.style.visibility = "hidden";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

const CustomNode = ({ data, selected }) => {
  return (
    <div
      className={`px-0 py-0 rounded-2xl transition-all ${
        selected ? "ring-2 ring-primary shadow-xl scale-110 z-50" : ""
      } bg-card/90 backdrop-blur-sm relative cursor-pointer`}
      onClick={data.onClickNode}
    >
      <Handle type="target" position={Position.Top} className="opacity-0" />
      <Card className="w-48 overflow-hidden glass">
        <CardContent className="p-0">
          <div className="bg-gradient-to-br from-primary/80 to-secondary/80 p-3 flex items-center gap-3">
            {TYPE_ICONS[data.type] || TYPE_ICONS.table}
            <div className="font-semibold text-white truncate flex-1 leading-tight">
              {data.label}
            </div>
          </div>
          <div className="p-3 text-xs text-muted-foreground flex justify-between bg-card text-center">
            {data.type === "table" || data.type === "view" ? (
              <span>{data.columns || 0} cols</span>
            ) : null}
            {data.type === "table" ? (
              <span className="font-mono">{data.rows || 0} rows</span>
            ) : null}
          </div>
        </CardContent>
      </Card>
      <Handle type="source" position={Position.Bottom} className="opacity-0" />
    </div>
  );
};

const getLayoutedElements = (nodes, edges, direction = "TB") => {
  const dagreGraph = new dagre.graphlib.Graph();
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({ rankdir: direction, align: "UL", ranksep: 80, nodesep: 100 });

  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, { width: 200, height: 80 });
  });

  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  try {
    dagre.layout(dagreGraph);
  } catch (e) {
    console.error("Dagre layout error", e);
  }

  nodes.forEach((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    if (!nodeWithPosition) return;
    node.targetPosition = direction === "LR" ? "left" : "top";
    node.sourcePosition = direction === "LR" ? "right" : "bottom";
    node.position = { x: nodeWithPosition.x - 100, y: nodeWithPosition.y - 40 };
    return node;
  });

  return { nodes, edges };
};

function DynamicTable({ data }) {
  if (!data || data.length === 0)
    return <div className="text-muted-foreground p-4">No data found.</div>;
  const headers = Object.keys(data[0]);
  return (
    <div className="overflow-auto max-h-[300px] border border-border rounded-xl">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 sticky top-0 backdrop-blur z-10">
          <tr>
            {headers.map((h) => (
              <th key={h} className="text-left p-3 font-medium whitespace-nowrap">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} className="border-b last:border-0 border-border/50 hover:bg-muted/20">
              {headers.map((h) => (
                <td
                  key={h}
                  className="p-3 whitespace-nowrap text-foreground/80 max-w-[200px] truncate"
                  title={JSON.stringify(row[h])}
                >
                  {typeof row[h] === "object" ? JSON.stringify(row[h]) : String(row[h])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function DatabaseContent() {
  const { fitView } = useReactFlow();
  const [searchParams, setSearchParams] = useSearchParams();

  // Repository Selection State
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [loadingRepos, setLoadingRepos] = useState(true);

  // Database Schema State
  const [schema, setSchema] = useState(null);
  const [loading, setLoading] = useState(true);
  const [schemaError, setSchemaError] = useState("");

  const [nodes, setNodes] = useState([]);
  const [edges, setEdges] = useState([]);
  const [selectedEntityId, setSelectedEntityId] = useState(null);
  const [selectedEntityType, setSelectedEntityType] = useState(null);
  const [activeTab, setActiveTab] = useState("schema");

  // Preview State
  const [previewData, setPreviewData] = useState([]);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewPage, setPreviewPage] = useState(0);

  // AI State
  const [aiExplanation, setAiExplanation] = useState("");
  const [aiLoading, setAiLoading] = useState(false);

  // SQL Console State
  const [querySql, setQuerySql] = useState("");
  const [queryResults, setQueryResults] = useState(null);
  const [queryError, setQueryError] = useState(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryHistory, setQueryHistory] = useState(() =>
    JSON.parse(localStorage.getItem("db_query_history") || "[]")
  );
  const [isExplainMode, setIsExplainMode] = useState(false);

  // 1. Load All Repositories and sync with searchParams (repoId)
  useEffect(() => {
    const loadRepos = async () => {
      setLoadingRepos(true);
      try {
        const list = await getRepositories();
        const repos = Array.isArray(list) ? list : [];
        setRepositories(repos);

        const urlRepoId = searchParams.get("repoId");
        let active = null;
        if (urlRepoId) {
          active = repos.find((r) => String(r.id) === String(urlRepoId));
        }
        if (!active && repos.length > 0) {
          active = repos[0];
        }

        if (active) {
          setSelectedRepo(active);
          if (!urlRepoId) {
            setSearchParams({ repoId: active.id }, { replace: true });
          }
        } else {
          setSelectedRepo(null);
        }
      } catch (err) {
        console.error("Failed to load repositories:", err);
      } finally {
        setLoadingRepos(false);
      }
    };
    loadRepos();
  }, [searchParams, setSearchParams]);

  const handleEntitySelect = (id, type) => {
    setSelectedEntityId(id);
    setSelectedEntityType(type);
    if (activeTab === "preview" && (type === "table" || type === "view")) {
      setPreviewPage(0);
      fetchPreview(id, 0);
    }
    if (activeTab === "ai") {
      setAiExplanation("");
    }
  };

  const nodeTypes = useMemo(() => ({ custom: CustomNode }), []);

  const onNodesChange = useCallback(
    (changes) => setNodes((nds) => applyNodeChanges(changes, nds)),
    []
  );

  const onEdgesChange = useCallback(
    (changes) => setEdges((eds) => applyEdgeChanges(changes, eds)),
    []
  );

  // 2. Fetch Schema Strictly for the Selected Repository
  const fetchSchema = useCallback(
    async (refresh = false) => {
      if (!selectedRepo) {
        setSchema({ tables: [], views: [], foreignKeys: [], sequences: [], enums: [] });
        setNodes([]);
        setEdges([]);
        setLoading(false);
        return;
      }

      setLoading(true);
      setSchemaError("");

      try {
        // Ensure we have complete repository object with fileContents
        let fullRepo = selectedRepo;
        if (!fullRepo.fileContents || Object.keys(fullRepo.fileContents).length === 0) {
          try {
            const fetched = await getRepository(selectedRepo.id);
            if (fetched) fullRepo = fetched;
          } catch (e) {
            console.debug("Could not fetch full repository details:", e);
          }
        }

        // Try backend repository schema extraction
        let data = null;
        try {
          data = await getDatabaseSchema(selectedRepo.id, refresh);
        } catch (apiErr) {
          console.debug("Backend schema extraction endpoint error:", apiErr);
        }

        // If backend returned no tables, check client-side parsing of repository files
        if (!data || !Array.isArray(data.tables) || data.tables.length === 0) {
          const clientExtracted = extractDatabaseSchemaFromRepo(fullRepo);
          if (clientExtracted && clientExtracted.tables && clientExtracted.tables.length > 0) {
            data = clientExtracted;
          }
        }

        const validSchema = data && Array.isArray(data.tables)
          ? data
          : { tables: [], views: [], foreignKeys: [], sequences: [], enums: [] };

        setSchema(validSchema);

        const newNodes = [];
        const newEdges = [];

        validSchema.tables?.forEach((t) => {
          const nodeId = t.id || t.name;
          newNodes.push({
            id: nodeId,
            type: "custom",
            position: { x: 0, y: 0 },
            data: {
              id: nodeId,
              label: t.name,
              schema: t.schema || "public",
              type: "table",
              columns: t.columns?.length || 0,
              rows: t.rowCount ?? 0,
              onClickNode: () => handleEntitySelect(nodeId, "table"),
            },
          });
        });

        validSchema.views?.forEach((v) => {
          const nodeId = v.id || v.name;
          newNodes.push({
            id: nodeId,
            type: "custom",
            position: { x: 0, y: 0 },
            data: {
              id: nodeId,
              label: v.name,
              schema: v.schema || "public",
              type: "view",
              columns: v.columns?.length || 0,
              onClickNode: () => handleEntitySelect(nodeId, "view"),
            },
          });
        });

        validSchema.sequences?.forEach((s) => {
          const nodeId = `${s.schema || "public"}.${s.name}`;
          newNodes.push({
            id: nodeId,
            type: "custom",
            position: { x: 0, y: 0 },
            data: {
              id: nodeId,
              label: s.name,
              schema: s.schema || "public",
              type: "sequence",
              onClickNode: () => handleEntitySelect(nodeId, "sequence"),
            },
          });
        });

        validSchema.enums?.forEach((e) => {
          const nodeId = `${e.schema || "public"}.${e.name}`;
          newNodes.push({
            id: nodeId,
            type: "custom",
            position: { x: 0, y: 0 },
            data: {
              id: nodeId,
              label: e.name,
              schema: e.schema || "public",
              type: "enum",
              onClickNode: () => handleEntitySelect(nodeId, "enum"),
            },
          });
        });

        validSchema.foreignKeys?.forEach((fk) => {
          if (
            newNodes.find((n) => n.id === fk.table) &&
            newNodes.find((n) => n.id === fk.foreignTable)
          ) {
            newEdges.push({
              id: `fk_${fk.name || fk.table}_${fk.foreignTable}_${fk.column}`,
              source: fk.table,
              target: fk.foreignTable,
              animated: true,
              label: `${fk.column} -> ${fk.foreignColumn}`,
              style: { stroke: "rgba(124, 58, 237, 0.6)", strokeWidth: 2 },
            });
          }
        });

        if (newNodes.length > 0) {
          const layouted = getLayoutedElements(newNodes, newEdges);
          setNodes(layouted.nodes);
          setEdges(layouted.edges);
          setSelectedEntityId(newNodes[0].id);
          setSelectedEntityType(newNodes[0].data.type);
          setQuerySql(`SELECT * FROM ${validSchema.tables[0]?.name || "table"} LIMIT 10;`);
          setTimeout(() => fitView({ duration: 800 }), 300);
        } else {
          setNodes([]);
          setEdges([]);
          setSelectedEntityId(null);
          setSelectedEntityType(null);
          setQuerySql("");
        }
      } catch (e) {
        console.error("Failed to load repository schema", e);
        setSchemaError("Failed to extract schema from repository.");
        setNodes([]);
        setEdges([]);
      } finally {
        setLoading(false);
      }
    },
    [selectedRepo, fitView]
  );

  useEffect(() => {
    if (selectedRepo) {
      fetchSchema(false);
    }
  }, [selectedRepo, fetchSchema]);

  const fetchPreview = useCallback(
    async (table, page = 0) => {
      setPreviewLoading(true);
      try {
        const resp = await previewDatabaseTable(selectedRepo?.id, table, page, 20);
        setPreviewData(Array.isArray(resp) ? resp : []);
      } catch (e) {
        setPreviewData([]);
      } finally {
        setPreviewLoading(false);
      }
    },
    [selectedRepo?.id]
  );

  const fetchAiExplanation = useCallback(async (entity) => {
    setAiLoading(true);
    try {
      const resp = await explainSchemaEntityAi(entity);
      setAiExplanation(resp.explanation || "No explanation available.");
    } catch (e) {
      setAiExplanation("AI explanation is not available for this schema entity.");
    } finally {
      setAiLoading(false);
    }
  }, []);

  const selectedData = useMemo(() => {
    if (!schema || !selectedEntityId || !selectedEntityType) return null;
    if (selectedEntityType === "table")
      return schema.tables?.find((t) => (t.id || t.name) === selectedEntityId);
    if (selectedEntityType === "view")
      return schema.views?.find((v) => (v.id || v.name) === selectedEntityId);
    if (selectedEntityType === "sequence")
      return schema.sequences?.find(
        (s) => `${s.schema || "public"}.${s.name}` === selectedEntityId || s.name === selectedEntityId
      );
    if (selectedEntityType === "enum")
      return schema.enums?.find(
        (e) => `${e.schema || "public"}.${e.name}` === selectedEntityId || e.name === selectedEntityId
      );
    return null;
  }, [schema, selectedEntityId, selectedEntityType]);

  // Handle Tab Switch Side-effects
  useEffect(() => {
    if (
      activeTab === "preview" &&
      selectedEntityId &&
      (selectedEntityType === "table" || selectedEntityType === "view")
    ) {
      fetchPreview(selectedEntityId, previewPage);
    }
    if (activeTab === "ai" && selectedData && !aiExplanation) {
      fetchAiExplanation(selectedData);
    }
  }, [activeTab, selectedEntityId, selectedEntityType, previewPage, selectedData, fetchPreview, fetchAiExplanation, aiExplanation]);

  const handleRunQuery = async (explain = false) => {
    if (!querySql.trim() || !selectedRepo) return;
    setQueryLoading(true);
    setQueryError(null);
    setIsExplainMode(explain);

    const newHist = [querySql, ...queryHistory.filter((q) => q !== querySql)].slice(0, 20);
    setQueryHistory(newHist);
    localStorage.setItem("db_query_history", JSON.stringify(newHist));

    try {
      const res = explain
        ? await explainDatabaseQuery(selectedRepo.id, querySql)
        : await executeDatabaseQuery(selectedRepo.id, querySql);
      if (res?.error) setQueryError(res.error);
      else if (explain && res?.plan) setQueryResults([{ plan: res.plan }]);
      else setQueryResults(Array.isArray(res) ? res : []);
    } catch (e) {
      setQueryError(
        e.message || "Query execution disabled: no live database instance attached to this repository."
      );
    } finally {
      setQueryLoading(false);
    }
  };

  const hasTables = schema && Array.isArray(schema.tables) && schema.tables.length > 0;

  return (
    <div className="space-y-6">
      {/* Header with Title and Repository Selector */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold mb-2 flex items-center gap-3">
            <Database className="w-8 h-8 text-primary" /> Database Explorer
          </h1>
          <p className="text-muted-foreground">
            {selectedRepo ? (
              <span>
                Schema architecture and relationships for{" "}
                <span className="font-semibold text-foreground">{selectedRepo.name}</span>
              </span>
            ) : (
              "Select a repository to explore its database schema"
            )}
          </p>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {repositories.length > 0 && (
            <div className="flex items-center gap-2">
              <FolderGit2 className="w-4 h-4 text-muted-foreground" />
              <select
                className="bg-card border border-border rounded-lg text-sm px-3 py-1.5 font-medium max-w-xs truncate focus:outline-none focus:ring-1 focus:ring-primary"
                value={selectedRepo?.id || ""}
                onChange={(e) => {
                  const target = repositories.find((r) => String(r.id) === String(e.target.value));
                  if (target) {
                    setSelectedRepo(target);
                    setSearchParams({ repoId: target.id });
                  }
                }}
              >
                {repositories.map((repo) => (
                  <option key={repo.id} value={repo.id}>
                    {repo.name}
                  </option>
                ))}
              </select>
            </div>
          )}

          {hasTables && (
            <Badge variant="info">
              {schema.tables.length} Table{schema.tables.length === 1 ? "" : "s"}
            </Badge>
          )}

          {hasTables && (
            <Button variant="outline" size="sm" onClick={() => fitView({ duration: 800 })}>
              Reset View
            </Button>
          )}

          <Button
            variant="primary"
            size="sm"
            onClick={() => fetchSchema(true)}
            disabled={loading || !selectedRepo}
          >
            <RefreshCw className={`w-4 h-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh
            Schema
          </Button>
        </div>
      </div>

      {/* Loading State */}
      {loading && (
        <Card className="p-16 text-center border-border/50">
          <RefreshCw className="w-10 h-10 animate-spin text-primary mx-auto mb-4" />
          <h3 className="font-semibold text-lg mb-1">Analyzing Repository Schema...</h3>
          <p className="text-sm text-muted-foreground">
            Scanning repository files for SQL DDL, ORM entities, and database definitions.
          </p>
        </Card>
      )}

      {/* Empty State: No Database Schema Detected in Repository */}
      {!loading && !hasTables && (
        <Card className="border-border/60 bg-gradient-to-b from-card to-card/50">
          <CardContent className="py-16 px-6 text-center max-w-xl mx-auto">
            <div className="w-16 h-16 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center mx-auto mb-4 text-primary">
              <Database className="w-8 h-8 opacity-80" />
            </div>
            <h2 className="text-xl font-bold mb-2">
              No database schema detected in this repository
            </h2>
            <p className="text-sm text-muted-foreground mb-6 leading-relaxed">
              <span className="font-semibold text-foreground">
                {selectedRepo?.name || "The selected repository"}
              </span>{" "}
              appears to be a frontend-only project (or does not contain database models, SQL migrations, or ORM schemas). Database Explorer visualizes database architecture when SQL, ORM entities, or schema definitions are present.
            </p>
            <div className="flex flex-wrap items-center justify-center gap-2">
              <Badge variant="outline" className="px-3 py-1">
                Frontend / Client-only
              </Badge>
              <Badge variant="outline" className="px-3 py-1">
                No SQL / DDL files
              </Badge>
              <Badge variant="outline" className="px-3 py-1">
                0 Database Entities
              </Badge>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Schema Graph & Explorer - Only shown when tables exist */}
      {!loading && hasTables && (
        <>
          <Card>
            <CardContent className="p-0">
              <div className="h-[400px] relative bg-gradient-to-br from-background via-background to-primary/5 rounded-xl overflow-hidden group">
                <ReactFlow
                  nodes={nodes}
                  edges={edges}
                  nodeTypes={nodeTypes}
                  onNodesChange={onNodesChange}
                  onEdgesChange={onEdgesChange}
                  onNodeClick={(_, node) => handleEntitySelect(node.id, node.data.type)}
                  fitView
                  attributionPosition="bottom-left"
                >
                  <Background gap={20} color="#333" />
                  <Controls className="opacity-0 group-hover:opacity-100 transition-opacity" />
                  <MiniMap
                    zoomable
                    pannable
                    nodeColor="#7C3AED"
                    className="opacity-0 group-hover:opacity-100 transition-opacity"
                  />
                </ReactFlow>
              </div>
            </CardContent>
          </Card>

          <div className="grid lg:grid-cols-4 gap-6">
            {/* Directory Left Panel */}
            <Card className="lg:col-span-1">
              <CardHeader className="py-4 border-b border-border bg-muted/20">
                <CardTitle className="text-base flex items-center gap-2">
                  <Database className="w-4 h-4" /> Directory
                </CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="h-[500px] overflow-y-auto p-3 space-y-2">
                  <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-2 mb-2 px-2">
                    Tables ({schema.tables?.length || 0})
                  </div>
                  {schema.tables?.map((t) => {
                    const tableId = t.id || t.name;
                    return (
                      <button
                        key={tableId}
                        onClick={() => handleEntitySelect(tableId, "table")}
                        className={`w-full p-2.5 rounded-lg text-left transition-all ${
                          selectedEntityId === tableId
                            ? "bg-primary/20 text-primary border border-primary/50"
                            : "hover:bg-muted border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <Table className="w-4 h-4" />
                          <span className="font-medium text-sm truncate">{t.name}</span>
                        </div>
                        <div className="text-[10px] text-muted-foreground mt-1 ml-7">
                          {t.schema || "public"} • {t.columns?.length || 0} cols
                        </div>
                      </button>
                    );
                  })}

                  {schema.views?.length > 0 && (
                    <div className="text-xs font-bold text-muted-foreground uppercase tracking-widest mt-6 mb-2 px-2">
                      Views ({schema.views.length})
                    </div>
                  )}
                  {schema.views?.map((v) => {
                    const viewId = v.id || v.name;
                    return (
                      <button
                        key={viewId}
                        onClick={() => handleEntitySelect(viewId, "view")}
                        className={`w-full p-2.5 rounded-lg text-left transition-all ${
                          selectedEntityId === viewId
                            ? "bg-primary/20 text-primary border border-primary/50"
                            : "hover:bg-muted border border-transparent"
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <LayoutTemplate className="w-4 h-4" />
                          <span className="font-medium text-sm truncate">{v.name}</span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </CardContent>
            </Card>

            {/* Detailed Middle Panel */}
            <Card className="lg:col-span-3 flex flex-col h-[555px]">
              {selectedData ? (
                <>
                  <div className="p-4 border-b border-border flex items-center justify-between bg-muted/10">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-primary/20 flex items-center justify-center text-primary">
                        {selectedEntityType === "table" ? (
                          <Table className="w-4 h-4" />
                        ) : selectedEntityType === "view" ? (
                          <LayoutTemplate className="w-4 h-4" />
                        ) : (
                          <Hash className="w-4 h-4" />
                        )}
                      </div>
                      <h2 className="text-xl font-bold">{selectedData.name}</h2>
                      <Badge variant="outline" className="uppercase">
                        {selectedEntityType}
                      </Badge>
                    </div>
                    <div className="flex bg-muted p-1 rounded-lg">
                      <button
                        onClick={() => setActiveTab("schema")}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all ${
                          activeTab === "schema"
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Schema
                      </button>
                      <button
                        onClick={() => setActiveTab("preview")}
                        disabled={selectedEntityType === "enum" || selectedEntityType === "sequence"}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all disabled:opacity-50 ${
                          activeTab === "preview"
                            ? "bg-background shadow-sm text-foreground"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        Preview
                      </button>
                      <button
                        onClick={() => setActiveTab("ai")}
                        className={`px-4 py-1.5 text-sm font-medium rounded-md transition-all flex items-center gap-1 ${
                          activeTab === "ai"
                            ? "bg-background shadow-sm text-primary"
                            : "text-muted-foreground hover:text-foreground"
                        }`}
                      >
                        <Sparkles className="w-3 h-3" /> AI Explain
                      </button>
                    </div>
                  </div>

                  <div className="flex-1 overflow-y-auto p-4 relative">
                    {activeTab === "schema" && (
                      <div className="space-y-6">
                        {selectedData.columns?.length > 0 && (
                          <div>
                            <h4 className="font-semibold mb-3 flex items-center gap-2">
                              <Database className="w-5 h-5 text-primary" /> Column Definitions
                            </h4>
                            <div className="border border-border rounded-xl overflow-hidden bg-card">
                              <table className="w-full text-sm">
                                <thead className="bg-muted/50 border-b border-border">
                                  <tr>
                                    <th className="text-left p-3 font-medium">Name</th>
                                    <th className="text-left p-3 font-medium">Data Type</th>
                                    <th className="text-left p-3 font-medium">Flags</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {selectedData.columns.map((c, i) => (
                                    <tr
                                      key={i}
                                      className="border-b last:border-0 border-border/50 hover:bg-muted/30"
                                    >
                                      <td className="p-3">
                                        <code className="font-bold">{c.name}</code>
                                      </td>
                                      <td className="p-3 text-muted-foreground">{c.type}</td>
                                      <td className="p-3 flex gap-1">
                                        {!c.isNullable && (
                                          <Badge variant="warning" className="text-[10px]">
                                            NOT NULL
                                          </Badge>
                                        )}
                                        {c.isPrimary && (
                                          <Badge
                                            variant="info"
                                            className="text-[10px] bg-sky-500/10 text-sky-500 border-sky-500/20"
                                          >
                                            <Key className="w-3 h-3 mr-1" /> PK
                                          </Badge>
                                        )}
                                        {c.isForeignKey && (
                                          <Badge
                                            variant="outline"
                                            className="text-[10px] text-purple-400 border-purple-400/30"
                                          >
                                            FK
                                          </Badge>
                                        )}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        {selectedEntityType === "table" &&
                          schema.foreignKeys?.some(
                            (fk) =>
                              fk.table === (selectedData.id || selectedData.name) ||
                              fk.foreignTable === (selectedData.id || selectedData.name)
                          ) && (
                            <div>
                              <h4 className="font-semibold mb-3">Relationships</h4>
                              <div className="space-y-2">
                                {schema.foreignKeys
                                  .filter(
                                    (fk) => fk.table === (selectedData.id || selectedData.name)
                                  )
                                  .map((fk, i) => (
                                    <div
                                      key={i}
                                      className="flex items-center gap-3 p-3 rounded-xl bg-muted/20 border border-border/50"
                                    >
                                      <LinkIcon className="w-4 h-4 text-primary" />
                                      <code className="text-sm bg-background px-2 py-1 rounded">
                                        {fk.column}
                                      </code>
                                      <span className="text-muted-foreground text-sm">references</span>
                                      <div
                                        className="flex items-center gap-2 bg-background px-2 py-1 rounded border cursor-pointer hover:border-primary"
                                        onClick={() =>
                                          handleEntitySelect(fk.foreignTable, "table")
                                        }
                                      >
                                        <Table className="w-3 h-3" />
                                        <span className="font-mono text-sm text-primary">
                                          {fk.foreignTable}
                                        </span>
                                      </div>
                                    </div>
                                  ))}
                              </div>
                            </div>
                          )}
                      </div>
                    )}

                    {activeTab === "preview" && (
                      <div className="space-y-4">
                        {previewLoading ? (
                          <div className="flex items-center justify-center p-12">
                            <RefreshCw className="w-6 h-6 animate-spin text-primary" />
                          </div>
                        ) : (
                          <>
                            <DynamicTable data={previewData} />
                            <div className="flex items-center justify-between mt-2">
                              <span className="text-xs text-muted-foreground">
                                Showing {previewData.length} records.
                              </span>
                            </div>
                          </>
                        )}
                      </div>
                    )}

                    {activeTab === "ai" && (
                      <div className="space-y-4 max-w-3xl">
                        <h3 className="font-semibold flex items-center gap-2 text-primary">
                          <Bot className="w-5 h-5" /> AI Schema Explanation
                        </h3>
                        {aiLoading ? (
                          <div className="p-4 bg-muted/20 rounded-xl animate-pulse h-40">
                            Analyzing schema entity...
                          </div>
                        ) : (
                          <div className="p-6 bg-card border border-border/50 rounded-xl whitespace-pre-wrap leading-relaxed shadow-sm">
                            {aiExplanation ||
                              "Click AI Explain to analyze this entity's design and relationships."}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="flex items-center justify-center h-full text-muted-foreground">
                  Select a table from the directory or graph to view details.
                </div>
              )}
            </Card>
          </div>

          {/* SQL Query Console */}
          <Card>
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="flex items-center gap-2">
                <Terminal className="w-5 h-5" /> Repository SQL Console
              </CardTitle>
              <div className="flex gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => handleRunQuery(true)}
                  disabled={queryLoading}
                >
                  <BookOpen className="w-4 h-4 mr-2" /> EXPLAIN
                </Button>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleRunQuery(false)}
                  disabled={queryLoading}
                >
                  {queryLoading ? (
                    <RefreshCw className="w-4 h-4 mr-2 animate-spin" />
                  ) : (
                    <Play className="w-4 h-4 mr-2" />
                  )}{" "}
                  RUN
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <textarea
                className="w-full h-24 bg-background border border-border rounded-xl p-4 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-primary/50 text-foreground resize-y"
                placeholder={
                  schema?.tables?.length > 0
                    ? `SELECT * FROM ${schema.tables[0].name} LIMIT 10;`
                    : "Enter read-only SQL query..."
                }
                value={querySql}
                onChange={(e) => setQuerySql(e.target.value)}
              />

              {queryError && (
                <div className="mt-4 p-4 bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-xl text-sm font-mono whitespace-pre-wrap flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 shrink-0" />
                  <div>{queryError}</div>
                </div>
              )}

              {queryResults && !queryError && (
                <div className="mt-4 space-y-2">
                  <div className="flex items-center justify-between mb-2">
                    <Badge variant="info">
                      {isExplainMode ? "EXPLAIN PLAN" : `${queryResults.length} rows returned`}
                    </Badge>
                  </div>
                  <DynamicTable data={queryResults} />
                </div>
              )}
            </CardContent>
          </Card>
        </>
      )}
    </div>
  );
}

export function DatabasePage() {
  return (
    <ReactFlowProvider>
      <DatabaseContent />
    </ReactFlowProvider>
  );
}

export default DatabasePage;

