import { join } from "path";

import { Client as PgClient } from "pg";

import { PgContainer } from "../PgContainer";
import { createTestContext } from "../TestUtils";

import {
  dataQuery,
  schemaDownQuery,
  schemaUpQuery,
  selectUserActivityJoinQuery,
} from "./fixtures";

jest.setTimeout(30000);

const { setup, teardown, createPgContainerProps } = createTestContext({
  containerNamePrefix: "PgContainer",
  ports: [19000, 19100],
});

beforeAll(setup);

afterAll(teardown);

describe("PgContainer", () => {
  it("find, create, find, remove without volume", async () => {
    const containerProps = createPgContainerProps();
    const pgContainer = new PgContainer(containerProps);
    expect(await pgContainer.find()).toEqual(null);
    await pgContainer.create();
    expect(await pgContainer.find()).not.toEqual(null);
    const client = new PgClient(containerProps);
    await client.connect();
    await client.query(schemaUpQuery);
    await client.query(dataQuery);
    const res = await client.query(selectUserActivityJoinQuery);
    await client.end();
    expect(res.rows).toEqual([
      {
        user_id: "id_user_b",
        user_name: "User B",
        activity_id: "activity_user_b",
      },
    ]);
    await pgContainer.remove();
    expect(await pgContainer.find()).toEqual(null);
  });
  it("find, create, find, remove with volume", async () => {
    const containerProps = createPgContainerProps();
    const pgData = join(
      __dirname,
      "..",
      "..",
      "data",
      `${containerProps.containerName}`,
    );
    const pgContainer = new PgContainer(containerProps);
    expect(await pgContainer.find()).toEqual(null);
    await pgContainer.create({ pgData });
    expect(await pgContainer.find()).not.toEqual(null);

    const client = new PgClient(containerProps);
    await client.connect();
    // Drop schema if already exists
    await client.query(schemaDownQuery);
    await client.query(schemaUpQuery);
    await client.query(dataQuery);
    const res = await client.query(selectUserActivityJoinQuery);
    await client.end();
    expect(res.rows).toEqual([
      {
        user_id: "id_user_b",
        user_name: "User B",
        activity_id: "activity_user_b",
      },
    ]);
    await pgContainer.remove();
    expect(await pgContainer.find()).toEqual(null);

    // Recreate new container with same volume
    const nextPgContainer = new PgContainer(containerProps);
    await nextPgContainer.create({ pgData });
    const nextClient = new PgClient(containerProps);
    await nextClient.connect();
    // Should throw, tables already exist
    await expect(
      async () => await client.query(schemaUpQuery),
    ).rejects.toBeTruthy();
    await nextClient.end();
    await nextPgContainer.remove();
  });
});
