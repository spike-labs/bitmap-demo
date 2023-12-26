import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import { Button, Card, Input } from "antd";
import { Post } from "./App";
import "./App.css";
import Fetch from "cross-fetch";
import * as btc from "micro-btc-signer";
import { hex, base64 } from "@scure/base";
import * as signer from "@mixobitc/msigner";
import * as bitcoin from "bitcoinjs-lib";
import { Psbt } from "bitcoinjs-lib";
import { IListingState, TxStatus, AddressTxsUtxo, ISweepItem, ISweepState} from "./interfaces";
import { generateUnsignedListingPSBTBase64, generateUnsignedBuyingPSBTBase64 } from "./psbt";
import { number } from "bitcoinjs-lib/src/script";
import {InscriptionInfo} from "./App"
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
import {
  mapUtxos,
  toXOnly,
  isTaprootAddress,
  calculateTxBytesFeeWithRate,
} from "./util";
import {
  generateUnsignedListingPSBTBase64Batch,
  selectDummyUTXOs,
  selectSweepDummyUTXOs,
  generateUnsignedSweepPSBTBase64,
} from "./psbt";


const network =
  BTC_NETWORK === "mainnet"
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;


export function BitgetWalletSellerCard() {
    return (
      <Card size="small" title="bitget wallet" style={{ width: 300, margin: 10 }}>
        <Button
          style={{ marginTop: 10 }}
          onClick={async () => {
            const bitget = (window as any).bitkeep.unisat;
            const isBitKeepInstalled = !!((window as any).bitkeep && (window as any).bitkeep.unisat);
            if (!isBitKeepInstalled) {
               console.log('UniSat Wallet is installed!')
               return
            }
            await bitget.requestAccounts()

            const [address] = await bitget.getAccounts()
            const publicKey = await bitget.getPublicKey()
             //用户选择一个挂单
             const inscription_id  = 
             "46193d29c5e21fa31c0d175f10bdd0d14a9caad31529b87f1aa345d99ac5e4b3i0";
         
           const info = await InscriptionInfo(inscription_id);
           console.log("info:", info)
           const state: IListingState = {
             //默认值的都是不需要的
             seller: {
               makerFeeBp: 0, //卖家先不收手续费
               sellerOrdAddress: address,
               // price需要卖家输入
               price: 666,
               ordItem: {
                 id: info.data.id,
                 owner: address,
                 location: info.data.location,
                 outputValue: info.data.value, //这里是idclub的新接口，返回的是number
                 output: info.data.output,
               },
               sellerReceiveAddress: address,
               sellerPublicKey: publicKey,
             },
           }
       
           if (isTaprootAddress(address)) {
             state.seller.tapInternalKey = publicKey;
           }

           const sellerUnsignedPsbtBase64 =
             await generateUnsignedListingPSBTBase64(state);
           if (
             sellerUnsignedPsbtBase64.seller.unsignedListingPSBTBase64 ===
             undefined
           ) {
             return;
           }         
           const unsigndPsbt = btc.Transaction.fromPSBT(
            base64.decode(
              sellerUnsignedPsbtBase64.seller.unsignedListingPSBTBase64
            )
          );
           const sellerUnsignedPsbtHex = hex.encode(unsigndPsbt.toPSBT(0));
           let res = await bitget.signPsbt(sellerUnsignedPsbtHex);
           const base64Res = Psbt.fromHex(res).finalizeAllInputs().toBase64()         
           console.log("res: ", base64Res)
          }}
        >
          BitgetWallet seller
        </Button>
      </Card>
    );
  }
  
  export function BitgetWalletBuyerCard() {  
    return (
      <Card size="small" title="bitget wallet" style={{ width: 300, margin: 10 }}>
        <Button
          style={{ marginTop: 10 }}
          onClick={async () => {
             const bitget = (window as any).bitkeep.unisat;
             const isBitKeepInstalled = !!((window as any).bitkeep && (window as any).bitkeep.unisat);
             if (!isBitKeepInstalled) {
                console.log('bitkeep Wallet is installed!')
                return
             }
             await bitget.requestAccounts()

             const [address] = await bitget.getAccounts()
             const publicKey = await bitget.getPublicKey()
             //用户选择一个挂单
             const inscription_id  = 
             "46193d29c5e21fa31c0d175f10bdd0d14a9caad31529b87f1aa345d99ac5e4b3i0";
         
             const info = await InscriptionInfo(inscription_id);
             const price = 666;
           
             const takerFee = 0.01; //买家平台费1%
             //这个接口的作用是查询这个utxo是否包含铭文，我们在前面简单的直接通过value的值来判断，这里直接返回null表明没有包含铭文
             class demoItemProvider implements signer.ItemProvider {
               async getTokenByOutput(
                 output: string
               ): Promise<signer.IOrdItem | null> {
                 return null;
               }
               async getTokenById(
                 tokenId: string
               ): Promise<signer.IOrdItem | null> {
                 return null;
               }
             }
             let unspentList: any[] = [];
             //这个有改动，和铭刻的时候返回的数据有差别
             await Post("https://api-mainnet.brc420.io/api/v1/market/utxo", {
               address: address,
             }).then((data) => {
               console.log("data: ", data);
 
               data.data.forEach((item: any) => {
                 const status: TxStatus = {
                   confirmed: true,
                   block_height: item.block_height, //这些数据都没用，凑数的
                   block_hash: "",
                   block_time: 0,
                 };
                 const utxo: AddressTxsUtxo = {
                   txid: item.tx_id,
                   vout: item.vout,
                   value: item.value,
                   status: status,
                 };
                 unspentList.push(utxo);
               });
             });
             console.log("unspentList: ", unspentList);
             //挑选两个600sats-1000sats的utxo对齐用
             let dummyUtxo = await selectDummyUTXOs(unspentList);
             //将>=10000面值的utxo过滤出来用于购买铭文
             unspentList = unspentList
               .filter((x) => x.value >= 10000)
               .sort((a, b) => b.value - a.value);
 
             console.log("dummyUtxo: ", dummyUtxo);
             let selectedUtxos = [];
             let selectedAmount = 0;
             let selectDummyUtxos: signer.utxo[] | undefined;
             let selectedPaymentUtxo: signer.utxo[] = [];
            // const feeRateRes = await feeRate();
             let setupfee = 0;
             let purchasefee = 0;
            // console.log("feeRateRes: ", feeRateRes);
             //如果没有对齐的铭文，就自己构造setup交易创造两个
             if (dummyUtxo == null) {
               console.log("dummyUtxo not enough");
               const psbt = new bitcoin.Psbt({ network });
 
               for (const utxo of unspentList) {
                 selectedUtxos.push(utxo);
                 selectedAmount += utxo.value;
                 console.log("selectedUtxos.length : ", selectedUtxos.length);
 
                 setupfee = calculateTxBytesFeeWithRate(
                   selectedUtxos.length,
                   3, //两个对齐 + 一个找零
                   //feeRateRes.fastestFee
                   100
                 );
                 purchasefee = calculateTxBytesFeeWithRate(
                   4, //两个对齐 + 一个买 + 一个卖家的铭文
                   7, //固定的
                   //feeRateRes.fastestFee
                   100
                 );
 
                 //价格 + 两个600的对齐utxo * 2 + gas
                 if (
                   selectedAmount >
                   price +
                     (price - info.data.value) * takerFee +
                     DUMMY_UTXO_VALUE * 4 +
                     purchasefee +
                     setupfee
                 ) {
                   break;
                 }
               }
               if (
                 selectedAmount <
                 price +
                   (price - info.data.value) * takerFee +
                   DUMMY_UTXO_VALUE * 4 +
                   purchasefee +
                   setupfee
               ) {
                 console.log("not enough btc");
                 return;
               }
               let totalInput = 0;
               const setupPaymentUtxo = await mapUtxos(selectedUtxos);
               //构造setup tx的input
               for (const utxo of setupPaymentUtxo) {
                 const input: any = {
                   hash: utxo.txid,
                   index: utxo.vout,
                   nonWitnessUtxo: utxo.tx.toBuffer(),
                 };
 
                 const p2shInputRedeemScript: any = {};
                 const p2shInputWitnessUTXO: any = {};
 
                 if (signer.isP2SHAddress(address, network)) {
                   const redeemScript = bitcoin.payments.p2wpkh({
                     pubkey: Buffer.from(publicKey!, "hex"),
                   }).output;
                   const p2sh = bitcoin.payments.p2sh({
                     redeem: { output: redeemScript },
                   });
                   p2shInputWitnessUTXO.witnessUtxo = {
                     script: p2sh.output,
                     value: utxo.value,
                   } as signer.WitnessUtxo;
                   p2shInputRedeemScript.redeemScript = p2sh.redeem?.output;
                 }
                 if (isTaprootAddress(address)) {
                   input.witnessUtxo = utxo.tx.outs[utxo.vout];
                   input.tapInternalKey = toXOnly(
                     //tx.toBuffer().constructor(listing.buyer.buyerPublicKey!, 'hex'),
                     Buffer.from(publicKey!, "hex")
                   );
                 }
 
                 psbt.addInput({
                   ...input,
                   ...p2shInputWitnessUTXO,
                   ...p2shInputRedeemScript,
                 });
                 totalInput += utxo.value;
               }
               //构造出两个对齐的和找零的
               psbt.addOutput({
                 address: address,
                 value: DUMMY_UTXO_VALUE,
               });
               psbt.addOutput({
                 address: address,
                 value: DUMMY_UTXO_VALUE,
               });
               const change = totalInput - DUMMY_UTXO_VALUE * 2 - setupfee;
               psbt.addOutput({
                 address: address,
                 value: change,
               });
               const setUpPSBTHex = await bitget.signPsbt(
                 psbt.toHex(),
               );
               console.log("setUpPSBTHex: ", setUpPSBTHex);
 
               const p = bitcoin.Psbt.fromHex(setUpPSBTHex).finalizeAllInputs().toHex();
               //广播并拿到setup txhash
               const boardCastRes = await Post(
                 "https://api-mainnet.brc420.io/api/v1/tx/broadcast",
                 { signed_tx_data: p }
               );
               console.log("setup txHash: ", boardCastRes.data);
 
               const rawTxHex = bitcoin.Psbt.fromHex(p).extractTransaction().toHex()
               let pendingDummyUtxos: signer.utxo[] = [];
               let pendingPaymentUtxos: signer.utxo[] = [];
 
               pendingDummyUtxos.push({
                 txid: boardCastRes.data,
                 vout: 0,
                 value: DUMMY_UTXO_VALUE,
                 status: {
                   confirmed: false,
                   block_height: 0,
                   block_hash: "",
                   block_time: 0,
                 },
                 tx: bitcoin.Transaction.fromHex(rawTxHex),
               });
               pendingDummyUtxos.push({
                 txid: boardCastRes.data,
                 vout: 1,
                 value: DUMMY_UTXO_VALUE,
                 status: {
                   confirmed: false,
                   block_height: 0,
                   block_hash: "",
                   block_time: 0,
                 },
                 tx: bitcoin.Transaction.fromHex(rawTxHex),
               });
               pendingPaymentUtxos.push({
                 txid: boardCastRes.data,
                 vout: 2,
                 value: change,
                 status: {
                   confirmed: false,
                   block_height: 0,
                   block_hash: "",
                   block_time: 0,
                 },
                 tx: bitcoin.Transaction.fromHex(rawTxHex),
               });
               console.log("pendingPaymentUtxos: ", pendingPaymentUtxos);
               selectedPaymentUtxo = pendingPaymentUtxos;
               console.log("selectedPaymentUtxo: ", selectedPaymentUtxo);
               selectDummyUtxos = pendingDummyUtxos;
             } else {
               //有两个对齐的铭文就直接用
               console.log("dummyUtxo: ", dummyUtxo);
               for (const utxo of unspentList) {
                 selectedUtxos.push(utxo);
                 selectedAmount += utxo.value;
                 purchasefee = calculateTxBytesFeeWithRate(
                   3 + selectedUtxos.length,
                   7,
                   //feeRateRes.fastestFee
                   100
                 );
                 console.log(purchasefee);
                 if (selectedAmount > price + info.data.value + purchasefee) {
                   break;
                 }
               }
               if (selectedAmount < price + info.data.value + purchasefee) {
                 console.log("not enough btc");
                 return;
               }
               if (dummyUtxo === null) {
                 selectDummyUtxos = undefined;
               } else {
                 selectDummyUtxos = dummyUtxo;
               }
               selectedPaymentUtxo = await mapUtxos(selectedUtxos);
             }
 
             console.log("selectedPaymentUtxo-----: ", selectedPaymentUtxo);
             const state: IListingState = {
               seller: {
                 makerFeeBp: 0, //卖家不收钱
                 sellerOrdAddress: "",
                 price: price,
                 ordItem: {
                   id: info.data.id,
                   owner:
                     info.data.address,
                   location:
                     info.data.location,
                   outputValue: info.data.value,
                   output:
                     info.data.output,
                   listedPrice: price,
                 },
                 sellerReceiveAddress:
                     info.data.address,
               },
               buyer: {
                 takerFeeBp: takerFee, //买家收钱，费率1%
                 buyerAddress: address,
                 buyerTokenReceiveAddress: address,
                 buyerDummyUTXOs: selectDummyUtxos,
                 buyerPaymentUTXOs: selectedPaymentUtxo,
                 buyerPublicKey: publicKey,
                 //feeRate: feeRateRes.fastestFee,
                 feeRate: 80,
                 platformFeeAddress: "",
               },
             };
             const unsignedBuyingPSBTBase64Res =
               await generateUnsignedBuyingPSBTBase64(state);
             console.log(
               "UnsignedBuyingPSBTBase64: ",
               unsignedBuyingPSBTBase64Res.buyer?.unsignedBuyingPSBTBase64
             );
             if (
               unsignedBuyingPSBTBase64Res.buyer?.unsignedBuyingPSBTBase64 ===
               undefined
             ) {
               return;
             }
             const signData = Psbt.fromBase64(unsignedBuyingPSBTBase64Res.buyer.unsignedBuyingPSBTBase64).toHex()      

            let res = await bitget.signPsbt(signData);
            const signedBuyingPSBTBase64 = bitcoin.Psbt.fromHex(res).toBase64();
            // let p =  Psbt.fromBase64(signedBuyingPSBTBase64)
            // for (let i=0; i< p.data.inputs.length;i++) {
            //   if (i == 2) { //okx钱包不能finalize卖家的input
            //       continue
            //   }
            //   p = p.finalizeInput(i)
            // }
            // console.log('finalizedSignedPsbtBase64: ', p.toBase64())//这个传给后端的merge方法
            console.log("signedBuyingPSBTBase64: ", signedBuyingPSBTBase64)
          }}
        >
          bitget wallet buyer
        </Button>
      </Card>
    );
  }