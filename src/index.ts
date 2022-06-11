/* eslint-disable no-undef */
import Router from '@tsndr/cloudflare-worker-router';
import { ERRORS } from './constants/errors';
import { varyWrap } from './utils/cors';
import { getFileKey } from './utils/file';
import { CommonError, errorWrap, successWrap } from './utils/response';
import { validateAndGetAuthInfo, validateHost, validateRequest } from './utils/validator';

const SHA1_HEX_STR_LEN = 40;

export interface Env {
  cache: Cache;
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

    try {
      const cached = await env.cache.match(request);
      if (cached?.body) {
        // directly assign cached response to return
        return cached;
      }
    } catch (err) {
      console.error(err);
    }

    // build up router
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
        return;
      }

      // remove cache
      env.cache.delete(request);
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
      // get from r2
      const storedData = await env.pixland.get(fileKey);
      if (!storedData) {
        errorWrap(res, new CommonError(ERRORS.OBJECT_NOT_FOUND, 'Object not found.'));
        return;
      }
      res.body = storedData;
      // return data
      res.status = 200;
      res.headers.set('Content-Type', 'appliation/json');
      res.headers.set('Cache-Control', `no-transform, private, must-revalidate, max-age=0`);
      res.headers.set('Last-Modified', new Date().toUTCString()); // regard last get time as last modified date to reduce cpu consume for content negotiation
    });

    const finalRes = varyWrap(router.handle(request));

    // put final res to cache (RouterResponse is not the actual Response)
    const requestPath = new URL(request.url).pathname;
    if (request.method === 'GET' && /^\/userData\//.test(requestPath)) {
      await env.cache.put(request, finalRes);
    }

    return finalRes;
  },
};
