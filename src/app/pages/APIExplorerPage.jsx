import { useState, useEffect } from "react";
import { useSearchParams } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import { getRepositories, getRepository } from "../services/storageService";
import {
  Search,
  Filter,
  Lock,
  Unlock,
  Copy,
  Play,
  ChevronDown,
  ChevronRight,
  RefreshCw,
} from "lucide-react";

const defaultApiEndpoints = [
  {
    id: 1,
    method: "GET",
    endpoint: "/api/users",
    description: "Get all users with pagination",
    auth: true,
    category: "Users",
    parameters: [
      {
        name: "page",
        type: "number",
        required: false,
        description: "Page number",
      },
      {
        name: "limit",
        type: "number",
        required: false,
        description: "Items per page",
      },
    ],
    response: {
      type: "User[]",
      example: [{ id: 1, name: "John Doe", email: "john@example.com" }],
    },
  },
  {
    id: 2,
    method: "POST",
    endpoint: "/api/users",
    description: "Create a new user",
    auth: false,
    category: "Users",
    parameters: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "User full name",
      },
      {
        name: "email",
        type: "string",
        required: true,
        description: "User email address",
      },
      {
        name: "password",
        type: "string",
        required: true,
        description: "User password",
      },
    ],
    response: {
      type: "User",
      example: { id: 1, name: "John Doe", email: "john@example.com" },
    },
  },
  {
    id: 3,
    method: "GET",
    endpoint: "/api/users/:id",
    description: "Get user by ID",
    auth: true,
    category: "Users",
    parameters: [
      { name: "id", type: "number", required: true, description: "User ID" },
    ],
    response: {
      type: "User",
      example: { id: 1, name: "John Doe", email: "john@example.com" },
    },
  },
  {
    id: 4,
    method: "PUT",
    endpoint: "/api/users/:id",
    description: "Update user information",
    auth: true,
    category: "Users",
    parameters: [
      { name: "id", type: "number", required: true, description: "User ID" },
      {
        name: "name",
        type: "string",
        required: false,
        description: "User full name",
      },
      {
        name: "email",
        type: "string",
        required: false,
        description: "User email address",
      },
    ],
    response: {
      type: "User",
      example: { id: 1, name: "John Doe", email: "john@example.com" },
    },
  },
  {
    id: 5,
    method: "DELETE",
    endpoint: "/api/users/:id",
    description: "Delete a user",
    auth: true,
    category: "Users",
    parameters: [
      { name: "id", type: "number", required: true, description: "User ID" },
    ],
    response: {
      type: "Success",
      example: { message: "User deleted successfully" },
    },
  },
  {
    id: 6,
    method: "GET",
    endpoint: "/api/products",
    description: "Get all products",
    auth: false,
    category: "Products",
    parameters: [
      {
        name: "category",
        type: "string",
        required: false,
        description: "Filter by category",
      },
      {
        name: "search",
        type: "string",
        required: false,
        description: "Search query",
      },
    ],
    response: {
      type: "Product[]",
      example: [{ id: 1, name: "Product 1", price: 29.99 }],
    },
  },
  {
    id: 7,
    method: "POST",
    endpoint: "/api/products",
    description: "Create a new product",
    auth: true,
    category: "Products",
    parameters: [
      {
        name: "name",
        type: "string",
        required: true,
        description: "Product name",
      },
      {
        name: "price",
        type: "number",
        required: true,
        description: "Product price",
      },
      {
        name: "description",
        type: "string",
        required: false,
        description: "Product description",
      },
    ],
    response: {
      type: "Product",
      example: { id: 1, name: "Product 1", price: 29.99 },
    },
  },
  {
    id: 8,
    method: "GET",
    endpoint: "/api/orders",
    description: "Get all orders for current user",
    auth: true,
    category: "Orders",
    parameters: [
      {
        name: "status",
        type: "string",
        required: false,
        description: "Filter by status",
      },
    ],
    response: {
      type: "Order[]",
      example: [{ id: 1, total: 99.99, status: "completed" }],
    },
  },
  {
    id: 9,
    method: "POST",
    endpoint: "/api/orders",
    description: "Create a new order",
    auth: true,
    category: "Orders",
    parameters: [
      {
        name: "items",
        type: "array",
        required: true,
        description: "Array of order items",
      },
      {
        name: "shipping_address",
        type: "string",
        required: true,
        description: "Shipping address",
      },
    ],
    response: {
      type: "Order",
      example: { id: 1, total: 99.99, status: "pending" },
    },
  },
  {
    id: 10,
    method: "POST",
    endpoint: "/api/auth/login",
    description: "Authenticate user and get JWT token",
    auth: false,
    category: "Authentication",
    parameters: [
      {
        name: "email",
        type: "string",
        required: true,
        description: "User email",
      },
      {
        name: "password",
        type: "string",
        required: true,
        description: "User password",
      },
    ],
    response: {
      type: "AuthResponse",
      example: { token: "jwt_token_here", user: { id: 1, name: "John Doe", email: "john@example.com" } },
    },
  },
];

const HTTP_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"];

function normalizePath(path) {
  if (!path) return "/";
  return path
    .trim()
    .replace(/\\/g, "/")
    .replace(/\/+/g, "/")
    .replace(/^(?!\/)/, "/");
}

function joinPaths(...paths) {
  const joined = paths
    .filter((part) => part !== undefined && part !== null && String(part).trim() !== "")
    .map((part) => String(part).trim().replace(/^\/+|\/+$/g, ""))
    .filter(Boolean)
    .join("/");
  return normalizePath(joined || "/");
}

function inferCategoryFromPath(endpoint) {
  const cleaned = normalizePath(endpoint).replace(/^\/+/, "").replace(/\/+$/, "");
  const parts = cleaned.split("/").filter(Boolean);
  if (parts[0] === "api") {
    parts.shift();
  }
  const category = parts[0] || "General";
  return category
    .split(/[-_]/)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function parseMethodsFromString(text) {
  if (!text) return [];
  return [...new Set(
    text
      .replace(/RequestMethod\./gi, "")
      .replace(/['"\[\]]/g, "")
      .split(/[,|\s]+/)
      .map((token) => token.trim().toUpperCase())
      .filter((token) => HTTP_METHODS.includes(token))
  )];
}

function stripComments(content) {
  return content
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

function splitTopLevelArgs(args = "") {
  const parts = [];
  let current = "";
  let quote = null;
  let braceDepth = 0;

  for (let index = 0; index < args.length; index += 1) {
    const char = args[index];
    const previous = args[index - 1];

    if ((char === "\"" || char === "'") && previous !== "\\") {
      quote = quote === char ? null : quote || char;
    }

    if (!quote) {
      if (char === "{") braceDepth += 1;
      if (char === "}") braceDepth = Math.max(0, braceDepth - 1);
      if (char === "," && braceDepth === 0) {
        parts.push(current.trim());
        current = "";
        continue;
      }
    }

    current += char;
  }

  if (current.trim()) parts.push(current.trim());
  return parts;
}

function extractMappingPaths(args = "") {
  const paths = [];
  const quotedPath = /(?:^|[,{\s])(?:value|path)\s*=\s*(?:\{([^}]+)\}|["']([^"']*)["'])/gi;
  let match;

  while ((match = quotedPath.exec(args))) {
    const value = match[1] || match[2] || "";
    const stringMatches = [...value.matchAll(/["']([^"']*)["']/g)].map((item) => item[1]);
    if (stringMatches.length > 0) {
      paths.push(...stringMatches);
    } else if (value.trim()) {
      paths.push(value.trim());
    }
  }

  if (paths.length === 0) {
    const positional = splitTopLevelArgs(args)[0] || "";
    const stringMatches = [...positional.matchAll(/["']([^"']*)["']/g)].map((item) => item[1]);
    paths.push(...stringMatches);
  }

  return paths.length > 0 ? paths : [""];
}

function extractRequestMappingMethods(args = "") {
  const methodMatch = /method\s*=\s*(?:\{([^}]+)\}|([^,\s)]+))/i.exec(args);
  return methodMatch ? parseMethodsFromString(methodMatch[1] || methodMatch[2]) : [];
}

function parseSpringMappingAnnotation(annotationName, args = "") {
  if (annotationName === "RequestMapping") {
    const methods = extractRequestMappingMethods(args);
    return {
      methods: methods.length > 0 ? methods : ["GET"],
      paths: extractMappingPaths(args),
    };
  }

  return {
    methods: [annotationName.replace("Mapping", "").toUpperCase()],
    paths: extractMappingPaths(args),
  };
}

function findSpringAnnotations(annotationBlock = "") {
  const annotations = [];
  const mappingAnnotation = /@(GetMapping|PostMapping|PutMapping|DeleteMapping|PatchMapping|RequestMapping)\b\s*(?:\(([\s\S]*?)\))?/gi;
  let match;

  while ((match = mappingAnnotation.exec(annotationBlock))) {
    annotations.push(parseSpringMappingAnnotation(match[1], match[2] || ""));
  }

  return annotations;
}

function discoverSpringEndpoints(content, filePath, addEndpoint) {
  const cleanContent = stripComments(content);
  if (!/@(?:RestController|Controller)\b/.test(cleanContent)) {
    return;
  }

  const classMatch = /((?:\s*@[A-Za-z][\w.]*\s*(?:\([\s\S]*?\))?\s*)*)\b(?:public\s+|abstract\s+|final\s+)*class\s+([A-Za-z_][\w]*)\b/.exec(cleanContent);
  if (!classMatch || !/@(?:RestController|Controller)\b/.test(classMatch[1])) {
    return;
  }

  const className = classMatch[2];
  const classMappings = findSpringAnnotations(classMatch[1]).filter((mapping) => mapping.paths.length > 0);
  const basePaths = classMappings.length > 0
    ? classMappings.flatMap((mapping) => mapping.paths)
    : [""];
  const classBody = cleanContent.slice(classMatch.index + classMatch[0].length);
  const methodPattern = /((?:\s*@[A-Za-z][\w.]*\s*(?:\([\s\S]*?\))?\s*)+)\s*(?:public|protected|private)?\s*(?:static\s+)?(?:final\s+)?[\w<>\[\], ?]+\s+([A-Za-z_][\w]*)\s*\([^;{}]*\)\s*(?:throws\s+[^{]+)?\{/g;
  let methodMatch;

  while ((methodMatch = methodPattern.exec(classBody))) {
    const methodMappings = findSpringAnnotations(methodMatch[1]);
    if (methodMappings.length === 0) continue;

    methodMappings.forEach((mapping) => {
      mapping.methods.forEach((method) => {
        basePaths.forEach((basePath) => {
          mapping.paths.forEach((routePath) => {
            const endpoint = joinPaths(basePath, routePath);
            const description = `${className}.${methodMatch[2]} in ${filePath}`;
            addEndpoint(method, endpoint, description, filePath);
          });
        });
      });
    });
  }
}

function discoverApiEndpoints(fileContents) {
  const endpointMap = new Map();

  const addEndpoint = (method, endpoint, description, filePath) => {
    if (!endpoint) return;
    const normalizedEndpoint = normalizePath(endpoint);
    const normalizedMethod = (method || "GET").toUpperCase();
    const key = `${normalizedMethod}:${normalizedEndpoint}`;

    if (endpointMap.has(key)) {
      return;
    }

    endpointMap.set(key, {
      id: `${filePath}:${normalizedMethod}:${normalizedEndpoint}`
        .replace(/[^a-zA-Z0-9-_]/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-|-$/g, ""),
      method: normalizedMethod,
      endpoint: normalizedEndpoint,
      description: description || `Discovered in ${filePath}`,
      auth: normalizedEndpoint.toLowerCase().includes("/auth") || filePath.toLowerCase().includes("auth"),
      category: inferCategoryFromPath(normalizedEndpoint),
      parameters: [],
      response: {
        type: "Unknown",
        example: { message: "Example response not available." },
      },
    });
  };

  Object.entries(fileContents).forEach(([filePath, content]) => {
    if (!content || typeof content !== "string") return;
    const normalizedFilePath = filePath.replace(/\\/g, "/");
    const lowerPath = normalizedFilePath.toLowerCase();

    if (!/\.(js|jsx|ts|tsx|py|java|json|ya?ml)$/.test(lowerPath)) {
      return;
    }

    let match;

    const expressRoute = /(?:app|router)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    while ((match = expressRoute.exec(content))) {
      addEndpoint(match[1], match[2], `Discovered in ${normalizedFilePath}`, normalizedFilePath);
    }

    const expressRouteGroup = /(?:app|router)\.route\(\s*['"`]([^'"`]+)['"`]\s*\)([\s\S]*?)(?:;|$)/gi;
    while ((match = expressRouteGroup.exec(content))) {
      const routePath = match[1];
      const routeBody = match[2];
      const routeMethods = [...routeBody.matchAll(/\.(get|post|put|delete|patch|options|head)\s*\(/gi)];
      routeMethods.forEach((methodMatch) => {
        addEndpoint(methodMatch[1], routePath, `Discovered in ${normalizedFilePath}`, normalizedFilePath);
      });
    }

    const flaskRoute = /@(app|bp|router)\.route\(\s*['"`]([^'"`]+)['"`]\s*(?:,\s*methods\s*=\s*\[([^\]]+)\])?/gi;
    while ((match = flaskRoute.exec(content))) {
      const routePath = match[2];
      const methods = match[3] ? parseMethodsFromString(match[3]) : ["GET"];
      methods.forEach((method) => addEndpoint(method, routePath, `Discovered in ${normalizedFilePath}`, normalizedFilePath));
    }

    const fastApiRoute = /@(app|router|bp)\.(get|post|put|delete|patch|options|head)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    while ((match = fastApiRoute.exec(content))) {
      addEndpoint(match[2], match[3], `Discovered in ${normalizedFilePath}`, normalizedFilePath);
    }

    if (lowerPath.endsWith(".java")) {
      discoverSpringEndpoints(content, normalizedFilePath, addEndpoint);
    }

    if (/\.(ya?ml)$/.test(lowerPath) && content.includes("paths:")) {
      const lines = content.split("\n");
      let inPaths = false;
      for (const line of lines) {
        if (/^\s*paths\s*:\s*$/.test(line)) {
          inPaths = true;
          continue;
        }
        if (!inPaths) continue;
        const yamlPath = /^\s*(\/[^:\s]+)\s*:\s*$/.exec(line);
        if (yamlPath) {
          addEndpoint("GET", yamlPath[1], `OpenAPI path in ${normalizedFilePath}`, normalizedFilePath);
          continue;
        }
        if (/^\S/.test(line)) {
          break;
        }
      }
    }

    if (lowerPath.endsWith(".json")) {
      try {
        const json = JSON.parse(content);
        if (json && typeof json === "object" && json.paths && typeof json.paths === "object") {
          Object.entries(json.paths).forEach(([route, operations]) => {
            if (!route || typeof operations !== "object") return;
            Object.keys(operations).forEach((method) => {
              const methodName = method.toUpperCase();
              if (["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"].includes(methodName)) {
                addEndpoint(methodName, route, `OpenAPI path in ${normalizedFilePath}`, normalizedFilePath);
              }
            });
          });
        }
      } catch {
        // ignore invalid JSON
      }
    }
  });

  return Array.from(endpointMap.values()).sort((a, b) => a.endpoint.localeCompare(b.endpoint));
}

const methodColors = {
  GET: {
    bg: "bg-blue-500/10",
    text: "text-blue-500",
    border: "border-blue-500",
  },
  POST: {
    bg: "bg-green-500/10",
    text: "text-green-500",
    border: "border-green-500",
  },
  PUT: {
    bg: "bg-yellow-500/10",
    text: "text-yellow-500",
    border: "border-yellow-500",
  },
  DELETE: {
    bg: "bg-red-500/10",
    text: "text-red-500",
    border: "border-red-500",
  },
  PATCH: {
    bg: "bg-purple-500/10",
    text: "text-purple-500",
    border: "border-purple-500",
  },
};

export function APIExplorerPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [repositories, setRepositories] = useState([]);
  const [selectedRepo, setSelectedRepo] = useState(null);
  const [apiEndpoints, setApiEndpoints] = useState([]);
  const [loadingRepos, setLoadingRepos] = useState(true);
  const [scanningApis, setScanningApis] = useState(false);

  const [searchQuery, setSearchQuery] = useState("");
  const [filterMethod, setFilterMethod] = useState(null);
  const [filterAuth, setFilterAuth] = useState(null);
  const [expandedEndpoint, setExpandedEndpoint] = useState(null);
  const [copiedId, setCopiedId] = useState(null);
  const [triedId, setTriedId] = useState(null);

  useEffect(() => {
    const loadRepositories = async () => {
      setLoadingRepos(true);
      const repos = await getRepositories();
      setRepositories(repos || []);

      const repoId = searchParams.get("repoId");
      let activeRepo = null;

      if (repoId) {
        activeRepo = repos.find((repo) => String(repo.id) === String(repoId));
      }

      if (!activeRepo && repos.length > 0) {
        activeRepo = repos[0];
      }

      if (activeRepo) {
        setSelectedRepo(activeRepo);
        if (!repoId) {
          setSearchParams({ repoId: activeRepo.id });
        }
      } else {
        setSelectedRepo(null);
      }

      setLoadingRepos(false);
    };

    loadRepositories();
  }, [searchParams, setSearchParams]);

  useEffect(() => {
    let cancelled = false;

    const scanSelectedRepository = async () => {
      if (!selectedRepo) {
        setApiEndpoints([]);
        return;
      }

      setScanningApis(true);
      try {
        const repoForScan = Object.keys(selectedRepo.fileContents || {}).length > 0
          ? selectedRepo
          : await getRepository(selectedRepo.id);

        if (cancelled) return;

        if (repoForScan && repoForScan !== selectedRepo) {
          setSelectedRepo((current) => (
            current && String(current.id) === String(repoForScan.id) ? repoForScan : current
          ));
        }

        const discovered = discoverApiEndpoints(repoForScan.fileContents || {});
        setApiEndpoints(discovered);
      } catch (error) {
        console.error("Unable to scan repository APIs:", error);
        if (!cancelled) setApiEndpoints([]);
      } finally {
        if (!cancelled) setScanningApis(false);
      }
    };

    scanSelectedRepository();
    return () => {
      cancelled = true;
    };
  }, [selectedRepo?.id]);

  useEffect(() => {
    if (!selectedRepo) {
      return;
    }
    setSearchQuery("");
    setFilterMethod(null);
    setFilterAuth(null);
    setExpandedEndpoint(null);
  }, [selectedRepo?.id]);

  const handleRefreshScan = async () => {
    if (!selectedRepo) return;
    setScanningApis(true);
    try {
      const refreshedRepo = await getRepository(selectedRepo.id);
      setSelectedRepo(refreshedRepo);
      setApiEndpoints(discoverApiEndpoints(refreshedRepo.fileContents || {}));
      setExpandedEndpoint(null);
    } catch (error) {
      console.error("Unable to refresh API scan:", error);
      setApiEndpoints([]);
    } finally {
      setScanningApis(false);
    }
  };

  const copyToClipboard = (text, id) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const handleTryIt = (endpoint) => {
    setTriedId(endpoint.id);
    setTimeout(() => setTriedId(null), 2000);
    // Open in browser – in real app would open a request panel
    const baseUrl = selectedRepo?.baseUrl || "https://api.example.com";
    window.open(`${baseUrl}${endpoint.endpoint.replace(":id", "1")}`, "_blank");
  };

  const buildCurl = (endpoint) => {
    const baseUrl = selectedRepo?.baseUrl || "https://api.example.com";
    const url = `${baseUrl}${endpoint.endpoint.replace(":id", "1")}`;
    const authHeader = endpoint.auth ? ` -H "Authorization: Bearer YOUR_TOKEN"` : "";
    return `curl -X ${endpoint.method} "${url}"${authHeader} -H "Content-Type: application/json"`;
  };

  const filteredEndpoints = apiEndpoints.filter((endpoint) => {
    const matchesSearch =
      endpoint.endpoint.toLowerCase().includes(searchQuery.toLowerCase()) ||
      endpoint.description.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesMethod = !filterMethod || endpoint.method === filterMethod;
    const matchesAuth = filterAuth === null || endpoint.auth === filterAuth;
    return matchesSearch && matchesMethod && matchesAuth;
  });

  const categories = Array.from(new Set(apiEndpoints.map((e) => e.category)));
  const hasApiEndpoints = apiEndpoints.length > 0;
  const headerSubtitle = selectedRepo
    ? scanningApis
      ? "Scanning Spring Boot controllers and REST mappings..."
      : `Discovered ${apiEndpoints.length} endpoint${apiEndpoints.length === 1 ? "" : "s"} for the selected repository.`
    : "Select a repository to discover API endpoints from your codebase.";

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-bold mb-2">API Explorer</h1>
            <p className="text-muted-foreground">{headerSubtitle}</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <Badge variant="info">{scanningApis ? "Scanning" : `${apiEndpoints.length} Endpoints`}</Badge>
            {loadingRepos && (
              <span className="text-sm text-muted-foreground">Loading repositories...</span>
            )}
            {!loadingRepos && !selectedRepo && (
              <span className="text-sm text-muted-foreground">
                No repository selected. Go to Repositories and upload a repo.
              </span>
            )}
          </div>
        </div>

      </div>
      {hasApiEndpoints && (
        <Card>
          <CardContent className="pt-6">
            <div className="space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                <Input
                  id="api-explorer-search"
                  name="searchQuery"
                  placeholder="Search endpoints"
                  onChange={(e) => setSearchQuery(e.target.value)}
                  value={searchQuery}
                />
              </div>

              <div className="flex items-center gap-4 flex-wrap">
                <div className="flex items-center gap-2">
                  <Filter className="w-4 h-4 text-muted-foreground" />
                  <span className="text-sm text-muted-foreground">Method:</span>
                  {Object.keys(methodColors).map((method) => (
                    <Button
                      key={method}
                      variant={filterMethod === method ? "primary" : "outline"}
                      size="sm"
                      onClick={() =>
                        setFilterMethod(filterMethod === method ? null : method)
                      }
                    >
                      {method}
                    </Button>
                  ))}
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-sm text-muted-foreground">Auth:</span>
                  <Button
                    variant={filterAuth === true ? "primary" : "outline"}
                    size="sm"
                    onClick={() =>
                      setFilterAuth(filterAuth === true ? null : true)
                    }
                  >
                    Required
                  </Button>
                  <Button
                    variant={filterAuth === false ? "primary" : "outline"}
                    size="sm"
                    onClick={() =>
                      setFilterAuth(filterAuth === false ? null : false)
                    }
                  >
                    Public
                  </Button>
                </div>

                {(filterMethod || filterAuth !== null) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setFilterMethod(null);
                      setFilterAuth(null);
                    }}
                  >
                    Clear Filters
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Endpoints by Category */}
      {categories.map((category) => {
        const categoryEndpoints = filteredEndpoints.filter(
          (e) => e.category === category,
        );
        if (categoryEndpoints.length === 0) return null;

        return (
          <Card key={category}>
            <CardHeader>
              <CardTitle>{category}</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {categoryEndpoints.map((endpoint) => {
                  const isExpanded = expandedEndpoint === endpoint.id;
                  const colors = methodColors[endpoint.method];

                  return (
                    <div
                      key={endpoint.id}
                      className="border border-border rounded-xl overflow-hidden"
                    >
                      <button
                        onClick={() =>
                          setExpandedEndpoint(isExpanded ? null : endpoint.id)
                        }
                        className="w-full p-4 hover:bg-muted/50 transition-all flex items-center justify-between"
                      >
                        <div className="flex items-center gap-4 flex-1">
                          <Badge
                            className={`${colors.bg} ${colors.text} border ${colors.border} font-mono px-3 py-1`}
                          >
                            {endpoint.method}
                          </Badge>
                          <div className="text-left flex-1">
                            <code className="text-sm font-medium">
                              {endpoint.endpoint}
                            </code>
                            <p className="text-sm text-muted-foreground mt-1">
                              {endpoint.description}
                            </p>
                          </div>
                          <div className="flex items-center gap-2">
                            {endpoint.auth ? (
                              <Badge variant="warning" className="gap-1">
                                <Lock className="w-3 h-3" />
                                Auth
                              </Badge>
                            ) : (
                              <Badge variant="success" className="gap-1">
                                <Unlock className="w-3 h-3" />
                                Public
                              </Badge>
                            )}
                            {isExpanded ? (
                              <ChevronDown className="w-5 h-5 text-muted-foreground" />
                            ) : (
                              <ChevronRight className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                        </div>
                      </button>

                      {isExpanded && (
                        <div className="border-t border-border p-4 bg-muted/20 space-y-4">
                          {/* Parameters */}
                          <div>
                            <h4 className="font-semibold mb-3">Parameters</h4>
                            <div className="space-y-2">
                              {endpoint.parameters.map((param, index) => (
                                <div
                                  key={index}
                                  className="flex items-start gap-3 p-3 rounded-lg bg-card"
                                >
                                  <code className="text-sm font-medium text-primary">
                                    {param.name}
                                  </code>
                                  <div className="flex-1">
                                    <div className="flex items-center gap-2 mb-1">
                                      <Badge variant="default">
                                        {param.type}
                                      </Badge>
                                      {param.required && (
                                        <Badge variant="warning">
                                          Required
                                        </Badge>
                                      )}
                                    </div>
                                    <p className="text-sm text-muted-foreground">
                                      {param.description}
                                    </p>
                                  </div>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Response */}
                          <div>
                            <h4 className="font-semibold mb-3">Response</h4>
                            <div className="relative">
                              <pre className="bg-background p-4 rounded-xl overflow-x-auto">
                                <code className="text-sm text-green-400">
                                  {JSON.stringify(
                                    endpoint.response.example,
                                    null,
                                    2,
                                  )}
                                </code>
                              </pre>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-2 right-2"
                                onClick={() => copyToClipboard(JSON.stringify(endpoint.response.example, null, 2), `resp-${endpoint.id}`)}
                              >
                                {copiedId === `resp-${endpoint.id}` ? <span className="text-xs text-green-500">Copied!</span> : <Copy className="w-4 h-4" />}
                              </Button>
                            </div>
                          </div>

                          {/* Try it out */}
                          <div className="flex gap-2 pt-2">
                            <Button className="gap-2" onClick={() => handleTryIt(endpoint)}>
                              <Play className="w-4 h-4" />
                              {triedId === endpoint.id ? "Opening..." : "Try it out"}
                            </Button>
                            <Button
                              variant="outline"
                              className="gap-2"
                              onClick={() => copyToClipboard(buildCurl(endpoint), `curl-${endpoint.id}`)}
                            >
                              <Copy className="w-4 h-4" />
                              {copiedId === `curl-${endpoint.id}` ? "Copied!" : "Copy as cURL"}
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        );
      })}

      {!loadingRepos && !scanningApis && !hasApiEndpoints && (
        <div className="flex items-center justify-between gap-4 rounded-xl border border-border bg-card px-4 py-3">
          <div>
            <h3 className="text-sm font-semibold">No APIs detected</h3>
            <p className="text-sm text-muted-foreground">
              {selectedRepo
                ? "No Spring Boot REST controller mappings were found in this repository."
                : "Select a repository to scan for REST endpoints."}
            </p>
          </div>
          {selectedRepo && (
            <Button size="sm" variant="outline" className="gap-2 shrink-0" onClick={handleRefreshScan}>
              <RefreshCw className="w-4 h-4" />
              Refresh Scan
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
