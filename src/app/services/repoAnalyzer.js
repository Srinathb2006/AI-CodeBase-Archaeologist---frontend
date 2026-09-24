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
 * Fully manifest-driven — reads package.json, pom.xml, build.gradle, requirements.txt,
 * pyproject.toml, go.mod, Cargo.toml, Gemfile, composer.json, pubspec.yaml, *.csproj, etc.
 * Only emits items for which real manifest/source evidence exists — zero false positives.
 * Language Distribution is NOT affected here (handled by zipAnalyzer / storageService).
 *
 * @param {Array} fileTree - List of file tree entries
 * @param {Object} fileContents - Map of file paths to contents
 * @returns {Object} { technologies, frameworks, buildTools, tools, architecturePatterns, technologyStack }
 */
export function analyzeRepository(fileTree, fileContents = {}) {
  // Exclude generated/dep folders and normalize paths
  const filteredTree = fileTree.filter((f) => !isIgnoredPath(f.path.replace(/\\/g, "/")));
  const filePaths = filteredTree.map((f) => f.path.replace(/\\/g, "/"));
  const fileSet = new Set(filePaths.map((p) => p.toLowerCase()));

  const technologies = new Set();
  const frameworks = new Set();
  const buildTools = new Set();
  const tools = new Set();
  const stackMap = new Map();
  let architecturePatterns = ["Monolith"];

  // ── Stack-map helpers ───────────────────────────────────────────────────
  const normalizeKey = (s) => s.toLowerCase().trim();
  const addStackItem = (name, category, confidence = 75, evidence = []) => {
    const key = normalizeKey(name);
    const existing = stackMap.get(key);
    if (existing) {
      existing.categories = Array.from(new Set([...existing.categories, category]));
      existing.confidence = Math.max(existing.confidence, confidence);
      existing.evidence = Array.from(new Set([...existing.evidence, ...evidence]));
    } else {
      stackMap.set(key, {
        name: name.trim(),
        categories: [category],
        confidence,
        evidence: Array.from(new Set(evidence)),
      });
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

  // ── File / directory helpers ────────────────────────────────────────────
  const hasFile = (filename) =>
    [...fileSet].some((f) => f.split("/").pop() === filename.toLowerCase());
  const hasDir = (dirName) =>
    [...fileSet].some(
      (f) =>
        f.includes(`/${dirName.toLowerCase()}/`) ||
        f.startsWith(dirName.toLowerCase() + "/")
    );
  const getFileContentsByName = (filename) =>
    Object.keys(fileContents)
      .filter((p) => p.split("/").pop().toLowerCase() === filename.toLowerCase())
      .map((p) => fileContents[p] || "");
  const parseJson = (text) => {
    try { return JSON.parse(text); } catch { return null; }
  };

  // ── Parse every package.json — collect ALL dependency names ────────────
  const packageJsonDeps = new Set();
  const packageJsonFiles = Object.keys(fileContents).filter(
    (p) => p.split("/").pop().toLowerCase() === "package.json"
  );
  packageJsonFiles.forEach((path) => {
    const pkg = parseJson(fileContents[path] || "{}");
    if (!pkg) return;
    [pkg.dependencies, pkg.devDependencies, pkg.peerDependencies, pkg.optionalDependencies].forEach(
      (group) => {
        if (group && typeof group === "object") {
          Object.keys(group).forEach((dep) => packageJsonDeps.add(dep.toLowerCase()));
        }
      }
    );
  });
  const hasPkgDep = (name) => packageJsonDeps.has(name.toLowerCase());
  const hasPkgDepPrefix = (prefix) =>
    [...packageJsonDeps].some((d) => d.startsWith(prefix.toLowerCase()));

  // ── Parse Python manifests ──────────────────────────────────────────────
  const pythonDeps = new Set();
  getFileContentsByName("requirements.txt").forEach((content) => {
    content.split("\n").forEach((line) => {
      const pkg = line.trim().split(/[=<>!;\s[#]/)[0].toLowerCase();
      if (pkg && !pkg.startsWith("#") && /^[a-z]/.test(pkg)) pythonDeps.add(pkg);
    });
  });
  getFileContentsByName("pyproject.toml").forEach((content) => {
    const matches = content.matchAll(/["']?([\w][\w\-_.]+)["']?\s*[=<>!]/g);
    for (const m of matches) pythonDeps.add(m[1].toLowerCase());
  });
  getFileContentsByName("setup.py").forEach((content) => {
    const matches = content.matchAll(/["']([\w][\w\-_.]+)["']/g);
    for (const m of matches) pythonDeps.add(m[1].toLowerCase());
  });
  getFileContentsByName("Pipfile").concat(getFileContentsByName("pipfile")).forEach((content) => {
    content.split("\n").forEach((line) => {
      const m = line.match(/^([\w][\w\-_.]+)\s*=/);
      if (m) pythonDeps.add(m[1].toLowerCase());
    });
  });
  const hasPyDep = (name) =>
    pythonDeps.has(name.toLowerCase()) ||
    pythonDeps.has(name.toLowerCase().replace(/-/g, "_")) ||
    pythonDeps.has(name.toLowerCase().replace(/_/g, "-"));

  // ── Parse go.mod ────────────────────────────────────────────────────────
  const goModDeps = new Set();
  getFileContentsByName("go.mod").forEach((content) => {
    content.split("\n").forEach((line) => {
      const m = line.trim().match(/^([\w.\-/]+)\s+v[\d.]/);
      if (m) goModDeps.add(m[1].toLowerCase());
    });
  });
  const hasGoDep = (fragment) =>
    [...goModDeps].some((d) => d.includes(fragment.toLowerCase()));

  // ── Parse Cargo.toml ────────────────────────────────────────────────────
  const cargoDeps = new Set();
  getFileContentsByName("Cargo.toml")
    .concat(getFileContentsByName("cargo.toml"))
    .forEach((content) => {
      content.split("\n").forEach((line) => {
        const m = line.match(/^([\w\-_]+)\s*=/);
        if (m) cargoDeps.add(m[1].toLowerCase());
      });
    });
  const hasCargoDep = (name) => cargoDeps.has(name.toLowerCase());

  // ── Pre-join source content for annotation/import scanning ─────────────
  const javaSources = Object.keys(fileContents)
    .filter((p) => p.endsWith(".java"))
    .map((p) => (fileContents[p] || "").toLowerCase())
    .join("\n");

  const pySources = Object.keys(fileContents)
    .filter((p) => p.endsWith(".py"))
    .map((p) => (fileContents[p] || "").toLowerCase())
    .join("\n");

  const goSources = Object.keys(fileContents)
    .filter((p) => p.endsWith(".go"))
    .map((p) => (fileContents[p] || "").toLowerCase())
    .join("\n");

  const gradleContent = getFileContentsByName("build.gradle")
    .concat(getFileContentsByName("build.gradle.kts"))
    .join("\n")
    .toLowerCase();

  const pomContent = getFileContentsByName("pom.xml").join("\n").toLowerCase();

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 1 — Java / JVM  (pom.xml, build.gradle, .java source)
  // ═══════════════════════════════════════════════════════════════════════
  if (hasFile("pom.xml")) {
    addTechnology("Java", "Language/Core", 90, ["pom.xml"]);
    addBuildTool("Maven", 90, ["pom.xml"]);
    if (pomContent.includes("spring-boot") || pomContent.includes("org.springframework.boot"))
      addFramework("Spring Boot", 95, ["pom.xml"]);
    if (pomContent.includes("spring-security") || pomContent.includes("org.springframework.security"))
      addFramework("Spring Security", 92, ["pom.xml"]);
    if (pomContent.includes("spring-data-jpa") || pomContent.includes("data-jpa") || pomContent.includes("hibernate") || pomContent.includes("persistence"))
      addFramework("JPA/Hibernate", 88, ["pom.xml"]);
    if (pomContent.includes("spring-cloud"))
      addFramework("Spring Cloud", 85, ["pom.xml"]);
    if (pomContent.includes("quarkus"))
      addFramework("Quarkus", 92, ["pom.xml"]);
    if (pomContent.includes("micronaut"))
      addFramework("Micronaut", 92, ["pom.xml"]);
    if (pomContent.includes("vertx") || pomContent.includes("vert.x"))
      addFramework("Vert.x", 88, ["pom.xml"]);
    if (pomContent.includes("postgresql") || pomContent.includes("org.postgresql"))
      addTechnology("PostgreSQL", "Database", 90, ["pom.xml"]);
    if (pomContent.includes("mongodb"))
      addTechnology("MongoDB", "Database", 90, ["pom.xml"]);
    if (pomContent.includes("mysql") || pomContent.includes("mariadb"))
      addTechnology("MySQL", "Database", 90, ["pom.xml"]);
    if (pomContent.includes("lombok"))
      addTool("Lombok", 80, ["pom.xml"]);
    if (pomContent.includes("kotlin"))
      addTechnology("Kotlin", "Language/Core", 90, ["pom.xml"]);
    if (pomContent.includes("junit"))
      addTool("JUnit", 80, ["pom.xml"]);
    if (pomContent.includes("graphql"))
      addFramework("GraphQL", 85, ["pom.xml"]);
    if (pomContent.includes("kafka"))
      addTechnology("Apache Kafka", "Messaging", 85, ["pom.xml"]);
    if (pomContent.includes("redis"))
      addTechnology("Redis", "Database", 85, ["pom.xml"]);
  }

  if (hasFile("build.gradle") || hasFile("build.gradle.kts")) {
    addTechnology("Java", "Language/Core", 90, ["build.gradle"]);
    addBuildTool("Gradle", 90, ["build.gradle"]);
    if (/spring[.-]boot/.test(gradleContent) || /org\.springframework\.boot/.test(gradleContent))
      addFramework("Spring Boot", 95, ["build.gradle"]);
    if (/spring[.-]security/.test(gradleContent))
      addFramework("Spring Security", 92, ["build.gradle"]);
    if (/data[.-]jpa|hibernate|persistence/.test(gradleContent))
      addFramework("JPA/Hibernate", 88, ["build.gradle"]);
    if (/quarkus/.test(gradleContent)) addFramework("Quarkus", 92, ["build.gradle"]);
    if (/micronaut/.test(gradleContent)) addFramework("Micronaut", 92, ["build.gradle"]);
    if (/kotlin/.test(gradleContent)) addTechnology("Kotlin", "Language/Core", 90, ["build.gradle"]);
    if (/android/.test(gradleContent)) addFramework("Android", 90, ["build.gradle"]);
    if (/graphql/.test(gradleContent)) addFramework("GraphQL", 85, ["build.gradle"]);
    if (/kafka/.test(gradleContent)) addTechnology("Apache Kafka", "Messaging", 85, ["build.gradle"]);
  }

  if (javaSources) {
    if (/@springbootapplication/.test(javaSources))
      addFramework("Spring Boot", 98, ["@SpringBootApplication"]);
    if (/@restcontroller|@controller|@requestmapping/.test(javaSources))
      addFramework("Spring MVC", 90, ["Spring MVC annotations"]);
    if (/@entity|@repository/.test(javaSources))
      addFramework("JPA/Hibernate", 88, ["JPA annotations"]);
    if (/securityfilterchain|httpsecurity|@enablewebsecurity|@preauthorize/.test(javaSources))
      addFramework("Spring Security", 95, ["Spring Security annotations"]);
    if (/auth0/.test(javaSources)) addTechnology("Auth0", "Security", 85, ["Java source"]);
    if (/keycloak/.test(javaSources)) addTechnology("Keycloak", "Security", 85, ["Java source"]);
    if (/graphqlschema|datafetcher|@querymapping/.test(javaSources))
      addFramework("GraphQL", 85, ["Java source"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 2 — JavaScript / TypeScript / Node.js  (package.json)
  // ═══════════════════════════════════════════════════════════════════════
  if (packageJsonFiles.length > 0) {
    addTechnology("Node.js", "Runtime", 85, ["package.json"]);

    // TypeScript
    if (hasPkgDep("typescript") || hasFile("tsconfig.json"))
      addTechnology("TypeScript", "Language/Core", 92, ["package.json / tsconfig.json"]);

    // ── Frontend frameworks ────────────────────────────────────────────
    if (hasPkgDep("react") || hasPkgDep("react-dom")) {
      addFramework("React", 95, ["package.json"]);
      if (hasPkgDep("next") || hasFile("next.config.js") || hasFile("next.config.mjs") || hasFile("next.config.ts"))
        addFramework("Next.js", 97, ["package.json / next.config.*"]);
      if (hasPkgDep("gatsby")) addFramework("Gatsby", 95, ["package.json"]);
      if (hasPkgDep("@remix-run/react") || hasPkgDep("remix")) addFramework("Remix", 95, ["package.json"]);
      // React Router
      if (hasPkgDep("react-router") || hasPkgDep("react-router-dom"))
        addFramework("React Router", 92, ["package.json"]);
      // State management
      if (hasPkgDep("redux") || hasPkgDep("@reduxjs/toolkit")) addFramework("Redux", 88, ["package.json"]);
      if (hasPkgDep("zustand")) addFramework("Zustand", 88, ["package.json"]);
      if (hasPkgDep("recoil")) addFramework("Recoil", 88, ["package.json"]);
      if (hasPkgDep("jotai")) addFramework("Jotai", 85, ["package.json"]);
      if (hasPkgDep("mobx") || hasPkgDep("mobx-react") || hasPkgDep("mobx-react-lite"))
        addFramework("MobX", 88, ["package.json"]);
      // Data fetching
      if (hasPkgDep("@tanstack/react-query") || hasPkgDep("react-query"))
        addFramework("React Query", 90, ["package.json"]);
      if (hasPkgDep("swr")) addFramework("SWR", 88, ["package.json"]);
      // Forms
      if (hasPkgDep("react-hook-form")) addFramework("React Hook Form", 85, ["package.json"]);
      if (hasPkgDep("formik")) addFramework("Formik", 85, ["package.json"]);
    }

    if (hasPkgDep("@angular/core")) {
      addFramework("Angular", 97, ["package.json"]);
      addTechnology("TypeScript", "Language/Core", 95, ["Angular (TypeScript-first)"]);
      if (hasPkgDep("@angular/router")) addFramework("Angular Router", 92, ["package.json"]);
      if (hasPkgDep("@ngrx/store") || hasPkgDep("@ngrx/effects")) addFramework("NgRx", 88, ["package.json"]);
      if (hasPkgDep("@angular/material")) addFramework("Angular Material", 85, ["package.json"]);
    }

    if (hasPkgDep("vue")) {
      addFramework("Vue", 97, ["package.json"]);
      if (hasPkgDep("nuxt") || hasPkgDep("nuxt3") || hasFile("nuxt.config.ts") || hasFile("nuxt.config.js"))
        addFramework("Nuxt.js", 95, ["package.json / nuxt.config.*"]);
      if (hasPkgDep("vue-router")) addFramework("Vue Router", 92, ["package.json"]);
      if (hasPkgDep("pinia")) addFramework("Pinia", 88, ["package.json"]);
      if (hasPkgDep("vuex")) addFramework("Vuex", 88, ["package.json"]);
    }

    if (hasPkgDep("svelte") || hasPkgDep("@sveltejs/kit")) {
      addFramework("Svelte", 97, ["package.json"]);
      if (hasPkgDep("@sveltejs/kit")) addFramework("SvelteKit", 95, ["package.json"]);
    }

    if (hasPkgDep("solid-js")) addFramework("Solid.js", 95, ["package.json"]);
    if (hasPkgDep("@builder.io/qwik") || hasPkgDep("qwik")) addFramework("Qwik", 92, ["package.json"]);
    if (hasPkgDep("astro")) addFramework("Astro", 95, ["package.json"]);
    if (hasPkgDep("preact")) addFramework("Preact", 92, ["package.json"]);
    if (hasPkgDep("lit") || hasPkgDep("@lit/reactive-element")) addFramework("Lit", 88, ["package.json"]);

    // ── CSS / UI libraries ─────────────────────────────────────────────
    if (hasPkgDep("tailwindcss")) addFramework("Tailwind CSS", 92, ["package.json"]);
    if (hasPkgDep("@mui/material") || hasPkgDep("@material-ui/core")) addFramework("Material UI", 88, ["package.json"]);
    if (hasPkgDep("antd")) addFramework("Ant Design", 88, ["package.json"]);
    if (hasPkgDep("@chakra-ui/react")) addFramework("Chakra UI", 85, ["package.json"]);
    if (hasPkgDep("@mantine/core")) addFramework("Mantine", 85, ["package.json"]);
    if (hasPkgDep("bootstrap")) addFramework("Bootstrap", 85, ["package.json"]);
    if (hasPkgDep("styled-components")) addFramework("Styled Components", 85, ["package.json"]);
    if (hasPkgDep("@emotion/react") || hasPkgDep("@emotion/styled")) addFramework("Emotion CSS", 82, ["package.json"]);
    if (hasPkgDep("framer-motion") || hasPkgDep("motion")) addFramework("Framer Motion", 82, ["package.json"]);
    if (hasPkgDepPrefix("@radix-ui/")) addFramework("Radix UI", 85, ["package.json"]);
    if (hasPkgDep("@shadcn/ui") || hasPkgDep("shadcn")) addFramework("shadcn/ui", 85, ["package.json"]);

    // ── Backend / Server frameworks ────────────────────────────────────
    if (hasPkgDep("express")) addFramework("Express.js", 92, ["package.json"]);
    if (hasPkgDep("@nestjs/core")) addFramework("NestJS", 95, ["package.json"]);
    if (hasPkgDep("fastify")) addFramework("Fastify", 92, ["package.json"]);
    if (hasPkgDep("koa")) addFramework("Koa.js", 90, ["package.json"]);
    if (hasPkgDep("@hapi/hapi") || hasPkgDep("hapi")) addFramework("Hapi.js", 88, ["package.json"]);
    if (hasPkgDep("hono")) addFramework("Hono", 88, ["package.json"]);
    if (hasPkgDep("@trpc/server") || hasPkgDep("@trpc/client")) addFramework("tRPC", 90, ["package.json"]);

    // ── GraphQL ────────────────────────────────────────────────────────
    if (hasPkgDep("graphql")) addFramework("GraphQL", 88, ["package.json"]);
    if (hasPkgDep("@apollo/client") || hasPkgDep("apollo-server") || hasPkgDep("@apollo/server"))
      addFramework("Apollo GraphQL", 90, ["package.json"]);

    // ── Databases / ORMs ──────────────────────────────────────────────
    if (hasPkgDep("prisma") || hasPkgDep("@prisma/client")) addTechnology("Prisma ORM", "Database", 90, ["package.json"]);
    if (hasPkgDep("drizzle-orm")) addTechnology("Drizzle ORM", "Database", 88, ["package.json"]);
    if (hasPkgDep("typeorm")) addTechnology("TypeORM", "Database", 88, ["package.json"]);
    if (hasPkgDep("sequelize")) addTechnology("Sequelize", "Database", 88, ["package.json"]);
    if (hasPkgDep("mongoose") || hasPkgDep("mongodb")) addTechnology("MongoDB", "Database", 90, ["package.json"]);
    if (hasPkgDep("pg") || hasPkgDep("pg-promise")) addTechnology("PostgreSQL", "Database", 88, ["package.json"]);
    if (hasPkgDep("mysql2") || hasPkgDep("mysql")) addTechnology("MySQL", "Database", 88, ["package.json"]);
    if (hasPkgDep("redis") || hasPkgDep("ioredis")) addTechnology("Redis", "Database", 88, ["package.json"]);
    if (hasPkgDep("sqlite3") || hasPkgDep("better-sqlite3")) addTechnology("SQLite", "Database", 85, ["package.json"]);

    // ── Auth ───────────────────────────────────────────────────────────
    if (hasPkgDep("next-auth") || hasPkgDep("@auth/core")) addFramework("NextAuth.js", 90, ["package.json"]);
    if (hasPkgDep("passport")) addFramework("Passport.js", 88, ["package.json"]);
    if (hasPkgDep("jsonwebtoken")) addTechnology("JWT", "Security", 82, ["package.json"]);
    if (hasPkgDep("firebase") || hasPkgDep("firebase-admin")) addTechnology("Firebase", "Backend-as-a-Service", 88, ["package.json"]);
    if (hasPkgDep("@supabase/supabase-js")) addTechnology("Supabase", "Backend-as-a-Service", 90, ["package.json"]);

    // ── Testing ────────────────────────────────────────────────────────
    if (hasPkgDep("jest") || hasPkgDep("@jest/core")) addTool("Jest", 82, ["package.json"]);
    if (hasPkgDep("vitest")) addTool("Vitest", 82, ["package.json"]);
    if (hasPkgDep("cypress")) addTool("Cypress", 82, ["package.json"]);
    if (hasPkgDep("playwright") || hasPkgDep("@playwright/test")) addTool("Playwright", 82, ["package.json"]);
    if (hasPkgDep("@testing-library/react") || hasPkgDep("@testing-library/vue"))
      addTool("Testing Library", 82, ["package.json"]);

    // ── Build / Bundlers ───────────────────────────────────────────────
    if (hasPkgDep("vite") || hasFile("vite.config.js") || hasFile("vite.config.ts") || hasFile("vite.config.mjs"))
      addBuildTool("Vite", 92, ["package.json / vite.config.*"]);
    if (hasPkgDep("webpack") || hasFile("webpack.config.js")) addBuildTool("Webpack", 90, ["package.json"]);
    if (hasPkgDep("rollup") || hasFile("rollup.config.js")) addBuildTool("Rollup", 88, ["package.json"]);
    if (hasPkgDep("esbuild")) addBuildTool("esbuild", 88, ["package.json"]);
    if (hasPkgDep("parcel")) addBuildTool("Parcel", 85, ["package.json"]);
    if (hasPkgDep("turbopack") || hasPkgDep("turbo")) addBuildTool("Turborepo", 85, ["package.json"]);

    // ── Package managers via lock files ────────────────────────────────
    if (hasFile("yarn.lock")) addBuildTool("Yarn", 88, ["yarn.lock"]);
    else if (hasFile("pnpm-lock.yaml")) addBuildTool("pnpm", 88, ["pnpm-lock.yaml"]);
    else if (hasFile("package-lock.json")) addBuildTool("npm", 85, ["package-lock.json"]);

    // ── Linting / Formatting ───────────────────────────────────────────
    if (hasPkgDep("eslint")) addTool("ESLint", 82, ["package.json"]);
    if (hasPkgDep("prettier")) addTool("Prettier", 80, ["package.json"]);
    if (hasPkgDep("@biomejs/biome") || hasPkgDep("biome")) addTool("Biome", 80, ["package.json"]);

    // ── Storybook ──────────────────────────────────────────────────────
    if (hasPkgDep("storybook") || hasPkgDepPrefix("@storybook/"))
      addTool("Storybook", 82, ["package.json"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 3 — Python  (requirements.txt / pyproject.toml / setup.py)
  // ═══════════════════════════════════════════════════════════════════════
  const hasPythonManifest =
    hasFile("requirements.txt") ||
    hasFile("pyproject.toml") ||
    hasFile("setup.py") ||
    hasFile("Pipfile") ||
    hasFile("pipfile");

  if (hasPythonManifest) {
    addTechnology("Python", "Language/Core", 90, ["requirements / pyproject"]);

    // Web frameworks — manifest-first, source-fallback
    if (hasPyDep("django")) addFramework("Django", 95, ["requirements.txt / pyproject.toml"]);
    if (hasPyDep("flask")) addFramework("Flask", 95, ["requirements.txt / pyproject.toml"]);
    if (hasPyDep("fastapi")) addFramework("FastAPI", 95, ["requirements.txt / pyproject.toml"]);
    if (hasPyDep("starlette")) addFramework("Starlette", 88, ["requirements.txt"]);
    if (hasPyDep("tornado")) addFramework("Tornado", 88, ["requirements.txt"]);
    if (hasPyDep("sanic")) addFramework("Sanic", 88, ["requirements.txt"]);
    if (hasPyDep("aiohttp")) addFramework("aiohttp", 85, ["requirements.txt"]);
    if (hasPyDep("litestar") || hasPyDep("starlite")) addFramework("Litestar", 88, ["requirements.txt"]);

    // Data / ML
    if (hasPyDep("pandas")) addFramework("Pandas", 88, ["requirements.txt"]);
    if (hasPyDep("numpy")) addFramework("NumPy", 85, ["requirements.txt"]);
    if (hasPyDep("scikit-learn") || hasPyDep("sklearn")) addFramework("scikit-learn", 88, ["requirements.txt"]);
    if (hasPyDep("tensorflow")) addFramework("TensorFlow", 90, ["requirements.txt"]);
    if (hasPyDep("torch")) addFramework("PyTorch", 90, ["requirements.txt"]);
    if (hasPyDep("keras")) addFramework("Keras", 88, ["requirements.txt"]);
    if (hasPyDep("transformers")) addFramework("HuggingFace Transformers", 90, ["requirements.txt"]);
    if (hasPyDep("langchain") || hasPyDep("langchain-core")) addFramework("LangChain", 92, ["requirements.txt"]);
    if (hasPyDep("celery")) addFramework("Celery", 88, ["requirements.txt"]);

    // ORMs / Databases
    if (hasPyDep("sqlalchemy")) addTechnology("SQLAlchemy", "Database", 88, ["requirements.txt"]);
    if (hasPyDep("psycopg2") || hasPyDep("psycopg2-binary") || hasPyDep("asyncpg"))
      addTechnology("PostgreSQL", "Database", 88, ["requirements.txt"]);
    if (hasPyDep("pymongo") || hasPyDep("motor")) addTechnology("MongoDB", "Database", 88, ["requirements.txt"]);
    if (hasPyDep("redis") || hasPyDep("aioredis")) addTechnology("Redis", "Database", 85, ["requirements.txt"]);
    if (hasPyDep("pymysql") || hasPyDep("mysql-connector-python"))
      addTechnology("MySQL", "Database", 88, ["requirements.txt"]);
    if (hasPyDep("pyjwt") || hasPyDep("python-jose")) addTechnology("JWT", "Security", 80, ["requirements.txt"]);

    // Source-level fallback — only when manifest didn't find the framework
    if (!hasPyDep("django") && pySources && (pySources.includes("from django") || pySources.includes("import django")))
      addFramework("Django", 82, ["Python import"]);
    if (!hasPyDep("flask") && pySources && (pySources.includes("from flask") || pySources.includes("import flask")))
      addFramework("Flask", 82, ["Python import"]);
    if (!hasPyDep("fastapi") && pySources && (pySources.includes("from fastapi") || pySources.includes("import fastapi")))
      addFramework("FastAPI", 82, ["Python import"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 4 — Go  (go.mod)
  // ═══════════════════════════════════════════════════════════════════════
  if (hasFile("go.mod")) {
    addTechnology("Go", "Language/Core", 92, ["go.mod"]);
    if (hasGoDep("gin-gonic/gin")) addFramework("Gin", 95, ["go.mod"]);
    if (hasGoDep("go-chi/chi") || hasGoDep("/chi")) addFramework("Chi", 88, ["go.mod"]);
    if (hasGoDep("labstack/echo")) addFramework("Echo", 92, ["go.mod"]);
    if (hasGoDep("gofiber/fiber")) addFramework("Fiber", 90, ["go.mod"]);
    if (hasGoDep("gorilla/mux")) addFramework("Gorilla Mux", 88, ["go.mod"]);
    if (hasGoDep("gorm.io/gorm") || hasGoDep("jinzhu/gorm")) addTechnology("GORM", "Database", 88, ["go.mod"]);
    if (hasGoDep("jackc/pgx") || hasGoDep("lib/pq")) addTechnology("PostgreSQL", "Database", 88, ["go.mod"]);
    if (hasGoDep("go-redis/redis")) addTechnology("Redis", "Database", 85, ["go.mod"]);
    if (hasGoDep("mongodb/mongo-go-driver")) addTechnology("MongoDB", "Database", 85, ["go.mod"]);
    if (hasGoDep("grpc/grpc-go") || hasGoDep("google.golang.org/grpc")) addFramework("gRPC", 90, ["go.mod"]);
    if (hasGoDep("urfave/cli") || hasGoDep("spf13/cobra")) addFramework("CLI Framework", 80, ["go.mod"]);
    // Source-level fallback
    if (!hasGoDep("gin-gonic/gin") && goSources.includes("gin-gonic/gin"))
      addFramework("Gin", 82, ["Go source"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 5 — Rust  (Cargo.toml)
  // ═══════════════════════════════════════════════════════════════════════
  if (hasFile("Cargo.toml") || hasFile("cargo.toml")) {
    addTechnology("Rust", "Language/Core", 92, ["Cargo.toml"]);
    if (hasCargoDep("actix-web")) addFramework("Actix Web", 95, ["Cargo.toml"]);
    if (hasCargoDep("axum")) addFramework("Axum", 93, ["Cargo.toml"]);
    if (hasCargoDep("warp")) addFramework("Warp", 88, ["Cargo.toml"]);
    if (hasCargoDep("rocket")) addFramework("Rocket", 92, ["Cargo.toml"]);
    if (hasCargoDep("tide")) addFramework("Tide", 85, ["Cargo.toml"]);
    if (hasCargoDep("tokio")) addTechnology("Tokio (async runtime)", "Runtime", 88, ["Cargo.toml"]);
    if (hasCargoDep("sqlx")) addTechnology("SQLx", "Database", 88, ["Cargo.toml"]);
    if (hasCargoDep("diesel")) addTechnology("Diesel ORM", "Database", 88, ["Cargo.toml"]);
    if (hasCargoDep("sea-orm")) addTechnology("SeaORM", "Database", 85, ["Cargo.toml"]);
    if (hasCargoDep("serde") || hasCargoDep("serde_json")) addTechnology("Serde", "Serialization", 82, ["Cargo.toml"]);
    if (hasCargoDep("tonic")) addFramework("gRPC (Tonic)", 88, ["Cargo.toml"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 6 — Ruby  (Gemfile)
  // ═══════════════════════════════════════════════════════════════════════
  if (hasFile("Gemfile") || hasFile("gemfile")) {
    addTechnology("Ruby", "Language/Core", 90, ["Gemfile"]);
    const gemContent = getFileContentsByName("Gemfile")
      .concat(getFileContentsByName("gemfile"))
      .join("\n")
      .toLowerCase();
    if (gemContent.includes("rails")) addFramework("Ruby on Rails", 95, ["Gemfile"]);
    if (gemContent.includes("sinatra")) addFramework("Sinatra", 90, ["Gemfile"]);
    if (gemContent.includes("hanami")) addFramework("Hanami", 88, ["Gemfile"]);
    if (gemContent.includes("grape")) addFramework("Grape API", 85, ["Gemfile"]);
    if (gemContent.includes("activerecord") || gemContent.includes("sequel"))
      addTechnology("ActiveRecord/ORM", "Database", 85, ["Gemfile"]);
    if (gemContent.includes("pg") || gemContent.includes("postgresql"))
      addTechnology("PostgreSQL", "Database", 88, ["Gemfile"]);
    if (gemContent.includes("redis")) addTechnology("Redis", "Database", 85, ["Gemfile"]);
    if (gemContent.includes("sidekiq")) addFramework("Sidekiq", 85, ["Gemfile"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 7 — PHP  (composer.json)
  // ═══════════════════════════════════════════════════════════════════════
  if (hasFile("composer.json")) {
    addTechnology("PHP", "Language/Core", 90, ["composer.json"]);
    const composerPkgs = new Set();
    getFileContentsByName("composer.json").forEach((content) => {
      const pkg = parseJson(content);
      if (!pkg) return;
      Object.keys(pkg.require || {}).forEach((dep) => composerPkgs.add(dep.toLowerCase()));
      Object.keys(pkg["require-dev"] || {}).forEach((dep) => composerPkgs.add(dep.toLowerCase()));
    });
    const hasComposerDep = (fragment) =>
      [...composerPkgs].some((d) => d.includes(fragment.toLowerCase()));
    if (hasComposerDep("laravel/framework")) addFramework("Laravel", 97, ["composer.json"]);
    if (hasComposerDep("symfony/framework-bundle") || hasComposerDep("symfony/symfony"))
      addFramework("Symfony", 95, ["composer.json"]);
    if (hasComposerDep("slim/slim")) addFramework("Slim", 90, ["composer.json"]);
    if (hasComposerDep("cakephp")) addFramework("CakePHP", 90, ["composer.json"]);
    if (hasComposerDep("doctrine/orm") || hasComposerDep("illuminate/database"))
      addTechnology("ORM", "Database", 82, ["composer.json"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 8 — .NET / C#  (*.csproj, *.sln)
  // ═══════════════════════════════════════════════════════════════════════
  const csprojFiles = Object.keys(fileContents).filter((p) => p.endsWith(".csproj"));
  const hasSln = [...fileSet].some((f) => f.endsWith(".sln"));
  if (csprojFiles.length > 0 || hasSln || hasFile("global.json")) {
    addTechnology("C#", "Language/Core", 90, ["*.csproj"]);
    addTechnology(".NET", "Runtime", 90, ["*.csproj"]);
    const csprojContent = csprojFiles
      .map((p) => (fileContents[p] || ""))
      .join("\n")
      .toLowerCase();
    if (csprojContent.includes("microsoft.aspnetcore"))
      addFramework("ASP.NET Core", 95, ["*.csproj"]);
    if (csprojContent.includes("microsoft.entityframeworkcore"))
      addFramework("Entity Framework Core", 90, ["*.csproj"]);
    if (csprojContent.includes("blazor") || csprojContent.includes("microsoft.aspnetcore.components"))
      addFramework("Blazor", 92, ["*.csproj"]);
    if (csprojContent.includes("maui")) addFramework(".NET MAUI", 90, ["*.csproj"]);
    if (csprojContent.includes("xunit") || csprojContent.includes("nunit") || csprojContent.includes("mstest"))
      addTool("Unit Testing (.NET)", 80, ["*.csproj"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 9 — Dart / Flutter  (pubspec.yaml)
  // ═══════════════════════════════════════════════════════════════════════
  if (hasFile("pubspec.yaml")) {
    addTechnology("Dart", "Language/Core", 90, ["pubspec.yaml"]);
    const pubspecContent = getFileContentsByName("pubspec.yaml").join("\n").toLowerCase();
    if (pubspecContent.includes("flutter")) addFramework("Flutter", 97, ["pubspec.yaml"]);
    if (pubspecContent.includes("provider") || pubspecContent.includes("riverpod") || pubspecContent.includes("bloc"))
      addFramework("Flutter State Management", 82, ["pubspec.yaml"]);
  }

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 10 — Infrastructure / DevOps
  // ═══════════════════════════════════════════════════════════════════════
  if (hasFile("dockerfile") || hasFile("Dockerfile"))
    addTechnology("Docker", "Infrastructure", 85, ["Dockerfile"]);
  if (hasFile("docker-compose.yml") || hasFile("docker-compose.yaml"))
    addTechnology("Docker Compose", "Infrastructure", 85, ["docker-compose.yml"]);
  if ([...fileSet].some((f) => f.includes(".github/workflows/")))
    addTool("GitHub Actions", 85, [".github/workflows/"]);
  if (hasFile(".gitlab-ci.yml")) addTool("GitLab CI", 85, [".gitlab-ci.yml"]);
  if (hasFile("jenkinsfile") || hasFile("Jenkinsfile")) addTool("Jenkins", 85, ["Jenkinsfile"]);
  if (hasFile("serverless.yml") || hasFile("serverless.yaml"))
    addTool("Serverless Framework", 85, ["serverless.yml"]);
  if ([...fileSet].some((f) => f.endsWith(".tf"))) addTool("Terraform", 88, ["*.tf"]);
  if (
    hasFile("kubernetes.yml") ||
    hasFile("kubernetes.yaml") ||
    [...fileSet].some((f) => f.includes("k8s/"))
  )
    addTool("Kubernetes", 88, ["k8s/ manifests"]);

  // ═══════════════════════════════════════════════════════════════════════
  // SECTION 11 — Architecture heuristics (unchanged from original)
  // ═══════════════════════════════════════════════════════════════════════
  const pkgJsonCount = filePaths.filter((p) => p.endsWith("package.json")).length;
  const pomCount = filePaths.filter((p) => p.endsWith("pom.xml")).length;
  const goModCount = filePaths.filter((p) => p.endsWith("go.mod")).length;

  if (
    hasFile("pnpm-workspace.yaml") ||
    hasFile("lerna.json") ||
    (pkgJsonCount > 1 && (hasDir("packages") || hasDir("apps")))
  )
    architecturePatterns = ["Monorepo"];
  else if (
    (pomCount > 2 && (hasDir("services") || hasDir("microservices"))) ||
    goModCount > 2 ||
    (pkgJsonCount > 2 && hasDir("services"))
  )
    architecturePatterns = ["Microservices"];
  else if (
    hasDir("models") && hasDir("controllers") && (hasDir("views") || hasDir("templates"))
  )
    architecturePatterns = ["Model-View-Controller (MVC)"];
  else if (
    (hasDir("domain") && hasDir("infrastructure") && hasDir("application")) ||
    (hasDir("service") && hasDir("repository") && (hasDir("controller") || hasDir("api")))
  )
    architecturePatterns = ["Layered Architecture"];
  else if (hasDir("ports") && hasDir("adapters") && hasDir("domain"))
    architecturePatterns = ["Hexagonal Architecture"];
  else if (
    hasFile("serverless.yml") ||
    hasFile("netlify.toml") ||
    hasFile("vercel.json") ||
    hasDir("functions")
  )
    architecturePatterns = ["Serverless"];

  const technologyStack = Array.from(stackMap.values()).sort((a, b) => b.confidence - a.confidence);

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
    if (hasDep("next") || hasTech("Next.js") || hasFile("next.config.js") || hasFile("next.config.mjs") || hasFile("next.config.ts")) candidateTechs.push("Next.js");
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
    if (hasTech("Spring Boot")) candidateTechs.push("Spring Boot");
    if (hasTech("FastAPI") || hasReq('fastapi')) candidateTechs.push("FastAPI");
    if (hasTech("Django") || hasReq('django')) candidateTechs.push("Django");
    if (hasTech("Flask") || hasReq('flask')) candidateTechs.push("Flask");
    if (hasTech("Gin")) candidateTechs.push("Gin");
    if (hasTech("Echo")) candidateTechs.push("Echo");
    if (hasTech("Actix-web") || hasTech("Actix Web")) candidateTechs.push("Actix Web");
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
      else if (techObjs.some(t => /django/i.test(t.name))) label = 'Django Backend';
      else if (techObjs.some(t => /fastapi/i.test(t.name))) label = 'FastAPI Backend';
      else if (techObjs.some(t => /flask/i.test(t.name))) label = 'Flask Backend';
      else if (techObjs.some(t => /gin/i.test(t.name))) label = 'Gin Go Server';
      else if (techObjs.some(t => /actix/i.test(t.name))) label = 'Actix Rust Server';
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

