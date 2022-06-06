import * as THREE from 'three';
import * as MathUtils from 'three/src/math/MathUtils.js';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postProcessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postProcessing/RenderPass.js';
import KeyboardState from './KeyboardState.js';
//import seedrandom from 'seedrandom';
import Noise from './Noise.js';

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

const perlin = new Noise();

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Loaders =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// Reused Loaded Assets 
let tileGeometry, tileMaterial;
let ceilingGeometry, ceilingMaterial;

const keyboard = new KeyboardState();

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Keep track of loading =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const numberOfMeshesToLoad = 1;
let numberOfMeshesLoaded = 0, initFinished = false;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game State =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
// integer position is used for corse grain colission detection & to avoid fp inaccuracies
const gameState = {
    prevCameraPosition: new THREE.Vector3(0.0,0.0,0.0),
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
    lockDeflections:      false,
    // derived state data
    finalPosition: new THREE.Vector3(0.0,0.0,0.0),
    heading: new THREE.Vector3(0.0,0.0,0.0),
};
// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Game Settings & Consts =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const chunkSize = 10.0; // keep in mind, movement speed is tied to chunk size
const loadedChunksSqrt = 8;
const tilePeriod = loadedChunksSqrt;

const _SEED_ = 23452345;

const zero = new THREE.Vector3(); // dont change this


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= debug gui =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gui = new dat.GUI();

const debugVars = {
    fov: 55.0,
    dragCoefficent: -0.1,
    liftFactor: 0.005,
    gravity_YCmp: -0.02,
    pitchDeflectionCoefficent: 0.02,
    yawDeflectionCoefficent: 0.05,//make this .01
    boostAcceleration: 1.0,
    deflectionSpeed: 4.0,
    rollSpeed: 1.7,
    minMaxHeadingAngleRadians: Math.PI * 0.35, 
}

gui.add(debugVars, "fov", 10, 150);
gui.add(debugVars,"dragCoefficent",-0.5,0.0);
gui.add(debugVars,"liftFactor",0.0,0.1);
gui.add(debugVars,"gravity_YCmp",-0.5,0.0);
gui.add(debugVars,"pitchDeflectionCoefficent",0.0001,0.1);
gui.add(debugVars,"yawDeflectionCoefficent",0.0001,0.1); 
gui.add(debugVars,"boostAcceleration",0.0,5.0);
gui.add(debugVars,"deflectionSpeed",0.0,10.0);
gui.add(debugVars,"rollSpeed",0.1,5.0);
gui.add(debugVars,"minMaxHeadingAngleRadians",0,Math.PI);
//gui.add(debugVars,"",,);


function loadInitalChunks(){
    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Chunks =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 

    chunkGroup = new THREE.Group();
    for(let i = 0; i < loadedChunksSqrt; ++i){
        for(let j = 0; j < loadedChunksSqrt; ++j){
            chunkGroup.add(createChunkMesh(i, j, _SEED_));
        }
    }

    // TODO: chunkGroup should be aligned with airplane position
    // TODO: airplaneposition should start in center and coords should never be negative
    //chunkGroup.translateX((loadedChunksSqrt * 0.5 - 0.5) * -chunkSize);
    //chunkGroup.translateZ((loadedChunksSqrt * 0.5 - 0.5) * -chunkSize);
    
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

    
    getHorizonChunkCoordinates(
        gameState.prevChunkCoordinate.x, 
        gameState.prevChunkCoordinate.z,
        gameState.chunkCoordinate.x, 
        gameState.chunkCoordinate.z, 
    )
    .map(({x,z}) => {
        //chunkGroup.position = newPosition(x,z);
        //chunkGroup.updateMatrixWorld(); ... I think
    });
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
        for(let i = -loadedChunksSqrt; i <= loadedChunksSqrt; i++){
            coordList.push({x: newX + dx * loadedChunksSqrt, z: newZ + i});

            if(i < loadedChunksSqrt){
                coordList.push({x: newX + i, z: newZ + dz * loadedChunksSqrt});
            }
        }
    }
    else if(newX !== oldX){
        for(let i = -loadedChunksSqrt; i <= loadedChunksSqrt; i++){
            coordList.push({x: newX + dx * loadedChunksSqrt, z: newZ + i});
        }
    }
    else if(newZ !== oldZ){
        for(let i = -loadedChunksSqrt; i <= loadedChunksSqrt; i++){
            coordList.push({x: newX + i, z: newZ + dz * loadedChunksSqrt});
        }
    }
    else{
        console.error('getHorizonChunkCoordinates() was called with the same coordinates');
        throw{};
    }
    //console.log(coordList);
    return coordList;
}

const tilesPerChunkSide = 64; // 16 is cool
const tileSize = chunkSize / tilesPerChunkSide;
const inverseTilesPerChunkSide = 1.0 / tilesPerChunkSide;
const vertsPerChunkSide = tilesPerChunkSide + 1;
const inverseVertsPerChunkSide = 1.0 / vertsPerChunkSide;
const terrainHeightMultiplier = 10.0;
const inverseTerrainHeightMultiplier = 1 / terrainHeightMultiplier;


const waterLevel = 0.2;
function terrainHeightAt(x,z){
    console.log(x,z)
    return  (
                MathUtils.clamp(
                    perlin.periodic(x,z, tilePeriod) +  Math.sin(2 * x * z - z + 3 * x / (2 * Math.PI) * tilePeriod) * 0.27, 
                    -1, 
                    -waterLevel
            ) + waterLevel) * terrainHeightMultiplier;
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
           // const writeColor = (hexColor) => {image.data[k]  = ... }

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


function init(){

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Window =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    renderer = new THREE.WebGLRenderer( { antialias: true } );
    renderer.setSize( window.innerWidth, window.innerHeight );
    document.body.appendChild( renderer.domElement );

    // =-=-=-=-=-=-=-=-=-=-=-=-=-=-= scene =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
    scene = new THREE.Scene();
    scene.background = new THREE.Color(fogColor);
    //scene.fog = new THREE.Fog(fogColor, chunkSize * loadedChunksSqrt * 0.5, chunkSize * loadedChunksSqrt );

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

    renderHelpers();

    renderWake1();

    updateCameraState(deltaTime);

    //camera.position.copy(new THREE.Vector3(0,200,0)); camera.lookAt(new THREE.Vector3(0.0,0.0,0.0));

    // render
    postProcessing.composer.render( 0.1 );
};


function applyInputsToState(){

    const deflectionSpeed = debugVars.deflectionSpeed; //0.1;
    const rollSpeed = debugVars.rollSpeed; //1.7;

    gameState.yawDeflectionSpeed = 0.0;
    gameState.pitchDeflectionSpeed = 0.0; 
    gameState.rollSpeed = 0.0;
    gameState.boosting  = keyboard.pressed("space") ? true : false;
    
    // x is a toggle that locks deflection attenuation
    if(keyboard.down("X")) gameState.lockDeflections = !gameState.lockDeflections;

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
    const minDeflection = 0.01;
    const deflectionAttenuationRate = 1.5; // percentage of max deflection
    const rollAttenuationRate = 0.3;


    //const minSpeed = 0.2;
    //const maxSpeed = 

    // apply roll and deflection speeds to their positions
    gameState.rollAngle       += gameState.rollSpeed            * dt;
    gameState.yawDeflection   += gameState.yawDeflectionSpeed   * dt;
    gameState.pitchDeflection += gameState.pitchDeflectionSpeed * dt;

    // attenuate deflections if not locked
    if(!gameState.lockDeflections){
        gameState.yawDeflection   -= Math.sign(gameState.yawDeflection)   * maxYawDeflection   * deflectionAttenuationRate * dt;
        gameState.pitchDeflection -= Math.sign(gameState.pitchDeflection) * maxPitchDeflection * deflectionAttenuationRate * dt;
    }
    if(Math.abs(gameState.yawDeflection)   < minDeflection) gameState.yawDeflection   = 0.0;
    if(Math.abs(gameState.pitchDeflection) < minDeflection) gameState.pitchDeflection = 0.0;

    // save heading
    gameState.heading.copy(gameState.velocity.clone().normalize());
    

    // clamp roll angle and deflections
    // if we want to roll angle and deflections to attenuate over time, we need to use quaternions
    //gameState.rollAngle = MathUtils.clamp(gameState.rollAngle, -1 * Math.PI, Math.PI);
    gameState.yawDeflection   = MathUtils.clamp(gameState.yawDeflection,   -1 * maxYawDeflection,   maxYawDeflection  );
    gameState.pitchDeflection = MathUtils.clamp(gameState.pitchDeflection, -1 * maxPitchDeflection, maxPitchDeflection);


    // orient based on current velocity

    // get airplane current side vector
    airplaneSide = new THREE.Vector3(0,1,0);
    airplaneSide.cross(gameState.velocity);
    airplaneSide.normalize();
    airplaneSide.applyAxisAngle(gameState.heading, gameState.rollAngle); // look at the docs... applyAxisAngle needs a normalized vector
    
    // get airplane current up vector
    airplaneUp = new THREE.Vector3(0,1,0);
    airplaneUp.cross(gameState.velocity);
    airplaneUp.normalize();
    airplaneUp.applyAxisAngle(gameState.heading, gameState.rollAngle + Math.PI * 0.5);

    //apply deflections to velocity TODO: look into making these quaternion rotations
    let magnitude = gameState.velocity.distanceTo(zero);
    gameState.velocity.addScaledVector(airplaneSide, gameState.yawDeflection   * yawDeflectionCoefficent  );
    gameState.velocity.addScaledVector(airplaneUp,   gameState.pitchDeflection * pitchDeflectionCoefficent);
    gameState.velocity.setLength(magnitude);
    

    // apply drag
    gameState.velocity.addScaledVector(gameState.velocity, dragCoefficent * dt );

    // apply boost
    if(gameState.boosting){
        gameState.velocity.addScaledVector(gameState.heading, boostAcceleration * dt);
    }
    
    // apply gravity
    gameState.velocity.addScaledVector(gravity, dt);

    // apply lift (lift is upward force from forward velocity)
    gameState.velocity.addScaledVector(airplaneUp, liftFactor * gameState.velocity.distanceTo(zero) * dt);

    // apply min & max velocity
    gameState.velocity.clampLength(0.5, 2.0);


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
    gameState.heading.copy(gameState.velocity.clone().normalize());
    gameState.finalPosition.copy(gameState.positionInChunk);
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
    airplaneMesh.lookAt(gameState.finalPosition.clone().addScaledVector(gameState.velocity.clone().normalize(), -1));

    // apply roll
    let rollQuaternion = new THREE.Quaternion();
    rollQuaternion.setFromAxisAngle( gameState.velocity.clone().normalize(), gameState.rollAngle);
    airplaneMesh.applyQuaternion(rollQuaternion);

    // apply deflection (animation)
        // weighted average between curState & prevFrame (dt prob needs to be involved here)
}
function renderWake1(){

    const {terrainHeightAtCharacterPosition, heightAboveTerrain} = calcDistanceToGround();

    const wakeHeight = 0.1;

    const percentOfMaxHeightThatWakeRendersAt = 0.1;

    wake1Obj.visible = (terrainHeightAtCharacterPosition == 0.0) && (heightAboveTerrain < terrainHeightMultiplier * percentOfMaxHeightThatWakeRendersAt);

    wake1Obj.position.copy(gameState.finalPosition);
    wake1Obj.position.setY(wakeHeight);
    const wakeHeading = gameState.finalPosition.clone().add(gameState.velocity.clone().normalize());
    wakeHeading.setY(wakeHeight);
    wake1Obj.lookAt(wakeHeading);

}
function renderHelpers(){

        // heading visualizer
        if(headingHelper) headingHelper.removeFromParent(); 
        headingHelper = new THREE.ArrowHelper( gameState.velocity.clone().normalize(), gameState.finalPosition, 1.0, 0xff0000 );
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

    const velocityDistanceFactor = -0.25, // capped by max speed
          velocityFovFactor = 10.0,
          baseFov = debugVars.fov,
          baseCameraDistance = 2.0;

    // have camera follow airplane
    camera.position.copy(
        gameState.finalPosition.clone().addScaledVector(
            gameState.velocity.clone().normalize(),
             -1 * ( baseCameraDistance + gameState.velocity.distanceToSquared(zero) * velocityDistanceFactor)
        )
    );

    const heightFromPitch = 0.0; // this will be based off of the current pitch input (pitchDeflection) and current heading horizon angle
    camera.position.setY(gameState.finalPosition.y + heightFromPitch + 0.5);
    

    camera.lookAt(gameState.finalPosition);
    camera.fov = baseFov + velocityFovFactor * gameState.velocity.distanceToSquared(zero);
    camera.updateProjectionMatrix();

    gameState.prevCameraPosition.copy(camera.position);
}


init();