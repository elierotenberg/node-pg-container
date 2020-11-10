# pg-container

Utilities for manipulating Postgres containers from Node.

## Motivation

Most Node applications persist their state against a database, and it is often a Postgres backend. When performing integration or end-to-end testing, you need an actual postgres instance running alongside your tests. You typically need to perform tests concurrently, and to avoid mutation conflicts, you need separate databases.

A common approach is to have a `docker-compose.yml` file for tests, and to run `docker-compose` in a separate shell prior to running the tests, and setup scripts to create multiple databases for your tests.

This works fine, but what if we could instead control this setup programmtically, right from your tests code, such a Jest tests?

## Example

```ts
const parentConfig = {
  user: "...",
  password: "...",
};
const pgContainer = new PgContainer(parentConfig);
const pgChildrenPool = new PgChildrenPool({ parentConfig });

beforeAll(async () => {
  await pgContainer.create();
});

afterAll(async () => {
  await pgContainer.remove();
});

test("...", async () => {
  await pgChildrenPool.useChild((childConfig) => {
    const client = new pg.Client(childConfig);
    // use client for tests
    await client.end();
  });
});
```

The library ensures a single postgres container is running, but each child from the pool is a unique, separate database, where you can mutate the schema and the data without impacting other test cases.

## Installation

`npm i --save-dev pg-container`

or

`yarn add --dev pg-container`

You also need core peer dependencies:

`npm i --save-dev dockerode pg`

Optionally you may want to use `pg-native`, `pg-promise` or any pg-related lib.

## API

### PgContainer

An instance of `PgContainer` represents a single Postgres container. It is typically a disposable container that will be recreated/removed each time you run tests.

```ts
const parentConfig = {
  host: "localhost",
  port: 5432,
  user: "user",
  password: "password",
  database: "default database",
  connectionTimeousMillis, // optional
};
const pgContainer = new PgContainer(parentConfig);

await pgContainer.find(); // null if container doesn't exist

await pgContainer.remove(); // remove existing container

await pgContainer.create(); // without options, a container with an anonymous data volume with the default "postgres:latest" image will be created
await pgContainer.create({
  image: "postgres:12",
  pgData: join(process.cwd(), "pg-test-data"), // optional local data volume binding
});
```

### PgChildrenPool

An instance of `PgChildrenPool` represents a pool of "children" databases from a postgres container. Each child created in the pool will have its own, separated database. It is best used in conjunction with `PgContainer`, although it can also be used in standalone.

```ts
const pgChildrenPool = new PgChildrenPool({
  parentConfig,
  childDatabasePrefix: "child", // optional
});

const child = await pgChildrenPool.create(); // anonymous child with a default database name
const child = await pgChildrenPool.create("custom_database_name");
const childClient = new pg.Pool(child); // or e.g. pg-promise
await childClient.query("...");
await childClient.end();
await pgChildrenPool.remove(child); // drop underlying database

// convenient helper that takes care of create/remove within a try/finally block
await pgChildrenPool.useChild((child) => {
  // ...
});
```

### Misc utilities

```ts
// Wait until a postgres client successfully connects or a timeout has expired
await waitForInteractive(
  {
    host,
    port,
    user,
    password,
    database,
    connectionTimeoutMillis, // optional
  },
  {
    timeout: 10000, // optional
    retryInterval: 333, // optional
  }, // optional
);
```

## Typescript

This library is written in Typescript and ships it own type definitions.
