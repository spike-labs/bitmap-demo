import * as bitcoin from "bitcoinjs-lib";
import { AddressTxsUtxo, utxo } from "./interfaces";
import { Post } from "./App";


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

export function calculateTxBytesFeeWithRate(vinsLength: number, voutsLength: number, feeRate: number): number {
  console.log("vinsLength: voutsLength: feeRate: ", vinsLength, voutsLength, feeRate)
  let baseSize = 8 + 1 + 1 + 41 * vinsLength + (9 + 23) * voutsLength
  let totalSize = baseSize + 2 + vinsLength * 1 + vinsLength * 67
  const weight = baseSize * 3 + totalSize 
  const txVirtualSize = (weight + 3) / 4
  return Math.ceil(txVirtualSize * (feeRate + 4)) //计算有误差， 多次测试发现 +4 比较合适(会偏大一点)
}

export async function mapUtxos(utxosFromMempool: AddressTxsUtxo[]): Promise<utxo[]> {
  const ret = [];
  for (const utxoFromMempool of utxosFromMempool) {
    const res = await Post("http://localhost:3002/api/v1/tx/raw", {
      tx_hash: utxoFromMempool.txid,
    });
      ret.push({
          txid: utxoFromMempool.txid,
          vout: utxoFromMempool.vout,
          value: utxoFromMempool.value,
          status: utxoFromMempool.status,
          tx: bitcoin.Transaction.fromHex(res.data),
      });
  }
  return ret;
}
