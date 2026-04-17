export interface SecretRepository {
  findByConnectionId(connectionId: string): Promise<EncryptedSecret | null>;
  create(data: CreateSecretData): Promise<EncryptedSecret>;
  update(id: string, data: UpdateSecretData): Promise<void>;
  delete(id: string): Promise<void>;
  findByKekVersion(version: number, limit: number): Promise<EncryptedSecret[]>;
}

export interface EncryptedSecret {
  id: string;
  connectionId: string;
  secretType: string;
  encryptedDek: Buffer;
  dekIv: Buffer;
  ciphertext: Buffer;
  cipherIv: Buffer;
  authTag: Buffer;
  kekVersion: number;
  createdAt: Date;
  rotatedAt: Date | null;
}

export interface CreateSecretData {
  connectionId: string;
  secretType?: string;
  encryptedDek: Buffer;
  dekIv: Buffer;
  ciphertext: Buffer;
  cipherIv: Buffer;
  authTag: Buffer;
  kekVersion: number;
}

export interface UpdateSecretData {
  encryptedDek: Buffer;
  dekIv: Buffer;
  ciphertext: Buffer;
  cipherIv: Buffer;
  authTag: Buffer;
  kekVersion: number;
  rotatedAt: Date;
}
