import { hmacSHA256 } from './crypto';

const REQUEST_EXPRIRE_SPAN = 5 * 1000; // 10s

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
    throw new Error('Request is outdated.');
  }
  const toSign = `${JSON.stringify(data)}_${timestamp}`;
  const expect = await hmacSHA256(toSign, 'pixland');
  if (expect !== sign) {
    throw new Error('Signature is invalid.');
  }
};
