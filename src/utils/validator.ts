import { RouterRequest } from '@tsndr/cloudflare-worker-router';
import { COMMON_HASH_KEY, WHITELIST_DOMAIN } from '../constants';
import { hmacSHA256 } from './crypto';
import { getAuthHeaders } from './headers';

const REQUEST_EXPRIRE_SPAN = 5 * 1000; // 10s
const SHA256_HEX_STR_LEN = 64;

export const validateHost = (req: Request) => {
  return WHITELIST_DOMAIN.includes(new URL(req.url).hostname);
};

export const validateAndGetAuthInfo = (req: RouterRequest) => {
  const authHeaders = getAuthHeaders(req);
  const hasEmpty = Object.keys(authHeaders).some((key) => !authHeaders[key as keyof typeof authHeaders]);
  if (hasEmpty) {
    return false;
  }
  if (authHeaders.sign?.length !== SHA256_HEX_STR_LEN) {
    return false;
  }
  if (authHeaders.password?.length !== SHA256_HEX_STR_LEN) {
    return false;
  }
  if (!/^\d{13}$/.test(`${authHeaders.timestamp}`)) {
    return false;
  }
  return authHeaders;
};

export const validateRequest = async ({
  data,
  sign,
  timestamp,
}: {
  data: unknown;
  sign: string;
  timestamp: number;
}) => {
  if (Date.now() - timestamp > REQUEST_EXPRIRE_SPAN) {
    return false;
  }
  const toSign = `${JSON.stringify(data)}_${timestamp}`;
  const expect = await hmacSHA256(toSign, COMMON_HASH_KEY);
  if (expect !== sign) {
    return false;
  }
  return true;
};
