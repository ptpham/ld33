twgl.setAttributePrefix("a_");
var v3 = twgl.v3;
var m4 = twgl.m4;
var gl = twgl.getWebGLContext(document.getElementById("c"));

var gridSize = 72;
var obstacleSize = 1;
var towerWidth = 5;
var towerHeight = 12;
var wormWidth = 0.5;
var wormHeight = 1;
var lose = false;
var score = 0;

var globalRotation = 1;

var skyVertices = twgl.primitives.createCylinderVertices(50, 70, 12, 1, false, false);
_.times(skyVertices.normal.length/3, function(i) {
  skyVertices.normal[3*i + 2] *= -1;
  skyVertices.normal[3*i] *= -1;
});

var skyCylinder = {
  bufferInfo: twgl.createBufferInfoFromArrays(gl, skyVertices),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: globalRotation,
  name: "sky"
};

// one food for now
var numFoodToCreate = 0;
var numObstaclesToCreate = 0;
var foodInterval = 10;
var currentFoodInterval = 0;
var obstacleInterval = 1000;
var currentObstacleInterval = 0;
var globalInterval = 0;
var minHeight = -towerHeight/3;
var maxHeight = towerHeight/3 + 1;

function createFood(timeCreated) {
  if (globalInterval > 0) {
    return false;
  }

  var rotation = 2*Math.PI * Math.floor(rand(0,gridSize))/gridSize;
  var food = {
    bufferInfo: twgl.primitives.createSphereBufferInfo(gl, obstacleSize/2, 10, 10),
    programInfo: twgl.createProgramInfo(gl, ["food-vs", "food-fs"]),
    rotation: rotation,
    rotationSpeed: globalRotation,
    radius: 0.5,
    translation: [towerWidth, towerHeight/2, 0],
    timeCreated: timeCreated,
    timeTranslation: [0, -0.005, 0],
    u_diffuseMult: [ 1, 0.2, 0, 0.9 ],
    u_emissive: [ 1, 0, 0, 1],
    name: "princess"
  };
  food.doCollide = (function() {
    score++;
    addWormSegment();
    objects.splice(objects.indexOf(this.renderTarget), 1);
    drawObjects.splice(drawObjects.indexOf(this.drawObject), 1);
    obstacleInterval--;
    obstacleInterval = Math.max(obstacleInterval, 100);
    numFoodToCreate++;
  }).bind(food);
  createObject(food);
  globalInterval += 100;
  return food;
};

function createObstacle(timeCreated, force) {
  if (!force && globalInterval > 0) {
    return false;
  }

  var rotation = 2*Math.PI * Math.floor(rand(0,gridSize)) / gridSize;
  var obstacle = {
    bufferInfo: twgl.primitives.createCubeBufferInfo(gl, obstacleSize),
    programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
    radius: obstacleSize / 2,
    rotation: rotation,
    rotationSpeed: globalRotation,
    scale: [1, 1, 1],
    timeTranslation: [0, -0.005, 0],
    timeCreated: timeCreated,
    translation: [towerWidth, towerHeight/2, 0],
    name: "obstacle",
    doCollide: function() {
      damageWorm(1);
    }
  };
  createObject(obstacle);
  globalInterval += 100;
  return obstacle;
}

var towerVertices = twgl.primitives.createCylinderVertices(towerWidth, towerHeight, 100, 10);
_.times(towerVertices.texcoord.length, function(i) {
  towerVertices.texcoord[i] *= 4;
});

var tower = {
  bufferInfo: twgl.createBufferInfoFromArrays(gl, towerVertices),
  programInfo: twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]),
  rotationSpeed: globalRotation,
  name: "tower"
};

var wormRadialSegments = 12;
var wormVertices = twgl.primitives.createCylinderVertices(wormWidth, wormHeight, wormRadialSegments, 200);

// wormSpine entries are radius, height, and tilt
var wormSpine = [[5, 0, 0], [5, 0, 0], [5,0,0]];
var wormRadiusMin = 5, wormRadiusMax = 7;

var numWormVertices = wormVertices.position.length/3;
wormVertices.spine = new Float32Array(3*numWormVertices);
var segmentLength = Math.PI/4, verticesPerSegment = 8*2*(wormRadialSegments + 1), wormExtension = 0;
var wormShift = 0, wormOffset = 5/4*Math.PI, wormLength = segmentLength*(wormSpine.length - 2);
var wormHealth = 100, wormDamaged = 0, maxSegments = numWormVertices/verticesPerSegment;
var damageColors = [[0.3, 0, 0, 0], [0.3, 0.3, 0.3, 0]];

function damageWorm(amount) {
  wormHealth -= amount;
  healthIndicator.style.width = wormHealth + '%';
  wormDamaged += amount;
  if (wormHealth < 0) {
    lose = true;
  }
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
      if (hdiff*hdiff + rdiff*rdiff <= wormWidth*wormWidth) return [a, hdiff, wormVertices.spine[3*i], j+a];
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
  if (wormSpine.length < maxSegments) {
    var newSegment = _.cloneDeep(_.last(wormSpine));
    wormExtension += segmentLength;
    wormSpine.push(newSegment);
  }
}

function nudgeWormSpine(amount) {
  var target = _.last(wormSpine);
  var previous = wormSpine[wormSpine.length - 2];
  var maxTRange = verticesPerSegment;
  var tDiff = wormShift/maxTRange;
  var allowance = Math.sqrt(10 - tDiff*tDiff);
  if (Math.abs(target[1] - previous[1]) < allowance) target[1] += amount;
  target[1] = Math.min(Math.max(target[1], minHeight), maxHeight);
}

function applyWormSpine() {
  var endVerts = 3*(wormRadialSegments);
  _.times(numWormVertices, function(i) {
    var i_use = Math.min(Math.max(i, endVerts), numWormVertices - endVerts);
    var numSegments = wormSpine.length;
    var scaled = Math.min((i_use + wormShift)/verticesPerSegment, wormLength/segmentLength + wormShift/verticesPerSegment);
    var index = Math.floor(scaled);
    var alpha = Math.min(scaled - index, 1);

    var lower = wormSpine[Math.min(index, numSegments - 1)];
    var upper = wormSpine[Math.min(index + 1, numSegments - 1)];

    wormVertices.spine[3*i] = alpha*upper[0] + (1.0 - alpha)*lower[0];
    wormVertices.spine[3*i + 1] = alpha*upper[1] + (1.0 - alpha)*lower[1];
    wormVertices.spine[3*i + 2] = Math.min(segmentLength*(i_use)/verticesPerSegment, wormLength) + wormOffset;
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
      other.doCollide();
    }
  },
  name: "worm"
};

var objectsToRender = [ skyCylinder, tower, worm ];

function rand(min, max) {
  return min + Math.random() * (max - min);
}

// Shared values
var lightWorldPosition = [8, 8, 8];
var lightColor = [1, 1, 1, 1];
var camera = m4.identity();
var view = m4.identity();
var viewProjection = m4.identity();

var textures = twgl.createTextures(gl, {
  obstacle: { src: "images/spikes.jpg" },
  tower: { src: "images/tower.jpg", mag: gl.NEAREST, min: gl.NEAREST },
  sky: { src: "images/storm.jpg" },
  worm: { src: "images/snake.jpg" },
  princess: { src: "images/woman1.jpg" },
  default: {
    min: gl.NEAREST,
    mag: gl.NEAREST,
    src: [
      255, 255, 255, 255,
      192, 192, 192, 255,
      192, 192, 192, 255,
      255, 255, 255, 255,
    ],
  }
});

var objects = [];
var drawObjects = [];
var numObjects = objectsToRender.length;
var baseHue = rand(0, 360);
for (var ii = 0; ii < numObjects; ++ii) {
  createObject(objectsToRender[ii]);
}
createFood(0);
createObstacle(0, true);
 
function createObject(objectToRender) {
  var uniforms = {
    u_lightColor: lightColor,
    u_diffuseMult: objectToRender.u_diffuseMult || [1, 1, 1, 1],
    u_specular: [1, 1, 1, 1],
    u_emissive: objectToRender.u_emissive || [0.15, 0.1, 0.2, 0],
    u_shininess: 50,
    u_specularFactor: 0,
    u_diffuse: textures[objectToRender.name] || textures["default"],
    u_viewInverse: camera,
    u_world: m4.identity(),
    u_worldInverseTranspose: m4.identity(),
    u_worldViewProjection: m4.identity(),
  };
  var drawObject = {
    programInfo: objectToRender.programInfo,
    bufferInfo: objectToRender.bufferInfo,
    uniforms: uniforms,
  };
  drawObjects.push(drawObject);
  // consider adding a pointer back to objectToRender so
  // that we don't have to read off all the values here
  var object = (function() {
      var thisObject = {
        rotation: objectToRender.rotation || 0,
        timeCreated: objectToRender.timeCreated || 0,
        doCollide: objectToRender.doCollide,
        center: objectToRender.center || [0,0,0],
        name: objectToRender.name || "",
        radius: objectToRender.radius, // better have a radius!
        rotation: objectToRender.rotation || 0,
        scale: objectToRender.scale || [1,1,1],
        timeTranslation: objectToRender.timeTranslation || [0, 0, 0],
        translation: objectToRender.translation || [0, 0, 0],
        ySpeed: objectToRender.rotationSpeed || 0,
        uniforms: uniforms,
      };
      if (objectToRender.collide) thisObject.collide = objectToRender.collide.bind(thisObject);
      return thisObject;
    })();
  objectToRender.renderTarget = object;
  objectToRender.drawObject = drawObject;
  objects.push(object);
}

function checkSelfIntersection() {
  var lastSpine = _.last(wormSpine);
  var wormSelfIntersect = detectSelfIntersection();
  if (wormSelfIntersect) {
    var correction = findValidRadius(wormSelfIntersect[1], wormSelfIntersect[2]);
    if (correction) lastSpine[0] += (correction - lastSpine[0]);
    if (wormSelfIntersect[0] == 0 && wormSelfIntersect[3] >= verticesPerSegment/2) damageWorm(1);
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
  if (globalInterval > 0) {
    globalInterval--;
  }
  if (currentObstacleInterval > obstacleInterval) {
    currentObstacleInterval = 0;
    numObstaclesToCreate++;
  } else {
    currentObstacleInterval++;
  }
  if (numObstaclesToCreate > 0 && createObstacle(dt)) {
    numObstaclesToCreate--;
  } else if (numFoodToCreate > 0 && createFood(dt)) {
    numFoodToCreate--;
  }
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
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);

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
    worm.renderTarget.uniforms.u_wormLength = _.last(wormVertices.spine);
    worm.renderTarget.uniforms.u_wormOffset = wormVertices.spine[2];

    var wormSpineBuffer = worm.bufferInfo.attribs.a_spine.buffer;
    gl.bindBuffer(gl.ARRAY_BUFFER, wormSpineBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, wormVertices.spine, gl.STATIC_DRAW);

    var worldRotation = m4.rotateY(m4.identity(), time * globalRotation);
    var transformedLight = m4.transformPoint(worldRotation, lightWorldPosition);

    objects.forEach(function(obj) {
      if (obj.name === "worm") {
        obj.center = getWormHeadPosition();
      }

      var uni = obj.uniforms;
      var world = uni.u_world;
      var timeTranslation = obj.timeTranslation.map(function(coord) { 
          var actualDt = dt - obj.timeCreated;
          return coord * actualDt;
      });
      if (obj.name === "tower") {
        uni.u_time = time;
      }
      uni.u_mousePos = lastMouse;
      m4.identity(world);
      m4.rotateY(world, obj.rotation, world);
      m4.rotateY(world, time * obj.ySpeed, world);
      m4.scale(world, obj.scale, world);
      m4.translate(world, obj.translation, world);
      m4.translate(world, timeTranslation, world);
      obj.worldCenter = m4.transformPoint(uni.u_world, obj.center);
      m4.transpose(m4.inverse(world, uni.u_worldInverseTranspose), uni.u_worldInverseTranspose);
      m4.multiply(uni.u_world, viewProjection, uni.u_worldViewProjection);
      uni.u_lightWorldPos = transformedLight;
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
