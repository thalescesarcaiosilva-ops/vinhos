import { createFileRoute, redirect } from "@tanstack/react-router";

/** Mantém links antigos de /contato funcionando. */
export const Route = createFileRoute("/contato")({
  beforeLoad: () => {
    throw redirect({ to: "/fale-conosco" });
  },
});
