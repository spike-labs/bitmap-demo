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
import { IListingState } from "./interfaces";
import { generateUnsignedListingPSBTBase64 } from "./psbt";
import { isTaprootAddress } from "./util";
import { number } from "bitcoinjs-lib/src/script";

export function BatchMigrateCard() {
  const [publicKey, setPublicKey] = useState("");
  const [address, setAddress] = useState("");

  return (
    <Card size="small" title="Batch Migrate" style={{ width: 300, margin: 10 }}>
      <Button
        style={{ marginTop: 10 }}
        onClick={async () => {
          const unisat = (window as any).unisat;
          const [address] = await unisat.getAccounts();
          setAddress(address);

          const publicKey = await unisat.getPublicKey();
          setPublicKey(publicKey);
          try {
            //展示该钱包下有效的订单
            const list = await Post(
              "http://localhost:3002/api/v1/order/list",
              {
                address: address,
                page: 1,
                limit: 2
              }
            );
            console.log("list: ", list)

            //查询用户在ordyssey的订单
            const escrowList = await Post(
              "http://localhost:3002/api/v1/order/copy",
              {
                address: address,
              }
            );
            let unsignedPsbtHex: any[] = [];
            console.log("order list: ", escrowList);
            const f1 = async() => {
              for (let index = 0; index < escrowList.data.length; index++) {
                console.log("index: ", index)
                const state: IListingState = {
                  seller: {
                    makerFeeBp: 0,
                    sellerOrdAddress: escrowList.data[index].seller_address,
                    price: escrowList.data[index].price,
                    ordItem: {
                      id: escrowList.data[index].inscription_id,
                      owner: address,
                      location: escrowList.data[index].location,
                      outputValue: escrowList.data[index].output_value,
                      output: escrowList.data[index].output,
                    },
                    sellerReceiveAddress: address,
                    sellerPublicKey: publicKey,
                  },
                };

                if (isTaprootAddress(address)) {
                  state.seller.tapInternalKey = publicKey;
                }
                const sellerUnsignedPsbtBase64 =
                  await generateUnsignedListingPSBTBase64(state);
                  console.log(
                    "sellerUnsignedPsbtBase64===: ",
                    sellerUnsignedPsbtBase64
                  );
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
                console.log(
                  "sellerUnsignedPsbtHex===: ",
                  sellerUnsignedPsbtHex
                );
                unsignedPsbtHex.push(sellerUnsignedPsbtHex);
              }
            };
            await f1();

            console.log("any[]: ", unsignedPsbtHex);
            const sellerSignedPsbtHex = await (
              window as any
            ).unisat.signPsbts(unsignedPsbtHex, {
              autoFinalized: true,
            });

            let signedPsbtBase64List: any[] = [];

            for (let index = 0; index < sellerSignedPsbtHex.length; index++) {
              const signedBuyingBase64 = bitcoin.Psbt.fromHex(
                sellerSignedPsbtHex[index]
              ).toBase64();
              signedPsbtBase64List.push({
                inscription_id: escrowList.data[index].inscription_id,
                price: escrowList.data[index].price,
                seller_address: escrowList.data[index].address,
                signed_seller_psbt_base64: signedBuyingBase64,
                number: escrowList.data[index].number,
                collection: escrowList.data[index].collection,
                output_value: escrowList.data[index].output_value,
                output: escrowList.data[index].output,
                location: escrowList.data[index].location,
              });
            }
            //签完名之后  调用后端接口保存
            const res = await Post(
              "http://localhost:3002/api/v1/order/create",
              {
                list: signedPsbtBase64List,
              }
            );
            console.log("res: ", res)
          } catch (e) {
            console.log(e);
          }
        }}
      >
        BatchMigrateCard
      </Button>
    </Card>
  );
}
