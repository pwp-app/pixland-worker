/* eslint-disable no-undef */
import Router from '@tsndr/cloudflare-worker-router';
import { ERRORS } from './constants/errors';
import { getFileKey } from './utils/file';
import { CommonError, errorWrap, successWrap } from './utils/response';
import { validateAndGetAuthInfo, validateHost, validateRequest } from './utils/validator';

const SHA1_HEX_STR_LEN = 40;

export interface Env {
  pixland: R2Bucket;
}

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    // check host
    if (!validateHost(request)) {
      return new Response(null, {
        status: 403,
      });
    }

    const router = new Router();
    router.cors({
      allowOrigin: new URL(request.url).origin,
      allowMethods: 'GET, PUT',
      allowHeaders: 'x-pixland-n, x-pixland-a, x-pixland-s, x-pixland-t',
      maxAge: 60 * 60, // 1 hour in secs
      optionsSuccessStatus: 200,
    });

    router.put('/userData/:fileKey', async (req, res) => {
      const { fileKey } = req.params;
      if (!fileKey) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'File key should not be empty.'));
        return;
      }
      // check file key length (file key should be a sha1)
      if (fileKey.length !== SHA1_HEX_STR_LEN) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'Invalid file key.'));
        return;
      }
      const authInfo = validateAndGetAuthInfo(req);
      if (!authInfo) {
        errorWrap(res, new CommonError(ERRORS.HEADERS_INVALID, 'Invalid headers.'));
        return;
      }
      // just re-check auth info for type infer
      const { username, password, sign, timestamp } = authInfo;
      if (!username || !password || !sign) {
        errorWrap(res, new CommonError(ERRORS.HEADERS_INVALID, 'Invalid headers.'));
        return;
      }
      if (
        !(await validateRequest({
          data: {
            username,
            password,
          },
          sign,
          timestamp,
        }))
      ) {
        errorWrap(res, new CommonError(ERRORS.PAYLOAD_INVALID, 'Invalid request content.'));
        return;
      }
      // re-calc file key on the worker
      const calcedfileKey = await getFileKey(username, password);
      if (fileKey !== calcedfileKey.hash) {
        errorWrap(res, new CommonError(ERRORS.PAYLOAD_INVALID, 'Invalid request content.'));
        return;
      }
      try {
        await env.pixland.put(calcedfileKey.key, request.body);
        successWrap(res);
      } catch (err) {
        const e = err as Error & PromiseRejectedResult;
        errorWrap(res, new CommonError(ERRORS.PUT_OBJECT_FAILED, e?.reason || e?.message));
      }
    });

    router.get('/userData/:fileKey', async (req, res) => {
      const { fileKey } = req.params;
      if (!fileKey) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'File key should not be empty.'));
        return;
      }
      // check file key length (file key should be a sha1)
      if (fileKey.length !== SHA1_HEX_STR_LEN) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'Invalid file key.'));
        return;
      }
      const storedData = await env.pixland.get(fileKey);
      if (!storedData) {
        errorWrap(res, new CommonError(ERRORS.OBJECT_NOT_FOUND, 'Object not found.'));
        return;
      }
      // return data
      res.status = 200;
      res.body = storedData;
      res.headers.set('Content-Type', 'appliation/json');
    });

    return router.handle(request);
  },
};
