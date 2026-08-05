// Ambient module declaration for CSS side-effect imports.
// TypeScript 6 enables noUncheckedSideEffectImports by default,
// requiring type declarations for bare `import '*.css'` statements.
// This file must remain a script (no top-level import/export) for wildcard patterns to work.
declare module '*.css';
