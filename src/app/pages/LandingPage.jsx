import { Link } from "react-router-dom";
import { Button } from "../components/Button";
import {
  Sparkles,
  Network,
  FileSearch,
  Database,
  Code,
  Zap,
  Star,
} from "lucide-react";

export function LandingPage() {
  return (
    <div
      className="min-h-screen bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-50"
      style={{ color: "#1e293b" }}
    >
      {/* Hero Section */}
      <section className="relative overflow-hidden">
        <div className="absolute inset-0 bg-gradient-to-br from-purple-200/40 via-blue-200/40 to-indigo-200/40 blur-3xl" />
        <div className="relative max-w-7xl mx-auto px-6 py-24 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-100 border border-purple-200 mb-8">
            <Sparkles className="w-4 h-4 text-purple-600" />
            <span className="text-sm text-purple-700 font-medium">
              AI-Powered Repository Analysis
            </span>
          </div>

          <h1 className="text-5xl md:text-7xl font-bold mb-6 bg-gradient-to-r from-primary via-secondary to-accent bg-clip-text text-transparent">
            Understand Any Codebase
            <br />
            in Minutes
          </h1>

          <p className="text-xl text-slate-600 max-w-3xl mx-auto mb-12">
            Unearth the secrets of any codebase with AI-powered analysis. Upload
            a repository and let our intelligent archaeologist reveal
            architecture, dependencies, and insights.
          </p>

          <div className="flex items-center justify-center gap-4 mb-16">
            <Link to="/upload">
              <Button size="lg" className="gap-2">
                <Upload className="w-5 h-5" />
                Analyze Repository
              </Button>
            </Link>

          </div>

          {/* Hero Illustration */}
          <div className="relative max-w-5xl mx-auto">
            <div className="bg-white/80 backdrop-blur-xl border border-purple-200/50 rounded-2xl p-8 shadow-xl">
              <div className="aspect-video bg-gradient-to-br from-purple-100 to-blue-100 rounded-xl flex items-center justify-center">
                <div className="text-center">
                  <Code className="w-20 h-20 text-purple-600 mx-auto mb-4" />
                  <p className="text-slate-600 font-medium">
                    AI-Powered Codebase Analysis
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4">Powerful Features</h2>
          <p className="text-xl text-muted-foreground">
            Everything you need to understand and document any codebase
          </p>
        </div>

        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {[
            {
              icon: Sparkles,
              title: "RAG-Powered AI Assistant",
              description:
                "Ask questions about your codebase and get grounded answers with relevant source references.",
            },
            {
              icon: Network,
              title: "Architecture Analysis",
              description:
                "Understand project structure, components, layers, and relationships automatically.",
            },
            {
              icon: Code,
              title: "API Explorer",
              description:
                "Discover and inspect API endpoints detected from the uploaded repository.",
            },
            {
              icon: FileSearch,
              title: "Code Explorer",
              description:
                "Browse the repository file tree and inspect source code directly.",
            },
            {
              icon: Zap,
              title: "Technology & Dependency Analysis",
              description:
                "Detect frameworks, libraries, languages, and project dependencies from repository manifests.",
            },
            {
              icon: Database,
              title: "Database Analysis",
              description:
                "Analyze database schemas, entities, migrations, and relationships when database information is present.",
            },
          ].map((feature, index) => (
            <div
              key={index}
              className="bg-white/80 backdrop-blur-sm border border-purple-200/50 rounded-2xl p-6 hover:shadow-lg hover:border-purple-300 transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-purple-100 to-blue-100 flex items-center justify-center mb-4">
                <feature.icon className="w-6 h-6 text-purple-600" />
              </div>
              <h3 className="text-lg font-semibold mb-2 text-slate-900">
                {feature.title}
              </h3>
              <p className="text-slate-600">{feature.description}</p>
            </div>
          ))}
        </div>
      </section>

      {/* How It Works */}
      <section className="max-w-7xl mx-auto px-6 py-24">
        <div className="text-center mb-16">
          <h2 className="text-4xl font-bold mb-4 text-slate-900">
            How It Works
          </h2>
          <p className="text-xl text-slate-600">
            Get started in three simple steps
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {[
            {
              step: "01",
              title: "Upload Repository",
              description: "Connect your GitHub, GitLab, or upload a ZIP file",
            },
            {
              step: "02",
              title: "AI Analysis",
              description:
                "Our AI analyzes architecture, dependencies, and patterns",
            },
            {
              step: "03",
              title: "Explore & Document",
              description:
                "Navigate visualizations, chat with AI, export documentation",
            },
          ].map((item, index) => (
            <div key={index} className="text-center">
              <div className="w-16 h-16 rounded-2xl bg-gradient-to-br from-purple-500 to-blue-500 text-white flex items-center justify-center mx-auto mb-4 text-2xl font-bold shadow-lg">
                {item.step}
              </div>
              <h3 className="text-xl font-semibold mb-2 text-slate-900">
                {item.title}
              </h3>
              <p className="text-slate-600">{item.description}</p>
            </div>
          ))}
        </div>
      </section>




      {/* Footer */}
      <footer className="border-t border-purple-200/60 py-8 bg-white/40">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-sm text-slate-600">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-primary to-secondary flex items-center justify-center">
              <span className="font-bold text-white text-xs">A</span>
            </div>
            <span className="font-semibold text-slate-900">AI Codebase Archaeologist</span>
          </div>
          <p className="text-slate-500 text-xs sm:text-sm">
            AI-Powered Codebase Analysis & Exploration
          </p>
        </div>
      </footer>
    </div>
  );
}

function Upload(props) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="24"
      height="24"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      {...props}
    >
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="17 8 12 3 7 8" />
      <line x1="12" x2="12" y1="3" y2="15" />
    </svg>
  );
}
