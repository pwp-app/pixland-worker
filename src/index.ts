/* eslint-disable no-undef */
import Router from '@tsndr/cloudflare-worker-router';
import { ERRORS } from './constants/errors';
import { varyWrap } from './utils/cors';
import { getFileKey } from './utils/file';
import { CommonError, errorWrap, successWrap } from './utils/response';
import { validateAndGetAuthInfo, validateHost, validateReferer, validateRequest } from './utils/validator';

const SHA1_HEX_STR_LEN = 40;
const CACHED_STATUS = [404, 200];

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

    if (!validateReferer(request)) {
      return new Response(null, {
        status: 403,
      });
    }

    try {
      const cached = await caches.default.match(request);
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
      allowOrigin: request.headers.get('origin') || '',
      allowMethods: 'GET, PUT',
      allowHeaders: 'x-pixland-n, x-pixland-a, x-pixland-s, x-pixland-t',
      maxAge: 60 * 60, // 1 hour in secs
      optionsSuccessStatus: 200,
    });

    router.put('/userData/:fileKey', async (req, res) => {
      const { fileKey } = req.params;
      if (!fileKey) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'File key should not be empty.', 400));
        return;
      }
      // check file key length (file key should be a sha1)
      if (fileKey.length !== SHA1_HEX_STR_LEN) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'Invalid file key.', 400));
        return;
      }
      const authInfo = validateAndGetAuthInfo(req);
      if (!authInfo) {
        errorWrap(res, new CommonError(ERRORS.HEADERS_INVALID, 'Invalid headers.', 400));
        return;
      }
      // just re-check auth info for type infer
      const { username, password, sign, timestamp } = authInfo;
      if (!username || !password || !sign) {
        errorWrap(res, new CommonError(ERRORS.HEADERS_INVALID, 'Invalid headers.', 400));
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
        errorWrap(res, new CommonError(ERRORS.PAYLOAD_INVALID, 'Invalid request content.', 400));
        return;
      }
      // re-calc file key on the worker
      const calcedfileKey = await getFileKey(username, password);
      if (fileKey !== calcedfileKey.hash) {
        errorWrap(res, new CommonError(ERRORS.PAYLOAD_INVALID, 'Invalid request content.', 400));
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
      caches.default.delete(request, {
        ignoreMethod: true,
      });
    });

    router.get('/userData/:fileKey', async (req, res) => {
      const { fileKey } = req.params;
      if (!fileKey) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'File key should not be empty.', 400));
        return;
      }
      // check file key length (file key should be a sha1)
      if (fileKey.length !== SHA1_HEX_STR_LEN) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'Invalid file key.', 400));
        return;
      }
      // get from r2
      const storedData = await env.pixland.get(fileKey);
      if (!storedData) {
        errorWrap(res, new CommonError(ERRORS.OBJECT_NOT_FOUND, 'Object not found.', 404));
        return;
      }
      res.body = storedData;
      res.status = 200;
      res.headers.set('Content-Type', 'appliation/json');
      res.headers.set('Cache-Control', `no-transform, private, must-revalidate, max-age=0`);
      res.headers.set('Last-Modified', new Date().toUTCString()); // regard last get time as last modified date to reduce cpu consume for content negotiation
    });

    router.head('/userData/:fileKey', async (req, res) => {
      const { fileKey } = req.params;
      if (!fileKey) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'File key should not be empty.', 400));
        return;
      }
      // check file key length (file key should be a sha1)
      if (fileKey.length !== SHA1_HEX_STR_LEN) {
        errorWrap(res, new CommonError(ERRORS.FILE_KEY_INVALID, 'Invalid file key.', 400));
        return;
      }
      const storedData = await env.pixland.head(fileKey);
      if (!storedData) {
        errorWrap(res, new CommonError(ERRORS.OBJECT_NOT_FOUND, 'Object not found.', 404));
        return;
      }
      res.body = storedData;
      res.status = 200;
      res.headers.set('Content-Type', 'appliation/json');
      res.headers.set('Cache-Control', `no-transform, private, no-store`);
    });

    const finalRes = varyWrap(await router.handle(request));

    // put final res to cache (RouterResponse is not the actual Response)
    const requestPath = new URL(request.url).pathname;
    if (request.method === 'GET' && /^\/userData\//.test(requestPath) && CACHED_STATUS.includes(finalRes.status)) {
      caches.default.put(request, finalRes.clone());
    }

    return finalRes;
  },
};
