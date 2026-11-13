import {env} from 'cloudflare:workers';
import {CHAIN} from './protocol';
// A loopback-only override supports isolated Anvil integration tests, never hosted traffic.
export function networkFor(request:Request){
 const local=['127.0.0.1','localhost','[::1]'].includes(new URL(request.url).hostname);
 return {...CHAIN,rpc:local&&env.LOCAL_QIE_RPC_URL?env.LOCAL_QIE_RPC_URL:CHAIN.rpc};
}
