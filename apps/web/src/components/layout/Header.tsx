import { Link, useParams } from "react-router";
import { useBoardStore } from "../../stores/boardStore.js";

export default function Header() {
  const { id: projectId } = useParams<{ id: string }>();
  const project = useBoardStore((s) => s.project);

  return (
    <header className="flex items-center h-10 px-4 border-b border-border-default bg-bg-surface shrink-0">
      {projectId ? (
        <>
          <Link
            to="/projects"
            className="font-pixel text-[8px] text-text-secondary hover:text-accent transition-colors"
          >
            ← PROJECTS
          </Link>
          <span className="mx-3 text-text-muted">/</span>
          <span className="font-pixel text-[10px] text-text-primary">
            {project?.name || "..."}
          </span>
        </>
      ) : (
        <Link to="/projects" className="font-pixel text-[12px] text-accent">
          CLAUDEHUB
        </Link>
      )}
      <div className="ml-auto">
        <Link
          to="/settings"
          className="font-pixel text-[8px] text-text-secondary hover:text-accent transition-colors"
        >
          SETTINGS
        </Link>
      </div>
    </header>
  );
}
