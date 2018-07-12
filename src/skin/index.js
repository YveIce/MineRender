import * as THREE from "three";
import EffectComposer, { RenderPass, ShaderPass, CopyShader } from "@johh/three-effectcomposer";
import OrbitControls from "../lib/OrbitControls";
import { SSAARenderPass } from 'threejs-ext';

import texturePositions from "./texturePositions";
import { attachTo } from "../renderBase";

let defaultOptions = {
    showAxes: false,
    showGrid: false,
    autoResize: false,
    controls: {
        enabled: true,
        zoom: true,
        rotate: true,
        pan: true
    },
    camera: {
        type: "perspective",
        x: 20,
        y: 35,
        z: 20
    },
    canvas: {
        width: undefined,
        height: undefined
    },
    render: {
        postprocessing: false
    }
};

function SkinRender(options, element) {
    console.log(element);
    console.log(options);

    this.element = element;
    this._element = element || window.document.body;
    this._animId = -1;

    this.options = Object.assign({}, defaultOptions, options);
    if (!OrbitControls) {
        console.warn("OrbitControls not found. Disabling skin controls.");
        this.options.controls.enabled = false;
    }

    if (this.options.render.taa) this.options.render.postprocessing = this.options.render.taa;

    // bind this renderer to the element
    this._element.skinRender = this;
    this.attached = false;
}

SkinRender.prototype.render = function (texture, cb) {
    let skinRender = this;

    let renderStarted = false;

    function imagesLoaded(skinTexture, capeTexture) {
        renderStarted = true;
        skinTexture.needsUpdate = true;
        if (capeTexture) capeTexture.needsUpdate = true;

        let textureVersion = -1;
        if (skinTexture.image.height === 32) {
            textureVersion = 0;
        } else if (skinTexture.image.height === 64) {
            textureVersion = 1;
        } else {
            console.error("Couldn't detect texture version. Invalid dimensions: " + skinTexture.image.width + "x" + skinTexture.image.height)
        }
        console.log("Skin Texture Version: " + textureVersion)

        // To keep the pixelated texture
        skinTexture.magFilter = THREE.NearestFilter;
        skinTexture.minFilter = THREE.NearestFilter;
        skinTexture.anisotropy = 0;
        if (capeTexture) {
            capeTexture.magFilter = THREE.NearestFilter;
            capeTexture.minFilter = THREE.NearestFilter;
            capeTexture.anisotropy = 0;
        }

        if (!skinRender.attached) {// Don't init scene if attached, since we already have an available scene
            let scene = new THREE.Scene();
            skinRender._scene = scene;
            let camera = new THREE.PerspectiveCamera(75, (skinRender.options.canvas.width || window.innerWidth) / (skinRender.options.canvas.height || window.innerHeight), 0.1, 1000);

            // scene.background = new THREE.Color( 0xff0000 );

            let renderer = new THREE.WebGLRenderer({alpha: true, antialias: true});
            skinRender._renderer = renderer;
            renderer.setSize((skinRender.options.canvas.width || window.innerWidth), (skinRender.options.canvas.height || window.innerHeight));
            renderer.setClearColor(0x000000, 0);
            skinRender._element.appendChild(skinRender._canvas = renderer.domElement);

            let composer;
            if (skinRender.options.render.postprocessing) {

                composer = new EffectComposer(renderer);
                skinRender._composer = composer;

                let ssaaRenderPass = new SSAARenderPass(scene, camera);
                ssaaRenderPass.unbiased = true;
                composer.addPass(ssaaRenderPass);

                let renderPass = new RenderPass(scene, camera);
                renderPass.enabled = false;
                composer.addPass(renderPass);

                let copyPass = new ShaderPass(CopyShader);
                copyPass.renderToScreen = true;
                composer.addPass(copyPass);
            }

            if (skinRender.options.controls.enabled) {
                let controls = new OrbitControls(camera, renderer.domElement);
                controls.enableZoom = skinRender.options.controls.zoom;
                controls.enableRotate = skinRender.options.controls.rotate;
                controls.enablePan = skinRender.options.controls.pan;
                controls.target.set(0, 18, 0)
            }
            if (skinRender.options.autoResize) {
                window.addEventListener("resize", function () {
                    let width = skinRender.element ? skinRender.element.offsetWidth : window.innerWidth;
                    let height = skinRender.element ? skinRender.element.offsetHeight : window.innerHeight;

                    skinRender._resize(width, height);
                }, false)
            }
            skinRender._resize = function (width, height) {
                camera.aspect = width / height;
                camera.updateProjectionMatrix();

                renderer.setSize(width, height);

                if (skinRender.options.render.postprocessing) {
                    let pixelRatio = renderer.getPixelRatio();
                    let newWidth = Math.floor(width / pixelRatio) || 1;
                    let newHeight = Math.floor(height / pixelRatio) || 1;
                    composer.setSize(newWidth, newHeight);
                }
            };

            if (skinRender.options.showAxes) {
                scene.add(buildAxes(100));
            }
            if (skinRender.options.showGrid) {
                scene.add(new THREE.GridHelper(100, 100));
            }

            camera.position.x = skinRender.options.camera.x;
            camera.position.y = skinRender.options.camera.y;
            camera.position.z = skinRender.options.camera.z;
            camera.lookAt(new THREE.Vector3(0, 18, 0))

            let animate = function () {
                skinRender._animId = requestAnimationFrame(animate);

                skinRender.getElement().dispatchEvent(new CustomEvent("skinRender", {detail: {playerModel: skinRender.playerModel}}));

                if (skinRender.options.render.postprocessing) {
                    composer.render();
                } else {
                    renderer.render(scene, camera);
                }
            };
            skinRender._animate = animate;

            animate();
        }

        console.log("Slim: " + slim)
        let playerModel = createPlayerModel(skinTexture, capeTexture, textureVersion, slim, texture.optifine);
        skinRender._scene.add(playerModel);
        // console.log(playerModel);
        skinRender.playerModel = playerModel;

        if (typeof cb === "function") cb();
    }

    skinRender._skinImage = new Image();
    skinRender._skinImage.crossOrigin = "anonymous";
    skinRender._capeImage = new Image();
    skinRender._capeImage.crossOrigin = "anonymous";
    let hasCape = texture.capeUrl !== undefined || texture.capeData !== undefined || texture.mineskin !== undefined;
    let slim = false;
    let skinLoaded = false;
    let capeLoaded = false;

    let skinTexture = new THREE.Texture();
    let capeTexture = new THREE.Texture();
    skinTexture.image = skinRender._skinImage;
    skinRender._skinImage.onload = function () {
        if (!skinRender._skinImage) return;

        skinLoaded = true;
        console.log("Skin Image Loaded");

        if (texture.slim === undefined) {
            let detectCanvas = document.createElement("canvas");
            let detectCtx = detectCanvas.getContext("2d");
            // detectCanvas.style.display = "none";
            detectCanvas.width = skinRender._skinImage.width;
            detectCanvas.height = skinRender._skinImage.height;
            detectCtx.drawImage(skinRender._skinImage, 0, 0);

            console.log("Slim Detection:")

            // Check the 2 columns that should be transparent on slim skins
            let px1 = detectCtx.getImageData(46, 52, 1, 12).data;
            let px2 = detectCtx.getImageData(54, 20, 1, 12).data;
            let allTransparent = true;
            for (let i = 3; i < 12 * 4; i += 4) {
                if (px1[i] === 255) {
                    allTransparent = false;
                    break;
                }
                if (px2[i] === 255) {
                    allTransparent = false;
                    break;
                }
            }
            console.log(allTransparent)

            if (allTransparent) slim = true;
        }

        if (skinLoaded && (capeLoaded || !hasCape)) {
            if (!renderStarted) imagesLoaded(skinTexture, capeTexture);
        }
    };
    skinRender._skinImage.onerror = function (e) {
        console.warn("Skin Image Error")
        console.warn(e)
    }
    console.log("Has Cape: " + hasCape)
    if (hasCape) {
        capeTexture.image = skinRender._capeImage;
        skinRender._capeImage.onload = function () {
            if (!skinRender._capeImage) return;

            capeLoaded = true;
            console.log("Cape Image Loaded");

            if (capeLoaded && skinLoaded) {
                if (!renderStarted) imagesLoaded(skinTexture, capeTexture);
            }
        }
        skinRender._capeImage.onerror = function (e) {
            console.warn("Cape Image Error")
            console.warn(e);

            // Continue anyway, just without the cape
            capeLoaded = true;
            if (skinLoaded) {
                if (!renderStarted) imagesLoaded(skinTexture);
            }
        }
    } else {
        capeTexture = null;
        skinRender._capeImage = null;
    }

    if (typeof texture === "string") {
        // console.log(texture)
        if (texture.indexOf("http") === 0) {// URL
            skinRender._skinImage.src = texture
        } else if (texture.length <= 16) {// Probably a Minecraft username
            getJSON("https://skinrender.ga/nameToUuid.php?name=" + texture, function (err, data) {
                if (err) return console.log(err);
                console.log(data);
                skinRender._skinImage.src = "https://crafatar.com/skins/" + (data.id ? data.id : texture);
            });
        } else if (texture.length <= 36) {// Probably player UUID
            image.src = "https://crafatar.com/skins/" + texture + "?overlay";
        } else {// taking a guess that it's a Base64 image
            skinRender._skinImage.src = texture;
        }
    } else if (typeof texture === "object") {
        if (texture.url) {
            skinRender._skinImage.src = texture.url;
        } else if (texture.data) {
            skinRender._skinImage.src = texture.data;
        } else if (texture.username) {
            getJSON("https://skinrender.ga/nameToUuid.php?name=" + texture.username, function (err, data) {
                if (err) return console.log(err);
                skinRender._skinImage.src = "https://crafatar.com/skins/" + (data.id ? data.id : texture.username) + "?overlay";
            });
        } else if (texture.uuid) {
            skinRender._skinImage.src = "https://crafatar.com/skins/" + texture.uuid + "?overlay";
        } else if (texture.mineskin) {
            skinRender._skinImage.src = "https://api.mineskin.org/render/texture/" + texture.mineskin;
        }
        if (texture.capeUrl) {
            skinRender._capeImage.src = texture.capeUrl;
        } else if (texture.capeData) {
            skinRender._capeImage.src = texture.capeData;
        } else if (texture.mineskin) {
            skinRender._capeImage.src = "https://api.mineskin.org/render/texture/" + texture.mineskin + "/cape";
        }

        slim = texture.slim;
    } else {
        throw new Error("Invalid texture value")
    }
};

SkinRender.prototype.resize = function (width, height) {
    return this._resize(width, height);
};

SkinRender.prototype.reset = function () {
    this._skinImage = null;
    this._capeImage = null;

    if (this._animId) {
        cancelAnimationFrame(this._animId);
    }
    if (this._canvas) {
        this._canvas.remove();
    }
};

SkinRender.prototype.getElement = function () {
    return this._element;
};

SkinRender.prototype.getPlayerModel = function () {
    return this.playerModel;
};


SkinRender.prototype.getModelByName = function (name) {
    return this._scene.getObjectByName(name, true);
};

SkinRender.prototype.toggleSkinPart = function (name, visible) {
    this._scene.getObjectByName(name, true).visible = visible;
};


let createCube = function (texture, width, height, depth, textures, slim, name, transparent) {
    let textureWidth = texture.image.width;
    let textureHeight = texture.image.height;

    let geometry = new THREE.BoxGeometry(width, height, depth);
    let material = new THREE.MeshBasicMaterial({
        /*color: 0x00ff00,*/map: texture, transparent: transparent || false, alphaTest: 0.5, side: transparent ? THREE.DoubleSide : THREE.FrontSide//TODO: double sided not working properly
    });

    geometry.computeBoundingBox();

    geometry.faceVertexUvs[0] = [];

    let faceNames = ["right", "left", "top", "bottom", "front", "back"];
    let faceUvs = [];
    for (let i = 0; i < faceNames.length; i++) {
        let face = textures[faceNames[i]];
        if (faceNames[i] === "back") {
            //     console.log(face)
            // console.log("X: " + (slim && face.sx ? face.sx : face.x))
            // console.log("W: " + (slim && face.sw ? face.sw : face.w))
        }
        let w = textureWidth;
        let h = textureHeight;
        let tx1 = ((slim && face.sx ? face.sx : face.x) / w);
        let ty1 = (face.y / h);
        let tx2 = (((slim && face.sx ? face.sx : face.x) + (slim && face.sw ? face.sw : face.w)) / w);
        let ty2 = ((face.y + face.h) / h);

        faceUvs[i] = [
            new THREE.Vector2(tx1, ty2),
            new THREE.Vector2(tx1, ty1),
            new THREE.Vector2(tx2, ty1),
            new THREE.Vector2(tx2, ty2)
        ];
        // console.log(faceUvs[i])

        let flipX = face.flipX;
        let flipY = face.flipY;

        let temp;
        if (flipY) {
            temp = faceUvs[i].slice(0);
            faceUvs[i][0] = temp[2];
            faceUvs[i][1] = temp[3];
            faceUvs[i][2] = temp[0];
            faceUvs[i][3] = temp[1]
        }
        if (flipX) {//flip x
            temp = faceUvs[i].slice(0);
            faceUvs[i][0] = temp[3];
            faceUvs[i][1] = temp[2];
            faceUvs[i][2] = temp[1];
            faceUvs[i][3] = temp[0]
        }
    }

    let j = 0;
    for (let i = 0; i < faceUvs.length; i++) {
        geometry.faceVertexUvs[0][j] = [faceUvs[i][0], faceUvs[i][1], faceUvs[i][3]];
        geometry.faceVertexUvs[0][j + 1] = [faceUvs[i][1], faceUvs[i][2], faceUvs[i][3]];
        j += 2;
    }
    geometry.uvsNeedUpdate = true;

    let cube = new THREE.Mesh(geometry, material);
    cube.name = name;
    // cube.position.set(x, y, z);
    cube.castShadow = true;
    cube.receiveShadow = false;

    return cube;
};

let createPlayerModel = function (skinTexture, capeTexture, v, slim, optifineCape) {
    console.log("optifine cape: " + optifineCape);

    let headGroup = new THREE.Object3D();
    headGroup.position.x = 0;
    headGroup.position.y = 28;
    headGroup.position.z = 0;
    headGroup.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
    let head = createCube(skinTexture,
        8, 8, 8,
        texturePositions.head[v],
        slim,
        "head"
    );
    head.translateOnAxis(new THREE.Vector3(0, 1, 0), 4);
    headGroup.add(head);
    if (v >= 1) {
        let hat = createCube(skinTexture,
            8.504, 8.504, 8.504,
            texturePositions.hat,
            slim,
            "hat",
            true
        );
        hat.translateOnAxis(new THREE.Vector3(0, 1, 0), 4);
        headGroup.add(hat);
    }

    let bodyGroup = new THREE.Object3D();
    bodyGroup.position.x = 0;
    bodyGroup.position.y = 18;
    bodyGroup.position.z = 0;
    let body = createCube(skinTexture,
        8, 12, 4,
        texturePositions.body[v],
        slim,
        "body"
    );
    bodyGroup.add(body);
    if (v >= 1) {
        let jacket = createCube(skinTexture,
            8.504, 12.504, 4.504,
            texturePositions.jacket,
            slim,
            "jacket",
            true
        );
        bodyGroup.add(jacket);
    }

    let leftArmGroup = new THREE.Object3D();
    leftArmGroup.position.x = slim ? -5.5 : -6;
    leftArmGroup.position.y = 18;
    leftArmGroup.position.z = 0;
    leftArmGroup.translateOnAxis(new THREE.Vector3(0, 1, 0), 4);
    let leftArm = createCube(skinTexture,
        slim ? 3 : 4, 12, 4,
        texturePositions.leftArm[v],
        slim,
        "leftArm"
    );
    leftArm.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
    leftArmGroup.add(leftArm);
    if (v >= 1) {
        let leftSleeve = createCube(skinTexture,
            slim ? 3.504 : 4.504, 12.504, 4.504,
            texturePositions.leftSleeve,
            slim,
            "leftSleeve",
            true
        );
        leftSleeve.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
        leftArmGroup.add(leftSleeve);
    }

    let rightArmGroup = new THREE.Object3D();
    rightArmGroup.position.x = slim ? 5.5 : 6;
    rightArmGroup.position.y = 18;
    rightArmGroup.position.z = 0;
    rightArmGroup.translateOnAxis(new THREE.Vector3(0, 1, 0), 4);
    let rightArm = createCube(skinTexture,
        slim ? 3 : 4, 12, 4,
        texturePositions.rightArm[v],
        slim,
        "rightArm"
    );
    rightArm.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
    rightArmGroup.add(rightArm);
    if (v >= 1) {
        let rightSleeve = createCube(skinTexture,
            slim ? 3.504 : 4.504, 12.504, 4.504,
            texturePositions.rightSleeve,
            slim,
            "rightSleeve",
            true
        );
        rightSleeve.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
        rightArmGroup.add(rightSleeve);
    }

    let leftLegGroup = new THREE.Object3D();
    leftLegGroup.position.x = -2;
    leftLegGroup.position.y = 6;
    leftLegGroup.position.z = 0;
    leftLegGroup.translateOnAxis(new THREE.Vector3(0, 1, 0), 4);
    let leftLeg = createCube(skinTexture,
        4, 12, 4,
        texturePositions.leftLeg[v],
        slim,
        "leftLeg"
    );
    leftLeg.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
    leftLegGroup.add(leftLeg);
    if (v >= 1) {
        let leftTrousers = createCube(skinTexture,
            4.504, 12.504, 4.504,
            texturePositions.leftTrousers,
            slim,
            "leftTrousers",
            true
        );
        leftTrousers.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
        leftLegGroup.add(leftTrousers);
    }

    let rightLegGroup = new THREE.Object3D();
    rightLegGroup.position.x = 2;
    rightLegGroup.position.y = 6;
    rightLegGroup.position.z = 0;
    rightLegGroup.translateOnAxis(new THREE.Vector3(0, 1, 0), 4);
    let rightLeg = createCube(skinTexture,
        4, 12, 4,
        texturePositions.rightLeg[v],
        slim,
        "rightLeg"
    );
    rightLeg.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
    rightLegGroup.add(rightLeg);
    if (v >= 1) {
        let rightTrousers = createCube(skinTexture,
            4.504, 12.504, 4.504,
            texturePositions.rightTrousers,
            slim,
            "rightTrousers",
            true
        );
        rightTrousers.translateOnAxis(new THREE.Vector3(0, 1, 0), -4);
        rightLegGroup.add(rightTrousers);
    }

    let playerGroup = new THREE.Object3D();
    playerGroup.add(headGroup);
    playerGroup.add(bodyGroup);
    playerGroup.add(leftArmGroup);
    playerGroup.add(rightArmGroup);
    playerGroup.add(leftLegGroup);
    playerGroup.add(rightLegGroup);

    if (capeTexture) {
        let capeGroup = new THREE.Object3D();
        capeGroup.position.x = 0;
        capeGroup.position.y = 16;
        capeGroup.position.z = -2.5;
        capeGroup.translateOnAxis(new THREE.Vector3(0, 1, 0), 8);
        capeGroup.translateOnAxis(new THREE.Vector3(0, 0, 1), 0.5);
        let cape = createCube(capeTexture,
            8, 16, 1,
            optifineCape ? texturePositions.capeOptifine : texturePositions.cape,
            false,
            "cape");
        cape.translateOnAxis(new THREE.Vector3(0, 1, 0), -8);
        cape.translateOnAxis(new THREE.Vector3(0, 0, 1), -0.5);
        cape.rotation.y = toRadians(180);
        capeGroup.add(cape)

        playerGroup.add(capeGroup);
    }

    return playerGroup;
};

// From https://soledadpenades.com/articles/three-js-tutorials/drawing-the-coordinate-axes/
let buildAxes = function (length) {
    let axes = new THREE.Object3D();

    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(length, 0, 0), 0xFF0000, false)); // +X
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(-length, 0, 0), 0xFF0000, true)); // -X
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, length, 0), 0x00FF00, false)); // +Y
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, -length, 0), 0x00FF00, true)); // -Y
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, length), 0x0000FF, false)); // +Z
    axes.add(buildAxis(new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -length), 0x0000FF, true)); // -Z

    return axes;

};
let buildAxis = function (src, dst, colorHex, dashed) {
    let geom = new THREE.Geometry(),
        mat;

    if (dashed) {
        mat = new THREE.LineDashedMaterial({linewidth: 3, color: colorHex, dashSize: 3, gapSize: 3});
    } else {
        mat = new THREE.LineBasicMaterial({linewidth: 3, color: colorHex});
    }

    geom.vertices.push(src.clone());
    geom.vertices.push(dst.clone());
    geom.computeLineDistances(); // This one is SUPER important, otherwise dashed lines will appear as simple plain lines

    return new THREE.Line(geom, mat, THREE.LinePieces);
};

function toRadians(angle) {
    return angle * (Math.PI / 180);
}

function getJSON(url, callback) {
    let xhr = new XMLHttpRequest();
    xhr.open('GET', url, true);
    xhr.responseType = 'json';
    xhr.onload = function () {
        let status = xhr.status;
        if (status === 200) {
            callback(null, xhr.response);
        } else {
            callback(xhr.statusText, xhr.response);
        }
    };
    xhr.send();
}

SkinRender.prototype.constructor = SkinRender;

window.SkinRender = SkinRender;

export default SkinRender;