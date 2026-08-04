import { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent } from "../components/Card";
import { Button } from "../components/Button";
import { Input } from "../components/Input";
import { Badge } from "../components/Badge";
import {
  Search,
  FolderOpen,
  Calendar,
  Code,
  Eye,
  Trash,
  Plus
} from "lucide-react";
import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

import { getRepositories, deleteRepository } from "../services/storageService";

export function RepositoriesPage() {
  const [searchQuery, setSearchQuery] = useState("");
  const [repositories, setRepositories] = useState([]);
  useEffect(() => {
    getRepositories().then(setRepositories);
  }, []);

  const handleDelete = async (id) => {
    if (window.confirm("Are you sure you want to delete this repository analysis? This cannot be undone.")) {
      await deleteRepository(id);
      const data = await getRepositories();
      setRepositories(data);
    }
  };

  const filteredRepos = repositories.filter((repo) =>
    repo.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="space-y-8 max-w-7xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold mb-2">Repositories</h1>
          <p className="text-muted-foreground">
            Manage and analyze your codebase archaeology records
          </p>
        </div>
        <Link to="/upload">
          <Button className="gap-2 cursor-pointer">
            <Plus className="w-4 h-4" />
            New Repository
          </Button>
        </Link>
      </div>

      {repositories.length > 0 && (
        <div className="relative">
          <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
          <Input
            id="repositories-search"
            name="searchQuery"
            placeholder="Search repositories..."
            className="pl-12"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>
      )}

      <div className="grid gap-6">
        {filteredRepos.map((repo) => (
          <Card
            key={repo.id}
            className="hover:border-primary/50 transition-all"
          >
            <CardContent className="pt-6">
              <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4 mb-4">
                <div className="flex gap-4 flex-1">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary to-secondary flex items-center justify-center shrink-0">
                    <FolderOpen className="w-8 h-8 text-white" />
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2 flex-wrap">
                      <h3 className="text-xl font-semibold truncate">{repo.name}</h3>
                      <Badge variant="success">
                        Analysis Complete
                      </Badge>
                      {repo.type === "github" && (
                        <Badge variant="default" className="bg-[#24292e] text-white">GitHub</Badge>
                      )}
                      {repo.type === "zip" && (
                        <Badge variant="default" className="bg-[#4a154b] text-white">ZIP</Badge>
                      )}
                    </div>
                    <p className="text-muted-foreground mb-3 text-sm line-clamp-2">
                      {repo.description}
                    </p>

                    <div className="flex items-center gap-4 text-xs text-muted-foreground">
                      <div className="flex items-center gap-1 font-mono">
                        <Code className="w-3.5 h-3.5" />
                        {repo.files.toLocaleString()} files
                      </div>
                      <div className="flex items-center gap-1 font-mono">
                        <Calendar className="w-3.5 h-3.5" />
                        {repo.lastAnalyzed}
                      </div>
                    </div>
                  </div>
                </div>

                {repo.languages && repo.languages.length > 0 && (
                  <div className="w-20 h-20 shrink-0 self-center sm:self-start">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={repo.languages}
                          cx="50%"
                          cy="50%"
                          innerRadius={20}
                          outerRadius={35}
                          paddingAngle={2}
                          dataKey="value"
                        >
                          {repo.languages.map((entry, index) => (
                            <Cell key={`cell-${index}`} fill={entry.color} />
                          ))}
                        </Pie>
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>

              <div className="flex items-center gap-2 pt-4 border-t border-white/5">
                <Link to={`/repositories/${repo.id}`}>
                  <Button variant="outline" size="sm" className="gap-2 cursor-pointer">
                    <Eye className="w-4 h-4" />
                    View Details
                  </Button>
                </Link>
                <Button
                  variant="ghost"
                  size="sm"
                  className="gap-2 text-red-400 hover:text-red-300 hover:bg-red-500/10 cursor-pointer ml-auto"
                  onClick={() => handleDelete(repo.id)}
                >
                  <Trash className="w-4 h-4" />
                  Delete
                </Button>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {filteredRepos.length === 0 && (
        <Card>
          <CardContent className="pt-6 text-center py-12">
            <FolderOpen className="w-16 h-16 text-muted-foreground mx-auto mb-4 animate-pulse" />
            <h3 className="text-lg font-semibold mb-2">
              No repositories found
            </h3>
            <p className="text-muted-foreground mb-6 text-sm">
              {repositories.length > 0 
                ? "Try adjusting your search query." 
                : "Import a codebase from GitHub or upload a ZIP file to get started."}
            </p>
            <Link to="/upload">
              <Button className="cursor-pointer">Upload Repository</Button>
            </Link>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
