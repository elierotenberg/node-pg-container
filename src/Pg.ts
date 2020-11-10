import { Client as PgClient } from "pg";

export interface IClientConfig {
  readonly host: string;
  readonly port: number;
  readonly user: string;
  readonly password: string;
  readonly database: string;
  readonly connectionTimeoutMillis?: number;
}

const checkDeadline = (deadline: number): void => {
  if (Date.now() > deadline) {
    throw new Error("deadline reached");
  }
};

const sleep = (delay: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, delay));

export const waitForInteractive = async (
  clientConfig: IClientConfig,
  opts?: { readonly timeout?: number; readonly retryInterval?: number },
): Promise<void> => {
  const timeout = opts?.timeout ?? 30000;
  const retryInterval = opts?.retryInterval ?? 333;
  const deadline = Date.now() + timeout;
  while (true) {
    checkDeadline(deadline);
    const client = new PgClient({
      ...clientConfig,
      connectionTimeoutMillis: deadline - Date.now(),
    });
    try {
      await client.connect();
      checkDeadline(deadline);
      const res = await client.query("SELECT 1 as one;");
      checkDeadline(deadline);
      if (res.rows[0]?.one === 1) {
        return;
      }
    } catch (error) {
    } finally {
      await client.end();
    }
    checkDeadline(deadline - retryInterval);
    await sleep(retryInterval);
  }
};
