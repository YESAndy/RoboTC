import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {Office} from '../src/scene';
import {cameraFor,calibration} from '../src/sensors';
import type {Config} from '../src/core';
const config=JSON.parse(readFileSync(new URL('../public/config.json',import.meta.url),'utf8')) as Config;
test('office is below triangle budget and walls remain sensor-visible',()=>{const o=new Office(config);let triangles=0;for(const m of o.meshes)triangles+=(m.geometry.index?.count??m.geometry.attributes.position.count)/3;assert(triangles<100000);const sensorOnly=o.meshes.filter(m=>m.layers.mask===2);assert.equal(sensorOnly.length,2);assert(o.route.layers.mask===1);});
test('sensor mounts and CV extrinsics use the original coordinate conventions',()=>{const camera=cameraFor([1,2,Math.PI/2],config.depth,[320,240]);assert(Math.abs(camera.position.x-1)<1e-8);assert(Math.abs(camera.position.y-2.15)<1e-8);assert.equal(camera.position.z,1.35);const c=calibration(camera,config.depth,[320,240]);assert.equal(c.K[0][2],159.5);assert.equal(c.K[1][2],119.5);assert.equal(c.K[0][0],c.K[1][1]);assert.deepEqual(c.T_world_camera[3],[0,0,0,1]);});
