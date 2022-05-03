import * as THREE from 'three';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postProcessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postProcessing/RenderPass.js';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

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

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Keep track of loading =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const numberOfMeshesToLoad = 1;
let numberOfMeshesLoaded = 0, initFinished = false;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game State =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gameState = {
    curChunk: null,
    prevChunk: null,
    curPositionInChunk: null,
    prevPositionInChunk: null,
    curVelocity: null,
    prevVelocity: null,
    curAcceleration: null,
    prevAcceleration: null,
};
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Settings & Consts =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const chunkSize = 3.0;
const sqrtOfNumberOfLoadedChunks = 5;
const _SEED_ = '1';

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= debug gui =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gui = new dat.GUI();

const debugVars = {
    fov: 10,
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
    camera = new THREE.PerspectiveCamera( debugVars.fov, window.innerWidth / window.innerHeight, 0.01, 10 );
    camera.position.z = 1;

    controls = new OrbitControls( camera , renderer.domElement);

    controls.rotateSpeed = 0.3;
    controls.zoomSpeed = 0.9;

    controls.minDistance = 0.01;
    controls.maxDistance = 5;

    controls.minPolarAngle = 0; // radians
    controls.maxPolarAngle = Math.PI /2; // radians

    controls.enableDamping = true;
    controls.dampingFactor = 0.05;

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= post processing =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    postProcessing = {};
    renderPass = new RenderPass( scene, camera );
    postProcessing.composer = new EffectComposer( renderer );

    postProcessing.composer.addPass( renderPass );


    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= gameState =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    // integer position is used for corse grain colission detection & to avoid fp inaccuracies
    gameState.curChunk =  new THREE.Vector2(0,0);
    gameState.prevChunk = new THREE.Vector2(0,0);
    gameState.curPositionInChunk =  new THREE.Vector3(0.5, 0.5, 0.5);
    gameState.prevPositionInChunk = new THREE.Vector3(0.5, 0.5, 0.5);
    gameState.curVelocity =  new THREE.Vector3(0.0,0.0,0.0);
    gameState.prevVelocity = new THREE.Vector3(0.0,0.0,0.0);
    gameState.curAcceleration =  new THREE.Vector3(0.0,0.0,0.0);
    gameState.prevAcceleration = new THREE.Vector3(0.0,0.0,0.0);

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
    for(let i = 0; i < sqrtOfNumberOfLoadedChunks; ++i){
        for(let j = 0; j < sqrtOfNumberOfLoadedChunks; ++j){
            chunkGroup.add(createChunkMesh(i, j, _SEED_));
        }
    }
    chunkGroup.translateX((sqrtOfNumberOfLoadedChunks - 1) * chunkSize * -0.5);
    chunkGroup.translateZ((sqrtOfNumberOfLoadedChunks - 1) * chunkSize * -0.5);
    
    scene.add(chunkGroup);
}
function updateLoadedChunks(){
    // load new chunks based on position
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
function getNewChunkCoordinates(newX, newY, oldX, oldY, _sqrtOfNumberOfLoadedChunks){
    return [];
}
function getOldChunkCoordinates(newX, newY, oldX, oldY, _sqrtOfNumberOfLoadedChunks){
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
        emissive: 0x111111,
        map: textureLoader.load("/textures/seamless_concrete_by_agf81.jpeg"), 
        side: THREE.DoubleSide,
        wireframe: false,
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










// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= airplane model =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function loadAirplaneModel(){
    gltfLoader.load("/models/paper_airplane/scene.gltf", (gltf) => {
        //console.log(gltf);
        //gltf.scene.scale.set(0.05, 0.05, 0.05);
        //gltf.scene.position.set(1, 0, 0);

        // Apply Material to every Mesh imported from model
        /*gltf.scene.traverse((child) => {
            if (child instanceof THREE.Mesh) {
                child.material = shinyMaterial;
            }
        });
        */
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
    // timekeeping
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = elapsedTime - previousTime;
    previousTime = elapsedTime;

    // game logic
    airplaneParent.rotation.x = Math.sin(Math.PI * 0.5 + elapsedTime * 2 * Math.PI * 0.2) * 0.2; 
    airplaneParent.position.y = 0.3 + Math.sin(elapsedTime * 2 * Math.PI * 0.2) * 0.1;


    camera.setFocalLength(debugVars.fov);
    //pointLight.position.set(debugVars.px,debugVars.py,debugVars.pz);

    // update shader uniforms


    // update camera controls
    controls.update();

    // render
    postProcessing.composer.render( 0.1 );


    // Call tick again on the next frame
    window.requestAnimationFrame(tick);
};

// TODO: only start ticking after everything has loaded, show loading bar before that
