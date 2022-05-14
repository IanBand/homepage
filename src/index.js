import * as THREE from 'three';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postProcessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postProcessing/RenderPass.js';
import KeyboardState from './KeyboardState.js';
import { Vector3 } from 'three';

// import { ShaderPass } from 'three/examples/jsm/postProcessing/ShaderPass.js';
// import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'; 

document.body.style.margin = 0;
document.body.style.padding = 0;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Globals =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
let renderer, scene, camera,
    postProcessing, renderPass,
    chunkGroup, airplaneMesh, ibeamObj, ambientLight, directionalLight, box1Mesh, box2Mesh, box3Mesh,
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
    chunkCoordinate:     new THREE.Vector3(0,0,0), // ONLY THE X AND Z VALUES ARE USED,
    prevChunkCoordinate: new THREE.Vector3(0,0,0),
    positionInChunk:     new THREE.Vector3(0.0, 0.3, 0.0),
    heading:           new THREE.Vector3(0.0,0.0,1.0),
    velocity:            new THREE.Vector3(0.0,0.0,0.0),
    acceleration:        new THREE.Vector3(0.0,0.0,0.0),
    deflection:          new THREE.Vector2(0.0,0.0), // (VERTICAL DEFLECTION, HORIZONTAL DEFLECTION)
    rollAngle:           0.0,
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
    const ceilingHeight = 4.0;

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

    // translate game inputs into changes onto game state
    if(keyboard.pressed("up"))
        gameState.acceleration.z = -0.1 // / chunkSize;
    else if(keyboard.pressed("down"))
        gameState.acceleration.z = 0.1 // / chunkSize;
    else
        gameState.acceleration.z = 0.0;

    if(keyboard.pressed("left"))
        gameState.acceleration.x = -0.1 // / chunkSize;
    else if(keyboard.pressed("right"))
        gameState.acceleration.x = 0.1 // / chunkSize;
    else
        gameState.acceleration.x = 0.0;

    

    updateGameState(deltaTime);

    applyStateToCharModel(elapsedTime);



    let relativeCameraOffset = new THREE.Vector3(
        0.0,
        0.0,//Math.sin(elapsedTime * 2 * Math.PI * 0.1) * 0.03,
        2.0
    );


    let cameraOffset = relativeCameraOffset.applyMatrix4( airplaneMesh.matrixWorld ); // matrixWorld has been rotated?

    cameraOffset.setY(cameraOffset.y + 0.3);
    
    camera.position.copy(cameraOffset);

    camera.lookAt(airplaneMesh.position);


    // render
    postProcessing.composer.render( 0.1 );

};

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Logic =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function updateGameState(dt){
    const epsilon = 0.001;
    const dragCoefficent = -0.1;
    const gravity = new THREE.Vector3(0, -0.5, 0);

    // apply acceleration
    gameState.velocity.addScaledVector(gameState.acceleration, dt);

    // apply drag
    gameState.velocity.addScaledVector(gameState.velocity, dragCoefficent * dt );

    // apply gravity
    //gameState.velocity.addScaledVector(gravity, dt);
    
    // apply minimum speed 
    if(gameState.velocity.distanceToSquared(zero) < epsilon && gameState.acceleration.distanceToSquared(zero) < epsilon){
        gameState.velocity.set(0.0,0.0,0.0);

    }

    // calculate heading
    if(gameState.velocity.distanceToSquared(zero) >= epsilon){
        // TODO: Add lag 
        gameState.heading.copy(gameState.velocity.clone().normalize());
    }
    

    // apply speed to position
    gameState.positionInChunk.addScaledVector(gameState.velocity, dt);

    const xBoundaryCrossed = gameState.positionInChunk.x >= 1.0 || gameState.positionInChunk.x <  0.0;
    const zBoundaryCrossed = gameState.positionInChunk.z >= 1.0 || gameState.positionInChunk.z <  0.0;

    // check if we have crossed a chunk boundary
    if( zBoundaryCrossed || xBoundaryCrossed ){
        //console.log('xz boundary crossed')
        
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
function applyStateToCharModel(elapsedTime){

    
    // set position
    let airplanePosition = gameState.positionInChunk.clone();
    airplanePosition.add(gameState.chunkCoordinate);
    airplanePosition.multiplyScalar(chunkSize);
    airplaneMesh.position.set(
        airplanePosition.x, 
        airplanePosition.y, 
        airplanePosition.z
    );

    // reset orientation
    airplaneMesh.setRotationFromAxisAngle(new THREE.Vector3(0,1,0), 0.0);

    // apply heading
    // let headingQuaternion = new THREE.Quaternion();
    // console.log(gameState.velocity.clone().normalize());
    // headingQuaternion.setFromAxisAngle(gameState.velocity.clone().normalize(), Math.PI * 0.0);
    airplaneMesh.lookAt(airplaneMesh.position.clone().addScaledVector(gameState.heading, -1)); 
    //airplaneMesh.applyQuaternion(headingQuaternion);

    // apply roll
    gameState.rollAngle = Math.sin(elapsedTime * 1.7 * Math.PI) * 0.3;
    let rollQuaternion = new THREE.Quaternion();


    rollQuaternion.setFromAxisAngle( /*new THREE.Vector3( 0, 0, 1 )*/ gameState.heading.clone().normalize(), gameState.rollAngle);
    airplaneMesh.applyQuaternion(rollQuaternion);
    //airplaneMesh.setRotationFromAxisAngle(gameState.heading.clone().normalize(), gameState.rollAngle); // this dun work


    // apply yaw (additional angle relative to heading)

    // apply pitch


    // apply deflection (animation)
        // weighted average between curState & prevFrame (dt prob needs to be involved here)


    //airplaneMesh.setRotationFromAxisAngle(gameState.heading, gameState.rollAngle); // sets quaternion
    //airplaneMesh.setRotationFromAxisAngle(airplaneMesh.position.clone().addScaledVector(gameState.heading, -1).normalize(), gameState.rollAngle); // sets quaternion


    //if(gameState.velocity.distanceToSquared(zero) > 0.01){
    //    airplaneMesh.lookAt(airplaneMesh.position.clone().addScaledVector(gameState.heading, -1)); 
    //}
}

function applyStateToCamera(){

    // have camera follow airplane
}