import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import Fetch from "cross-fetch";
import { Button, Card, Input } from "antd";
import * as btc from "micro-btc-signer";
import { hex, base64 } from "@scure/base";
import * as signer from "@mixobitc/msigner";
import * as bitcoin from "bitcoinjs-lib";
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
import { InvalidArgumentError } from "./interfaces";
import { satToBtc, toXOnly } from "./util";
import { assertDeclaredPredicate } from "@babel/types";

const network =
  BTC_NETWORK === "mainnet"
    ? bitcoin.networks.bitcoin
    : bitcoin.networks.testnet;

function App() {
  const [unisatInstalled, setUnisatInstalled] = useState(false);
  const [connected, setConnected] = useState(false);
  const [accounts, setAccounts] = useState<string[]>([]);
  const [publicKey, setPublicKey] = useState("");
  const [address, setAddress] = useState("");
  const [balance, setBalance] = useState({
    confirmed: 0,
    unconfirmed: 0,
    total: 0,
  });
  const [network, setNetwork] = useState("livenet");
  const [owBitmapOrderInfo, setOwBitmapOrderList] = useState([]);
  const [meBitmapOrderInfo, setMeBitmapOrderList] = useState([]);

  const getBasicInfo = async () => {
    const unisat = (window as any).unisat;
    const [address] = await unisat.getAccounts();
    setAddress(address);

    const publicKey = await unisat.getPublicKey();
    setPublicKey(publicKey);

    const balance = await unisat.getBalance();
    setBalance(balance);

    const network = await unisat.getNetwork();
    setNetwork(network);
  };

  const selfRef = useRef<{ accounts: string[] }>({
    accounts: [],
  });
  const self = selfRef.current;
  const handleAccountsChanged = (_accounts: string[]) => {
    if (self.accounts[0] === _accounts[0]) {
      // prevent from triggering twice
      return;
    }
    self.accounts = _accounts;
    if (_accounts.length > 0) {
      setAccounts(_accounts);
      setConnected(true);

      setAddress(_accounts[0]);

      getBasicInfo();
    } else {
      setConnected(false);
    }
  };

  const handleNetworkChanged = (network: string) => {
    setNetwork(network);
    getBasicInfo();
  };

  useEffect(() => {
    async function checkUnisat() {
      let unisat = (window as any).unisat;

      for (let i = 1; i < 10 && !unisat; i += 1) {
        await new Promise((resolve) => setTimeout(resolve, 100 * i));
        unisat = (window as any).unisat;
      }

      if (unisat) {
        setUnisatInstalled(true);
      } else if (!unisat) return;

      unisat.getAccounts().then((accounts: string[]) => {
        handleAccountsChanged(accounts);
      });

      unisat.on("accountsChanged", handleAccountsChanged);
      unisat.on("networkChanged", handleNetworkChanged);

      return () => {
        unisat.removeListener("accountsChanged", handleAccountsChanged);
        unisat.removeListener("networkChanged", handleNetworkChanged);
      };
    }
    checkUnisat().then();
    async function fetchOwBitMap() {
      const bitmapOrderList = await Post(
        "https://turbo.ordinalswallet.com/collection/bitmap/inscriptions?offset=0&order=PriceAsc&listed=true&limit=5"
      );
      console.log("bitmapOwOrderList", bitmapOrderList);
      setOwBitmapOrderList(bitmapOrderList);
      bitmapOrderList.forEach((item: any) => {
        console.log("seller: ", item.escrow.seller_address);
        console.log("satoshiPrice: ", item.escrow.satoshi_price);
        console.log("inscriptionId: ", item.id);
        console.log("number: ", item.num);
      });
    }
    fetchOwBitMap().then();
    async function fetchMeBitMap() {
      const bitmapOrderList = await getMeOrderList();
      console.log("bitmapOrderList", bitmapOrderList.tokens);
      setMeBitmapOrderList(bitmapOrderList.tokens);
      bitmapOrderList.tokens.forEach((item: any) => {
        console.log("seller: ", item.owner);
        console.log("satoshiPrice: ", item.listedPrice);
        console.log("inscriptionId: ", item.id);
        console.log("number: ", item.inscriptionNumber);
      });
    }
    fetchMeBitMap().then();
  }, []);

  if (!unisatInstalled) {
    return (
      <div className="App">
        <header className="App-header">
          <div>
            <Button
              onClick={() => {
                window.location.href = "https://unisat.io";
              }}
            >
              Install Unisat Wallet
            </Button>
          </div>
        </header>
      </div>
    );
  }
  const unisat = (window as any).unisat;
  return (
    <div className="App">
      <header className="App-header">
        <p>bitmap market demo</p>

        {connected ? (
          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
            }}
          >
            <Card
              size="small"
              title="Basic Info"
              style={{ width: 300, margin: 10 }}
            >
              <div style={{ textAlign: "left", marginTop: 10 }}>
                <div style={{ fontWeight: "bold" }}>Address:</div>
                <div style={{ wordWrap: "break-word" }}>{address}</div>
              </div>

              <div style={{ textAlign: "left", marginTop: 10 }}>
                <div style={{ fontWeight: "bold" }}>PublicKey:</div>
                <div style={{ wordWrap: "break-word" }}>{publicKey}</div>
              </div>

              <div style={{ textAlign: "left", marginTop: 10 }}>
                <div style={{ fontWeight: "bold" }}>Balance: (Satoshis)</div>
                <div style={{ wordWrap: "break-word" }}>{balance.total}</div>
              </div>
            </Card>
            <SignPsbtCard />
            <ConstructSellerPsbtCard />
            <ConstructBuyerPsbtCard />
            {owBitmapOrderInfo.map((item: any) => {
              return (
                <Card
                  size="small"
                  title="order Info"
                  style={{ width: 800, margin: 10 }}
                >
                  <div style={{ textAlign: "left", marginTop: 10 }}>
                    <div style={{ fontWeight: "bold" }}>
                      platform: ordinal wallet
                    </div>
                    <div style={{ fontWeight: "bold" }}>
                      inscriptionId: {item.id}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      seller: {item.escrow.seller_address}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      number: {item.num}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      name: {item.meta.name}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      price: {item.escrow.satoshi_price} satoshi
                    </div>
                    <Button
                      style={{ marginTop: 10 }}
                      onClick={async () => {
                        try {
                          //let p2trPublicKey = publicKey.substring(2)
                          const purchaseRes = await Post(
                            "https://turbo.ordinalswallet.com/wallet/purchase",
                            {
                              from: address,
                              inscription: item.id,
                              public_key: publicKey,
                            }
                          );
                          console.log("purchaseRes: ", purchaseRes);
                          const setupResult = await (
                            window as any
                          ).unisat.signPsbt(purchaseRes.setup, {
                            autoFinalized: false,
                          });
                          // const setupBroadcastRes = await Post(
                          //   "http://localhost:3002/api/v1/tx/broadcast",
                          //   {
                          //     signed_tx_data: setupResult
                          //   }
                          // );
                          const setUpTx = btc.Transaction.fromPSBT(
                            hex.decode(setupResult)
                          );

                          setUpTx.finalize();
                          const purchaseResult = await (
                            window as any
                          ).unisat.signPsbt(purchaseRes.purchase, {
                            autoFinalized: true,
                          });
                          console.log("setUpHex: ", setUpTx.hex);
                          console.log("purchase signed: ", purchaseResult);

                          // const purchaseBroadcastRes = await Post(
                          //   "http://localhost:3002/api/v1/tx/broadcast",
                          //   {
                          //     signed_tx_data: purchaseResult
                          //   }
                          // );
                          // const purchaseTx = btc.Transaction.fromPSBT(
                          //   hex.decode(purchaseResult)
                          // );

                          // console.log('setUpTxhash: ', setUpTx.hash);
                          // console.log('purchaseTxhash', purchaseTx.hash);
                          // const setUpTxPushResult = await Post("https://api.blockcypher.com/v1/btc/main/txs/push", {tx: setUpTx.hex})
                          // console.log("setUpTxPushResult: ", setUpTxPushResult)
                          // const purchaseTxPushResult = await Post("https://api.blockcypher.com/v1/btc/main/txs/push", {tx: purchaseTx.hex})
                          // console.log("purchaseTxPushResult: ", purchaseTxPushResult)
                          const marketPurchaseRes = await Post(
                            "https://turbo.ordinalswallet.com/market/purchase",
                            {
                              setup_rawtx: setUpTx.hex,
                              purchase_rawtx: purchaseResult,
                            }
                          );
                          console.log("marketPurchaseRes: ", marketPurchaseRes);
                        } catch (e) {
                          console.log(e);
                        }
                      }}
                    >
                      buy it
                    </Button>
                  </div>
                </Card>
              );
            })}
            {meBitmapOrderInfo.map((item: any) => {
              return (
                <Card
                  size="small"
                  title="order Info"
                  style={{ width: 800, margin: 10 }}
                >
                  <div style={{ textAlign: "left", marginTop: 10 }}>
                    <div style={{ fontWeight: "bold" }}>
                      platform: magiceden
                    </div>
                    <div style={{ fontWeight: "bold" }}>
                      inscriptionId: {item.id}{" "}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      seller: {item.owner}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      number: {item.inscriptionNumber}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      name: {item.meta.name}
                    </div>
                    <div style={{ wordWrap: "break-word" }}>
                      price: {item.listedPrice} satoshi
                    </div>
                    <Button
                      style={{ marginTop: 10 }}
                      onClick={async () => {
                        try {
                          const orderInfo = await getMeOrderInfo(
                            item.id,
                            address,
                            publicKey,
                            item.listedPrice
                          );
                          console.log("orderInfo: ", orderInfo);
                          const psbtHex = hex.encode(
                            btc.Transaction.fromPSBT(
                              base64.decode(orderInfo.unsignedBuyingPSBTBase64)
                            ).toPSBT(0)
                          );

                          const signedPsbtHex = await (
                            window as any
                          ).unisat.signPsbt(psbtHex, {
                            autoFinalized: true,
                          });
                          const signedTx = btc.Transaction.fromPSBT(
                            hex.decode(signedPsbtHex)
                          );
                          const signedPsbtBase64 = base64.encode(
                            signedTx.toPSBT(0)
                          );

                          const buyRes = await Post(
                            "https://api-mainnet.magiceden.io/v2/ord/btc/psbt/buying",
                            {
                              buyerAddress: address,
                              buyerTokenReceiveAddress: address,
                              makerFee: orderInfo.makerFee,
                              price: orderInfo.price,
                              signedBuyingPSBTBase64: signedPsbtBase64,
                              takerFee: orderInfo.takerFee,
                              toSignInputs: orderInfo.toSignInputs,
                              toSignSigHash: orderInfo.toSignSigHash,
                              tokenId: orderInfo.tokenId,
                              unsignedBuyingPSBTBase64:
                                orderInfo.unsignedBuyingPSBTBase64,
                            }
                          );
                          console.log("buyRes: ", buyRes);
                        } catch (e) {
                          console.log(e);
                        }
                      }}
                    >
                      buy it
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        ) : (
          <div>
            <Button
              onClick={async () => {
                const result = await unisat.requestAccounts();
                handleAccountsChanged(result);
              }}
            >
              Connect Unisat Wallet
            </Button>
          </div>
        )}
      </header>
    </div>
  );
}

function ConstructSellerPsbtCard() {
  const [psbtHex, setPsbtHex] = useState("");
  const [txid, setTxid] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [address, setAddress] = useState("");
  return (
    <Card
      size="small"
      title="Construct seller Psbt"
      style={{ width: 300, margin: 10 }}
    >
      <Button
        style={{ marginTop: 10 }}
        onClick={async () => {
          const unisat = (window as any).unisat;
          const [address] = await unisat.getAccounts();
          setAddress(address);

          const publicKey = await unisat.getPublicKey();
          setPublicKey(publicKey);
          try {
            ///查询用户名下的bitmap
            const bitmapList = await Post(
              "http://localhost:3001/api/v1/tx/bitmapList",
              {
                wallet_address: address,
                page: 1,
                limit: 5,
              }
            );
            console.log("bitmaList: ", bitmapList);

            //用户选择一个挂单
            console.log("id: ", bitmapList.data.bitmap_list[0].inscription_id);
            const bitmapInfo = await Post(
              "http://localhost:3001/api/v1/tx/bitmapInfo",
              {
                inscription_id: bitmapList.data.bitmap_list[0].inscription_id,
              }
            );
            console.log("bitmapInfo: ", bitmapInfo.data);
            const state: signer.IListingState = {
              //默认值的都是不需要的
              seller: {
                makerFeeBp: 0,
                sellerOrdAddress: address,
                // price需要卖家输入
                price: 888,
                ordItem: {
                  id: bitmapInfo.data.id,
                  contentURI: "",
                  contentType: "",
                  contentPreviewURI: "",
                  sat: 0,
                  satName: "",
                  genesisTransaction: "",
                  inscriptionNumber: 0,
                  chain: "",
                  owner: address,
                  postage: 0,
                  location: bitmapInfo.data.location,
                  outputValue: parseInt(bitmapInfo.data.value),
                  output: bitmapInfo.data.output,
                  listed: false,
                },
                sellerReceiveAddress: address,
                sellerPublicKey: publicKey,
              },
            };
            if (isTaprootAddress(address)) {
              state.seller.tapInternalKey = publicKey;
            }

            // class demoItemProvider implements signer.ItemProvider {
            //   async getTokenByOutput(
            //     output: string
            //   ): Promise<signer.IOrdItem | null> {
            //     return state.seller.ordItem;
            //   }
            //   async getTokenById(
            //     tokenId: string
            //   ): Promise<signer.IOrdItem | null> {
            //     return state.seller.ordItem;
            //   }
            // }

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
            console.log("sellerUnsignedPsbtHex===: ", sellerUnsignedPsbtHex);
            const sellerSignedPsbtHex = await (window as any).unisat.signPsbt(
              sellerUnsignedPsbtHex,
              {
                autoFinalized: true,
              }
            );
            console.log("sellerSignedPsbtHex===: ", sellerSignedPsbtHex);
            const signdPsbt = btc.Transaction.fromPSBT(
              hex.decode(sellerSignedPsbtHex)
            );
            const sellerSignedPsbtBase64 = base64.encode(signdPsbt.toPSBT(0));
            // const req: signer.IOrdAPIPostPSBTListing = {
            //   price: 18888,
            //   tokenId:
            //     "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32ei0",
            //   sellerReceiveAddress: address,
            //   signedListingPSBTBase64: sellerSignedPsbtBase64,
            //   tapInternalKey: publicKey,
            // };
            // console.log("======");
            // await signer.SellerSigner.verifySignedListingPSBTBase64(
            //   req,
            //   new demoFeeProvider(),
            //   new demoItemProvider()
            // );
            console.log("sellerSignedPsbtBase64: ", sellerSignedPsbtBase64);
            //调后端的接口，将seller_address, sellerSignedPsbtBase64, inscriptionId, number, name, output, outputValue, location, price落库
            await Post("http://localhost:3001/api/v1/order/shelf", {
              inscription_id: bitmapInfo.data.id,
              inscription_num: bitmapList.data.bitmap_list[0].number,
              price: bitmapInfo.data.price,
              domain: bitmapList.data.bitmap_list[0].name,
              seller_address: bitmapList.data.bitmap_list[0].owner,
              psbt_base_64: sellerSignedPsbtBase64,
              output_value: bitmapInfo.data.value,
              output: bitmapInfo.data.output,
              location: bitmapInfo.data.location,
            });
          } catch (e) {
            console.log(e);
          }
        }}
      >
        ConstructSellerPsbt
      </Button>
    </Card>
  );
}

function ConstructBuyerPsbtCard() {
  const [psbtHex, setPsbtHex] = useState("");
  const [txid, setTxid] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [address, setAddress] = useState("");
  return (
    <Card
      size="small"
      title="Construct buyer Psbt"
      style={{ width: 300, margin: 10 }}
    >
      <Button
        style={{ marginTop: 10 }}
        onClick={async () => {
          const unisat = (window as any).unisat;
          const [address] = await unisat.getAccounts();
          setAddress(address);

          const publicKey = await unisat.getPublicKey();
          setPublicKey(publicKey);
          try {
            const info = await Post("http://localhost:3001/api/v1/order/originInfo", {
              inscription_id: "",
            });
            console.log("info: ", info)

            // class demoFeeProvider implements signer.FeeProvider {
            //   async getMakerFeeBp(maker: string): Promise<number> {
            //     return 0;
            //   }
            //   async getTakerFeeBp(taker: string): Promise<number> {
            //     return 0;
            //   }
            // }
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
            await getUnspent(address).then((data) => {
              console.log("data: ", data);
              data.txrefs.forEach((item: any) => {
                const status: signer.TxStatus = {
                  confirmed: true,
                  block_height: item.block_height,
                  block_hash: "",
                  block_time: 0,
                };
                const utxo: signer.AddressTxsUtxo = {
                  txid: item.tx_hash,
                  vout: item.tx_output_n,
                  value: item.value,
                  status: status,
                };
                unspentList.push(utxo);
              });
            });
            console.log("unspentList: ", unspentList);
            //挑选两个600sats-1000sats的utxo对齐用
            let dummyUtxo = await signer.BuyerSigner.selectDummyUTXOs(
              unspentList,
              new demoItemProvider()
            );
            //将>1000 && != 10000的utxo过滤出来，以用于购买铭文，既不会和对齐的utxo重复，也不会把包含铭文的utxo错用了
            unspentList = unspentList
              .filter(
                (x) =>
                  x.value > DUMMY_UTXO_MAX_VALUE &&
                  x.value !== ORDINALS_POSTAGE_VALUE
              )
              .sort((a, b) => b.value - a.value);

            console.log("dummyUtxo: ", dummyUtxo);
            let selectedUtxos = [];
            let selectedAmount = 0;
            let selectDummyUtxos: signer.utxo[] | undefined;
            let selectedPaymentUtxo: signer.utxo[] = [];
            const feeRateRes = await feeRate();
            let setupfee = 0;
            let purchasefee = 0;
            console.log("feeRateRes: ", feeRateRes);
            //如果没有对齐的铭文，就自己构造setup交易创造两个
            if (dummyUtxo == null) {
              console.log("dummyUtxo not enough");
              const psbt = new bitcoin.Psbt({ network });
              for (const utxo of unspentList) {
                selectedUtxos.push(utxo);
                selectedAmount += utxo.value;
                setupfee = signer.calculateTxBytesFeeWithRate(
                  selectedUtxos.length,
                  3, //两个对齐 + 一个找零
                  feeRateRes.minimumFee
                );
                purchasefee = signer.calculateTxBytesFeeWithRate(
                  4, //两个对齐 + 一个买 + 一个卖家的铭文
                  6, //固定的
                  feeRateRes.minimumFee
                );

                //价格 + 两个600的对齐utxo * 2 + gas
                if (
                  selectedAmount >
                  info.price + info.output_value + DUMMY_UTXO_VALUE * 4 + purchasefee + setupfee
                ) {
                  break;
                }
              }
              if (
                selectedAmount <
                888 + 10000 + DUMMY_UTXO_VALUE * 4 + purchasefee + setupfee
              ) {
                console.log("not enough btc");
                return;
              }
              let totalInput = 0;
              const setupPaymentUtxo = await signer.mapUtxos(selectedUtxos);
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
              const setUpPSBTHex = await (window as any).unisat.signPsbt(
                psbt.toHex(),
                {
                  autoFinalized: true,
                }
              );
              console.log("setUpPSBTHex: ", setUpPSBTHex);

              const p = bitcoin.Psbt.fromHex(setUpPSBTHex);
              console.log("raw: ", p.extractTransaction().toHex());
              //广播并拿到setup txhash
              const boardCastRes = await Post(
                "http://localhost:3001/api/v1/tx/boardCast",
                { tx_hex: setUpPSBTHex, flag: true }
              );
              console.log("setup txHash: ", boardCastRes.data);
              // const rawRes  = await Post("http://localhost:3001/api/v1/tx/raw", {tx_hash: boardCastRes.data})
              // console.log("raw tx: ", rawRes.data)
              const rawTxHex = p.extractTransaction().toHex();
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
                purchasefee = signer.calculateTxBytesFeeWithRate(
                  3 + selectedUtxos.length,
                  6,
                  feeRateRes.minimumFee
                );
                if (selectedAmount > info.price + info.output_value + purchasefee) {
                  break;
                }
              }
              if (selectedAmount < info.price + info.output_value + purchasefee) {
                console.log("not enough btc");
                return;
              }
              if (dummyUtxo === null) {
                selectDummyUtxos = undefined;
              } else {
                selectDummyUtxos = dummyUtxo;
              }
              selectedPaymentUtxo = await signer.mapUtxos(selectedUtxos);
            }

            console.log("selectedPaymentUtxo-----: ", selectedPaymentUtxo);
            const state: signer.IListingState = {
              seller: {
                makerFeeBp: 0,
                sellerOrdAddress: "",
                price: info.price,
                ordItem: {
                  id: info.inscription_id,
                  contentURI: "",
                  contentType: "",
                  contentPreviewURI: "",
                  sat: 0,
                  satName: "",
                  genesisTransaction: "",
                  inscriptionNumber: 0,
                  chain: "",
                  owner: info.seller_address,
                  postage: 0,
                  location:
                    info.location,
                  outputValue: info.output_value,
                  output:
                    info.output,
                  listed: false,
                  listedMakerFeeBp: 0,
                  listedPrice: info.price,
                  listedSellerReceiveAddress: "",
                },
                sellerReceiveAddress:
                  info.seller_address,
                //tapInternalKey: publicKey,
                //这里是ConstructSellerPsbt签出来的，这里直接复制过来
                //这里需要根据后端返回的base64转成hex  => bitcoin.Psbt.fromBase64(psbtBase64).toHex()
                signedListingPSBTHex:
                bitcoin.Psbt.fromBase64(info.psbt_base_64).toHex(),
              },
              buyer: {
                takerFeeBp: 0,
                buyerAddress: address,
                buyerTokenReceiveAddress: address,
                buyerDummyUTXOs: selectDummyUtxos,
                buyerPaymentUTXOs: selectedPaymentUtxo,
                buyerPublicKey: publicKey,
                feeRate: feeRateRes.minimumFee,
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
            const unsignedBuyingPSBTHex = bitcoin.Psbt.fromBase64(
              unsignedBuyingPSBTBase64Res.buyer.unsignedBuyingPSBTBase64
            ).toHex();
            console.log("unsignedBuyingPSBTHex===: ", unsignedBuyingPSBTHex);
            const signedBuyingPSBTHex = await (window as any).unisat.signPsbt(
              unsignedBuyingPSBTHex,
              {
                autoFinalized: true,
              }
            );
            console.log("signedBuyingPSBTHex===: ", signedBuyingPSBTHex);
            const signedBuyingPSBTBase64 =
              bitcoin.Psbt.fromHex(signedBuyingPSBTHex).toBase64();
            // const buyState : signer.IOrdAPIPostPSBTBuying = {
            //     price: 18888,
            //     tokenId: "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32ei0",
            //     buyerAddress: "bc1pdmmlcs4s2aatvgz4kpzahaqrv69mcrhdatfudlv6l2gkweh6cndsx2m0jg",
            //     buyerTokenReceiveAddress: "bc1pdmmlcs4s2aatvgz4kpzahaqrv69mcrhdatfudlv6l2gkweh6cndsx2m0jg",
            //     signedBuyingPSBTBase64: signedBuyingPSBTBase64,
            // }

            // class demoItemProvider1 implements signer.ItemProvider {
            //   async getTokenByOutput(
            //     output: string
            //   ): Promise<signer.IOrdItem | null> {
            //     return state.seller.ordItem;
            //   }
            //   async getTokenById(
            //     tokenId: string
            //   ): Promise<signer.IOrdItem | null> {
            //     return state.seller.ordItem;
            //   }
            // }
            // signer.BuyerSigner.verifySignedBuyingPSBTBase64(buyState, new demoFeeProvider(), new demoItemProvider1())

            //将卖家和买家签名后的psbt合并之后广播, 落库
            const finalPsbt = mergeSignedBuyingPSBTBase64(
              info.psbt_base_64,
              signedBuyingPSBTBase64
            );

            console.log(
              "finalPsbt: ",
              bitcoin.Psbt.fromBase64(finalPsbt).toHex()
            );
            const boardCastRes = await Post(
              "http://localhost:3001/api/v1/tx/boardCast",
              { tx_hex: bitcoin.Psbt.fromBase64(finalPsbt).toHex(), flag: true }
            );
            console.log("purchase txHash: ", boardCastRes.data);
            const recordBuyRes = await Post(
              "http://localhost:3001/api/v1/tx/buy",
              { 
                inscription_id: info.inscripton_id,
                inscription_num: "", //yw的list接口有这个数据
                price: info.price, 
                domain: "", //yw的list接口有这个数据
                seller: info.seller_address,
                buyer: address,
               }
            );
          } catch (e) {
            console.log(e);
          }
        }}
      >
        ConstructBuyerPsbt
      </Button>
    </Card>
  );
}

function SignPsbtCard() {
  const [psbtHex, setPsbtHex] = useState("");
  const [psbtResult, setPsbtResult] = useState("");
  return (
    <Card size="small" title="Sign Psbt" style={{ width: 300, margin: 10 }}>
      <div style={{ textAlign: "left", marginTop: 10 }}>
        <div style={{ fontWeight: "bold" }}>PsbtHex:</div>
        <Input
          defaultValue={psbtHex}
          onChange={(e) => {
            setPsbtHex(e.target.value);
          }}
        ></Input>
      </div>
      <div style={{ textAlign: "left", marginTop: 10 }}>
        <div style={{ fontWeight: "bold" }}>Result:</div>
        <div style={{ wordWrap: "break-word" }}>{psbtResult}</div>
      </div>
      <Button
        style={{ marginTop: 10 }}
        onClick={async () => {
          try {
            const psbtResult = await (window as any).unisat.signPsbt(psbtHex);
            setPsbtResult(psbtResult);
          } catch (e) {
            setPsbtResult((e as any).message);
          }
        }}
      >
        Sign Psbt
      </Button>
    </Card>
  );
}

async function getMeOrderList() {
  const url = `https://api-mainnet.magiceden.io/v2/ord/btc/tokens?limit=20&offset=0&sortBy=priceAsc&minPrice=0&maxPrice=0&collectionSymbol=bitmap&disablePendingTransactions=false`;
  const res = await Fetch(url);

  return await res.json();
}

async function getMeOrderInfo(
  inscriptionId: string,
  address: string,
  pKey: string,
  price: number
) {
  const url = `https://api-mainnet.magiceden.io/v2/ord/btc/psbt/buying?tokenId=${inscriptionId}&price=${price}&buyerAddress=${address}&buyerTokenReceiveAddress=${address}&buyerPublicKey=${pKey}&feerateTier=halfHourFee`;
  const res = await Fetch(url);

  return await res.json();
}

async function Post(url = "", data = {}) {
  const response = await fetch(url, {
    method: "POST",
    mode: "cors",
    headers: {
      "Content-Type": "application/json",
      //'Content-Type': 'application/x-www-form-urlencoded',
    },
    redirect: "follow",
    referrerPolicy: "no-referrer",
    body: JSON.stringify(data),
  });
  return response.json();
}

async function getUnspent(address = "") {
  const url = `https://api.blockcypher.com/v1/btc/main/addrs/${address}?unspentOnly=true&limit=2000`;
  const res = await Fetch(url);

  return await res.json();
}
async function feeRate() {
  const url = "https://mempool.space/api/v1/fees/recommended";
  const res = await Fetch(url);
  return await res.json();
}
async function generateUnsignedBuyingPSBTBase64(listing: signer.IListingState) {
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

    if (signer.isP2SHAddress(listing.buyer.buyerAddress, network)) {
      const redeemScript = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(listing.buyer.buyerPublicKey!, "hex"),
      }).output;
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
      });
      p2shInputWitnessUTXO.witnessUtxo = {
        script: p2sh.output,
        value: dummyUtxo.value,
      } as signer.WitnessUtxo;
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

    if (signer.isP2SHAddress(listing.buyer.buyerAddress, network)) {
      const redeemScript = bitcoin.payments.p2wpkh({
        pubkey: Buffer.from(listing.buyer.buyerPublicKey!, "hex"),
      }).output;
      const p2sh = bitcoin.payments.p2sh({
        redeem: { output: redeemScript },
      });
      p2shInputWitnessUTXOUn.witnessUtxo = {
        script: p2sh.output,
        value: utxo.value,
      } as signer.WitnessUtxo;
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
    (listing.seller.price *
      (listing.buyer.takerFeeBp + listing.seller.makerFeeBp)) /
      10000
  );
  platformFeeValue =
    platformFeeValue > DUMMY_UTXO_MIN_VALUE ? platformFeeValue : 0;

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

  const fee = await signer.calculateTxBytesFeeWithRate(
    psbt.txInputs.length,
    psbt.txOutputs.length, // already taken care of the exchange output bytes calculation
    listing.buyer.feeRate ?? 10
  );
  console.log("input len: ", psbt.txInputs.length);
  console.log("output len: ", psbt.txOutputs.length);
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

async function generateUnsignedListingPSBTBase64(
  listing: signer.IListingState
) {
  // check listing attributes
  if (listing.seller.makerFeeBp < 0 || listing.seller.makerFeeBp > 1) {
    throw new InvalidArgumentError("The makeFeeBp range should be [0,1].");
  }
  const psbt = new bitcoin.Psbt({ network });
  const [ordinalUtxoTxId, ordinalUtxoVout] =
    listing.seller.ordItem.output.split(":");

  const tx = bitcoin.Transaction.fromHex(
    await signer.getTxHexById(ordinalUtxoTxId)
  );
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
    nonWitnessUtxo: tx.toBuffer(),
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
  // // If taproot is used, we need to add the internal key
  // if (listing.seller.tapInternalKey) {
  //   input.witnessUtxo = tx.outs[parseInt(ordinalUtxoVout)];
  //   input.tapInternalKey = toXOnly(
  //     tx.toBuffer().constructor(listing.seller.tapInternalKey, 'hex'),
  //   );
  // }

  if (listing.seller.tapInternalKey) {
    input.tapInternalKey = toXOnly(
      tx.toBuffer().constructor(listing.seller.tapInternalKey, "hex")
    );
  }
  //psbt.addInput(input);
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

async function getSellerInputAndOutput(listing: signer.IListingState) {
  const [ordinalUtxoTxId, ordinalUtxoVout] =
    listing.seller.ordItem.output.split(":");
  const res = await Post("http://localhost:3001/api/v1/tx/raw", {
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
function mergeSignedBuyingPSBTBase64(
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

function isTaprootAddress(address: any) {
  if (address.startsWith("tb1p") || address.startsWith("bc1p")) {
    return true;
  }
  return false;
}

export default App;
