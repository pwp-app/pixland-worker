export class SuccessResponse {
  private ret: number;
  private data: unknown;
  private err_msg = '';

  public constructor(data?: unknown) {
    this.ret = 0;
    this.data = data;
  }
}
