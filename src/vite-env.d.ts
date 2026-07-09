/// <reference types="vite/client" />

// @fontsource(-variable) packages ship only CSS with no type declarations.
// A bare `import "pkg"` resolves fine without this, but dynamic `import("pkg")`
// (used by ensureUiFontLoaded in uiFontSettings.ts) needs a module type to await.
declare module "@fontsource-variable/*";
declare module "@fontsource/*";
