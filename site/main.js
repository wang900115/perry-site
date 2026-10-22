document.getElementById('y').textContent = new Date().getFullYear();
(function () {
    var h = location.hostname, p = location.pathname, m = p.match(/\/ipfs\/([a-zA-Z0-9]+)/) || h.match(/^([a-z0-9]{46,})\.ipfs\./);
    document.getElementById('cid').textContent = m ? m[1].slice(0, 10) + '…' + m[1].slice(-6) : '—';
})();
document.querySelectorAll('.marquee-track').forEach(function (track) {
    var group = track.querySelector('.marquee-group');
    if (!group) return;
    var copy = group.cloneNode(true);
    copy.setAttribute('aria-hidden', 'true');
    copy.querySelectorAll('a').forEach(function (link) { link.tabIndex = -1 });
    track.appendChild(copy);
    track.parentElement.classList.add('is-ready');
});
document.querySelectorAll('.globe-scene').forEach(function (scene) {
    var sphere = scene.querySelector('.globe'), canvas = scene.querySelector('.globe-canvas');
    var chips = Array.prototype.slice.call(scene.querySelectorAll('.globe-skills .chip'));
    var gl = canvas.getContext('webgl', { alpha: true, antialias: true, preserveDrawingBuffer: true });
    var rx = 20, ry = -30;
    var skillCoordinates = [
        [39, 116], [49, 10], [40, 80], [20, 78], [39, -98], [58, -110],
        [-15, -50], [0, 110], [36, 138], [40, 100], [10, -75],
        [42, -120], [50, -100], [40, -75], [-20, 47], [30, 31], [-5, 20],
        [68, -45], [-30, -70], [55, 100],
        [25, 100], [25, -10], [-42, 147], [20, -100], [-25, 25], [-25, 135]
    ];
    var reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
    var lastFrame = 0, frameRequest = 0;

    if (!gl) {
        console.error('Interactive globe requires WebGL; using the static map fallback.');
        sphere.classList.add('webgl-fallback');
    }

    chips.forEach(function (chip, index) {
        var coordinates = skillCoordinates[index];
        chip.dataset.lat = coordinates[0] * Math.PI / 180;
        chip.dataset.lon = coordinates[1] * Math.PI / 180;
    });

    var program = null, positionLocation = null, uvLocation = null;
    var rotationXLocation = null, rotationYLocation = null, samplerLocation = null;
    var texture = null, vertexBuffer = null, uvBuffer = null, indexBuffer = null, indexCount = 0;

    if (gl) {
        var vertexSource = [
            'attribute vec3 aPosition;',
            'attribute vec2 aUv;',
            'uniform float uRotationX;',
            'uniform float uRotationY;',
            'varying vec2 vUv;',
            'varying vec3 vNormal;',
            'void main() {',
            '  float sx = sin(uRotationX), cx = cos(uRotationX);',
            '  float sy = sin(uRotationY), cy = cos(uRotationY);',
            '  vec3 p = vec3(aPosition.x * cy + aPosition.z * sy, aPosition.y, -aPosition.x * sy + aPosition.z * cy);',
            '  p = vec3(p.x, p.y * cx - p.z * sx, p.y * sx + p.z * cx);',
            '  vNormal = normalize(p);',
            '  vUv = aUv;',
            '  gl_Position = vec4(p.xy * 0.98, -p.z * 0.5, 1.0);',
            '}'
        ].join('\n');
        var fragmentSource = [
            'precision mediump float;',
            'uniform sampler2D uMap;',
            'varying vec2 vUv;',
            'varying vec3 vNormal;',
            'void main() {',
            '  vec4 map = texture2D(uMap, vUv);',
            '  vec3 normal = normalize(vNormal);',
            '  vec3 light = normalize(vec3(-0.48, 0.42, 0.78));',
            '  float diffuse = max(dot(normal, light), 0.0);',
            '  float landMask = smoothstep(0.06, 0.82, map.a);',
            '  vec3 ocean = mix(vec3(0.022, 0.06, 0.11), vec3(0.055, 0.16, 0.29), diffuse);',
            '  vec3 land = map.rgb * (0.34 + 0.35 * diffuse);',
            '  float longitudeGrid = 1.0 - smoothstep(0.0, 0.018, abs(sin((vUv.x - 0.5) * 37.699)));',
            '  float latitudeGrid = 1.0 - smoothstep(0.0, 0.018, abs(sin((vUv.y - 0.5) * 18.85)));',
            '  float grid = max(longitudeGrid, latitudeGrid) * 0.13;',
            // '  float rim = pow(1.0 - max(normal.z, 0.0), 2.2);',
            // '  float specular = pow(max(dot(normal, normalize(light + vec3(0.0, 0.0, 1.0))), 0.0), 28.0);',
            '  vec3 color = mix(ocean, land, landMask);',
            // '  color = mix(color, vec3(0.34, 0.49, 0.66), grid);',
            // '  color += vec3(0.12, 0.38, 0.72) * rim * 0.68;',
            // '  color += vec3(0.55, 0.76, 1.0) * specular * 0.34;',
            '  gl_FragColor = vec4(color, 1.0);',
            '}'
        ].join('\n');

        function compileShader(type, source) {
            var shader = gl.createShader(type);
            gl.shaderSource(shader, source);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Globe shader compilation failed:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        var vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
        var fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
        if (vertexShader && fragmentShader) {
            program = gl.createProgram();
            gl.attachShader(program, vertexShader);
            gl.attachShader(program, fragmentShader);
            gl.linkProgram(program);
            if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
                console.error('Globe shader linking failed:', gl.getProgramInfoLog(program));
                gl.deleteProgram(program);
                program = null;
            }
            gl.deleteShader(vertexShader);
            gl.deleteShader(fragmentShader);
        }

        if (program) {
            var positions = [], uvs = [], indices = [];
            var latSegments = 72, lonSegments = 144;
            for (var latIndex = 0; latIndex <= latSegments; latIndex++) {
                var lat = -Math.PI / 2 + Math.PI * latIndex / latSegments;
                for (var lonIndex = 0; lonIndex <= lonSegments; lonIndex++) {
                    var lon = -Math.PI + 2 * Math.PI * lonIndex / lonSegments;
                    var cosLat = Math.cos(lat);
                    positions.push(cosLat * Math.sin(lon), Math.sin(lat), cosLat * Math.cos(lon));
                    uvs.push(lonIndex / lonSegments, latIndex / latSegments);
                }
            }
            for (var row = 0; row < latSegments; row++) {
                for (var col = 0; col < lonSegments; col++) {
                    var first = row * (lonSegments + 1) + col;
                    var next = first + lonSegments + 1;
                    indices.push(first, next, first + 1, next, next + 1, first + 1);
                }
            }
            indexCount = indices.length;
            vertexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(positions), gl.STATIC_DRAW);
            uvBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(uvs), gl.STATIC_DRAW);
            indexBuffer = gl.createBuffer();
            gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
            gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(indices), gl.STATIC_DRAW);

            positionLocation = gl.getAttribLocation(program, 'aPosition');
            uvLocation = gl.getAttribLocation(program, 'aUv');
            rotationXLocation = gl.getUniformLocation(program, 'uRotationX');
            rotationYLocation = gl.getUniformLocation(program, 'uRotationY');
            samplerLocation = gl.getUniformLocation(program, 'uMap');
            texture = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, texture);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
            gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);

            var mapImage = new Image();
            mapImage.onload = function () {
                gl.bindTexture(gl.TEXTURE_2D, texture);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, mapImage);
                sphere.classList.add('webgl-ready');
                render();
            };
            mapImage.onerror = function () {
                console.error('Could not load the globe map texture:', mapImage.src);
                sphere.classList.add('webgl-fallback');
            };
            mapImage.src = './world-map.svg';
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
        }
    }

    function drawSphere(bounds) {
        var pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        var width = Math.max(1, Math.round(bounds.width * pixelRatio));
        var height = Math.max(1, Math.round(bounds.height * pixelRatio));
        if (canvas.width !== width || canvas.height !== height) {
            canvas.width = width;
            canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
        gl.useProgram(program);
        gl.bindBuffer(gl.ARRAY_BUFFER, vertexBuffer);
        gl.enableVertexAttribArray(positionLocation);
        gl.vertexAttribPointer(positionLocation, 3, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, uvBuffer);
        gl.enableVertexAttribArray(uvLocation);
        gl.vertexAttribPointer(uvLocation, 2, gl.FLOAT, false, 0, 0);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, indexBuffer);
        gl.uniform1f(rotationXLocation, rx * Math.PI / 180);
        gl.uniform1f(rotationYLocation, ry * Math.PI / 180);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.uniform1i(samplerLocation, 0);
        gl.drawElements(gl.TRIANGLES, indexCount, gl.UNSIGNED_SHORT, 0);
    }

    function render() {
        var bounds = scene.getBoundingClientRect(), radius = Math.min(bounds.width, bounds.height) * .46;
        if (gl && program) drawSphere(bounds);
        else sphere.style.setProperty('--globe-map-shift', (-((ry % 360) / 360) * sphere.clientWidth) + 'px');
        chips.forEach(function (chip) {
            var lat = Number(chip.dataset.lat), lon = Number(chip.dataset.lon);
            var x = Math.cos(lat) * Math.sin(lon), y = Math.sin(lat), z = Math.cos(lat) * Math.cos(lon);
            var yr = ry * Math.PI / 180, xr = rx * Math.PI / 180;
            var turnedX = x * Math.cos(yr) + z * Math.sin(yr);
            var turnedZ = -x * Math.sin(yr) + z * Math.cos(yr);
            var turnedY = y * Math.cos(xr) - turnedZ * Math.sin(xr);
            var depth = y * Math.sin(xr) + turnedZ * Math.cos(xr);
            var scale = 4 / (4 - depth), visible = depth > -.18;
            var left = bounds.width / 2 + turnedX * radius * scale;
            var top = bounds.height / 2 - turnedY * radius * scale;
            var labelRadius = Math.max(0, radius - Math.max(chip.offsetWidth, chip.offsetHeight) * scale / 2 - 3);
            var offsetX = left - bounds.width / 2, offsetY = top - bounds.height / 2;
            var distance = Math.sqrt(offsetX * offsetX + offsetY * offsetY);
            if (distance > labelRadius) { left = bounds.width / 2 + offsetX * labelRadius / distance; top = bounds.height / 2 + offsetY * labelRadius / distance }
            chip.style.display = visible ? '' : 'none';
            chip.style.zIndex = String(Math.round((depth + 1) * 100));
            chip.style.opacity = String(Math.max(.55, Math.min(1, .72 + depth * .28)));
            chip.style.transform = 'translate3d(' + left + 'px, ' + top + 'px, 0) translate(-50%, -50%) scale(' + scale + ')';
        });
    }

    function animate(now) {
        frameRequest = 0;
        var delta = lastFrame ? Math.min(now - lastFrame, 50) : 0;
        lastFrame = now;
        if (!reducedMotion && !document.hidden) {
            ry += delta * .0067;
            render();
        }
        if (!reducedMotion && !document.hidden) {
            frameRequest = requestAnimationFrame(animate);
        }
    }

    function requestRender() {
        if (!frameRequest) frameRequest = requestAnimationFrame(animate);
    }

    function resumeAnimation() {
        lastFrame = 0;
        requestRender();
    }

    document.addEventListener('visibilitychange', function () {
        lastFrame = 0;
        if (!document.hidden) requestRender();
    });

    window.addEventListener('resize', resumeAnimation);
    if (gl && !program) sphere.classList.add('webgl-fallback');
    render();
    if (gl && program) requestRender();
});
document.querySelectorAll('[data-s]').forEach(function (el) {
    fetch('https://api.github.com/repos/wang900115/' + el.dataset.s).then(function (r) { return r.ok ? r.json() : null }).then(function (j) { if (j && typeof j.stargazers_count === 'number') el.textContent = j.stargazers_count }).catch(function () { })
});

// terminal typing (language-aware)
var T = {
    zh: { city: '"台北"', focus: ['"分散式"', '"高併發"', '"交易"'] },
    en: { city: '"Taipei"', focus: ['"distributed"', '"concurrency"', '"trading"'] }
};
var timer = null;
function lines(l) {
    var t = T[l]; return [
        ['c', '// whoami'], ['\n'],
        ['k', 'name'], ['', '     = '], ['s', '"Perry Wang"'], ['\n'],
        ['k', 'city'], ['', '     = '], ['s', t.city], ['\n'],
        ['k', 'langs'], ['', '    = []string{'], ['s', '"Go"'], ['', ', '], ['s', '"Rust"'], ['', ', '], ['s', '"Tolk"'], ['', ', '], ['s', '"Solidity"'], ['', ', '], ['s', '"Etc..."'], ['', '}'], ['\n'],
        ['k', 'focus'], ['', '    = []string{'], ['s', t.focus[0]], ['', ', '], ['s', t.focus[1]], ['', ', '], ['s', t.focus[2]], ['', '}'], ['\n'],
        ['k', 'hosting'], ['', '  = '], ['w', '"IPFS"'], ['\n'],
        ['c', '$ '], ['cur']];
}
function type(l) {
    clearTimeout(timer); var L = lines(l), el = document.getElementById('t'), i = 0, j = 0, sp = null,
        fast = matchMedia('(prefers-reduced-motion: reduce)').matches;
    el.innerHTML = '<span class="c">$</span> <span class="k">go run</span> ./cmd/perry\n';
    function step() {
        if (i >= L.length) return; var x = L[i];
        if (x[0] === '\n') { el.appendChild(document.createTextNode('\n')); i++; timer = setTimeout(step, fast ? 0 : 110); return }
        if (x[0] === 'cur') { var c = document.createElement('span'); c.id = 'cursor'; el.appendChild(c); return }
        if (!sp) { sp = document.createElement('span'); if (x[0]) sp.className = x[0]; el.appendChild(sp); j = 0 }
        j = fast ? x[1].length : j + 1; sp.textContent = x[1].slice(0, j);
        if (j >= x[1].length) { sp = null; i++ } timer = setTimeout(step, fast ? 0 : 18)
    }
    timer = setTimeout(step, 300)
}

// language toggle
function setLang(l) {
    var d = document.documentElement; d.className = l; d.lang = l === 'en' ? 'en' : 'zh-Hant';
    try { localStorage.setItem('lang', l) } catch (e) { } type(l)
}
document.querySelectorAll('.lt button').forEach(function (b) { b.onclick = function () { if (document.documentElement.className !== b.dataset.l) setLang(b.dataset.l) } });
type(document.documentElement.className === 'en' ? 'en' : 'zh');
