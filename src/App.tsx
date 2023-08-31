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
import { IListingState, TxStatus, AddressTxsUtxo } from "./interfaces";
import { InvalidArgumentError } from "./interfaces";
import { satToBtc, toXOnly, isTaprootAddress } from "./util";
import { BatchMigrateCard } from "./batch_migrate";
import {
  generateUnsignedListingPSBTBase64,
  generateUnsignedBuyingPSBTBase64,
  mergeSignedBuyingPSBTBase64,
} from "./psbt";

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
            <BatchMigrateCard />
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
            //用户选择一个挂单
            const inscription_id =
              "2ee10fe7a8e6de60adac66cef80454899e89fd94ed0a86fe6b6ba7a2d5617180i0";
            const bitmapInfo = await InscriptionInfo(inscription_id);
            console.log("bitmapInfo: ", bitmapInfo.data);
            const state: IListingState = {
              //默认值的都是不需要的
              seller: {
                makerFeeBp: 0,
                sellerOrdAddress: address,
                // price需要卖家输入
                price: 888,
                ordItem: {
                  id: bitmapInfo.data.id,
                  owner: address,
                  location: bitmapInfo.data.location,
                  outputValue: parseInt(bitmapInfo.data.value),
                  output: bitmapInfo.data.output,
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

            console.log("sellerSignedPsbtBase64: ", sellerSignedPsbtBase64);
            await Post("http://localhost:3002/api/v1/market/list", {
              inscription_id: bitmapInfo.data.id,
              un_verify_psbt: sellerSignedPsbtBase64,
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
            const inscription_id =
              "2ee10fe7a8e6de60adac66cef80454899e89fd94ed0a86fe6b6ba7a2d5617180i0";
            const price = 1388;
            const outputValue = 500;
            const takerFee = 0.1; //买家平台费10%
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
            await Post("http://localhost:3002/api/v1/tx/utxo", {
              address: address,
            }).then((data) => {
              console.log("data: ", data);

              data.data.forEach((item: any) => {
                const status: TxStatus = {
                  confirmed: true,
                  block_height: item.block_height,
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
                  price +
                    (price - outputValue) * takerFee +
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
                  (price - outputValue) * takerFee +
                  DUMMY_UTXO_VALUE * 4 +
                  purchasefee +
                  setupfee
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
                "http://localhost:3002/api/v1/tx/broadcast",
                { signed_tx_data: setUpPSBTHex }
              );
              console.log("setup txHash: ", boardCastRes.data);

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
                if (selectedAmount > price + outputValue + purchasefee) {
                  break;
                }
              }
              if (selectedAmount < price + outputValue + purchasefee) {
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
            const state: IListingState = {
              seller: {
                makerFeeBp: 0, //卖家不收钱
                sellerOrdAddress: "",
                price: price - outputValue,
                ordItem: {
                  id: "2ee10fe7a8e6de60adac66cef80454899e89fd94ed0a86fe6b6ba7a2d5617180i0",
                  owner: "bc1qwej4856wpnexlplm6ruwym2rq8r44tsy4zjmjc",
                  location:
                    "2ee10fe7a8e6de60adac66cef80454899e89fd94ed0a86fe6b6ba7a2d5617180:0:0",
                  outputValue: outputValue,
                  output:
                    "2ee10fe7a8e6de60adac66cef80454899e89fd94ed0a86fe6b6ba7a2d5617180:0",
                  listedPrice: price,
                },
                sellerReceiveAddress:
                  "bc1qwej4856wpnexlplm6ruwym2rq8r44tsy4zjmjc",
              },
              buyer: {
                takerFeeBp: takerFee, //买家收钱，费率10%
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
            const signedBuyingPSBTBase64 =
              bitcoin.Psbt.fromHex(signedBuyingPSBTHex).toBase64();
            console.log("signedBuyingPSBTBase64===: ", signedBuyingPSBTBase64);
            const purchaseRes = await Post(
              "http://localhost:3002/api/v1/tx/merge",
              {
                signed_buyer_psbt: signedBuyingPSBTBase64,
                inscription_id: inscription_id,
              }
            );
            console.log("purchase txHash: ", purchaseRes.data);

            //将卖家和买家签名后的psbt合并之后广播, 落库
            // const finalPsbt = mergeSignedBuyingPSBTBase64(
            //   "cHNidP8BAFICAAAAAYBxYdWip2tr/oYK7ZT9iZ6JVAT4zmasrWDe5qjnD+EuAAAAAAD/////AWwFAAAAAAAAFgAUdmVT004M8m+H+9D44m1DAcdargQAAAAAAAEA/VwBAQAAAAABAYzLOlJtfJKae4Lgtulnwczowp3Lh4OwDj/9/8RaQqYTAAAAAAD1////AfQBAAAAAAAAFgAUdmVT004M8m+H+9D44m1DAcdargQDQGoAcnGCdEJ1t33GeeWlBnfaFg79ciORn8J9q04aW6smO0v8+qul79PXARUQzkspua9RbIRb8ODRzWyx7wAu7dijIIzmt1fSqN6v2WaavwAzTBUwj0tNzP2GgSf0Bkcl/4qrrABjA29yZAEBGHRleHQvcGxhaW47Y2hhcnNldD11dGYtOABMXHsicCI6ImJicyIsIm9wIjoicG9zdCIsImJvYXJkIjoiT3JkaW5hbHMiLCJ0aXRsZSI6ImRhc2QiLCJjb250ZW50IjoiZGFzZHNhZGFzZGFkIiwidGFncyI6W119aCHAjOa3V9Ko3q/ZZpq/ADNMFTCPS03M/YaBJ/QGRyX/iqsAAAAAAQEf9AEAAAAAAAAWABR2ZVPTTgzyb4f70PjibUMBx1quBAEIawJHMEQCIEmKN9nVTCOYw00R23OcSsC24FyQYmW2Zr+p9ujWcrtCAiBddj1HD1vfBUGDRyhVITBYzkyH0QGgBRx6jcszz28ryoMhA+LfDG/O2bhTCkZkm8fsBqv6hjalG8rN5BUMUnFbdunfAAA=",
            //   signedBuyingPSBTBase64
            // );

            // console.log(
            //   "finalPsbt: ",
            //   bitcoin.Psbt.fromBase64(finalPsbt).toHex()
            // );
            // return;
            // const boardCastRes = await Post(
            //   "http://localhost:3002/api/v1/tx/broadcast",
            //   { signed_tx_data: bitcoin.Psbt.fromBase64(finalPsbt).toHex() }
            // );
            // console.log("purchase txHash: ", boardCastRes.data);
            // const recordBuyRes = await Post(
            //   "http://localhost:3001/api/v1/tx/buy",
            //   {
            //     inscription_id: info.inscripton_id,
            //     inscription_num: "", //yw的list接口有这个数据
            //     price: info.price,
            //     domain: "", //yw的list接口有这个数据
            //     seller: info.seller_address,
            //     buyer: address,
            //    }
            // );
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
            const psbtResult = await (window as any).unisat.signPsbt(psbtHex, {
              autoFinalized: true,
            });
            setPsbtResult(psbtResult);
            const base64Psbt = bitcoin.Psbt.fromHex(psbtResult).toBase64();
            console.log("base64Psbt: ", base64Psbt);
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

export async function Post(url = "", data = {}) {
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
async function InscriptionInfo(id = "") {
  const url = `http://localhost:3002/api/v1/inscription/info?inscription_id=${id}`;
  const res = await Fetch(url);

  return await res.json();
}
async function feeRate() {
  const url = "https://mempool.space/api/v1/fees/recommended";
  const res = await Fetch(url);
  return await res.json();
}

export default App;
