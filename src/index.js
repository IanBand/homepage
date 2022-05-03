import * as THREE from 'three';
import * as dat from "lil-gui";

import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";

// import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
// import { CopyShader } from 'three/examples/jsm/shaders/CopyShader.js'; 


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Loaders =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const gltfLoader = new GLTFLoader();
const textureLoader = new THREE.TextureLoader();

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

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Window =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
document.body.style.margin = 0;
document.body.style.padding = 0;
const renderer = new THREE.WebGLRenderer( { antialias: true } );
renderer.setSize( window.innerWidth, window.innerHeight );
document.body.appendChild( renderer.domElement );

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= scene =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x2c2d70);

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= camera =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const camera = new THREE.PerspectiveCamera( debugVars.fov, window.innerWidth / window.innerHeight, 0.01, 10 );
camera.position.z = 1;

const controls = new OrbitControls( camera , renderer.domElement);

controls.rotateSpeed = 0.3;
controls.zoomSpeed = 0.9;

controls.minDistance = 0.01;
controls.maxDistance = 5;

controls.minPolarAngle = 0; // radians
controls.maxPolarAngle = Math.PI /2; // radians

controls.enableDamping = true;
controls.dampingFactor = 0.05;



// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= Light =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 

const light = new THREE.DirectionalLight("#ffffff", 0.8);
//const pointLight = new THREE.PointLight("#ffffff", 0.2);
const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
light.position.set( 0, 0, 5 ).normalize();
//pointLight.position.set(0,1,0);

scene.add(light);
//scene.add(pointLight);
scene.add(ambientLight);

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= floor tile =-=-=-=-=-=-=-=-=-=-=-=-=-=-= 
const tileGeometry = new THREE.PlaneGeometry( 1, 1 );
const tileMaterial = new THREE.MeshStandardMaterial({color: 0x13293d, map: null, side: THREE.DoubleSide});
const tileMesh = new THREE.Mesh( tileGeometry, tileMaterial );
tileMesh.rotateX(Math.PI /2);
scene.add(tileMesh);


// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= airplane model =-=-=-=-=-=-=-=-=-=-=-=-=-=-=

let airplaneMesh = null;
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
    airplaneMesh = gltf.scene.children[0];

    airplaneMesh.translateX(0.8);
    airplaneMesh.translateY(0.1);
    airplaneMesh.translateZ(0.3);
    // https://threejs.org/docs/#api/en/materials/MeshStandardMaterial
    airplaneMesh.material = new THREE.MeshStandardMaterial({
        map: textureLoader.load("models/paper_airplane/textures/papier_baseColor.jpeg"),
        //emissive: 0xffffff,
        //color: 0xcccccc,
    });
    scene.add(airplaneMesh);
});

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= post processing =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const postprocessing = {};
const renderPass = new RenderPass( scene, camera );
postprocessing.composer = new EffectComposer( renderer );

postprocessing.composer.addPass( renderPass );

// =-=-=-=-=-=-=-=-=-=-=-=-=-=-= main loop =-=-=-=-=-=-=-=-=-=-=-=-=-=-=
const clock = new THREE.Clock();
let previousTime = 0;
const tick = () => {
    // timekeeping
    const elapsedTime = clock.getElapsedTime();
    const deltaTime = elapsedTime - previousTime;
    previousTime = elapsedTime;

    // update mesh & scene


    if(airplaneMesh){ //REPLACE ME WITH AN "ALL LOADED" flag
        // rotation around x axis works fine, But, I should fix the airplane centering problem by parenting it to another object.
        airplaneMesh.rotation.x = Math.PI * -0.5 + Math.sin(elapsedTime * 2 * Math.PI * 0.2) * 0.2; 
        //airplaneMesh.translateY(0.02);
        //airplaneMesh.rotation.y += deltaTime / 3;
    }


    camera.setFocalLength(debugVars.fov);
    //pointLight.position.set(debugVars.px,debugVars.py,debugVars.pz);

    // update shader uniforms


    // update camera controls
    controls.update();
	
    // render scene
    // renderer.render( scene, camera );

    postprocessing.composer.render( 0.1 );


    // Call tick again on the next frame
    window.requestAnimationFrame(tick);
};

// TODO: only start ticking after everything has loaded, show loading bar before that
tick();