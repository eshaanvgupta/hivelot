import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
import WebSocket from 'ws';
const base=process.env.HIVELOT_TEST_URL||'http://127.0.0.1:5173/';
const chrome=process.env.CHROME_PATH||'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const delay=ms=>new Promise(r=>setTimeout(r,ms));
const profile=fs.mkdtempSync(path.join(os.tmpdir(),'hivelot-browser-'));
let browser,socket;
try{
 browser=spawn(chrome,['--headless=new','--no-first-run','--no-default-browser-check','--remote-debugging-port=0',`--user-data-dir=${profile}`,'about:blank'],{stdio:'ignore',windowsHide:true});
 const debugFile=path.join(profile,'DevToolsActivePort');for(let i=0;i<100&&!fs.existsSync(debugFile);i++)await delay(100);assert.ok(fs.existsSync(debugFile));
 const port=fs.readFileSync(debugFile,'utf8').split('\n')[0],targets=await(await fetch(`http://127.0.0.1:${port}/json/list`)).json();
 socket=new WebSocket(targets.find(t=>t.type==='page').webSocketDebuggerUrl);await new Promise((r,j)=>{socket.once('open',r);socket.once('error',j);});
 let counter=0;const pending=new Map(),exceptions=[];
 socket.on('message',raw=>{const m=JSON.parse(raw);if(m.id){const p=pending.get(m.id);if(p){pending.delete(m.id);m.error?p.reject(Error(m.error.message)):p.resolve(m.result);}}if(m.method==='Runtime.exceptionThrown')exceptions.push(m.params.exceptionDetails.exception?.description||m.params.exceptionDetails.text);});
 function send(method,params={}){return new Promise((resolve,reject)=>{const id=++counter;pending.set(id,{resolve,reject});socket.send(JSON.stringify({id,method,params}));});}
 async function evaluate(expression){const r=await send('Runtime.evaluate',{expression,returnByValue:true,awaitPromise:true});if(r.exceptionDetails)throw Error(r.exceptionDetails.exception?.description||r.exceptionDetails.text);return r.result.value;}
 await send('Page.enable');await send('Runtime.enable');
 await send('Emulation.setDeviceMetricsOverride',{width:1440,height:1100,deviceScaleFactor:1,mobile:false});await send('Page.navigate',{url:base});
 for(let i=0;i<100;i++){await delay(150);if(await evaluate('!!document.querySelector(".stats-bar") && !document.querySelector(".skeleton")'))break;}
 await evaluate('document.fonts.ready');await delay(300);
 assert.ok((await evaluate('document.body.textContent')).includes('Better buying,'));assert.ok(!(await evaluate('document.body.textContent')).includes('GitHub Pages · Read-only'));
 assert.equal(await evaluate('document.documentElement.scrollWidth>window.innerWidth'),false);
 fs.mkdirSync('outputs',{recursive:true});
 let screen=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('outputs/desktop.png',Buffer.from(screen.data,'base64'));
 for(const text of ['The network','Workspace','Suppliers']){await evaluate(`Array.from(document.querySelectorAll('header nav button')).find(x=>x.textContent==='${text}').click()`);await delay(120);assert.equal(await evaluate('document.documentElement.scrollWidth>window.innerWidth'),false);}
 await evaluate("Array.from(document.querySelectorAll('footer button')).find(x=>x.textContent.includes('Settlement desk')).click()");const expected=process.env.HIVELOT_EXPECT_SETTLEMENT_READY==='true'?'CONFIGURED PROTOCOL':'Waiting for deployment.';for(let i=0;i<100;i++){if((await evaluate('document.body.textContent')).includes(expected))break;await delay(100);}assert.ok((await evaluate('document.body.textContent')).includes(expected));
 await evaluate("document.querySelector('.wallet-button').click()");await delay(100);assert.equal(await evaluate('document.querySelector("dialog").open'),true);assert.equal(await evaluate('document.querySelector("dialog").contains(document.activeElement)'),true);
 await send('Input.dispatchKeyEvent',{type:'keyDown',key:'Escape',code:'Escape',windowsVirtualKeyCode:27});await delay(100);assert.equal(await evaluate('!!document.querySelector("dialog[open]")'),false);
 await evaluate("document.querySelector('.brand').click()");
 for(const width of [768,390,320]){await send('Emulation.setDeviceMetricsOverride',{width,height:844,deviceScaleFactor:1,mobile:width<700});await delay(170);assert.equal(await evaluate('document.documentElement.scrollWidth>window.innerWidth'),false,`Horizontal overflow at ${width}px`);}
 await send('Emulation.setDeviceMetricsOverride',{width:390,height:1100,deviceScaleFactor:1,mobile:true});await delay(100);screen=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('outputs/mobile.png',Buffer.from(screen.data,'base64'));
 await send('Emulation.setEmulatedMedia',{features:[{name:'prefers-reduced-motion',value:'reduce'}]});assert.equal(await evaluate('getComputedStyle(document.querySelector(".flow-dot")).display'),'none');
 if(process.env.HIVELOT_QA_DEPLOYMENT==='true'){
  await send('Emulation.setDeviceMetricsOverride',{width:1000,height:1000,deviceScaleFactor:1,mobile:false});
  await send('Page.navigate',{url:new URL('?deployment-qa#deploy',base).href});
  for(let i=0;i<100;i++){await delay(100);if(await evaluate('!!document.querySelector(".deployment-modal[open]")'))break;}
  assert.equal(await evaluate('!!document.querySelector(".deployment-modal[open]")'),true);
  assert.ok((await evaluate('document.querySelector(".deployment-token").textContent')).includes('0x3F43DA82'));
  await evaluate(`window.__walletCalls=[];let chain='0x1';window.ethereum={request:async({method,params})=>{window.__walletCalls.push(method);if(method==='eth_chainId')return chain;if(method==='eth_requestAccounts'||method==='eth_accounts')return ['0x1111111111111111111111111111111111111111'];if(method==='wallet_switchEthereumChain'){chain=params[0].chainId;return null;}throw Error('Unexpected wallet request: '+method);}};document.querySelector('.deployment-modal>.button').click();`);
  for(let i=0;i<200;i++){await delay(150);if(await evaluate('!!document.querySelector(".deployment-quote") || !!document.querySelector(".deployment-modal .form-error")'))break;}
  assert.equal(await evaluate('!!document.querySelector(".deployment-quote")'),true,await evaluate('document.querySelector(".deployment-modal .form-error")?.textContent'));
  assert.equal(await evaluate('document.querySelector(".deployment-modal .estimate-box .button.primary").disabled'),true);
  const calls=await evaluate('window.__walletCalls');assert.ok(calls.includes('wallet_switchEthereumChain'));assert.ok(!calls.some(x=>x.startsWith('eth_send')||x.startsWith('personal_sign')));
  const shot=await send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});fs.writeFileSync('outputs/deployment.png',Buffer.from(shot.data,'base64'));
  console.log('PASS: guided deployment validates the live QIE RPC/token, switches the wallet network, quotes gas for an unfunded address, blocks funding shortfalls and sends no transaction.');
 }
 assert.deepEqual(exceptions,[]);console.log('PASS Chrome: desktop and 768/390/320px layouts, live API rendering, navigation, settlement readiness, modal focus/Escape, reduced motion, and zero uncaught browser errors. Screenshots: outputs/desktop.png and outputs/mobile.png.');
}finally{socket?.close();browser?.kill();setTimeout(()=>process.exit(0),300);}
