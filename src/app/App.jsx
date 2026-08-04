import { BrowserRouter, Routes, Route, Navigate, Outlet } from "react-router-dom";
import { LandingPage } from "./pages/LandingPage";
import { AuthPage } from "./pages/AuthPage";
import { DashboardLayout } from "./components/DashboardLayout";
import { Dashboard } from "./pages/Dashboard";
import { UploadPage } from "./pages/UploadPage";
import { RepositoriesPage } from "./pages/RepositoriesPage";
import { RepositoryOverviewPage } from "./pages/RepositoryOverviewPage";
import { AIChatPage } from "./pages/AIChatPage";
import { CodeExplorerPage } from "./pages/CodeExplorerPage";
import { DependencyGraphPage } from "./pages/DependencyGraphPage";
import { APIExplorerPage } from "./pages/APIExplorerPage";
import { DatabasePage } from "./pages/DatabasePage";
import { SettingsPage } from "./pages/SettingsPage";
import { isLoggedIn } from "./services/authService";

function ProtectedRoute() {
  return isLoggedIn() ? <Outlet /> : <Navigate to="/auth" replace />;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<LandingPage />} />
        <Route path="/auth" element={<AuthPage />} />

        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/dashboard" element={<Dashboard />} />
            <Route path="/upload" element={<UploadPage />} />
            <Route path="/repositories" element={<RepositoriesPage />} />
            <Route
              path="/repositories/:id"
              element={<RepositoryOverviewPage />}
            />
            <Route path="/ai-chat" element={<AIChatPage />} />
            <Route path="/code-explorer" element={<CodeExplorerPage />} />
            <Route path="/dependencies" element={<DependencyGraphPage />} />
            <Route path="/api-explorer" element={<APIExplorerPage />} />
            <Route path="/database" element={<DatabasePage />} />
            <Route path="/settings" element={<SettingsPage />} />
          </Route>
        </Route>

        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
