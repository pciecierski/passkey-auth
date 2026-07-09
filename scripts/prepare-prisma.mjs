import { copyFileSync } from "fs";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const prismaDir = join(__dirname, "..", "prisma");

const databaseUrl = process.env.DATABASE_URL ?? "";
const isPostgres =
  process.env.RAILWAY_ENVIRONMENT !== undefined ||
  databaseUrl.startsWith("postgres://") ||
  databaseUrl.startsWith("postgresql://");

const source = isPostgres ? "schema.postgresql.prisma" : "schema.sqlite.prisma";

copyFileSync(join(prismaDir, source), join(prismaDir, "schema.prisma"));

console.log(`Prisma: using ${source}`);
