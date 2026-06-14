import crypto from 'crypto';

export function generateNodeId() {
  return crypto.randomBytes(16).toString('hex');
}

export function generateKeyPair() {
  return crypto.generateKeyPairSync('rsa', {
    modulusLength: 2048,
    publicKeyEncoding: {
      type: 'spki',
      format: 'pem'
    },
    privateKeyEncoding: {
      type: 'pkcs8',
      format: 'pem'
    }
  });
}

export function hash(data) {
  return crypto.createHash('sha256').update(data).digest('hex');
}

export function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}
