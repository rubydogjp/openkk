"use client";

import {
  createContext,
  useContext,
  type ComponentType,
  type CSSProperties,
  type ReactNode,
} from "react";
import { AppError } from "@rubydogjp/openkk-driver";

export type OpenkkRouter = {
  push(path: string): void;
  replace(path: string): void;
  replaceKeepingScroll(path: string): void;
  back(): void;
};

export type OpenkkSearchParams = {
  get(name: string): string | null;
  toString(): string;
};

export type OpenkkLinkProps = {
  href: string;
  className: string | null;
  style: CSSProperties;
  children: ReactNode;
};

export type OpenkkRouting = {
  useRouter: () => OpenkkRouter;
  usePathname: () => string;
  useSearchParams: () => OpenkkSearchParams;
  Link: ComponentType<OpenkkLinkProps>;
};

const OpenkkRoutingContext = createContext<OpenkkRouting | null>(null);

export function OpenkkRoutingProvider(props: {
  routing: OpenkkRouting;
  children: ReactNode;
}) {
  return (
    <OpenkkRoutingContext.Provider value={props.routing}>
      {props.children}
    </OpenkkRoutingContext.Provider>
  );
}

function useOpenkkRouting(): OpenkkRouting {
  const routing = useContext(OpenkkRoutingContext);
  if (routing == null) {
    throw new AppError({
      messageForDeveloper:
        "the routing hooks must be used within OpenkkRoutingProvider",
      messageForUser: "アプリの初期化に失敗しました",
      originalMessage: null,
      statusCode: null,
      code: null,
    });
  }
  return routing;
}

export function useRouter(): OpenkkRouter {
  return useOpenkkRouting().useRouter();
}

export function usePathname(): string {
  return useOpenkkRouting().usePathname();
}

export function useSearchParams(): OpenkkSearchParams {
  return useOpenkkRouting().useSearchParams();
}

export function Link(props: OpenkkLinkProps) {
  const { Link: RoutedLink } = useOpenkkRouting();
  return <RoutedLink {...props} />;
}
