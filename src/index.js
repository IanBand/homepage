import * as THREE from 'three';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postProcessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postProcessing/RenderPass.js';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import KeyboardState from './KeyboardState.js';


// import { ShaderPass } from 'three/examples/jsm/postProcessing/ShaderPass.js';
// import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'; 

document.body.style.margin = 0;
document.body.style.padding = 0;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Globals =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
let renderer, scene, camera, controls,
    postProcessing, renderPass,
    chunkGroup, airplaneParent, ambientLight, directionalLight,
    clock, previousTime;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Loaders =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

const keyboard = new KeyboardState();

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Keep track of loading =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const numberOfMeshesToLoad = 1;
let numberOfMeshesLoaded = 0, initFinished = false;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game State =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gameState = {
    chunkCoordinate: null,
    prevChunkCoordinate: null,
    positionInChunk: null,
    velocity: null,
    acceleration: null,
};
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Settings & Consts =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const chunkSize = 3.0;
const loadedChunksRadius = 3; // MUST BE ODD FOR NOW... TODO: CHANGE TO RADIUS
const _SEED_ = '1';

const zero = new THREE.Vector3(); // dont change this

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= debug gui =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gui = new dat.GUI();

const debugVars = {
    fov: 15,
    px: 0,
    py: 0,
    pz: 0,
    airx: 0,
    airy: 0,
    airz: 0,
}

gui.add(debugVars, "fov", 10, 150);
/*gui.add(debugVars, "px", -4, 4);
gui.add(debugVars, "py", -4, 4);
gui.add(debugVars, "pz", -4, 4);
*/

init();


function init(){

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Window =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= scene =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x2c2d70);

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= camera =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    camera = new THREE.PerspectiveCamera( debugVars.fov, window.innerWidth / window.innerHeight, 0.01, 100 );
    camera.position.y = 25.0;

    controls = new OrbitControls( camera , renderer.domElement);

    controls.rotateSpeed = 0.3;
    controls.zoomSpeed = 0.9;

    controls.minDistance = 0.01;
    controls.maxDistance = 50;

    controls.minPolarAngle = 0; // radians
    controls.maxPolarAngle = Math.PI * 0.5; // radians

    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= post processing =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    postProcessing = {};
    renderPass = new RenderPass( scene, camera );
    postProcessing.composer = new EffectComposer( renderer );
    postProcessing.composer.addPass( renderPass );


    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= gameState =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    // integer position is used for corse grain colission detection & to avoid fp inaccuracies
    gameState.chunkCoordinate =  new THREE.Vector3(0,0,0); // ONLY THE X AND Z VALUES ARE USED
    gameState.prevChunkCoordinate = new THREE.Vector3(0,0,0);
    gameState.positionInChunk =  new THREE.Vector3(0.5, 0.5, 0.5);
    gameState.velocity =  new THREE.Vector3(0.0,0.0,0.0);
    gameState.acceleration =  new THREE.Vector3(0.0,0.0,0.0);

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= GLobal Lighting =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 
    directionalLight = new THREE.DirectionalLight(0xffaa11, 0.8);
    ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    directionalLight.position.set( 0, 0, 5 ).normalize();
    scene.add(directionalLight);
    scene.add(ambientLight);


    loadInitalChunks();

    loadAirplaneModel();

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Prep Main Loop =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    clock = new THREE.Clock();
    previousTime = 0;

    initFinished = true;
    tryStarting();
};
function tryStarting(){
    if(initFinished && numberOfMeshesLoaded == numberOfMeshesToLoad){
        tick();
    }
}
function meshLoaded(){
    numberOfMeshesLoaded++;
    tryStarting();
}

function loadInitalChunks(){
    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Chunks =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 

    chunkGroup = new THREE.Group();
    for(let i = -loadedChunksRadius; i < loadedChunksRadius; ++i){
        for(let j = -loadedChunksRadius; j < loadedChunksRadius; ++j){
            chunkGroup.add(createChunkMesh(i, j, _SEED_));
        }
    }
    chunkGroup.translateX(0.5 * chunkSize);
    chunkGroup.translateZ(0.5 * chunkSize);
    
    scene.add(chunkGroup);
}
function updateLoadedChunks(){

    //console.log('=-=-=-=-=-=--==-=-=-=-=--=')
    //console.log(gameState.prevChunkCoordinate);
    //console.log(gameState.chunkCoordinate);

    // load new chunks based on position

    
    getNewChunkCoordinates(
        gameState.chunkCoordinate.x, 
        gameState.chunkCoordinate.z, 
        gameState.prevChunkCoordinate, 
        gameState.prevChunkCoordinate, 
        loadedChunksRadius
    );
        // create new chunks based on new integer position & old integer position (answer "what chunks are to be added to the scene?")
        // each chunk will have its name be based off its x and y coordinate "x_y"

    // unload old chunks based on position
        // unload old chunks based off new integer position & old integer position
        // use .getObjectByName
        // and object.parent.remove( object );
        // https://stackoverflow.com/questions/56716008/removing-object-from-group-removes-object-from-scene
}
function chunkName(a,b){
    return `CH_${a}_${b}`;
}
function getNewChunkCoordinates(newX, newZ, oldX, oldZ, _loadedChunksRadius){

    const loadedChunksRadius = (_loadedChunksRadius - 1) / 2;
    const coordList = [];

    let dX = newX = oldX;
    let dz = newZ - oldZ;
    // (dX, dZ) is our chunk change direction vector

    if(newX === oldX + 1){

        for(let i = loadedChunksRadius * -1; i < loadedChunksRadius; i++){
            coordList.push({x: newX + loadedChunksRadius, z: newZ + i});
        }
        
    }

    for(let i = loadedChunksRadius * -1; i < loadedChunksRadius; i++){
        for(let j = loadedChunksRadius * -1; j < loadedChunksRadius; j++){
            
        }
    }

    //console.log(coordList);
    return coordList;
}
function getOldChunkCoordinates(newX, newZ, oldX, oldZ, _loadedChunksRadius){
    return [];
}

function createChunkMesh(x, z, seed){
    const chunkMesh = new THREE.Group();
    chunkMesh.name = chunkName(x,z);

    // changes to the world (exploded boxes for example) will be stored in a hash table

    // create floor tile
    const tileGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
    const tileMaterial = new THREE.MeshStandardMaterial({
        color: 0x13293d, 
        emissive: 0x000000,
        map: textureLoader.load("/textures/seamless_concrete_by_agf81.jpeg"), 
        side: THREE.DoubleSide,
        wireframe: true,
    });
    const tileMesh = new THREE.Mesh( tileGeometry, tileMaterial );
    tileMesh.position.x = x * chunkSize;
    tileMesh.position.z = z * chunkSize;
    tileMesh.rotateX(Math.PI * 0.5);
    chunkMesh.add(tileMesh);

    // create i-beam
        // only every 3rd chunk has a support beam
        // if(x and z something something)
        //  make the i beam

    // create point light
        // only every 3rd chunk has a light
        // some lights are flickering
        // some lights are out

    // place, stack, & rotate boxes
        // each chunk has between 0 and 20 boxes, but anything over like 7 should be quite rare
    
    return chunkMesh;
}



// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Logic =-=-=-=-=-=-=-=-=-=-=-=-=-=-=

function updateGameState(dt){

    

    // apply acceleration
    gameState.velocity.addScaledVector(gameState.acceleration, dt);

    // apply drag
    gameState.velocity.addScaledVector(gameState.velocity, -0.01/* DRAG COEFFICENT */ );
    
    //console.log(gameState.velocity);
    // apply minimum speed 
    if(gameState.velocity.distanceToSquared(zero) < 0.001 && gameState.acceleration.distanceToSquared(zero) < 0.001){
        gameState.velocity.set(0.0,0.0,0.0);

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


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= airplane model =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function loadAirplaneModel(){
    gltfLoader.load("/models/paper_airplane/scene.gltf", (gltf) => {
        let airplaneMesh = gltf.scene.children[0];

        // NEED THESE TO CENTER THE AIRPLANE MESH
        airplaneMesh.translateX(0.8);
        airplaneMesh.translateY(0.1);
        airplaneMesh.translateZ(0);

        // https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
        airplaneMesh.material = new THREE.MeshStandardMaterial({
            map: textureLoader.load("models/paper_airplane/textures/papier_baseColor.jpeg"),
            //emissive: 0xffffff,
            color: 0xcccccc,
        });

        airplaneParent = new THREE.Group();
        airplaneParent.add(airplaneMesh);
        scene.add(airplaneParent);
        meshLoaded();
    });
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
        gameState.acceleration.z = -0.5;
    else if(keyboard.pressed("down"))
        gameState.acceleration.z = 0.5;
    else
        gameState.acceleration.z = 0.0;

    if(keyboard.pressed("left"))
        gameState.acceleration.x = -0.5;
    else if(keyboard.pressed("right"))
        gameState.acceleration.x = 0.5;
    else
        gameState.acceleration.x = 0.0;

    

    updateGameState(deltaTime);


    // apply updated game state to scene
    
    let airplanePosition = gameState.positionInChunk.clone();
    airplanePosition.add(gameState.chunkCoordinate);
    airplanePosition.multiplyScalar(chunkSize);
    airplaneParent.position.set(
        airplanePosition.x, 
        airplanePosition.y, 
        airplanePosition.z
    );
    //airplaneParent.position.y += 0.3 + Math.sin(elapsedTime * 2 * Math.PI * 0.2) * 0.1;
    //airplaneParent.rotation.x = Math.sin(Math.PI * 0.5 + elapsedTime * 2 * Math.PI * 0.2) * 0.2; 



    if(gameState.velocity.distanceToSquared(zero) > 0.01){
        airplaneParent.lookAt(airplaneParent.position.clone().addScaledVector(gameState.velocity, -1));
    }
    
    




    camera.setFocalLength(debugVars.fov);
    //pointLight.position.set(debugVars.px,debugVars.py,debugVars.pz);

    // update shader uniforms


    // update camera controls
    controls.update();

    // render
    postProcessing.composer.render( 0.1 );

};

// TODO: only start ticking after everything has loaded, show loading bar before that
