import type { ProviderRepository, GlobalModel } from "../../../domain/ports/provider.repository.js";

export class ListModelsUseCase {
  constructor(private readonly providers: ProviderRepository) {}

  async execute(filters?: {
    providerType?: string;
    enabledOnly?: boolean;
  }): Promise<GlobalModel[]> {
    let models = await this.providers.listGlobalModels();

    if (filters?.providerType) {
      models = models.filter(
        (m) => m.providerType === filters.providerType,
      );
    }

    if (filters?.enabledOnly) {
      models = models.filter((m) => m.isEnabled);
    }

    return models;
  }
}
