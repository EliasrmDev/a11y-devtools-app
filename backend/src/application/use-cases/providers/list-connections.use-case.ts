import type { ProviderRepository } from "../../../domain/ports/provider.repository.js";
import type { ConnectionOutput } from "../../dto/provider.dto.js";
import { toConnectionOutput } from "./create-connection.use-case.js";

export class ListConnectionsUseCase {
  constructor(private readonly providers: ProviderRepository) {}

  async execute(userId: string): Promise<ConnectionOutput[]> {
    const connections = await this.providers.findByUser(userId);
    return connections.map(toConnectionOutput);
  }
}
