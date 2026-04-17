import { DomainError } from "./domain.error.js";

export class DecryptionFailedError extends DomainError {
  constructor(message = "Failed to decrypt secret") {
    super("DECRYPTION_FAILED", message);
    this.name = "DecryptionFailedError";
  }
}

export class InvalidKekVersionError extends DomainError {
  constructor(version: number) {
    super("INVALID_KEK_VERSION", `KEK version ${version} is not available`);
    this.name = "InvalidKekVersionError";
  }
}
