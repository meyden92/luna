// Side-effect stylesheet imports (`import '@/styles/globals.css'`, third-party
// CSS) need a module declaration. CSS Modules deliberately get nothing here:
// every `*.module.css` has a generated `.d.ts` beside it (`bun run
// generate:css-types`), so importing a module without one, or a class it does
// not define, fails typecheck.
declare module '*.css' {}
