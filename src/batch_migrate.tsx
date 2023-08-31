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
            ///查询用户在ordinals wallet那挂的bitmap单
            const escrowList = await Post(
              "http://localhost:3001/api/v1/tx/escrowInfo",
              {
                wallet_address: address,
              }
            );
            let unsignedPsbtHex: any[] = [];
            console.log("escrowList: ", escrowList);
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
            console.log("sellerSignedPsbtHex===: ", sellerSignedPsbtHex);
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
