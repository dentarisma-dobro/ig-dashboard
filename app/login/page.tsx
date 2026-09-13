"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const router = useRouter();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const res = await fetch("/api/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });
    if (res.ok) {
      router.push("/dashboard");
      router.refresh();
    } else {
      setError("Неверный пароль");
    }
  }

  return (
    <div className="min-h-screen bg-ink flex items-center justify-center px-4">
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-sm border border-line rounded-lg p-8 bg-panel"
      >
        <h1 className="font-display text-2xl text-paper mb-1">Статистика</h1>
        <p className="text-muted text-sm mb-6">Instagram-дашборд · вход</p>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Пароль"
          autoFocus
          className="w-full bg-ink border border-line rounded px-3 py-2 text-paper mb-3 outline-none focus:border-accent"
        />
        {error && <p className="text-warn text-sm mb-3">{error}</p>}
        <button
          type="submit"
          className="w-full bg-accent text-white rounded py-2 font-medium hover:opacity-90 transition"
        >
          Войти
        </button>
      </form>
    </div>
  );
}
