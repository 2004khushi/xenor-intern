// app/root.tsx
import type { LinksFunction } from "@remix-run/node"; // <-- IMPORT THIS
import { cssBundleHref } from "@remix-run/css-bundle"; // <-- IMPORT THIS
import {
  Links,
  Meta,
  Outlet,
  Scripts,
  ScrollRestoration,
} from "@remix-run/react";

import stylesheet from "/app/styles/dashboard.css";

// 1. Add the type for the links function
export const links: LinksFunction = () => [
  // 2. Include the CSS bundle if it exists (for other styles)
  ...(cssBundleHref ? [{ rel: "stylesheet", href: cssBundleHref }] : []),
  // 3. Link your custom dashboard styles
  { rel: "stylesheet", href: stylesheet },
];

export default function App() {
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <link rel="preconnect" href="https://cdn.shopify.com/" />
        <link
          rel="stylesheet"
          href="https://cdn.shopify.com/static/fonts/inter/v4/styles.css"
        />
        <Meta />
        <Links />
      </head>
      <body>
        <Outlet />
        <ScrollRestoration />
        <Scripts />
      </body>
    </html>
  );
}