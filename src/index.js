import * as THREE from 'three';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postProcessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postProcessing/RenderPass.js';
import KeyboardState from './KeyboardState.js';

// import { ShaderPass } from 'three/examples/jsm/postProcessing/ShaderPass.js';
// import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'; 

document.body.style.margin = 0;
document.body.style.padding = 0;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Globals =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
let renderer, scene, camera,
    postProcessing, renderPass,
    chunkGroup, airplaneMesh, ibeamObj, ambientLight, directionalLight, box1Mesh, box2Mesh, box3Mesh,
    airplaneUp, airplaneSide,
    headingHelper, yawDeflectionHelper, pitchDeflectionHelper,
    clock, previousTime;

const fogColor = 0x6682e8;
const floorColor = 0xc7d0f0;
const ceilingColor = floorColor;
const ibeamColor = 0x2b3763;
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Loaders =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// Reused Loaded Assets 
let tileGeometry, tileMaterial;
let ceilingGeometry, ceilingMaterial;

const keyboard = new KeyboardState();

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Keep track of loading =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const numberOfMeshesToLoad = 3;
let numberOfMeshesLoaded = 0, initFinished = false;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game State =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// integer position is used for corse grain colission detection & to avoid fp inaccuracies
const gameState = {
    chunkCoordinate:      new THREE.Vector3(0,0,0), // (X COORDINATE, UNUSED, Z COORDINATE)
    prevChunkCoordinate:  new THREE.Vector3(0,0,0),
    positionInChunk:      new THREE.Vector3(0.0,0.5,0.0),
    heading:              new THREE.Vector3(0.0,0.0,1.0),
    velocity:             new THREE.Vector3(0.0,0.0,0.7),
    acceleration:         new THREE.Vector3(0.0,0.0,0.0),
    // TODO: change deflection vector to a pitch value and yaw value.
    deflection:           new THREE.Vector3(0.0,0.0,0.0), // (PITCH DEFLECTION, YAW DEFLECTION, UNUSED)
    deflectionSpeed:      new THREE.Vector3(0.0,0.0,0.0), // (PITCH DEFLECTION SPEED, YAW DEFLECTION SPEED, UNUSED)

    yawDeflection:        0.0,
    pitchDeflection:      0.0,
    yawDeflectionSpeed:   0.0,
    pitchDeflectionSpeed: 0.0,
    rollAngle:            0.0,
    rollSpeed:            0.0,
    boosting:             false,
};
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Settings & Consts =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const chunkSize = 10.0; // keep in mind, movement speed is tied to chunk size
const loadedChunksRadius = 15;
const _SEED_ = 23452345;

const zero = new THREE.Vector3(); // dont change this


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= debug gui =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
//const gui = new dat.GUI();

const debugVars = {
    fov: 15,
    px: 0,
    py: 0,
    pz: 0,
    airx: 0,
    airy: 0,
    airz: 0,
}

//gui.add(debugVars, "fov", 10, 150);
/*gui.add(debugVars, "px", -4, 4);
gui.add(debugVars, "py", -4, 4);
gui.add(debugVars, "pz", -4, 4);
*/

init();



function loadInitalChunks(){
    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Chunks =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 

    chunkGroup = new THREE.Group();
    for(let i = -loadedChunksRadius; i <= loadedChunksRadius; ++i){
        for(let j = -loadedChunksRadius; j <= loadedChunksRadius; ++j){
            chunkGroup.add(createChunkMesh(i, j, _SEED_));
        }
    }
    chunkGroup.translateX(0.5 * chunkSize);
    chunkGroup.translateZ(0.5 * chunkSize);
    
    scene.add(chunkGroup);
}
/** 
 * Loads new chunks based off of the players previous chunk and the chunk they have crossed into, unloads old chunks
 * 
 * **BUG**: chunks load and unload incorrectly when the player crosses into a chunk diagonally
 * 
 * **UNTESTED**: Chunks will not load correctly if the player crosses into another chunk that is not adjacent to their previous chunk
 */
function updateLoadedChunks(){

    // create new chunks based on new integer position & old integer position (answer "what chunks are to be added to the scene?")
    getHorizonChunkCoordinates(
        gameState.chunkCoordinate.x, 
        gameState.chunkCoordinate.z, 
        gameState.prevChunkCoordinate.x, 
        gameState.prevChunkCoordinate.z
    )
    .map(({x,z}) => chunkGroup.add(createChunkMesh(x,z)));

    // unload old chunks based on position
    getHorizonChunkCoordinates(
        gameState.prevChunkCoordinate.x, 
        gameState.prevChunkCoordinate.z,
        gameState.chunkCoordinate.x, 
        gameState.chunkCoordinate.z
    )
    .map(({x,z}) => chunkGroup.remove(chunkGroup.getObjectByName(chunkName(x,z))));

        // unload old chunks based off new integer position & old integer position
        // use .getObjectByName
        // and object.parent.remove( object );
        // https://stackoverflow.com/questions/56716008/removing-object-from-group-removes-object-from-scene
}
function chunkName(x,z){
    return `CH_${x}_${z}`;
}
/**
 * 
 * @param {Number} newX 
 * @param {Number} newZ 
 * @param {Number} oldX 
 * @param {Number} oldZ 
 * @returns {[{x,z}]} A list of chunk coordinates to load 
 * this function is dog shit
 */
function getHorizonChunkCoordinates(newX, newZ, oldX, oldZ){
    
    const coordList = [];

    // this will probably break if someone travels more than one chunk at a time
    let dx = Math.sign(newX - oldX);
    let dz = Math.sign(newZ - oldZ);

    // this could use a refactor
    if(newX !== oldX && newZ !== oldZ){
        for(let i = -loadedChunksRadius; i <= loadedChunksRadius; i++){
            coordList.push({x: newX + dx * loadedChunksRadius, z: newZ + i});

            if(i < loadedChunksRadius){
                coordList.push({x: newX + i, z: newZ + dz * loadedChunksRadius});
            }
        }
    }
    else if(newX !== oldX){
        for(let i = -loadedChunksRadius; i <= loadedChunksRadius; i++){
            coordList.push({x: newX + dx * loadedChunksRadius, z: newZ + i});
        }
    }
    else if(newZ !== oldZ){
        for(let i = -loadedChunksRadius; i <= loadedChunksRadius; i++){
            coordList.push({x: newX + i, z: newZ + dz * loadedChunksRadius});
        }
    }
    else{
        console.error('getHorizonChunkCoordinates() was called with the same coordinates');
        throw{};
    }
    //console.log(coordList);
    return coordList;
}

function createChunkMesh(x, z){
    // https://threejs.org/docs/#examples/en/geometries/TextGeometry
    // use this for instructions and some numbers on beams and stuff. lables should be a1, a2, a3, then get cryptic like "k?", "??" "00" "NO" "GO" 
    const chunkMesh = new THREE.Group();
    chunkMesh.name = chunkName(x,z);
    const ceilingHeight = 7.0;

    // changes to the world (exploded boxes for example) will be stored in a hash table

    // create floor tile
    const tileMesh = new THREE.Mesh( tileGeometry, tileMaterial );
    tileMesh.position.x = x * chunkSize;
    tileMesh.position.z = z * chunkSize;
    tileMesh.rotateX(Math.PI * 0.5);
    chunkMesh.add(tileMesh);

    // create ceiling
    const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial );
    ceilingMesh.position.x = x * chunkSize;
    ceilingMesh.position.z = z * chunkSize;
    ceilingMesh.position.y = ceilingHeight;
    ceilingMesh.rotateX(Math.PI * 1.5);
    chunkMesh.add(ceilingMesh);


    // create i-beam
    if( true ){ // ?
        const ibeamInstance = ibeamObj.clone();
        ibeamInstance.position.x = x * chunkSize;
        ibeamInstance.position.z = z * chunkSize;
        ibeamInstance.position.y += 4.2;
        chunkMesh.add(ibeamInstance);
    }
    // place, stack, & rotate boxes
        // each chunk has between 0 and 20 boxes, but anything over like 7 should be quite rare
    let box1 = box1Mesh.clone();
    
    box1.position.x = (x + 0.3) * chunkSize;
    box1.position.z = (z + 0.55) * chunkSize;
    const boxScale = 1.0;
    box1.scale.set(boxScale,boxScale,boxScale);

    chunkMesh.add(box1);
    
    return chunkMesh;
}


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= airplane model =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function loadAirplaneModel(){
    gltfLoader.load("/models/paper_airplane/scene.gltf", (gltf) => {
        let airplaneGeometry = gltf.scene.children[0].children[0].children[0].children[0].children[0].geometry; //lmao
        // https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
        let airplaneMaterial = new THREE.MeshStandardMaterial({
            map: textureLoader.load("models/paper_airplane/textures/papier_baseColor.jpeg"),
            //emissive: 0xffffff,
            side:  THREE.DoubleSide,
            color: 0xccccff,
        });
        //airplaneGeometry.center();
        airplaneMesh = new THREE.Mesh( airplaneGeometry, airplaneMaterial );
        scene.add(airplaneMesh);
        meshLoaded();
    });
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= I-Beam model =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function loadIbeamModel(){
    gltfLoader.load("models/painted_i-beam/scene.gltf", (gltf) => {
        let ibeamGeometry = gltf.scene.children[0].children[0].children[0].children[0].geometry;
        const ibeamScale = 0.02;

        function onLoad(tex){
            tex.offset.set(0.0,0.0);
            //tex.rotation = Math.PI * -0.5
        }
        // https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
        let ibeamMaterial = new THREE.MeshStandardMaterial({
            map: textureLoader.load("textures/seamless_metal_texture_by_hhh316.jpeg", onLoad),
            //map: textureLoader.load("models/painted_i-beam/textures/T_IBeam_baseColor.png", onLoad),
            //normalMap: textureLoader.load("models/painted_i-beam/textures/T_IBeam_normal.png"),
            //metalnessMap: textureLoader.load("models/painted_i-beam/textures/T_IBeam_normal.png"),
            //metalness: 0.0, // value is multiplied by metalnessMap
            color: ibeamColor,
            //emissive: 0x000000,
            depthTest: true,
            depthWrite: true,
            side: THREE.DoubleSide
        });
        

        let ibeamMesh = new THREE.Mesh(ibeamGeometry, ibeamMaterial);
        ibeamObj = new THREE.Object3D();
        ibeamObj.add(ibeamMesh);
        ibeamObj.scale.set(ibeamScale, ibeamScale, ibeamScale);
        ibeamObj.rotateX( Math.PI * 0.5);
        meshLoaded();
    });
}

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= box models =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function loadBoxModel(){
    gltfLoader.load("models/cardboard_boxes/scene.gltf", (gltf) => {
        console.log('boxes', gltf.scene.children[0].children[0].children[0].children);
        box1Mesh = gltf.scene.children[0].children[0].children[0].children[0];
        box1Mesh.removeFromParent();
        box2Mesh = gltf.scene.children[0].children[0].children[0].children[1];
        box2Mesh.removeFromParent();
        box3Mesh = gltf.scene.children[0].children[0].children[0].children[2];
        //box3Mesh.removeFromParent();
        /*const ibeamScale = 0.02;

        ibeamObj.scale.x = ibeamScale;
        ibeamObj.scale.y = ibeamScale;
        ibeamObj.scale.z = ibeamScale;

        // NEED THESE TO CENTER THE AIRPLANE MESH
        //ibeamObj.scale.set(new THREE.Vector3(1.0,1.0,1.0));
        //ibeamObj.mesh.geometry.scale(0.5);
        ibeamObj.rotateX( Math.PI * 0.5);
        ibeamObj.translateX(0.0);
        ibeamObj.translateY(4.15);
        ibeamObj.translateZ(0.0);

        // https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
        ibeamObj.material = new THREE.MeshStandardMaterial({
            map: textureLoader.load("models/painted_i-beam/textures/T_IBeam_baseColor.png"),
            normalMap: textureLoader.load("models/painted_i-beam/textures/T_IBeam_normal.png"),
            metalnessMap: textureLoader.load("models/painted_i-beam/textures/T_IBeam_normal.png"),
            metalness: 0.75, // value is multiplied by metalnessMap
            color: 0xeeeeee,
        });

        ibeamObj = new THREE.Group();
        ibeamObj.add(ibeamObj);
        meshLoaded();
        */
        meshLoaded();
    });
}



function init(){

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Window =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= scene =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    scene = new THREE.Scene();
    scene.background = new THREE.Color(fogColor);
    scene.fog = new THREE.Fog(fogColor, chunkSize * loadedChunksRadius * 0.25, chunkSize * loadedChunksRadius );

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= camera =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    camera = new THREE.PerspectiveCamera( 30.0, window.innerWidth / window.innerHeight, 0.01, 4000);

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Singleton Assets =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    tileGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
    tileMaterial = new THREE.MeshStandardMaterial({
        color: floorColor, 
        map: textureLoader.load("/textures/seamless_concrete_by_agf81.jpeg"), 
        side: THREE.DoubleSide,
        wireframe: false,
    });

    ceilingGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
    ceilingMaterial = new THREE.MeshStandardMaterial({
        color: ceilingColor, 
        map: textureLoader.load("/textures/8575-v7.jpeg"), 
        side: THREE.DoubleSide,
        wireframe: false,
    });

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= post processing =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    postProcessing = {};
    renderPass = new RenderPass( scene, camera );
    postProcessing.composer = new EffectComposer( renderer );
    postProcessing.composer.addPass( renderPass );




    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= GLobal Lighting =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 
    directionalLight = new THREE.DirectionalLight(0xffaa11, 0.8);
    ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    directionalLight.position.set( 0, 0, 5 ).normalize();
    //scene.add(directionalLight);
    scene.add(ambientLight);

    loadIbeamModel();
    loadBoxModel();

    loadAirplaneModel();
    

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Prep Main Loop =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    clock = new THREE.Clock();
    previousTime = 0;

    initFinished = true;
    tryStarting();
};
function tryStarting(){
    if(initFinished && numberOfMeshesLoaded == numberOfMeshesToLoad){
        loadInitalChunks();
        tick();
    }
}
function meshLoaded(){
    numberOfMeshesLoaded++;
    tryStarting();
}

function tick(){

    // request another frame
    window.requestAnimationFrame(tick);

    // timekeeping
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = elapsedTime - previousTime;
    previousTime = elapsedTime;

    keyboard.update();

    // translate keyboard inputs into game inputs (skipping this step for now lol)

    applyInputsToState();

    updateGameState(deltaTime);

    applyStateToCharModel(elapsedTime);

    
    camera.position.copy(airplaneMesh.position.clone().addScaledVector(gameState.heading, -2));
    camera.position.setY(camera.position.y + 0.3);

    camera.lookAt(airplaneMesh.position);

    // render
    postProcessing.composer.render( 0.1 );
};
function applyInputsToState(){

    const baseDeflectionSpeed = 0.1;
    const baseRollSpeed = 1.7;

    gameState.yawDeflectionSpeed = 0.0;
    gameState.pitchDeflectionSpeed = 0.0; 
    gameState.rollSpeed = 0.0;
    gameState.boosting = keyboard.pressed("space") ? true : false;

    // translate game inputs into changes onto game state
    if(keyboard.pressed("up")    || keyboard.pressed("W"))
        gameState.pitchDeflectionSpeed += baseDeflectionSpeed; 
    if(keyboard.pressed("down")  || keyboard.pressed("S"))
        gameState.pitchDeflectionSpeed -= baseDeflectionSpeed;
    if(keyboard.pressed("left")  || keyboard.pressed("A"))
        gameState.yawDeflectionSpeed   += baseDeflectionSpeed;
    if(keyboard.pressed("right") || keyboard.pressed("D"))
        gameState.yawDeflectionSpeed   -= baseDeflectionSpeed;

    if(keyboard.pressed("E"))
        gameState.rollSpeed += baseRollSpeed;    
    if(keyboard.pressed("Q"))
        gameState.rollSpeed -= baseRollSpeed;
}
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Logic =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function updateGameState(dt){
    const epsilon = 0.00001;
    const dragCoefficent = -0.1;
    const liftFactor = 0.004; // what portion of speed becomes lift
    const gravity = new THREE.Vector3(0, -0.02, 0);
    const pitchDeflectionCoefficent = 0.009;
    const yawDeflectionCoefficent = 0.005;
    const boostAcceleration = 1.0;

    const maxYawDeflection = 0.5;
    const maxPitchDeflection = 0.5;
    const deflectionAttenuationRate = -0.7; // how fast do the deflections return to 0
    const rollAttenuationRate = 0.3;

    // apply roll and deflection speeds to their positions
    gameState.rollAngle += gameState.rollSpeed * dt;
    gameState.yawDeflection += gameState.yawDeflectionSpeed * dt;
    gameState.pitchDeflection += gameState.pitchDeflectionSpeed * dt;

    // clamp roll angle and deflections
    // TODO: refactor this with clamp
    // clamp roll angle if we want to attenuate it (this would be better with quaternions)
    /*
    if(gameState.rollAngle <= -1.0 * Math.PI * 2){
        gameState.rollAngle -= Math.PI * 2;
    }
    if(gameState.rollAngle >=  Math.PI * 2){
        gameState.rollAngle += Math.PI * 2;
    }
    if(Math.abs(gameState.deflection.y) > maxYawDeflection){
        gameState.deflection.setY(Math.sign(gameState.deflection.y) * maxYawDeflection);
    }
    if(Math.abs(gameState.deflection.x) > maxPitchDeflection){
        gameState.deflection.setX(Math.sign(gameState.deflection.x) * maxPitchDeflection);
    }
    */

    // attenuate roll TODO: change roll to quaternion so we dont have to deal with all the edge cases
    /*if(Math.abs(gameState.rollAngle) <= rollAttenuationRate * dt) 
        gameState.rollAngle = 0;
    else gameState.rollAngle -= Math.sign(gameState.rollAngle) * dt * rollAttenuationRate;
    */

    // attenuate deflections
    //gameState.deflection.addScaledVector(gameState.deflection, dt * deflectionAttenuationRate); // TODO: change deflections to have a linear attenuation (it is currently asymptotic) or get rid of it

    // apply acceleration
    gameState.velocity.addScaledVector(gameState.acceleration, dt); // this is unused?

    // apply drag
    gameState.velocity.addScaledVector(gameState.velocity, dragCoefficent * dt );

    // apply boost
    if(gameState.boosting){
        gameState.velocity.addScaledVector(gameState.heading, boostAcceleration * dt);
    }
    
    // apply gravity
    gameState.velocity.addScaledVector(gravity, dt);

    // set airplane side vector
    airplaneSide = new THREE.Vector3(0,1,0);
    airplaneSide.cross(gameState.heading);
    airplaneSide.normalize();
    airplaneSide.applyAxisAngle(gameState.heading, gameState.rollAngle);
    
    // set airplane up vector
    airplaneUp = new THREE.Vector3(0,1,0);
    airplaneUp.cross(gameState.heading);
    airplaneUp.normalize();
    airplaneUp.applyAxisAngle(gameState.heading, gameState.rollAngle + Math.PI * 0.5);

    //apply deflections to velocity TODO: look into making these quaternion rotations
    let magnitude = gameState.velocity.distanceTo(zero);
    gameState.velocity.addScaledVector(airplaneSide, gameState.yawDeflection   * yawDeflectionCoefficent  );
    gameState.velocity.addScaledVector(airplaneUp,   gameState.pitchDeflection * pitchDeflectionCoefficent);
    gameState.velocity.setLength(magnitude);

    // set heading... TODO: make heading approach velocity or get rid of it
    gameState.heading = gameState.velocity.clone().normalize();

    // apply lift (lift is upward force from forward velocity)
    gameState.velocity.addScaledVector(airplaneUp, liftFactor * gameState.velocity.distanceTo(zero) * dt);

    // apply minimum speed 
    if(gameState.velocity.distanceToSquared(zero) < epsilon && gameState.acceleration.distanceToSquared(zero) < epsilon){
        gameState.velocity.set(0.0,0.0,0.0);
    }

    // apply speed to position
    gameState.positionInChunk.addScaledVector(gameState.velocity, dt);

    const xBoundaryCrossed = gameState.positionInChunk.x >= 1.0 || gameState.positionInChunk.x <  0.0;
    const zBoundaryCrossed = gameState.positionInChunk.z >= 1.0 || gameState.positionInChunk.z <  0.0;

    // check if we have crossed a chunk boundary
    if( zBoundaryCrossed || xBoundaryCrossed ){

        // save prev coordinates
        gameState.prevChunkCoordinate = gameState.chunkCoordinate.clone();

        // update chunk coordinates
        gameState.chunkCoordinate.add(gameState.positionInChunk.clone().floor());
        gameState.chunkCoordinate.y = 0.0; // disregard y chunk coordinate value. this lets us simply add the chunkCoordinate and positionInChunk vectors to get the world space vector
    
        updateLoadedChunks();
    }

    // if needed, calc new positions within chunk
    if(zBoundaryCrossed){
        // if greater than one, subtract one. if less than 1, add 1
        gameState.positionInChunk.z -= Math.sign(gameState.positionInChunk.z);
    }
    if(xBoundaryCrossed){
        gameState.positionInChunk.x -= Math.sign(gameState.positionInChunk.x);
    }
}

// apply updated game state to the airplane model, i.e. set position, pitch, yaw, roll & deflection
function applyStateToCharModel(){

    // set position
    let airplanePosition = gameState.positionInChunk.clone();
    airplanePosition.add(gameState.chunkCoordinate);
    airplanePosition.multiplyScalar(chunkSize);
    airplaneMesh.position.copy(airplanePosition); 

    // reset orientation
    airplaneMesh.setRotationFromAxisAngle(new THREE.Vector3(0,1,0), 0.0);

    // apply heading
    airplaneMesh.lookAt(airplaneMesh.position.clone().addScaledVector(gameState.heading, -1)); 

    // heading visualizer
    if(headingHelper) headingHelper.removeFromParent(); 
    headingHelper = new THREE.ArrowHelper( gameState.heading, airplaneMesh.position, 1.0, 0xff0000 );
    scene.add( headingHelper );

    // yaw deflection visualizer
    if(yawDeflectionHelper) yawDeflectionHelper.removeFromParent();
    yawDeflectionHelper = new THREE.ArrowHelper( airplaneSide, airplaneMesh.position, gameState.yawDeflection, 0x00ff00 );
    scene.add( yawDeflectionHelper );
    
    // pitch deflection visualizer
    if(pitchDeflectionHelper) pitchDeflectionHelper.removeFromParent();
    pitchDeflectionHelper = new THREE.ArrowHelper( airplaneUp, airplaneMesh.position, gameState.pitchDeflection, 0x0000ff );
    scene.add( pitchDeflectionHelper );
    
    // apply roll
    let rollQuaternion = new THREE.Quaternion();
    rollQuaternion.setFromAxisAngle( gameState.heading.clone().normalize(), gameState.rollAngle);
    airplaneMesh.applyQuaternion(rollQuaternion);

    // apply deflection (animation)
        // weighted average between curState & prevFrame (dt prob needs to be involved here)
}

function applyStateToCamera(){

    // have camera follow airplane
}