/**
 * Set a User's Username and password from the command line.
 *
 *   bun scripts/auth/set-credentials.ts <email-or-user-id>
 *
 * LunaShare sends no email, so this is the only account recovery there is, and
 * the only way into an instance with no credential Account yet. It loads the
 * real auth instance and so needs the app's full environment — run it where the
 * app runs.
 */
import { CredentialsError, setUserCredentials } from '../../src/libs/auth/credentials';
import { PASSWORD_MIN_LENGTH, passwordSchema, usernameSchema } from '../../src/schemas/credentials-schema';

function fail(message: string): never {
  console.error(`\n✖ ${message}\n`);
  process.exit(1);
}

/**
 * Input read from stdin but not yet consumed. A pipe delivers every line in one
 * chunk, so discarding the remainder after a prompt loses every later answer.
 */
let pending = '';

/** Takes the next complete line out of `pending`, or null if there is none. */
function takeBufferedLine(): string | null {
  const breakAt = pending.search(/\r|\n/);
  if (breakAt === -1) return null;
  const line = pending.slice(0, breakAt);
  pending = pending.slice(breakAt + 1).replace(/^\n/, '');
  return line;
}

/** Reads a line from stdin, echoing it or not. */
async function prompt(question: string, { hidden = false } = {}): Promise<string> {
  process.stdout.write(question);

  const buffered = takeBufferedLine();
  if (buffered !== null) {
    if (hidden) process.stdout.write('\n');
    return buffered.trim();
  }

  const stdin = process.stdin;
  const wasRaw = stdin.isRaw;
  if (hidden && stdin.isTTY) stdin.setRawMode(true);
  stdin.resume();

  const answer = await new Promise<string>((resolve) => {
    const onData = (chunk: Buffer) => {
      pending += chunk.toString('utf8');

      // Ctrl-C has to be handled by hand while the terminal is raw.
      if (pending.includes('\u0003')) {
        if (hidden && stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
        process.stdout.write('\n');
        process.exit(130);
      }

      // Backspace, likewise: raw mode delivers it instead of applying it.
      pending = pending.replace(/[^\u007f\b]?[\u007f\b]/g, '');

      const line = takeBufferedLine();
      if (line === null) return;

      stdin.off('data', onData);
      if (hidden && stdin.isTTY) stdin.setRawMode(wasRaw ?? false);
      if (hidden) process.stdout.write('\n');
      stdin.pause();
      resolve(line);
    };

    stdin.on('data', onData);
  });

  return answer.trim();
}

async function main() {
  const identifier = process.argv[2];
  if (!identifier) fail('Usage: bun scripts/auth/set-credentials.ts <email-or-user-id>');

  const { findUserByEmailOrId } = await import('../../src/db/queries/auth');
  const target = await findUserByEmailOrId(identifier);

  if (!target) fail(`No User matches "${identifier}".`);

  console.log(`\nSetting credentials for ${target.name} <${target.email}>`);
  if (target.username) console.log(`Current Username: ${target.username}`);

  const typed = await prompt('\nUsername: ');
  const parsedUsername = usernameSchema.safeParse(typed);
  if (!parsedUsername.success) fail(parsedUsername.error.issues[0]?.message ?? 'Invalid username');

  const password = await prompt(`Password (min ${PASSWORD_MIN_LENGTH} chars): `, { hidden: true });
  const parsedPassword = passwordSchema.safeParse(password);
  if (!parsedPassword.success) fail(parsedPassword.error.issues[0]?.message ?? 'Invalid password');

  const confirmation = await prompt('Confirm password: ', { hidden: true });
  if (confirmation !== password) fail('Passwords do not match.');

  try {
    await setUserCredentials({ userId: target.id, username: typed, password });
  } catch (error) {
    if (error instanceof CredentialsError) fail(error.message);
    throw error;
  }

  console.log(`\n✔ ${target.email} can now sign in as "${typed}".\n`);
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
