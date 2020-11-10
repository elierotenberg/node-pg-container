import { Client as PgClient } from "pg";

import { IClientConfig } from "./Pg";

interface IPgChildrenPoolProps {
  readonly parentConfig: IClientConfig;
  readonly childDatabasePrefix?: string;
}

export class PgChildrenPool {
  readonly props: IPgChildrenPoolProps;
  private nextId = 0;
  public constructor(props: IPgChildrenPoolProps) {
    this.props = props;
    this.nextId = 0;
  }

  public readonly createChild = async (
    unsafeChildDatabase = `${
      this.props.childDatabasePrefix ?? "pg_container_client_pool"
    }_${this.nextId}`,
  ): Promise<IClientConfig> => {
    const nextId = this.nextId++;
    /**
     * We need to create a database with a dynamic name - but we can't do that with
     * parametrized queries directly.
     * Instead, we create a database with a temporary name that is guaranteed to be
     * safe, consisting only of _ / lowercase ascii letters / digits.
     * Then we rename it using a parametrized query.
     */
    const safeTempChildDatabase = `__tmp_${
      process.pid
    }_${Date.now()}_${nextId}`;
    const parentClient = new PgClient(this.props.parentConfig);
    await parentClient.connect();
    try {
      // tempDatabase is safe by construction
      await parentClient.query(`CREATE DATABASE ${safeTempChildDatabase}`);
      try {
        await parentClient.query(
          `UPDATE pg_database SET datname = $1 WHERE datname = $2`,
          [unsafeChildDatabase, safeTempChildDatabase],
        );
      } catch (error) {
        await parentClient.query(`DROP DATABASE ${safeTempChildDatabase}`);
        throw error;
      }
      return {
        ...this.props.parentConfig,
        database: unsafeChildDatabase,
      };
    } finally {
      await parentClient.end();
    }
  };

  public readonly removeChild = async ({
    database: unsafeChildDatabase,
  }: {
    readonly database: string;
  }): Promise<void> => {
    const nextId = this.nextId++;
    /**
     * We perform the inverse operation of createChild: we need to
     * rename the untrusted/unsafe database name into a safe one so
     * we can delete it.
     */
    const safeTempChildDatabase = `__tmp_${
      process.pid
    }_${Date.now()}_${nextId}`;
    const parentClient = new PgClient(this.props.parentConfig);
    await parentClient.connect();
    try {
      await parentClient.query(
        `UPDATE pg_database SET datname = $1 WHERE datname = $2`,
        [safeTempChildDatabase, unsafeChildDatabase],
      );
      try {
        await parentClient.query(`DROP DATABASE ${safeTempChildDatabase}`);
      } catch (error) {
        await parentClient.query(
          "UPDATE pg_database SET datname = $1 WHERE datname = $2",
          [unsafeChildDatabase, safeTempChildDatabase],
        );
      }
    } finally {
      await parentClient.end();
    }
  };

  public readonly useChild = async <T>(
    fn: (child: IClientConfig) => Promise<T>,
    childDatabase?: string,
  ): Promise<T> => {
    const child = await this.createChild(childDatabase);
    try {
      return await fn(child);
    } finally {
      await this.removeChild(child);
    }
  };
}
