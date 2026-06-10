"use client";

import { Button } from "@/components/ui/button";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { api, ApiError } from "@/lib/api";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError("");
    setLoading(true);

    try {
      await api.login(email, password);
      router.push("/dashboard");
      router.refresh();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Card className="tech-frame shadow-lg">
      <p className="tech-label">auth.login()</p>
      <CardTitle className="mt-1 text-lg">Sign in</CardTitle>
      <CardDescription className="normal-case">Access your workspace</CardDescription>

      <form onSubmit={handleSubmit} className="mt-6 space-y-4">
        <Input
          label="email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          autoComplete="email"
          placeholder="you@domain.com"
        />
        <Input
          label="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          autoComplete="current-password"
          placeholder="••••••••"
        />
        {error && (
          <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 font-mono text-xs text-red-600">
            ERR: {error}
          </p>
        )}
        <Button type="submit" className="w-full font-mono text-xs uppercase tracking-wider" disabled={loading}>
          {loading ? "authenticating..." : "execute →"}
        </Button>
      </form>

      <p className="mt-5 text-center font-mono text-xs text-[var(--muted)]">
        no account?{" "}
        <Link href="/register" className="text-[var(--accent)] hover:underline">
          register()
        </Link>
      </p>
    </Card>
  );
}
