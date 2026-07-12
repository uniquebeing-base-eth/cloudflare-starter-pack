import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { initializeFarcasterMiniApp } from "../lib/farcaster";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "Shreds — Discover. Collect. Earn." },
      { name: "description", content: "Slash open digital packs. Discover stablecoins, collectible cards and knowledge on Celo & MiniPay." },
      { property: "og:title", content: "Shreds — Discover. Collect. Earn." },
      { property: "og:description", content: "Slash open digital packs. Discover stablecoins, collectibles and rare knowledge." },
      { property: "og:type", content: "website" },
      { property: "og:image", content: "https://shred.signalify.xyz/image.png" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:image", content: "https://shred.signalify.xyz/image.png" },
      // Farcaster Mini App embed — makes casts of this URL render as a launch card.
      {
        name: "fc:miniapp",
        content: JSON.stringify({
          version: "1",
          imageUrl: "https://shred.signalify.xyz/image.png",
          button: {
            title: "Launch Shreds",
            action: {
              type: "launch_miniapp",
              name: "Shreds",
              url: "https://shred.signalify.xyz",
              splashImageUrl: "https://shred.signalify.xyz/splash.png",
              splashBackgroundColor: "#0a0f0a",
            },
          },
        }),
      },
      // Backwards-compat for older Farcaster clients.
      {
        name: "fc:frame",
        content: JSON.stringify({
          version: "1",
          imageUrl: "https://shred.signalify.xyz/image.png",
          button: {
            title: "Launch Shreds",
            action: {
              type: "launch_frame",
              name: "Shreds",
              url: "https://shred.signalify.xyz",
              splashImageUrl: "https://shred.signalify.xyz/splash.png",
              splashBackgroundColor: "#0a0f0a",
            },
          },
        }),
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/icon.png", type: "image/png" },
      { rel: "apple-touch-icon", href: "/icon.png" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700;800&display=swap" },
      // Preload pack + wordmark so home screen paints without pop-in.
      { rel: "preload", as: "image", href: "/shreds-wordmark.png" },
      { rel: "preload", as: "image", href: "/packs/starter.png" },
      { rel: "preload", as: "image", href: "/packs/mystery.png" },
      { rel: "preload", as: "image", href: "/packs/alpha.png" },
      { rel: "preload", as: "image", href: "/packs/legendary.png" },
      { rel: "preload", as: "image", href: "/packs/explorer.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    const initialize = () => {
      const run = () => {
        void initializeFarcasterMiniApp();
      };

      if (document.readyState === "complete") {
        window.requestAnimationFrame(run);
        window.setTimeout(run, 250);
        return;
      }

      const onLoad = () => {
        window.requestAnimationFrame(run);
        window.setTimeout(run, 250);
        window.removeEventListener("load", onLoad);
      };

      window.addEventListener("load", onLoad);
    };

    if (typeof window === "undefined") return undefined;

    initialize();
    return () => {
      window.removeEventListener("load", () => undefined);
    };
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <Outlet />
    </QueryClientProvider>
  );
}
