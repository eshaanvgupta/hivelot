import {env} from 'cloudflare:workers';
import {Contract,Interface,JsonRpcProvider,keccak256,toUtf8Bytes,isAddress} from 'ethers';
import artifact from '@/public/protocol/HivelotProtocol.json';
import {CHAIN} from '@/lib/protocol';
import {networkFor} from '@/lib/server-network';
const response=(data:unknown,status=200)=>Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function wallet(req:Request){const token=req.headers.get('cookie')?.match(/(?:^|;\s*)hivelot_session=([a-f0-9]{64})/)?.[1];if(!token)return null;const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(token)))).map(x=>x.toString(16).padStart(2,'0')).join('');const s=await env.DB!.prepare('SELECT wallet FROM sessions WHERE hash=? AND expires_at>?').bind(hash,Date.now()).first<{wallet:string}>();return s?.wallet||null;}
async function contract(req:Request){const address=env.HIVELOT_PROTOCOL_ADDRESS||'';if(!isAddress(address))throw Error('Settlement is not configured.');const provider=new JsonRpcProvider(networkFor(req).rpc,CHAIN.id,{staticNetwork:true}),c=new Contract(address,artifact.abi,provider);if(await c.VERSION()!=='2.0.0')throw Error('Unsupported contract version.');return {c,provider,address};}
export async function GET(req:Request){try{
 const actor=await wallet(req);if(!actor)return response({error:'Sign in with your wallet to inspect private evidence.'},401);
 const url=new URL(req.url),id=Number(url.searchParams.get('poolId')),buyer=url.searchParams.get('buyer')||'';if(!Number.isSafeInteger(id)||id<1||!isAddress(buyer))return response({error:'Invalid order.'},400);
 const {c,address}=await contract(req),p=await c.getPool(id);if(![buyer,p.winner,p.terms.arbitrator].map(x=>String(x).toLowerCase()).includes(actor))return response({error:'Only the buyer, winning supplier, and designated arbitrator may inspect this evidence.'},403);
 const records=await env.DB!.prepare('SELECT kind,reference,evidence_hash,tx_hash,created_at FROM evidence WHERE contract=? AND pool_id=? AND buyer=? ORDER BY created_at').bind(address.toLowerCase(),id,buyer.toLowerCase()).all();return response({records:records.results});
 }catch(e){console.error('Evidence read failed',e instanceof Error?e.message:'unknown');return response({error:'Evidence could not be loaded. Check your wallet and network configuration.'},503);}}
export async function POST(req:Request){try{
 if(req.headers.get('origin')!==new URL(req.url).origin)return response({error:'Request origin rejected.'},403);
 const actor=await wallet(req);if(!actor)return response({error:'The transaction is confirmed. Sign in using the same wallet, then share evidence, or send the reference privately to your counterparty.'},401);
 const raw=await req.text();if(raw.length>8000)return response({error:'Evidence reference too large.'},413);
 const b=JSON.parse(raw) as {poolId:number;buyer:string;reference:string;txHash:string;kind:string};
 if(!Number.isSafeInteger(b.poolId)||b.poolId<1||!isAddress(b.buyer)||typeof b.reference!=='string'||b.reference.length<1||b.reference.length>2000||!/^0x[a-fA-F0-9]{64}$/.test(b.txHash)||!['dispatch','dispute','verdict'].includes(b.kind))return response({error:'Invalid evidence reference.'},400);
 const {c,provider,address}=await contract(req),receipt=await provider.getTransactionReceipt(b.txHash);if(!receipt||receipt.status!==1||receipt.to?.toLowerCase()!==address.toLowerCase()||receipt.from.toLowerCase()!==actor)return response({error:'A confirmed protocol transaction from your signed-in wallet is required.'},403);
 const evidenceHash=keccak256(toUtf8Bytes(b.reference)),iface=new Interface(artifact.abi),eventName={dispatch:'Dispatched',dispute:'Disputed',verdict:'VerdictApplied'}[b.kind];
 const matched=receipt.logs.some(log=>{if(log.address.toLowerCase()!==address.toLowerCase())return false;try{const e=iface.parseLog(log);return !!e&&e.name===eventName&&Number(e.args.poolId)===b.poolId&&e.args.buyer.toLowerCase()===b.buyer.toLowerCase()&&e.args.evidenceHash===evidenceHash;}catch{return false;}});
 if(!matched)return response({error:'The evidence reference does not match the confirmed transaction hash.'},400);
 await env.DB!.prepare('INSERT INTO evidence (id,contract,pool_id,buyer,uploader,kind,reference,evidence_hash,tx_hash,created_at) VALUES (?,?,?,?,?,?,?,?,?,?) ON CONFLICT(tx_hash,evidence_hash) DO NOTHING').bind(crypto.randomUUID(),address.toLowerCase(),b.poolId,b.buyer.toLowerCase(),actor,b.kind,b.reference,evidenceHash,b.txHash,Date.now()).run();return response({ok:true,evidenceHash});
 }catch(e){console.error('Evidence write failed',e instanceof Error?e.message:'unknown');return response({error:'Evidence could not be saved. Your confirmed transaction remains on-chain. Share the reference privately and retry.'},503);}}
