import { bufferToHex } from './buffer';

const encoder = new TextEncoder();

export const hmacSHA256 = async (message: string, key: string) => {
  const encodedMessage = encoder.encode(message);
  const encodedKey = encoder.encode(key);
  const cryptoKey = await crypto.subtle.importKey('raw', encodedKey, { name: 'HMAC', hash: 'SHA-256' }, true, ['sign']);
  const sign = await crypto.subtle.sign('HMAC', cryptoKey, encodedMessage);
  return bufferToHex(sign);
};
