import crypto from 'crypto';
import fs from 'fs';
import path from 'path';

const VAULT_PREFIX = 'v1';
const ALGORITHM = 'aes-256-gcm';

let cachedTestFallbackKey: Buffer | null = null;

function resolveServerKeyMaterial(): string {
  const explicitSecret = (process.env.CREDENTIAL_VAULT_SECRET || '').trim();
  if (explicitSecret) {
    return `explicit:${explicitSecret}`;
  }

  const rawPrivateKey = (process.env.FIREBASE_PRIVATE_KEY || '').trim();
  if (rawPrivateKey) {
    return `pk:${rawPrivateKey.replace(/\\n/g, '\n')}`;
  }

  const rawPrivateKeyB64 = (process.env.FIREBASE_PRIVATE_KEY_BASE64 || '').trim();
  if (rawPrivateKeyB64) {
    return `pkb64:${rawPrivateKeyB64}`;
  }

  const rawSaJson = (
    process.env.FIREBASE_SERVICE_ACCOUNT_JSON ||
    process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 ||
    process.env.FIREBASE_SERVICE_ACCOUNT ||
    process.env.FIREBASE_ADMIN_CREDENTIALS ||
    ''
  ).trim();
  if (rawSaJson) {
    return `sa:${rawSaJson}`;
  }

  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    const credPath = path.resolve(process.cwd(), process.env.GOOGLE_APPLICATION_CREDENTIALS);
    if (fs.existsSync(credPath)) {
      try {
        const content = fs.readFileSync(credPath, 'utf-8');
        if (content.trim()) {
          return `gac:${content.trim()}`;
        }
      } catch {
        // Ignore unreadable credential path
      }
    }
  }

  return '';
}

function getVaultEncryptionKey(overrideSecret?: string): Buffer {
  if (overrideSecret && overrideSecret.trim()) {
    return crypto
      .createHmac('sha256', 'smart-school-master-vault-v1')
      .update(overrideSecret.trim())
      .digest();
  }

  const material = resolveServerKeyMaterial();
  if (material) {
    return crypto
      .createHmac('sha256', 'smart-school-master-vault-v1')
      .update(material)
      .digest();
  }

  if (!cachedTestFallbackKey) {
    cachedTestFallbackKey = crypto.randomBytes(32);
  }
  return cachedTestFallbackKey;
}

export function encryptVaultPassword(plainPassword: string, overrideSecret?: string): string {
  const key = getVaultEncryptionKey(overrideSecret);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plainPassword, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return `${VAULT_PREFIX}:${iv.toString('base64')}:${authTag.toString('base64')}:${encrypted.toString('base64')}`;
}

export function decryptVaultPassword(cipherPayload: string, overrideSecret?: string): string | null {
  if (!cipherPayload || typeof cipherPayload !== 'string') return null;
  const parts = cipherPayload.split(':');
  if (parts.length !== 4 || parts[0] !== VAULT_PREFIX) return null;

  try {
    const [, ivB64, tagB64, dataB64] = parts;
    const iv = Buffer.from(ivB64, 'base64');
    const authTag = Buffer.from(tagB64, 'base64');
    const encrypted = Buffer.from(dataB64, 'base64');
    if (iv.length !== 12 || authTag.length !== 16) return null;

    const key = getVaultEncryptionKey(overrideSecret);
    const decipher = crypto.createDecipheriv(ALGORITHM, key, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  } catch {
    return null;
  }
}
