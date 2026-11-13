import assert from 'node:assert/strict';
import { GameTimer } from '../src/game/GameTimer.js';
import { GameResults } from '../src/game/GameResults.js';
import { OrderSystem } from '../src/game/OrderSystem.js';
import { ScoreSystem } from '../src/game/ScoreSystem.js';
const timer=new GameTimer();assert.equal(timer.text,'05:00');
for(let i=0;i<16200;i++)timer.update(1/60);assert.equal(timer.text,'00:30');assert.equal(timer.level,'warning');
timer.update(20);assert.equal(timer.level,'urgent');timer.update(100);assert.equal(timer.remaining,0);timer.update(100);assert.equal(timer.remaining,0);
const results=new GameResults(),orders=new OrderSystem(),score=new ScoreSystem();
orders.onCreated=o=>results.record('generated',o);orders.onCompleted=o=>results.record('delivered',o);orders.onExpired=o=>{results.record('expired',o);score.expire();};
score.onIncorrect=()=>results.record('incorrect');
for(let i=0;i<7;i++) {
 const order=orders.createForCustomer({id:i,state:'WAITING',arrivalComplete:true});
 if(i<5){assert.equal(orders.markCompleted(order.id),true);assert.equal(orders.markCompleted(order.id),false);score.complete(order);}
 if(i===5){order.remainingTime=.01;orders.update(.02);}
}
score.incorrect();assert.equal(results.generated,7);assert.equal(results.delivered,5);assert.equal(results.expired,1);assert.equal(results.incorrect,1);assert.equal(results.bestStreak,5);
const final=results.finish(score.score);results.record('delivered',{id:'later'});assert.equal(results.finish(999),final);assert.equal(final.stars,3);assert.equal(final.delivered,5);assert.equal(orders.getActiveOrders().length,1);
for(const [n,stars] of [[0,0],[1,1],[2,1],[3,2],[4,2],[5,3]]){const r=new GameResults();for(let i=0;i<n;i++)r.record('delivered',{id:i});assert.equal(r.finish(0).stars,stars);}
console.log('OK: 60 FPS, limites, zero, estatisticas por evento, entrega unica, pendentes, snapshot imutavel e todos os limites de estrelas.');
