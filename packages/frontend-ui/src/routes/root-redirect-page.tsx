"use client";

import { useEffect } from "react";

import { palette } from "../shared/design-tokens.js";
import { useRouter } from "../routing/routing.js";

export function RootRedirectPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/steps");
  }, [router]);
  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        color: palette.textLabel,
      }}
    >
      起動しています…
    </main>
  );
}
