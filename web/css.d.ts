// Type declarations for CSS imports used in layout.tsx and other files.
// Next.js handles CSS bundling; this file allows TypeScript to accept CSS module imports.
declare module '*.css' {
  const content: Record<string, string>;
  export default content;
}
