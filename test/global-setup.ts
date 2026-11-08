import { PostgreSqlContainer, type StartedPostgreSqlContainer } from '@testcontainers/postgresql';
import type { TestProject } from 'vitest/node';

declare module 'vitest' {
  export interface ProvidedContext {
    testDatabaseUrl: string;
  }
}

let container: StartedPostgreSqlContainer | undefined;

export async function setup(project: TestProject) {
  const explicit = process.env.TEST_DATABASE_URL;
  if (explicit) {
    const dbName = new URL(explicit).pathname.replace(/^\//, '');
    if (!/test/i.test(dbName) || explicit === process.env.DATABASE_URL) {
      throw new Error('TEST_DATABASE_URL debe apuntar a una base descartable cuyo nombre contenga "test"');
    }
    project.provide('testDatabaseUrl', explicit);
    return;
  }

  container = await new PostgreSqlContainer('postgres:18-alpine').withDatabase('cocos_test').start();
  project.provide('testDatabaseUrl', container.getConnectionUri());
}

export async function teardown() {
  await container?.stop();
}
