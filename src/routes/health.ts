import { createFileRoute } from "@tanstack/react-router";
import { getSql } from "@/lib/db";
import { healthGate } from "@/lib/health";

export const Route = createFileRoute("/health")({
  server: {
    handlers: {
      GET: ({ request }) => healthGate(request, getSql),
    },
  },
});
