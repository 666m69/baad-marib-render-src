import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { healthResponse } from "@/lib/health";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: () => healthResponse(getSql),
    },
  },
});
