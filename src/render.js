twgl.setAttributePrefix("a_");
var v3 = twgl.v3;
var m4 = twgl.m4;
var gl = twgl.getWebGLContext(document.getElementById("c"));

var obstacleSize = 2;
var towerWidth = 4;
var towerHeight = gl.canvas.clientHeight;
var wormWidth = 1;
var wormHeight = 10;
var lose = false;

var skyCylinder = {
  bufferInfo: twgl.primitives.createCylinderBufferInfo(gl, 20, 100, 24, 2),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: 1
};

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
  radius: obstacleSize / 2,
  rotationSpeed: 1,
  scale: [1, 1, 1],
  timeTranslation: [0, 0.001, 0],
  translation: [towerWidth, 0, 0],
  name: "obstacle"
};

var tower = {
  bufferInfo: twgl.primitives.createCylinderBufferInfo(gl, towerWidth, towerHeight, 24, 2),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: 1
};

var wormVertices = twgl.primitives.createCylinderVertices(wormWidth, wormHeight, 24, 100);

// wormSpine entries are radius, height, and tilt
var wormSpine = [[5, 0, 0], [5, 0, 0], [5,0,0]];
var wormRadiusMin = 5, wormRadiusMax = 7;

var numWormVertices = wormVertices.position.length/3;
wormVertices.spine = new Float32Array(3*numWormVertices);
var segmentLength = Math.PI/4, verticesPerSegment = 240, wormExtension = 0;
var wormShift = 0, wormOffset = 5/4*Math.PI, wormLength = segmentLength*(wormSpine.length - 2);
var wormHealth = 100, wormDamaged = 0;
var damageColors = [[0.3, 0, 0, 0], [0.3, 0.3, 0.3, 0]];

function damageWorm(amount) {
  wormHealth -= amount;
  healthIndicator.style.width = wormHealth + '%';
  wormDamaged += amount;
}

function findValidRadius(hdiff, curRadius) {
  var hypotenuse = 2*wormWidth;
  var rdiff = Math.sqrt(hypotenuse*hypotenuse - hdiff*hdiff);
  if (curRadius + rdiff <= wormRadiusMax) return curRadius + rdiff;
  if (curRadius - rdiff >= wormRadiusMin) return curRadius - rdiff;
}

function detectSelfIntersection(radiusQuery) {
  var lookAheadRadians = segmentLength;
  var lookAhead = verticesPerSegment*lookAheadRadians;
  var i = Math.floor(verticesPerSegment*wormLength/segmentLength);
  var height = wormVertices.spine[3*i + 1];
  var radiusQuery = radiusQuery || wormVertices.spine[3*i];
  var radians = wormLength;
  var pi2 = 2*Math.PI; 

  while (radians - pi2 + lookAheadRadians >= 0) {
    radians -= pi2;
    var j = Math.floor(verticesPerSegment*radians/segmentLength);
    for (var a = 0; a < lookAhead; a++) {
      var hdiff = height - wormVertices.spine[3*(j+a) + 1];
      var rdiff = radiusQuery -  wormVertices.spine[3*(j+a)];
      if (hdiff*hdiff + rdiff*rdiff <= wormWidth*wormWidth) return [a, hdiff, wormVertices.spine[3*i]];
    }
  }
}

function advanceWormSpine(delta) {
  var lengthDelta = delta/verticesPerSegment;
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
    var scaled = Math.min((i + wormShift)/verticesPerSegment, wormLength/segmentLength + wormShift/verticesPerSegment);
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

function getWormHeadPosition() {
  var index = 3*(numWormVertices-1);
  return [0, wormVertices.spine[index+1], -wormVertices.spine[index]];
}

var worm = {
  bufferInfo: twgl.createBufferInfoFromArrays(gl, wormVertices),
  programInfo: twgl.createProgramInfo(gl, ["worm-vs", "tower-fs"]),
  radius: wormWidth,
  center: getWormHeadPosition(),
  collide: function(other) {
    if (other === this) { return; }
    var epsilon = 0.01;
    if (v3.length(v3.subtract(this.worldCenter, other.worldCenter)) < this.radius + other.radius + epsilon) {
      lose = true;
    }
  },
  name: "worm"
};

var objectsToRender = [ skyCylinder, food, obstacle, tower, worm ];

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
    u_emissive: [0, 0, 0, 0],
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
  var object = (function() {
      var thisObject = {
        center: objectsToRender[ii].center || [0,0,0],
        name: objectsToRender[ii].name || "",
        radius: objectsToRender[ii].radius, // better have a radius!
        rotation: objectsToRender[ii].rotation || 0,
        scale: objectsToRender[ii].scale || [1,1,1],
        timeTranslation: objectsToRender[ii].timeTranslation || [0, 0, 0],
        translation: objectsToRender[ii].translation || [0, 0, 0],
        ySpeed: objectsToRender[ii].rotationSpeed || 0,
        uniforms: uniforms,
      };
      if (objectsToRender[ii].collide) thisObject.collide = objectsToRender[ii].collide.bind(thisObject);
      return thisObject;
    })();
  objectsToRender[ii].renderTarget = object;
  objects.push(object);
}

function checkSelfIntersection() {
  var lastSpine = _.last(wormSpine);
  var wormSelfIntersect = detectSelfIntersection();
  if (wormSelfIntersect) {
    var correction = findValidRadius(wormSelfIntersect[1], wormSelfIntersect[2]);
    if (correction) lastSpine[0] += (correction - lastSpine[0]);
    if (wormSelfIntersect[0] == 0) damageWorm(1);
  } else if (lastSpine[0] > wormRadiusMin && detectSelfIntersection(wormRadiusMin) == null) {
    lastSpine[0] += 0.1*(wormRadiusMin - lastSpine[0]); 
  }
}

function colorWormDamage(time) {
  var damageMin = 0.0000001;
  var uniforms = worm.renderTarget.uniforms;
  if (wormDamaged > damageMin) {
    uniforms.u_emissive = damageColors[Math.floor(10*time) % damageColors.length];
  }
  if (wormDamaged < damageMin) worm.renderTarget.uniforms.u_emissive = [0, 0, 0, 0];
  wormDamaged /= 2;
}

var lastTime = null;
var dt = 0;
function render(time) {
  if (!lose) {
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
    checkSelfIntersection();
    colorWormDamage(time);

    var wormSpineBuffer = worm.bufferInfo.attribs.a_spine.buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, wormSpineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, wormVertices.spine, gl.STATIC_DRAW);

    objects.forEach(function(obj) {
      if (obj.name === "worm") {
        obj.center = getWormHeadPosition();
      }
      var uni = obj.uniforms;
      var world = uni.u_world;
      var timeTranslation = obj.timeTranslation.map(function(coord) { return coord * dt; });
      uni.u_mousePos = lastMouse;
      m4.identity(world);
      m4.rotateY(world, time * obj.ySpeed, world);
      m4.scale(world, obj.scale, world);
      m4.translate(world, obj.translation, world);
      m4.translate(world, timeTranslation, world);
      obj.worldCenter = m4.transformPoint(uni.u_world, obj.center);
      m4.transpose(m4.inverse(world, uni.u_worldInverseTranspose), uni.u_worldInverseTranspose);
      m4.multiply(uni.u_world, viewProjection, uni.u_worldViewProjection);
    });

    objects.forEach(function(thisObject) {
      if (thisObject.collide) {
        objects.forEach(thisObject.collide);
      }
    });
  }

  twgl.drawObjectList(gl, drawObjects);

  requestAnimationFrame(render);
}
requestAnimationFrame(render);
