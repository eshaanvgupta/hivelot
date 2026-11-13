import { env } from 'cloudflare:workers';
import { getAddress, verifyMessage, isAddress } from 'ethers';
import { atomicPrice, CATEGORIES, CHAIN } from '@/lib/protocol';
export const dynamic = 'force-dynamic';
const now=()=>Date.now(),uid=()=>crypto.randomUUID();
async function parseBody(req:Request):Promise<unknown>{const raw=await req.text();if(raw.length>20000)throw new Error('Request too large.');return JSON.parse(raw);}
const json=(body:unknown,status=200,headers:Record<string,string>={})=>new Response(JSON.stringify(body),{status,headers:{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff',...headers}});
function db(){if(!env.DB)throw new Error('Persistent storage unavailable');return env.DB;}
async function hash(value:string){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(value)))).map(x=>x.toString(16).padStart(2,'0')).join('');}
async function session(req:Request):Promise<string|null>{
 const token=req.headers.get('cookie')?.match(/(?:^|;\s*)hivelot_session=([a-f0-9]{64})/)?.[1];if(!token)return null;
 const row=await db().prepare('SELECT wallet FROM sessions WHERE hash=? AND expires_at>?').bind(await hash(token),now()).first<{wallet:string}>();return row?.wallet??null;
}
function integer(value:unknown,max=1000000){const n=Number(value);if(!Number.isSafeInteger(n)||n<1||n>max)throw new Error(`Quantity must be an integer between 1 and ${max}.`);return n;}
function text(value:unknown,min:number,max:number,field:string){if(typeof value!=='string'||value.trim().length<min||value.trim().length>max)throw new Error(`${field} must contain ${min}–${max} characters.`);return value.trim();}
async function event(wallet:string,kind:string,detail:string,poolId:string|null=null){await db().prepare('INSERT INTO events (id,pool_id,wallet,kind,detail,created_at) VALUES (?,?,?,?,?,?)').bind(uid(),poolId,wallet,kind,detail,now()).run();}
async function handle(req:Request){try{
 const url=new URL(req.url),path=url.pathname.replace(/^\/api\//,'').split('/'),method=req.method;
 if(method!=='GET'){
  if(req.headers.get('origin')!==url.origin)return json({error:'Request origin rejected.'},403);
  if(Number(req.headers.get('content-length')||0)>20000)return json({error:'Request too large.'},413);
 }
 if(path[0]==='health'){await db().prepare('SELECT 1 AS ok').first();return json({status:'online',storage:'persistent',chain:CHAIN,settlementConfigured:isAddress(env.HIVELOT_PROTOCOL_ADDRESS||'')&&isAddress(env.SETTLEMENT_TOKEN_ADDRESS||'')});}
 if(path[0]==='auth'&&path[1]==='challenge'&&method==='POST'){
  const body=await parseBody(req) as {wallet?:string};const wallet=getAddress(body.wallet||'').toLowerCase();
  const count=await db().prepare('SELECT COUNT(*) AS count FROM challenges WHERE wallet=? AND expires_at>?').bind(wallet,now()).first<{count:number}>();
  if((count?.count||0)>=5)return json({error:'Too many sign-in attempts. Try again in five minutes.'},429);
  const id=uid(),expires=now()+300000;
  const message=`${url.host} asks you to sign in to HIVELOT.\n\nWallet: ${wallet}\nThis signature proves wallet ownership. It does not authorize payments.\nURI: ${url.origin}\nNonce: ${id}\nIssued: ${new Date(now()).toISOString()}\nExpires: ${new Date(expires).toISOString()}`;
  await db().batch([db().prepare('DELETE FROM challenges WHERE expires_at<?').bind(now()),db().prepare('INSERT INTO challenges (id,wallet,message,expires_at) VALUES (?,?,?,?)').bind(id,wallet,message,expires)]);return json({id,message});
 }
 if(path[0]==='auth'&&path[1]==='verify'&&method==='POST'){
  const body=await parseBody(req) as {id:string;signature:string};
  const challenge=await db().prepare('SELECT * FROM challenges WHERE id=? AND expires_at>?').bind(String(body.id),now()).first<{id:string;wallet:string;message:string}>();
  if(!challenge)return json({error:'Sign-in request expired. Please reconnect.'},401);
  if(verifyMessage(challenge.message,body.signature).toLowerCase()!==challenge.wallet)return json({error:'Signature does not match this wallet.'},401);
  if(!await db().prepare('DELETE FROM challenges WHERE id=? RETURNING id').bind(challenge.id).first())return json({error:'This sign-in request has already been used.'},401);
  const token=Array.from(crypto.getRandomValues(new Uint8Array(32))).map(x=>x.toString(16).padStart(2,'0')).join('');
  await db().batch([
   db().prepare('INSERT INTO accounts (wallet,name,region,bio,supplier,created_at) VALUES (?,?,?,?,?,?) ON CONFLICT(wallet) DO NOTHING').bind(challenge.wallet,`${challenge.wallet.slice(0,6)}…${challenge.wallet.slice(-4)}`,'','',0,now()),
   db().prepare('INSERT INTO sessions (hash,wallet,expires_at) VALUES (?,?,?)').bind(await hash(token),challenge.wallet,now()+604800000),
   db().prepare('DELETE FROM sessions WHERE expires_at<?').bind(now()),
  ]);return json({wallet:challenge.wallet},200,{'Set-Cookie':`hivelot_session=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=604800${url.protocol==='https:'?'; Secure':''}`});
 }
 const wallet=await session(req);
 if(path[0]==='session')return json({account:wallet?await db().prepare('SELECT * FROM accounts WHERE wallet=?').bind(wallet).first():null,chain:CHAIN,settlementConfigured:isAddress(env.HIVELOT_PROTOCOL_ADDRESS||'')&&isAddress(env.SETTLEMENT_TOKEN_ADDRESS||'')});
 if(path[0]==='auth'&&path[1]==='logout'&&method==='POST'){
  const token=req.headers.get('cookie')?.match(/(?:^|;\s*)hivelot_session=([a-f0-9]{64})/)?.[1];if(token)await db().prepare('DELETE FROM sessions WHERE hash=?').bind(await hash(token)).run();
  return json({ok:true},200,{'Set-Cookie':`hivelot_session=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${url.protocol==='https:'?'; Secure':''}`});
 }
 if(method!=='GET'&&!wallet)return json({error:'Connect your wallet and sign in to continue.'},401);
 if(path[0]==='stats'&&method==='GET'){
  const r=await db().batch([db().prepare("SELECT COUNT(*) AS count FROM pools WHERE status='OPEN' AND closes_at>?").bind(now()),db().prepare('SELECT COUNT(*) AS count FROM accounts WHERE supplier=1'),db().prepare('SELECT COALESCE(SUM(quantity),0) AS count FROM interests'),db().prepare('SELECT COUNT(*) AS count FROM offers')]);
  return json({pools:(r[0].results[0] as {count:number}).count,suppliers:(r[1].results[0] as {count:number}).count,interestedUnits:(r[2].results[0] as {count:number}).count,offers:(r[3].results[0] as {count:number}).count,fundedUnits:0,clearedVolume:'0'});
 }
 if(path[0]==='pools'&&path.length===1&&method==='GET'){
  const result=await db().prepare('SELECT p.*,a.name AS organizer,(SELECT COALESCE(SUM(quantity),0) FROM interests WHERE pool_id=p.id) AS interested_units,(SELECT COUNT(*) FROM offers WHERE pool_id=p.id) AS offer_count FROM pools p LEFT JOIN accounts a ON a.wallet=p.wallet ORDER BY p.created_at DESC LIMIT 200').all();return json({pools:result.results});
 }
 if(path[0]==='pools'&&path.length===1&&method==='POST'){
  const b=await parseBody(req) as Record<string,unknown>,title=text(b.title,5,100,'Pool title'),description=text(b.description,20,4000,'Specification'),category=String(b.category);
  if(!CATEGORIES.includes(category))throw new Error('Select a valid category.');
  const region=text(b.region,2,80,'Shipping region'),target=integer(b.target),minimum=integer(b.minimum);
  if(minimum>target)throw new Error('Minimum order cannot exceed target quantity.');
  const price=atomicPrice(b.price),closesAt=Number(b.closesAt);
  if(!Number.isSafeInteger(closesAt)||closesAt<now()+3600000||closesAt>now()+7776000000)throw new Error('Choose a closing date between one hour and 90 days from now.');
  const id=uid();await db().prepare('INSERT INTO pools (id,wallet,title,description,category,region,target,minimum,price,closes_at,created_at,status) VALUES (?,?,?,?,?,?,?,?,?,?,?,?)').bind(id,wallet,title,description,category,region,target,minimum,price,closesAt,now(),'OPEN').run();
  await event(wallet!,'POOL_CREATED',title,id);return json({id},201);
 }
 if(path[0]==='pools'&&path[1]){
  const pool=await db().prepare('SELECT p.*,a.name AS organizer FROM pools p LEFT JOIN accounts a ON a.wallet=p.wallet WHERE p.id=?').bind(path[1]).first<Record<string,unknown>>();
  if(!pool)return json({error:'This pool could not be found.'},404);
  if(path.length===2&&method==='GET'){
   const interest=wallet?await db().prepare('SELECT * FROM interests WHERE pool_id=? AND wallet=?').bind(path[1],wallet).first():null;
   const total=await db().prepare('SELECT COALESCE(SUM(quantity),0) AS units, COUNT(*) AS buyers FROM interests WHERE pool_id=?').bind(path[1]).first();
   const offers=wallet?await db().prepare('SELECT o.*,a.name AS supplier_name FROM offers o LEFT JOIN accounts a ON a.wallet=o.wallet WHERE o.pool_id=? AND (o.wallet=? OR ?=?) ORDER BY length(o.price),o.price,o.created_at').bind(path[1],wallet,wallet,pool.wallet).all():{results:[]};
   const count=await db().prepare('SELECT COUNT(*) AS count FROM offers WHERE pool_id=?').bind(path[1]).first();
   const notes=await db().prepare('SELECT m.*,a.name AS author_name FROM messages m LEFT JOIN accounts a ON a.wallet=m.wallet WHERE m.pool_id=? ORDER BY m.created_at LIMIT 100').bind(path[1]).all();
   return json({pool,interest,total,offers:offers.results,offerCount:count?.count||0,messages:notes.results});
  }
  if(path[2]==='close'&&method==='POST'){
   if(pool.wallet!==wallet)return json({error:'Only the organizer can close this pool.'},403);
   await db().prepare("UPDATE pools SET status='CLOSED' WHERE id=?").bind(path[1]).run();await event(wallet!,'POOL_CLOSED',String(pool.title),path[1]);return json({ok:true});
  }
  if(pool.status!=='OPEN'||Number(pool.closes_at)<=now())throw new Error('This pool is closed.');
  if(path[2]==='interest'&&method==='POST'){
   const b=await parseBody(req) as {quantity:unknown},quantity=integer(b.quantity);if(quantity>Number(pool.target))throw new Error('Your requested quantity exceeds the pool target.');
   const result=await db().prepare('INSERT INTO interests (id,pool_id,wallet,quantity,created_at) SELECT ?,?,?,?,? WHERE (SELECT COALESCE(SUM(quantity),0) FROM interests WHERE pool_id=? AND wallet<>?)+? <= ? ON CONFLICT(pool_id,wallet) DO UPDATE SET quantity=excluded.quantity WHERE (SELECT COALESCE(SUM(quantity),0) FROM interests WHERE pool_id=? AND wallet<>?)+excluded.quantity <= ?').bind(uid(),path[1],wallet,quantity,now(),path[1],wallet,quantity,pool.target,path[1],wallet,pool.target).run();
   if(!result.meta.changes)return json({error:'The remaining capacity is lower than this request. Refresh and try again.'},409);return json({ok:true,quantity,funded:false});
  }
  if(path[2]==='interest'&&method==='DELETE'){await db().prepare('DELETE FROM interests WHERE pool_id=? AND wallet=?').bind(path[1],wallet).run();return json({ok:true});}
  if(path[2]==='offers'&&method==='POST'){
   if(wallet===pool.wallet)throw new Error('Organizers cannot quote on their own pool.');
   const supplier=await db().prepare('SELECT supplier FROM accounts WHERE wallet=?').bind(wallet).first<{supplier:number}>();if(!supplier?.supplier)throw new Error('Create a supplier profile before submitting an offer.');
   const b=await parseBody(req) as Record<string,unknown>,price=atomicPrice(b.price),capacity=integer(b.capacity),note=text(b.note,10,2000,'Offer details');
   if(BigInt(price)>BigInt(String(pool.price)))throw new Error('Your offer exceeds the maximum unit price.');if(capacity<Number(pool.minimum))throw new Error('Capacity must cover the minimum order quantity.');
   await db().prepare('INSERT INTO offers (id,pool_id,wallet,price,capacity,note,created_at) VALUES (?,?,?,?,?,?,?) ON CONFLICT(pool_id,wallet) DO UPDATE SET price=excluded.price,capacity=excluded.capacity,note=excluded.note,created_at=excluded.created_at').bind(uid(),path[1],wallet,price,capacity,note,now()).run();return json({ok:true,binding:false});
  }
  if(path[2]==='messages'&&method==='POST'){
   const b=await parseBody(req) as {body:unknown},message=text(b.body,1,1000,'Message');
   const recent=await db().prepare('SELECT COUNT(*) AS count FROM messages WHERE wallet=? AND created_at>?').bind(wallet,now()-60000).first<{count:number}>();if((recent?.count||0)>=10)return json({error:'Please wait before posting another message.'},429);
   await db().prepare('INSERT INTO messages (id,pool_id,wallet,body,created_at) VALUES (?,?,?,?,?)').bind(uid(),path[1],wallet,message,now()).run();return json({ok:true});
  }
 }
 if(path[0]==='suppliers'&&method==='GET'){const r=await db().prepare('SELECT wallet,name,region,bio,created_at FROM accounts WHERE supplier=1 ORDER BY created_at DESC LIMIT 100').all();return json({suppliers:r.results});}
 if(path[0]==='profile'&&method==='POST'){
  const b=await parseBody(req) as Record<string,unknown>,name=text(b.name,2,80,'Business name'),region=text(b.region,2,80,'Region'),bio=text(b.bio,10,1000,'Business description');
  await db().prepare('UPDATE accounts SET name=?,region=?,bio=?,supplier=? WHERE wallet=?').bind(name,region,bio,b.supplier?1:0,wallet).run();return json({ok:true});
 }
 if(path[0]==='workspace'&&method==='GET'){
  if(!wallet)return json({error:'Sign in to view your workspace.'},401);
  const r=await db().batch([db().prepare('SELECT * FROM pools WHERE wallet=? ORDER BY created_at DESC').bind(wallet),db().prepare('SELECT i.*,p.title,p.price,p.status FROM interests i JOIN pools p ON p.id=i.pool_id WHERE i.wallet=?').bind(wallet),db().prepare('SELECT o.*,p.title,p.status FROM offers o JOIN pools p ON p.id=o.pool_id WHERE o.wallet=?').bind(wallet)]);return json({pools:r[0].results,interests:r[1].results,offers:r[2].results});
 }
 if(path[0]==='activity'&&method==='GET'){const r=await db().prepare('SELECT * FROM events ORDER BY created_at DESC LIMIT 30').all();return json({events:r.results});}
 return json({error:'Endpoint not found.'},404);
 }catch(error){const message=error instanceof Error?error.message:'Request failed.',internal=/D1_|SQLITE|binding|database|storage|Cannot read/.test(message);if(internal)console.error('HIVELOT API error',message);return json({error:internal?'The service is temporarily unavailable. Please try again.':message},internal?503:400);}
}
export const GET=handle,POST=handle,DELETE=handle;
