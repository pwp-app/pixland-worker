export const varyWrap = (res: Response) => {
  res.headers.set('Vary', 'Origin');
  return res;
};
