import {
  Injectable,
  InternalServerErrorException,
  OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;

/**
 * Encrypts small values at rest (e.g. third-party API secrets) with
 * AES-256-GCM under a single key from SETTINGS_ENCRYPTION_KEY — the same
 * approach the Payfest backend (dashboard-financial-api) uses for its own
 * secrets, via internal/platform/security/aesgcm.go. Generate the key with:
 *   openssl rand -hex 32
 */
@Injectable()
export class SecretEncryptionService implements OnModuleInit {
  private key: Buffer;

  constructor(private readonly configService: ConfigService) {}

  onModuleInit() {
    const hexKey = this.configService.get<string>('SETTINGS_ENCRYPTION_KEY');
    if (!hexKey || hexKey.length !== 64) {
      throw new Error(
        'SETTINGS_ENCRYPTION_KEY must be set to a 32-byte hex string (openssl rand -hex 32)',
      );
    }
    this.key = Buffer.from(hexKey, 'hex');
  }

  /** Returns hex(iv) + ":" + hex(authTag) + ":" + hex(ciphertext). */
  encrypt(plaintext: string): string {
    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, this.key, iv);
    const ciphertext = Buffer.concat([
      cipher.update(plaintext, 'utf8'),
      cipher.final(),
    ]);
    const authTag = cipher.getAuthTag();
    return [
      iv.toString('hex'),
      authTag.toString('hex'),
      ciphertext.toString('hex'),
    ].join(':');
  }

  decrypt(encoded: string): string {
    const [ivHex, authTagHex, ciphertextHex] = encoded.split(':');
    if (!ivHex || !authTagHex || !ciphertextHex) {
      throw new InternalServerErrorException('malformed encrypted value');
    }
    const decipher = crypto.createDecipheriv(
      ALGORITHM,
      this.key,
      Buffer.from(ivHex, 'hex'),
    );
    decipher.setAuthTag(Buffer.from(authTagHex, 'hex'));
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(ciphertextHex, 'hex')),
      decipher.final(),
    ]);
    return plaintext.toString('utf8');
  }
}
