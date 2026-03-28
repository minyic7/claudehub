import { useState } from "react";
import type { TicketType } from "@claudehub/shared";
import { api } from "../../api/client.js";
import Modal from "../ui/Modal.js";
import Button from "../ui/Button.js";
import Input from "../ui/Input.js";
import Select from "../ui/Select.js";

interface CreateTicketModalProps {
  open: boolean;
  projectId: string;
  onClose: () => void;
  onCreated: () => void;
}

const TYPE_OPTIONS = [
  { value: "feature", label: "Feature" },
  { value: "bugfix", label: "Bugfix" },
  { value: "refactor", label: "Refactor" },
  { value: "docs", label: "Docs" },
  { value: "chore", label: "Chore" },
];

const TITLE_PATTERN = /^[a-zA-Z0-9 -]+$/;

export default function CreateTicketModal({
  open,
  projectId,
  onClose,
  onCreated,
}: CreateTicketModalProps) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<TicketType>("feature");
  const [description, setDescription] = useState("");
  const [priority, setPriority] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const reset = () => {
    setTitle("");
    setType("feature");
    setDescription("");
    setPriority("");
    setError("");
  };

  const titleError =
    title.length > 0 && !TITLE_PATTERN.test(title)
      ? "Only letters, numbers, spaces, hyphens"
      : title.length > 72
        ? "Max 72 characters"
        : "";

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (titleError) return;
    setError("");
    setLoading(true);
    try {
      await api.createTicket(projectId, {
        title,
        type,
        description,
        ...(priority && { priority: Number(priority) }),
      });
      reset();
      onCreated();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create ticket");
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
      title="New Ticket"
    >
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <Input
          label="TITLE"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          maxLength={72}
          error={titleError}
          required
        />

        <Select
          label="TYPE"
          options={TYPE_OPTIONS}
          value={type}
          onChange={(e) => setType(e.target.value as TicketType)}
        />

        <div className="flex flex-col gap-1">
          <label className="font-pixel text-[8px] text-text-secondary">
            DESCRIPTION
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="bg-bg-input border border-border-default text-text-primary font-mono text-[13px] px-3 py-1.5 min-h-[80px] focus:outline-none focus:border-accent transition-colors duration-150"
            required
          />
        </div>

        <Input
          label="PRIORITY (optional, auto if empty)"
          type="number"
          min={1}
          value={priority}
          onChange={(e) => setPriority(e.target.value)}
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
