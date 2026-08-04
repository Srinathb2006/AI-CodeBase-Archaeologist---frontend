// ── Folders to exclude from architecture analysis and file scanning ──
const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "target",
  ".next",
  "coverage",
  "vendor",
  "__pycache__",
  ".venv",
  "venv",
  "env",
  ".tox",
  ".mypy_cache",
  ".pytest_cache",
  "bower_components",
  ".gradle",
  ".mvn",
  ".idea",
  ".vscode",
  ".settings",
  ".cache",
  ".parcel-cache",
  ".turbo",
  ".svelte-kit",
  ".nuxt",
  ".output",
  ".vercel",
  ".netlify",
  ".serverless",
  "__macosx",
]);

/**
 * Returns true if the normalised path passes through any ignored directory.
 * @param {string} filePath
 * @returns {boolean}
 */
function isIgnoredPath(filePath) {
  const segments = filePath.replace(/\\/g, "/").toLowerCase().split("/");
  return segments.some((seg) => IGNORED_DIRS.has(seg));
}

/**
 * Analyzes repository structure and file contents to detect technologies, frameworks, and architecture.
 * Automatically filters out dependency / generated folders so that only project source files are considered.
 * @param {Array} fileTree - List of file tree entries
 * @param {Object} fileContents - Map of file paths to contents
 * @returns {Object} Detected features
 */
export function analyzeRepository(fileTree, fileContents = {}) {
  // Exclude generated/dep folders and normalize paths
  const filteredTree = fileTree.filter((f) => !isIgnoredPath(f.path.replace(/\\/g, "/")));
  const filePaths = filteredTree.map((f) => f.path.replace(/\\/g, "/"));
  const fileSet = new Set(filePaths.map((p) => p.toLowerCase()));
  const allFileContents = Object.values(fileContents).join("\n").toLowerCase();

  const technologies = new Set();
  const frameworks = new Set();
  const buildTools = new Set();
  const tools = new Set();
  const stackMap = new Map();
  let architecturePatterns = ["Monolith"];

  const normalizeKey = (s) => s.toLowerCase().trim();
  const addStackItem = (name, category, confidence = 75, evidence = []) => {
    const key = normalizeKey(name);
    const existing = stackMap.get(key);
    if (existing) {
      existing.categories = Array.from(new Set([...existing.categories, category]));
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.evidence = Array.from(new Set([...existing.evidence, ...evidence]));
      stackMap.set(key, existing);
    } else {
      stackMap.set(key, { name: name.trim(), categories: [category], confidence, evidence: Array.from(new Set(evidence)) });
    }
  };

  const addTechnology = (name, category = "Language/Core", confidence = 75, evidence = []) => {
    technologies.add(name);
    addStackItem(name, category, confidence, evidence);
  };
  const addFramework = (name, confidence = 80, evidence = []) => {
    frameworks.add(name);
    addStackItem(name, "Framework/Library", confidence, evidence);
  };
  const addBuildTool = (name, confidence = 80, evidence = []) => {
    buildTools.add(name);
    addStackItem(name, "Build Tool", confidence, evidence);
  };
  const addTool = (name, confidence = 75, evidence = []) => {
    tools.add(name);
    addStackItem(name, "Tool", confidence, evidence);
  };

  const hasFile = (filename) => [...fileSet].some((f) => f.split("/").pop() === filename.toLowerCase());
  const hasDir = (dirName) => [...fileSet].some((f) => f.includes(`/${dirName.toLowerCase()}/`) || f.startsWith(dirName.toLowerCase() + "/"));
  const getFileContentsByName = (filename) => Object.keys(fileContents).filter((p) => p.split("/").pop().toLowerCase() === filename.toLowerCase()).map((p) => fileContents[p] || "");
  const parseJson = (text) => {
    try {
      return JSON.parse(text);
    } catch (error) {
      return null;
    }
  };
  const getDependencyKeysFromPackageJson = () => {
    const keys = new Set();
    Object.keys(fileContents)
      .filter((path) => path.split("/").pop().toLowerCase() === "package.json")
      .forEach((path) => {
        const pkg = parseJson(fileContents[path] || "{}");
        if (!pkg) return;
        [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies].forEach((depGroup) => {
          if (depGroup && typeof depGroup === "object") {
            Object.keys(depGroup).forEach((depName) => keys.add(depName.toLowerCase()));
          }
        });
      });
    return keys;
  };
  const packageDependencies = getDependencyKeysFromPackageJson();
  const hasPackageDependency = (name) => packageDependencies.has(name.toLowerCase());
  const contentIncludes = (needle) => allFileContents.includes(needle.toLowerCase());
  const contentMatches = (re) => re.test(allFileContents);

  // --- Evidence-based detection ---
  // Maven / Spring
  if (hasFile("pom.xml")) {
    addTechnology("Java", "Language/Core", 90, ["pom.xml"]);
    addBuildTool("Maven", 90, ["pom.xml"]);
    const poms = getFileContentsByName("pom.xml");
    poms.forEach((pom) => {
      const pomLower = pom.toLowerCase();
      if (pomLower.includes("spring-boot") || pomLower.includes("org.springframework.boot")) addFramework("Spring Boot", 95, ["pom.xml"]);
      if (pomLower.includes("spring-security") || pomLower.includes("org.springframework.security")) addFramework("Spring Security", 95, ["pom.xml"]);
      if (pomLower.includes("spring-data-jpa") || pomLower.includes("hibernate")) addFramework("JPA/Hibernate", 88, ["pom.xml"]);
      if (pomLower.includes("postgresql") || pomLower.includes("org.postgresql")) addTechnology("PostgreSQL", "Database", 90, ["pom.xml"]);
      if (pomLower.includes("mongodb")) addTechnology("MongoDB", "Database", 90, ["pom.xml"]);
      if (pomLower.includes("mysql") || pomLower.includes("mariadb")) addTechnology("MySQL", "Database", 90, ["pom.xml"]);
      if (pomLower.includes("lombok")) addTool("Lombok", 80, ["pom.xml"]);
      if (pomLower.includes("spring-cloud")) addFramework("Spring Cloud", 85, ["pom.xml"]);
    });
  }

  // Gradle
  if (hasFile("build.gradle") || hasFile("build.gradle.kts")) {
    addTechnology("Java", "Language/Core", 90, ["build.gradle"]);
    addBuildTool("Gradle", 90, ["build.gradle"]);
    const grads = getFileContentsByName("build.gradle").concat(getFileContentsByName("build.gradle.kts")).map(s => s.toLowerCase()).join("\n");
    if (/spring-boot/.test(grads) || /org\.springframework\.boot/.test(grads)) addFramework("Spring Boot", 95, ["build.gradle"]);
    if (/spring-security/.test(grads)) addFramework("Spring Security", 95, ["build.gradle"]);
  }

  // Java annotations and source-based evidence
  const javaSources = Object.keys(fileContents).filter(p => p.endsWith('.java')).map(p => (fileContents[p] || '').toLowerCase()).join('\n');
  if (javaSources) {
    if (/\@springbootapplication/.test(javaSources)) addFramework('Spring Boot', 98, ['java annotation']);
    if (/\@restcontroller|\@controller|\@requestmapping/.test(javaSources)) addFramework('Spring MVC', 90, ['java source']);
    if (/\@entity|\@repository/.test(javaSources)) addFramework('JPA/Hibernate', 88, ['java source']);
    if (/securityfilterchain|httpsecurity|\@enablewebsecurity|\@preauthorize|\@postauthorize/.test(javaSources)) addFramework('Spring Security', 95, ['java security']);
    if (/auth0/.test(javaSources)) addTechnology('Auth0', 'Security', 85, ['java source']);
    if (/okta/.test(javaSources)) addTechnology('Okta', 'Security', 85, ['java source']);
    if (/keycloak/.test(javaSources)) addTechnology('Keycloak', 'Security', 85, ['java source']);
  }

  // Node / frontend
  if (hasFile('package.json')) {
    addTechnology('Node.js', 'Language/Core', 85, ['package.json']);
    const pkgs = getFileContentsByName('package.json').map(s => s.toLowerCase()).join('\n');
    if (pkgs.includes('react') || pkgs.includes('react-dom')) { addFramework('React', 95, ['package.json']); addTechnology('JavaScript', 'Frontend', 85, ['package.json']); }
    if (hasPackageDependency('@angular/core')) { addFramework('Angular', 95, ['package.json']); addTechnology('TypeScript', 'Frontend', 85, ['package.json']); }
    if (hasPackageDependency('vue')) { addFramework('Vue', 95, ['package.json']); addTechnology('JavaScript', 'Frontend', 85, ['package.json']); }
    if (hasPackageDependency('svelte') || hasPackageDependency('@sveltejs/kit')) { addFramework('Svelte', 95, ['package.json']); }
    if (hasPackageDependency('next') || hasFile('next.config.js') || contentIncludes('from "next"') || contentIncludes("from 'next'") || contentIncludes('next/link')) { addFramework('Next.js', 95, ['package.json', 'next.config.js']); }
    if (hasPackageDependency('vite') || hasFile('vite.config.js')) { addTool('Vite', 90, ['package.json']); addBuildTool('Vite', 90, ['package.json']); }
    if (pkgs.includes('typescript')) addTechnology('TypeScript', 'Language/Core', 90, ['package.json']);
    if (pkgs.includes('tailwindcss')) addFramework('Tailwind CSS', 85, ['package.json']);
    if (hasPackageDependency('express') || contentIncludes('from express') || contentIncludes('require("express")')) { addFramework('Express.js', 90, ['package.json']); }
    if (hasPackageDependency('@nestjs/core') || contentIncludes('@nestjs/core')) { addFramework('NestJS', 90, ['package.json']); }
  }

  // Python
  if (hasFile('requirements.txt') || hasFile('pyproject.toml') || hasFile('setup.py')) {
    addTechnology('Python', 'Language/Core', 90, ['requirements/pyproject']);
    if (contentIncludes('from flask') || contentIncludes('import flask')) addFramework('Flask', 90, ['python source']);
    if (contentIncludes('from django') || contentIncludes('import django')) addFramework('Django', 90, ['python source']);
    if (contentIncludes('from fastapi') || contentIncludes('import fastapi')) addFramework('FastAPI', 90, ['python source']);
  }

  // Go / Rust
  if (hasFile('go.mod')) { addTechnology('Go', 'Language/Core', 90, ['go.mod']); }
  if (hasFile('cargo.toml') || hasFile('Cargo.toml')) { addTechnology('Rust', 'Language/Core', 90, ['Cargo.toml']); }

  // Docker / infra / CI
  if (hasFile('dockerfile') || hasFile('Dockerfile')) addTechnology('Docker', 'Infrastructure', 80, ['Dockerfile']);
  if (filePaths.some(p => p.startsWith('.github/workflows/'))) addTool('GitHub Actions', 85, ['.github/workflows']);

  // Lockfiles -> package manager
  ['package-lock.json','yarn.lock','pnpm-lock.yaml'].forEach(lock => { if (hasFile(lock)) addBuildTool(lock.includes('yarn') ? 'Yarn' : lock.includes('pnpm') ? 'pnpm' : 'npm', 90, [lock]); });

  // Simple architecture heuristics
  const pkgJsonCount = filePaths.filter((p) => p.endsWith('package.json')).length;
  const pomCount = filePaths.filter((p) => p.endsWith('pom.xml')).length;
  const goModCount = filePaths.filter((p) => p.endsWith('go.mod')).length;
  if (hasFile('pnpm-workspace.yaml') || hasFile('lerna.json') || (pkgJsonCount > 1 && (hasDir('packages') || hasDir('apps')))) architecturePatterns = ['Monorepo'];
  else if ((pomCount > 2 && (hasDir('services') || hasDir('microservices'))) || (goModCount > 2) || (pkgJsonCount > 2 && hasDir('services'))) architecturePatterns = ['Microservices'];
  else if (hasDir('models') && hasDir('controllers') && (hasDir('views') || hasDir('templates'))) architecturePatterns = ['Model-View-Controller (MVC)'];
  else if ((hasDir('domain') && hasDir('infrastructure') && hasDir('application')) || (hasDir('service') && hasDir('repository') && (hasDir('controller') || hasDir('api')))) architecturePatterns = ['Layered Architecture'];
  else if (hasDir('ports') && hasDir('adapters') && hasDir('domain')) architecturePatterns = ['Hexagonal Architecture'];
  else if (hasFile('serverless.yml') || hasFile('netlify.toml') || hasFile('vercel.json') || hasDir('functions')) architecturePatterns = ['Serverless'];

  const technologyStack = Array.from(stackMap.values()).sort((a,b) => b.confidence - a.confidence);

  return {
    technologies: Array.from(technologies),
    frameworks: Array.from(frameworks),
    buildTools: Array.from(buildTools),
    tools: Array.from(tools),
    architecturePatterns,
    technologyStack,
  };
}

/**
 * Converts a flat path array into a nested directory structure.
 * @param {Array} flatTree - List of entries like { path: 'a/b/c.js', type: 'blob'|'tree', size: 123 }
 * @returns {Array} Nested folder/file nodes
 */
export function buildHierarchicalTree(flatTree) {
  const root = [];
  const folderMap = {};

  // Sort paths to process parents before children
  const sortedTree = [...flatTree].sort((a, b) => a.path.localeCompare(b.path));

  for (const item of sortedTree) {
    const parts = item.path.split("/");
    let currentLevel = root;
    let currentPath = "";

    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isLast = i === parts.length - 1;
      currentPath = currentPath ? `${currentPath}/${part}` : part;

      if (isLast) {
        if (item.type === "tree") {
          if (!folderMap[currentPath]) {
            const folderNode = {
              name: part,
              path: currentPath,
              type: "folder",
              children: []
            };
            folderMap[currentPath] = folderNode;
            currentLevel.push(folderNode);
          }
        } else {
          currentLevel.push({
            name: part,
            path: item.path,
            type: "file",
            size: item.size || 0
          });
        }
      } else {
        if (!folderMap[currentPath]) {
          const folderNode = {
            name: part,
            path: currentPath,
            type: "folder",
            children: []
          };
          folderMap[currentPath] = folderNode;
          currentLevel.push(folderNode);
        }
        currentLevel = folderMap[currentPath].children;
      }
    }
  }

  return root;
}

/**
 * Dynamically detects codebase architecture nodes (frontend, backend, DBs, third-party APIs)
 * based on file tree structure, dependency configurations, and environment templates.
 *
 * @param {Array} fileTree - List of file tree entries
 * @param {Object} fileContents - Map of file paths to contents
 * @param {Object} [techAnalysis] - Optional pre-computed tech analysis
 * @returns {Object} { nodes: Array, connections: Array }
 */
export function detectCodebaseArchitecture(fileTree, fileContents = {}, techAnalysis = null) {
  const analysis = techAnalysis || analyzeRepository(fileTree, fileContents);
  
  const filePaths = fileTree.map((f) => f.path.replace(/\\/g, "/"));
  const fileSet = new Set(filePaths.map(p => p.toLowerCase()));
  const allContent = Object.values(fileContents)
  .filter(Boolean)
  .join("\n")
  .toLowerCase();
const getPackageDependencies = () => {
  const names = new Set();

  Object.keys(fileContents)
    .filter(
      (path) =>
        path.split("/").pop().toLowerCase() === "package.json"
    )
    .forEach((path) => {
      try {
        const pkg = JSON.parse(fileContents[path] || "{}");

        [
          pkg.dependencies,
          pkg.devDependencies,
          pkg.peerDependencies,
        ].forEach((group) => {
          if (group && typeof group === "object") {
            Object.keys(group).forEach((name) =>
              names.add(name.toLowerCase())
            );
          }
        });
      } catch (e) {}
    });

  return names;
};

const packageDependencies = getPackageDependencies();

const hasPackageDependency = (name) =>
  packageDependencies.has(name.toLowerCase());
const hasFile = (filename) =>
  [...fileSet].some(
    (f) => f.split("/").pop() === filename.toLowerCase()
  );

const hasContentRegex = (regex) =>
  regex.test(allContent);

const contentIncludes = (text) =>
  allContent.includes(text.toLowerCase());

// Extract package.json dependencies
let deps = {};
const pkgJsonFiles = Object.keys(fileContents).filter(
  (p) => p.split("/").pop().toLowerCase() === "package.json"
);
pkgJsonFiles.forEach((path) => {
  try {
    const pkg = JSON.parse(fileContents[path] || "{}");
    Object.keys(pkg.dependencies || {}).forEach((name) => {
      deps[name.toLowerCase()] = pkg.dependencies[name];
    });
    Object.keys(pkg.devDependencies || {}).forEach((name) => {
      deps[name.toLowerCase()] = pkg.devDependencies[name];
    });
  } catch (e) {}
});

// Extract python requirements
const reqFiles = Object.keys(fileContents).filter(
  (p) => p.split("/").pop().toLowerCase() === "requirements.txt"
);
const reqStr = reqFiles
  .map((path) => (fileContents[path] || "").toLowerCase())
  .join("\n");

  // Helper checks
  const hasDep = (name) => !!deps[name] || packageDependencies.has(name.toLowerCase());
  const hasReq = (name) => reqStr.includes(name.toLowerCase());
  const hasFilePattern = (pattern) => [...fileSet].some(f => f.includes(pattern.toLowerCase()));
  const hasFolder = (name) => {
    const lower = name.toLowerCase() + "/";
    return [...fileSet].some(f => f.includes("/" + lower) || f.startsWith(lower));
  };
  const hasTech = (name) => 
    analysis.technologies.some(t => t.toLowerCase() === name.toLowerCase()) || 
    analysis.frameworks.some(f => f.toLowerCase() === name.toLowerCase());

  const nodes = [];
  const connections = [];

  // Build technology lookup from analysis (name -> {confidence,evidence})
  const techMap = new Map();
  if (analysis && Array.isArray(analysis.technologyStack)) {
    analysis.technologyStack.forEach((t) => techMap.set(String(t.name).toLowerCase(), { confidence: t.confidence || 0, evidence: t.evidence || [] }));
  }
  const getTechInfo = (name) => techMap.get(String(name).toLowerCase()) || null;

  // 1. Detect Frontend
  const hasFrontendTech = hasDep("react") || hasDep("react-dom") || hasDep("next") || 
                          hasDep("@angular/core") || hasDep("vue") || hasDep("svelte") || 
                          hasDep("@sveltejs/kit") || hasDep("solid-js") || hasDep("gatsby") || 
                          hasDep("remix") || hasDep("astro") || hasDep("tailwindcss") ||
                          hasTech("React") || hasTech("Angular") || hasTech("Vue") || 
                          hasTech("Svelte") || hasTech("Next.js") || hasTech("Tailwind CSS");

  const hasFrontendFolders = hasFolder("components") || hasFolder("pages") || 
                            hasFolder("views") || hasFolder("client") || 
                            hasFolder("frontend") || hasFolder("ui");

  const hasFrontendFiles = [...fileSet].some(f => 
    f.endsWith(".jsx") || f.endsWith(".tsx") || f.endsWith(".vue") || 
    f.endsWith(".svelte") || f.endsWith(".html") || f.endsWith(".css")
  );

  const isFrontendDetected = hasFrontendTech || hasFrontendFolders || hasFrontendFiles;

  // 2. Detect Backend
  const hasBackendTech = hasDep("express") || hasDep("nestjs") || hasDep("@nestjs/core") || 
                         hasDep("koa") || hasDep("fastify") || hasDep("apollo-server") || 
                         hasDep("trpc") || hasReq("flask") || hasReq("django") || 
                         hasReq("fastapi") || hasTech("Spring Boot") || hasTech("Express.js") || 
                         hasTech("NestJS") || hasTech("Flask") || hasTech("Django") || 
                         hasTech("FastAPI") || hasTech("Gin") || hasTech("Echo") || 
                         hasTech("Actix-web");

  const hasBackendFolders = hasFolder("controllers") || hasFolder("services") || 
                           hasFolder("routes") || hasFolder("api") || 
                           hasFolder("server") || hasFolder("backend") || 
                           hasFolder("handlers");

  const hasBackendFiles = hasFilePattern("server.js") || hasFilePattern("app.js") || 
                          hasFilePattern("main.go") || hasFilePattern("main.py") || 
                          hasFilePattern("wsgi.py") || hasFilePattern("go.mod") || 
                          hasFilePattern("cargo.toml") || hasFilePattern("pom.xml");

  const isBackendDetected = hasBackendTech || hasBackendFolders || hasBackendFiles;

  // 3. Detect Databases
  const dbs = [];
  const fileContentsList = Object.values(fileContents);
  
  // PostgreSQL
  const isPostgres = hasDep("pg") || hasDep("pg-promise") || 
                     (hasDep("sequelize") && hasDep("pg")) ||
                     (hasFilePattern("schema.prisma") && fileContentsList.some(c => c.includes("postgresql") || c.includes("postgres"))) ||
                     fileContentsList.some(c => c.includes("DATABASE_URL") && c.includes("postgres")) ||
                     fileContentsList.some(c => c.includes("5432"));
  if (isPostgres) dbs.push({ id: "db-postgresql", label: "PostgreSQL Database", tech: ["PostgreSQL"], color: "from-cyan-600 to-blue-700" });

  // MongoDB
  const isMongo = hasDep("mongoose") || hasDep("mongodb") ||
                  fileContentsList.some(c => c.includes("mongodb://") || c.includes("27017"));
  if (isMongo) dbs.push({ id: "db-mongodb", label: "MongoDB Database", tech: ["MongoDB"], color: "from-emerald-500 to-green-600" });

  // MySQL
  const isMySQL = hasDep("mysql") || hasDep("mysql2") ||
                  fileContentsList.some(c => c.includes("3306")) ||
                  (hasFilePattern("schema.prisma") && fileContentsList.some(c => c.includes("mysql")));
  if (isMySQL) dbs.push({ id: "db-mysql", label: "MySQL Database", tech: ["MySQL"], color: "from-orange-500 to-amber-600" });

  // Redis
  const isRedis = hasDep("redis") || hasDep("ioredis") ||
                  fileContentsList.some(c => c.includes("6379"));
  if (isRedis) dbs.push({ id: "db-redis", label: "Redis Cache", tech: ["Redis"], color: "from-red-500 to-rose-600" });

  // SQLite
  const isSQLite = hasDep("sqlite3") || hasDep("better-sqlite3") ||
                   (hasFilePattern("schema.prisma") && fileContentsList.some(c => c.includes("sqlite"))) ||
                   [...fileSet].some(f => f.endsWith(".sqlite") || f.endsWith(".db") || f.endsWith(".sqlite3"));
  if (isSQLite) dbs.push({ id: "db-sqlite", label: "SQLite Database", tech: ["SQLite"], color: "from-blue-400 to-indigo-500" });

  // Fallback Database store check
  if (dbs.length === 0 && (hasFolder("models") || hasFolder("entities") || hasFolder("db") || hasFolder("database"))) {
    const orms = [];
    if (hasDep("prisma") || hasDep("@prisma/client")) orms.push("Prisma");
    if (hasDep("sequelize")) orms.push("Sequelize");
    if (hasDep("mongoose")) orms.push("Mongoose");
    if (hasDep("drizzle-orm")) orms.push("Drizzle ORM");
    dbs.push({
      id: "database",
      label: "Database Store",
      tech: orms.length > 0 ? orms : ["SQL/NoSQL"],
      color: "from-accent to-primary"
    });
  }

  // 4. Detect External Services
  const externals = [];
  if (hasDep("stripe") || hasDep("@stripe/stripe-js") || fileContentsList.some(c => c.includes("STRIPE_"))) {
    externals.push({ id: "ext-stripe", label: "Stripe Payment API", tech: ["Stripe"], color: "from-purple-500 to-indigo-600" });
  }
  if (hasDep("aws-sdk") || hasDep("@aws-sdk/client-s3") || hasReq("boto3") || fileContentsList.some(c => c.includes("AWS_"))) {
    externals.push({ id: "ext-aws", label: "AWS Cloud Services", tech: ["AWS S3"], color: "from-amber-500 to-orange-600" });
  }
  if (hasDep("openai") || fileContentsList.some(c => c.includes("OPENAI_"))) {
    externals.push({ id: "ext-openai", label: "OpenAI API", tech: ["GPT-4 / LLM"], color: "from-green-600 to-emerald-700" });
  }
  if (hasDep("@sendgrid/mail") || fileContentsList.some(c => c.includes("SENDGRID_"))) {
    externals.push({ id: "ext-sendgrid", label: "SendGrid Email API", tech: ["SendGrid"], color: "from-blue-400 to-blue-600" });
  }
  if (hasDep("twilio") || fileContentsList.some(c => c.includes("TWILIO_"))) {
    externals.push({ id: "ext-twilio", label: "Twilio API", tech: ["Twilio SMS"], color: "from-red-500 to-red-600" });
  }
  if (hasDep("firebase") || hasDep("firebase-admin")) {
    externals.push({ id: "ext-firebase", label: "Firebase Services", tech: ["Firebase Auth/DB"], color: "from-yellow-500 to-amber-500" });
  }

  // Add nodes to list based on detection
  let frontendNode = null;
  if (isFrontendDetected) {
    let label = "Web Frontend";
    const candidateTechs = [];
    if (hasDep("next") || hasTech("Next.js") || hasFile("next.config.js") || contentIncludes('next')) candidateTechs.push("Next.js");
    if (hasDep("react") || hasTech("React")) candidateTechs.push("React");
    if (hasDep("vue") || hasTech("Vue")) candidateTechs.push("Vue");
    if (hasDep("svelte") || hasTech("Svelte")) candidateTechs.push("Svelte");
    if (hasDep("@angular/core") || hasTech("Angular")) candidateTechs.push("Angular");
    if (hasDep("typescript") || hasTech("TypeScript")) candidateTechs.push("TypeScript");
    if (hasDep("tailwindcss") || hasTech("Tailwind CSS")) candidateTechs.push("Tailwind CSS");

    const techObjs = candidateTechs
      .map((t) => {
        const info = getTechInfo(t);
        return info ? { name: t, confidence: info.confidence, evidence: info.evidence } : null;
      })
      .filter(Boolean)
      .filter((t) => t.confidence >= 70);

    if (techObjs.length > 0) {
      // choose dominant label
      if (techObjs.some(t => /next/i.test(t.name))) label = 'Next.js Web App';
      else if (techObjs.some(t => /react/i.test(t.name))) label = 'React Frontend';
      else if (techObjs.some(t => /vue/i.test(t.name))) label = 'Vue.js App';
      else if (techObjs.some(t => /svelte/i.test(t.name))) label = 'Svelte App';
      else if (techObjs.some(t => /angular/i.test(t.name))) label = 'Angular App';
    }

    const inferredConfidence = techObjs.length > 0 ? Math.max(...techObjs.map(t => t.confidence)) : (hasFrontendFolders ? 80 : (hasFrontendFiles ? 72 : 0));

    frontendNode = {
      id: "frontend",
      label,
      type: "frontend",
      iconName: "smartphone",
      color: "from-primary to-secondary",
      technologies: techObjs,
      confidence: inferredConfidence,
      evidence: techObjs.flatMap(t => t.evidence || []),
      x: 50,
      y: 20
    };
    if (frontendNode.confidence >= 70) nodes.push(frontendNode);
  }

  let backendNode = null;
  if (isBackendDetected) {
    let label = "API Backend";
    const candidateTechs = [];
    if (hasDep("express") || hasTech("Express.js")) candidateTechs.push("Express");
    if (hasDep("nestjs") || hasTech("NestJS") || hasPackageDependency('@nestjs/core')) candidateTechs.push("NestJS");
    if (hasTech("Spring Boot") || hasFile("pom.xml")) candidateTechs.push("Spring Boot");
    if (hasTech("FastAPI") || hasReq('fastapi')) candidateTechs.push("FastAPI");
    if (hasTech("Django") || hasReq('django')) candidateTechs.push("Django");
    if (hasTech("Flask") || hasReq('flask')) candidateTechs.push("Flask");
    if (hasTech("Gin")) candidateTechs.push("Gin");
    if (hasTech("Echo")) candidateTechs.push("Echo");
    if (hasTech("Actix-web")) candidateTechs.push("Actix-web");
    if (hasTech("Node.js")) candidateTechs.push("Node.js");
    if (hasTech("Python")) candidateTechs.push("Python");
    if (hasTech("Go")) candidateTechs.push("Go");
    if (hasTech("Rust")) candidateTechs.push("Rust");
    if (hasTech("Java")) candidateTechs.push("Java");

    const techObjs = candidateTechs
      .map((t) => {
        const info = getTechInfo(t);
        return info ? { name: t, confidence: info.confidence, evidence: info.evidence } : null;
      })
      .filter(Boolean)
      .filter((t) => t.confidence >= 70);

    if (techObjs.length > 0) {
      if (techObjs.some(t => /express/i.test(t.name))) label = 'Express API Server';
      else if (techObjs.some(t => /nestjs/i.test(t.name))) label = 'NestJS Backend';
      else if (techObjs.some(t => /spring boot/i.test(t.name))) label = 'Spring Boot Server';
      else if (techObjs.some(t => /fastapi/i.test(t.name))) label = 'FastAPI Backend';
    }

    const inferredConfidence = techObjs.length > 0 ? Math.max(...techObjs.map(t => t.confidence)) : (hasBackendFolders ? 75 : (hasBackendFiles ? 72 : 0));

    backendNode = {
      id: "backend",
      label,
      type: "backend",
      iconName: "server",
      color: "from-secondary to-accent",
      technologies: techObjs,
      confidence: inferredConfidence,
      evidence: techObjs.flatMap(t => t.evidence || []),
      x: 50,
      y: 50
    };
    if (backendNode.confidence >= 70) nodes.push(backendNode);
  }

  const hasControllerFolder = hasFolder("controller") || hasFolder("controllers");
  const hasServiceFolder = hasFolder("service") || hasFolder("services");
  const hasRepositoryFolder = hasFolder("repository") || hasFolder("repositories") || hasFolder("dao") || hasFolder("data");
  const hasModelFolder = hasFolder("model") || hasFolder("models") || hasFolder("entity") || hasFolder("entities") || hasFolder("schema") || hasFolder("domain");

  let controllerNode = null;
  if (hasControllerFolder || hasContentRegex(/controller/i)) {
    const conf = hasControllerFolder ? 90 : 72;
    controllerNode = {
      id: "controllers",
      label: "Controller Layer",
      type: "controller",
      color: "from-purple-500 to-purple-600",
      technologies: [{ name: "Controller/Route Handlers", confidence: conf, evidence: [hasControllerFolder ? "controllers folder" : "controller file names"] }],
      confidence: conf,
      evidence: [hasControllerFolder ? "controllers folder" : "controller file names"],
      x: 50,
      y: 30
    };
    if (controllerNode.confidence >= 70) nodes.push(controllerNode);
  }

  let serviceNode = null;
  if (hasServiceFolder || hasContentRegex(/service/i)) {
    const conf = hasServiceFolder ? 88 : 72;
    serviceNode = {
      id: "services",
      label: "Service Layer",
      type: "service",
      color: "from-blue-500 to-blue-600",
      technologies: [{ name: "Business Logic", confidence: conf, evidence: [hasServiceFolder ? "services folder" : "service file names"] }],
      confidence: conf,
      evidence: [hasServiceFolder ? "services folder" : "service file names"],
      x: 50,
      y: 45
    };
    if (serviceNode.confidence >= 70) nodes.push(serviceNode);
  }

  let repositoryNode = null;
  if (hasRepositoryFolder || hasContentRegex(/repository|dao|data access/i)) {
    const conf = hasRepositoryFolder ? 88 : 72;
    repositoryNode = {
      id: "repositories",
      label: "Repository Layer",
      type: "repository",
      color: "from-green-500 to-green-600",
      technologies: [{ name: "Data Access", confidence: conf, evidence: [hasRepositoryFolder ? "repositories folder" : "repository file names"] }],
      confidence: conf,
      evidence: [hasRepositoryFolder ? "repositories folder" : "repository file names"],
      x: 50,
      y: 60
    };
    if (repositoryNode.confidence >= 70) nodes.push(repositoryNode);
  }

  let modelNode = null;
  if (hasModelFolder || hasContentRegex(/entity|model|schema/i)) {
    const conf = hasModelFolder ? 85 : 70;
    modelNode = {
      id: "models",
      label: "Domain Models",
      type: "model",
      color: "from-orange-500 to-orange-600",
      technologies: [{ name: "Domain Entities", confidence: conf, evidence: [hasModelFolder ? "models/entities folder" : "entity/model file names"] }],
      confidence: conf,
      evidence: [hasModelFolder ? "models/entities folder" : "entity/model file names"],
      x: 50,
      y: 75
    };
    if (modelNode.confidence >= 70) nodes.push(modelNode);
  }

  // Add DB nodes (attach confidence/evidence from analysis)
  dbs.forEach((db) => {
    const techObjs = (db.tech || []).map(t => {
      const info = getTechInfo(t);
      return info ? { name: t, confidence: info.confidence, evidence: info.evidence } : { name: t, confidence: 75, evidence: [] };
    }).filter(t => t.confidence >= 70);
    const nodeConfidence = techObjs.length > 0 ? Math.max(...techObjs.map(t => t.confidence)) : 75;
    const evidence = techObjs.flatMap(t => t.evidence || []);
    const node = {
      id: db.id,
      label: db.label,
      type: "database",
      iconName: "database",
      color: db.color,
      technologies: techObjs,
      confidence: nodeConfidence,
      evidence,
      x: 30,
      y: 80
    };
    if (node.confidence >= 70) nodes.push(node);
  });

  // Add External nodes (attach confidence/evidence)
  externals.forEach((ext) => {
    const techObjs = (ext.tech || []).map(t => {
      const info = getTechInfo(t);
      return info ? { name: t, confidence: info.confidence, evidence: info.evidence } : { name: t, confidence: 75, evidence: [] };
    }).filter(t => t.confidence >= 70);
    const nodeConfidence = techObjs.length > 0 ? Math.max(...techObjs.map(t => t.confidence)) : 75;
    const evidence = techObjs.flatMap(t => t.evidence || []);
    const node = {
      id: ext.id,
      label: ext.label,
      type: "external",
      iconName: "globe",
      color: ext.color,
      technologies: techObjs,
      confidence: nodeConfidence,
      evidence,
      x: 70,
      y: 80
    };
    if (node.confidence >= 70) nodes.push(node);
  });

  // Layout calculations
  const dbNodes = nodes.filter(n => n.type === "database");
  const extNodes = nodes.filter(n => n.type === "external");

  // Distribute DB nodes
  if (dbNodes.length > 0) {
    dbNodes.forEach((node, idx) => {
      if (dbNodes.length === 1) {
        node.x = 35;
      } else {
        node.x = 15 + idx * (30 / (dbNodes.length - 1));
      }
    });
  }

  // Distribute External nodes
  if (extNodes.length > 0) {
    extNodes.forEach((node, idx) => {
      if (extNodes.length === 1) {
        node.x = 65;
      } else {
        node.x = 60 + idx * (25 / (extNodes.length - 1));
      }
    });
  }

  // Layout coordinate adjustments
  if (nodes.length === 1) {
    nodes[0].x = 50;
    nodes[0].y = 45;
  } else if (!isBackendDetected && isFrontendDetected && dbNodes.length > 0) {
    frontendNode.x = 50;
    frontendNode.y = 30;
    dbNodes.forEach((node, idx) => {
      if (dbNodes.length === 1) {
        node.x = 50;
      } else {
        node.x = 25 + idx * (50 / (dbNodes.length - 1));
      }
      node.y = 75;
    });
  } else if (!isFrontendDetected && isBackendDetected) {
    backendNode.x = 50;
    backendNode.y = 35;
    dbNodes.forEach((node) => {
      node.y = 75;
    });
    extNodes.forEach((node) => {
      node.y = 75;
    });
  }

  // Map connections
  if (frontendNode && backendNode) {
    connections.push({ from: frontendNode.id, to: backendNode.id });
  }

  if (frontendNode && !backendNode && controllerNode) {
    connections.push({ from: frontendNode.id, to: controllerNode.id });
  }

  if (controllerNode && serviceNode) {
    connections.push({ from: controllerNode.id, to: serviceNode.id });
  }
  if (serviceNode && repositoryNode) {
    connections.push({ from: serviceNode.id, to: repositoryNode.id });
  }
  if (repositoryNode && modelNode) {
    connections.push({ from: repositoryNode.id, to: modelNode.id });
  }
  if (controllerNode && repositoryNode && !serviceNode) {
    connections.push({ from: controllerNode.id, to: repositoryNode.id });
  }
  if (backendNode && controllerNode && !serviceNode) {
    connections.push({ from: controllerNode.id, to: backendNode.id });
  }

  if (backendNode) {
    dbNodes.forEach((db) => {
      connections.push({ from: backendNode.id, to: db.id });
    });
    extNodes.forEach((ext) => {
      connections.push({ from: backendNode.id, to: ext.id });
    });
  } else if (frontendNode) {
    dbNodes.forEach((db) => {
      connections.push({ from: frontendNode.id, to: db.id });
    });
    extNodes.forEach((ext) => {
      connections.push({ from: frontendNode.id, to: ext.id });
    });
  }

  // Fallback node
  if (nodes.length === 0) {
    const techObjs = (analysis.technologyStack || []).map(t => ({ name: t.name, confidence: t.confidence, evidence: t.evidence })).filter(t => t.confidence >= 70).slice(0,3);
    const conf = techObjs.length > 0 ? Math.max(...techObjs.map(t => t.confidence)) : 70;
    nodes.push({
      id: "codebase",
      label: "Code Repository",
      type: "library",
      iconName: "cpu",
      color: "from-primary to-accent",
      technologies: techObjs,
      confidence: conf,
      evidence: techObjs.flatMap(t => t.evidence || []),
      x: 50,
      y: 50
    });
  }

  return { nodes, connections };
}

