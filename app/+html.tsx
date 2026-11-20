import { ScrollViewStyleReset, useServerDocumentContext } from "expo-router/html";
import type { PropsWithChildren } from "react";

/**
 * Web-only HTML shell used for static rendering. The inline style keeps the
 * page dark (or light, following the OS) before JavaScript loads, avoiding a
 * white flash.
 */
export default function Root({ children }: PropsWithChildren) {
  // Expo Router passes the bundle's scripts, styles and metadata through this
  // context; they must be rendered for the page to load.
  const { htmlAttributes, bodyAttributes, headNodes, bodyNodes } = useServerDocumentContext();
  return (
    <html lang="en" {...htmlAttributes}>
      <head>
        <meta charSet="utf-8" />
        <meta httpEquiv="X-UA-Compatible" content="IE=edge" />
        <meta name="viewport" content="width=device-width, initial-scale=1, shrink-to-fit=no, viewport-fit=cover" />
        <meta name="description" content="Discover movies, build watchlists, and see what your friends want to watch." />
        <meta name="theme-color" content="#121212" />
        <title>eyelevel</title>
        <ScrollViewStyleReset />
        <style dangerouslySetInnerHTML={{ __html: baseStyles }} />
        {headNodes}
      </head>
      <body {...bodyAttributes}>
        {children}
        {bodyNodes}
      </body>
    </html>
  );
}

const baseStyles = `
html, body { background-color: #121212; color: #E0E0E0; }
@media (prefers-color-scheme: light) {
  html, body { background-color: #FAFAFA; color: #3C4858; }
}
* { -webkit-tap-highlight-color: transparent; }
`;
