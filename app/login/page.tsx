"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { LogoMark } from "@/components/icons";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    }).catch(() => null);
    setBusy(false);
    if (res?.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError(res ? "Неверный пароль" : "Нет связи с сервером");
    }
  }

  return (
    <div className="min-h-screen bg-page flex items-center justify-center px-4">
      <form onSubmit={handleSubmit} className="w-full max-w-sm bg-card border border-line rounded-2xl p-8">
        <div className="flex items-center gap-3 mb-6">
          <LogoMark className="w-10 h-10" />
          <div>
            <h1 className="text-lg font-semibold text-ink leading-tight">Статистика</h1>
            <p className="text-sub text-sm">Instagram-аналитика</p>
          </div>
        </div>
        <label className="block text-sm text-sub mb-1.5" htmlFor="password">
          Пароль
        </label>
        <input
          id="password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          autoFocus
          className="w-full bg-card border border-line rounded-lg px-3 py-2.5 text-ink mb-3 outline-none focus:border-accent focus:ring-2 focus:ring-accent/20"
        />
        {error && <p className="text-down text-sm mb-3">{error}</p>}
        <button
          type="submit"
          disabled={busy || !password}
          className="w-full bg-accent text-white rounded-lg py-2.5 font-medium hover:bg-accent-dark transition disabled:opacity-60"
        >
          {busy ? "Входим…" : "Войти"}
        </button>
      </form>
    </div>
  );
}
