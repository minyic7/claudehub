import { Routes, Route, Navigate } from "react-router";
import { Toaster } from "sonner";
import ProtectedRoute from "./components/layout/ProtectedRoute.js";
import Layout from "./components/layout/Layout.js";
import ScanlineOverlay from "./components/layout/ScanlineOverlay.js";
import PawPrintBg from "./components/layout/PawPrintBg.js";
import LoginPage from "./pages/LoginPage.js";
import ProjectsPage from "./pages/ProjectsPage.js";
import BoardPage from "./pages/BoardPage.js";
import SettingsPage from "./pages/SettingsPage.js";

export default function App() {
  return (
    <div className="min-h-screen bg-bg-base text-text-primary relative">
      <PawPrintBg />
      <ScanlineOverlay />
      <Toaster
        position="bottom-right"
        toastOptions={{
          style: {
            background: "var(--color-bg-elevated)",
            border: "1px solid var(--color-border-default)",
            color: "var(--color-text-primary)",
            fontFamily: "'Press Start 2P', monospace",
            fontSize: "8px",
          },
        }}
      />
      <div className="relative z-10">
        <Routes>
          <Route path="/login" element={<LoginPage />} />
          <Route element={<ProtectedRoute />}>
            <Route element={<Layout />}>
              <Route path="/projects" element={<ProjectsPage />} />
              <Route path="/projects/:id/board" element={<BoardPage />} />
              <Route path="/settings" element={<SettingsPage />} />
            </Route>
          </Route>
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Routes>
      </div>
    </div>
  );
}
