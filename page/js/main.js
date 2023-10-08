import * as CANNON from '/js/cannon-es.js';

import * as THREE from '/js/three.module.js';
import * as BufferGeometryUtils from '/js/BufferGeometryUtils.js';

const container = document.querySelector('.content');
const canvasEl = document.querySelector('#canvas');
const scoreResult = document.querySelector('#score-result');
const rollBtn = document.querySelector('#roll-btn');

let renderer, scene, camera, orbit, diceMesh, physicsWorld;

const params = {
    numberOfDice: 5,
    segments: 100,
    edgeRadius: .1,
    notchRadius: .12,
    notchDepth: .1,
};

let diceArray = [];
let stoped = [1, 1, 1, 1, 1]; // остановившиеся кубики
let numberOfDice = 5; // сколько кидаем кубов

initPhysics();
initScene();

window.addEventListener('resize', updateSceneSize);

function initScene() {
    renderer = new THREE.WebGLRenderer({
        alpha: true,
        antialias: true,
        canvas: canvasEl
    });
    renderer.shadowMap.enabled = true;
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, .1, 300)
    camera.position.set(-10, 21, 0);
    camera.lookAt(new THREE.Vector3(0, 0, 0));

    updateSceneSize();

    const ambientLight = new THREE.AmbientLight(0xffffff, .5);
    scene.add(ambientLight);
    const topLight = new THREE.PointLight(0x05BAF5, .5);
    topLight.position.set(10, 15, 10);
    topLight.castShadow = true;
    topLight.shadow.mapSize.width = 2048;
    topLight.shadow.mapSize.height = 2048;
    topLight.shadow.camera.near = 5;
    topLight.shadow.camera.far = 400;
    scene.add(topLight);

    //orbit = new MapControls(camera, canvasEl);
    //orbit.enableDamping = true;

    createFloor();
    diceMesh = createDiceMesh();
    for (let i = 0; i < params.numberOfDice; i++) {
        diceArray.push(createDice());
        addDiceEvents(diceArray[i], i);
    }

    //throwDice();
    putDice();
    render();
  
    requestAnimationFrame(render);
}

function initPhysics() {
    physicsWorld = new CANNON.World({
        allowSleep: true,
        gravity: new CANNON.Vec3(0, -70, 0),
    })
    physicsWorld.defaultContactMaterial.restitution = .1;
}

function createFloor() {
    let material = new THREE.MeshPhongMaterial({ color: 0x011925 });
    material.shininess = 20;
    const floor = new THREE.Mesh(
        new THREE.PlaneGeometry(1000, 1000),
        material
    );

    floor.receiveShadow = true;
    floor.position.y = -7;
    floor.quaternion.setFromAxisAngle(new THREE.Vector3(-1, 0, 0), Math.PI * .5);
    scene.add(floor);

    const floorBody = new CANNON.Body({
        type: CANNON.Body.STATIC,
        shape: new CANNON.Plane(),
    });
    floorBody.position.copy(floor.position);
    floorBody.quaternion.copy(floor.quaternion);
    physicsWorld.addBody(floorBody);
}

function createDiceMesh() {
    const boxMaterialOuter = new THREE.MeshStandardMaterial({
        color: 0xeeeeee,
    })
    const boxMaterialInner = new THREE.MeshStandardMaterial({
        color: 0x000000,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide
    })
    const boxMaterialInner15 = new THREE.MeshStandardMaterial({
        color: 0xff0000,
        roughness: 1,
        metalness: 0,
        side: THREE.DoubleSide
    })

    const diceMesh = new THREE.Group();
    const innerMesh = new THREE.Mesh(createInnerGeometry(), boxMaterialInner);
    const innerMesh15 = new THREE.Mesh(createInnerGeometry15(), boxMaterialInner15);
    const outerMesh = new THREE.Mesh(createBoxGeometry(), boxMaterialOuter);
    outerMesh.castShadow = true;
    diceMesh.add(innerMesh, innerMesh15, outerMesh);

    return diceMesh;
}

function createDice() {
    const mesh = diceMesh.clone();
    scene.add(mesh);

    const body = new CANNON.Body({
        mass: 1,
        shape: new CANNON.Box(new CANNON.Vec3(.5, .5, .5)),
        sleepTimeLimit: .1
    });
    physicsWorld.addBody(body);

    return {mesh, body};
}

function createBoxGeometry() {

    let boxGeometry = new THREE.BoxGeometry(1, 1, 1, params.segments, params.segments, params.segments);

    const positionAttr = boxGeometry.attributes.position;
    const subCubeHalfSize = .5 - params.edgeRadius;


    for (let i = 0; i < positionAttr.count; i++) {

        let position = new THREE.Vector3().fromBufferAttribute(positionAttr, i);

        const subCube = new THREE.Vector3(Math.sign(position.x), Math.sign(position.y), Math.sign(position.z)).multiplyScalar(subCubeHalfSize);
        const addition = new THREE.Vector3().subVectors(position, subCube);

        if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.normalize().multiplyScalar(params.edgeRadius);
            position = subCube.add(addition);
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.y) > subCubeHalfSize) {
            addition.z = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.y = subCube.y + addition.y;
        } else if (Math.abs(position.x) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.y = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.x = subCube.x + addition.x;
            position.z = subCube.z + addition.z;
        } else if (Math.abs(position.y) > subCubeHalfSize && Math.abs(position.z) > subCubeHalfSize) {
            addition.x = 0;
            addition.normalize().multiplyScalar(params.edgeRadius);
            position.y = subCube.y + addition.y;
            position.z = subCube.z + addition.z;
        }

        const notchWave = (v) => {
            v = (1 / params.notchRadius) * v;
            v = Math.PI * Math.max(-1, Math.min(1, v));
            return params.notchDepth * (Math.cos(v) + 1.);
        }
        const notch = (pos) => notchWave(pos[0]) * notchWave(pos[1]);

        const offset = .23;

        if (position.y === .5) {
            position.y -= notch([position.x, position.z]);
        } else if (position.x === .5) {
            position.x -= notch([position.y + offset, position.z + offset]);
            position.x -= notch([position.y - offset, position.z - offset]);
        } else if (position.z === .5) {
            position.z -= notch([position.x - offset, position.y + offset]);
            position.z -= notch([position.x, position.y]);
            position.z -= notch([position.x + offset, position.y - offset]);
        } else if (position.z === -.5) {
            position.z += notch([position.x + offset, position.y + offset]);
            position.z += notch([position.x + offset, position.y - offset]);
            position.z += notch([position.x - offset, position.y + offset]);
            position.z += notch([position.x - offset, position.y - offset]);
        } else if (position.x === -.5) {
            position.x += notch([position.y + offset, position.z + offset]);
            position.x += notch([position.y + offset, position.z - offset]);
            position.x += notch([position.y, position.z]);
            position.x += notch([position.y - offset, position.z + offset]);
            position.x += notch([position.y - offset, position.z - offset]);
        } else if (position.y === -.5) {
            position.y += notch([position.x + offset, position.z + offset]);
            position.y += notch([position.x + offset, position.z]);
            position.y += notch([position.x + offset, position.z - offset]);
            position.y += notch([position.x - offset, position.z + offset]);
            position.y += notch([position.x - offset, position.z]);
            position.y += notch([position.x - offset, position.z - offset]);
        }

        positionAttr.setXYZ(i, position.x, position.y, position.z);
    }


    boxGeometry.deleteAttribute('normal');
    boxGeometry.deleteAttribute('uv');
    boxGeometry = BufferGeometryUtils.mergeVertices(boxGeometry);

    boxGeometry.computeVertexNormals();

    return boxGeometry;
}

function createInnerGeometry() {
    const baseGeometry = new THREE.PlaneGeometry(1 - 2 * params.edgeRadius, 1 - 2 * params.edgeRadius);
    const offset = .48;
    return BufferGeometryUtils.mergeBufferGeometries([
        baseGeometry.clone().translate(0, 0, offset),
        baseGeometry.clone().translate(0, 0, -offset),
        baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, -offset, 0),
        //baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, offset, 0),
        //baseGeometry.clone().rotateY(.5 * Math.PI).translate(-offset, 0, 0),
        baseGeometry.clone().rotateY(.5 * Math.PI).translate(offset, 0, 0),
    ], false);
}

function createInnerGeometry15() {
    const baseGeometry = new THREE.PlaneGeometry(1 - 2 * params.edgeRadius, 1 - 2 * params.edgeRadius);
    const offset = .49;
    return BufferGeometryUtils.mergeBufferGeometries([
        //baseGeometry.clone().translate(0, 0, offset),
        //baseGeometry.clone().translate(0, 0, -offset),
        //baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, -offset, 0),
        baseGeometry.clone().rotateX(.5 * Math.PI).translate(0, offset, 0),
        baseGeometry.clone().rotateY(.5 * Math.PI).translate(-offset, 0, 0),
        //baseGeometry.clone().rotateY(.5 * Math.PI).translate(offset, 0, 0),
    ], false);
}

function addDiceEvents(dice, i) {
    dice.body.addEventListener('sleep', (e) => {
        dice.body.allowSleep = false;

        const euler = new CANNON.Vec3();
        e.target.quaternion.toEuler(euler);

        const eps = .1;
        let isZero = (angle) => Math.abs(angle) < eps;
        let isHalfPi = (angle) => Math.abs(angle - .5 * Math.PI) < eps;
        let isMinusHalfPi = (angle) => Math.abs(.5 * Math.PI + angle) < eps;
        let isPiOrMinusPi = (angle) => (Math.abs(Math.PI - angle) < eps || Math.abs(Math.PI + angle) < eps);


        if (isZero(euler.z)) {
            if (isZero(euler.x)) {
                stoped.push(1);
            } else if (isHalfPi(euler.x)) {
                stoped.push(4);
            } else if (isMinusHalfPi(euler.x)) {
                stoped.push(3);
            } else if (isPiOrMinusPi(euler.x)) {
                stoped.push(6);
            } else {
                // landed on edge => wait to fall on side and fire the event again
                dice.body.allowSleep = true;
            }
        } else if (isHalfPi(euler.z)) {
            stoped.push(2);
        } else if (isMinusHalfPi(euler.z)) {
            stoped.push(5);
        } else {
            // landed on edge => wait to fall on side and fire the event again
            dice.body.allowSleep = true;
        }
    });
  
    dice.body.addEventListener('collide', (e) => {
      if (i < numberOfDice) {
        const force = Math.abs(e.contact.getImpactVelocityAlongNormal());

        try {
          if (e.body.shapes[0] instanceof CANNON.Plane) {
            document.getElementById(`audiop${i}`).volume = Math.min(1, force/40);
            document.getElementById(`audiop${i}`).play();
          } else {
            document.getElementById(`audiod${i}`).volume = Math.min(0, force/40);
            document.getElementById(`audiod${i}`).play();          
          }
        }
        catch (e) {}
      }
    });
}

function render() {
    physicsWorld.fixedStep();

    for (const dice of diceArray) {
        dice.mesh.position.copy(dice.body.position);
        dice.mesh.quaternion.copy(dice.body.quaternion);
    }

    renderer.render(scene, camera);
    /*if (stoped.length === numberOfDice) {
      const id = setInterval(() => {
        if (stoped.length === 0) {
          clearInterval(id);
          requestAnimationFrame(render);
        }
      }, 10);
    } else*/
      setTimeout(()=>requestAnimationFrame(render), 20);
}

function updateSceneSize() {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
}

export default function throwDice(num, randoms) {
    if (!randoms) {
      randoms = [];
      for(let i = 0; i < diceArray.length; i++)
        randoms[i] = [Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random(), Math.random()];
    }

    numberOfDice = num;
    stoped = [];

     for(let dIdx = 0; dIdx < num; dIdx++) {
        let d = diceArray[dIdx];

        d.body.velocity.setZero();
        d.body.angularVelocity.setZero();

        d.body.position = new CANNON.Vec3(-10 + (randoms[dIdx][0]-0.5) * 3, 5 + (randoms[dIdx][1]-0.5) * 3, (randoms[dIdx][2]-0.5) * 3);
        d.mesh.position.copy(d.body.position);

        d.mesh.rotation.set(2 * Math.PI * randoms[dIdx][3], 2 * Math.PI * randoms[dIdx][4], 2 * Math.PI * randoms[dIdx][5])
        d.body.quaternion.copy(d.mesh.quaternion);

        let force = 8 + 1 * randoms[dIdx][6];
        d.body.applyImpulse(
            new CANNON.Vec3(2 * force, force, force),
            new CANNON.Vec3(0, 0, force / 60),
        );

        d.body.allowSleep = true;
    }
  
    for(let dIdx = num; dIdx < diceArray.length; dIdx++) {
        let d = diceArray[dIdx];
        d.body.velocity.setZero();
        d.body.angularVelocity.setZero();
        d.body.position = new CANNON.Vec3(-100, -7, -100);
        d.mesh.position.copy(d.body.position);
        d.mesh.rotation.set(0, 0, 0);
        d.body.quaternion.copy(d.mesh.quaternion);
    }
  
    return new Promise((resolve, reject) => {
      setTimeout(() => resolve(stoped), 5000);
      const id = setInterval(() => {
        if (stoped.length === num) {
          clearInterval(id);
          resolve(stoped);
        }
      }, 100);
    });
}

function putDice() {
    diceArray.forEach((d, dIdx) => {
        d.body.velocity.setZero();
        d.body.angularVelocity.setZero();

        d.body.position = new CANNON.Vec3(3 + (dIdx-2) * 2, -7, (dIdx-2) * 5);
        d.mesh.position.copy(d.body.position);

        d.mesh.rotation.set(0, 0, 0);
        d.body.quaternion.copy(d.mesh.quaternion);

        d.body.allowSleep = true;
    });
}