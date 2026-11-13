import fs from 'node:fs';
import assert from 'node:assert/strict';
import {JsonRpcProvider,ContractFactory,Contract,keccak256,toUtf8Bytes} from 'ethers';
const rpc='http://127.0.0.1:8547',base='http://127.0.0.1:5173';
const provider=new JsonRpcProvider(rpc,1990,{staticNetwork:true,polling:true});provider.pollingInterval=100;
const protocolArtifact=JSON.parse(fs.readFileSync('public/protocol/HivelotProtocol.json','utf8'));
const mockArtifact=JSON.parse(fs.readFileSync('../../packages/contracts/out/MockQUSDC.sol/MockQUSDC.json','utf8'));
const signers=await Promise.all([0,1,2,3].map(i=>provider.getSigner(i))),addresses=await Promise.all(signers.map(s=>s.getAddress()));
if(process.argv.includes('--prepare')){
 if(fs.existsSync('.dev.vars'))throw Error('Refusing to overwrite existing development environment.');
 const token=await new ContractFactory(mockArtifact.abi,mockArtifact.bytecode.object,signers[0]).deploy();await token.waitForDeployment();
 const protocol=await new ContractFactory(protocolArtifact.abi,protocolArtifact.bytecode,signers[0]).deploy(await token.getAddress(),addresses[0]);await protocol.waitForDeployment();
 fs.mkdirSync('outputs',{recursive:true});fs.writeFileSync('outputs/settlement-test.json',JSON.stringify({contract:await protocol.getAddress(),token:await token.getAddress()}));
 fs.writeFileSync('.dev.vars',`# HIVELOT isolated integration test\nHIVELOT_PROTOCOL_ADDRESS=${await protocol.getAddress()}\nSETTLEMENT_TOKEN_ADDRESS=${await token.getAddress()}\nLOCAL_QIE_RPC_URL=${rpc}\n`);
 console.log('LOCAL ONLY: deployed protocol and mock token to isolated local EVM; development API configuration prepared. No mainnet transactions.');process.exit(0);
}
const config=JSON.parse(fs.readFileSync('outputs/settlement-test.json','utf8'));
const p=new Contract(config.contract,protocolArtifact.abi,signers[0]),token=new Contract(config.token,mockArtifact.abi,signers[0]);
const mined=async t=>{const tx=await t;const r=await tx.wait();assert.equal(r.status,1);return r;};
await mined(token.mint(addresses[1],160000000));await mined(token.mint(addresses[2],50000000));
const block=await provider.getBlock('latest'),start=block.timestamp+20,spec=keccak256(toUtf8Bytes('Exact integration test router specification')),termsHash=keccak256(toUtf8Bytes('Seven day challenge; fourteen day arbitration; 0.75% supplier fee.'));
await mined(p.createPool([spec,termsHash,10,1,80000000,start,start+20,start+40,start+80,50000000,75,addresses[0]]));
const id=await p.poolCount();
await mined(token.connect(signers[1]).approve(config.contract,160000000));await mined(p.connect(signers[1]).fund(id,2));
await provider.send('evm_setTime',[start*1000]);await provider.send('evm_mine',[]);
const salt=keccak256(toUtf8Bytes('local deterministic integration test salt')),commitment=await p.bidHash(id,addresses[2],61000000,10,salt);
await mined(token.connect(signers[2]).approve(config.contract,50000000));await mined(p.connect(signers[2]).commitBid(id,commitment));
await provider.send('evm_setTime',[(start+20)*1000]);await provider.send('evm_mine',[]);await mined(p.connect(signers[2]).revealBid(id,61000000,10,salt));
await provider.send('evm_setTime',[(start+40)*1000]);await provider.send('evm_mine',[]);await mined(p.clear(id));
assert.equal(await p.credits(addresses[1]),38000000n);assert.equal(await p.credits(addresses[2]),0n);
const reference='ipfs://local-test-encrypted-dispatch-manifest';const dispatch=await mined(p.connect(signers[2]).dispatch(id,addresses[1],keccak256(toUtf8Bytes(reference))));
async function request(path,method='GET',body,cookie=''){const r=await fetch(`${base}/api/${path}`,{method,headers:{Origin:base,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]};}
async function login(index){const c=await request('auth/challenge','POST',{wallet:addresses[index]}),signature=await provider.send('eth_sign',[addresses[index],'0x'+Buffer.from(c.data.message).toString('hex')]),v=await request('auth/verify','POST',{id:c.data.id,signature});assert.equal(v.status,200);return v.cookie;}
const sellerSession=await login(2),buyerSession=await login(1),strangerSession=await login(3);
const b={poolId:Number(id),buyer:addresses[1],reference,kind:'dispatch',txHash:dispatch.hash};
assert.equal((await request('settlement')).data.contract,config.contract);
const saved=await request('settlement/evidence','POST',b,sellerSession);assert.equal(saved.status,200,JSON.stringify(saved.data));
assert.equal((await request('settlement/evidence','POST',{...b,reference:'forged-reference'},sellerSession)).status,400);
const endpoint=`settlement/evidence?poolId=${id}&buyer=${addresses[1]}`;
assert.equal((await request(endpoint)).status,401);assert.equal((await request(endpoint,'GET',undefined,strangerSession)).status,403);
const evidence=await request(endpoint,'GET',undefined,buyerSession);assert.equal(evidence.status,200);assert.equal(evidence.data.records[0].reference,reference);
await mined(p.connect(signers[1]).accept(id));assert.equal(await p.credits(addresses[2]),121085000n);assert.equal(await p.credits(addresses[0]),915000n);
await mined(p.connect(signers[2]).claimBond(id));
for(const signer of signers.slice(0,3))await mined(p.connect(signer).withdraw());
assert.equal(await token.balanceOf(config.contract),0n);assert.equal(await p.accountedBalance(),0n);
console.log('PASS LOCAL EVM: real local receipts for approval, escrow funding, bid bond, commit/reveal, clearing, 38-token price refund, dispatch, authenticated receipt-matched evidence, buyer acceptance, supplier/bond payout, 0.75% fee and final zero balance. No mainnet funds used.');
