/**
 * Audit coverage report (issue #45).
 *
 * The static half: which audited models actually have a write function that
 * audits them, and whether any unaudited model is being audited by mistake.
 * The old Prisma extension covered every model implicitly, so an over-eager port
 * is as wrong as a missing one — this reports both directions.
 *
 * Static analysis cannot prove an audit row appears at runtime; the DB-backed
 * assertions do that. What it does prove is that no audited model was quietly
 * skipped while a batch was ported, which is the failure this epic is most
 * exposed to because nothing else catches it — not the type checker, not the
 * schema diff, not the test suite.
 *
 *   bun run db:audit-coverage
 */
import { Glob } from 'bun';
import { AUDITED_MODELS, UNAUDITED_MODELS } from '../../src/db/audit';

const QUERY_MODULE_GLOB = 'src/db/queries/**/*.ts';

/** Every `model: 'X'` passed to an audit helper, with the file it came from. */
async function findAuditedModelUsages(): Promise<Map<string, string[]>> {
  const usages = new Map<string, string[]>();
  for await (const path of new Glob(QUERY_MODULE_GLOB).scan('.')) {
    const source = await Bun.file(path).text();
    // Matches both writeAuditLog({ model: 'X', ... }) and
    // writeAuditLogs(handle, 'X', ...), which is the bulk form.
    for (const match of source.matchAll(/writeAuditLogs?\s*\([^)]*?['"]([A-Z][A-Za-z]*)['"]/gs)) {
      const model = match[1];
      if (!model) continue;
      const files = usages.get(model) ?? [];
      if (!files.includes(path)) files.push(path);
      usages.set(model, files);
    }
    for (const match of source.matchAll(/model:\s*['"]([A-Z][A-Za-z]*)['"]/g)) {
      const model = match[1];
      if (!model) continue;
      const files = usages.get(model) ?? [];
      if (!files.includes(path)) files.push(path);
      usages.set(model, files);
    }
  }
  return usages;
}

const usages = await findAuditedModelUsages();

const covered = AUDITED_MODELS.filter((model) => usages.has(model));
const missing = AUDITED_MODELS.filter((model) => !usages.has(model));
const overEager = Object.keys(UNAUDITED_MODELS).filter((model) => usages.has(model));

console.log(`audited models covered by a write function: ${covered.length}/${AUDITED_MODELS.length}\n`);
for (const model of covered) console.log(`  ok       ${model.padEnd(24)} ${usages.get(model)?.join(', ')}`);

if (missing.length > 0) {
  console.log(`\nnot yet audited anywhere (${missing.length}):`);
  for (const model of missing) console.log(`  missing  ${model}`);
}

if (overEager.length > 0) {
  console.log(`\nAUDITED BUT SHOULD NOT BE (${overEager.length}) — the old implicit mechanism's mistake:`);
  for (const model of overEager) {
    console.log(`  wrong    ${model.padEnd(24)} ${UNAUDITED_MODELS[model]} — ${usages.get(model)?.join(', ')}`);
  }
}

// An over-eager audit is a defect now; a missing one is expected until every
// batch has landed, so it is reported but does not fail the run.
if (overEager.length > 0) process.exitCode = 1;
