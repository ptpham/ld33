(function Tower() {
  twgl.setAttributePrefix("a_");
  var m4 = twgl.m4;
  var gl = twgl.getWebGLContext(document.getElementById("c"));
  var programInfo = twgl.createProgramInfo(gl, ["tower-vs", "tower-fs"]);
  
  var tower = createTower();  

  // camera, lighting, texture
  var lightWorldPosition = [1, 8, -10];
  var lightColor = [1, 1, 1, 1];
  var camera = m4.identity();
  var view = m4.identity();
  var viewProjection = m4.identity();
  var baseHue = 120;
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

  var uniforms = {
    u_lightWorldPos: lightWorldPosition,
    u_lightColor: lightColor,
    u_diffuseMult: chroma.hsv(baseHue, 0.4, 0.8).gl(),
    u_specular: [1, 1, 1, 1],
    u_shininess: 50,
    u_specularFactor: 1,
    u_diffuse: tex,
    u_viewInverse: camera,
    u_world: m4.identity(),
    u_worldInverseTranspose: m4.identity(),
    u_worldViewProjection: m4.identity(),
  };
  
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
  
    var world = uniforms.u_world;
    m4.identity(world);
    m4.rotateY(world, time * tower.rotationSpeed, world);
    m4.transpose(m4.inverse(world, uniforms.u_worldInverseTranspose), uniforms.u_worldInverseTranspose);
    m4.multiply(uniforms.u_world, viewProjection, uniforms.u_worldViewProjection);
  
    twgl.drawObjectList(gl, [{
      bufferInfo: tower.bufferInfo,
      programInfo: programInfo,
      uniforms: uniforms
    }]);
  
    requestAnimationFrame(render);
  }
  requestAnimationFrame(render);

  function createTower() {
    return {
        bufferInfo: twgl.primitives.createCylinderBufferInfo(gl, 2, gl.canvas.clientHeight, 24, 2),
        rotationSpeed: 1
    };
  }
})();
