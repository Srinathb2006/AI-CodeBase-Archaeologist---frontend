import { useState, useEffect, useMemo } from "react";
import { useSearchParams, Link } from "react-router-dom";
import Prism from "prismjs";
import "prismjs/themes/prism-tomorrow.css";
import "prismjs/components/prism-clike";
import "prismjs/components/prism-markup";
import "prismjs/components/prism-markup-templating";
import "prismjs/components/prism-javascript";
import "prismjs/components/prism-jsx";
import "prismjs/components/prism-typescript";
import "prismjs/components/prism-tsx";
import "prismjs/components/prism-java";
import "prismjs/components/prism-python";
import "prismjs/components/prism-php";
import "prismjs/components/prism-groovy";
import "prismjs/components/prism-css";
import "prismjs/components/prism-json";
import "prismjs/components/prism-yaml";
import "prismjs/components/prism-markdown";
import "prismjs/components/prism-sql";
import "prismjs/components/prism-bash";
import "prismjs/components/prism-properties";
import "prismjs/components/prism-docker";
import "prismjs/components/prism-ignore";
import "prismjs/components/prism-c";
import "prismjs/components/prism-cpp";
import "prismjs/components/prism-csharp";
import "prismjs/components/prism-go";
import "prismjs/components/prism-rust";
import "prismjs/components/prism-ruby";
import "prismjs/components/prism-kotlin";
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
import { getRepositories, getRepository, getRepositoryFileContent, updateRepository } from "../services/storageService";
import { buildHierarchicalTree } from "../services/repoAnalyzer";
import { explainFile } from "../services/geminiService";

const extensionToLanguage = {
  bash: "Shell Script",
  sh: "Shell Script",
  zsh: "Shell Script",
  js: "JavaScript",
  jsx: "JavaScript (React)",
  ts: "TypeScript",
  tsx: "TypeScript (React)",
  py: "Python",
  go: "Go",
  rs: "Rust",
  java: "Java",
  kt: "Kotlin",
  kts: "Kotlin",
  cpp: "C++",
  cc: "C++",
  cxx: "C++",
  hpp: "C++",
  h: "C/C++ Header",
  c: "C",
  cs: "C#",
  rb: "Ruby",
  php: "PHP",
  html: "HTML",
  htm: "HTML",
  css: "CSS",
  scss: "SCSS",
  sass: "Sass",
  less: "Less",
  json: "JSON",
  md: "Markdown",
  mdx: "Markdown",
  yml: "YAML",
  yaml: "YAML",
  prisma: "Prisma Schema",
  xml: "XML",
  properties: "Properties",
  ini: "Properties",
  env: "Environment",
  conf: "Configuration",
  sql: "SQL",
  txt: "Text",
  gitignore: "Git Ignore",
  gradle: "Gradle",
  groovy: "Groovy",
  dockerfile: "Dockerfile",
};

const filenameToLanguage = {
  ".env": "Environment",
  ".gitignore": "Git Ignore",
  dockerfile: "Dockerfile",
  license: "Text",
  readme: "Markdown",
  makefile: "Makefile",
  "pom.xml": "Maven POM",
  "package.json": "JSON",
};

const prismLanguageByExtension = {
  bash: "bash",
  sh: "bash",
  zsh: "bash",
  c: "c",
  cpp: "cpp",
  cc: "cpp",
  cxx: "cpp",
  cs: "csharp",
  css: "css",
  scss: "css",
  sass: "css",
  less: "css",
  dockerfile: "docker",
  gitignore: "ignore",
  go: "go",
  gradle: "groovy",
  groovy: "groovy",
  h: "clike",
  hpp: "cpp",
  htm: "markup",
  html: "markup",
  java: "java",
  js: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  jsx: "jsx",
  kt: "kotlin",
  kts: "kotlin",
  md: "markdown",
  mdx: "markdown",
  php: "php",
  properties: "properties",
  ini: "properties",
  env: "properties",
  conf: "properties",
  py: "python",
  rb: "ruby",
  rs: "rust",
  sql: "sql",
  svg: "markup",
  ts: "typescript",
  tsx: "tsx",
  txt: "text",
  xml: "markup",
  yaml: "yaml",
  yml: "yaml",
};

const prismLanguageByFilename = {
  ".env": "properties",
  ".gitignore": "ignore",
  dockerfile: "docker",
  license: "text",
  makefile: "bash",
  readme: "markdown",
  "pom.xml": "markup",
  "package.json": "json",
};

function getFileExtension(filePath = "") {
  if (!filePath || typeof filePath !== "string") return "";
  const filename = filePath.split("/").pop() || "";
  const dotIndex = filename.lastIndexOf(".");
  if (dotIndex <= 0 || dotIndex === filename.length - 1) return "";
  return filename.slice(dotIndex + 1).toLowerCase();
}

function getFileBaseName(filePath = "") {
  if (!filePath || typeof filePath !== "string") return "";
  const filename = filePath.split("/").pop() || "";
  return filename.toLowerCase();
}

function getPrismLanguage(filePath = "") {
  if (!filePath || typeof filePath !== "string") return "text";
  const filename = getFileBaseName(filePath);
  const extension = getFileExtension(filePath);

  return prismLanguageByFilename[filename] || prismLanguageByExtension[extension] || "text";
}

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
  const [treeLoading, setTreeLoading] = useState(false);
  const [treeError, setTreeError] = useState("");

  const [selectedFile, setSelectedFile] = useState(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [fileContent, setFileContent] = useState(null);
  const [contentLoading, setContentLoading] = useState(false);
  const [contentError, setContentError] = useState("");
  const [contentErrorTitle, setContentErrorTitle] = useState("Could not load file");

  const [explanation, setExplanation] = useState(null);
  const [explainLoading, setExplainLoading] = useState(false);
  const [explanationsCache, setExplanationsCache] = useState({});

  const repoIdParam = searchParams.get("repoId");

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
          const isSameRepo = selectedRepo?.id && String(selectedRepo.id) === String(activeRepo.id);
          if (!isSameRepo) {
            setSelectedRepo(activeRepo);
            setSelectedFile(null);
            setFileContent(null);
            setContentError("");
            setContentErrorTitle("Could not load file");
            setExplanation(null);
          }
          setTreeError("");
          if (!repoIdParam) {
            setSearchParams({ repoId: activeRepo.id });
          }
        } else {
          setSelectedRepo(null);
        }
      } catch (err) {
        console.error("Failed to load Code Explorer data:", err);
        setTreeError("Unable to load repositories from the backend.");
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [repoIdParam, selectedRepo?.id, setSearchParams]);

  // 2. Fetch complete repository detail from the backend whenever selection changes.
  useEffect(() => {
    if (!selectedRepo?.id) return;

    let cancelled = false;

    const loadRepositoryTree = async () => {
      setTreeLoading(true);
      setTreeError("");
      setSelectedFile(null);
      setFileContent(null);
      setContentError("");
      setContentErrorTitle("Could not load file");
      setExplanation(null);

      try {
        const detailedRepo = await getRepository(selectedRepo.id);
        if (cancelled) return;

        const files = detailedRepo.fileTree || [];
        const hasFiles = files.some((item) => item.type === "blob");

        setSelectedRepo(detailedRepo);
        if (!hasFiles) {
          setTreeError("The backend returned no files for this repository.");
        }
      } catch (err) {
        console.error("Failed to fetch repository file tree:", err);
        if (!cancelled) {
          setTreeError(err?.message || "Unable to fetch the repository file tree from the backend.");
        }
      } finally {
        if (!cancelled) setTreeLoading(false);
      }
    };

    loadRepositoryTree();
    return () => {
      cancelled = true;
    };
  }, [selectedRepo?.id]);

  // 3. Fetch or load selected file content
  useEffect(() => {
    if (!selectedFile || !selectedRepo) {
      setFileContent(null);
      setContentLoading(false);
      setContentError("");
      return;
    }

    let cancelled = false;

    const fetchContent = async () => {
      setContentLoading(true);
      setContentError("");
      setContentErrorTitle("Could not load file");
      setFileContent(null);
      setExplanation(null);

      const filePath = selectedFile.path;

      // Check cache first if content exists as a string
      if (
        selectedRepo.fileContents &&
        Object.prototype.hasOwnProperty.call(selectedRepo.fileContents, filePath) &&
        typeof selectedRepo.fileContents[filePath] === "string"
      ) {
        if (!cancelled) {
          setFileContent(selectedRepo.fileContents[filePath]);
          setContentLoading(false);
        }
        return;
      }

      try {
        const fileResponse = await getRepositoryFileContent(selectedRepo.id, filePath);
        if (cancelled) return;
        const content = typeof fileResponse?.content === "string" 
          ? fileResponse.content 
          : (typeof fileResponse?.sourceContent === "string" ? fileResponse.sourceContent : "");

        setSelectedRepo((current) => {
          if (!current || String(current.id) !== String(selectedRepo.id)) return current;
          return {
            ...current,
            fileContents: {
              ...(current.fileContents || {}),
              [filePath]: content,
            },
          };
        });
        setFileContent(content);
        setContentLoading(false);
        return;
      } catch (err) {
        if (cancelled) return;
        console.warn("Unable to load file content from backend:", err);
        if (selectedRepo.type !== "github") {
          const message = err?.message || "This file could not be loaded from the backend.";
          const unsupported = /binary|unsupported|utf-?8|too large/i.test(message);
          setContentErrorTitle(unsupported ? "Could not display file" : "Could not load file");
          setContentError(message);
          setContentLoading(false);
          return;
        }
      }

      // If missing and it is a GitHub repository, pull dynamically from GitHub
      if (selectedRepo.type === "github" && selectedRepo.owner && selectedRepo.name) {
        const branch = selectedRepo.defaultBranch || "main";
        const rawUrl = `https://raw.githubusercontent.com/${selectedRepo.owner}/${selectedRepo.name}/${branch}/${filePath}`;
        try {
          const res = await fetch(rawUrl);
          if (cancelled) return;
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
            setContentErrorTitle("Could not load file");
            setContentError(`Failed to fetch file from GitHub (${res.status}).`);
          }
        } catch (err) {
          if (cancelled) return;
          console.error(err);
          setContentErrorTitle("Could not load file");
          setContentError("Network error: Could not retrieve file from GitHub Raw CDN.");
        } finally {
          if (!cancelled) setContentLoading(false);
        }
      }
    };

    fetchContent();

    return () => {
      cancelled = true;
    };
  }, [selectedFile?.path, selectedRepo?.id]);

  // 4. Explain file content using AI or local parser
  useEffect(() => {
    if (typeof fileContent !== "string" || !selectedFile) return;

    let cancelled = false;

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
        if (cancelled) return;
        setExplanationsCache((prev) => ({ ...prev, [filePath]: aiExplanation }));
        setExplanation(aiExplanation);
      } catch (err) {
        if (cancelled) return;
        console.warn("AI explanation failed, falling back to local source parsing:", err);
        // Fallback rule-based parsing engine
        const fallback = generateLocalExplanation(selectedFile.name, fileContent, language);
        setExplanationsCache((prev) => ({ ...prev, [filePath]: fallback }));
        setExplanation(fallback);
      } finally {
        if (!cancelled) setExplainLoading(false);
      }
    };

    triggerExplanation();

    return () => {
      cancelled = true;
    };
  }, [fileContent, selectedFile]);

  const generateLocalExplanation = (filename, content, language) => {
    if (typeof content !== "string" || !content) {
      return {
        overview: `Source file ${filename || ""}`,
        dependencies: ["No external imports detected in the header."],
        functions: [{ name: "Global Scope", description: "Procedural block scope execution." }],
        usedBy: ["Parent modules inside the folder tree."]
      };
    }
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
    setFileContent(null);
    setContentError("");
    setContentErrorTitle("Could not load file");
    setExplanation(null);
    setSearchParams({ repoId: id });
  };

  // Convert flat file tree to hierarchical structure
  const hierarchicalTree = selectedRepo ? buildHierarchicalTree(selectedRepo.fileTree || []) : [];
  const repositoryHasFiles = (selectedRepo?.fileTree || []).some((item) => item.type === "blob");

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
    if (!filePath || typeof filePath !== "string") return "Text";
    const filename = getFileBaseName(filePath);
    const ext = getFileExtension(filePath);
    if (filename === "pom.xml") return "Maven POM";
    return filenameToLanguage[filename] || extensionToLanguage[ext] || "Text";
  };

  const highlightedLines = useMemo(() => {
    if (typeof fileContent !== "string") return [];

    const language = getPrismLanguage(selectedFile?.path);
    const grammar = language ? Prism.languages[language] : null;

    try {
      const highlighted = grammar
        ? Prism.highlight(fileContent, grammar, language)
        : Prism.util.encode(fileContent);

      return String(highlighted).split("\n");
    } catch (err) {
      console.warn("Prism syntax highlighting failed, fallback to plain text:", err);
      try {
        return Prism.util.encode(fileContent).split("\n");
      } catch {
        return fileContent.split("\n");
      }
    }
  }, [fileContent, selectedFile?.path]);

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
            {treeLoading ? (
              <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2 text-xs text-slate-300">
                <Loader2 className="w-4 h-4 text-primary animate-spin" />
                Fetching file tree...
              </div>
            ) : treeError ? (
              <div className="rounded-lg border border-red-500/20 bg-red-500/10 px-3 py-3 text-xs text-red-200 leading-relaxed">
                {treeError}
              </div>
            ) : filteredTree.length > 0 ? (
              filteredTree.map((item, index) => (
                <FileTreeItem
                  key={index}
                  item={item}
                  level={0}
                  selectedFile={selectedFile}
                  onSelect={setSelectedFile}
                />
              ))
            ) : repositoryHasFiles ? (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-slate-400 leading-relaxed">
                No files match the current filter.
              </div>
            ) : (
              <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-slate-400 leading-relaxed">
                Select a repository to load its file tree.
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
                <h4 className="text-sm font-semibold text-slate-300 mb-1">{contentErrorTitle}</h4>
                <p className="text-xs text-muted-foreground max-w-xs leading-relaxed">{contentError}</p>
              </div>
            ) : typeof fileContent === 'string' ? (
              <pre className="p-5 font-mono text-xs leading-relaxed overflow-x-auto text-slate-300 select-text">
                <code className={`language-${getPrismLanguage(selectedFile?.path)}`}>
                  {highlightedLines.map((line, index) => (
                    <div key={index} className="flex min-w-max">
                      <span className="text-slate-600 w-10 select-none text-right pr-4 font-mono">
                        {index + 1}
                      </span>
                      <span
                        className="whitespace-pre-wrap"
                        dangerouslySetInnerHTML={{ __html: line || " " }}
                      />
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
