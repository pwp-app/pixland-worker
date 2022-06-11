import { COMMON_HASH_KEY } from '../constants';
import { hmacSHA1, hmacSHA256 } from './crypto';

export const getFileKey = async (username: string, password: string) => {
  const signature = await hmacSHA256(`${username}_${password}`, COMMON_HASH_KEY);
  const hash = await hmacSHA1(signature, COMMON_HASH_KEY);
  return {
    hash,
    key: `userData/${await hmacSHA1(signature, COMMON_HASH_KEY)}.json`,
  };
};

export const wrapFileKey = (fileKey: string) => `userData/${fileKey}.json`;
