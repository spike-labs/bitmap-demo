import * as bitcoin from "bitcoinjs-lib";

export const satToBtc = (sat: number) => sat / 100000000;

export const toXOnly = (pubKey: Buffer) =>
  pubKey.length === 32 ? pubKey : pubKey.subarray(1, 33);

export function isP2SHAddress(address: any, network: any) {
  try {
    const { version, hash } = bitcoin.address.fromBase58Check(address);
    return version === network.scriptHash && hash.length === 20;
  } catch (error) {
    return false;
  }
}

export function isTaprootAddress(address: any) {
  if (address.startsWith("tb1p") || address.startsWith("bc1p")) {
    return true;
  }
  return false;
}
