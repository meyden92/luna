import { sql } from 'drizzle-orm';
import { db } from '../src/db/client';
import { listGallery } from '../src/db/queries/files';
import { user } from '../src/db/schema/auth';

let captured: { sql: string; params: unknown[] } | undefined;
const handle = {
  select(fields: any) {
    const builder = (db as any).select(fields);
    const from = builder.from.bind(builder);
    builder.from = (source: any) => {
      const q = from(source);
      q.then = (onOk: any, onErr: any) => {
        captured = q.toSQL();
        return Promise.resolve([]).then(onOk, onErr);
      };
      return q;
    };
    return builder;
  },
} as any;

const [owner] = await db.select({ id: user.id }).from(user).limit(1);
await listGallery(owner!.id, { limit: 30 }, handle);
console.log('CAPTURED:', captured?.sql);
console.log('PARAMS:', captured?.params);
process.exit(0);
