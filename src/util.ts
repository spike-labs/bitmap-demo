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

export function getOutputSize(address: string) {
  if (address.startsWith("bc1q")) {
      return 28;
  } else if (address.startsWith("3")) {
      return 32;
  } else if (address.startsWith("1")) {
      return 34;
  }
  return 43;
}

export function calculateTxBytesFeeWithRate(sellerAddress: string, buyerAddress: string, itemNum: number, vinsLength: number, voutsLength: number, feeRate: number): number {
  const sellerOutputSize = getOutputSize(sellerAddress)
  const buyerOutputSize = getOutputSize(buyerAddress)
  //item = 0 就是不买东西，
  if (itemNum === 0) {
    const txFee =  Math.round(28.5 + 57.5 * vinsLength + sellerOutputSize * voutsLength) * feeRate
    return txFee
  }
  const buyerVoutLength = 3 + itemNum * 2
  console.log("vinsLength: sellerOutputSize: itemNum: buyerVoutLength: buyerOutputSize", vinsLength, sellerOutputSize, itemNum, buyerVoutLength, buyerOutputSize)
  const txFee =  Math.round(28.5 + 57.5 * vinsLength + sellerOutputSize * itemNum + buyerVoutLength * buyerOutputSize + 43) * feeRate
  return txFee
}

export async function mapUtxos(utxosFromMempool: AddressTxsUtxo[]): Promise<utxo[]> {
  const ret = [];
  for (const utxoFromMempool of utxosFromMempool) {
    const res = await Post("https://api-global.brc420.io/api/v1/tx/raw", {
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
