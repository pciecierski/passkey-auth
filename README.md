# Passkey Auth

Mobilna autoryzacja za pomocą **Passkey** (WebAuthn / FIDO2) zbudowana na Next.js.

## Funkcje

- Hasła + Passkey z weryfikacją konta przed logowaniem
- Mobile-first UI + manifest PWA (możliwość dodania do ekranu głównego)
- **PostgreSQL** + Prisma — dane przetrwają deploy na Railway
- Sesje oparte o bezpieczne ciasteczka HTTP-only

## Wymagania

- Node.js 20+
- HTTPS w produkcji (Passkey na urządzeniach mobilnych wymaga bezpiecznego kontekstu)

## Szybki start (lokalnie)

```bash
npm install
npm.cmd run dev
```

Pierwsze uruchomienie utworzy lokalną bazę SQLite (`prisma/dev.db`) automatycznie.

Aplikacja: http://localhost:3000

Opcjonalnie: `npm run db:up` + PostgreSQL w Dockerze, jeśli wolisz Postgres lokalnie.

## Deploy na Railway

1. Utwórz projekt na [Railway](https://railway.app) i połącz repozytorium.
2. Dodaj **PostgreSQL** (New → Database → PostgreSQL).
3. W serwisie aplikacji ustaw zmienne:
   - `DATABASE_URL` — `${{Postgres.DATABASE_URL}}` (referencja do bazy)
   - `SESSION_SECRET` — losowy sekret (np. `openssl rand -hex 32`)
   - `RP_ID` — domena Railway, np. `twoja-app.up.railway.app`
   - `ORIGIN` — `https://twoja-app.up.railway.app`
4. Deploy — przy starcie `npm run start` uruchomi `prisma migrate deploy` i utworzy tabele.

Dane (emaile, hasła, Passkey) są w PostgreSQL i **nie znikają po kolejnych deployach**.

## Test na telefonie

Passkey wymaga **HTTPS** poza localhostem. Do testów mobilnych użyj np.:

- [ngrok](https://ngrok.com/) — tunel HTTPS do lokalnego serwera
- wdrożenie na Vercel / własny serwer z certyfikatem SSL

Po uzyskaniu publicznego HTTPS URL zaktualizuj `.env`:

```env
RP_ID=twoja-domena.example
ORIGIN=https://twoja-domena.example
```

> `RP_ID` musi być domeną (bez protokołu i ścieżki), zgodną z adresem aplikacji.

## Struktura API

| Endpoint | Opis |
|----------|------|
| `POST /api/auth/register/options` | Generuje opcje rejestracji WebAuthn |
| `POST /api/auth/register/verify` | Weryfikuje nowy Passkey i tworzy sesję |
| `POST /api/auth/login/options` | Generuje opcje logowania |
| `POST /api/auth/login/verify` | Weryfikuje Passkey i tworzy sesję |
| `GET /api/auth/session` | Zwraca zalogowanego użytkownika |
| `DELETE /api/auth/session` | Wylogowanie |

## Uwagi produkcyjne

1. Ustaw silny `SESSION_SECRET` (np. `openssl rand -hex 32`)
2. Użyj HTTPS i poprawnego `RP_ID` / `ORIGIN`
3. Rozważ Redis zamiast pamięci procesu dla challenge store
4. Na iOS Safari i Android Chrome Passkey działa natywnie w przeglądarce

## Stack

- Next.js 15 (App Router)
- TypeScript
- Prisma + PostgreSQL
- [@simplewebauthn](https://simplewebauthn.dev/)
