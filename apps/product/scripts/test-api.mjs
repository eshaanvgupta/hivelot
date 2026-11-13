import assert from 'node:assert/strict';
import {Wallet} from 'ethers';
const base=process.env.HIVELOT_TEST_URL||'http://127.0.0.1:5173';
if(!['127.0.0.1','localhost'].includes(new URL(base).hostname))throw Error('API mutation tests only run against a local development database.');
const origin=new URL(base).origin;
async function call(path,method='GET',body,cookie=''){
 const r=await fetch(`${base}/api/${path}`,{method,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie},body:body===undefined?undefined:JSON.stringify(body)});
 return {status:r.status,data:await r.json(),cookie:r.headers.get('set-cookie')?.split(';')[0]||''};
}
async function login(){const w=Wallet.createRandom(),c=await call('auth/challenge','POST',{wallet:w.address});assert.equal(c.status,200);const signature=await w.signMessage(c.data.message),v=await call('auth/verify','POST',{id:c.data.id,signature});assert.equal(v.status,200);assert.ok(v.cookie);const replay=await call('auth/verify','POST',{id:c.data.id,signature});assert.equal(replay.status,401);return {wallet:w.address,cookie:v.cookie};}
const organizer=await login(),buyer=await login(),supplier=await login(),stranger=await login();
assert.equal((await call('pools','POST',{})).status,401);
assert.equal((await fetch(`${base}/api/pools`,{method:'POST',headers:{Origin:'https://untrusted.test','Content-Type':'application/json'},body:'{}'})).status,403);
const profile=await call('profile','POST',{name:'Local QA supplier',region:'Bengaluru, India',bio:'Isolated API test supplier profile, not production seed data.',supplier:true},supplier.cookie);assert.equal(profile.status,200);
const invalid=await call('pools','POST',{title:'bad'},organizer.cookie);assert.equal(invalid.status,400);
const created=await call('pools','POST',{title:`Local QA procurement ${Date.now()}`,description:'Exact test specification for local integration verification only.',category:'Electronics',region:'Bengaluru, India',target:5,minimum:3,price:'80.123456',closesAt:Date.now()+86400000},organizer.cookie);assert.equal(created.status,201);const id=created.data.id;
assert.equal((await call(`pools/${id}/interest`,'POST',{quantity:3},buyer.cookie)).status,200);
assert.equal((await call(`pools/${id}/interest`,'POST',{quantity:4},stranger.cookie)).status,409);
assert.equal((await call(`pools/${id}/offers`,'POST',{price:'61.123456',capacity:5,note:'Exact product match; delivery within ten business days.'},supplier.cookie)).status,200);
assert.equal((await call(`pools/${id}`,'GET',undefined,buyer.cookie)).data.offers.length,0);
assert.equal((await call(`pools/${id}`,'GET',undefined,organizer.cookie)).data.offers.length,1);
assert.equal((await call(`pools/${id}`,'GET',undefined,supplier.cookie)).data.offers.length,1);
assert.equal((await call(`pools/${id}/messages`,'POST',{body:'Is the model specification fixed?'},buyer.cookie)).status,200);
assert.equal((await call(`pools/${id}/close`,'POST',{},stranger.cookie)).status,403);
const details=await call(`pools/${id}`);assert.equal(details.data.pool.price,'80123456');assert.equal(details.data.total.units,3);assert.equal(details.data.messages.length,1);
assert.equal((await call('workspace','GET',undefined,buyer.cookie)).data.interests.some(x=>x.pool_id===id),true);
assert.equal((await call(`pools/${id}/interest`,'DELETE',undefined,buyer.cookie)).status,200);
const results=await Promise.all([call(`pools/${id}/interest`,'POST',{quantity:4},buyer.cookie),call(`pools/${id}/interest`,'POST',{quantity:4},stranger.cookie)]);
assert.deepEqual(results.map(r=>r.status).sort(),[200,409]);
assert.ok((await call(`pools/${id}`)).data.total.units<=5);
assert.equal((await call(`pools/${id}/close`,'POST',{},organizer.cookie)).status,200);
assert.equal((await call(`pools/${id}/interest`,'POST',{quantity:1},supplier.cookie)).status,400);
assert.equal((await call('health')).data.storage,'persistent');
assert.equal((await call('settlement')).data.ready,false);
assert.equal((await call('auth/logout','POST',{},organizer.cookie)).status,200);
assert.equal((await call('session','GET',undefined,organizer.cookie)).data.account,null);
console.log('PASS: wallet signatures, replay rejection, secure sessions, CSRF, authorization, exact prices, capacity under concurrency, offer privacy, supplier registration, discussion, workspace, close flow, logout, persistent API and settlement readiness.');
