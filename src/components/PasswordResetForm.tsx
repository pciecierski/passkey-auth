"use client";

import { type FormEvent, useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AppLogo } from "@/components/AppLogo";

async function readError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Something went wrong";
}

export function PasswordResetForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = useMemo(() => searchParams.get("token")?.trim() ?? "", [searchParams]);

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const passwordsMismatch = confirmPassword.length > 0 && password !== confirmPassword;
  const passwordTooShort = password.length > 0 && password.length < 8;
  const formValid =
    Boolean(token) && password.length >= 8 && password === confirmPassword && !loading;

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (!token) {
        throw new Error("Brak tokenu resetu w linku.");
      }
      if (password.length < 8) {
        throw new Error("Hasło musi mieć co najmniej 8 znaków.");
      }
      if (password !== confirmPassword) {
        throw new Error("Hasła nie są identyczne.");
      }

      const response = await fetch("/api/auth/password/reset", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password, confirmPassword }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as { email?: string };
      const next = new URL("/", window.location.origin);
      next.searchParams.set("tab", "register");
      next.searchParams.set("reset", "1");
      if (data.email) {
        next.searchParams.set("email", data.email);
      }
      router.replace(next.pathname + next.search);
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Reset hasła nie powiódł się");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="card">
        <AppLogo />
        <h1>Reset hasła</h1>
        <p className="error">Link jest nieprawidłowy lub niekompletny.</p>
        <Link className="button secondary" href="/?tab=register">
          Wróć do rejestracji lub odzyskiwania
        </Link>
      </div>
    );
  }

  return (
    <div className="card">
      <AppLogo />
      <p className="badge">Odzyskiwanie konta</p>
      <h1>Nowe hasło</h1>
      <p className="muted">
        Ustaw nowe hasło, a potem utwórz nowy Passkey w zakładce Rejestracja lub odzyskiwanie.
      </p>

      <form className="form" onSubmit={(event) => void handleSubmit(event)}>
        <label>
          Nowe hasło
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Minimum 8 znaków"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={loading}
          />
        </label>

        <label>
          Potwierdź hasło
          <input
            type="password"
            autoComplete="new-password"
            placeholder="Powtórz hasło"
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.target.value)}
            required
            disabled={loading}
            aria-invalid={passwordsMismatch}
          />
        </label>

        {passwordTooShort && <p className="error">Hasło musi mieć co najmniej 8 znaków.</p>}
        {passwordsMismatch && <p className="error">Hasła nie są identyczne.</p>}
        {error && <p className="error">{error}</p>}

        <button className="button" type="submit" disabled={!formValid}>
          {loading ? "Zapisywanie…" : "Zapisz nowe hasło"}
        </button>
      </form>
    </div>
  );
}
