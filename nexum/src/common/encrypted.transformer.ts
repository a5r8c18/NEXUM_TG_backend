import { ValueTransformer } from 'typeorm';
import * as crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 16;
const AUTH_TAG_LENGTH = 16;

function getEncryptionKey(): Buffer | null {
  const key = process.env.ENCRYPTION_KEY;
  if (!key) return null;
  return crypto.scryptSync(key, 'nexum-salt', 32);
}

export class EncryptedTransformer implements ValueTransformer {
  to(value: string | null): string | null {
    if (!value) return value;
    const key = getEncryptionKey();
    if (!key) return value; // Sin clave, almacenar en texto plano

    const iv = crypto.randomBytes(IV_LENGTH);
    const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
    let encrypted = cipher.update(value, 'utf8', 'hex');
    encrypted += cipher.final('hex');
    const authTag = cipher.getAuthTag();

    // Formato: iv:authTag:encrypted
    return `${iv.toString('hex')}:${authTag.toString('hex')}:${encrypted}`;
  }

  from(value: string | null): string | null {
    if (!value) return value;
    const key = getEncryptionKey();
    if (!key) return value;

    // Si no tiene el formato esperado, devolver tal cual (dato sin cifrar)
    const parts = value.split(':');
    if (parts.length !== 3) return value;

    try {
      const iv = Buffer.from(parts[0], 'hex');
      const authTag = Buffer.from(parts[1], 'hex');
      const encrypted = parts[2];

      const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
      decipher.setAuthTag(authTag);
      let decrypted = decipher.update(encrypted, 'hex', 'utf8');
      decrypted += decipher.final('utf8');
      return decrypted;
    } catch {
      // Si falla el descifrado, retornar valor original
      return value;
    }
  }
}
