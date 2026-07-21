"use client";

import { useEffect, useRef, useState } from "react";
import {
  startAuthentication,
  startRegistration,
  browserSupportsWebAuthn,
  platformAuthenticatorIsAvailable,
} from "@simplewebauthn/browser";
import type {
  AuthenticationResponseJSON,
  PublicKeyCredentialCreationOptionsJSON,
  PublicKeyCredentialRequestOptionsJSON,
  RegistrationResponseJSON,
} from "@simplewebauthn/browser";
import { AppLogo } from "@/components/AppLogo";
import { MobileAuthQr } from "@/components/MobileAuthQr";
import { MobileDeviceIcon } from "@/components/MobileDeviceIcon";
import { isDesktopBrowser, isIPadBrowser } from "@/lib/device";
import { buildMobileAuthUrl } from "@/lib/mobile-auth-url";
import {
  startHybridAuthentication,
  startHybridRegistration,
} from "@/lib/webauthn-client";

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

function isWebAuthnCancelError(error: unknown): boolean {
  if (!(error instanceof Error)) {
    return false;
  }
  const name = "name" in error ? String((error as { name?: string }).name) : "";
  return (
    name === "NotAllowedError" ||
    /timed out|not allowed|cancel|abort/i.test(error.message)
  );
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
  const [passwordResetSent, setPasswordResetSent] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [webAuthnSupported, setWebAuthnSupported] = useState<boolean | null>(null);
  const [platformAvailable, setPlatformAvailable] = useState<boolean | null>(null);
  const [isDesktop, setIsDesktop] = useState(false);
  const [isIPad, setIsIPad] = useState(false);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const [waitingForOtherDevice, setWaitingForOtherDevice] = useState(false);
  const [fromQrHandoff, setFromQrHandoff] = useState(false);
  const desktopLoginStartedRef = useRef(false);
  const phoneQrLoginStartedRef = useRef(false);

  useEffect(() => {
    void (async () => {
      const supported = browserSupportsWebAuthn();
      setWebAuthnSupported(supported);
      setIsDesktop(isDesktopBrowser());
      setIsIPad(isIPadBrowser());
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
    const fromQr = params.get("from") === "qr";
    const passwordWasReset = params.get("reset") === "1";

    if (handoffParam) {
      setHandoffId(handoffParam);
    }

    if (fromQr) {
      setFromQrHandoff(true);
    }

    if (emailParam) {
      setEmail(emailParam);
    }

    if (tab === "login" || tab === "register") {
      setMode(tab);
    }

    if (passwordWasReset) {
      setMessage("Hasło zmienione. Podaj nowe hasło i utwórz Passkey, aby odzyskać dostęp.");
      const clean = new URLSearchParams();
      if (tab) {
        clean.set("tab", tab);
      }
      if (emailParam) {
        clean.set("email", emailParam);
      }
      const query = clean.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${query ? `?${query}` : ""}`);
    }

    if (tab === "login" && step === "action" && emailParam) {
      void loadExistingAccount(emailParam);
    }

    if (tab === "register" && emailParam) {
      void checkRegisterEmailFor(emailParam);
    }
  }, []);

  useEffect(() => {
    if (
      !isDesktop ||
      mode !== "login" ||
      loginStep !== "action" ||
      !accountStatus?.hasPasskey ||
      user ||
      desktopLoginStartedRef.current
    ) {
      return;
    }

    desktopLoginStartedRef.current = true;
    const timer = window.setTimeout(() => {
      void handleLogin({ useHybrid: true });
    }, 50);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isDesktop, mode, loginStep, accountStatus?.hasPasskey, user]);

  // iPhone/phone opened from iPad QR: start local Passkey and complete handoff for the iPad.
  useEffect(() => {
    if (
      isDesktop ||
      isIPad ||
      !fromQrHandoff ||
      mode !== "login" ||
      loginStep !== "action" ||
      !accountStatus?.hasPasskey ||
      !handoffId ||
      user ||
      phoneQrLoginStartedRef.current
    ) {
      return;
    }

    phoneQrLoginStartedRef.current = true;
    const timer = window.setTimeout(() => {
      void handleLogin();
    }, 50);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    isDesktop,
    isIPad,
    fromQrHandoff,
    mode,
    loginStep,
    accountStatus?.hasPasskey,
    handoffId,
    user,
  ]);

  // iPad waits for the phone to finish Passkey, then claims the handoff session.
  useEffect(() => {
    if (!isIPad || !handoffId || !waitingForOtherDevice || user) {
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
              setWaitingForOtherDevice(false);
              setHandoffId(null);
              setMessage("Sesja QR wygasła. Wygeneruj kod ponownie.");
            }
            return;
          }

          const data = (await response.json()) as {
            status: string;
            user: User;
          };

          if (data.status === "complete" && data.user) {
            setUser(data.user);
            resetLoginFlow();
            setMessage("Zalogowano na iPadzie po autoryzacji na iPhonie.");
          }
        } catch {
          // Keep polling until success or expiry.
        }
      })();
    }, 2000);

    return () => {
      window.clearInterval(interval);
    };
  }, [isIPad, handoffId, waitingForOtherDevice, user]);

  function resetLoginFlow() {
    setLoginStep("email");
    setAccountStatus(null);
    setMessage(null);
    setHandoffId(null);
    setWaitingForOtherDevice(false);
    setFromQrHandoff(false);
    desktopLoginStartedRef.current = false;
    phoneQrLoginStartedRef.current = false;
  }

  function switchMode(nextMode: Mode) {
    setMode(nextMode);
    resetLoginFlow();
    setPassword("");
    setConfirmPassword("");
    setRegisterAccountStatus(null);
    setPasswordResetSent(false);
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

  async function handleForgotPassword() {
    setForgotLoading(true);
    setMessage(null);
    setPasswordResetSent(false);

    try {
      const response = await fetch("/api/auth/password/forgot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as { message?: string };
      setPasswordResetSent(true);
      setMessage(data.message ?? "Jeśli konto istnieje, wysłaliśmy link do resetu hasła.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się wysłać linku resetu");
    } finally {
      setForgotLoading(false);
    }
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
        throw new Error("Konto nie istnieje. Użyj zakładki Rejestracja lub odzyskiwanie.");
      }

      setEmail(targetEmail.trim().toLowerCase());
      setAccountStatus(status);
      setLoginStep("action");
      setMode("login");
      desktopLoginStartedRef.current = false;
      phoneQrLoginStartedRef.current = false;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Nie udało się sprawdzić konta");
    } finally {
      setLoading(false);
    }
  }

  async function handleCheckAccount() {
    await loadExistingAccount(email);
  }

  async function startOtherMobileDeviceLogin() {
    setMessage(null);
    setWaitingForOtherDevice(true);

    try {
      const response = await fetch("/api/auth/handoff/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      if (!response.ok) {
        throw new Error(await readError(response));
      }

      const data = (await response.json()) as { handoffId: string };
      setHandoffId(data.handoffId);
    } catch (error) {
      setWaitingForOtherDevice(false);
      setHandoffId(null);
      setMessage(
        error instanceof Error ? error.message : "Nie udało się wygenerować kodu QR",
      );
    }
  }

  async function handleRegister(allowExistingAccount = false) {
    setLoading(true);
    setMessage(null);

    try {
      if (!allowExistingAccount) {
        if (registerAccountStatus?.exists) {
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
          confirmPassword: allowExistingAccount
            ? undefined
            : registerAccountExists
              ? password
              : confirmPassword,
          allowExistingAccount,
          preferHybrid: isDesktop,
        }),
      });

      if (!optionsResponse.ok) {
        throw new Error(await readError(optionsResponse));
      }

      const options = (await optionsResponse.json()) as PublicKeyCredentialCreationOptionsJSON;
      const attestation = (
        isDesktop
          ? await startHybridRegistration(options)
          : await startRegistration({ optionsJSON: options })
      ) as RegistrationResponseJSON;

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
      const isRecovery =
        !allowExistingAccount && Boolean(registerAccountStatus?.exists && registerAccountStatus.hasPasskey);
      const successMessage = fromQrHandoff
        ? "Passkey potwierdzony. Możesz wrócić do iPada — sesja powinna się zsynchronizować."
        : allowExistingAccount
          ? "Passkey utworzony. Zalogowano."
          : isRecovery
            ? isDesktop
              ? "Nowy Passkey utworzony na telefonie. Zalogowano."
              : "Nowy Passkey utworzony. Zalogowano."
            : isDesktop
              ? "Konto i Passkey utworzone na telefonie. Zalogowano na desktopie."
              : "Konto i Passkey utworzone.";
      resetLoginFlow();
      setMessage(successMessage);
    } catch (error) {
      if (isWebAuthnCancelError(error)) {
        setMessage(
          isDesktop
            ? "Anulowano. Zeskanuj kod QR telefonem albo spróbuj ponownie."
            : "Anulowano tworzenie Passkey.",
        );
      } else {
        setMessage(
          error instanceof Error ? error.message : "Rejestracja lub odzyskiwanie nie powiodły się",
        );
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleLogin(options?: { useHybrid?: boolean }) {
    // Hybrid FIDO QR works on desktop browsers. iPad/WebKit cannot show it reliably —
    // that path uses startOtherMobileDeviceLogin() + URL QR instead.
    const useHybrid = options?.useHybrid === true || isDesktop;
    setLoading(true);
    setMessage(null);
    if (useHybrid) {
      setWaitingForOtherDevice(true);
    }

    try {
      const optionsResponse = await fetch("/api/auth/login/options", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, preferHybrid: useHybrid }),
      });

      if (!optionsResponse.ok) {
        throw new Error(await readError(optionsResponse));
      }

      const webauthnOptions =
        (await optionsResponse.json()) as PublicKeyCredentialRequestOptionsJSON;
      const assertion = (
        useHybrid
          ? await startHybridAuthentication(webauthnOptions)
          : await startAuthentication({ optionsJSON: webauthnOptions })
      ) as AuthenticationResponseJSON;

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
      const successMessage = fromQrHandoff
        ? "Passkey potwierdzony. Możesz wrócić do iPada — logowanie dokończy się automatycznie."
        : useHybrid
          ? "Zalogowano na desktopie po Passkey z telefonu."
          : "Zalogowano przez Passkey.";
      resetLoginFlow();
      setMessage(successMessage);
    } catch (error) {
      if (isWebAuthnCancelError(error)) {
        setMessage(
          useHybrid
            ? "Anulowano. Zeskanuj kod QR z okna przeglądarki telefonem albo spróbuj ponownie."
            : fromQrHandoff
              ? "Anulowano. Potwierdź Passkey na tym telefonie, aby dokończyć logowanie na iPadzie."
              : "Anulowano logowanie Passkey.",
        );
        if (fromQrHandoff) {
          phoneQrLoginStartedRef.current = false;
        }
      } else {
        setMessage(error instanceof Error ? error.message : "Logowanie nie powiodło się");
      }
    } finally {
      setLoading(false);
      if (useHybrid) {
        setWaitingForOtherDevice(false);
      }
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
  const isRecoveryAccount = Boolean(registerAccountExists && registerAccountStatus?.hasPasskey);
  const passwordsMismatch =
    !registerAccountExists && confirmPassword.length > 0 && password !== confirmPassword;
  const passwordTooShort =
    !registerAccountExists && password.length > 0 && password.length < 8;
  const registerPasswordIsValid = registerAccountExists
    ? password.length > 0
    : password.length >= 8 && password === confirmPassword && confirmPassword.length > 0;
  const otherDeviceAuthUrl =
    isIPad && waitingForOtherDevice && handoffId && emailIsValid
      ? buildMobileAuthUrl({
          mode: "login",
          email,
          step: "action",
          handoffId,
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
      <p className="badge">
        {isDesktop
          ? "Autoryzacja przez telefon"
          : fromQrHandoff
            ? "Dokończ logowanie na iPadzie"
            : "Mobilna autoryzacja Passkey"}
      </p>
      <h1>{mode === "login" ? "Logowanie" : "Rejestracja lub odzyskiwanie"}</h1>
      <p className="muted">
        {isDesktop
          ? "Na desktopie logowanie odbywa się przez kod QR przeglądarki. Passkey działa wyłącznie na telefonie."
          : fromQrHandoff
            ? "Potwierdź Passkey na tym telefonie. iPad zaloguje się automatycznie."
            : "Użyj Face ID, Touch ID, odcisku palca lub kodu PIN urządzenia."}
        {!isDesktop &&
          !fromQrHandoff &&
          platformAvailable === false &&
          " Brak autentykatora platformowego na tym urządzeniu."}
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
          Rejestracja lub odzyskiwanie
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
              disabled={loading || waitingForOtherDevice}
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
                  ? isDesktop
                    ? " Zaloguj się skanując kod QR telefonem."
                    : fromQrHandoff
                      ? " Potwierdź Passkey, aby dokończyć logowanie na iPadzie."
                      : " Możesz zalogować się przez Passkey."
                  : " To konto nie ma jeszcze Passkey."}
              </p>

              {accountStatus.hasPasskey && !fromQrHandoff && (
                <p className="hint">
                  Utracony Passkey? Odzyskaj dostęp hasłem w zakładce Rejestracja lub odzyskiwanie.
                </p>
              )}

              {isDesktop && accountStatus.hasPasskey && (
                <div className="desktop-qr-guide">
                  <p className="hint">
                    Przeglądarka pokazuje natywny kod QR. Zeskanuj go aparatem telefonu — system
                    zaproponuje Passkey do tej witryny, bez otwierania strony w przeglądarce na
                    telefonie. Urządzenia powinny być blisko siebie (Bluetooth).
                  </p>
                  {loading && <p className="hint">Oczekiwanie na Passkey z telefonu…</p>}
                </div>
              )}

              {isDesktop && !accountStatus.hasPasskey && (
                <p className="warning">
                  Utwórz Passkey w zakładce Rejestracja lub odzyskiwanie — przeglądarka pokaże
                  kod QR, a klucz powstanie na telefonie.
                </p>
              )}

              {isIPad && accountStatus.hasPasskey && !waitingForOtherDevice && (
                <p className="hint">
                  Możesz użyć Passkey na tym iPadzie albo wygenerować kod QR i zalogować się
                  Passkeyem z iPhone’a.
                </p>
              )}

              {otherDeviceAuthUrl && (
                <MobileAuthQr
                  url={otherDeviceAuthUrl}
                  title="Zeskanuj iPhone’em"
                  description="Zeskanuj kod aparatem iPhone’a, potwierdź Passkey na telefonie — ten iPad zaloguje się automatycznie."
                />
              )}

              {waitingForOtherDevice && isIPad && (
                <p className="hint">Oczekiwanie na logowanie z iPhone’a…</p>
              )}

              {message && <p className={message.startsWith("Anulowano") ? "hint" : "error"}>{message}</p>}

              {isDesktop ? (
                accountStatus.hasPasskey ? (
                  <button
                    className="button"
                    type="button"
                    onClick={() => {
                      desktopLoginStartedRef.current = true;
                      void handleLogin({ useHybrid: true });
                    }}
                    disabled={loading}
                  >
                    {loading ? "Oczekiwanie na telefon…" : "Pokaż kod QR ponownie"}
                  </button>
                ) : (
                  <button
                    className="button"
                    type="button"
                    onClick={() => switchMode("register")}
                    disabled={loading}
                  >
                    Przejdź do rejestracji lub odzyskiwania
                  </button>
                )
              ) : accountStatus.hasPasskey ? (
                <>
                  {!waitingForOtherDevice && (
                    <button
                      className="button"
                      type="button"
                      onClick={() => void handleLogin()}
                      disabled={loading}
                    >
                      {loading
                        ? fromQrHandoff
                          ? "Potwierdź Passkey…"
                          : "Oczekiwanie na urządzenie..."
                        : fromQrHandoff
                          ? "Potwierdź Passkey"
                          : "Zaloguj przez Passkey"}
                    </button>
                  )}
                  {isIPad && (
                    <button
                      className="button cross-device"
                      type="button"
                      onClick={() => void startOtherMobileDeviceLogin()}
                      disabled={loading}
                    >
                      <MobileDeviceIcon />
                      <span>
                        {waitingForOtherDevice
                          ? "Wygeneruj nowy kod QR"
                          : "Zaloguj się na innym urządzeniu mobilnym"}
                      </span>
                    </button>
                  )}
                </>
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
          {!registerAccountExists && (
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
          )}

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
                setPasswordResetSent(false);
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

          {registerAccountExists && (
            <button
              className="text-link"
              type="button"
              onClick={() => void handleForgotPassword()}
              disabled={loading || forgotLoading || !emailIsValid}
            >
              {forgotLoading ? "Wysyłanie…" : "Nie pamiętam hasła"}
            </button>
          )}

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
            {isRecoveryAccount
              ? isDesktop
                ? "Utracony Passkey? Podaj hasło, a potem zeskanuj kod QR telefonem, aby utworzyć nowy klucz."
                : "Utracony Passkey? Podaj hasło konta, aby utworzyć nowy Passkey i odzyskać dostęp."
              : isDesktop
                ? registerAccountExists
                  ? "Podaj aktualne hasło. Potem zeskanuj kod QR telefonem, aby utworzyć Passkey na telefonie."
                  : "Utworzysz konto z hasłem. Passkey powstanie na telefonie po zeskanowaniu kodu QR z przeglądarki."
                : registerAccountExists
                  ? "To konto już istnieje. Podaj aktualne hasło, aby dodać Passkey."
                  : "Utworzysz nowe konto z hasłem i przypiszesz do niego Passkey."}
          </p>

          {passwordResetSent && (
            <p className="message">
              Sprawdź skrzynkę e-mail i otwórz link resetu. Po zmianie hasła wrócisz tutaj, żeby
              utworzyć nowy Passkey.
            </p>
          )}

          {message && (
            <p className={message.startsWith("Hasło zmienione") || passwordResetSent ? "message" : "error"}>
              {message}
            </p>
          )}

          <button
            className="button"
            type="submit"
            disabled={loading || !emailIsValid || !registerPasswordIsValid}
          >
            {loading
              ? isDesktop
                ? "Zeskanuj kod QR telefonem…"
                : "Oczekiwanie na urządzenie..."
              : isRecoveryAccount
                ? isDesktop
                  ? "Odzyskaj Passkey na telefonie"
                  : "Odzyskaj dostęp — nowy Passkey"
                : isDesktop
                  ? "Utwórz Passkey na telefonie"
                  : "Zarejestruj konto z Passkey"}
          </button>
        </form>
      )}
    </div>
  );
}
