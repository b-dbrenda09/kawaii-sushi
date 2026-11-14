import assert from 'node:assert/strict';
import { Box3, Matrix4, Vector3 } from 'three';
import { Scene } from '../src/game/Scene.js';
import { CarrySystem } from '../src/game/CarrySystem.js';
import { IngredientFactory } from '../src/game/IngredientFactory.js';
import { SushiFactory } from '../src/game/SushiFactory.js';
import { AssemblySystem } from '../src/game/AssemblySystem.js';
import { RECIPES } from '../src/game/RecipeSystem.js';

function boundsIn(object, reference) {
 reference.updateWorldMatrix(true,true); object.updateWorldMatrix(true,true);
 const inverse=new Matrix4().copy(reference.matrixWorld).invert(), result=new Box3();
 object.traverse(part=>{
  if(!part.geometry)return;
  part.geometry.computeBoundingBox();
  result.union(part.geometry.boundingBox.clone().applyMatrix4(new Matrix4().multiplyMatrices(inverse,part.matrixWorld)));
 });
 return result;
}
const world=new Scene({gameMode:'coop'}), factory=new IngredientFactory(), sushi=new SushiFactory();
const carries=world.players.map(player=>new CarrySystem({player,stations:world.kitchen.stations,factory}));
for(const station of world.kitchen.stations.values()) {
 if(station.type!=='assembly')continue;
 const collider=JSON.stringify(station.collider), mat=station.model.getObjectByName('assembly-bamboo-mat');
 assert.ok(mat); assert.equal(station.storage.anchor.parent,mat);
 // Transforma tanto a bancada quanto o tapete, sem mudar offsets da montagem.
 station.model.position.add(new Vector3(2,.4,-1)); station.model.rotation.y=.73; station.model.scale.set(1.2,.9,1.4);
 mat.rotation.y=-.31; mat.scale.set(.8,1.1,.9); mat.position.set(.1,.2,-.15);
 const parts=mat.children.filter(p=>p.name.startsWith('bamboo-mat-'));
 const matBounds=new Box3();parts.forEach(part=>matBounds.union(boundsIn(part,mat)));
 const assembly=new AssemblySystem({station,carrySystem:carries[0],factory:sushi});
 const check=model=>{
  const box=boundsIn(model,mat), center=box.getCenter(new Vector3()), matCenter=matBounds.getCenter(new Vector3());
  assert.ok(Math.abs(center.x-matCenter.x)<1e-6 && Math.abs(center.z-matCenter.z)<1e-6,'Centro do modelo coincide com o tapete');
  assert.ok(Math.abs(box.min.y-matBounds.max.y-.003)<1e-6,'Base imediatamente acima do tapete');
  assert.ok(box.min.x>=matBounds.min.x && box.max.x<=matBounds.max.x && box.min.z>=matBounds.min.z && box.max.z<=matBounds.max.z,'Modelo dentro do tapete');
 };
 check(assembly.preview);
 for(const recipe of RECIPES) {
  const sequence=recipe.id==='cucumber_uramaki'?['cucumber_cut','nori_sheet','rice_cooked']:recipe.sequence;
  for(const [i,state] of sequence.entries()) {
   const item=factory.create(state==='rice_cooked'?'rice':state==='salmon_cut'?'salmon':state==='cucumber_cut'?'cucumber':'nori');
   if(state==='rice_cooked')factory.setRiceState(item,state);
   if(state.endsWith('_cut'))factory.setCutState(item,state);
   carries[i%2].attach(item);assert.equal(assembly.interact(carries[i%2]).success,true);
   const visual=assembly.dish?.model??assembly.preview;check(visual);assert.equal(visual.visible,true);
   if(!assembly.dish&&state==='cucumber_cut')assert.ok(visual.children.some(mesh=>mesh.material===sushi.materials.cucumber),'Pepino visível antes de arroz/nori');
  }
  assert.equal(assembly.dish.recipeId,recipe.id);assembly.update(.3);check(assembly.dish.model);
  assert.equal(assembly.interact(carries[1]).success,true);
  assert.equal(assembly.interact(carries[0]).kind,'take-preparation');
  assert.equal(carries[0].carriedIngredient.ingredients.length,0);carries[0].discard();
  // Recolocar e retirar também deve usar o mesmo tapete.
  assert.equal(assembly.interact(carries[1]).success,true);check(assembly.dish.model);
  assembly.interact(carries[0]);carries[0].discard();check(assembly.preview);
 }
 carries[1].attach(factory.create('nori'));assembly.interact(carries[1]);
 assembly.update(0,{selected:true,cancelHeld:true});assembly.update(1,{selected:true,cancelHeld:true});
 assert.equal(assembly.state,'EMPTY');check(assembly.preview);
 assert.equal(JSON.stringify(station.collider),collider,'Colisões preservadas');
 assembly.dispose();
}
carries.forEach(c=>c.dispose());factory.dispose();sushi.dispose();world.dispose();
console.log('OK: três tapetes, centro/altura/limites com rotação e escala, ingredientes visíveis, três receitas em dupla, sushi final, retirada, apoio e cancelamento sem duplicação.');
