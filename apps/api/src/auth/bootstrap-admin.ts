import 'dotenv/config';
import { ConfigService } from '@nestjs/config';
import * as argon2 from 'argon2';
import { PrismaService } from '../prisma/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline/promises';

const ARGON2_OPTIONS: argon2.HashOptions = {
  type: argon2.argon2id,
  memoryCost: 19_456,
  timeCost: 2,
  parallelism: 1,
};

function promptSecret(label: string): Promise<string> {
  const input = process.stdin;
  if (!input.isTTY || typeof input.setRawMode !== 'function') {
    return Promise.reject(
      new Error('Bootstrap requires an interactive terminal'),
    );
  }

  return new Promise((resolve, reject) => {
    const wasRaw = input.isRaw;
    let value = '';
    process.stdout.write(label);
    input.setRawMode(true);
    input.resume();

    const finish = (error?: Error) => {
      input.off('data', onData);
      input.setRawMode(wasRaw ?? false);
      process.stdout.write('\n');
      if (error) reject(error);
      else resolve(value);
    };
    const onData = (chunk: Buffer | string) => {
      for (const character of chunk.toString()) {
        if (character === '\u0003') {
          finish(new Error('Bootstrap cancelled'));
          return;
        }
        if (character === '\r' || character === '\n') {
          finish();
          return;
        }
        if (character === '\u007f' || character === '\b') {
          value = value.slice(0, -1);
        } else if (character >= ' ') {
          value += character;
        }
      }
    };
    input.on('data', onData);
  });
}

function createOrganizationSlug(name: string): string {
  const base = name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 70)
    .replace(/-+$/g, '');
  return `${base || 'workspace'}-${randomUUID().slice(0, 8)}`;
}

async function main() {
  if (!process.stdin.isTTY) {
    throw new Error('Bootstrap requires an interactive terminal');
  }
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('DATABASE_URL is required');

  const prompts = createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  const email = (await prompts.question('Initial owner email: '))
    .trim()
    .toLowerCase();
  const name = (await prompts.question('Initial owner name: ')).trim();
  const organizationName = (
    await prompts.question('Initial workspace name: ')
  ).trim();
  prompts.close();

  if (
    !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ||
    email.length > 254 ||
    name.length < 1 ||
    name.length > 100 ||
    organizationName.length < 1 ||
    organizationName.length > 100
  ) {
    throw new Error('Email, name, or workspace name is invalid');
  }

  let password = await promptSecret('Initial owner password (hidden): ');
  const confirmation = await promptSecret('Confirm password (hidden): ');
  if (password.length < 12 || password.length > 128) {
    throw new Error('Password must be between 12 and 128 characters');
  }
  if (password !== confirmation) throw new Error('Passwords do not match');

  const passwordHash = await argon2.hash(password, ARGON2_OPTIONS);
  password = '';
  const config = new ConfigService({ DATABASE_URL: databaseUrl });
  const prisma = new PrismaService(config);
  try {
    await prisma.$connect();
    await prisma.$transaction(
      async (transaction) => {
        if ((await transaction.user.count()) !== 0) {
          throw new Error('Bootstrap is available only on an empty database');
        }

        const user = await transaction.user.create({
          data: {
            email,
            name,
            passwordHash,
            emailVerifiedAt: new Date(),
          },
          select: { id: true },
        });
        const organization = await transaction.organization.create({
          data: {
            name: organizationName,
            slug: createOrganizationSlug(organizationName),
          },
          select: { id: true },
        });
        await transaction.membership.create({
          data: {
            userId: user.id,
            organizationId: organization.id,
            role: 'OWNER',
          },
          select: { id: true },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    process.stdout.write(
      'Initial verified owner and workspace created. Remove bootstrap access from the deployment operator workflow.\n',
    );
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  const safeMessage =
    error instanceof Error &&
    [
      'Bootstrap requires an interactive terminal',
      'Bootstrap cancelled',
      'Email, name, or workspace name is invalid',
      'Password must be between 12 and 128 characters',
      'Passwords do not match',
      'Bootstrap is available only on an empty database',
      'DATABASE_URL is required',
    ].includes(error.message)
      ? error.message
      : 'Bootstrap failed. Check service availability and ensure the database is empty.';
  process.stderr.write(`${safeMessage}\n`);
  process.exitCode = 1;
});
