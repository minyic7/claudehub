import { useState } from "react";
import type { Ticket, TicketStatus } from "@claudehub/shared";
import { api } from "../../api/client.js";
import Modal from "../ui/Modal.js";
import Badge from "../ui/Badge.js";
import Button from "../ui/Button.js";
import Input from "../ui/Input.js";

interface TicketDetailModalProps {
  ticket: Ticket | null;
  projectId: string;
  onClose: () => void;
  onUpdated: () => void;
}

export default function TicketDetailModal({
  ticket,
  projectId,
  onClose,
  onUpdated,
}: TicketDetailModalProps) {
  const [editingDesc, setEditingDesc] = useState(false);
  const [desc, setDesc] = useState("");
  const [editingPriority, setEditingPriority] = useState(false);
  const [priority, setPriority] = useState("");
  const [loading, setLoading] = useState("");

  if (!ticket) return null;

  const isMerged = ticket.status === "merged";

  const patchTicket = async (updates: Record<string, unknown>) => {
    await api.updateTicket(projectId, ticket.number, updates);
    onUpdated();
  };

  const handleAction = async (action: string) => {
    setLoading(action);
    try {
      switch (action) {
        case "start":
          await patchTicket({ status: "in_progress" as TicketStatus });
          break;
        case "back_to_todo":
          await patchTicket({ status: "todo" as TicketStatus });
          break;
        case "to_reviewing":
          await patchTicket({ status: "reviewing" as TicketStatus });
          break;
        case "merge":
          await api.mergeTicket(projectId, ticket.number);
          onUpdated();
          break;
        case "cancel_merge":
          await api.cancelMerge(projectId, ticket.number);
          onUpdated();
          break;
        case "reject":
          await patchTicket({ status: "in_progress" as TicketStatus });
          break;
        case "start_cc":
          await api.startTicketCC(projectId, ticket.number);
          onUpdated();
          break;
        case "stop_cc":
          await api.stopTicketCC(projectId, ticket.number);
          onUpdated();
          break;
        case "delete":
          await api.deleteTicket(projectId, ticket.number);
          onClose();
          break;
      }
    } catch {
      // TODO: toast
    } finally {
      setLoading("");
    }
  };

  const saveDesc = async () => {
    await patchTicket({ description: desc });
    setEditingDesc(false);
  };

  const savePriority = async () => {
    await patchTicket({ priority: Number(priority) });
    setEditingPriority(false);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title={`Ticket #${ticket.number}: ${ticket.title}`}
    >
      <div className="flex flex-col gap-4">
        {/* Info row */}
        <div className="grid grid-cols-2 gap-2 font-mono text-[12px]">
          <div>
            <span className="text-text-muted">Status: </span>
            <span className="text-text-primary">{ticket.status}</span>
          </div>
          <div>
            <span className="text-text-muted">Type: </span>
            <Badge variant={ticket.type}>{ticket.type.toUpperCase()}</Badge>
          </div>
          <div>
            <span className="text-text-muted">Priority: </span>
            <span className="text-text-primary">{ticket.priority}</span>
          </div>
          <div>
            <span className="text-text-muted">CC: </span>
            <span className="text-text-primary">{ticket.ccStatus}</span>
          </div>
          <div className="col-span-2">
            <span className="text-text-muted">Branch: </span>
            <span className="text-text-primary text-[11px]">
              {ticket.branchName}
            </span>
          </div>
        </div>

        {/* Return reason */}
        {ticket.returnReason && (
          <Badge
            variant={ticket.returnReason === "conflict" ? "error" : "warn"}
          >
            {ticket.returnReason === "conflict"
              ? "REBASE CONFLICT"
              : "REJECTED"}
          </Badge>
        )}

        {/* Description */}
        <div>
          <div className="flex items-center justify-between mb-1">
            <span className="font-pixel text-[8px] text-text-secondary">
              DESCRIPTION
            </span>
            {!isMerged && !editingDesc && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setDesc(ticket.description);
                  setEditingDesc(true);
                }}
              >
                EDIT
              </Button>
            )}
          </div>
          {editingDesc ? (
            <div className="flex flex-col gap-2">
              <textarea
                value={desc}
                onChange={(e) => setDesc(e.target.value)}
                className="bg-bg-input border border-border-default text-text-primary font-mono text-[13px] px-3 py-1.5 min-h-[80px] focus:outline-none focus:border-accent"
              />
              <div className="flex gap-2">
                <Button size="sm" variant="primary" onClick={saveDesc}>
                  SAVE
                </Button>
                <Button size="sm" onClick={() => setEditingDesc(false)}>
                  CANCEL
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-bg-input border border-border-default p-2 font-mono text-[12px] text-text-secondary min-h-[40px] whitespace-pre-wrap">
              {ticket.description || "No description"}
            </div>
          )}
        </div>

        {/* Dependencies */}
        <div>
          <span className="font-pixel text-[8px] text-text-secondary">
            DEPENDENCIES
          </span>
          <div className="font-mono text-[12px] text-text-primary mt-1">
            {ticket.dependencies.length > 0
              ? ticket.dependencies.map((d) => `#${d}`).join(", ")
              : "None"}
          </div>
        </div>

        {/* Priority edit */}
        {!isMerged && (
          <div>
            <div className="flex items-center gap-2">
              <span className="font-pixel text-[8px] text-text-secondary">
                PRIORITY
              </span>
              {editingPriority ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    min={1}
                    value={priority}
                    onChange={(e) => setPriority(e.target.value)}
                    className="w-16"
                  />
                  <Button size="sm" variant="primary" onClick={savePriority}>
                    SAVE
                  </Button>
                  <Button
                    size="sm"
                    onClick={() => setEditingPriority(false)}
                  >
                    CANCEL
                  </Button>
                </div>
              ) : (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setPriority(String(ticket.priority));
                    setEditingPriority(true);
                  }}
                >
                  EDIT
                </Button>
              )}
            </div>
          </div>
        )}

        {/* Actions */}
        {!isMerged && (
          <div className="flex flex-wrap gap-2 pt-2 border-t border-border-default">
            {ticket.status === "todo" && (
              <Button
                size="sm"
                variant="primary"
                loading={loading === "start"}
                onClick={() => handleAction("start")}
              >
                START
              </Button>
            )}

            {ticket.status === "in_progress" && (
              <>
                <Button
                  size="sm"
                  loading={loading === "back_to_todo"}
                  onClick={() => handleAction("back_to_todo")}
                >
                  BACK TO TODO
                </Button>
                <Button
                  size="sm"
                  loading={loading === "to_reviewing"}
                  onClick={() => handleAction("to_reviewing")}
                >
                  TO REVIEWING
                </Button>
                <Button
                  size="sm"
                  variant="primary"
                  loading={loading === "start_cc"}
                  onClick={() => handleAction("start_cc")}
                >
                  START CC
                </Button>
                <Button
                  size="sm"
                  loading={loading === "stop_cc"}
                  onClick={() => handleAction("stop_cc")}
                >
                  STOP CC
                </Button>
              </>
            )}

            {ticket.status === "reviewing" && (
              <>
                <Button
                  size="sm"
                  variant="primary"
                  loading={loading === "merge"}
                  onClick={() => handleAction("merge")}
                >
                  MERGE
                </Button>
                <Button
                  size="sm"
                  loading={loading === "reject"}
                  onClick={() => handleAction("reject")}
                >
                  REJECT
                </Button>
                <Button
                  size="sm"
                  loading={loading === "back_to_todo"}
                  onClick={() => handleAction("back_to_todo")}
                >
                  BACK TO TODO
                </Button>
                <Button
                  size="sm"
                  loading={loading === "cancel_merge"}
                  onClick={() => handleAction("cancel_merge")}
                >
                  CANCEL MERGE
                </Button>
              </>
            )}

            <Button
              size="sm"
              variant="danger"
              loading={loading === "delete"}
              onClick={() => handleAction("delete")}
            >
              DELETE
            </Button>
          </div>
        )}
      </div>
    </Modal>
  );
}
