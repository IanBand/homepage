import * as THREE from 'three';
import * as MathUtils from 'three/src/math/MathUtils.js';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postProcessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postProcessing/RenderPass.js';
import KeyboardState from './KeyboardState.js';
//import seedrandom from 'seedrandom';
import {ImprovedNoise} from 'three/examples/jsm/math/ImprovedNoise.js'

// import { ShaderPass } from 'three/examples/jsm/postProcessing/ShaderPass.js';
// import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'; 

document.body.style.margin = 0;
document.body.style.padding = 0;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Globals =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
let renderer, scene, camera,
    postProcessing, renderPass,
    chunkGroup, airplaneMesh, ibeamObj, ambientLight, directionalLight, box1Mesh, box2Mesh, box3Mesh, wake1Obj,
    airplaneUp, airplaneSide,
    headingHelper, yawDeflectionHelper, pitchDeflectionHelper, heightHelper,
    clock, previousTime;

const fogColor = 0x409be6;
const floorColor = 0xc7d0f0;
const ceilingColor = floorColor;
const ibeamColor = 0x2b3763;

const perlin = new ImprovedNoise();

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
    cameraPosition: new THREE.Vector3(0.0,0.0,0.0),
    chunkCoordinate:      new THREE.Vector3(0,0,0), // (X COORDINATE, UNUSED, Z COORDINATE)
    prevChunkCoordinate:  new THREE.Vector3(0,0,0),
    positionInChunk:      new THREE.Vector3(0.0,0.5,0.0),
    velocity:             new THREE.Vector3(0.0,0.0,0.7),
    acceleration:         new THREE.Vector3(0.0,0.0,0.0),
    yawDeflection:        0.0,
    pitchDeflection:      0.0,
    yawDeflectionSpeed:   0.0,
    pitchDeflectionSpeed: 0.0,
    rollAngle:            0.0,
    rollSpeed:            0.0,
    boosting:             false,
    // derived state data
    finalPosition: new THREE.Vector3(0.0,0.0,0.0),
    heading: new THREE.Vector3(0.0,0.0,0.0),
};
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Settings & Consts =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const chunkSize = 10.0; // keep in mind, movement speed is tied to chunk size
const loadedChunksRadius = 5;
const _SEED_ = 23452345;

const zero = new THREE.Vector3(); // dont change this


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= debug gui =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gui = new dat.GUI();

const debugVars = {
    fov: 55.0,
    dragCoefficent: -0.1,
    liftFactor: 0.004,
    gravity_YCmp: -0.02,
    pitchDeflectionCoefficent: 0.009,
    yawDeflectionCoefficent: 0.005,
    boostAcceleration: 1.0,
    deflectionSpeed: 4.0,
    rollSpeed: 1.7,
    minMaxHeadingAngleRadians: Math.PI * 0.35, 
}

gui.add(debugVars, "fov", 10, 150);
gui.add(debugVars,"dragCoefficent",-0.5,0.0);
gui.add(debugVars,"liftFactor",0.0,0.01);
gui.add(debugVars,"gravity_YCmp",-0.5,0.0);
gui.add(debugVars,"pitchDeflectionCoefficent",0.0001,0.001);
gui.add(debugVars,"yawDeflectionCoefficent",0.0001,0.001);
gui.add(debugVars,"boostAcceleration",0.0,5.0);
gui.add(debugVars,"deflectionSpeed",0.0,10.0);
gui.add(debugVars,"rollSpeed",0.1,5.0);
gui.add(debugVars,"minMaxHeadingAngleRadians",0,Math.PI);
//gui.add(debugVars,"",,);






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

    // unload old chunks based on position
    getHorizonChunkCoordinates(
        gameState.prevChunkCoordinate.x, 
        gameState.prevChunkCoordinate.z,
        gameState.chunkCoordinate.x, 
        gameState.chunkCoordinate.z
    )
    .map(({x,z}) => chunkGroup.remove(chunkGroup.getObjectByName(chunkName(x,z))));

    // create new chunks based on new integer position & old integer position (answer "what chunks are to be added to the scene?")
    getHorizonChunkCoordinates(
        gameState.chunkCoordinate.x, 
        gameState.chunkCoordinate.z, 
        gameState.prevChunkCoordinate.x, 
        gameState.prevChunkCoordinate.z
    )
    .map(({x,z}) => chunkGroup.add(createChunkMesh(x,z)));



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

const ceilingHeight = 7.0;

const tilesPerChunkSide = 8; // 16 is cool
const tileSize = chunkSize / tilesPerChunkSide;
const inverseTilesPerChunkSide = 1.0 / tilesPerChunkSide;
const vertsPerChunkSide = tilesPerChunkSide + 1;
const inverseVertsPerChunkSide = 1.0 / vertsPerChunkSide;
const terrainHeightMultiplier = 10.0;
const inverseTerrainHeightMultiplier = 1 / terrainHeightMultiplier;


const waterLevel = 0.2;
function terrainHeightAt(x,z){
    return (MathUtils.clamp(perlin.noise(x,z, 0.0), -1, -waterLevel) + waterLevel) * terrainHeightMultiplier
};

function createChunkMesh(x, z){
    // https://threejs.org/docs/#examples/en/geometries/TextGeometry
    // use this for instructions and some numbers on beams and stuff. lables should be a1, a2, a3, then get cryptic like "k?", "??" "00" "NO" "GO" 
    const chunkMesh = new THREE.Group();
    chunkMesh.name = chunkName(x,z);




    const terrainGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize, tilesPerChunkSide, tilesPerChunkSide);
    
    const terrainVertices = terrainGeometry.attributes.position.array;

    const canvas  = document.createElement( 'canvas' );
    canvas.width  = tilesPerChunkSide;
    canvas.height = tilesPerChunkSide;
    const context = canvas.getContext( '2d' );
    context.fillStyle = '#000';
    context.fillRect( 0, 0, tilesPerChunkSide, tilesPerChunkSide );
    const image = context.getImageData( 0, 0, canvas.width, canvas.height );
    
    
    //console.log(16, terrainVertices.length, image.data.length / 4)
    for ( let i = 0, j = 0, k = 0; j < terrainVertices.length; i ++, j += 3) {

        /*
         * j is starting index of ith vert in terrainVertices array. 
         * terrainVertices[ j ] = x, terrainVertices[ j + 1 ] = y, terrainVertices[ j + 2 ] = z
         * for the case tilesPerChunkSide = 2, there are 9 verts 
         * they are traversed like so:
         * 
         * ------Z AXIS-----(0,0)
         *                    |
         *  2 ---- 1 ---- 0   |
         *  |      |      |   X
         *  |      |      |    
         *  5 ---- 4 ---- 3   A
         *  |      |      |   X
         *  |      |      |   I
         *  8 ---- 7 ---- 6   S
         *                    |
         * 
         * however, i effectively traverses 2,1,0,5,4,3,8,7,6 i.e. with reversed rows
         * 
         */

        const localXIndex = i % vertsPerChunkSide;
        const localZIndex = Math.floor(i * inverseVertsPerChunkSide);
        const localX = localXIndex * inverseTilesPerChunkSide;
        const localZ = (vertsPerChunkSide - localZIndex) * inverseTilesPerChunkSide; // Z verts are read from right to left, not left to right
    
        terrainVertices[ j + 2 ] = terrainHeightAt(x + localX,  z + localZ);
    }
    for ( let i = 0, j = 0, k = 0; j < terrainVertices.length; i ++, j += 3) {

        const localXIndex = i % vertsPerChunkSide;
        const localZIndex = Math.floor(i * inverseVertsPerChunkSide);

        // generate texture from terrain verticies
        if( localXIndex !== tilesPerChunkSide && localZIndex !== tilesPerChunkSide){
            // new tile in mesh
            const terrainVertIndexFromXZ = (x,z) => z * vertsPerChunkSide + x;

            const checker = (x,z) => ((x % 2 == 0) != (z % 2 == 0));
            
            // get average height of 4 verts associated with the current tile
            const average = (
                terrainVertices[ 3 * terrainVertIndexFromXZ(localXIndex,     localZIndex    ) + 2 ] + 
                terrainVertices[ 3 * terrainVertIndexFromXZ(localXIndex + 1, localZIndex    ) + 2 ] + 
                terrainVertices[ 3 * terrainVertIndexFromXZ(localXIndex,     localZIndex + 1) + 2 ] + 
                terrainVertices[ 3 * terrainVertIndexFromXZ(localXIndex + 1, localZIndex + 1) + 2 ]
            ) * 0.25;

            const normalizedAverageHeight = MathUtils.clamp(average * -0.2 ,0,1); // this is a hack idk why it gives close to a normalized value lmao

            //console.log(normalizedAverageHeight);

            /*const terrainColors = [
                // range starts at 0.0
                {
                    // ocean
                    startHeight: 0.0,
                    dark: {r: 20, g: 50, b: 200},
                    light: {r: 25, g: 75, b: 205}
                },
                {
                    // beach
                    startHeight: 0.1,
                    dark: {r: 240, g: 185, b: 110},
                    light: {r: 245, g: 210, b: 115}
                }

            ];
            */

            if(normalizedAverageHeight == 0.0){ // draw water

                if(checker(localXIndex, localZIndex)){ // brighter water
                    image.data[k]     = 25;  // R
                    image.data[k + 1] = 70;  // G
                    image.data[k + 2] = 205; // B
                }
                else{ // darker water
                    image.data[k]     = 20;  // R
                    image.data[k + 1] = 50;  // G
                    image.data[k + 2] = 200; // B
                }

            }
            else if(normalizedAverageHeight < 0.1){ // draw beach

                if(checker(localXIndex, localZIndex)){ // brighter beach
                    image.data[k]     = 245; // R
                    image.data[k + 1] = 210; // G
                    image.data[k + 2] = 115; // B
                }
                else{ // darker beach
                    image.data[k]     = 240; // R
                    image.data[k + 1] = 185; // G
                    image.data[k + 2] = 110; // B
                }


            }
            else{ // draw mountain
                image.data[k]     = Math.floor(       normalizedAverageHeight * 100 ); // R
                image.data[k + 1] = Math.floor( 100 + normalizedAverageHeight * 155 ); // G
                image.data[k + 2] = Math.floor( 20 +  normalizedAverageHeight * 190 ); // B
            }

            // image.data[k + 4] // ignorning alpha

            k += 4;
        }
    }

    
    context.putImageData( image, 0, 0 );
    const terrainTexture = new THREE.CanvasTexture(canvas);
    terrainTexture.wrapS = THREE.ClampToEdgeWrapping;
    terrainTexture.wrapT = THREE.ClampToEdgeWrapping;
    terrainTexture.minFilter = THREE.NearestFilter;
    terrainTexture.magFilter = THREE.NearestFilter;
    

    // changes to the world (exploded boxes for example) will be stored in a hash table

    const terrainMaterial = new THREE.MeshStandardMaterial({
        map: terrainTexture,
        side: THREE.DoubleSide,
        wireframe: false,
    });

    const terrainMesh = new THREE.Mesh( terrainGeometry, terrainMaterial );
    terrainMesh.position.x = x * chunkSize;
    terrainMesh.position.z = z * chunkSize;
    terrainMesh.rotateX(Math.PI * 0.5);
    chunkMesh.add(terrainMesh);

    // create ceiling
    if(false){
        const ceilingMesh = new THREE.Mesh(ceilingGeometry, ceilingMaterial );
        ceilingMesh.position.x = x * chunkSize;
        ceilingMesh.position.z = z * chunkSize;
        ceilingMesh.position.y = ceilingHeight;
        ceilingMesh.rotateX(Math.PI * 1.5);
        chunkMesh.add(ceilingMesh);
    }


    // create i-beam
    if( false ){ // ?
        const ibeamInstance = ibeamObj.clone();
        ibeamInstance.position.x = x * chunkSize;
        ibeamInstance.position.z = z * chunkSize;
        ibeamInstance.position.y += 4.2;
        chunkMesh.add(ibeamInstance);
    }
    // place, stack, & rotate boxes
        // each chunk has between 0 and 20 boxes, but anything over like 7 should be quite rare
    if( false ){ // ?
        let box1 = box1Mesh.clone();
        
        box1.position.x = (x + 0.3) * chunkSize;
        box1.position.z = (z + 0.55) * chunkSize;
        const boxScale = 1.0;
        box1.scale.set(boxScale,boxScale,boxScale);

        chunkMesh.add(box1);
    }
    
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
    scene.fog = new THREE.Fog(fogColor, chunkSize * loadedChunksRadius * 0.5, chunkSize * loadedChunksRadius );

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= camera =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    camera = new THREE.PerspectiveCamera( 30.0, window.innerWidth / window.innerHeight, 0.01, 4000);

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Singleton Assets =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    tileGeometry = new THREE.PlaneGeometry(chunkSize, chunkSize);
    tileMaterial = new THREE.MeshStandardMaterial({
        color: floorColor, 
        //map: textureLoader.load("/textures/seamless_concrete_by_agf81.jpeg"), 
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

    loadwake1Obj();

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

    //renderHelpers();

    renderWake1();

    updateCameraState(deltaTime);

    // render
    postProcessing.composer.render( 0.1 );
};
function applyInputsToState(){

    const deflectionSpeed = debugVars.deflectionSpeed; //0.1;
    const rollSpeed = debugVars.rollSpeed; //1.7;

    gameState.yawDeflectionSpeed = 0.0;
    gameState.pitchDeflectionSpeed = 0.0; 
    gameState.rollSpeed = 0.0;
    gameState.boosting = keyboard.pressed("space") ? true : false;

    // translate game inputs into changes onto game state
    if(keyboard.pressed("up")    || keyboard.pressed("W"))
        gameState.pitchDeflectionSpeed += deflectionSpeed; 
    if(keyboard.pressed("down")  || keyboard.pressed("S"))
        gameState.pitchDeflectionSpeed -= deflectionSpeed;
    if(keyboard.pressed("left")  || keyboard.pressed("A"))
        gameState.yawDeflectionSpeed   += deflectionSpeed;
    if(keyboard.pressed("right") || keyboard.pressed("D"))
        gameState.yawDeflectionSpeed   -= deflectionSpeed;

    if(keyboard.pressed("E"))
        gameState.rollSpeed += rollSpeed;    
    if(keyboard.pressed("Q"))
        gameState.rollSpeed -= rollSpeed;
}
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Logic =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
function updateGameState(dt){
    const epsilon = 0.00001;
    const dragCoefficent = debugVars.dragCoefficent; //-0.1;
    const liftFactor = debugVars.liftFactor; //0.004; // what portion of speed becomes lift
    const gravity = new THREE.Vector3(0, debugVars.gravity_YCmp, 0); //new THREE.Vector3(0, -0.02, 0);
    const pitchDeflectionCoefficent = debugVars.pitchDeflectionCoefficent; //0.009;
    const yawDeflectionCoefficent = debugVars.yawDeflectionCoefficent; //0.005;
    const boostAcceleration = debugVars.boostAcceleration; //1.0;
    const minMaxHeadingAngleRadians = debugVars.minMaxHeadingAngleRadians;

    const maxYawDeflection = 0.2;
    const maxPitchDeflection = 0.315;
    const deflectionAttenuationRate = -0.7; // how fast do the deflections return to 0
    const rollAttenuationRate = 0.3;

    // apply roll and deflection speeds to their positions
    gameState.rollAngle       += gameState.rollSpeed            * dt;
    gameState.yawDeflection   += gameState.yawDeflectionSpeed   * dt;
    gameState.pitchDeflection += gameState.pitchDeflectionSpeed * dt;

    // clamp roll angle and deflections
    // if we want to roll angle and deflections to attenuate over time, we need to use quaternions
    //gameState.rollAngle = MathUtils.clamp(gameState.rollAngle, -1 * Math.PI, Math.PI);
    gameState.yawDeflection   = MathUtils.clamp(gameState.yawDeflection,   -1 * maxYawDeflection,   maxYawDeflection  );
    gameState.pitchDeflection = MathUtils.clamp(gameState.pitchDeflection, -1 * maxPitchDeflection, maxPitchDeflection);

    let nextVelocity = gameState.velocity.clone();
    const normalizedPrevVelocity = gameState.velocity.clone().normalize();

    // set airplane side vector
    airplaneSide = new THREE.Vector3(0,1,0);
    airplaneSide.cross(nextVelocity);
    airplaneSide.normalize();
    airplaneSide.applyAxisAngle(nextVelocity, gameState.rollAngle);
    
    // set airplane up vector
    airplaneUp = new THREE.Vector3(0,1,0);
    airplaneUp.cross(nextVelocity);
    airplaneUp.normalize();
    airplaneUp.applyAxisAngle(nextVelocity, gameState.rollAngle + Math.PI * 0.5);

    //apply deflections to velocity TODO: look into making these quaternion rotations
    let magnitude = nextVelocity.distanceTo(zero);
    nextVelocity.addScaledVector(airplaneSide, gameState.yawDeflection   * yawDeflectionCoefficent  );
    nextVelocity.addScaledVector(airplaneUp,   gameState.pitchDeflection * pitchDeflectionCoefficent);
    nextVelocity.setLength(magnitude);

    // apply acceleration
    nextVelocity.addScaledVector(gameState.acceleration, dt); // this is unused?

    // apply drag
    nextVelocity.addScaledVector(gameState.velocity, dragCoefficent * dt );

    // apply boost
    if(gameState.boosting){
        nextVelocity.addScaledVector(normalizedPrevVelocity, boostAcceleration * dt);
    }
    
    // apply gravity
    nextVelocity.addScaledVector(gravity, dt);

    // apply lift (lift is upward force from forward velocity)
    nextVelocity.addScaledVector(airplaneUp, liftFactor * gameState.velocity.distanceTo(zero) * dt);

    // apply minimum speed 
    /*if(gameState.velocity.distanceToSquared(zero) < epsilon && gameState.acceleration.distanceToSquared(zero) < epsilon){
        gameState.velocity.set(1.0,0.0,0.0);
    }*/

    // apply min and max heading angles to velocity
    // TODO: put in a warning zone? Do something other than clamping the angle (i.e. make the plane crash or fall out of the sky, make it impossible to control)?
    let horizonAngle = nextVelocity.angleTo(new THREE.Vector3(0,1,0));
    let velocityNormalFromBirdsEyePOV = new THREE.Vector3().crossVectors(
        new THREE.Vector3(nextVelocity.x, 0, nextVelocity.z),
        nextVelocity, 
    );
    velocityNormalFromBirdsEyePOV.normalize();
    if((horizonAngle < minMaxHeadingAngleRadians) || (horizonAngle > Math.PI - minMaxHeadingAngleRadians)){
        console.log('heading too extreme!');
        let nextXZ = Math.sqrt(nextVelocity.x * nextVelocity.x + nextVelocity.z * nextVelocity.z);
        let prevXZ = Math.sqrt(gameState.velocity.x * gameState.velocity.x + gameState.velocity.z * gameState.velocity.z);
        if(nextXZ < prevXZ){
            nextVelocity.setY(nextVelocity.y * (1 + ( nextXZ - prevXZ) / prevXZ ));
        }
    }
 
    gameState.velocity.copy(nextVelocity);


    // apply velocity to position
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

    // update derived values
    gameState.finalPosition = gameState.positionInChunk.clone();
    gameState.finalPosition.add(gameState.chunkCoordinate);
    gameState.finalPosition.multiplyScalar(chunkSize);
}


function calcDistanceToGround(){
    const terrainHeightAtCharacterPosition = -1 * terrainHeightAt(
        gameState.chunkCoordinate.x + gameState.positionInChunk.x,  
        gameState.chunkCoordinate.z + gameState.positionInChunk.z
    );

    const heightAboveTerrain = gameState.positionInChunk.y * chunkSize - terrainHeightAtCharacterPosition;

    return {terrainHeightAtCharacterPosition, heightAboveTerrain};
}

// apply updated game state to the airplane model, i.e. set position, pitch, yaw, roll & deflection
function applyStateToCharModel(){

    // set position
    airplaneMesh.position.copy(gameState.finalPosition); 

    // reset orientation
    airplaneMesh.setRotationFromAxisAngle(new THREE.Vector3(0,1,0), 0.0);

    // apply heading
    airplaneMesh.lookAt(gameState.finalPosition.clone().addScaledVector(gameState.velocity.normalize(), -1)); 

    // apply roll
    let rollQuaternion = new THREE.Quaternion();
    rollQuaternion.setFromAxisAngle( gameState.velocity.normalize(), gameState.rollAngle);
    airplaneMesh.applyQuaternion(rollQuaternion);

    // apply deflection (animation)
        // weighted average between curState & prevFrame (dt prob needs to be involved here)
}
function renderWake1(){
    // TODO replace airplaneMesh.position with final position

    const {terrainHeightAtCharacterPosition, heightAboveTerrain} = calcDistanceToGround();

    const wakeHeight = 0.1;

    wake1Obj.visible = (terrainHeightAtCharacterPosition == 0.0) && (heightAboveTerrain < terrainHeightMultiplier * 0.05); // water level, 5% of max height

    wake1Obj.position.copy(gameState.finalPosition);
    wake1Obj.position.setY(wakeHeight);
    const wakeHeading = gameState.finalPosition.clone().add(gameState.velocity.normalize());
    wakeHeading.setY(wakeHeight);
    wake1Obj.lookAt(wakeHeading);

}
function renderHelpers(){
    // TODO replace airplaneMesh.position with final position

        // heading visualizer
        if(headingHelper) headingHelper.removeFromParent(); 
        headingHelper = new THREE.ArrowHelper( gameState.velocity.normalize(), gameState.finalPosition, 1.0, 0xff0000 );
        scene.add( headingHelper );
    
        // yaw deflection visualizer
        if(yawDeflectionHelper) yawDeflectionHelper.removeFromParent();
        yawDeflectionHelper = new THREE.ArrowHelper( airplaneSide, gameState.finalPosition, gameState.yawDeflection, 0x00ff00 );
        scene.add( yawDeflectionHelper );
        
        // pitch deflection visualizer
        if(pitchDeflectionHelper) pitchDeflectionHelper.removeFromParent();
        pitchDeflectionHelper = new THREE.ArrowHelper( airplaneUp, gameState.finalPosition, gameState.pitchDeflection, 0x0000ff );
        scene.add( pitchDeflectionHelper );
    
        // height visualizer
        if(heightHelper) heightHelper.removeFromParent();
        heightHelper = new THREE.ArrowHelper( new THREE.Vector3(0.0,-1.0,0.0), gameState.finalPosition, calcDistanceToGround().heightAboveTerrain, 0xff7d19 );
        scene.add(heightHelper);

        
        
}
const wake1ObjScale = 0.3;
function loadwake1Obj(){
    
    wake1Obj = new THREE.Group();

    const wakeGeometry = new THREE.PlaneGeometry(4 * wake1ObjScale, 1 * wake1ObjScale);
    const wakeMaterial = new THREE.MeshBasicMaterial({ 
        side: THREE.DoubleSide, 
        color: 0xffffff, 
        alphaMap: textureLoader.load("/textures/wake1alpha.png"),
        transparent: true,
    });

    const distanceFromCenter = 0.4;
    const yawAngle = Math.PI * 0.1;
    const pitchAngle = Math.PI * 0.2;
    
    const wakeHalf1 = new THREE.Mesh(wakeGeometry, wakeMaterial);
    wakeHalf1.translateX(distanceFromCenter);
    wakeHalf1.rotateY(Math.PI * 0.5 - yawAngle);
    wakeHalf1.rotateX(pitchAngle);
    const wakeHalf2 = new THREE.Mesh(wakeGeometry, wakeMaterial);
    wakeHalf2.translateX(-distanceFromCenter);
    wakeHalf2.rotateY(Math.PI * 0.5 + yawAngle);
    wakeHalf2.rotateX(-pitchAngle);
    

    wake1Obj.add(wakeHalf1);
    wake1Obj.add(wakeHalf2);

    scene.add(wake1Obj);

}

function updateCameraState(dt){

    // have camera follow airplane
    camera.position.copy(gameState.finalPosition.clone().addScaledVector(gameState.velocity.clone().normalize(), -8));
    camera.position.setY(camera.position.y + 1.0);
    

    camera.lookAt(gameState.finalPosition);
    camera.fov = debugVars.fov;
    camera.updateProjectionMatrix();
}


init();