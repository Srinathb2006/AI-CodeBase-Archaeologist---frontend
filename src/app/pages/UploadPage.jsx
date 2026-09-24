import { useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { Card, CardHeader, CardTitle, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Upload, Github, Loader, AlertTriangle, CheckCircle } from "lucide-react";
import { motion } from "motion/react";
import JSZip from "jszip";

import { parseGitHubUrl } from "../services/githubService";
import { uploadRepositoryZip, importGitHubRepository } from "../services/storageService";

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

    setUploading(true);
    setErrorMsg("");
    setDuplicateWarning("");

    const { owner, repo } = parsed;

    try {
      setCurrentStep(0);
      setProgressText(`Connecting to GitHub and validating repository ${owner}/${repo}...`);

      setCurrentStep(1);
      setProgressText(`Downloading repository archive for ${owner}/${repo} from GitHub...`);

      const savedRepo = await importGitHubRepository(repoName.trim(), repo);

      setCurrentStep(2);
      setProgressText("Spring Repository Service is extracting files...");

      setCurrentStep(3);
      setProgressText("Repository metadata and file structure stored in PostgreSQL.");

      setCurrentStep(4);
      setProgressText("Indexing repository chunks for RAG AI analysis...");

      setCurrentStep(5);
      setProgressText("Opening repository overview...");

      setTimeout(() => navigate(`/repositories/${savedRepo.id}`), 700);
    } catch (error) {
      console.error("GitHub import failed:", error);
      setErrorMsg(`GitHub import failed: ${error.message || "Unable to import GitHub repository."}`);
      setUploading(false);
    }
  };

  // Steps matching the progress values
  const stepsList = [
    "Establishing connection...",
    "Retrieving repository archive...",
    "Extracting repository files...",
    "Indexing file structure...",
    "Preparing RAG AI context...",
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
              <span><strong>GitHub Connect:</strong> Connect public GitHub repositories directly by URL or path. The backend streams the archive, extracts code structure, and runs RAG indexing.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
              <span><strong>Folder Upload:</strong> The browser packages your selected folder into a ZIP and sends it to the backend Repository Service.</span>
            </li>
            <li className="flex items-start gap-2">
              <CheckCircle className="w-4 h-4 text-emerald-500 mt-0.5" />
              <span><strong>AI Analysis & RAG:</strong> Summaries, architectural analysis, Code Explorer, and AI chat use indexed codebase chunks stored in PostgreSQL.</span>
            </li>
          </ul>
        </CardContent>
      </Card>
    </div>
  );
}
