twgl.setAttributePrefix("a_");
var m4 = twgl.m4;
var gl = twgl.getWebGLContext(document.getElementById("c"));

var obstacleSize = 2;
var towerWidth = 3;
var towerHeight = gl.canvas.clientHeight;
var wormWidth = 1;
var wormHeight = 10;

// singular for now, this should be plural
var obstacle = {
  bufferInfo: twgl.primitives.createCubeBufferInfo(gl, obstacleSize),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: 1,
  scale: [1, 2, 1],
  translation: [towerWidth, 0, 0]
};

var tower = {
  bufferInfo: twgl.primitives.createCylinderBufferInfo(gl, towerWidth, towerHeight, 24, 2),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: 1
};
var worm = {
  bufferInfo: twgl.primitives.createCylinderBufferInfo(gl, wormWidth, wormHeight, 24, 100),
  programInfo: twgl.createProgramInfo(gl, ["worm-vs", "tower-fs"]),
};

var objectsToRender = [ obstacle, tower ];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Shared values
var lightWorldPosition = [1, 8, -10];
var lightColor = [1, 1, 1, 1];
var camera = m4.identity();
var view = m4.identity();
var viewProjection = m4.identity();

var tex = twgl.createTexture(gl, {
  min: gl.NEAREST,
  mag: gl.NEAREST,
  src: [
    255, 255, 255, 255,
    192, 192, 192, 255,
    192, 192, 192, 255,
    255, 255, 255, 255,
  ],
});

var objects = [];
var drawObjects = [];
var numObjects = objectsToRender.length;
var baseHue = rand(0, 360);
for (var ii = 0; ii < numObjects; ++ii) {
  var uniforms = {
    u_lightWorldPos: lightWorldPosition,
    u_lightColor: lightColor,
    u_diffuseMult: chroma.hsv((baseHue + rand(0, 60)) % 360, 0.4, 0.8).gl(),
    u_specular: [1, 1, 1, 1],
    u_shininess: 50,
    u_specularFactor: 1,
    u_diffuse: tex,
    u_viewInverse: camera,
    u_world: m4.identity(),
    u_worldInverseTranspose: m4.identity(),
    u_worldViewProjection: m4.identity(),
  };
  drawObjects.push({
    programInfo: objectsToRender[ii].programInfo,
    bufferInfo: objectsToRender[ii].bufferInfo,
    uniforms: uniforms,
  });
  objects.push({
    scale: objectsToRender[ii].scale || [1,1,1],
    translation: objectsToRender[ii].translation || [0, 0, 0],
    ySpeed: objectsToRender[ii].rotationSpeed || 0,
    uniforms: uniforms,
  });
}

function render(time) {
  time *= 0.001;
  twgl.resizeCanvasToDisplaySize(gl.canvas);
  gl.viewport(0, 0, gl.canvas.width, gl.canvas.height);

  gl.enable(gl.DEPTH_TEST);
  gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);

  var projection = m4.perspective(30 * Math.PI / 180, gl.canvas.clientWidth / gl.canvas.clientHeight, 0.5, 100);
  var eye = [1, 4, -20];
  var target = [0, 0, 0];
  var up = [0, 1, 0];

  m4.lookAt(eye, target, up, camera);
  m4.inverse(camera, view);
  m4.multiply(view, projection, viewProjection);

  objects.forEach(function(obj) {
    var uni = obj.uniforms;
    var world = uni.u_world;
    uni.u_mousePos = lastMouse;
    m4.identity(world);
    m4.rotateY(world, time * obj.ySpeed, world);
    m4.scale(world, obj.scale, world);
    m4.translate(world, obj.translation, world);
    m4.transpose(m4.inverse(world, uni.u_worldInverseTranspose), uni.u_worldInverseTranspose);
    m4.multiply(uni.u_world, viewProjection, uni.u_worldViewProjection);
  });

  twgl.drawObjectList(gl, drawObjects);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
