import { useState, useEffect } from "react";
import { useSearchParams, Link } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import { Button } from "../components/Button";
import {
  Folder,
  FolderOpen,
  FileCode,
  Search,
  ChevronRight,
  ChevronDown,
  Sparkles,
  Loader2,
  HelpCircle,
  FolderOpen as FolderOpenIcon
} from "lucide-react";
import { getRepositories, updateRepository } from "../services/storageService";
import { buildHierarchicalTree } from "../services/repoAnalyzer";
import { explainFile } from "../services/geminiService";

const extensionToLanguage = {
  js: "JavaScript",
  jsx: "JavaScript (React)",
  ts: "TypeScript",
  tsx: "TypeScript (React)",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  cpp: "C++",
  h: "C++",
  c: "C",
  cs: "C#",
  rb: "Ruby",
  php: "PHP",
  sh: "Shell Script",
  html: "HTML",
  css: "CSS",
  json: "JSON",
  md: "Markdown",
  yml: "YAML",
  yaml: "YAML",
  prisma: "Prisma Schema",
  xml: "XML",
};

function FileTreeItem({ item, level, selectedFile, onSelect }) {
  const [isOpen, setIsOpen] = useState(level === 0);

  const isFolder = item.type === "folder";
  const isSelected = selectedFile?.path === item.path;

  return (
    <div>
      <button
        type="button"
        className={`w-full flex items-center gap-2 px-3 py-1.5 hover:bg-white/5 rounded-lg transition-all text-left cursor-pointer ${
          isSelected ? "bg-primary/10 text-white font-medium border-l-2 border-primary pl-2.5" : "text-slate-300"
        }`}
        style={{ paddingLeft: `${level * 12 + (isSelected ? 10 : 12)}px` }}
        onClick={() => {
          if (isFolder) {
            setIsOpen(!isOpen);
          } else {
            onSelect(item);
          }
        }}
      >
        {isFolder ? (
          <>
            {isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
            )}
            {isOpen ? (
              <FolderOpen className="w-4 h-4 text-primary shrink-0" />
            ) : (
              <Folder className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </>
        ) : (
          <>
            <div className="w-3.5" />
            <FileCode className={`w-4 h-4 shrink-0 ${isSelected ? "text-primary" : "text-slate-400"}`} />
          </>
        )}
        <span className="text-xs truncate">{item.name}</span>
      </button>
      {isFolder && isOpen && item.children && (
        <div className="space-y-0.5">
          {item.children.map((child, index) => (
            <FileTreeItem
              key={index}
              item={child}
              level={level + 1}
              selectedFile={selectedFile}
              onSelect={onSelect}
            />
          ))}
        </div>
      )}
    </div>
  );
}

export function CodeExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [loading, setLoading] = useState(true);

  const [selectedFile, setSelectedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileContent, setFileContent] = useState("");
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");

  const [explanation, setExplanation] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanationsCache, setExplanationsCache] = useState({});

  // 1. Load repositories list and auto-select repository
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
          setSelectedFile(null);
          setFileContent("");
          setExplanation(null);
          if (!repoIdParam) {
            setSearchParams({ repoId: activeRepo.id });
          }
        }
      } catch (err) {
        console.error("Failed to load Code Explorer data:", err);
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [searchParams, setSearchParams]);

  // 2. Fetch or load selected file content
  useEffect(() => {
    if (!selectedFile || !selectedRepo) return;

    const fetchContent = async () => {
      setContentLoading(true);
      setContentError("");
      setFileContent("");
      setExplanation(null);

      const filePath = selectedFile.path;

      // Check cache first
      if (selectedRepo.fileContents && selectedRepo.fileContents[filePath]) {
        setFileContent(selectedRepo.fileContents[filePath]);
        setContentLoading(false);
        return;
      }

      // If missing and it is a GitHub repository, pull dynamically from GitHub
      if (selectedRepo.type === "github" && selectedRepo.owner && selectedRepo.name) {
        const branch = selectedRepo.defaultBranch || "main";
        const rawUrl = `https://raw.githubusercontent.com/${selectedRepo.owner}/${selectedRepo.name}/${branch}/${filePath}`;
        try {
          const res = await fetch(rawUrl);
          if (res.ok) {
            const content = await res.text();
            
            // Cache locally in local storage & local state
            const updatedContents = {
              ...(selectedRepo.fileContents || {}),
              [filePath]: content,
            };
            const updatedRepo = {
              ...selectedRepo,
              fileContents: updatedContents,
            };

            setSelectedRepo(updatedRepo);
            await updateRepository(selectedRepo.id, updatedRepo);
            setFileContent(content);
          } else {
            setContentError(`Failed to fetch file from GitHub (${res.status}).`);
          }
        } catch (err) {
          console.error(err);
          setContentError("Network error: Could not retrieve file from GitHub Raw CDN.");
        } finally {
          setContentLoading(false);
        }
      } else {
        setContentError("File content not cached locally. It may have been skipped due to size during upload.");
        setContentLoading(false);
      }
    };

    fetchContent();
  }, [selectedFile, selectedRepo]);

  // 3. Explain file content using AI or local parser
  useEffect(() => {
    if (!fileContent || !selectedFile) return;

    const triggerExplanation = async () => {
      const filePath = selectedFile.path;
      const ext = filePath.split(".").pop().toLowerCase();
      const language = extensionToLanguage[ext] || "Code";

      // Check explanations cache
      if (explanationsCache[filePath]) {
        setExplanation(explanationsCache[filePath]);
        return;
      }

      setExplainLoading(true);
      setExplanation(null);

      try {
        const aiExplanation = await explainFile(selectedFile.name, fileContent, language);
        setExplanationsCache((prev) => ({ ...prev, [filePath]: aiExplanation }));
        setExplanation(aiExplanation);
      } catch (err) {
        console.warn("AI explanation failed, falling back to local source parsing:", err);
        // Fallback rule-based parsing engine
        const fallback = generateLocalExplanation(selectedFile.name, fileContent, language);
        setExplanationsCache((prev) => ({ ...prev, [filePath]: fallback }));
        setExplanation(fallback);
      } finally {
        setExplainLoading(false);
      }
    };

    triggerExplanation();
  }, [fileContent, selectedFile, explanationsCache]);

  const generateLocalExplanation = (filename, content, language) => {
    const lines = content.split("\n");
    const overview = `This is a ${language || "source"} file named ${filename} containing ${lines.length} lines of code. It contains codebase source logic.`;
    
    // Extract imports
    const dependencies = [];
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed.startsWith("import ") || trimmed.includes("require(")) {
        dependencies.push(trimmed.replace(/;$/, ""));
      } else if (trimmed.startsWith("from ") && trimmed.includes("import ")) {
        dependencies.push(trimmed);
      }
    });

    // Extract function signatures
    const functions = [];
    const classRegex = /class\s+(\w+)/g;
    const funcRegex = /function\s+(\w+)/g;
    const arrowFuncRegex = /(?:const|let|var)\s+(\w+)\s*=\s*(?:\([^)]*\)|[^=])\s*=>/g;
    const pythonFuncRegex = /def\s+(\w+)/g;
    const goFuncRegex = /func\s+(\w+)/g;

    lines.forEach((line) => {
      let match;
      if ((match = classRegex.exec(line)) !== null) {
        functions.push({ name: `class ${match[1]}`, description: "Class definition in source code." });
      }
      if ((match = funcRegex.exec(line)) !== null) {
        functions.push({ name: `${match[1]}()`, description: "Standard function declaration." });
      }
      if ((match = arrowFuncRegex.exec(line)) !== null) {
        functions.push({ name: `${match[1]}()`, description: "ES6 Arrow function variable." });
      }
      if ((match = pythonFuncRegex.exec(line)) !== null) {
        functions.push({ name: `def ${match[1]}()`, description: "Python function declaration." });
      }
      if ((match = goFuncRegex.exec(line)) !== null) {
        functions.push({ name: `func ${match[1]}()`, description: "Go function declaration." });
      }
    });

    return {
      overview,
      dependencies: dependencies.length > 0 ? dependencies.slice(0, 6) : ["No external imports detected in the header."],
      functions: functions.length > 0 ? functions.slice(0, 8) : [{ name: "Global Scope", description: "Procedural block scope execution." }],
      usedBy: ["Parent modules inside the folder tree."]
    };
  };

  const handleSelectRepository = (id) => {
    const found = repositories.find((r) => String(r.id) === String(id));
    if (!found) return;
    setSelectedRepo(found);
    setSelectedFile(null);
    setFileContent("");
    setExplanation(null);
    setSearchParams({ repoId: id });
  };

  // Convert flat file tree to hierarchical structure
  const hierarchicalTree = selectedRepo ? buildHierarchicalTree(selectedRepo.fileTree || []) : [];

  const filterTree = (nodes, query) => {
    if (!query) return nodes;
    return nodes
      .map((node) => {
        if (node.type === "file") {
          return node.name.toLowerCase().includes(query.toLowerCase()) ? node : null;
        }
        if (node.type === "folder" && node.children) {
          const filteredChildren = filterTree(node.children, query);
          if (filteredChildren.length > 0) {
            return { ...node, children: filteredChildren };
          }
        }
        return null;
      })
      .filter(Boolean);
  };

  const filteredTree = filterTree(hierarchicalTree, searchQuery);

  const getLanguage = (filePath) => {
    if (!filePath) return "Text";
    const ext = filePath.split(".").pop().toLowerCase();
    return extensionToLanguage[ext] || "Code";
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] space-y-4">
        <div className="w-10 h-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
        <p className="text-muted-foreground text-sm">Loading Code Explorer modules...</p>
      </div>
    );
  }

  if (repositories.length === 0) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Card className="max-w-md w-full text-center">
          <CardContent className="pt-8 pb-8">
            <div className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6">
              <FolderOpenIcon className="w-10 h-10 text-primary" />
            </div>
            <h2 className="text-2xl font-bold mb-2">No Repositories Analyzed</h2>
            <p className="text-muted-foreground mb-6 text-sm">
              Please upload a codebase or connect to GitHub to view the interactive Code Explorer.
            </p>
            <Link to="/upload">
              <Button className="cursor-pointer">
                Upload Repository
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

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

      {/* File Tree Panel */}
      <div className="w-72 shrink-0 h-full flex flex-col">
        <Card className="h-full flex flex-col overflow-hidden">
          <CardHeader className="pb-3">
            <CardTitle>File Tree</CardTitle>
            <div className="relative mt-2">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="code-explorer-filter"
                  name="searchQuery"
                  placeholder="Filter files..."
                  className="pl-9 text-xs"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                />
              </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto pr-2">
            {filteredTree.map((item, index) => (
              <FileTreeItem
                key={index}
                item={item}
                level={0}
                selectedFile={selectedFile}
                onSelect={setSelectedFile}
              />
            ))}
            {filteredTree.length === 0 && (
              <div className="text-center text-xs text-muted-foreground py-12">
                No matching files found.
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Code Viewer */}
      <div className="flex-1 flex flex-col h-full overflow-hidden">
        <Card className="flex-1 flex flex-col overflow-hidden">
          <CardHeader className="border-b border-white/5 pb-4 shrink-0">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <FileCode className="w-5 h-5 text-primary" />
                <CardTitle className="text-sm font-bold truncate max-w-[200px]">
                  {selectedFile ? selectedFile.name : "Code Editor"}
                </CardTitle>
                {selectedFile && <Badge>{getLanguage(selectedFile.path)}</Badge>}
              </div>
              {selectedFile && (
                <div className="flex gap-2">
                  {selectedFile.size !== undefined && (
                    <Badge variant="default" className="text-[10px]">
                      {(selectedFile.size / 1024).toFixed(1)} KB
                    </Badge>
                  )}
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto bg-[#03030b] p-0 relative">
            {contentLoading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-3 bg-[#03030b]/80">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground">Loading file source code...</span>
              </div>
            ) : contentError ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center p-6 text-center">
                <HelpCircle className="w-12 h-12 text-slate-500 mb-3" />
                <h4 className="text-sm font-semibold text-slate-300 mb-1">Could not display file</h4>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{contentError}</p>
              </div>
            ) : fileContent ? (
              <pre className="p-5 font-mono text-xs leading-relaxed overflow-x-auto text-slate-300 select-text">
                <code>
                  {fileContent.split("\n").map((line, index) => (
                    <div key={index} className="flex">
                      <span className="text-slate-600 w-10 select-none text-right pr-4 font-mono">
                        {index + 1}
                      </span>
                      <span className="text-slate-300 break-all whitespace-pre-wrap">{line || " "}</span>
                    </div>
                  ))}
                </code>
              </pre>
            ) : (
              <div className="absolute inset-0 flex flex-col items-center justify-center text-center p-6">
                <FileCode className="w-16 h-16 text-slate-700 mb-4 animate-pulse" />
                <h4 className="text-sm font-semibold text-slate-300 mb-1">No File Open</h4>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">
                  Select a source code file from the directory tree on the left to inspect its contents.
                </p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* AI Explanation Sidebar */}
      <div className="w-80 shrink-0 h-full">
        <Card className="h-full flex flex-col overflow-hidden">
          <CardHeader className="border-b border-white/5 pb-4">
            <CardTitle className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-primary animate-pulse" />
              AI Code Insights
            </CardTitle>
          </CardHeader>
          <CardContent className="flex-1 overflow-y-auto">
            {explainLoading ? (
              <div className="flex flex-col items-center justify-center py-20 space-y-3">
                <Loader2 className="w-6 h-6 text-primary animate-spin" />
                <span className="text-xs text-muted-foreground">Analyzing structure...</span>
              </div>
            ) : explanation ? (
              <div className="space-y-5">
                <div>
                  <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                    Overview
                  </h4>
                  <p className="text-xs text-slate-300 leading-relaxed bg-white/[0.01] p-3 rounded-lg border border-white/5">
                    {explanation.overview}
                  </p>
                </div>

                {explanation.dependencies && explanation.dependencies.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                      Dependencies & Imports
                    </h4>
                    <div className="space-y-1.5">
                      {explanation.dependencies.map((dep, idx) => (
                        <div
                          key={idx}
                          className="text-xs p-2 rounded-lg bg-white/[0.01] border border-white/5 font-mono text-slate-300 truncate"
                          title={dep}
                        >
                          <span className="text-accent pr-1.5">⚡</span>
                          {dep}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {explanation.functions && explanation.functions.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                      Declarations & Methods
                    </h4>
                    <div className="space-y-2">
                      {explanation.functions.map((func, idx) => (
                        <div
                          key={idx}
                          className="p-2.5 rounded-lg bg-white/[0.01] border border-white/5 text-xs"
                        >
                          <div className="font-mono text-xs text-purple-300 mb-0.5 truncate" title={func.name}>
                            {func.name}
                          </div>
                          <p className="text-[10px] text-slate-400 leading-relaxed">
                            {func.description}
                          </p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {explanation.usedBy && explanation.usedBy.length > 0 && (
                  <div>
                    <h4 className="font-semibold text-xs text-slate-400 uppercase tracking-wider mb-2">
                      Caller References
                    </h4>
                    <div className="flex flex-wrap gap-1.5">
                      {explanation.usedBy.map((caller, idx) => (
                        <Badge key={idx} variant="default" className="text-[10px] font-mono">
                          {caller}
                        </Badge>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center text-muted-foreground py-20 text-xs leading-relaxed">
                Choose a file from the explorer tree to generate deep structural insights, imported modules, and method scopes.
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
