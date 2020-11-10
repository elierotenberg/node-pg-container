import Docker, { Container, ContainerCreateOptions } from "dockerode";

import { IClientConfig, waitForInteractive } from "./Pg";

export interface IPgContainerProps extends IClientConfig {
  readonly docker: Docker;
  readonly containerName: string;
}

interface ICreateOptions {
  readonly image?: string;
  readonly pgData?: string;
}

const recordToEnv = (record: Record<string, string>): string[] =>
  Object.entries(record).map(([key, value]) => `${key}=${value}`);

export class PgContainer {
  private readonly props: IPgContainerProps;
  public constructor(props: IPgContainerProps) {
    this.props = props;
  }

  public readonly find = async (): Promise<null | Container> => {
    const containersInfo = await this.props.docker.listContainers({
      all: true,
    });
    const containerInfo = containersInfo.find(
      (containerInfo) =>
        containerInfo.Names.includes(this.props.containerName) ||
        containerInfo.Names.includes(`/${this.props.containerName}`),
    );
    if (!containerInfo) {
      return null;
    }
    return this.props.docker.getContainer(containerInfo.Id);
  };

  public readonly remove = async (): Promise<void> => {
    const container = await this.find();
    if (!container) {
      throw new Error(`container '${this.props.containerName} does not exist`);
    }
    await container.remove({ force: true, v: true });
  };

  public readonly create = async (options?: ICreateOptions): Promise<void> => {
    const createOpts: ContainerCreateOptions = {
      name: this.props.containerName,
      Image: options?.image ?? "postgres:latest",
      Env: recordToEnv({
        POSTGRES_USER: this.props.user,
        POSTGRES_PASSWORD: this.props.password,
        POSTGRES_DB: this.props.database,
      }),
      ExposedPorts: {
        "5432": {},
      },
      HostConfig: {
        PortBindings: {
          "5432/tcp": [
            {
              HostPort: `${this.props.port}`,
            },
          ],
        },
        Binds: options?.pgData
          ? [`${options.pgData}:/var/lib/postgresql/data`]
          : undefined,
      },
      Volumes: options?.pgData ? { "/var/lib/postgresql/data": {} } : {},
      Tty: true,
      AttachStdin: true,
      AttachStdout: true,
    };
    const container = await this.props.docker.createContainer(createOpts);
    await container.start();
    await waitForInteractive(this.props);
  };

  public readonly findOrCreate = async (
    options?: ICreateOptions,
  ): Promise<void> => {
    if ((await this.find()) !== null) {
      return;
    }
    return await this.create(options);
  };
}
