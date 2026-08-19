/**
 * Schema barrel — the single object handed to the Drizzle client and to
 * `defineRelations`. Modules mirror how `src/libs` already groups the domains.
 *
 * biome-ignore-all lint/performance/noBarrelFile: Drizzle takes the schema as
 * one object — `drizzle({ client, relations })` and `defineRelations(schema, ...)`
 * both need every table reachable from a single import. The barrel is structural,
 * not convenience.
 */
export * from './admin';
export * from './ai';
export * from './analytics';
export * from './auth';
export * from './automation';
export * from './features';
export * from './files';
