'use client';
import {useEffect,useRef,useState} from 'react';
import {BrowserProvider,Contract,ContractFactory,JsonRpcProvider,formatEther,type InterfaceAbi} from 'ethers';
import {Activity,ArrowUpRight,Check,Copy,Download,ExternalLink,Loader2,Wallet,X} from 'lucide-react';
import {CHAIN} from '@/lib/protocol';
import {QUSDC} from '@/lib/deployment';
type Artifact={abi:InterfaceAbi;bytecode:string};
type Quote={wallet:string;gasLimit:bigint;maxFeePerGas:bigint;maxPriorityFeePerGas:bigint|null;maximumCost:bigint;balance:bigint;estimatedCost:bigint;expires:number};
type Deployment={contractAddress:string;transactionHash:string;deployer:string;feeRecipient:string;settlementToken:string;chainId:number;blockNumber:number;status:'confirmed'};
export default function DeploymentModal({onClose,notify}:{onClose:()=>void;notify:(m:string)=>void}){
 const dialog=useRef<HTMLDialogElement>(null),[busy,setBusy]=useState(false),[error,setError]=useState(''),[quote,setQuote]=useState<Quote|null>(null),[submitted,setSubmitted]=useState(''),[deployed,setDeployed]=useState<Deployment|null>(null),[hasWallet,setHasWallet]=useState(false);
 useEffect(()=>{dialog.current?.showModal();setHasWallet(Boolean((window as unknown as {ethereum?:unknown}).ethereum));try{const saved=JSON.parse(sessionStorage.getItem('hivelot_mainnet_deployment')||'null') as {hash:string;wallet:string}|null;if(saved&&/^0x[a-fA-F0-9]{64}$/.test(saved.hash)&&/^0x[a-fA-F0-9]{40}$/.test(saved.wallet)){setSubmitted(saved.hash);inspect(saved.hash,saved.wallet).catch(e=>setError((e as Error).message));}}catch{}return()=>dialog.current?.close();},[]);
 async function inspect(hash:string,wallet:string){
  const rpc=new JsonRpcProvider(CHAIN.rpc,CHAIN.id,{staticNetwork:true}),receipt=await rpc.getTransactionReceipt(hash);
  if(!receipt)return;
  if(receipt.status===0){sessionStorage.removeItem('hivelot_mainnet_deployment');setSubmitted('');setError('The previous deployment reverted. Gas may have been spent. Check its explorer receipt and refresh the estimate before retrying.');return;}
  if(receipt.to!==null||!receipt.contractAddress||receipt.from.toLowerCase()!==wallet.toLowerCase())throw Error('The saved transaction is not this wallet’s contract creation.');
  const transaction=await rpc.getTransaction(hash),artifact=await(await fetch('/protocol/HivelotProtocol.json')).json() as Artifact;
  const expected=await new ContractFactory(artifact.abi,artifact.bytecode).getDeployTransaction(QUSDC.address,wallet);
  if(!transaction||transaction.chainId!==1990n||transaction.value!==0n||transaction.data.toLowerCase()!==expected.data.toLowerCase())throw Error('The saved transaction does not match this release.');
  setDeployed({contractAddress:receipt.contractAddress,transactionHash:hash,deployer:wallet,feeRecipient:wallet,settlementToken:QUSDC.address,chainId:1990,blockNumber:receipt.blockNumber,status:'confirmed'});
 }
 async function walletProvider(){
  const ethereum=(window as unknown as {ethereum?:ConstructorParameters<typeof BrowserProvider>[0]}).ethereum;
  if(!ethereum)throw Error('Install a browser wallet from an official link below, create your wallet, then reopen this page. Never send your recovery phrase or private key to HIVELOT or chat.');
  const initial=new BrowserProvider(ethereum);await initial.send('eth_requestAccounts',[]);
  if((await initial.getNetwork()).chainId!==1990n){
   try{await initial.send('wallet_switchEthereumChain',[{chainId:'0x7c6'}]);}
   catch(e){if((e as {code?:number}).code!==4902&&(e as {info?:{error?:{code?:number}}}).info?.error?.code!==4902)throw e;
    await initial.send('wallet_addEthereumChain',[{chainId:'0x7c6',chainName:'QIE Mainnet',nativeCurrency:{name:'QIE',symbol:'QIEV3',decimals:18},rpcUrls:[CHAIN.rpc],blockExplorerUrls:[CHAIN.explorer]}]);
    await initial.send('wallet_switchEthereumChain',[{chainId:'0x7c6'}]);
   }
  }
  const provider=new BrowserProvider(ethereum);if((await provider.getNetwork()).chainId!==1990n)throw Error('The wallet has not switched to QIE Mainnet.');return provider;
 }
 async function prepare(){setBusy(true);setError('');setQuote(null);try{
  const provider=await walletProvider(),signer=await provider.getSigner(),address=await signer.getAddress();
  const rpc=new JsonRpcProvider(CHAIN.rpc,CHAIN.id,{staticNetwork:true});
  if(parseInt(await rpc.send('eth_chainId',[]),16)!==1990)throw Error('The public RPC returned the wrong chain.');
  const token=new Contract(QUSDC.address,['function decimals() view returns(uint8)','function symbol() view returns(string)'],rpc);
  if(await rpc.getCode(QUSDC.address)==='0x'||await token.decimals()!==6n||await token.symbol()!=='QUSDC')throw Error('QUSDC validation failed. Deployment has been stopped.');
  const artifact=await(await fetch('/protocol/HivelotProtocol.json')).json() as Artifact;
  const deployment=await new ContractFactory(artifact.abi,artifact.bytecode).getDeployTransaction(QUSDC.address,address);
  // Simulate at zero fee so a new, unfunded wallet can still obtain a gas quote.
  const raw=await rpc.send('eth_estimateGas',[{from:address,data:deployment.data,value:'0x0',gasPrice:'0x0'}]);
  const gas=BigInt(raw),gasLimit=gas*120n/100n,fees=await rpc.getFeeData(),maxFee=fees.maxFeePerGas||fees.gasPrice;
  if(!maxFee||!fees.gasPrice)throw Error('The network did not return a usable gas quote. Try again.');
  const balance=await rpc.getBalance(address);
  setQuote({wallet:address,gasLimit,maxFeePerGas:maxFee,maxPriorityFeePerGas:fees.maxPriorityFeePerGas,maximumCost:gasLimit*maxFee,balance,estimatedCost:gas*fees.gasPrice,expires:Date.now()+300000});
 }catch(e){setError((e as {shortMessage?:string;message:string}).shortMessage||(e as Error).message);}finally{setBusy(false);}}
 async function deploy(){if(!quote)return;setBusy(true);setError('');try{
  if(Date.now()>quote.expires)throw Error('This quote expired. Check your wallet and refresh the estimate.');
  const provider=await walletProvider(),signer=await provider.getSigner();
  if((await signer.getAddress()).toLowerCase()!==quote.wallet.toLowerCase())throw Error('The connected wallet changed. Refresh the estimate first.');
  if(await provider.getBalance(quote.wallet)<quote.maximumCost)throw Error('Your wallet needs more native QIE for the deployment gas allowance.');
  const artifact=await(await fetch('/protocol/HivelotProtocol.json')).json() as Artifact;
  const overrides=quote.maxPriorityFeePerGas!==null?{gasLimit:quote.gasLimit,maxFeePerGas:quote.maxFeePerGas,maxPriorityFeePerGas:quote.maxPriorityFeePerGas}:{gasLimit:quote.gasLimit,gasPrice:quote.maxFeePerGas};
  const contract=await new ContractFactory(artifact.abi,artifact.bytecode,signer).deploy(QUSDC.address,quote.wallet,overrides),transaction=contract.deploymentTransaction();
  if(!transaction)throw Error('The wallet did not return a deployment transaction.');setSubmitted(transaction.hash);sessionStorage.setItem('hivelot_mainnet_deployment',JSON.stringify({hash:transaction.hash,wallet:quote.wallet}));notify('Deployment submitted. Waiting for its QIE mainnet receipt.');
  const receipt=await transaction.wait();if(!receipt||receipt.status!==1||!receipt.contractAddress)throw Error('No successful deployment receipt was returned. Inspect the submitted transaction before retrying.');
  const result:Deployment={contractAddress:receipt.contractAddress,transactionHash:transaction.hash,deployer:quote.wallet,feeRecipient:quote.wallet,settlementToken:QUSDC.address,chainId:1990,blockNumber:receipt.blockNumber,status:'confirmed'};
  setDeployed(result);setQuote(null);notify('Contract deployment confirmed on QIE Mainnet.');
 }catch(e){setError((e as {shortMessage?:string;message:string}).shortMessage||(e as Error).message);}finally{setBusy(false);}}
 async function copy(value:string){try{await navigator.clipboard.writeText(value);notify('Public deployment transaction hash copied.');}catch{setError('Copy the transaction hash shown below and send it in chat.');}}
 function download(){if(!deployed)return;const url=URL.createObjectURL(new Blob([JSON.stringify(deployed,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download='hivelot-mainnet-deployment.json';a.click();URL.revokeObjectURL(url);}
 const funded=quote&&quote.balance>=quote.maximumCost;
 return <dialog ref={dialog} className="modal deployment-modal" onCancel={onClose} onClick={e=>{if(e.target===e.currentTarget&&!busy)onClose();}}><div className="modal-head"><div><p className="eyebrow">GUIDED MAINNET DEPLOYMENT</p><h2>Let’s put HIVELOT on QIE.</h2></div><button className="icon-button" onClick={onClose} aria-label="Close deployment dialog"><X size={20}/></button></div>
 {!deployed&&<><p className="modal-intro">QUSDC is selected for you. Your connected wallet pays gas and receives platform fees. Deployment creates one immutable contract; it does not deposit customer funds.</p>
 <ol className="deployment-steps"><li><span>01</span><div><strong>Create your wallet</strong><p>Use an official wallet app or extension. Keep its recovery phrase private and backed up.</p><div className="wallet-download-links"><a href="https://www.qiewallet.me/" target="_blank" rel="noreferrer">QIE Wallet<ExternalLink size={12}/></a><a href="https://metamask.io/download/" target="_blank" rel="noreferrer">MetaMask<ExternalLink size={12}/></a></div></div></li><li><span>02</span><div><strong>Connect and check the cost</strong><p>We add the QIE network, check QUSDC, and estimate the deployment gas. No transaction is sent at this step.</p></div></li><li><span>03</span><div><strong>Fund gas and approve deployment</strong><p>Your wallet needs native QIE on chain 1990. QUSDC, Ethereum ETH, and testnet tokens cannot pay this gas.</p></div></li></ol>
 <div className="deployment-token"><span className="section-label">SETTLEMENT ASSET · QUSDC · 6 DECIMALS</span><a className="mono" href={QUSDC.explorer} target="_blank" rel="noreferrer">{QUSDC.address}<ExternalLink size={12}/></a><p>Address matched to the issuer’s frontend configuration and QIE Explorer on {QUSDC.verifiedDate}.</p></div>
 <button className="button secondary full" onClick={prepare} disabled={busy}>{busy?<Loader2 size={16} className="spin"/>:<Wallet size={16}/>} {quote?'Refresh wallet balance & gas quote':hasWallet?'Connect wallet & estimate deployment':'I have installed a wallet · connect'}</button>
 {quote&&<div className="estimate-box"><strong>{funded?'Your wallet is ready.':'Your wallet needs native QIE.'}</strong><dl className="deployment-quote"><div><dt>Wallet & fee recipient</dt><dd className="mono">{quote.wallet}</dd></div><div><dt>Current balance</dt><dd>{formatEther(quote.balance)} QIE</dd></div><div><dt>Estimated network fee</dt><dd>{formatEther(quote.estimatedCost)} QIE</dd></div><div><dt>Maximum gas allowance</dt><dd>{formatEther(quote.maximumCost)} QIE</dd></div></dl>{!funded&&<p>Fund this public wallet address on QIE Mainnet, then refresh. The current shortfall is {formatEther(quote.maximumCost-quote.balance)} QIE. Fees can change. The official faucet supplies testnet tokens only.</p>}<button className="button primary full" onClick={deploy} disabled={busy||!funded||Boolean(submitted)}>{busy?<Loader2 className="spin" size={16}/>:<ArrowUpRight size={16}/>}Approve deployment in my wallet</button></div>}
 <p className="small-copy">Contract tests and source review are complete; this is not an independent audit. A confirmed mainnet deployment cannot be undone. Your wallet shows the final transaction before you approve it.</p></>}
 {submitted&&<div className="estimate-box"><strong>{deployed?'Deployment confirmed':'Transaction submitted'}</strong><a className="mono" href={`${CHAIN.explorer}/tx/${submitted}`} target="_blank" rel="noreferrer">{submitted}<ExternalLink size={13}/></a>{!deployed&&<p>Inspect this transaction before attempting another deployment. A wallet rejection sends no transaction.</p>}</div>}
 {deployed&&<div className="deployment-confirmed"><Check size={24}/><h3>HIVELOT is deployed.</h3><a className="mono" href={`${CHAIN.explorer}/address/${deployed.contractAddress}`} target="_blank" rel="noreferrer">{deployed.contractAddress}<ExternalLink size={13}/></a><p>Send the public transaction hash in this chat. I can then verify the deployment, configure the hosted application, and activate settlement. No private key is needed.</p><button className="button primary full" onClick={()=>copy(deployed.transactionHash)}><Copy size={15}/>Copy deployment transaction hash</button><button className="text-button full" onClick={download}><Download size={14}/>Download deployment receipt</button></div>}
 {error&&<p className="form-error" role="alert">{error}</p>}</dialog>;
}
