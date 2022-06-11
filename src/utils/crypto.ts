import { bufferToHex } from './buffer';

const encoder = new TextEncoder();

export const createHmac = (type: string) => {
  return async function (message: string, key: string) {
    const encodedMessage = encoder.encode(message);
    const encodedKey = encoder.encode(key);
    const cryptoKey = await crypto.subtle.importKey('raw', encodedKey, { name: 'HMAC', hash: type }, true, ['sign']);
    const sign = await crypto.subtle.sign('HMAC', cryptoKey, encodedMessage);
    return bufferToHex(sign);
  };
};

export const hmacSHA1 = createHmac('SHA-1');
export const hmacSHA256 = createHmac('SHA-256');
