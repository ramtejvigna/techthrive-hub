"use client";

import { ProjectMembers } from "@/components/projects/project-members";
import { Modal } from "@/components/ui/modal";
import { Skeleton } from "@/components/ui/skeleton";
import { queryKeys, useCurrentUser, useProject } from "@/lib/queries";
import type { Project } from "@/lib/types";
import { useQueryClient } from "@tanstack/react-query";

/**
 * Share a project straight from the projects list. List items don't carry
 * members, so this loads the project itself and reuses the members panel
 * from the project page, which keeps that cache entry up to date.
 */
export function ShareProjectDialog({
  project,
  onClose,
}: {
  /** The project to share, or null when the dialog is closed. */
  project: Project | null;
  onClose: () => void;
}) {
  const queryClient = useQueryClient();

  function close() {
    // Member counts and the dashboard reflect who the project is shared with.
    void queryClient.invalidateQueries({ queryKey: queryKeys.projects.list() });
    void queryClient.invalidateQueries({ queryKey: queryKeys.dashboard, refetchType: "none" });
    onClose();
  }

  return (
    <Modal
      open={project !== null}
      onClose={close}
      title={project ? `Share "${project.name}"` : "Share project"}
    >
      {project && <ShareProjectBody projectId={project.id} onLeft={close} />}
    </Modal>
  );
}

function ShareProjectBody({ projectId, onLeft }: { projectId: string; onLeft: () => void }) {
  const queryClient = useQueryClient();
  const { data: project, isPending, isError } = useProject(projectId);
  const { data: currentUser = null } = useCurrentUser();

  if (isPending) {
    return (
      <div className="space-y-2">
        <Skeleton className="h-12 rounded-lg" />
        <Skeleton className="h-10 rounded-lg" />
      </div>
    );
  }
  if (isError || !project) {
    return <p className="text-sm text-red-600">Couldn&apos;t load this project&apos;s members.</p>;
  }

  return (
    <>
      <p className="mb-4 text-sm text-[var(--muted)]">
        {project.is_owner
          ? "Add teammates by email. They'll see this project and its linked board on their dashboard."
          : "People on this project, who can also see its linked board."}
      </p>
      <ProjectMembers
        project={project}
        currentUser={currentUser}
        onLeft={() => {
          queryClient.removeQueries({ queryKey: queryKeys.projects.detail(projectId) });
          void queryClient.invalidateQueries({ queryKey: queryKeys.boards.all, refetchType: "none" });
          onLeft();
        }}
      />
    </>
  );
}
