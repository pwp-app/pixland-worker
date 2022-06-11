import { RouterRequest } from '@tsndr/cloudflare-worker-router';

export const getAuthHeaders = (req: RouterRequest) => {
  return {
    username: req.headers.get('x-pixland-n'),
    password: req.headers.get('x-pixland-a'),
    sign: req.headers.get('x-pixland-s'),
    timestamp: Number(req.headers.get('x-pixland-t') || 0),
  };
};
