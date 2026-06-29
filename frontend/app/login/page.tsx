"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Factory, AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { apiLogin, setAccessToken } from "@/lib/auth";
import { setCurrentUser } from "@/lib/user";

export default function LoginPage() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      const data = await apiLogin(username, password);
      setAccessToken(data.access_token);

      const meRes = await fetch("/api/v1/auth/me", {
        headers: { Authorization: `Bearer ${data.access_token}` },
        credentials: "include",
      });
      if (meRes.ok) {
        const me = await meRes.json();
        setCurrentUser({
            id: me.id,
            username: me.username,
            role: me.role,
            inventory_access: me.inventory_access ?? [],
            inventory_edit: me.inventory_edit ?? [],
            request_departments: me.request_departments ?? [],
            request_inventory: me.request_inventory ?? [],
            grn_access: me.grn_access ?? false,
            photo_base64: me.photo_base64 ?? null,
            department_codes: me.department_codes ?? [],
            department_names: me.department_names ?? [],
          });
      }

      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Login failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex bg-background">
      {/* Left brand panel — desktop only */}
      <div className="hidden lg:flex flex-col justify-between w-1/2 bg-gradient-to-br from-blue-600 to-blue-700 p-12 text-white">
        <div className="flex items-center gap-3">
          <div className="size-10 rounded-xl bg-white/15 flex items-center justify-center">
            <Factory className="size-6 text-white" />
          </div>
          <span className="text-xl font-bold tracking-tight">OneFlow</span>
        </div>

        <div className="max-w-md">
          <h2 className="text-3xl font-bold tracking-tight leading-tight">
            Modular manufacturing ERP
          </h2>
          <p className="mt-4 text-white/80 text-lg leading-relaxed">
            Inventory, production, scheduling, and dispatch — all in one flow.
          </p>
        </div>

        <p className="text-white/60 text-sm">OneFlow</p>
      </div>

      {/* Right form panel */}
      <div className="flex flex-1 items-center justify-center px-4 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile brand header */}
          <div className="mb-8 flex items-center gap-2.5 lg:hidden">
            <div className="size-9 rounded-lg bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center">
              <Factory className="size-5 text-white" />
            </div>
            <span className="text-xl font-bold tracking-tight">OneFlow</span>
          </div>

          <div className="mb-6">
            <h1 className="text-2xl font-bold tracking-tight">Sign in</h1>
            <p className="text-muted-foreground text-sm mt-1">
              Enter your credentials to continue
            </p>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="username">Username</Label>
              <Input
                id="username"
                type="text"
                autoComplete="username"
                placeholder="admin"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
              />
            </div>

            {error && (
              <div className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2.5 text-sm text-destructive" role="alert">
                <AlertCircle className="size-4 shrink-0 mt-0.5" />
                <span>{error}</span>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={loading}>
              {loading && <Loader2 className="size-4 animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </Button>
          </form>
        </div>
      </div>
    </div>
  );
}
