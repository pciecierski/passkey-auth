const databaseUrl = process.env.DATABASE_URL?.trim();

if (databaseUrl) {
  process.exit(0);
}

const isRailway = process.env.RAILWAY_ENVIRONMENT !== undefined;

console.error(
  [
    "DATABASE_URL is not set.",
    "",
    isRailway
      ? [
          "Railway setup:",
          "1. In your project, click New → Database → PostgreSQL",
          "2. Open your web service (passkey-auth) → Variables",
          "3. Add variable:",
          "   DATABASE_URL = ${{Postgres.DATABASE_URL}}",
          "   (use the Reference tab and select the Postgres service)",
          "4. Redeploy the web service",
        ].join("\n")
      : [
          "Local setup:",
          "1. Copy .env.example to .env",
          "2. For SQLite: DATABASE_URL=\"file:./dev.db\"",
          "3. For Docker Postgres: run npm run db:up and use the postgres URL from .env.example",
        ].join("\n"),
  ].join("\n"),
);

process.exit(1);
