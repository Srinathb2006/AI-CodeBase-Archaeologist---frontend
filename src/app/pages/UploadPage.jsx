import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Upload, Github, CheckCircle, Loader, AlertTriangle } from "lucide-react";
import { motion } from "motion/react";
import JSZip from "jszip";

import { parseGitHubUrl, fetchRepoMetadata, fetchRepoLanguages, fetchRepoTree } from "../services/githubService";
import { analyzeZipFile } from "../services/zipAnalyzer";
import { analyzeFolderFiles } from "../services/folderAnalyzer";
import { analyzeRepository, detectCodebaseArchitecture } from "../services/repoAnalyzer";
import { generateRepoSummary } from "../services/geminiService";
import { uploadRepositoryZip } from "../services/storageService";
import { getLanguageColor } from "../services/languageColors";

export function UploadPage() {
  const [uploadMethod, setUploadMethod] = useState(null);
  const [uploading, setUploading] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [progressText, setProgressText] = useState("");
  const [repoName, setRepoName] = useState("");
  const [selectedFile, setSelectedFile] = useState(null);
  const [selectedFolderFiles, setSelectedFolderFiles] = useState([]);
  const [duplicateWarning, setDuplicateWarning] = useState("");
  const [errorMsg, setErrorMsg] = useState("");
  
  const fileInputRef = useRef(null);
  const folderInputRef = useRef(null);
  const navigate = useNavigate();

  const handleSetUploadMethod = (method) => {
    setUploadMethod(method);
    setRepoName("");
    setSelectedFile(null);
    setSelectedFolderFiles([]);
    setDuplicateWarning("");
    setErrorMsg("");

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
    if (folderInputRef.current) {
      folderInputRef.current.value = "";
    }
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      const baseName = file.name.replace(/\.[^/.]+$/, "");
      setRepoName(baseName);
    }
  };

  const handleFolderSelect = (e) => {
    const files = Array.from(e.target.files || []).filter(Boolean);
    if (files.length === 0) return;

    setSelectedFolderFiles(files);
    const firstPath = files[0].webkitRelativePath || files[0].relativePath || files[0].name;
    const baseName = firstPath.includes("/") ? firstPath.split("/")[0] : files[0].name.replace(/\.[^/.]+$/, "");
    setRepoName(baseName);
  };

  const triggerFileSelect = (e) => {
    e.stopPropagation();
    fileInputRef.current?.click();
  };

  const triggerFolderSelect = (e) => {
    e.stopPropagation();
    folderInputRef.current?.click();
  };

  // 1. ZIP File Upload and Extraction Flow
  const handleStartZipUpload = async (e) => {
    e.stopPropagation();
    if (!selectedFile || !repoName.trim()) return;

    setUploading(true);
    setErrorMsg("");
    setDuplicateWarning("");
    
    try {
      setCurrentStep(0);
      setProgressText("Uploading ZIP repository to backend...");

      setCurrentStep(1);
      setProgressText("Spring Repository Service is extracting and indexing files...");

      const savedRepo = await uploadRepositoryZip(selectedFile, repoName);

      setCurrentStep(2);
      setProgressText("Repository metadata and file structure stored in PostgreSQL.");

      setCurrentStep(3);
      setProgressText("Preparing repository workspace for AI analysis...");

      setCurrentStep(4);
      setProgressText("Upload complete.");

      setCurrentStep(5);
      setProgressText("Opening repository overview...");

      setTimeout(() => navigate(`/repositories/${savedRepo.id}`), 700);
    } catch (error) {
      console.error("ZIP analysis failed:", error);
      setErrorMsg(`ZIP upload failed: ${error.message || "Invalid or corrupt ZIP file."}`);
      setUploading(false);
    }
  };

  const handleStartFolderUpload = async (e) => {
    e.stopPropagation();
    if (selectedFolderFiles.length === 0 || !repoName.trim()) return;

    setUploading(true);
    setErrorMsg("");
    setDuplicateWarning("");

    try {
      setCurrentStep(0);
      setProgressText("Reading folder contents and compiling file list...");

      setCurrentStep(1);
      setProgressText("Packaging selected folder into a ZIP archive...");

      const zip = new JSZip();
      selectedFolderFiles.forEach((file) => {
        zip.file(file.webkitRelativePath || file.name, file);
      });
      const blob = await zip.generateAsync({ type: "blob" });
      const zipFile = new File([blob], `${repoName.trim()}.zip`, { type: "application/zip" });
      
      setCurrentStep(2);
      setProgressText("Uploading packaged folder to backend...");

      const savedRepo = await uploadRepositoryZip(zipFile, repoName);

      setCurrentStep(3);
      setProgressText("Spring Repository Service is extracting and indexing files...");
      
      setCurrentStep(4);
      setProgressText("Repository metadata and file structure stored in PostgreSQL.");

      setCurrentStep(5);
      setProgressText("Opening repository overview...");

      setTimeout(() => navigate(`/repositories/${savedRepo.id}`), 700);
    } catch (error) {
      console.error("Folder analysis failed:", error);
      setErrorMsg(`Folder upload failed: ${error.message || "Unable to upload selected folder."}`);
      setUploading(false);
    }
  };

  // 2. GitHub API Import Flow
  const handleGithubConnect = async (e) => {
    e.stopPropagation();
    if (!repoName.trim()) return;

    const parsed = parseGitHubUrl(repoName);
    if (!parsed) {
      setErrorMsg("Invalid GitHub repository. Please enter in 'owner/repo' format or paste the full GitHub URL.");
      return;
    }

    setErrorMsg("Backend integration currently supports ZIP and folder uploads. Download the GitHub repository as a ZIP and upload it here.");
    return;

    setUploading(true);
    setErrorMsg("");
    setDuplicateWarning("");

    const { owner, repo } = parsed;

    try {
      setCurrentStep(0);
      setProgressText(`Connecting to GitHub API and fetching ${owner}/${repo} metadata...`);
      const metadata = await fetchRepoMetadata(owner, repo);

      setCurrentStep(1);
      setProgressText("Retrieving repository language byte statistics...");
      const languages = await fetchRepoLanguages(owner, repo);

      setCurrentStep(2);
      setProgressText("Downloading directory file tree structure (recursive)...");
      const treeData = await fetchRepoTree(owner, repo, metadata.default_branch);

      setCurrentStep(3);
      setProgressText("Scanning repository files for frameworks and tools...");
      
      // Since GitHub tree is flat paths, compile mock fileContents for key configuration files
      // We don't download all files (to avoid rate limiting), but we can fetch specific key files if they exist in tree!
      const fileContents = {};
      const keyFileNames = [
        "package.json", "pom.xml", "build.gradle", "build.gradle.kts",
        "requirements.txt", "go.mod", "Cargo.toml", "Dockerfile",
        "docker-compose.yml", "docker-compose.yaml", "application.properties",
        "application.yml", "tsconfig.json", "vite.config.js", "vite.config.ts"
      ];

      const keyFilesToFetch = treeData.tree.filter((node) => {
        if (node.type !== "blob") return false;
        const filename = node.path.split("/").pop();
        return keyFileNames.includes(filename.toLowerCase());
      });

      if (keyFilesToFetch.length > 0) {
        setProgressText(`Fetching ${keyFilesToFetch.length} configuration file contents for deep analysis...`);
        const limitFiles = keyFilesToFetch.slice(0, 6);
        for (const fileNode of limitFiles) {
          try {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${metadata.default_branch}/${fileNode.path}`;
            const res = await fetch(rawUrl);
            if (res.ok) {
              fileContents[fileNode.path] = await res.text();
            }
          } catch (fetchError) {
            console.warn(`Failed to fetch key file contents: ${fileNode.path}`, fetchError);
          }
        }
      }

      // After config files, also fetch a few source files (up to 20) for deeper analysis.
      // Prioritize files in the repository root and src/ folder.
      const sourceExtensions = [
        "js", "jsx", "ts", "tsx", "py", "java", "go", "rb", "php",
        "c", "cpp", "cs", "swift", "kt", "kts", "dart", "rs", "scala",
      ];
      const sourceFiles = treeData.tree.filter((node) => {
        if (node.type !== "blob") return false;
        const ext = node.path.split('.').pop().toLowerCase();
        return sourceExtensions.includes(ext);
      });
      // Sort by proximity to root and then alphabetically
      sourceFiles.sort((a, b) => {
        const depthA = a.path.split('/').length;
        const depthB = b.path.split('/').length;
        return depthA - depthB || a.path.localeCompare(b.path);
      });
      const sourceFilesToFetch = sourceFiles.slice(0, 20);
      if (sourceFilesToFetch.length > 0) {
        setProgressText(`Fetching ${sourceFilesToFetch.length} source file contents for deep analysis...`);
        for (const fileNode of sourceFilesToFetch) {
          try {
            const rawUrl = `https://raw.githubusercontent.com/${owner}/${repo}/${metadata.default_branch}/${fileNode.path}`;
            const res = await fetch(rawUrl);
            if (res.ok) {
              const text = await res.text();
              // Guard against very large files; limit to 80KB
              fileContents[fileNode.path] = text.length > 80000 ? text.substring(0, 80000) : text;
            }
          } catch (fetchError) {
            console.warn(`Failed to fetch source file: ${fileNode.path}`, fetchError);
          }
        }
      }
      setCurrentStep(4);
      // Now that we have fileContents, run the repository analyzer
      setProgressText("Scanning files for frameworks, tools, and architecture patterns...");
      const techAnalysis = analyzeRepository(treeData.tree, fileContents);

      setProgressText("Generating AI architectural summary with Gemini...");
      
      let aiSummary = null;
      try {
        const fullRepoData = {
          metadata: { name: metadata.name, description: metadata.description },
          languages: languages,
          technologies: techAnalysis.technologies,
          frameworks: techAnalysis.frameworks,
          architecturePatterns: techAnalysis.architecturePatterns,
          fileCount: treeData.tree.length,
          fileTree: treeData.tree
        };
        aiSummary = await generateRepoSummary(fullRepoData);
      } catch (aiError) {
        console.warn("AI Summarization failed, using fallback summary:", aiError);
        aiSummary = {
          repositorySummary: metadata.description || `GitHub repository ${owner}/${repo}.`,
          architectureOverview: `Detected technologies: ${techAnalysis.technologies.join(", ") || "None"}. Architecture pattern inferred: ${techAnalysis.architecturePatterns.join(", ")}.`,
          insights: [
            {
              title: "Import Successful",
              description: `Successfully connected and loaded ${treeData.tree.length} codebase records from GitHub.`,
              status: "success"
            },
            {
              title: "Gemini AI Unavailable",
              description: `Could not retrieve live AI summary (${aiError.message || "Key missing"}). Default layout analysis is active.`,
              status: "warning"
            }
          ],
          suggestions: [
            "Configure your VITE_GEMINI_API_KEY in the .env file to enable AI-powered summaries.",
            "Verify dependencies and configurations in the file tree."
          ]
        };
      }

      setCurrentStep(5);
      setProgressText("Writing repository package data to localStorage...");

      const newRepoId = `github-${metadata.id}`;
      const enrichedRepo = {
        id: newRepoId,
        name: metadata.name,
        owner: owner,
        description: metadata.description || "No description provided.",
        language: languages[0]?.name || metadata.language || "Unknown",
        files: treeData.tree.length,
        lastAnalyzed: new Date().toLocaleString(),
        status: "completed",
        languages: languages.map((lang) => ({
          name: lang.name,
          value: lang.percentage,
          bytes: lang.bytes,
          color: getLanguageColor(lang.name)
        })),
        technologies: techAnalysis.technologies,
        frameworks: techAnalysis.frameworks,
        buildTools: techAnalysis.buildTools,
        tools: techAnalysis.tools,
        architecturePatterns: techAnalysis.architecturePatterns,
        architecture: detectCodebaseArchitecture(treeData.tree, fileContents, techAnalysis),
        fileTree: treeData.tree,
        fileContents,
        aiSummary,
        stars: metadata.stargazers_count,
        forks: metadata.forks_count,
        watchers: metadata.watchers_count,
        defaultBranch: metadata.default_branch,
        type: "github"
      };

      console.log(`[UploadPage] GitHub: Saving repo "${metadata.name}" with ${Object.keys(fileContents).length} fileContents entries`);
      await addRepository(enrichedRepo);
      setTimeout(() => navigate(`/repositories/${newRepoId}`), 1000);
    } catch (error) {
      console.error("GitHub import failed:", error);
      setErrorMsg(`GitHub import failed: ${error.message}`);
      setUploading(false);
    }
  };

  // Steps matching the progress values
  const stepsList = [
    "Establishing connection...",
    "Uploading repository package...",
    "Extracting repository files...",
    "Indexing file structure...",
    "Preparing AI context...",
    "Opening repository..."
  ];

  return (
    <div className="max-w-5xl mx-auto space-y-8">
      <div className="text-center">
        <h1 className="text-4xl font-bold mb-4 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">Upload Repository</h1>
        <p className="text-xl text-muted-foreground">
          Choose how you want to upload your codebase for analysis
        </p>
      </div>

      {errorMsg && (
        <motion.div
          initial={{ opacity: 0, y: -8 }}
          animate={{ opacity: 1, y: 0 }}
          className="flex items-start gap-3 bg-red-500/10 border border-red-500/30 text-red-400 rounded-xl px-4 py-3 text-sm"
        >
          <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-semibold block mb-0.5">Analysis Failed</span>
            <span>{errorMsg}</span>
          </div>
          <button
            onClick={() => setErrorMsg("")}
            className="text-red-400/60 hover:text-red-400 transition-colors shrink-0"
          >
            ✕
          </button>
        </motion.div>
      )}

      {!uploading ? (
        <div className="grid md:grid-cols-3 gap-6">
          {/* ZIP Upload Card */}
          <Card
            className={`cursor-pointer hover:border-primary/50 transition-all ${
              uploadMethod === "zip" ? "border-primary bg-primary/5" : ""
            }`}
            onClick={() => handleSetUploadMethod("zip")}
          >
            <CardContent className="pt-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Upload ZIP</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload a compressed repository file
              </p>
              {uploadMethod === "zip" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 mt-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    id="upload-zip-file"
                    name="zipFile"
                    type="file"
                    ref={fileInputRef}
                    accept=".zip"
                    onChange={handleFileSelect}
                    className="hidden"
                  />

                  {!selectedFile ? (
                    <Button className="w-full cursor-pointer" onClick={triggerFileSelect}>
                      Choose ZIP File
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 break-all text-center">
                        Selected: {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                      </div>
                      <div className="space-y-1.5 text-left">
                        <label htmlFor="zip-repo-name" className="text-xs text-slate-400 font-medium pl-1">Repository Name</label>
                        <Input
                          id="zip-repo-name"
                          name="repoName"
                          placeholder="My Awesome App"
                          value={repoName}
                          onChange={(e) => setRepoName(e.target.value)}
                        />
                      </div>
                      <Button className="w-full cursor-pointer" onClick={handleStartZipUpload} disabled={!repoName.trim()}>
                        Upload and Analyze
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* GitHub Connect Card */}
          <Card
            className={`cursor-pointer hover:border-primary/50 transition-all ${
              uploadMethod === "github" ? "border-primary bg-primary/5" : ""
            }`}
            onClick={() => handleSetUploadMethod("github")}
          >
            <CardContent className="pt-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Github className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Connect GitHub</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Import directly from GitHub repository
              </p>
              {uploadMethod === "github" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-3 mt-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="space-y-1.5 text-left">
                    <label htmlFor="github-repo-name" className="text-xs text-slate-400 font-medium pl-1">Repository Path or URL</label>
                    <Input
                      id="github-repo-name"
                      name="repoName"
                      placeholder="owner/repo-name or full URL"
                      value={repoName}
                      onChange={(e) => setRepoName(e.target.value)}
                    />
                  </div>
                  <Button className="w-full gap-2 cursor-pointer" onClick={handleGithubConnect} disabled={!repoName.trim()}>
                    <Github className="w-4 h-4" />
                    Connect
                  </Button>
                </motion.div>
              )}
            </CardContent>
          </Card>

          {/* Folder Upload Card */}
          <Card
            className={`cursor-pointer hover:border-primary/50 transition-all ${
              uploadMethod === "folder" ? "border-primary bg-primary/5" : ""
            }`}
            onClick={() => handleSetUploadMethod("folder")}
          >
            <CardContent className="pt-6 text-center">
              <div className="w-16 h-16 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
                <Upload className="w-8 h-8 text-primary" />
              </div>
              <h3 className="font-semibold mb-2">Upload Folder</h3>
              <p className="text-sm text-muted-foreground mb-4">
                Upload an entire local project directory
              </p>
              {uploadMethod === "folder" && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="space-y-4 mt-4"
                  onClick={(e) => e.stopPropagation()}
                >
                  <input
                    id="upload-folder-input"
                    name="folderFiles"
                    type="file"
                    ref={folderInputRef}
                    webkitdirectory=""
                    directory=""
                    multiple
                    onChange={handleFolderSelect}
                    className="hidden"
                  />

                  {selectedFolderFiles.length === 0 ? (
                    <Button className="w-full cursor-pointer" onClick={triggerFolderSelect}>
                      Choose Folder
                    </Button>
                  ) : (
                    <div className="space-y-3">
                      <div className="text-xs text-emerald-400 bg-emerald-500/10 p-2.5 rounded-xl border border-emerald-500/20 break-all text-center">
                        Selected: {selectedFolderFiles.length} files
                      </div>
                      <div className="space-y-1.5 text-left">
                        <label htmlFor="folder-repo-name" className="text-xs text-slate-400 font-medium pl-1">Repository Name</label>
                        <Input
                          id="folder-repo-name"
                          name="repoName"
                          placeholder="My Awesome App"
                          value={repoName}
                          onChange={(e) => setRepoName(e.target.value)}
                        />
                      </div>
                      <Button className="w-full cursor-pointer" onClick={handleStartFolderUpload} disabled={!repoName.trim()}>
                        Upload and Analyze Folder
                      </Button>
                    </div>
                  )}
                </motion.div>
              )}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="max-w-2xl mx-auto" glass="true">
          <CardContent className="pt-6">
            <div className="text-center">
              <motion.div
                className="w-20 h-20 rounded-full bg-primary/10 flex items-center justify-center mx-auto mb-6"
                animate={{ rotate: 360 }}
                transition={{
                  duration: 3,
                  repeat: Infinity,
                  ease: "linear",
                }}
              >
                <Loader className="w-10 h-10 text-primary" />
              </motion.div>

              <h3 className="text-2xl font-bold mb-2">Analyzing Repository</h3>
              <p className="text-muted-foreground mb-6">
                Please wait while we perform real codebase archaeology on "{repoName}"
              </p>

              <div className="max-w-md mx-auto mb-6 text-left space-y-4">
                <div className="bg-[#03030b] border border-white/10 rounded-xl p-4 space-y-3 font-mono text-xs">
                  {stepsList.map((stepLabel, idx) => {
                    let statusColor = "text-slate-500";
                    let prefix = "○";
                    if (idx < currentStep) {
                      statusColor = "text-emerald-400";
                      prefix = "✓";
                    } else if (idx === currentStep) {
                      statusColor = "text-primary font-bold";
                      prefix = "▶";
                    }
                    return (
                      <div key={idx} className={`flex items-center gap-3 transition-colors duration-300 ${statusColor}`}>
                        <span>{prefix}</span>
                        <span>{stepLabel}</span>
                      </div>
                    );
                  })}
                </div>

                <div className="w-full bg-muted rounded-full h-2 overflow-hidden">
                  <div
                    className="h-full bg-gradient-to-r from-primary via-secondary to-accent transition-all duration-500"
                    style={{ width: `${(currentStep / 5) * 100}%` }}
                  />
                </div>
                <div className="text-xs text-muted-foreground text-center">
                  Current: {progressText}
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle>Analysis Details</CardTitle>
        </CardHeader>
        <CardContent>
          <ul className="space-y-2 text-sm text-muted-foreground">
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
              <span><strong>Backend Repository Service:</strong> ZIP uploads are sent to Spring Boot, extracted safely, analyzed, and stored in PostgreSQL.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
              <span><strong>GitHub Connect:</strong> Server-side GitHub import is not enabled yet. Download a GitHub repository as a ZIP and upload it here.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
              <span><strong>Folder Upload:</strong> The browser packages your selected folder into a ZIP and sends it to the backend Repository Service.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
              <span><strong>AI Analysis Service:</strong> Summaries, architecture explanations, documentation, and chat use the backend AI provider configuration.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
