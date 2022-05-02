import * as THREE from 'three';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
// import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
// import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'; 



// remove padding
document.body.style.margin = 0;
document.body.style.padding = 0;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Loaders =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= debug gui =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gui = new dat.GUI();

const debugVars = {
    fov: 10,
}

gui.add(debugVars, "fov", 10, 150);

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= camera =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const camera = new THREE.PerspectiveCamera( debugVars.fov, window.innerWidth / window.innerHeight, 0.01, 10 );
camera.position.z = 1;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= scene =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c2d70);

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Light =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 

const light = new THREE.DirectionalLight("#ffffff", 0.2);
const pointLight = new THREE.PointLight("#ffffff", 0.2);
const pointLightBack = new THREE.PointLight("#ffffff", 0.2);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.2);
light.position.set( 0, -70, 100 ).normalize();
pointLight.position.set(0,-40,300);
pointLightBack.position.set(0,-40,-100);

scene.add(light);
scene.add(pointLight);
scene.add(pointLightBack);
scene.add(ambientLight);


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= airplane model =-=-=-=-=-=-=-=-=-=-=-=-=-=-=

let airplaneObject = null;
let airplaneTexture = 
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
    airplaneObject = gltf.scene.children[0];
    // https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
    airplaneObject.material = new THREE.MeshStandardMaterial({
        map: textureLoader.load("models/paper_airplane/textures/papier_baseColor.jpeg"),
        //emissive: 0xffffff,
        //color: 0xcccccc,
    });
    scene.add(airplaneObject);
});


/*
const geometry = new THREE.BoxGeometry( 0.2, 0.2, 0.2 );
const material = new THREE.MeshNormalMaterial();
const mesh = new THREE.Mesh( geometry, material );
scene.add( mesh );
*/


const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= post processing =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const postprocessing = {};
const renderPass = new RenderPass( scene, camera );
const composer = new EffectComposer( renderer );

composer.addPass( renderPass );

postprocessing.composer = composer;

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= animation =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const clock = new THREE.Clock();
let previousTime = 0;
const tick = () => {
    // timekeeping
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = elapsedTime - previousTime;
    previousTime = elapsedTime;

    // update mesh & scene


    if(airplaneObject){ //REPLACE ME WITH AN "ALL LOADED" flag
        airplaneObject.rotation.x += deltaTime / 2;
        airplaneObject.rotation.y += deltaTime / 3;
    }


    camera.setFocalLength(debugVars.fov);

    // update shader uniforms
	
    // render scene
    // renderer.render( scene, camera );
    postprocessing.composer.render( 0.1 );


    // Call tick again on the next frame
    window.requestAnimationFrame(tick);
};

// TODO: only start ticking after everything has loaded, show loading bar before that
tick();