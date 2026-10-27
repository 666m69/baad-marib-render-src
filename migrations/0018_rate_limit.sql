-- Better Auth rate-limit counters (sign-in / sign-up per client IP).
-- See src/lib/auth/rate-limit.ts. Same shape as the Better Auth CLI output.
create table if not exists "rateLimit" (
  "id" text not null primary key,
  "key" text not null unique,
  "count" integer not null,
  "lastRequest" bigint not null
);
