import { createFileRoute, redirect } from "@tanstack/react-router";

/** Redireciona URLs antigas /pagina/* para /politicas/* (301). */
export const Route = createFileRoute("/pagina/$slug")({
  beforeLoad: ({ params }) => {
    throw redirect({
      to: "/politicas/$slug",
      params: { slug: params.slug },
      statusCode: 301,
      replace: true,
    });
  },
  component: () => null,
});
