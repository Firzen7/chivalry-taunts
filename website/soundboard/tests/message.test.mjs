import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import {readFileSync} from 'node:fs';
import {resolve, dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
const {parseHTML} = await import(process.env.DOM_TEST_HELPER || 'linkedom');
const root=resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const read=path=>readFileSync(resolve(root,path),'utf8');
const catalog=JSON.parse(read('soundboard/catalog.js').split('window.CHIVALRY_CATALOG = ')[1].split(';\n')[0]);
const payload={faction:'agatha',class:'knight',nickname:'Firzen',message:'See you on the battlefield!',voice_variant:catalog.agatha.knight.personal[4].clips[0].file};
function app(data=payload, fragment=false) {
 const {window}=parseHTML(read('message.html'));
 const {document,Event}=window;
 window.HTMLElement.prototype.focus=function(){};
 const recordings=[];
 function Audio(){const a=document.createElement('audio'); a.play=()=>{a.plays++;return Promise.resolve();};a.pause=()=>{};a.load=()=>{};a.plays=0;recordings.push(a);return a;}
 const encoded=typeof data==='string'?data:Buffer.from(JSON.stringify(data)).toString('base64url');
 const context=vm.createContext({window,document,location:{search:fragment?'':'?data='+encodeURIComponent(encoded),hash:fragment?'#data='+encoded:''},Audio,URLSearchParams,atob,btoa,TextEncoder,TextDecoder,console});
 vm.runInContext(read('soundboard/catalog.js'),context);
 vm.runInContext(read('soundboard/message-codec.js'),context);
 vm.runInContext(read('soundboard/message.js'),context);
 return {document,window,recordings,click:id=>document.getElementById(id).dispatchEvent(new Event('click')),audio:recordings[0]};
}
test('reveal and replay use the same exact voice, with mute and hidden text state',()=>{
 const a=app();
 assert.equal(a.document.getElementById('message-text').getAttribute('aria-hidden'),'true');
 assert.equal(a.audio.plays,0);
 a.click('message-sound');assert.equal(a.audio.muted,true);
 a.click('message-reveal');assert.equal(a.audio.plays,1);
 assert.equal(a.audio.src,payload.voice_variant);
 assert.equal(a.document.getElementById('message-replay').hidden,false);
 assert.equal(a.document.getElementById('message-reveal').hidden,true);
 assert.equal(a.document.getElementById('message-text').classList.contains('concealed'),false);
 a.click('message-sound');assert.equal(a.audio.muted,false);
 a.click('message-replay');assert.equal(a.audio.plays,2);assert.equal(a.audio.currentTime,0);
});
test('UTF-8 payloads in fragments are rendered as plain text with matching portrait',()=>{
 const a=app({...payload,nickname:'Žižka ⚔',message:'<img src=x onerror=alert(1)> Příteli!'},true);
 assert.equal(a.document.getElementById('message-title').textContent,'Message from Žižka ⚔');
 assert.equal(a.document.getElementById('message-text').children.length,0);
 assert.match(a.document.getElementById('message-warrior').src,/agatha-knight-640.webp/);
});
test('invalid Base64, incomplete payloads, external files, and mismatched warrior voices fail safely',()=>{
 for(const data of ['!!!',{}, {...payload,faction:'masons'}, {...payload,voice_variant:'https://example.com/voice.mp3'}, {...payload,nickname:''}]){
  const a=app(data);assert.equal(a.document.getElementById('message-error').hidden,false);assert.equal(a.recordings.length,0);
 }
});
test('compact links round-trip every faction, class and folder shortcut with Unicode',()=>{
 const codec=app().window.ChivalryMessageCodec;
 for(const [f,faction] of Object.entries({a:'agatha',m:'masons'}))
 for(const [c,cls] of Object.entries({k:'knight',a:'archer',v:'vanguard',m:'man_at_arms'}))
 for(const [prefix,folder] of Object.entries({p:'personal_messages',t:'tactical_messages',br:'battlecry/running',ba:'battlecry/animated',o:'other'})){
  const full={faction,class:cls,nickname:'Žižka ⚔',message:'Děkuji! 🏹',voice_variant:`audio/${faction}/${cls}/${folder}/test.mp3`};
  const short=codec.compact(full);
  assert.deepEqual(JSON.parse(JSON.stringify(short)),{f,c,n:full.nickname,m:full.message,v:`${prefix}/test.mp3`});
  assert.deepEqual(JSON.parse(JSON.stringify(codec.expand(short))),full);
  assert.deepEqual(JSON.parse(Buffer.from(codec.encode(full),'base64url').toString()),JSON.parse(JSON.stringify(short)));
 }
});
test('compact testing links select the exact recording and reject invalid paths',()=>{
 const codec=app().window.ChivalryMessageCodec;
 const encoded=codec.encode(payload);
 const a=app(encoded);a.click('message-reveal');assert.equal(a.audio.src,payload.voice_variant);
 for(const v of ['x/clip.mp3','p/../../outside.mp3','p/thanks/missing.mp3']){
  const invalid=app({f:'a',c:'k',n:'Firzen',m:'Hello',v});
  assert.equal(invalid.recordings.length,0);
  assert.equal(invalid.document.getElementById('message-error').hidden,false);
 }
});
test('shared voices permit an empty custom message and still reveal and play',()=>{
 const codec=app().window.ChivalryMessageCodec;
 const a=app(codec.encode({...payload,message:''}));
 assert.equal(a.document.getElementById('message-error').hidden,true);
 a.click('message-reveal'); assert.equal(a.audio.plays,1);
 assert.equal(a.document.getElementById('message-text').textContent,'');
});
