twgl.setAttributePrefix("a_");
var m4 = twgl.m4;
var gl = twgl.getWebGLContext(document.getElementById("c"));

var obstacleSize = 2;
var towerWidth = 3;
var towerHeight = gl.canvas.clientHeight;
var wormWidth = 1;
var wormHeight = 10;

var food  = {
  bufferInfo: twgl.primitives.createPlaneBufferInfo(gl, 1, 1.5, 100, 100, m4.rotationX(Math.PI / 2)),
  programInfo: twgl.createProgramInfo(gl, ["quad-vs", "tower-fs"]),
  rotationSpeed: 1,
  timeTranslation: [0, 0.001, 0]
};

// singular for now, this should be plural
var obstacle = {
  bufferInfo: twgl.primitives.createCubeBufferInfo(gl, obstacleSize),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: 1,
  scale: [1, 1, 1],
  timeTranslation: [0, 0.001, 0],
  translation: [towerWidth, 0, 0]
};

var tower = {
  bufferInfo: twgl.primitives.createCylinderBufferInfo(gl, towerWidth, towerHeight, 24, 2),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: 1
};

var wormVertices = twgl.primitives.createCylinderVertices(wormWidth, wormHeight, 24, 100);

// wormSpine entries are radius, height, and tilt
var wormSpine = [[5, 0, 0], [5, 0, 0], [5,0,0]];

var numWormVertices = wormVertices.position.length/3;
wormVertices.spine = new Float32Array(3*numWormVertices);
var segmentLength = Math.PI/4, verticesPerSegment = 480, wormExtension = 0;
var wormShift = 0, wormOffset = Math.PI, wormLength = segmentLength*(wormSpine.length - 2);

function advanceWormSpine(delta) {
  var lengthDelta = delta/verticesPerSegment;
  wormOffset += lengthDelta;
  wormShift += delta;
  if (wormExtension > 0) {
    var diff = Math.min(lengthDelta, wormExtension);
    wormExtension -= diff;
    wormLength += diff;
    wormOffset -= diff;
  }
  var threshold = verticesPerSegment;
  while (wormShift >= threshold) {
    wormSpine.splice(0, 1);
    var newSegment = _.cloneDeep(_.last(wormSpine));
    wormSpine.push(newSegment);
    wormShift -= threshold;
  }
}

function addWormSegment() {
  var newSegment = _.cloneDeep(_.last(wormSpine));
  wormExtension += segmentLength;
  wormSpine.push(newSegment);
}

function nudgeWormSpine(amount) {
  var target = _.last(wormSpine);
  var previous = wormSpine[wormSpine.length - 2];
  var maxTRange = verticesPerSegment;
  var tDiff = wormShift/maxTRange;
  var allowance = Math.sqrt(10 - tDiff*tDiff);
  if (Math.abs(target[1] - previous[1]) < allowance) target[1] += amount;
}

function applyWormSpine() {
  _.times(numWormVertices, function(i) {
    var numSegments = wormSpine.length;
    var scaled = Math.min((i + wormShift)/verticesPerSegment, wormLength + wormShift/verticesPerSegment);
    var index = Math.floor(scaled);
    var alpha = Math.min(scaled - index, 1);

    var lower = wormSpine[Math.min(index, numSegments - 1)];
    var upper = wormSpine[Math.min(index + 1, numSegments - 1)];

    wormVertices.spine[3*i] = alpha*upper[0] + (1.0 - alpha)*lower[0];
    wormVertices.spine[3*i + 1] = alpha*upper[1] + (1.0 - alpha)*lower[1];
    wormVertices.spine[3*i + 2] = Math.min(segmentLength*i/verticesPerSegment, wormLength) + wormOffset;
  });
}

applyWormSpine(0);

var worm = {
  bufferInfo: twgl.createBufferInfoFromArrays(gl, wormVertices),
  programInfo: twgl.createProgramInfo(gl, ["worm-vs", "tower-fs"]),
};

var objectsToRender = [ food, obstacle, tower, worm ];

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
    rotation: objectsToRender[ii].rotation || 0,
    scale: objectsToRender[ii].scale || [1,1,1],
    timeTranslation: objectsToRender[ii].timeTranslation || [0, 0, 0],
    translation: objectsToRender[ii].translation || [0, 0, 0],
    ySpeed: objectsToRender[ii].rotationSpeed || 0,
    uniforms: uniforms,
  });
}

var lastTime = null;
var dt = 0;
function render(time) {
  if (lastTime == null) lastTime = time;
  var delta = time - lastTime;
  lastTime = time;

  time *= 0.001;
  dt++;
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

  advanceWormSpine(delta/2);
  if (keysDown[87]) nudgeWormSpine(0.1);
  else if (keysDown[83])  nudgeWormSpine(-0.1);
  applyWormSpine();
  var wormSpineBuffer = worm.bufferInfo.attribs.a_spine.buffer;
  gl.bindBuffer(gl.ARRAY_BUFFER, wormSpineBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, wormVertices.spine, gl.STATIC_DRAW);
  
  objects.forEach(function(obj) {
    var uni = obj.uniforms;
    var world = uni.u_world;
    var timeTranslation = obj.timeTranslation.map(function(coord) { return coord * dt; });
    uni.u_mousePos = lastMouse;
    m4.identity(world);
    m4.rotateY(world, time * obj.ySpeed, world);
    m4.scale(world, obj.scale, world);
    m4.translate(world, obj.translation, world);
    m4.translate(world, timeTranslation, world);
    m4.transpose(m4.inverse(world, uni.u_worldInverseTranspose), uni.u_worldInverseTranspose);
    m4.multiply(uni.u_world, viewProjection, uni.u_worldViewProjection);
  });

  twgl.drawObjectList(gl, drawObjects);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
