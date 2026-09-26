import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { WebSocket } from 'ws';
import { Match, sanitizeInput } from '../game.js';
import { createGameServer } from '../server.js';

function tick(room, seconds) { for(let i=0;i<seconds*120;i++)room.step(1/120,1000); }
test('match lifecycle, goals, timer, and mutually agreed rematch are server controlled',()=>{
  const room=new Match('ABC123');room.add({});assert.equal(room.phase,'waiting');
  room.add({});assert.equal(room.phase,'countdown');tick(room,3.1);assert.equal(room.phase,'playing');
  room.ball.z=-78;room.step(1/120,1000);assert.deepEqual(room.scores,[1,0]);assert.equal(room.phase,'goal');
  tick(room,4);assert.equal(room.phase,'playing');assert.equal(room.ball.z,0);
  room.remaining=.001;room.step(1/120,1000);assert.equal(room.phase,'finished');
  room.action(0,'rematch');assert.equal(room.phase,'finished');room.action(1,'rematch');assert.equal(room.phase,'countdown');assert.deepEqual(room.scores,[0,0]);
  room.remove(0);assert.equal(room.phase,'waiting');assert.equal(room.players[1]!==null,true);room.add({});assert.equal(room.phase,'countdown');
});
test('input is bounded, stale input releases, and clients cannot set positions or boost',()=>{
  assert.deepEqual(sanitizeInput({throttle:Infinity,steer:20,boost:'true',drift:true,x:500}),{throttle:0,steer:1,boost:false,drift:true});
  const room=new Match('ABC123');room.add({});room.add({});tick(room,3.1);
  room.input(0,{throttle:1,boost:true,x:999,boostAmount:999},1000);room.step(1/120,1000);
  assert.ok(room.cars[0].boost<100);assert.equal(room.cars[0].x,0);
  room.step(1/120,1400);assert.equal(room.cars[0].boosting,false);
  const boost=room.cars[0].boost;room.action(0,'reset');assert.equal(room.cars[0].boost,boost);
});
test('both teams collect the shared boost pads',()=>{
  const room=new Match('ABC123');room.add({});room.add({});tick(room,3.1);
  const pad=room.pads[0];Object.assign(room.cars[1],{x:pad.x,z:pad.z,boost:10});room.step(1/120,1000);
  assert.ok(room.cars[1].boost>40);assert.equal(pad.cooldown,5);
});
function client(url, origin='https://game.example') {
  const ws=new WebSocket(url,{origin});const inbox=[];const waiters=[];
  ws.on('message',raw=>{const message=JSON.parse(raw);inbox.push(message);for(const check of [...waiters])check();});
  function wait(predicate) {
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{waiters.splice(waiters.indexOf(check),1);reject(Error('Timed out waiting for message'));},4000);
      function check(){const index=inbox.findIndex(predicate);if(index>=0){clearTimeout(timer);const wi=waiters.indexOf(check);if(wi>=0)waiters.splice(wi,1);resolve(inbox.splice(index,1)[0]);}}
      waiters.push(check);check();
    });
  }
  return {ws,wait,clear:()=>{inbox.length=0;},send:data=>ws.send(JSON.stringify(data))};
}
test('real sockets create, discover, join, synchronize, reject full rooms, and clean up',async t=>{
  const app=createGameServer({origins:['https://game.example']});
  await new Promise(resolve=>app.server.listen(0,'127.0.0.1',resolve));t.after(()=>app.close());
  const port=app.server.address().port,url=`ws://127.0.0.1:${port}/ws`;
  const a=client(url),b=client(url),c=client(url);await Promise.all([a,b,c].map(x=>once(x.ws,'open')));
  a.send({type:'create',requestId:1});const joined=await a.wait(m=>m.type==='joined');assert.match(joined.roomId,/^[A-F0-9]{6}$/);
  b.send({type:'list',requestId:1});const list=await b.wait(m=>m.type==='rooms');assert.equal(list.rooms[0].id,joined.roomId);
  // Distinct client avoids command throttling while testing a simultaneous join.
  c.send({type:'join',roomId:joined.roomId});const second=await c.wait(m=>m.type==='joined');assert.equal(second.slot,1);
  a.send({type:'ping',pingId:42});const pong=await a.wait(m=>m.type==='pong');assert.equal(pong.pingId,42);
  const states=await Promise.all([a,c].map(x=>x.wait(m=>m.type==='state'&&m.phase==='countdown')));assert.deepEqual(states[0].scores,states[1].scores);assert.deepEqual(states[0].cars,states[1].cars);
  await new Promise(r=>setTimeout(r,160));b.send({type:'join',roomId:joined.roomId});assert.match((await b.wait(m=>m.type==='error')).message,/full/);
  const room=app.rooms.get(joined.roomId);room.phase='playing';a.send({type:'input',input:{throttle:1,boost:true}});
  const moved=await a.wait(m=>m.type==='state'&&m.cars[0].boost<100);assert.ok(moved.cars[0].z<39);
  a.clear();c.ws.close();await a.wait(m=>m.type==='state'&&m.phase==='waiting');assert.equal(room.players[1],null);
  a.ws.close();await once(a.ws,'close');await new Promise(r=>setTimeout(r,30));assert.equal(app.rooms.size,0);
  assert.equal((await fetch(`http://127.0.0.1:${port}/health`)).status,200);
});
test('unexpected origins and malformed packets are rejected',async t=>{
  const app=createGameServer({origins:['https://game.example']});await new Promise(r=>app.server.listen(0,'127.0.0.1',r));t.after(()=>app.close());
  const url=`ws://127.0.0.1:${app.server.address().port}/ws`;
  const bad=new WebSocket(url,{origin:'https://untrusted.example'});const [error]=await once(bad,'error');assert.match(error.message,/403/);
  const good=client(url);await once(good.ws,'open');good.ws.send('{');const [code]=await once(good.ws,'close');assert.equal(code,1008);
});
