export const satToBtc = (sat: number) => sat / 100000000;

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);
