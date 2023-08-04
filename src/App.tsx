import React, { useEffect, useRef, useState } from "react";
import "./App.css";
import Fetch from "cross-fetch";
import { Button, Card, Input } from "antd";
import * as btc from "micro-btc-signer";
import { hex, base64 } from "@scure/base";
import * as signer from "@mixobitc/msigner";
import Item from "antd/es/list/Item";

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

                          // const signedPsbtBase64 = base64.encode(btc.Transaction.fromPSBT(
                          //   hex.decode(signedPsbtHex)
                          // ).toPSBT(0));
                          const signedTx = btc.Transaction.fromPSBT(
                            hex.decode(signedPsbtHex)
                          );
                          // signedTx.finalize()
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
            class demoFeeProvider implements signer.FeeProvider {
              async getMakerFeeBp(maker: string): Promise<number> {
                return 0.0001;
              }
              async getTakerFeeBp(taker: string): Promise<number> {
                return 0.0001;
              }
            }

            const state: signer.IListingState = {
              seller: {
                makerFeeBp: 0.001,
                sellerOrdAddress: address,
                price: 18888,
                //这里的信息是从自己的钱包找一个直接写死的
                ordItem: {
                  id: "ee51630efc1a1ebdd363a924fd93621494ca464b16fbafcd5c59ebad5f270d8ai0",
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
                  location: "",
                  outputValue: 500,
                  output:
                    "ee51630efc1a1ebdd363a924fd93621494ca464b16fbafcd5c59ebad5f270d8a:0",
                  listed: false,
                },
                sellerReceiveAddress: address,
                tapInternalKey: publicKey,
              },
            };

            class demoItemProvider implements signer.ItemProvider {
              async getTokenByOutput(
                output: string
              ): Promise<signer.IOrdItem | null> {
                return state.seller.ordItem;
              }
              async getTokenById(
                tokenId: string
              ): Promise<signer.IOrdItem | null> {
                return state.seller.ordItem;
              }
            }

            const sellerUnsignedPsbtBase64 =
              await signer.SellerSigner.generateUnsignedListingPSBTBase64(
                state
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
            const req: signer.IOrdAPIPostPSBTListing = {
              price: 18888,
              tokenId:
                "ee51630efc1a1ebdd363a924fd93621494ca464b16fbafcd5c59ebad5f270d8ai0",
              sellerReceiveAddress: address,
              signedListingPSBTBase64: sellerSignedPsbtBase64,
              tapInternalKey: publicKey,
            };
            await signer.SellerSigner.verifySignedListingPSBTBase64(
              req,
              new demoFeeProvider(),
              new demoItemProvider()
            );
            console.log("sellerSignedPsbtBase64: ", sellerSignedPsbtBase64);
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
            class demoFeeProvider implements signer.FeeProvider {
              async getMakerFeeBp(maker: string): Promise<number> {
                return 0.0001;
              }
              async getTakerFeeBp(taker: string): Promise<number> {
                return 0.0001;
              }
            }

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
            let paymentUtxo: any[] = [];
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
            let dummyUtxo = await signer.BuyerSigner.selectDummyUTXOs(
              unspentList,
              new demoItemProvider()
            );
            console.log("dummyUtxo: ", dummyUtxo);

            const selectedUtxos = [];
            let selectedAmount = 0;
            unspentList = unspentList
              .filter((x) => x.value > 1000)
              .sort((a, b) => b.value - a.value);
            for (const utxo of unspentList) {
              selectedUtxos.push(utxo)
              selectedAmount += utxo.value
              //这个钱怎么算？？
              if (selectedAmount > 18888) {
                break
              }
            }
            if (selectedAmount < 18888) {
              console.log('not enough btc')
              return
            }
            let myDummyUtxos: signer.utxo[] | undefined;
            if (dummyUtxo === null) {
              myDummyUtxos = undefined
            } else {
              myDummyUtxos = dummyUtxo
            }

            const selectedPaymentUtxo = await signer.mapUtxos(selectedUtxos)
            console.log('selectedPaymentUtxo: ', selectedPaymentUtxo)
            const state: signer.IListingState = {
              seller: {
                makerFeeBp: 0.001,
                sellerOrdAddress: address,
                price: 18888,
                ordItem: {
                  id: "ee51630efc1a1ebdd363a924fd93621494ca464b16fbafcd5c59ebad5f270d8ai0",
                  contentURI: "",
                  contentType: "",
                  contentPreviewURI: "",
                  sat: 0,
                  satName: "",
                  genesisTransaction: "",
                  inscriptionNumber: 0,
                  chain: "",
                  owner: address,
                  postage: 9000,
                  location: "",
                  outputValue: 500,
                  output:
                    "ee51630efc1a1ebdd363a924fd93621494ca464b16fbafcd5c59ebad5f270d8a:0",
                  listed: false,
                  listedMakerFeeBp: 0.001,
                  listedPrice: 18888,
                  listedSellerReceiveAddress: "bc1pdmmlcs4s2aatvgz4kpzahaqrv69mcrhdatfudlv6l2gkweh6cndsx2m0jg",
                },
                sellerReceiveAddress: address,
                tapInternalKey: publicKey,
                //这里是ConstructSellerPsbt签出来的，直接从打印的复制过来
                signedListingPSBTHex: "",
              },
              buyer: {
                takerFeeBp: 0.001,
                buyerAddress: 'bc1pdmmlcs4s2aatvgz4kpzahaqrv69mcrhdatfudlv6l2gkweh6cndsx2m0jg',
                buyerTokenReceiveAddress: 'bc1pdmmlcs4s2aatvgz4kpzahaqrv69mcrhdatfudlv6l2gkweh6cndsx2m0jg',
                feeRateTier: 'fastestFee',
                buyerDummyUTXOs: myDummyUtxos,
                buyerPaymentUTXOs: selectedPaymentUtxo,
                buyerPublicKey: publicKey,
                feeRate: 8,
                platformFeeAddress: 'bc1pjutzl7wrvr8qt3vs0xn0xjyh2ezj3mhq2m0u7f2f8qarq9ng8w9qvm6g22'
              }
            };
            const unsignedBuyingPSBTBase64Res = await signer.BuyerSigner.generateUnsignedBuyingPSBTBase64(state);
            console.log("UnsignedBuyingPSBTBase64: ", unsignedBuyingPSBTBase64Res.buyer?.unsignedBuyingPSBTBase64)
            if (unsignedBuyingPSBTBase64Res.buyer?.unsignedBuyingPSBTBase64 === undefined) {
              return
            }
            const unsigndPsbt = btc.Transaction.fromPSBT(
              base64.decode(
                unsignedBuyingPSBTBase64Res.buyer.unsignedBuyingPSBTBase64
              )
            );
            const unsignedBuyingPSBTHex = hex.encode(unsigndPsbt.toPSBT(0));
            console.log("unsignedBuyingPSBTHex===: ", unsignedBuyingPSBTHex);
            const signedBuyingPSBTHex = await (window as any).unisat.signPsbt(
              unsignedBuyingPSBTHex,
              {
                autoFinalized: true,
              }
            );
            console.log("signedBuyingPSBTHex===: ", signedBuyingPSBTHex);
            const signdPsbt = btc.Transaction.fromPSBT(
              hex.decode(signedBuyingPSBTHex)
            );
            const signedBuyingPSBTBase64 = base64.encode(signdPsbt.toPSBT(0));
            const buyState : signer.IOrdAPIPostPSBTBuying = {
                price: 18888,
                tokenId: "ee51630efc1a1ebdd363a924fd93621494ca464b16fbafcd5c59ebad5f270d8ai0",
                buyerAddress: "bc1pdmmlcs4s2aatvgz4kpzahaqrv69mcrhdatfudlv6l2gkweh6cndsx2m0jg",
                buyerTokenReceiveAddress: "bc1pdmmlcs4s2aatvgz4kpzahaqrv69mcrhdatfudlv6l2gkweh6cndsx2m0jg",
                signedBuyingPSBTBase64: signedBuyingPSBTBase64,
            }

            class demoItemProvider1 implements signer.ItemProvider {
              async getTokenByOutput(
                output: string
              ): Promise<signer.IOrdItem | null> {
                return state.seller.ordItem;
              }
              async getTokenById(
                tokenId: string
              ): Promise<signer.IOrdItem | null> {
                return state.seller.ordItem;
              }
            }
            signer.BuyerSigner.verifySignedBuyingPSBTBase64(buyState, new demoFeeProvider(), new demoItemProvider1())
            //从ConstructSellerPsbt签出来的，直接从打印的复制过来
            const finalPsbt = signer.BuyerSigner.mergeSignedBuyingPSBT("", signedBuyingPSBTBase64)
            console.log('finalPsbt: ', finalPsbt.toHex)
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

export function calculateTxBytesFeeWithRate(
  vinsLength: number,
  voutsLength: number,
  feeRate: number,
  includeChangeOutput: 0 | 1 = 1
): number {
  const baseTxSize = 10;
  const inSize = 180;
  const outSize = 34;

  const txSize =
    baseTxSize +
    vinsLength * inSize +
    voutsLength * outSize +
    includeChangeOutput * outSize;
  const fee = txSize * feeRate;
  return fee;
}

export default App;
