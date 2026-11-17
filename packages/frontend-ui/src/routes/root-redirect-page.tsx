"use client";

import { useEffect } from "react";

import { palette, VIEWPORT_HEIGHT } from "../shared/design-tokens.js";
import { useRouter } from "../routing/routing.js";

export function RootRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/steps");
  }, [router]);
  return (
    <main
      style={{
        minHeight: VIEWPORT_HEIGHT,
        display: "grid",
        placeItems: "center",
        color: palette.textLabel,
      }}
    >
      起動しています…
    </main>
  );
}
