import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router";
import { useAuthStore } from "../stores/authStore.js";
import Button from "../components/ui/Button.js";
import Input from "../components/ui/Input.js";

export default function LoginPage() {
  const navigate = useNavigate();
  const login = useAuthStore((s) => s.login);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const ok = await login(username, password);
    setLoading(false);
    if (ok) {
      navigate("/projects", { replace: true });
    } else {
      setError("Invalid credentials");
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-xs bg-bg-surface border border-border-default p-6 flex flex-col gap-4"
      >
        {/* Logo */}
        <div className="text-center mb-2">
          <span className="font-pixel text-[14px] text-accent">CLAUDEHUB</span>
          <div className="font-pixel text-[8px] text-text-muted mt-1">
            {"=^.^="}
          </div>
        </div>

        <Input
          label="USERNAME"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          autoFocus
        />
        <Input
          label="PASSWORD"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {error && (
          <span className="font-pixel text-[8px] text-status-error">
            {error}
          </span>
        )}

        <Button type="submit" variant="primary" loading={loading}>
          LOGIN
        </Button>
      </form>
    </div>
  );
}
