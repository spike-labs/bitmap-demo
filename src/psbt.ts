import {
  BTC_NETWORK,
  BUYING_PSBT_BUYER_RECEIVE_INDEX,
  BUYING_PSBT_PLATFORM_FEE_INDEX,
  BUYING_PSBT_SELLER_SIGNATURE_INDEX,
  DUMMY_UTXO_MAX_VALUE,
  DUMMY_UTXO_MIN_VALUE,
  DUMMY_UTXO_VALUE,
  ORDINALS_POSTAGE_VALUE,
  PLATFORM_FEE_ADDRESS,
} from "./constant";
import * as signer from "@mixobitc/msigner";
import * as bitcoin from "bitcoinjs-lib";
import {
  toXOnly,
  isP2SHAddress,
  satToBtc,
  isTaprootAddress,
  calculateTxBytesFeeWithRate,
  mapUtxos,
} from "./util";
import { Post } from "./App";
import {
  InvalidArgumentError,
  IListingState,
  WitnessUtxo,
  AddressTxsUtxo,
  ISweepState,
  ISweepItem,
} from "./interfaces";

const network =
  BTC_NETWORK === "mainnet"
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;

export type NormalResponse<T> = {
    code: number
    data: T
    msg: string
}

export function mergeSignedBuyingPSBTBase64(
  signedListingPSBTBase64: string,
  signedBuyingPSBTBase64: string
): string {
  const sellerSignedPsbt = bitcoin.Psbt.fromBase64(signedListingPSBTBase64);
  const buyerSignedPsbt = bitcoin.Psbt.fromBase64(signedBuyingPSBTBase64);

  (buyerSignedPsbt.data.globalMap.unsignedTx as any).tx.ins[
    BUYING_PSBT_SELLER_SIGNATURE_INDEX
  ] = (sellerSignedPsbt.data.globalMap.unsignedTx as any).tx.ins[0];

  buyerSignedPsbt.data.inputs[BUYING_PSBT_SELLER_SIGNATURE_INDEX] =
    sellerSignedPsbt.data.inputs[0];

  return buyerSignedPsbt.toBase64();
}

export async function generateUnsignedBuyingPSBTBase64(listing: IListingState) {
  const psbt = new bitcoin.Psbt({ network });
  if (
    !listing.buyer ||
    !listing.buyer.buyerAddress ||
    !listing.buyer.buyerTokenReceiveAddress
  ) {
    throw new InvalidArgumentError("Buyer address is not set");
  }

  if (
    listing.buyer.buyerDummyUTXOs?.length !== 2 ||
    !listing.buyer.buyerPaymentUTXOs
  ) {
    throw new InvalidArgumentError("Buyer address has not enough utxos");
  }

  let totalInput = listing.seller.ordItem.outputValue;

  // Add two dummyUtxos
  for (const dummyUtxo of listing.buyer.buyerDummyUTXOs) {
    const input: any = {
      hash: dummyUtxo.txid,
      index: dummyUtxo.vout,
      nonWitnessUtxo: dummyUtxo.tx.toBuffer(),
    };

    const p2shInputRedeemScript: any = {};
    const p2shInputWitnessUTXO: any = {};

    if (isP2SHAddress(listing.buyer.buyerAddress, network)) {
      const redeemScript = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(listing.buyer.buyerPublicKey!, "hex"),
      }).output;
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
      });
      p2shInputWitnessUTXO.witnessUtxo = {
        script: p2sh.output,
        value: dummyUtxo.value,
      } as WitnessUtxo;
      p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
    }
    if (isTaprootAddress(listing.buyer.buyerAddress)) {
      input.witnessUtxo = dummyUtxo.tx.outs[dummyUtxo.vout];
      input.tapInternalKey = toXOnly(
        //tx.toBuffer().constructor(listing.buyer.buyerPublicKey!, 'hex'),
        Buffer.from(listing.buyer.buyerPublicKey!, "hex")
      );
    }

    psbt.addInput({
      ...input,
      ...p2shInputWitnessUTXO,
      ...p2shInputRedeemScript,
    });
    totalInput += dummyUtxo.value;
  }

  // Add dummy output
  psbt.addOutput({
    address: listing.buyer.buyerAddress,
    value:
      listing.buyer.buyerDummyUTXOs[0].value +
      listing.buyer.buyerDummyUTXOs[1].value +
      Number(listing.seller.ordItem.location?.split(":")[2]),
  });
  // Add ordinal output
  psbt.addOutput({
    address: listing.buyer.buyerTokenReceiveAddress,
    value: ORDINALS_POSTAGE_VALUE,
  });

  const { sellerInput, sellerOutput } = await getSellerInputAndOutput(listing);

  psbt.addInput(sellerInput);
  psbt.addOutput(sellerOutput);

  // Add payment utxo inputs
  for (const utxo of listing.buyer.buyerPaymentUTXOs) {
    const input: any = {
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: utxo.tx.toBuffer(),
    };

    const p2shInputWitnessUTXOUn: any = {};
    const p2shInputRedeemScriptUn: any = {};

    if (isP2SHAddress(listing.buyer.buyerAddress, network)) {
      const redeemScript = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(listing.buyer.buyerPublicKey!, "hex"),
      }).output;
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
      });
      p2shInputWitnessUTXOUn.witnessUtxo = {
        script: p2sh.output,
        value: utxo.value,
      } as WitnessUtxo;
      p2shInputRedeemScriptUn.redeemScript = p2sh.redeem?.output;
    }

    if (isTaprootAddress(listing.buyer.buyerAddress)) {
      input.witnessUtxo = utxo.tx.outs[utxo.vout];
      input.tapInternalKey = toXOnly(
        //tx.toBuffer().constructor(listing.buyer.buyerPublicKey!, 'hex'),
        Buffer.from(listing.buyer.buyerPublicKey!, "hex")
      );
    }

    psbt.addInput({
      ...input,
      ...p2shInputWitnessUTXOUn,
      ...p2shInputRedeemScriptUn,
    });

    totalInput += utxo.value;
  }

  // Create a platform fee output
  let platformFeeValue = Math.floor(
    listing.seller.price * listing.buyer.takerFeeBp
  );
  platformFeeValue =
    platformFeeValue > DUMMY_UTXO_MIN_VALUE
      ? platformFeeValue
      : DUMMY_UTXO_MIN_VALUE;

  if (platformFeeValue > 0) {
    psbt.addOutput({
      address: PLATFORM_FEE_ADDRESS,
      value: platformFeeValue,
    });
  }

  // Create two new dummy utxo output for the next purchase
  psbt.addOutput({
    address: listing.buyer.buyerAddress,
    value: DUMMY_UTXO_VALUE,
  });
  psbt.addOutput({
    address: listing.buyer.buyerAddress,
    value: DUMMY_UTXO_VALUE,
  });

  const fee = calculateTxBytesFeeWithRate(
    psbt.txInputs.length,
    psbt.txOutputs.length + 1, //+1 加的是找零的那个长度 // already taken care of the exchange output bytes calculation
    listing.buyer.feeRate ?? 10
  );
  console.log("input len: ", psbt.txInputs.length);
  console.log("output len: ", psbt.txOutputs.length + 1);
  console.log("fee: ", fee);

  const totalOutput = psbt.txOutputs.reduce(
    (partialSum, a) => partialSum + a.value,
    0
  );
  const changeValue = totalInput - totalOutput - fee;
  console.log("totalInput: ", totalInput);
  console.log("totalOutput: ", totalOutput);
  console.log("changeValue: ", changeValue);

  if (changeValue < 0) {
    throw `Your wallet address doesn't have enough funds to buy this inscription.
  Price:      ${satToBtc(listing.seller.price)} BTC
  Required:   ${satToBtc(totalOutput + fee)} BTC
  Missing:    ${satToBtc(-changeValue)} BTC`;
  }

  // Change utxo
  if (changeValue > DUMMY_UTXO_MIN_VALUE) {
    psbt.addOutput({
      address: listing.buyer.buyerAddress,
      value: changeValue,
    });
  }

  listing.buyer.unsignedBuyingPSBTBase64 = psbt.toBase64();
  listing.buyer.unsignedBuyingPSBTInputSize = psbt.data.inputs.length;
  return listing;
}

export async function generateUnsignedSweepPSBTBase64(listing: ISweepState) {
  const psbt = new bitcoin.Psbt({ network });
  console.log("length:  length: ", listing.buyer?.buyerDummyUTXOs?.length, listing.seller.length + 1)
  if (
    listing.buyer?.buyerDummyUTXOs?.length !== listing.seller.length + 1 ||
    !listing.buyer.buyerPaymentUTXOs
  ) {
    throw new InvalidArgumentError("Buyer address has not enough utxos");
  }
  let totalInput = 0;
  let totalDummy = 0;
  let totalPrice = 0;

  for (const i of listing.seller) {
    totalInput += i.outputValue;
    totalPrice += i.price;
  }

  for (const i of listing.buyer.buyerDummyUTXOs) {
    totalDummy += i.value;
  }

  // Add two dummyUtxos
  for (const dummyUtxo of listing.buyer.buyerDummyUTXOs) {
    const input: any = {
      hash: dummyUtxo.txid,
      index: dummyUtxo.vout,
      nonWitnessUtxo: dummyUtxo.tx.toBuffer(),
    };

    const p2shInputRedeemScript: any = {};
    const p2shInputWitnessUTXO: any = {};

    if (isP2SHAddress(listing.buyer.buyerAddress, network)) {
      const redeemScript = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(listing.buyer.buyerPublicKey!, "hex"),
      }).output;
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
      });
      p2shInputWitnessUTXO.witnessUtxo = {
        script: p2sh.output,
        value: dummyUtxo.value,
      } as WitnessUtxo;
      p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
    }
    if (isTaprootAddress(listing.buyer.buyerAddress)) {
      input.witnessUtxo = dummyUtxo.tx.outs[dummyUtxo.vout];
      input.tapInternalKey = toXOnly(
        //tx.toBuffer().constructor(listing.buyer.buyerPublicKey!, 'hex'),
        Buffer.from(listing.buyer.buyerPublicKey!, "hex")
      );
    }

    psbt.addInput({
      ...input,
      ...p2shInputWitnessUTXO,
      ...p2shInputRedeemScript,
    });
    totalInput += dummyUtxo.value;
  }

  // Add dummy output
  psbt.addOutput({
    address: listing.buyer.buyerAddress,
    value: totalDummy,
  });
  // Add ordinal output
  for (const i of listing.seller) {
    console.log("address: value: ", listing.buyer.buyerTokenReceiveAddress, i.outputValue)
    psbt.addOutput({
      address: listing.buyer.buyerTokenReceiveAddress,
      value: i.outputValue,
    });
  }

  for (const i of listing.seller) {
    const { sellerInput, sellerOutput } = await getSweepSellerInputAndOutput(i);
    psbt.addInput(sellerInput);
    psbt.addOutput(sellerOutput);
  }

  // Add payment utxo inputs
  for (const utxo of listing.buyer.buyerPaymentUTXOs) {
    const input: any = {
      hash: utxo.txid,
      index: utxo.vout,
      nonWitnessUtxo: utxo.tx.toBuffer(),
    };

    const p2shInputWitnessUTXOUn: any = {};
    const p2shInputRedeemScriptUn: any = {};

    if (isP2SHAddress(listing.buyer.buyerAddress, network)) {
      const redeemScript = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(listing.buyer.buyerPublicKey!, "hex"),
      }).output;
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
      });
      p2shInputWitnessUTXOUn.witnessUtxo = {
        script: p2sh.output,
        value: utxo.value,
      } as WitnessUtxo;
      p2shInputRedeemScriptUn.redeemScript = p2sh.redeem?.output;
    }

    if (isTaprootAddress(listing.buyer.buyerAddress)) {
      input.witnessUtxo = utxo.tx.outs[utxo.vout];
      input.tapInternalKey = toXOnly(
        //tx.toBuffer().constructor(listing.buyer.buyerPublicKey!, 'hex'),
        Buffer.from(listing.buyer.buyerPublicKey!, "hex")
      );
    }

    psbt.addInput({
      ...input,
      ...p2shInputWitnessUTXOUn,
      ...p2shInputRedeemScriptUn,
    });

    totalInput += utxo.value;
  }

  // Create a platform fee output
  let platformFeeValue = Math.floor(totalPrice * listing.buyer.takerFeeBp);
  platformFeeValue =
    platformFeeValue > DUMMY_UTXO_MIN_VALUE
      ? platformFeeValue
      : DUMMY_UTXO_MIN_VALUE;

  if (platformFeeValue > 0) {
    psbt.addOutput({
      address: PLATFORM_FEE_ADDRESS,
      value: platformFeeValue,
    });
  }

  // Create ten new dummy utxo output for the next purchase
  for (var i = 0; i < 10; i++) {
    psbt.addOutput({
      address: listing.buyer.buyerAddress,
      value: DUMMY_UTXO_VALUE,
    });
  }

  const fee = calculateTxBytesFeeWithRate(
    psbt.txInputs.length,
    psbt.txOutputs.length + 1, //+1 加的是找零的那个长度 // already taken care of the exchange output bytes calculation
    listing.buyer.feeRate ?? 10
  );
  console.log("input len: ", psbt.txInputs.length);
  console.log("output len: ", psbt.txOutputs.length + 1);
  console.log("fee: ", fee);

  const totalOutput = psbt.txOutputs.reduce(
    (partialSum, a) => partialSum + a.value,
    0
  );
  const changeValue = totalInput - totalOutput - fee;
  console.log("totalInput: ", totalInput);
  console.log("totalOutput: ", totalOutput);
  console.log("changeValue: ", changeValue);

  if (changeValue < 0) {
    throw `Your wallet address doesn't have enough funds to buy this inscription.
  Price:      ${satToBtc(totalPrice)} BTC
  Required:   ${satToBtc(totalOutput + fee)} BTC
  Missing:    ${satToBtc(-changeValue)} BTC`;
  }

  // Change utxo
  if (changeValue > DUMMY_UTXO_MIN_VALUE) {
    psbt.addOutput({
      address: listing.buyer.buyerAddress,
      value: changeValue,
    });
  }

  listing.buyer.unsignedBuyingPSBTBase64 = psbt.toBase64();
  listing.buyer.unsignedBuyingPSBTInputSize = psbt.data.inputs.length;
  return listing;
}

export async function generateUnsignedListingPSBTBase64(
  listing: IListingState
) {
  // check listing attributes
  if (listing.seller.makerFeeBp < 0 || listing.seller.makerFeeBp > 1) {
    throw new InvalidArgumentError("The makeFeeBp range should be [0,1].");
  }
  const psbt = new bitcoin.Psbt({ network });
  const [ordinalUtxoTxId, ordinalUtxoVout] =
    listing.seller.ordItem.output.split(":");
  const res = await Post("https://api-mainnet.brc420.io/api/v1/tx/raw", {
    tx_hash: ordinalUtxoTxId,
  });
  const tx = bitcoin.Transaction.fromHex(res.data);
  // No need to add this witness if the seller is using taproot
  if (!listing.seller.tapInternalKey) {
    for (const output in tx.outs) {
      try {
        tx.setWitness(parseInt(output), []);
      } catch {}
    }
  }
  const input: any = {
    hash: ordinalUtxoTxId,
    index: parseInt(ordinalUtxoVout),
    nonWitnessUtxo: Buffer.from(res.data, "hex"),
    // No problem in always adding a witnessUtxo here
    witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
    sighashType:
      bitcoin.Transaction.SIGHASH_SINGLE |
      bitcoin.Transaction.SIGHASH_ANYONECANPAY,
  };
  // for p2sh account
  const p2shInputRedeemScript: any = {};
  const p2shInputWitnessUTXO: any = {};
  if (signer.isP2SHAddress(listing.seller.sellerOrdAddress, network)) {
    console.log("p2sh");
    const redeemScript = bitcoin.payments.p2wpkh({
      pubkey: Buffer.from(listing.seller.sellerPublicKey!, "hex"),
    }).output;
    const p2sh = bitcoin.payments.p2sh({
      redeem: { output: redeemScript },
    });
    p2shInputWitnessUTXO.witnessUtxo = {
      script: p2sh.output,
      value: listing.seller.ordItem.outputValue,
    } as signer.WitnessUtxo;
    p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
  }

  if (listing.seller.tapInternalKey) {
    console.log("taproot");
    input.tapInternalKey = toXOnly(
      tx.toBuffer().constructor(listing.seller.tapInternalKey, "hex")
    );
  }
  psbt.addInput({
    ...input,
    ...p2shInputRedeemScript,
    ...p2shInputWitnessUTXO,
  });
  const sellerOutput: number =
    listing.seller.price + listing.seller.ordItem.outputValue;

  console.log("sellerOutput", sellerOutput);
  psbt.addOutput({
    address: listing.seller.sellerReceiveAddress,
    value: sellerOutput,
  });
  listing.seller.unsignedListingPSBTBase64 = psbt.toBase64();
  return listing;
}

async function getSweepSellerInputAndOutput(state: ISweepItem) {
  const [ordinalUtxoTxId, ordinalUtxoVout] = state.output.split(":");
  const res = await Post("http://localhost:3002/api/v1/tx/raw", {
    tx_hash: ordinalUtxoTxId,
  });
  const tx = bitcoin.Transaction.fromHex(res.data);
  // No need to add this witness if the seller is using taproot
  if (!state.tapInternalKey) {
    for (let outputIndex = 0; outputIndex < tx.outs.length; outputIndex++) {
      try {
        tx.setWitness(outputIndex, []);
      } catch {}
    }
  }

  const sellerInput: any = {
    hash: ordinalUtxoTxId,
    index: parseInt(ordinalUtxoVout),
    nonWitnessUtxo: tx.toBuffer(),
    // No problem in always adding a witnessUtxo here
    witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
  };
  // If taproot is used, we need to add the internal key
  if (state.tapInternalKey) {
    sellerInput.tapInternalKey = toXOnly(
      tx.toBuffer().constructor(state.tapInternalKey, "hex")
    );
  }

  const ret = {
    sellerInput,
    sellerOutput: {
      address: state.owner,
      value: state.price + state.outputValue,
    },
  };

  return ret;
}

async function getSellerInputAndOutput(listing: IListingState) {
  const [ordinalUtxoTxId, ordinalUtxoVout] =
    listing.seller.ordItem.output.split(":");
  const res = await Post("https://api-mainnet.brc420.io/api/v1/tx/raw", {
    tx_hash: ordinalUtxoTxId,
  });
  const tx = bitcoin.Transaction.fromHex(res.data);
  // No need to add this witness if the seller is using taproot
  if (!listing.seller.tapInternalKey) {
    for (let outputIndex = 0; outputIndex < tx.outs.length; outputIndex++) {
      try {
        tx.setWitness(outputIndex, []);
      } catch {}
    }
  }

  const sellerInput: any = {
    hash: ordinalUtxoTxId,
    index: parseInt(ordinalUtxoVout),
    nonWitnessUtxo: tx.toBuffer(),
    // No problem in always adding a witnessUtxo here
    witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
  };
  // If taproot is used, we need to add the internal key
  if (listing.seller.tapInternalKey) {
    sellerInput.tapInternalKey = toXOnly(
      tx.toBuffer().constructor(listing.seller.tapInternalKey, "hex")
    );
  }

  const ret = {
    sellerInput,
    sellerOutput: {
      address: listing.seller.sellerReceiveAddress,
      value: listing.seller.price + listing.seller.ordItem.outputValue,
    },
  };

  return ret;
}

export async function selectDummyUTXOs(utxos: AddressTxsUtxo[]) {
  const result = [];
  for (const utxo of utxos) {
    if (utxo.value >= 600 && utxo.value <= 1000) {
      result.push((await mapUtxos([utxo]))[0]);
      if (result.length === 2) return result;
    }
  }

  return null;
}

export async function selectSweepDummyUTXOs(
  utxos: AddressTxsUtxo[],
  num: number
) {
  const result = [];
  for (const utxo of utxos) {
    if (utxo.value >= 600 && utxo.value <= 1000) {
      result.push((await mapUtxos([utxo]))[0]);
      if (result.length === num + 1) return result;
    }
  }

  return null;
}

export async function generateUnsignedListingPSBTBase64Batch(
  listingArr: IListingState[]
) {
  const tx_hash_list = listingArr.map((listing) => {
    return listing.seller.ordItem.output.split(':')[0]
  })

  const tx_hash_list_res = await tx_batch_raw({
    tx_hash_list,
  })

  const psbt = new bitcoin.Psbt({ network })
  listingArr.map((listing, index) => {
    // check listing attributes
    if (listing.seller.makerFeeBp < 0 || listing.seller.makerFeeBp > 1) {
      throw new InvalidArgumentError('The makeFeeBp range should be [0,1].')
    }

    const [ordinalUtxoTxId, ordinalUtxoVout] =
      listing.seller.ordItem.output.split(':')
    const res = tx_hash_list_res?.data[index]
    const tx = bitcoin.Transaction.fromHex(res)
    // No need to add this witness if the seller is using taproot
    if (!listing.seller.tapInternalKey) {
      for (const output in tx.outs) {
        try {
          tx.setWitness(parseInt(output), [])
        } catch {}
      }
    }
    const input: any = {
      hash: ordinalUtxoTxId,
      index: parseInt(ordinalUtxoVout),
      nonWitnessUtxo: Buffer.from(res, 'hex'),
      // No problem in always adding a witnessUtxo here
      witnessUtxo: tx.outs[parseInt(ordinalUtxoVout)],
      sighashType:
        bitcoin.Transaction.SIGHASH_SINGLE |
        bitcoin.Transaction.SIGHASH_ANYONECANPAY,
    }
    // for p2sh account
    const p2shInputRedeemScript: any = {}
    const p2shInputWitnessUTXO: any = {}
    if (signer.isP2SHAddress(listing.seller.sellerOrdAddress, network)) {
      const redeemScript = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(listing.seller.sellerPublicKey!, 'hex'),
      }).output
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
      })
      p2shInputWitnessUTXO.witnessUtxo = {
        script: p2sh.output,
        value: listing.seller.ordItem.outputValue,
      } as signer.WitnessUtxo
      p2shInputRedeemScript.redeemScript = p2sh.redeem?.output
    }
    if (listing.seller.tapInternalKey) {
      input.tapInternalKey = toXOnly(
        tx.toBuffer().constructor(listing.seller.tapInternalKey, 'hex')
      )
    }
    psbt.addInput({
      ...input,
      ...p2shInputRedeemScript,
      ...p2shInputWitnessUTXO,
    })

    const sellerOutput: number =
      listing.seller.price + listing.seller.ordItem.outputValue
    psbt.addOutput({
      address: listing.seller.sellerReceiveAddress,
      value: sellerOutput,
    })
  })
  return psbt.toBase64()
}

export async function tx_batch_raw({
  tx_hash_list,
}: {
  tx_hash_list: string[]
}) {
  const res = await fetch(`http://localhost:3002/api/v1/tx/batch/raw`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      tx_hash_list,
    }),
  })

  const data: NormalResponse<string[]> = await res.json()
  return data
}