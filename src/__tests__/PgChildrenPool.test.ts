import { Client as PgClient } from "pg";

import { PgChildrenPool } from "../PgChildrenPool";
import { PgContainer } from "../PgContainer";
import { createTestContext } from "../TestUtils";

import {
  dataQuery,
  schemaUpQuery,
  selectUserActivityJoinQuery,
  selectUsersQuery,
} from "./fixtures";

jest.setTimeout(30000);

const { setup, teardown, createPgContainerProps } = createTestContext({
  containerNamePrefix: "PgChildrenPool",
  ports: [19101, 19200],
});

beforeAll(setup);

afterAll(teardown);

describe.only("PgChildrenPool", () => {
  test("create and remove single child", async () => {
    const pgContainerProps = createPgContainerProps();
    const pgContainer = new PgContainer(pgContainerProps);
    await pgContainer.create();
    const pgChildrenPool = new PgChildrenPool({
      parentConfig: pgContainerProps,
      childDatabasePrefix: "child",
    });
    const parentClient = new PgClient(pgContainerProps);
    await parentClient.connect();
    // create schema and data in parent
    await parentClient.query(schemaUpQuery);
    await parentClient.query(dataQuery);
    expect(
      (await parentClient.query(selectUserActivityJoinQuery)).rows.length,
    ).toEqual(1);
    await parentClient.end();
    const child = await pgChildrenPool.createChild();
    const childClient = new PgClient(child);
    await childClient.connect();
    // create schema but not data in child
    await childClient.query(schemaUpQuery);
    expect(
      (await childClient.query(selectUserActivityJoinQuery)).rows.length,
    ).toEqual(0);
    await childClient.query(dataQuery);
    expect(
      (await childClient.query(selectUserActivityJoinQuery)).rows.length,
    ).toEqual(1);
    await childClient.end();
    // remove child, subsequent queries should throw.
    await pgChildrenPool.removeChild(child);
    const nextChildClient = new PgClient(child);
    expect(async () => await nextChildClient.connect()).rejects.toBeTruthy();
  });

  test("use single child", async () => {
    const pgContainerProps = createPgContainerProps();
    const pgContainer = new PgContainer(pgContainerProps);
    await pgContainer.create();
    const pgChildrenPool = new PgChildrenPool({
      parentConfig: pgContainerProps,
      childDatabasePrefix: "child",
    });
    const parentClient = new PgClient(pgContainerProps);
    await parentClient.connect();
    // create schema and data in parent
    await parentClient.query(schemaUpQuery);
    await parentClient.query(dataQuery);
    expect(
      (await parentClient.query(selectUserActivityJoinQuery)).rows.length,
    ).toEqual(1);
    await parentClient.end();
    await pgChildrenPool.useChild(async (child) => {
      const childClient = new PgClient(child);
      await childClient.connect();
      // create schema but not data in child
      await childClient.query(schemaUpQuery);
      expect(
        (await childClient.query(selectUserActivityJoinQuery)).rows.length,
      ).toEqual(0);
      await childClient.query(dataQuery);
      expect(
        (await childClient.query(selectUserActivityJoinQuery)).rows.length,
      ).toEqual(1);
      await childClient.end();
      // remove child, subsequent queries should throw.
      await pgChildrenPool.removeChild(child);
      const nextChildClient = new PgClient(child);
      expect(async () => await nextChildClient.connect()).rejects.toBeTruthy();
    });
  });

  test("create and remove multiple children", async () => {
    const pgContainerProps = createPgContainerProps();
    const pgContainer = new PgContainer(pgContainerProps);
    await pgContainer.create();
    const pgChildrenPool = new PgChildrenPool({
      parentConfig: pgContainerProps,
      childDatabasePrefix: "child",
    });
    const children = await Promise.all(
      [1, 2, 3, 4, 5].map(async () => await pgChildrenPool.createChild()),
    );
    for (const child of children) {
      const pgClient = new PgClient(child);
      await pgClient.connect();
      await pgClient.query(schemaUpQuery);
      // Each child has a unique value
      await pgClient.query(
        `INSERT INTO "user" (user_id, user_name) VALUES ($1, $2)`,
        [child.database, child.database.toUpperCase()],
      );
      await pgClient.end();
    }
    for (const child of children) {
      const pgClient = new PgClient(child);
      await pgClient.connect();
      const users = await pgClient.query(selectUsersQuery);
      expect(users.rows).toEqual([
        { user_id: child.database, user_name: child.database.toUpperCase() },
      ]);
      await pgClient.end();
    }
    for (const child of children) {
      await pgChildrenPool.removeChild(child);
    }
  });
});
