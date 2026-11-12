"use client";

import { useMemo } from "react";
import NextLink from "next/link.js";
import { usePathname, useRouter, useSearchParams } from "next/navigation.js";
import type {
  OpenkkLinkProps,
  OpenkkRouter,
  OpenkkRouting,
} from "@rubydogjp/openkk-frontend-ui";

function useNextRouter(): OpenkkRouter {
  const router = useRouter();
  return useMemo(
    () => ({
      push: (path) => router.push(path),
      replace: (path) => router.replace(path),
      replaceKeepingScroll: (path) => router.replace(path, { scroll: false }),
      back: () => router.back(),
    }),
    [router],
  );
}

function NextRoutedLink(props: OpenkkLinkProps) {
  const className =
    props.className == null ? {} : { className: props.className };
  return (
    <NextLink href={props.href} style={props.style} {...className}>
      {props.children}
    </NextLink>
  );
}

export const nextRouting: OpenkkRouting = {
  useRouter: useNextRouter,
  usePathname,
  useSearchParams,
  Link: NextRoutedLink,
};
