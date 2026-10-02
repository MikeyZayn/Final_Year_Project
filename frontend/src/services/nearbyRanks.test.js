import {test} from 'node:test';
import assert from 'node:assert/strict';
import {nearestRank} from './nearbyRanks.js';
test('nearest rank ignores absent coordinates and rejects far away starts',()=>{
 const ranks=[{id:1,latitude:null,longitude:null},{id:2,latitude:-28.8,longitude:31.9},{id:3,latitude:-28.7,longitude:32}];
 assert.equal(nearestRank(ranks,{latitude:-28.8,longitude:31.9}).rank.id,2);
 assert.equal(nearestRank(ranks,{latitude:0,longitude:0}),null);
 assert.equal(nearestRank(ranks,null),null);
});
