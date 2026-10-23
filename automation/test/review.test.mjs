import {test} from 'node:test';
import assert from 'node:assert/strict';
import {command,closingNumbers,validateReview} from '../policy.mjs';
import {runBot,reviewPull,syncPull} from '../bot.mjs';
import {statusOption} from '../projects.mjs';
class Memory {
 constructor(){this.repo='Logitrack-Sa/demo';this.changedStatuses=new Set();this.issue={number:1,state:'open',labels:[]};this.pull={number:2,state:'open',draft:false,merged:false,head:{sha:'abc'},html_url:'https://github.com/Logitrack-Sa/demo/pull/2',body:'Closes #1',author_association:'COLLABORATOR',title:'Cambio'};this.files=[{filename:'a.java',patch:'@@ -1 +1 @@\n-old\n+new'}];this.statuses=[];this.comments=[];this.labels=[];}
 async get(p){if(p==='/issues/1')return this.issue;if(p==='/issues/2')return {...this.pull,pull_request:{},labels:[]};if(p==='/pulls/2')return this.pull;if(p.includes('/check-runs'))return {check_runs:[{name:'Maven',status:'completed',conclusion:'success'}]};throw Error(p);}
 async all(p){if(p.includes('/files'))return this.files;if(p==='/pulls?state=open')return [];throw Error(p);}
 async post(p,v){this.statuses.push(v);}
 async replaceLabels(n,p,v){this.labels.push([n,p,v]);this.changedStatuses.add(n);}
 async comment(n,m,b){this.comments.push(b);}
}
const ok=()=>({summary:'Sin problemas concretos en el diff.',findings:[],tests:['Probar autorización.']});
test('solo comando review exacto; no planificación',()=>{assert.deepEqual(command('/review'),['review']);assert.deepEqual(command('/review status doing'),['status','doing']);for(const s of ['/pm plan','/review plan','texto /review','/review\nrm -rf','/review status done'])assert.equal(command(s),null);});
test('vincula URLs e IDs solo del repositorio actual',()=>{assert.deepEqual(closingNumbers('Closes #1; Fixes https://github.com/Logitrack-Sa/demo/issues/3; Resolves Other/repo#5; Closes Logitrack-Sa/demo#7','Logitrack-Sa/demo'),[1,3,7]);});
test('rechaza archivos y severidad inventados',()=>{assert.throws(()=>validateReview({...ok(),findings:[{severity:'urgent',path:'other',line:1,problem:'a',suggestion:'b'}]},[{filename:'a.java'}]));});
test('reconoce estados españoles del tablero existente',()=>{assert.equal(statusOption([{id:'a',name:'En progreso'}],'doing').id,'a');assert.equal(statusOption([{id:'b',name:'En review'}],'review').id,'b');});
test('abrir o editar una issue no consulta IA ni produce plan',async()=>{for(const action of ['opened','edited']){const g=new Memory();await runBot({github:g,eventName:'issues',event:{action,issue:{number:1}},ask:()=>assert.fail('No modelo')});assert.equal(g.comments.length,0);}});
test('comando externo no consume IA',async()=>{const g=new Memory();await runBot({github:g,eventName:'issue_comment',event:{issue:{number:2,pull_request:{}},comment:{author_association:'NONE',body:'/review'}},ask:()=>assert.fail('No modelo')});assert.equal(g.comments.length,0);});
test('PR de contribuidor externo no se ejecuta automáticamente',async()=>{const g=new Memory();g.pull.author_association='NONE';await runBot({github:g,eventName:'pull_request_target',event:{action:'opened',pull_request:{number:2}},ask:()=>assert.fail('No modelo')});assert.equal(g.comments.length,0);});
test('PR borrador no se analiza',async()=>{const g=new Memory();g.pull.draft=true;await reviewPull(g,2,()=>assert.fail('No modelo'));assert.equal(g.statuses.length,0);});
test('revisión completa publica resultado y check del SHA actual',async()=>{const g=new Memory();await reviewPull(g,2,async()=>ok());assert.equal(g.statuses.at(-1).state,'success');assert.match(g.comments[0],/abc/);});
test('hallazgo alto falla check sin aprobar ni integrar',async()=>{const g=new Memory();await reviewPull(g,2,async()=>({...ok(),findings:[{severity:'high',path:'a.java',line:1,problem:'Permite acceso ajeno.',suggestion:'Filtrar por identidad.'}]}));assert.equal(g.statuses.at(-1).state,'failure');});
test('cobertura parcial no se declara completa',async()=>{const g=new Memory();g.files[0].patch=undefined;await reviewPull(g,2,async()=>ok());assert.equal(g.statuses.at(-1).state,'failure');});
test('modelo no disponible deja error y diagnóstico',async()=>{const g=new Memory();await assert.rejects(runBot({github:g,eventName:'workflow_dispatch',event:{inputs:{number:'2'}},ask:async()=>{throw Error('Sin acceso');}}));assert.equal(g.statuses.at(-1).state,'error');assert.ok(g.labels.some(v=>v[2].includes('ai:unavailable')));});
test('no publica revisión del SHA anterior',async()=>{const g=new Memory();await reviewPull(g,2,async()=>{g.pull={...g.pull,head:{sha:'def'}};return ok();});assert.equal(g.comments.length,0);assert.equal(g.statuses.at(-1).state,'error');});
test('cerrar PR sin merge no completa issue',async()=>{const g=new Memory();g.pull.state='closed';await syncPull(g,2);assert.ok(!g.labels.some(v=>v[0]===1&&v[2].includes('status:done')));});

test('evento de PR confiable ejecuta revisión real y no un no-op',async()=>{const g=new Memory();await runBot({github:g,eventName:'pull_request_target',event:{action:'opened',pull_request:{number:2}},ask:async()=>ok()});assert.equal(g.statuses.at(-1).state,'success');assert.equal(g.comments.length,1);});
test('permiso write permite revisar aunque la asociación visible sea NONE',async()=>{const g=new Memory();g.pull.author_association='NONE';g.pull.user={login:'member'};const original=g.get.bind(g);g.get=async p=>p.includes('/collaborators/')?{permission:'write'}:original(p);await runBot({github:g,eventName:'pull_request_target',event:{action:'opened',pull_request:{number:2}},ask:async()=>ok()});assert.equal(g.comments.length,1);});

test('comando review funciona para miembro privado con permiso write',async()=>{const g=new Memory();const original=g.get.bind(g);g.get=async p=>p.includes('/collaborators/')?{permission:'write'}:original(p);await runBot({github:g,eventName:'issue_comment',event:{issue:{number:2,pull_request:{}},comment:{user:{type:'User',login:'member'},author_association:'CONTRIBUTOR',body:'/review'}},ask:async()=>ok()});assert.equal(g.comments.length,1);});
test('comando de usuario sin permisos no consume el modelo',async()=>{const g=new Memory();g.get=async()=>({permission:'read'});await runBot({github:g,eventName:'issue_comment',event:{issue:{number:2,pull_request:{}},comment:{user:{type:'User',login:'external'},author_association:'CONTRIBUTOR',body:'/review'}},ask:()=>assert.fail('No modelo')});assert.equal(g.comments.length,0);});
