import Docker, { ContainerInfo } from "dockerode";

import { IPgContainerProps } from "./PgContainer";

const removeContainers = async (
  docker: Docker,
  test: (container: ContainerInfo) => boolean,
): Promise<void> => {
  const containersInfo = await docker.listContainers({ all: true });
  await Promise.all(
    containersInfo.map(async (containerInfo) => {
      if (test(containerInfo)) {
        const container = docker.getContainer(containerInfo.Id);
        await container.remove({ force: true, v: true });
      }
    }),
  );
};

interface ITestContextProps {
  readonly containerNamePrefix: string;
  readonly ports: [number, number];
}

type TestContextState = null | {
  readonly docker: Docker;
};

export interface ITestContext {
  readonly setup: () => Promise<void>;
  readonly teardown: () => Promise<void>;
  readonly createPgContainerProps: () => IPgContainerProps;
  state: TestContextState;
}
export const getDocker = (ctx: ITestContext): Docker => {
  if (ctx.state === null) {
    throw new Error("Context not initialized");
  }
  return ctx.state.docker;
};

const removeAllContainers = async (
  ctx: ITestContext,
  props: ITestContextProps,
): Promise<void> => {
  const docker = getDocker(ctx);
  await removeContainers(docker, (containerInfo) =>
    containerInfo.Names.some(
      (containerName) =>
        containerName.startsWith(props.containerNamePrefix) ||
        containerName.startsWith(`/${props.containerNamePrefix}`),
    ),
  );
};

export const createTestContext = (props: ITestContextProps): ITestContext => {
  const minPort = props.ports[0];
  const maxPort = props.ports[1];
  let nextPort = minPort;
  const createNextPort = (): number => {
    if (nextPort > maxPort) {
      throw new Error("max port reached");
    }
    return nextPort++;
  };
  const ctx: ITestContext = {
    state: null,
    setup: async () => {
      if (ctx.state !== null) {
        throw new Error("Context already initialized");
      }
      ctx.state = {
        docker: new Docker(),
      };
      await removeAllContainers(ctx, props);
    },
    teardown: async () => {
      await removeAllContainers(ctx, props);
      ctx.state = null;
    },
    createPgContainerProps: () => {
      if (!ctx.state) {
        throw new Error("Context not initialized");
      }
      const port = createNextPort();
      const containerName = `${props.containerNamePrefix}_${port}`;
      return {
        containerName,
        docker: ctx.state.docker,
        database: `${containerName}_db`,
        host: "localhost",
        password: `${containerName}_password`,
        user: `${containerName}_user`,
        port,
      };
    },
  };
  return ctx;
};
