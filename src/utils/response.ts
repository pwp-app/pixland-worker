import { RouterResponse } from '@tsndr/cloudflare-worker-router';

export class CommonError {
  public status: number;
  public ret: number;
  public message: string;

  public constructor(ret: number, message: string, status = 500) {
    this.ret = ret;
    this.message = message;
    this.status = status;
  }
}

export const successWrap = (res: RouterResponse, data?: unknown) => {
  res.status = 200;
  res.body = {
    ret: 0,
    ...(data ? { data } : null),
  };
  return res;
};

export const errorWrap = (res: RouterResponse, error: CommonError) => {
  const { status, ret, message } = error;
  res.status = status;
  res.body = {
    ret,
    message,
  };
};
