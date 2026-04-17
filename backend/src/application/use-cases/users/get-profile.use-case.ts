import type { UserRepository } from "../../../domain/ports/user.repository.js";
import type { ProfileOutput } from "../../dto/user.dto.js";
import { NotFoundError } from "../../../domain/errors/index.js";

export class GetProfileUseCase {
  constructor(private readonly users: UserRepository) {}

  async execute(userId: string): Promise<ProfileOutput> {
    const user = await this.users.findById(userId);
    if (!user) {
      throw new NotFoundError("User", userId);
    }

    return {
      id: user.id,
      email: user.email,
      displayName: user.displayName,
      avatarUrl: user.avatarUrl,
      role: user.role,
      emailVerifiedAt: user.emailVerifiedAt?.toISOString() ?? null,
      createdAt: user.createdAt.toISOString(),
    };
  }
}
