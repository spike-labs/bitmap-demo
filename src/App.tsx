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
                //这里的信息是从钱包找一个直接写死的
                ordItem: {
                  id: "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32ei0",
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
                    "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32e:0",
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
                "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32ei0",
              sellerReceiveAddress: address,
              signedListingPSBTBase64: sellerSignedPsbtBase64,
              tapInternalKey: publicKey,
            };
            console.log("======");
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
                  id: "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32ei0",
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
                    "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32e:0",
                  listed: false,
                  listedMakerFeeBp: 0.001,
                  listedPrice: 18888,
                  listedSellerReceiveAddress: "bc1pu637fe5t20njrsuulsgwvvmq34s6w53hleavm3aesxelr4p8u6zsqvw88r",
                },
                sellerReceiveAddress: address,
                tapInternalKey: publicKey,
                //这里是ConstructSellerPsbt签出来的，这里直接复制过来
                signedListingPSBTHex: "70736274ff01005e02000000012ed39d2ce1ee053f979e7e1fcb55317007bb1a632b242d81317b9a8159e9b2410000000000ffffffff01d447000000000000225120e6a3e4e68b53e721c39cfc10e633608d61a75237fe7acdc7b981b3f1d427e68500000000000100fd410701000000000101361ad116ec1f8a219639dcc57621684faad71aac5ff1807fdba2176e75069b1c0200000000f5ffffff01f401000000000000225120e6a3e4e68b53e721c39cfc10e633608d61a75237fe7acdc7b981b3f1d427e6850340b17c2f38f59d35f8d3badea1af44f45fa00a250e4edb4e1d385725114a353f4116ba9774afd5fba51954515730d42bf936c343d847cd5240d892131b4a40ce4cfd7a062038e46c533164bda7b2856cf0d5e8a03989730849e721ab9b2902e67b24dcf92aac0063036f726401010d696d6167652f7376672b786d6c004d08023c7376670d0a09786d6c6e733d22687474703a2f2f7777772e77332e6f72672f323030302f737667220d0a097374796c653d226261636b67726f756e642d636f6c6f723a23373342444136220d0a09646174612d636c63743d2272637376656c656d656e74616c735f706832220d0a0976657273696f6e3d22312e31220d0a0977696474683d2231303025220d0a096865696768743d2231303025220d0a0976696577426f783d223020302036303020363030220d0a097072657365727665417370656374526174696f3d22784d6964594d6964206d656574220d0a3e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f663662383639393337326262396339303832303531363135626634636335613434613865613462653861396663646335623565636538333331653838383537326930220d0a09092f3e0d0a093c2f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f326630386436633265396361616135316232343664643534613236663662313565373438653931656262303639613166336234653362653037313662323630366930220d0a09092f3e0d0a093c4d08022f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f363734623935373737663163636662663262383134323732383433373234653238336461366463653064336563663432393862613535353062303936363630356930220d0a09092f3e0d0a093c2f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f336339373933353435653736333335333036626465333262636263626533303032616638396566306634393736303265323162326132333666383433613033636930220d0a09092f3e0d0a093c2f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f383264373961623365656466323639633761393433616664656236623935633236366438323566623337366435323164313965346234336362386334343737366930220d0a09092f3e0d0a093c2f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f634d08026f6e74656e742f356466306563346364353065653966373263656336353836386265323137356232356336393365323338376261633639326336396635636335316364323738366930220d0a09092f3e0d0a093c2f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f383333613234366633366438653566653065623031383065653664306632326639303366663337306638646462656364303564316631346132303763363765666930220d0a09092f3e0d0a093c2f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f316537363336613438356361653531613262616536333336613762666131396331643632643663353432336239663862633165616237356538373664333338376930220d0a09092f3e0d0a093c2f673e0d0a093c673e0d0a09093c696d6167650d0a09090977696474683d2231303025220d0a0909096865696768743d2231303025220d0a090909687265663d222f636f6e74656e742f3536653961353633356562653237623331613232323835616539663861653533393938393937346438663538396537623865663130353137313731661e373231346930220d0a09092f3e0d0a093c2f673e0d0a3c2f7376673e0d0a6821c038e46c533164bda7b2856cf0d5e8a03989730849e721ab9b2902e67b24dcf92a0000000001012bf401000000000000225120e6a3e4e68b53e721c39cfc10e633608d61a75237fe7acdc7b981b3f1d427e6850108430141a357100dd058d199596b6f59b624bd614b0af3ad5689738d03497ca63006f4357a78ff27cc743a94cfaa212cb3d4b0d871a98d54f42eb13a45de428424d272fe830000",
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
                tokenId: "41b2e959819a7b31812d242b631abb07703155cb1f7e9e973f05eee12c9dd32ei0",
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
            const finalPsbt = signer.BuyerSigner.mergeSignedBuyingPSBT("cHNidP8BAF4CAAAAAS7TnSzh7gU/l55+H8tVMXAHuxpjKyQtgTF7moFZ6bJBAAAAAAD/////AdRHAAAAAAAAIlEg5qPk5otT5yHDnPwQ5jNgjWGnUjf+es3HuYGz8dQn5oUAAAAAAAEA/UEHAQAAAAABATYa0RbsH4ohljncxXYhaE+q1xqsX/GAf9uiF251BpscAgAAAAD1////AfQBAAAAAAAAIlEg5qPk5otT5yHDnPwQ5jNgjWGnUjf+es3HuYGz8dQn5oUDQLF8Lzj1nTX407reoa9E9F+gCiUOTttOHThXJRFKNT9BFrqXdK/V+6UZVFFXMNQr+TbDQ9hHzVJA2JITG0pAzkz9egYgOORsUzFkvaeyhWzw1eigOYlzCEnnIaubKQLmeyTc+SqsAGMDb3JkAQENaW1hZ2Uvc3ZnK3htbABNCAI8c3ZnDQoJeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIg0KCXN0eWxlPSJiYWNrZ3JvdW5kLWNvbG9yOiM3M0JEQTYiDQoJZGF0YS1jbGN0PSJyY3N2ZWxlbWVudGFsc19waDIiDQoJdmVyc2lvbj0iMS4xIg0KCXdpZHRoPSIxMDAlIg0KCWhlaWdodD0iMTAwJSINCgl2aWV3Qm94PSIwIDAgNjAwIDYwMCINCglwcmVzZXJ2ZUFzcGVjdFJhdGlvPSJ4TWlkWU1pZCBtZWV0Ig0KPg0KCTxnPg0KCQk8aW1hZ2UNCgkJCXdpZHRoPSIxMDAlIg0KCQkJaGVpZ2h0PSIxMDAlIg0KCQkJaHJlZj0iL2NvbnRlbnQvZjZiODY5OTM3MmJiOWM5MDgyMDUxNjE1YmY0Y2M1YTQ0YThlYTRiZThhOWZjZGM1YjVlY2U4MzMxZTg4ODU3MmkwIg0KCQkvPg0KCTwvZz4NCgk8Zz4NCgkJPGltYWdlDQoJCQl3aWR0aD0iMTAwJSINCgkJCWhlaWdodD0iMTAwJSINCgkJCWhyZWY9Ii9jb250ZW50LzJmMDhkNmMyZTljYWFhNTFiMjQ2ZGQ1NGEyNmY2YjE1ZTc0OGU5MWViYjA2OWExZjNiNGUzYmUwNzE2YjI2MDZpMCINCgkJLz4NCgk8TQgCL2c+DQoJPGc+DQoJCTxpbWFnZQ0KCQkJd2lkdGg9IjEwMCUiDQoJCQloZWlnaHQ9IjEwMCUiDQoJCQlocmVmPSIvY29udGVudC82NzRiOTU3NzdmMWNjZmJmMmI4MTQyNzI4NDM3MjRlMjgzZGE2ZGNlMGQzZWNmNDI5OGJhNTU1MGIwOTY2NjA1aTAiDQoJCS8+DQoJPC9nPg0KCTxnPg0KCQk8aW1hZ2UNCgkJCXdpZHRoPSIxMDAlIg0KCQkJaGVpZ2h0PSIxMDAlIg0KCQkJaHJlZj0iL2NvbnRlbnQvM2M5NzkzNTQ1ZTc2MzM1MzA2YmRlMzJiY2JjYmUzMDAyYWY4OWVmMGY0OTc2MDJlMjFiMmEyMzZmODQzYTAzY2kwIg0KCQkvPg0KCTwvZz4NCgk8Zz4NCgkJPGltYWdlDQoJCQl3aWR0aD0iMTAwJSINCgkJCWhlaWdodD0iMTAwJSINCgkJCWhyZWY9Ii9jb250ZW50LzgyZDc5YWIzZWVkZjI2OWM3YTk0M2FmZGViNmI5NWMyNjZkODI1ZmIzNzZkNTIxZDE5ZTRiNDNjYjhjNDQ3NzZpMCINCgkJLz4NCgk8L2c+DQoJPGc+DQoJCTxpbWFnZQ0KCQkJd2lkdGg9IjEwMCUiDQoJCQloZWlnaHQ9IjEwMCUiDQoJCQlocmVmPSIvY00IAm9udGVudC81ZGYwZWM0Y2Q1MGVlOWY3MmNlYzY1ODY4YmUyMTc1YjI1YzY5M2UyMzg3YmFjNjkyYzY5ZjVjYzUxY2QyNzg2aTAiDQoJCS8+DQoJPC9nPg0KCTxnPg0KCQk8aW1hZ2UNCgkJCXdpZHRoPSIxMDAlIg0KCQkJaGVpZ2h0PSIxMDAlIg0KCQkJaHJlZj0iL2NvbnRlbnQvODMzYTI0NmYzNmQ4ZTVmZTBlYjAxODBlZTZkMGYyMmY5MDNmZjM3MGY4ZGRiZWNkMDVkMWYxNGEyMDdjNjdlZmkwIg0KCQkvPg0KCTwvZz4NCgk8Zz4NCgkJPGltYWdlDQoJCQl3aWR0aD0iMTAwJSINCgkJCWhlaWdodD0iMTAwJSINCgkJCWhyZWY9Ii9jb250ZW50LzFlNzYzNmE0ODVjYWU1MWEyYmFlNjMzNmE3YmZhMTljMWQ2MmQ2YzU0MjNiOWY4YmMxZWFiNzVlODc2ZDMzODdpMCINCgkJLz4NCgk8L2c+DQoJPGc+DQoJCTxpbWFnZQ0KCQkJd2lkdGg9IjEwMCUiDQoJCQloZWlnaHQ9IjEwMCUiDQoJCQlocmVmPSIvY29udGVudC81NmU5YTU2MzVlYmUyN2IzMWEyMjI4NWFlOWY4YWU1Mzk5ODk5NzRkOGY1ODllN2I4ZWYxMDUxNzE3MWYeNzIxNGkwIg0KCQkvPg0KCTwvZz4NCjwvc3ZnPg0KaCHAOORsUzFkvaeyhWzw1eigOYlzCEnnIaubKQLmeyTc+SoAAAAAAQEr9AEAAAAAAAAiUSDmo+Tmi1PnIcOc/BDmM2CNYadSN/56zce5gbPx1CfmhQEIQwFBo1cQDdBY0ZlZa29ZtiS9YUsK861WiXONA0l8pjAG9DV6eP8nzHQ6lM+qISyz1LDYcamNVPQusTpF3kKEJNJy/oMAAA==", signedBuyingPSBTBase64)
            console.log('finalPsbt: ', finalPsbt.toHex())

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
