"use client";

import { useEffect, useState } from "react";
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { AppLogo } from "@/components/AppLogo";
import { MobileAuthQr } from "@/components/MobileAuthQr";
import { isDesktopBrowser } from "@/lib/device";
import { buildMobileAuthUrl } from "@/lib/mobile-auth-url";

type User = {
  id: string;
  email: string;
  name: string | null;
  passkeys?: Array<{
    id: string;
    deviceType: string;
    backedUp: boolean;
    createdAt: string;
  }>;
};

type Mode = "login" | "register";
type LoginStep = "email" | "action";

type AccountStatus = {
  exists: boolean;
  hasPasskey: boolean;
  name?: string | null;
};

async function readError(response: Response): Promise<string> {
  const data = (await response.json().catch(() => null)) as { error?: string } | null;
  return data?.error ?? "Something went wrong";
}

export function PasskeyAuth() {
  const [mode, setMode] = useState<Mode>("login");
  const [loginStep, setLoginStep] = useState<LoginStep>("email");
  const [accountStatus, setAccountStatus] = useState<AccountStatus | null>(null);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [registerAccountStatus, setRegisterAccountStatus] = useState<AccountStatus | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean | null>(null);
  const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [waitingForMobile, setWaitingForMobile] = useState(false);

  useEffect(() => {
    void (async () => {
      const supported = browserSupportsWebAuthn();
      setWebAuthnSupported(supported);
      setIsDesktop(isDesktopBrowser());
      if (supported) {
        setPlatformAvailable(await platformAuthenticatorIsAvailable());
      }

      const response = await fetch("/api/auth/session");
      const data = (await response.json()) as { user: User | null };
      setUser(data.user);
    })();
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const params = new URLSearchParams(window.location.search);
    if (params.get("mobile") !== "1") {
      return;
    }

    const tab = params.get("tab");
    const emailParam = params.get("email")?.trim().toLowerCase();
    const step = params.get("step");
    const handoffParam = params.get("handoff");

    if (handoffParam) {
      setHandoffId(handoffParam);
    }

    if (emailParam) {
      setEmail(emailParam);
    }

    if (tab === "login" || tab === "register") {
      setMode(tab);
    }

    if (tab === "login" && step === "action" && emailParam) {
      void loadExistingAccount(emailParam);
    }

    if (tab === "register" && emailParam) {
      void checkRegisterEmailFor(emailParam);
    }
  }, []);

  useEffect(() => {
    if (!isDesktop || loginStep !== "action" || !email.trim()) {
      return;
    }

    let cancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/auth/handoff/create", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email }),
        });

        if (!response.ok || cancelled) {
          return;
        }

        const data = (await response.json()) as { handoffId: string };
        setHandoffId(data.handoffId);
        setWaitingForMobile(true);
      } catch {
        // QR still works without handoff sync.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [isDesktop, loginStep, email]);

  useEffect(() => {
    if (!isDesktop || !handoffId || !waitingForMobile || user) {
      return;
    }

    const interval = window.setInterval(() => {
      void (async () => {
        try {
          const response = await fetch("/api/auth/handoff/claim", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ handoffId }),
          });

          if (response.status === 202) {
            return;
          }

          if (!response.ok) {
            if (response.status === 410) {
              setWaitingForMobile(false);
              setMessage("Sesja QR wygasła. Odśwież kod i spróbuj ponownie.");
            }
            return;
          }

          const data = (await response.json()) as {
            status: string;
            user: User;
          };

          if (data.status === "complete" && data.user) {
            setUser(data.user);
            setMessage("Zalogowano na desktopie po autoryzacji mobilnej.");
            setWaitingForMobile(false);
            resetLoginFlow();
          }
        } catch {
          // Keep polling until success or manual cancel.
        }
      })();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isDesktop, handoffId, waitingForMobile, user]);

  function resetLoginFlow() {
    setLoginStep("email");
    setAccountStatus(null);
    setMessage(null);
    setHandoffId(null);
    setWaitingForMobile(false);
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    resetLoginFlow();
    setPassword("");
    setConfirmPassword("");
    setRegisterAccountStatus(null);
  }

  async function checkRegisterEmailFor(targetEmail = email) {
    const normalizedEmail = targetEmail.trim().toLowerCase();
    if (!normalizedEmail) {
      setRegisterAccountStatus(null);
      return;
    }

    try {
      const response = await fetch("/api/auth/account/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: normalizedEmail }),
      });

      if (!response.ok) {
        setRegisterAccountStatus(null);
        return;
      }

      const status = (await response.json()) as AccountStatus;
      setRegisterAccountStatus(status.exists ? status : { exists: false, hasPasskey: false });
    } catch {
      setRegisterAccountStatus(null);
    }
  }

  async function checkRegisterEmail() {
    await checkRegisterEmailFor(email);
  }

  async function loadExistingAccount(targetEmail = email) {
    setLoading(true);
    setMessage(null);

    try {
      const response = await fetch("/api/auth/account/check", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: targetEmail }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const status = (await response.json()) as AccountStatus;
      if (!status.exists) {
        throw new Error("Konto nie istnieje. Zarejestruj się, aby utworzyć konto.");
      }

      setEmail(targetEmail.trim().toLowerCase());
      setAccountStatus(status);
      setLoginStep("action");
      setMode("login");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się sprawdzić konta");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckAccount() {
    await loadExistingAccount(email);
  }

  async function handleRegister(allowExistingAccount = false) {
    setLoading(true);
    setMessage(null);

    try {
      if (!allowExistingAccount) {
        if (registerAccountStatus?.exists) {
          if (registerAccountStatus.hasPasskey) {
            throw new Error("Konto już istnieje i ma Passkey. Zaloguj się.");
          }
          if (!password) {
            throw new Error("Podaj aktualne hasło do tego konta.");
          }
        } else {
          if (!password) {
            throw new Error("Hasło jest wymagane.");
          }
          if (password !== confirmPassword) {
            throw new Error("Hasła nie są identyczne.");
          }
          if (password.length < 8) {
            throw new Error("Hasło musi mieć co najmniej 8 znaków.");
          }
        }
      }

      const optionsResponse = await fetch("/api/auth/register/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email,
          name: allowExistingAccount ? accountStatus?.name ?? undefined : name,
          password: allowExistingAccount ? undefined : password,
          confirmPassword: allowExistingAccount ? undefined : confirmPassword,
          allowExistingAccount,
        }),
      });

      if (!optionsResponse.ok) {
        throw new Error(await readError(optionsResponse));
      }

      const options = await optionsResponse.json();
      const attestation = (await startRegistration({ optionsJSON: options })) as RegistrationResponseJSON;

      const verifyResponse = await fetch("/api/auth/register/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...attestation,
          handoffId: handoffId ?? undefined,
        }),
      });

      if (!verifyResponse.ok) {
        throw new Error(await readError(verifyResponse));
      }

      await verifyResponse.json();
      const sessionResponse = await fetch("/api/auth/session");
      const sessionData = (await sessionResponse.json()) as { user: User | null };
      setUser(sessionData.user);
      setMessage(allowExistingAccount ? "Passkey utworzony. Zalogowano." : "Konto i Passkey utworzone.");
      resetLoginFlow();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Rejestracja nie powiodła się");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin() {
    setLoading(true);
    setMessage(null);

    try {
      const optionsResponse = await fetch("/api/auth/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!optionsResponse.ok) {
        throw new Error(await readError(optionsResponse));
      }

      const options = await optionsResponse.json();
      const assertion = (await startAuthentication({ optionsJSON: options })) as AuthenticationResponseJSON;

      const verifyResponse = await fetch("/api/auth/login/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...assertion,
          handoffId: handoffId ?? undefined,
        }),
      });

      if (!verifyResponse.ok) {
        throw new Error(await readError(verifyResponse));
      }

      await verifyResponse.json();
      const sessionResponse = await fetch("/api/auth/session");
      const sessionData = (await sessionResponse.json()) as { user: User | null };
      setUser(sessionData.user);
      setMessage("Zalogowano przez Passkey.");
      resetLoginFlow();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Logowanie nie powiodło się");
    } finally {
      setLoading(false);
    }
  }

  async function handleLogout() {
    setLoading(true);
    setMessage(null);

    try {
      await fetch("/api/auth/session", { method: "DELETE" });
      setUser(null);
      setMessage("Wylogowano.");
    } finally {
      setLoading(false);
    }
  }

  const emailIsValid = email.trim().length > 0;
  const registerAccountExists = registerAccountStatus?.exists ?? false;
  const passwordsMismatch =
    !registerAccountExists && confirmPassword.length > 0 && password !== confirmPassword;
  const passwordTooShort =
    !registerAccountExists && password.length > 0 && password.length < 8;
  const registerPasswordIsValid = registerAccountExists
    ? password.length > 0
    : password.length >= 8 && password === confirmPassword && confirmPassword.length > 0;
  const mobileAuthUrl =
    loginStep === "action" && emailIsValid && (!isDesktop || handoffId)
      ? buildMobileAuthUrl({
          mode: accountStatus?.hasPasskey ? "login" : "register",
          email,
          step: accountStatus?.hasPasskey ? "action" : undefined,
          handoffId: handoffId ?? undefined,
        })
      : null;

  if (webAuthnSupported === false) {
    return (
      <div className="card">
        <AppLogo />
        <h1>Passkey Auth</h1>
        <p className="error">
          Ta przeglądarka nie obsługuje WebAuthn / Passkey. Użyj nowoczesnej przeglądarki mobilnej
          (Safari, Chrome) lub dodaj aplikację na ekran główny.
        </p>
      </div>
    );
  }

  if (user) {
    return (
      <div className="card">
        <AppLogo />
        <p className="badge">Zalogowano</p>
        <h1>Witaj{user.name ? `, ${user.name}` : ""}</h1>
        <p className="muted">{user.email}</p>

        {user.passkeys && user.passkeys.length > 0 && (
          <div className="passkey-list">
            <h2>Twoje Passkey</h2>
            {user.passkeys.map((passkey) => (
              <div key={passkey.id} className="passkey-item">
                <span>{passkey.deviceType}</span>
                <span className="muted">
                  {passkey.backedUp ? "zsynchronizowany" : "tylko na urządzeniu"} ·{" "}
                  {new Date(passkey.createdAt).toLocaleDateString()}
                </span>
              </div>
            ))}
          </div>
        )}

        {message && <p className="message">{message}</p>}

        <button className="button secondary" onClick={handleLogout} disabled={loading}>
          Wyloguj
        </button>
      </div>
    );
  }

  return (
    <div className="card">
      <AppLogo />
      <p className="badge">Mobilna autoryzacja Passkey</p>
      <h1>{mode === "login" ? "Logowanie" : "Rejestracja"}</h1>
      <p className="muted">
        Użyj Face ID, Touch ID, odcisku palca lub kodu PIN urządzenia.
        {platformAvailable === false && " Brak autentykatora platformowego na tym urządzeniu."}
        {mode === "register" && isDesktop && (
          <span className="warning">
            {" "}
            Rejestrację wykonaj na urządzeniu mobilnym, aby poprawnie utworzyć klucz dostępu (Passkey),
            który będzie wykorzystywany do późniejszych logowań.
          </span>
        )}
      </p>

      <div className="tabs">
        <button
          className={mode === "login" ? "tab active" : "tab"}
          onClick={() => switchMode("login")}
          type="button"
        >
          Logowanie
        </button>
        <button
          className={mode === "register" ? "tab active" : "tab"}
          onClick={() => switchMode("register")}
          type="button"
        >
          Rejestracja
        </button>
      </div>

      {mode === "login" ? (
        <div className="form">
          <label>
            Email
            <input
              type="email"
              autoComplete="username email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                if (loginStep === "action") {
                  resetLoginFlow();
                }
              }}
              required
              disabled={loading}
            />
          </label>

          {loginStep === "email" && (
            <>
              <p className="hint">
                Podaj email powiązany z kontem. Sprawdzimy, czy konto istnieje, zanim przejdziesz dalej.
              </p>
              {message && <p className="error">{message}</p>}
              <button
                className="button"
                type="button"
                onClick={() => void handleCheckAccount()}
                disabled={loading || !emailIsValid}
              >
                {loading ? "Sprawdzanie..." : "Kontynuuj"}
              </button>
            </>
          )}

          {loginStep === "action" && accountStatus && (
            <>
              <p className="message">
                Konto <strong>{email.trim().toLowerCase()}</strong> istnieje.
                {accountStatus.hasPasskey
                  ? " Możesz zalogować się przez Passkey."
                  : " To konto nie ma jeszcze Passkey — utwórz go, aby się zalogować."}
              </p>

              {isDesktop && loginStep === "action" && !handoffId && (
                <p className="hint">Przygotowywanie kodu QR…</p>
              )}

              {isDesktop && mobileAuthUrl && (
                <MobileAuthQr
                  url={mobileAuthUrl}
                  title={
                    accountStatus.hasPasskey
                      ? "Autoryzacja na urządzeniu mobilnym"
                      : "Rejestracja Passkey na urządzeniu mobilnym"
                  }
                  description={
                    accountStatus.hasPasskey
                      ? "Zeskanuj kod QR telefonem, aby przejść do logowania przez Passkey."
                      : "Zeskanuj kod QR telefonem, aby przejść do rejestracji Passkey i dokończyć autoryzację."
                  }
                />
              )}

              {waitingForMobile && (
                <p className="hint">Oczekiwanie na logowanie z urządzenia mobilnego…</p>
              )}

              {message && <p className="error">{message}</p>}

              {accountStatus.hasPasskey ? (
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleLogin()}
                  disabled={loading}
                >
                  {loading ? "Oczekiwanie na urządzenie..." : "Zaloguj przez Passkey"}
                </button>
              ) : (
                <button
                  className="button"
                  type="button"
                  onClick={() => void handleRegister(true)}
                  disabled={loading}
                >
                  {loading ? "Oczekiwanie na urządzenie..." : "Utwórz Passkey dla tego konta"}
                </button>
              )}

              <button
                className="button secondary"
                type="button"
                onClick={resetLoginFlow}
                disabled={loading}
              >
                Zmień email
              </button>
            </>
          )}
        </div>
      ) : (
        <form
          className="form"
          onSubmit={(event) => {
            event.preventDefault();
            void handleRegister(false);
          }}
        >
          <label>
            Imię
            <input
              type="text"
              autoComplete="name"
              placeholder="Twoje imię"
              value={name}
              onChange={(event) => setName(event.target.value)}
              disabled={loading}
            />
          </label>

          <label>
            Email
            <input
              type="email"
              autoComplete="username email"
              placeholder="you@example.com"
              value={email}
              onChange={(event) => {
                setEmail(event.target.value);
                setRegisterAccountStatus(null);
              }}
              onBlur={() => void checkRegisterEmail()}
              required
              disabled={loading}
            />
          </label>

          <label>
            {registerAccountExists ? "Aktualne hasło" : "Hasło"}
            <input
              type="password"
              autoComplete={registerAccountExists ? "current-password" : "new-password"}
              placeholder={registerAccountExists ? "Twoje aktualne hasło" : "Minimum 8 znaków"}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              disabled={loading}
            />
          </label>

          {!registerAccountExists && (
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
          )}

          {passwordTooShort && <p className="error">Hasło musi mieć co najmniej 8 znaków.</p>}
          {passwordsMismatch && <p className="error">Hasła nie są identyczne.</p>}

          <p className="hint">
            {registerAccountStatus?.exists && registerAccountStatus.hasPasskey
              ? "To konto już ma Passkey. Przejdź do logowania."
              : registerAccountExists
                ? "To konto już istnieje. Podaj aktualne hasło, aby dodać Passkey."
                : "Utworzysz nowe konto z hasłem i przypiszesz do niego Passkey."}
          </p>

          {message && <p className="error">{message}</p>}

          <button
            className="button"
            type="submit"
            disabled={
              loading ||
              !emailIsValid ||
              !registerPasswordIsValid ||
              (registerAccountStatus?.exists === true && registerAccountStatus.hasPasskey)
            }
          >
            {loading ? "Oczekiwanie na urządzenie..." : "Zarejestruj konto z Passkey"}
          </button>
        </form>
      )}
    </div>
  );
}
