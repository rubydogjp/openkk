"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { palette } from "../shared/design-tokens";

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
