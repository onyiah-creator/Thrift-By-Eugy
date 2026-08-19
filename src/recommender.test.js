import { similarItems, completeTheLook, forYou, similarity, buildAffinityModel, _internals } from './recommender.js';

const cat = [
  {sku:'T1',name:'Lace Peplum Top',category:'Tops',price:12500,size:'M',condition:'Excellent',color:'Coral',description:'Off-shoulder cotton peplum with crochet lace trim',quantity:1,status:'active',dateAdded:'2026-08-18'},
  {sku:'T2',name:'Ruffle Wrap Blouse',category:'Tops',price:9800,size:'S',condition:'Very Good',color:'Lime Green',description:'Pleated chiffon wrap blouse with tiered ruffle',quantity:1,status:'active',dateAdded:'2026-08-17'},
  {sku:'T3',name:'Peach Silk Camisole',category:'Tops',price:11000,size:'M',condition:'Excellent',color:'Peach',description:'Silk camisole, evening',quantity:1,status:'active',dateAdded:'2026-08-16'},
  {sku:'T4',name:'Basic Cotton Tee',category:'Tops',price:3000,size:'M',condition:'Good',color:'White',description:'Everyday cotton t-shirt',quantity:1,status:'active',dateAdded:'2026-08-15'},
  {sku:'D1',name:'Silk Slip Dress',category:'Dresses',price:22000,size:'M',condition:'Excellent',color:'Emerald',description:'Bias-cut silk slip, cocktail evening',quantity:1,status:'active',dateAdded:'2026-08-14'},
  {sku:'D2',name:'Terracotta Maxi Dress',category:'Dresses',price:14000,size:'M',condition:'Very Good',color:'Rust',description:'Flowy floral maxi, boho',quantity:1,status:'active',dateAdded:'2026-08-13'},
  {sku:'J1',name:'Denim Trucker Jacket',category:'Denim',price:15000,size:'L',condition:'Good',color:'Blue',description:'Classic mid-wash denim jacket',quantity:1,status:'active',dateAdded:'2026-08-12'},
  {sku:'S1',name:'Tan Ankle Boots',category:'Shoes',price:18000,size:'M',condition:'Very Good',color:'Tan',description:'Leather ankle boots',quantity:1,status:'active',dateAdded:'2026-08-11'},
  {sku:'A1',name:'Beaded Clutch',category:'Accessories',price:6500,size:'M',condition:'Excellent',color:'Gold',description:'Evening beaded clutch, party',quantity:1,status:'active',dateAdded:'2026-08-10'},
  {sku:'X1',name:'SOLD Coral Top',category:'Tops',price:12000,size:'M',condition:'Excellent',color:'Coral',description:'lace peplum crochet',quantity:0,status:'active',dateAdded:'2026-08-19'},
];

const byId = s => cat.find(p=>p.sku===s);
let pass=0, fail=0;
const check=(label,cond,extra='')=>{ if(cond){pass++;console.log('  PASS',label);} else {fail++;console.log('  FAIL',label,extra);} };

console.log('\n--- similarItems for Coral Lace Peplum Top (T1) ---');
const sim = similarItems(byId('T1'), cat, {limit:5});
sim.forEach(p=>console.log('   ', p.sku, p.name, p.color, '₦'+p.price));
check('excludes sold-out item X1', !sim.find(p=>p.sku==='X1'));
check('excludes itself', !sim.find(p=>p.sku==='T1'));
check('surfaces peach camisole (colour family + price)', !!sim.find(p=>p.sku==='T3'));
check('does not return only Tops (diversity cap)', new Set(sim.map(p=>p.category)).size>1);

console.log('\n--- completeTheLook for Silk Slip Dress (D1) ---');
const look = completeTheLook(byId('D1'), cat, {limit:4});
look.forEach(p=>console.log('   ', p.sku, p.name, p.category));
check('returns no Dresses', !look.find(p=>p.category==='Dresses'));
check('returns complementary categories only', look.every(p=>['Shoes','Accessories','Outerwear'].includes(p.category)));

console.log('\n--- forYou after viewing two evening pieces ---');
const feed = forYou([byId('D1'), byId('T3')], cat, {limit:6});
feed.forEach(p=>console.log('   ', p.sku, p.name));
check('excludes already-viewed', !feed.find(p=>['D1','T3'].includes(p.sku)));
check('excludes sold out', !feed.find(p=>p.sku==='X1'));

console.log('\n--- scoring sanity ---');
const sCoralPeach = similarity(byId('T1'), byId('T3'));
const sCoralTee   = similarity(byId('T1'), byId('T4'));
console.log('   coral top vs peach cami:', sCoralPeach.toFixed(3));
console.log('   coral top vs basic tee: ', sCoralTee.toFixed(3));
check('related item scores above unrelated', sCoralPeach > sCoralTee, `${sCoralPeach} vs ${sCoralTee}`);
check('similarity to self is 0', similarity(byId('T1'),byId('T1'))===0);
check('price ratio symmetric', Math.abs(_internals.priceScore(10000,20000)-_internals.priceScore(20000,10000))<1e-9);
check('neutral pairs broadly', _internals.colorScore('White','Coral')>0);
check('unrelated colours score 0', _internals.colorScore('Blue','Coral')===0);

console.log('\n--- cold start (no history) ---');
const cold = forYou([], cat, {limit:4});
console.log('   ', cold.map(p=>p.sku).join(', '));
check('cold start returns items', cold.length===4);
check('cold start excludes sold out', !cold.find(p=>p.sku==='X1'));

console.log('\n--- behaviour model ---');
const events=[];
for(let i=0;i<40;i++){ events.push({sessionId:'s'+i,category:'Dresses'},{sessionId:'s'+i,category:'Shoes'}); }
const model = buildAffinityModel(events);
console.log('   totalEvents:', model.totalEvents, '| Dresses->Shoes affinity:', model.affinity('Dresses','Shoes').toFixed(3));
check('learns Dresses->Shoes affinity', model.affinity('Dresses','Shoes')>0.5);
check('no self affinity', model.affinity('Dresses','Dresses')===0);
const thin = buildAffinityModel([{sessionId:'a',category:'Tops'},{sessionId:'a',category:'Shoes'}]);
check('ignores thin data', thin.affinity('Tops','Shoes')===0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail?1:0);
