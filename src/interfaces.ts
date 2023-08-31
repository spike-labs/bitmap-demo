import * as bitcoin from "bitcoinjs-lib";
import * as signer from "@mixobitc/msigner";

export class InvalidArgumentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidArgumentError";
  }
}
export interface WitnessUtxo {
  script: Buffer;
  value: number;
}
export interface IListingState {
  seller: {
    makerFeeBp: number;
    sellerOrdAddress: string;
    price: number;
    ordItem: IOrdItem;
    sellerReceiveAddress: string;
    sellerPublicKey?: string;
    unsignedListingPSBTBase64?: string;
    signedListingPSBTHex?: string;
    tapInternalKey?: string;
  };
  buyer?: {
    takerFeeBp: number;
    buyerAddress: string;
    buyerTokenReceiveAddress: string;
    feeRateTier?: string;
    feeRate?: number;
    buyerPublicKey?: string;
    unsignedBuyingPSBTBase64?: string;
    unsignedBuyingPSBTInputSize?: number;
    signedBuyingPSBTHex?: string;
    buyerDummyUTXOs?: utxo[];
    buyerPaymentUTXOs?: utxo[];
    mergedSignedBuyingPSBTHex?: string;
    platformFeeAddress?: string;
    txHex?: string;
  };
}

export interface IOrdItem {
  id: string;
  owner: string;
  location?: string;
  locationBlockHeight?: number;
  locationBlockTime?: string;
  locationBlockHash?: string;
  output: string;
  outputValue: number;
  mempoolTxId?: string;
  listedAt?: string;
  listedPrice?: number;
  listedMakerFeeBp?: number;
  listedSellerReceiveAddress?: string;
}

export interface utxo {
  txid: string;
  vout: number;
  value: number;
  status: TxStatus;
  tx: bitcoin.Transaction;
}
export interface AddressTxsUtxo {
  txid: string;
  vout: number;
  status: TxStatus;
  value: number;
}

export interface TxStatus {
  confirmed: boolean;
  block_height: number;
  block_hash: string;
  block_time: number;
}

export interface IOrdItemMeta {
  name: string;
  high_res_img_url?: string;
  status?: string;
  rank?: number;
  attributes?: IOrdItemAttribute[];
}

export interface IOrdItemAttribute {
  trait_type: string;
  value: string;
  status?: string;
  percent?: string;
}
