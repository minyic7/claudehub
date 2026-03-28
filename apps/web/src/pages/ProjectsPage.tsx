import { useEffect, useState } from "react";
import { useNavigate } from "react-router";
import { toast } from "sonner";
import type { Project, CreateProjectInput } from "@claudehub/shared";
import { api } from "../api/client.js";
import Button from "../components/ui/Button.js";
import Input from "../components/ui/Input.js";
import Modal from "../components/ui/Modal.js";
import Spinner from "../components/ui/Spinner.js";

export default function ProjectsPage() {
  const navigate = useNavigate();
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Project | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchProjects = async () => {
    try {
      const data = await api.getProjects();
      setProjects(data);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to load projects");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProjects();
  }, []);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await api.deleteProject(deleteTarget.id);
      setProjects((prev) => prev.filter((p) => p.id !== deleteTarget.id));
      setDeleteTarget(null);
    } catch {
      toast.error("Operation failed");
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Spinner size="lg" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto p-6">
      <div className="flex items-center justify-between mb-6">
        <h1 className="font-pixel text-[12px] text-text-primary">PROJECTS</h1>
        <Button variant="primary" size="sm" onClick={() => setShowCreate(true)}>
          + NEW PROJECT
        </Button>
      </div>

      {projects.length === 0 ? (
        <div className="text-center py-12 font-pixel text-[8px] text-text-muted">
          No projects yet. Create one to get started.
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {projects.map((p) => (
            <ProjectCard
              key={p.id}
              project={p}
              onClick={() => navigate(`/projects/${p.id}/board`)}
              onDelete={() => setDeleteTarget(p)}
            />
          ))}
        </div>
      )}

      {/* Create Project Modal */}
      <CreateProjectModal
        open={showCreate}
        onClose={() => setShowCreate(false)}
        onCreated={(p) => {
          setProjects((prev) => [...prev, p]);
          setShowCreate(false);
        }}
      />

      {/* Delete Confirmation Modal */}
      <Modal
        open={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        title="Delete Project"
      >
        <p className="font-mono text-[13px] text-text-secondary mb-4">
          This will stop all CCs, remove worktrees, close Issues/PRs, and delete
          remote branches for <strong>{deleteTarget?.name}</strong>.
        </p>
        <div className="flex justify-end gap-2">
          <Button onClick={() => setDeleteTarget(null)}>CANCEL</Button>
          <Button variant="danger" loading={deleting} onClick={handleDelete}>
            DELETE
          </Button>
        </div>
      </Modal>
    </div>
  );
}

function ProjectCard({
  project,
  onClick,
  onDelete,
}: {
  project: Project;
  onClick: () => void;
  onDelete: () => void;
}) {
  const [syncing, setSyncing] = useState(false);

  const handleSync = async (e: React.MouseEvent) => {
    e.stopPropagation();
    setSyncing(true);
    try {
      await api.syncProject(project.id);
    } catch {
      toast.error("Operation failed");
    } finally {
      setSyncing(false);
    }
  };

  const handleDelete = (e: React.MouseEvent) => {
    e.stopPropagation();
    onDelete();
  };

  return (
    <div
      onClick={onClick}
      className="bg-bg-card border border-border-default p-4 cursor-pointer hover:border-border-hover transition-colors group"
    >
      <div className="flex items-center justify-between">
        <span className="font-pixel text-[10px] text-text-primary group-hover:text-accent transition-colors">
          {project.name}
        </span>
        <div className="flex gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={handleSync}
            loading={syncing}
          >
            SYNC
          </Button>
          <Button size="sm" variant="ghost" onClick={handleDelete}>
            DEL
          </Button>
        </div>
      </div>
      <div className="font-mono text-[11px] text-text-muted mt-1">
        {project.owner}/{project.repo}
      </div>
    </div>
  );
}

function CreateProjectModal({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated: (p: Project) => void;
}) {
  const [githubUrl, setGithubUrl] = useState("");
  const [name, setName] = useState("");
  const [githubToken, setGithubToken] = useState("");
  const [baseBranch, setBaseBranch] = useState("main");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setGithubUrl("");
    setName("");
    setGithubToken("");
    setBaseBranch("main");
    setError("");
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      const data: CreateProjectInput = {
        githubUrl,
        githubToken,
        baseBranch,
        ...(name && { name }),
      };
      const project = await api.createProject(data);
      reset();
      onCreated(project);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create project");
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="New Project"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="GITHUB URL"
          placeholder="https://github.com/owner/repo"
          value={githubUrl}
          onChange={(e) => setGithubUrl(e.target.value)}
          required
        />
        <Input
          label="NAME (optional)"
          placeholder="My Project"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <Input
          label="GITHUB TOKEN"
          type="password"
          value={githubToken}
          onChange={(e) => setGithubToken(e.target.value)}
          required
        />
        <Input
          label="BASE BRANCH"
          value={baseBranch}
          onChange={(e) => setBaseBranch(e.target.value)}
          required
        />

        {error && (
          <span className="font-pixel text-[8px] text-status-error">
            {error}
          </span>
        )}

        <div className="flex justify-end gap-2 mt-2">
          <Button
            type="button"
            onClick={() => {
              reset();
              onClose();
            }}
          >
            CANCEL
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            CREATE
          </Button>
        </div>
      </form>
    </Modal>
  );
}
