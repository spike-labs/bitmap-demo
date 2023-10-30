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
import { IListingState, TxStatus, AddressTxsUtxo, ISweepItem, ISweepState} from "./interfaces";
import { InvalidArgumentError } from "./interfaces";
import {
  mapUtxos,
  toXOnly,
  isTaprootAddress,
  calculateTxBytesFeeWithRate,
} from "./util";
import { BatchMigrateCard } from "./batch_migrate";
import {
  generateUnsignedListingPSBTBase64,
  generateUnsignedBuyingPSBTBase64,
  selectDummyUTXOs,
  selectSweepDummyUTXOs,
  generateUnsignedSweepPSBTBase64,
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
            <SignBase64PsbtCard />
            <ConstructSellerPsbtCard />
            <ConstructBuyerPsbtCard />
            <SweepCard />
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
              "c7dfdff40591cd277ea3ba10fa08b422c6664b64428a4aa01c0936d3cf0aa647i0";
              //"0de393ca5bece5c17a4efd394804b0d857aee04d5e521a0f7e594870b00f9499i0";
              //"f24f62c8606f91cfd222d4d66c1a99d122d170e0de287a4130ecbdfc70f6712ei0"
            const bitmapInfo = await InscriptionInfo(inscription_id);
            console.log("bitmapInfo: ", bitmapInfo.data);
            const state: IListingState = {
              //默认值的都是不需要的
              seller: {
                makerFeeBp: 0, //卖家先不收手续费
                sellerOrdAddress: address,
                // price需要卖家输入
                price: 550,
                ordItem: {
                  id: bitmapInfo.data.id,
                  owner: address,
                  location: bitmapInfo.data.location,
                  outputValue: bitmapInfo.data.value, //这里是idclub的新接口，返回的是number
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
              "f24f62c8606f91cfd222d4d66c1a99d122d170e0de287a4130ecbdfc70f6712ei0";
            const price = 546;
            const outputValue = 546;
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
            await Post("http://localhost:3002/api/v1/market/utxo", {
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
                console.log("selectedUtxos.length : ", selectedUtxos.length);

                setupfee = calculateTxBytesFeeWithRate(
                  selectedUtxos.length,
                  3, //两个对齐 + 一个找零
                  feeRateRes.fastestFee
                );
                purchasefee = calculateTxBytesFeeWithRate(
                  4, //两个对齐 + 一个买 + 一个卖家的铭文
                  7, //固定的
                  feeRateRes.fastestFee
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
                purchasefee = calculateTxBytesFeeWithRate(
                  3 + selectedUtxos.length,
                  7,
                  feeRateRes.fastestFee
                );
                console.log(purchasefee);
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
              selectedPaymentUtxo = await mapUtxos(selectedUtxos);
            }

            console.log("selectedPaymentUtxo-----: ", selectedPaymentUtxo);
            const state: IListingState = {
              seller: {
                makerFeeBp: 0, //卖家不收钱
                sellerOrdAddress: "",
                price: price - outputValue,
                ordItem: {
                  id: "f24f62c8606f91cfd222d4d66c1a99d122d170e0de287a4130ecbdfc70f6712ei0",
                  owner:
                    "bc1pu637fe5t20njrsuulsgwvvmq34s6w53hleavm3aesxelr4p8u6zsqvw88r",
                  location:
                    "f24f62c8606f91cfd222d4d66c1a99d122d170e0de287a4130ecbdfc70f6712e:0:0",
                  outputValue: outputValue,
                  output:
                    "f24f62c8606f91cfd222d4d66c1a99d122d170e0de287a4130ecbdfc70f6712e:0",
                  listedPrice: price,
                },
                sellerReceiveAddress:
                  "bc1pu637fe5t20njrsuulsgwvvmq34s6w53hleavm3aesxelr4p8u6zsqvw88r",
              },
              buyer: {
                takerFeeBp: takerFee, //买家收钱，费率1%
                buyerAddress: address,
                buyerTokenReceiveAddress: address,
                buyerDummyUTXOs: selectDummyUtxos,
                buyerPaymentUTXOs: selectedPaymentUtxo,
                buyerPublicKey: publicKey,
                feeRate: feeRateRes.fastestFee,
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

function SignBase64PsbtCard() {
  const [psbtBase64, setPsbtBase64] = useState("");
  const [psbtResult, setPsbtResult] = useState("");
  return (
    <Card size="small" title="Sign Psbt" style={{ width: 300, margin: 10 }}>
      <div style={{ textAlign: "left", marginTop: 10 }}>
        <div style={{ fontWeight: "bold" }}>PsbtBase64:</div>
        <Input
          defaultValue={psbtBase64}
          onChange={(e) => {
            setPsbtBase64(e.target.value);
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
            const hexPsbt = bitcoin.Psbt.fromBase64(psbtBase64).toHex();
            console.log("base64Psbt: ", hexPsbt);
            const psbtResult = await (window as any).unisat.signPsbt(hexPsbt, {
              autoFinalized: true,
            });
            const signedBase64Psbt = bitcoin.Psbt.fromHex(psbtResult).toBase64();
            console.log("signedBase64Psbt: ", signedBase64Psbt)
          } catch (e) {
            setPsbtResult((e as any).message);
          }
        }}
      >
        Sign base64 Psbt
      </Button>
    </Card>
  );
}

function SweepCard() {
  const [psbtHex, setPsbtHex] = useState("");
  const [txid, setTxid] = useState("");
  const [publicKey, setPublicKey] = useState("");
  const [address, setAddress] = useState("");
  return (
    <Card size="small" title="sweep card" style={{ width: 300, margin: 10 }}>
      <Button
        style={{ marginTop: 10 }}
        onClick={async () => {
          const unisat = (window as any).unisat;
          const [address] = await unisat.getAccounts();
          setAddress(address);

          const publicKey = await unisat.getPublicKey();
          setPublicKey(publicKey);
          try {
            const inscription_id_list = [
              "ee51630efc1a1ebdd363a924fd93621494ca464b16fbafcd5c59ebad5f270d8ai0",
              "804e1a175cb2cc95db5244bb90e0fa9cbb737f3b5d510efb4a46f63d9a2cffdei0",
              "8c54799752dcedccc1bae8b8eac971fc7beec6cd8c9576ca958ba02e1d8fdbd3i0", //这里拿三个出来测试，正常线上是用户选择哪几个
            ];

            if (inscription_id_list.length > 9) {
              //参考magiceden，一次最多买九个
              return;
            }
            const result = [];
            for (const id of inscription_id_list) {
              const info = await InscriptionInfo(id); //这里为了简化流程，去查了第三方，正常线上这些信息是从marketplace列表信息拿 包括price
              console.log("id: , info: ", id, info)
              result.push(info.data);
            }
            console.log("result: ", result);

            const price = 550; //这里所有的铭文price写死 550聪
            const outputValue = 546; //这里所有的铭文outputValue写死 546聪
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
            await Post("http://localhost:3002/api/v1/market/utxo", {
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
            //挑选(要买的铭文数量 + 1)个600sats-1000sats的utxo对齐用
            let dummyUtxo = await selectSweepDummyUTXOs(
              unspentList,
              inscription_id_list.length
            );
            //将>=10000面值的utxo过滤出来用于购买铭文
            unspentList = unspentList
              .filter((x) => x.value >= 10000)
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
                console.log("selectedUtxos.length : ", selectedUtxos.length);

                setupfee = calculateTxBytesFeeWithRate(
                  selectedUtxos.length,
                  11, //十个对齐 + 一个找零
                  feeRateRes.economyFee
                );
                purchasefee = calculateTxBytesFeeWithRate(
                  inscription_id_list.length * 2 + 1, // N+1个对齐 + N个卖家的铭文 + 一个买
                  inscription_id_list.length * 2 + 13, // 一个合并 + N个铭文 + 10个对齐 + N个给卖家的钱 + 平台手续费 + 找零
                  feeRateRes.economyFee
                );

                //价格 + 600的对齐utxo * 10 + gas
                if (
                  selectedAmount >
                  (price + outputValue) * inscription_id_list.length +
                    price * inscription_id_list.length * takerFee +
                    DUMMY_UTXO_VALUE * 10 +
                    purchasefee +
                    setupfee
                ) {
                  break;
                }
              }
              if (
                selectedAmount <
                (price + outputValue) * inscription_id_list.length +
                  price * inscription_id_list.length * takerFee +
                  DUMMY_UTXO_VALUE * 10 +
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
              //构造出10个对齐的和找零的
              for (var i = 0; i < 10; i++) {
                psbt.addOutput({
                  address: address,
                  value: DUMMY_UTXO_VALUE,
                });
              }

              const change = totalInput - DUMMY_UTXO_VALUE * 10 - setupfee;
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

              for (var i = 0; i <= inscription_id_list.length; i++) {
                pendingDummyUtxos.push({
                  txid: boardCastRes.data,
                  vout: i,
                  value: DUMMY_UTXO_VALUE,
                  status: {
                    confirmed: false,
                    block_height: 0,
                    block_hash: "",
                    block_time: 0,
                  },
                  tx: bitcoin.Transaction.fromHex(rawTxHex),
                });
              }
              pendingPaymentUtxos.push({
                txid: boardCastRes.data,
                vout: 10,
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
              //有足够的对齐的铭文就直接用
              console.log("dummyUtxo: ", dummyUtxo);
              for (const utxo of unspentList) {
                selectedUtxos.push(utxo);
                selectedAmount += utxo.value;
                purchasefee = calculateTxBytesFeeWithRate(
                  inscription_id_list.length * 2 + 1, // N+1个对齐 + N个卖家的铭文 + 一个买
                  inscription_id_list.length * 2 + 13, // 一个合并 + N个铭文 + 10个对齐 + N个给卖家的钱 + 平台手续费 + 找零
                  feeRateRes.economyFee
                );
                console.log(purchasefee);
                if (
                  selectedAmount >
                  (price + outputValue) * inscription_id_list.length +
                    price * inscription_id_list.length * takerFee +
                    purchasefee
                ) {
                  break;
                }
              }
              if (
                selectedAmount <
                (price + outputValue) * inscription_id_list.length +
                  price * inscription_id_list.length * takerFee +
                  purchasefee
              ) {
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
            let ordItem : ISweepItem[] = [];
            for (const r of result) {
              const item : ISweepItem = {
                id: r.id,
                owner: r.address,
                location: r.location,
                output: r.output,
                outputValue: r.value,
                price: 550,
                sellerReceiveAddress: r.address,
              }
              ordItem.push(item)
            } 

            const state: ISweepState = {
              seller: ordItem,
              buyer: {
                takerFeeBp: takerFee, //买家收钱，费率1%
                buyerAddress: address,
                buyerTokenReceiveAddress: address,
                buyerDummyUTXOs: selectDummyUtxos,
                buyerPaymentUTXOs: selectedPaymentUtxo,
                buyerPublicKey: publicKey,
                feeRate: feeRateRes.economyFee,
                platformFeeAddress: "bc1pjutzl7wrvr8qt3vs0xn0xjyh2ezj3mhq2m0u7f2f8qarq9ng8w9qvm6g22",
              },
            };
            const unsignedBuyingPSBTBase64Res =
              await generateUnsignedSweepPSBTBase64(state);
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
              "http://localhost:3002/api/v1/tx/sweep",
              {
                signed_buyer_psbt: signedBuyingPSBTBase64,
                inscription_id_list: inscription_id_list,
              }
            );
            console.log("purchase txHash: ", purchaseRes.data);
          
          } catch (e) {
            console.log(e);
          }
        }}
      >
        sweep card
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
