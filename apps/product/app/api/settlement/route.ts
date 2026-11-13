import {env} from 'cloudflare:workers';
import {isAddress} from 'ethers';
import {CHAIN} from '@/lib/protocol';
import {networkFor} from '@/lib/server-network';
export async function GET(request:Request){
 const contract=env.HIVELOT_PROTOCOL_ADDRESS||'',token=env.SETTLEMENT_TOKEN_ADDRESS||'';
 return Response.json({chain:networkFor(request),contract,token,ready:isAddress(contract)&&isAddress(token),version:'2.0.0',decimals:6},{headers:{'Cache-Control':'no-store'}});
}
