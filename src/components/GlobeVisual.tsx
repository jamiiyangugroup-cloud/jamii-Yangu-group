import { useEffect, useRef, useState } from 'react'
import * as THREE from 'three'
import { gsap } from 'gsap'
import { MapPin, RotateCcw, Search } from 'lucide-react'

type Place = { name: string; lat: number; lon: number }
type MapView = { lon: number; lat: number; zoom: number }

// GeoNames gazetteer locations. These are reference points, not claimed cooperative branches.
const places: Place[] = [
  { name: 'Nairobi', lat: -1.28333, lon: 36.81667 }, { name: 'Mombasa', lat: -4.055, lon: 39.664 },
  { name: 'Kisumu', lat: -.10221, lon: 34.76171 }, { name: 'Nakuru', lat: -.30719, lon: 36.07225 },
  { name: 'Eldoret', lat: .52036, lon: 35.26993 }, { name: 'Kakamega', lat: .284219, lon: 34.752285 },
  { name: 'Kajiado', lat: -1.85238, lon: 36.77683 }, { name: 'Nyeri', lat: -.420132, lon: 36.947594 },
  { name: 'Meru', lat: .04626, lon: 37.65587 }, { name: 'Garissa', lat: -.452752, lon: 39.64601 },
  { name: 'Machakos', lat: -1.522333, lon: 37.265212 }, { name: 'Kitale', lat: 1.015725, lon: 35.006217 },
]

// Simplified geoBoundaries Kenya ADM0 outline; each pair is [longitude, latitude].
const kenya: [number, number][] = [[40.993,-.85829],[41.58513,-1.68325],[40.88477,-2.08255],[40.63785,-2.49979],[40.26304,-2.57309],[40.12119,-3.27768],[39.80006,-3.68116],[39.60489,-4.34653],[39.20222,-4.67677],[37.7669,-3.67712],[37.69869,-3.09699],[34.07262,-1.05982],[33.903711,-.95],[33.893569,.109814],[34.18,.515],[34.6721,1.17694],[35.03599,1.90584],[34.59607,3.05374],[34.47913,3.5556],[34.005,4.249885],[34.620196,4.847123],[35.298007,5.506],[35.817448,5.338232],[35.817448,4.776966],[36.159079,4.447864],[36.855093,4.447864],[38.120915,3.598605],[38.43697,3.58851],[38.67114,3.61607],[38.89251,3.50074],[39.559384,3.42206],[39.85494,3.83879],[40.76848,4.25702],[41.1718,3.91909],[41.855083,3.918912],[40.98105,2.78452],[40.993,-.85829]]
const connections: [string, string][] = [['Nairobi','Mombasa'],['Nairobi','Kisumu'],['Nairobi','Nakuru'],['Nairobi','Garissa'],['Nairobi','Meru'],['Nakuru','Eldoret'],['Eldoret','Kitale'],['Kisumu','Kakamega'],['Nairobi','Machakos'],['Nairobi','Kajiado'],['Nairobi','Nyeri']]

function drawKenya(ctx: CanvasRenderingContext2D, w: number, h: number, view: MapView, selected: Place | null, time: number, alpha: number) {
  ctx.clearRect(0, 0, w, h)
  if (alpha <= 0) return
  ctx.save(); ctx.globalAlpha = alpha
  const background = ctx.createLinearGradient(0, 0, w, h); background.addColorStop(0, '#06172eeF'); background.addColorStop(1, '#0b2e50f2'); ctx.fillStyle = background; ctx.fillRect(0, 0, w, h)
  const centerX = w * .51, centerY = h * .40, mapHeight = Math.min((h - 138) * .72, w * .51 * 1.28), mapWidth = mapHeight / 1.28
  const scaleX = mapWidth * view.zoom / 8.55, scaleY = mapHeight * view.zoom / 10.18
  const x = (lon: number) => centerX + (lon - view.lon) * scaleX, y = (lat: number) => centerY - (lat - view.lat) * scaleY
  const atmosphere = ctx.createRadialGradient(centerX, centerY, 8, centerX, centerY, mapHeight * 1.15); atmosphere.addColorStop(0, '#1a5b87aa'); atmosphere.addColorStop(1, '#09244000'); ctx.fillStyle = atmosphere; ctx.fillRect(0, 0, w, h)
  for (let i = 0; i < 4; i++) { ctx.beginPath(); ctx.ellipse(centerX, centerY, mapWidth * (.7 + i * .2), mapHeight * (.62 + i * .18), -.16, 0, Math.PI * 2); ctx.strokeStyle = `rgba(230,190,90,${.05 + i * .012})`; ctx.lineWidth = 1; ctx.stroke() }
  ctx.beginPath(); kenya.forEach(([lon, lat], i) => i ? ctx.lineTo(x(lon), y(lat)) : ctx.moveTo(x(lon), y(lat))); ctx.closePath(); ctx.fillStyle = '#0c3156'; ctx.shadowColor = '#e5b950'; ctx.shadowBlur = 22; ctx.fill(); ctx.shadowBlur = 0; ctx.strokeStyle = '#f1c75c'; ctx.lineWidth = 2; ctx.stroke()
  const byName = new Map(places.map(place => [place.name, place]))
  connections.forEach(([from, to], i) => {
    const a = byName.get(from)!, b = byName.get(to)!, ax = x(a.lon), ay = y(a.lat), bx = x(b.lon), by = y(b.lat)
    ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo((ax + bx) / 2, (ay + by) / 2 - 10, bx, by); ctx.setLineDash([4, 4]); ctx.lineDashOffset = -time * 15 - i * 4; ctx.strokeStyle = '#f5ce6ce8'; ctx.lineWidth = 1.4; ctx.stroke(); ctx.setLineDash([])
    const phase = (time * .14 + i * .13) % 1, px = ax + (bx - ax) * phase, py = ay + (by - ay) * phase
    ctx.beginPath(); ctx.arc(px, py, 2.3, 0, Math.PI * 2); ctx.fillStyle = '#fff1bd'; ctx.shadowColor = '#ffd460'; ctx.shadowBlur = 12; ctx.fill(); ctx.shadowBlur = 0
  })
  places.forEach((place, i) => {
    const px = x(place.lon), py = y(place.lat), isSelected = selected?.name === place.name, pulse = 2.5 + Math.sin(time * 2 + i) * .7
    if (px < -20 || px > w + 20 || py < -20 || py > h + 20) return
    ctx.beginPath(); ctx.arc(px, py, isSelected ? 9 : pulse + 3, 0, Math.PI * 2); ctx.strokeStyle = isSelected ? '#fff2c0' : '#edc460a8'; ctx.lineWidth = 1; ctx.stroke()
    ctx.beginPath(); ctx.arc(px, py, isSelected ? 4 : 2.6, 0, Math.PI * 2); ctx.fillStyle = isSelected ? '#fff4c5' : '#ffd35b'; ctx.shadowColor = '#ffd35b'; ctx.shadowBlur = isSelected ? 18 : 9; ctx.fill(); ctx.shadowBlur = 0
    if (isSelected || !selected || w > 650) { ctx.font = `${isSelected ? '600 ' : '500 '}${isSelected ? 11 : 9}px Inter,Arial,sans-serif`; ctx.fillStyle = isSelected ? '#fff1c2' : '#e4ecf5'; ctx.fillText(place.name, px + 7, py - 7) }
  })
  ctx.restore()
}

function drawFallback(ctx: CanvasRenderingContext2D, w: number, h: number, selected: Place | null) {
  const view = { lon: selected?.lon ?? 37.93, lat: selected?.lat ?? .42, zoom: selected ? 1.65 : 1.12 }
  drawKenya(ctx, w, h, view, selected, 0, 1)
}

function makeAtmosphere(color: THREE.ColorRepresentation, strength: number) {
  return new THREE.ShaderMaterial({
    vertexShader: 'varying vec3 vNormal; varying vec3 vView; void main(){vNormal=normalize(normalMatrix*normal);vec4 mv=modelViewMatrix*vec4(position,1.0);vView=-mv.xyz;gl_Position=projectionMatrix*mv;}',
    fragmentShader: `varying vec3 vNormal; varying vec3 vView; uniform vec3 tint; uniform float power; void main(){float rim=pow(1.0-max(dot(normalize(vNormal),normalize(vView)),0.0),power);gl_FragColor=vec4(tint,rim*0.72);}`,
    uniforms: { tint: { value: new THREE.Color(color) }, power: { value: strength } },
    side: THREE.BackSide, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  })
}

export default function GlobeVisual() {
  const wrapperRef = useRef<HTMLDivElement>(null), earthHostRef = useRef<HTMLDivElement>(null), mapRef = useRef<HTMLCanvasElement>(null)
  const selectedRef = useRef<Place | null>(null), focusPlaceRef = useRef<(place: Place) => void>(() => {}), resetEarthRef = useRef<() => void>(() => {})
  const [query, setQuery] = useState(''), [selected, setSelected] = useState<Place | null>(null), [suggestions, setSuggestions] = useState(false), [webgl, setWebgl] = useState(true), [mapReady, setMapReady] = useState(false), [earthReady, setEarthReady] = useState(false)
  selectedRef.current = selected

  useEffect(() => {
    const wrapper = wrapperRef.current, host = earthHostRef.current, mapCanvas = mapRef.current
    if (!wrapper || !host || !mapCanvas) return
    const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    const lowPowerMode = window.innerWidth <= 480 || (navigator.hardwareConcurrency > 0 && navigator.hardwareConcurrency <= 4) || window.matchMedia('(prefers-reduced-data: reduce)').matches
    let renderer: THREE.WebGLRenderer | null = null, scene: THREE.Scene | null = null, camera: THREE.PerspectiveCamera | null = null
    let earthGroup: THREE.Group | null = null, earthMaterial: THREE.MeshPhongMaterial | null = null, cloudMaterial: THREE.MeshPhongMaterial | null = null
    let observer: IntersectionObserver, resizeObserver: ResizeObserver, animationFrame = 0, active = false, disposed = false, dragging = false, userTouchedEarth = false, tour: gsap.core.Timeline | null = null, lastFrame = 0, elapsed = 0
    const mapView: MapView = { lon: 37.93, lat: .42, zoom: 1.12 }, mapProgress = { value: 0 }
    const canvasContext = mapCanvas.getContext('2d')
    if (!canvasContext) { setWebgl(false); return }

    const renderOnce = () => { if (!active || disposed) return; if (renderer && scene && camera) renderer.render(scene, camera); const bounds = wrapper.getBoundingClientRect(); drawKenya(canvasContext, bounds.width, bounds.height, mapView, selectedRef.current, elapsed, mapProgress.value) }
    const scheduleOneFrame = () => { if (!reducedMotion || animationFrame || !active) return; animationFrame = requestAnimationFrame(() => { animationFrame = 0; renderOnce() }) }
    const finishMapTransition = () => {
      gsap.to(mapProgress, { value: 1, duration: reducedMotion ? 0 : 1.8, ease: 'power2.out', onUpdate: scheduleOneFrame, onComplete: () => { setMapReady(true); renderOnce() } })
    }

    function focusKenya(place?: Place) {
      if (!earthGroup || !camera) return
      userTouchedEarth = true; tour?.kill()
      const lon = place?.lon ?? 36.817, lat = place?.lat ?? -1.283
      const baseRotation = THREE.MathUtils.degToRad(90 - lon), targetRotation = baseRotation + Math.PI * 2 * Math.round((earthGroup.rotation.y - baseRotation) / (Math.PI * 2))
      gsap.to(earthGroup.rotation, { y: targetRotation, duration: reducedMotion ? 0 : 2.2, ease: 'power2.inOut', onUpdate: scheduleOneFrame })
      gsap.to(camera.position, { z: 3.55, duration: reducedMotion ? 0 : 2.2, ease: 'power2.inOut', onUpdate: scheduleOneFrame })
      gsap.to(mapView, { lon, lat, zoom: place ? 1.7 : 1.12, duration: reducedMotion ? 0 : 1.2, ease: 'power2.out', onUpdate: scheduleOneFrame })
      finishMapTransition()
    }

    focusPlaceRef.current = (place) => focusKenya(place)

    const initScene = async () => {
      if (renderer || disposed) return
      try {
        renderer = new THREE.WebGLRenderer({ alpha: true, antialias: !lowPowerMode, powerPreference: lowPowerMode ? 'low-power' : 'high-performance', preserveDrawingBuffer: false })
      } catch {
        setWebgl(false); return
      }
      renderer.setClearColor(0x000000, 0)
      renderer.outputColorSpace = THREE.SRGBColorSpace
      renderer.toneMapping = THREE.ACESFilmicToneMapping
      renderer.toneMappingExposure = 1.12
      renderer.domElement.setAttribute('aria-label', 'Interactive three-dimensional Earth. Drag to rotate and scroll to zoom.')
      renderer.domElement.tabIndex = 0
      renderer.domElement.style.touchAction = 'none'
      renderer.domElement.style.cursor = 'grab'
      host.appendChild(renderer.domElement)
      attachControls()

      scene = new THREE.Scene()
      camera = new THREE.PerspectiveCamera(window.innerWidth < 640 ? 43 : 39, 1, .1, 80)
      camera.position.set(0, .02, 4.25); camera.lookAt(0, 0, 0)
      const ambient = new THREE.HemisphereLight(0xbcdcff, 0x172338, .54); scene.add(ambient)
      const sun = new THREE.DirectionalLight(0xfff4dc, 2.8); sun.position.set(-4, 2.3, 5); scene.add(sun)
      const softFill = new THREE.DirectionalLight(0x598fc5, .34); softFill.position.set(3, -.3, -4); scene.add(softFill)

      earthGroup = new THREE.Group(); earthGroup.rotation.set(-.045, -2.65, 0); earthGroup.position.y = .12; scene.add(earthGroup)
      const starPositions: number[] = []
      for (let i = 0; i < 700; i++) { const radius = 7 + Math.random() * 12, theta = Math.random() * Math.PI * 2, phi = Math.acos(2 * Math.random() - 1); starPositions.push(radius * Math.sin(phi) * Math.cos(theta), radius * Math.cos(phi), radius * Math.sin(phi) * Math.sin(theta)) }
      const starGeometry = new THREE.BufferGeometry(); starGeometry.setAttribute('position', new THREE.Float32BufferAttribute(starPositions, 3))
      const stars = new THREE.Points(starGeometry, new THREE.PointsMaterial({ color: 0xd9e8ff, size: .025, transparent: true, opacity: .78, sizeAttenuation: true })); scene.add(stars)

      const loader = new THREE.TextureLoader(), maxTexture = renderer.capabilities.maxTextureSize, anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy())
      const loadTexture = async (url: string, color = false) => {
        const texture = await loader.loadAsync(url)
        if (color) texture.colorSpace = THREE.SRGBColorSpace
        texture.anisotropy = anisotropy; texture.generateMipmaps = true; texture.minFilter = THREE.LinearMipmapLinearFilter; texture.magFilter = THREE.LinearFilter
        if (texture.image.width > maxTexture || texture.image.height > maxTexture) {
          const scale = Math.min(maxTexture / texture.image.width, maxTexture / texture.image.height), canvas = document.createElement('canvas')
          canvas.width = Math.floor(texture.image.width * scale); canvas.height = Math.floor(texture.image.height * scale)
          canvas.getContext('2d')!.drawImage(texture.image, 0, 0, canvas.width, canvas.height)
          const optimized = new THREE.CanvasTexture(canvas); optimized.colorSpace = texture.colorSpace; optimized.anisotropy = anisotropy; optimized.generateMipmaps = true; optimized.minFilter = THREE.LinearMipmapLinearFilter; texture.dispose(); return optimized
        }
        return texture
      }
      try {
        const [dayMap, cloudMap, normalMap, specularMap, nightMap] = await Promise.all([
          loadTexture('/earth-day.jpg', true), loadTexture('/earth-clouds.png', true), loadTexture('/earth-normal.jpg'), loadTexture('/earth-specular.jpg'), loadTexture('/earth-night-lights.jpg', true),
        ])
        if (disposed || !earthGroup) { [dayMap, cloudMap, normalMap, specularMap, nightMap].forEach(texture => texture.dispose()); return }
        const solarDirection = new THREE.Vector3(-4, 2.3, 5).normalize()
        earthMaterial = new THREE.MeshPhongMaterial({ map: dayMap, normalMap, normalScale: new THREE.Vector2(.035, .035), specularMap, specular: new THREE.Color(0x7896ad), shininess: 22 })
        earthMaterial.onBeforeCompile = shader => {
          shader.uniforms.nightLightsMap = { value: nightMap }; shader.uniforms.nightSunDirection = { value: solarDirection }
          shader.uniforms.cloudShadowMap = { value: cloudMap }
          shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vEarthWorldNormal;')
            .replace('#include <begin_vertex>', '#include <begin_vertex>\nvEarthWorldNormal = normalize(mat3(modelMatrix) * objectNormal);')
          shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D nightLightsMap; uniform sampler2D cloudShadowMap; uniform vec3 nightSunDirection; varying vec3 vEarthWorldNormal;')
            .replace('#include <map_fragment>', '#include <map_fragment>\nfloat cloudShade = texture2D(cloudShadowMap, vMapUv).a; diffuseColor.rgb *= 1.0 - cloudShade * 0.12;')
            .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\nfloat nightSide = 1.0 - smoothstep(-0.12, 0.08, dot(normalize(vEarthWorldNormal), normalize(nightSunDirection))); vec3 cityLights = texture2D(nightLightsMap, vMapUv).rgb; totalEmissiveRadiance += cityLights * vec3(1.0, 0.72, 0.40) * nightSide * 1.25;')
        }
        earthMaterial.customProgramCacheKey = () => 'jamii-earth-day-night-v1'
        const earth = new THREE.Mesh(new THREE.SphereGeometry(1, 128, 96), earthMaterial); earth.castShadow = true; earth.receiveShadow = true; earthGroup.add(earth)
        cloudMaterial = new THREE.MeshPhongMaterial({ map: cloudMap, transparent: true, opacity: .54, depthWrite: false, side: THREE.DoubleSide, shininess: 4, specular: new THREE.Color(0x7690a7) })
        const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.008, 96, 72), cloudMaterial); clouds.renderOrder = 1; earthGroup.add(clouds)
        const atmosphere = new THREE.Mesh(new THREE.SphereGeometry(1.04, 72, 56), makeAtmosphere(0x3c9cff, 2.2)); atmosphere.renderOrder = 2; earthGroup.add(atmosphere)
        const goldRim = new THREE.Mesh(new THREE.SphereGeometry(1.018, 64, 48), makeAtmosphere(0xf2bd4c, 3.0)); goldRim.renderOrder = 3; earthGroup.add(goldRim)
        setEarthReady(true); resize()
        if (selectedRef.current) focusKenya(selectedRef.current)
        else if (active && !userTouchedEarth) startCinematicTour()
      } catch {
        if (!disposed) setWebgl(false)
      }
    }

    function startCinematicTour() {
      if (reducedMotion || userTouchedEarth || !earthGroup || !camera) return
      tour?.kill()
      const africaBase = THREE.MathUtils.degToRad(90 - 20), africaRotation = africaBase + Math.PI * 2 * Math.round((earthGroup.rotation.y - africaBase) / (Math.PI * 2))
      const kenyaRotation = africaRotation + THREE.MathUtils.degToRad(20 - 36.817)
      tour = gsap.timeline({ delay: 3.6 })
        .to(earthGroup.rotation, { y: africaRotation, duration: 4.4, ease: 'power2.inOut' })
        .to(earthGroup.rotation, { y: kenyaRotation, duration: 1.7, ease: 'power2.inOut' })
        .to(camera.position, { z: 3.55, duration: 2.2, ease: 'power2.inOut' }, '<')
        .to(mapProgress, { value: 1, duration: 1.8, ease: 'power2.out', onUpdate: scheduleOneFrame, onComplete: () => { setMapReady(true); renderOnce() } }, '-=.5')
    }

    const resize = () => {
      if (!renderer || !camera) return
      const box = wrapper.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, lowPowerMode ? 1 : window.innerWidth < 640 ? 1.25 : 1.7)
      renderer.setPixelRatio(dpr); renderer.setSize(Math.max(1, box.width), Math.max(1, box.height), false)
      camera.aspect = box.width / Math.max(1, box.height); camera.fov = window.innerWidth < 640 ? 43 : 39; camera.updateProjectionMatrix(); renderOnce()
      const mapDpr = Math.min(window.devicePixelRatio || 1, lowPowerMode ? 1 : 1.4); mapCanvas.width = Math.round(box.width * mapDpr); mapCanvas.height = Math.round(box.height * mapDpr); canvasContext.setTransform(mapDpr, 0, 0, mapDpr, 0, 0)
    }

    let pointerX = 0, pointerY = 0
    const onPointerDown = (event: PointerEvent) => {
      if (!earthGroup || mapProgress.value > .94) return
      dragging = true; userTouchedEarth = true; tour?.kill(); pointerX = event.clientX; pointerY = event.clientY
      renderer?.domElement.setPointerCapture(event.pointerId); if (renderer) renderer.domElement.style.cursor = 'grabbing'
    }
    const onPointerMove = (event: PointerEvent) => {
      if (!dragging || !earthGroup) return
      earthGroup.rotation.y += (event.clientX - pointerX) * .006; earthGroup.rotation.x = THREE.MathUtils.clamp(earthGroup.rotation.x + (event.clientY - pointerY) * .005, -1.05, 1.05)
      pointerX = event.clientX; pointerY = event.clientY; scheduleOneFrame()
    }
    const onPointerUp = () => { dragging = false; if (renderer) renderer.domElement.style.cursor = 'grab' }
    const onWheel = (event: WheelEvent) => {
      if (!camera || mapProgress.value > .94) return
      event.preventDefault(); userTouchedEarth = true; tour?.kill(); camera.position.z = THREE.MathUtils.clamp(camera.position.z + event.deltaY * .002, 3.0, 5.4); scheduleOneFrame()
    }
    const attachControls = () => {
      if (!renderer) return
      const canvas = renderer.domElement
      canvas.addEventListener('pointerdown', onPointerDown); canvas.addEventListener('pointermove', onPointerMove); canvas.addEventListener('pointerup', onPointerUp); canvas.addEventListener('pointercancel', onPointerUp); canvas.addEventListener('wheel', onWheel, { passive: false })
    }
    const detachControls = () => {
      if (!renderer) return
      const canvas = renderer.domElement
      canvas.removeEventListener('pointerdown', onPointerDown); canvas.removeEventListener('pointermove', onPointerMove); canvas.removeEventListener('pointerup', onPointerUp); canvas.removeEventListener('pointercancel', onPointerUp); canvas.removeEventListener('wheel', onWheel)
    }
    resetEarthRef.current = () => {
      tour?.kill()
      if (earthGroup) gsap.to(earthGroup.rotation, { x: -.045, y: -2.65, duration: reducedMotion ? 0 : 1.7, ease: 'power2.inOut', onUpdate: scheduleOneFrame })
      if (camera) gsap.to(camera.position, { z: 4.25, duration: reducedMotion ? 0 : 1.7, ease: 'power2.inOut', onUpdate: scheduleOneFrame })
      gsap.to(mapProgress, { value: 0, duration: reducedMotion ? 0 : 1.1, ease: 'power2.out', onUpdate: scheduleOneFrame, onComplete: () => { setMapReady(false); renderOnce() } })
    }

    const renderFrame = (now: number) => {
      animationFrame = 0
      if (!active || disposed || !renderer || !scene || !camera) return
      if (lowPowerMode && lastFrame && now - lastFrame < 32) { animationFrame = requestAnimationFrame(renderFrame); return }
      const delta = lastFrame ? Math.min((now - lastFrame) / 1000, .05) : 0; lastFrame = now; elapsed += delta
      if (!reducedMotion && earthGroup) { if (!dragging && mapProgress.value < .96) earthGroup.rotation.y += delta * .028; const clouds = earthGroup.children[1]; if (clouds instanceof THREE.Mesh && clouds.material instanceof THREE.Material && !dragging) clouds.rotation.y += delta * .034 }
      renderer.render(scene, camera)
      const box = wrapper.getBoundingClientRect(), dpr = mapCanvas.width / Math.max(1, box.width); canvasContext.setTransform(dpr, 0, 0, dpr, 0, 0)
      drawKenya(canvasContext, box.width, box.height, mapView, selectedRef.current, elapsed, mapProgress.value)
      if (!reducedMotion) animationFrame = requestAnimationFrame(renderFrame)
    }
    const requestRender = () => { if (active && !animationFrame) animationFrame = requestAnimationFrame(renderFrame) }
    const onMapClick = (event: MouseEvent) => {
      if (mapProgress.value < .95) return
      const rect = mapCanvas.getBoundingClientRect(), box = wrapper.getBoundingClientRect(), view = mapView
      const mapHeight = Math.min((box.height - 138) * .72, box.width * .51 * 1.28), mapWidth = mapHeight / 1.28
      const cx = box.width * .51, cy = box.height * .40, sx = mapWidth * view.zoom / 8.55, sy = mapHeight * view.zoom / 10.18
      const px = event.clientX - rect.left, py = event.clientY - rect.top
      const nearest = places.map(place => ({ place, distance: Math.hypot(cx + (place.lon - view.lon) * sx - px, cy - (place.lat - view.lat) * sy - py) })).sort((a, b) => a.distance - b.distance)[0]
      if (nearest && nearest.distance < 20) focusPlaceRef.current(nearest.place)
    }
    const onVisibility = ([entry]: IntersectionObserverEntry[]) => {
      active = entry.isIntersecting
      if (active) { void initScene(); lastFrame = 0; tour?.resume(); requestRender() }
      else { cancelAnimationFrame(animationFrame); animationFrame = 0; tour?.pause() }
    }

    observer = new IntersectionObserver(onVisibility, { threshold: .05 }); observer.observe(wrapper)
    resizeObserver = new ResizeObserver(resize); resizeObserver.observe(wrapper)
    window.addEventListener('resize', resize); mapCanvas.addEventListener('click', onMapClick)
    const cleanup = () => {
      disposed = true; active = false; cancelAnimationFrame(animationFrame); tour?.kill(); gsap.killTweensOf(mapProgress); gsap.killTweensOf(mapView)
      observer.disconnect(); resizeObserver.disconnect(); window.removeEventListener('resize', resize); mapCanvas.removeEventListener('click', onMapClick); detachControls()
      if (earthGroup) earthGroup.traverse(object => { if (object instanceof THREE.Mesh) { object.geometry.dispose(); const materials = Array.isArray(object.material) ? object.material : [object.material]; materials.forEach(material => material.dispose()) } })
      scene?.traverse(object => { if (object instanceof THREE.Points) { object.geometry.dispose(); (object.material as THREE.Material).dispose() } })
      renderer?.dispose(); renderer?.domElement.remove()
    }
    return cleanup
  }, [])

  useEffect(() => {
    if (webgl) return
    const canvas = mapRef.current, wrapper = wrapperRef.current
    if (!canvas || !wrapper) return
    const context = canvas.getContext('2d')
    if (!context) return
    const box = wrapper.getBoundingClientRect(), ratio = Math.min(window.devicePixelRatio || 1, 1.3)
    canvas.width = Math.round(box.width * ratio); canvas.height = Math.round(box.height * ratio); context.setTransform(ratio, 0, 0, ratio, 0, 0)
    drawFallback(context, box.width, box.height, selected)
  }, [webgl, selected])

  const matches = places.filter(place => place.name.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 5)
  const focus = (place: Place) => { selectedRef.current = place; setSelected(place); setQuery(place.name); setSuggestions(false); focusPlaceRef.current(place) }
  const returnToEarth = () => { selectedRef.current = null; setSelected(null); setQuery(''); resetEarthRef.current() }

  return <div className="globe-visual kenya-network" ref={wrapperRef} aria-label="Interactive 3D Earth transitions to a Kenya map with searchable geographic reference locations">
    <div className="earth-webgl" ref={earthHostRef} aria-hidden="true"/>
    <canvas ref={mapRef} className="kenya-network-canvas" aria-label="Kenya map showing geographic reference locations" style={{ pointerEvents: mapReady ? 'auto' : 'none' }}/>
    {!earthReady && webgl && <div className="earth-loading" role="status">Preparing Earth imagery…</div>}
    {mapReady && webgl && <button className="globe-reset" type="button" onClick={returnToEarth}><RotateCcw size={13}/> Earth view</button>}
    <div className="globe-label globe-label-one"><i/>{mapReady ? 'KENYA COMMUNITY NETWORK' : 'ROTATING EARTH · EAST AFRICA'}</div>
    <div className="kenya-search-card">
      <div className="kenya-search-title"><span>Find Your Community</span><small>Explore geographic reference points</small></div>
      <form className="kenya-search" onSubmit={event => { event.preventDefault(); if (matches[0]) focus(matches[0]) }}>
        <Search size={16}/><input aria-label="Search Kenyan locations" value={query} onFocus={() => setSuggestions(true)} onChange={event => { setQuery(event.target.value); setSuggestions(true) }} placeholder="Search a Kenyan town"/><button type="submit" aria-label="Find location"><MapPin size={16}/></button>
        {suggestions && query.trim() && <div className="kenya-suggestions" role="listbox">{matches.length ? matches.map(place => <button type="button" role="option" key={place.name} onClick={() => focus(place)}><MapPin size={14}/>{place.name}<span>Kenya</span></button>) : <p>No matching location in this list.</p>}</div>}
      </form>
      <div className="kenya-selection">{selected ? <><b>{selected.name}, Kenya</b><span>Geographic reference point | No branch or service availability implied</span></> : <span>Search or choose one of 12 mapped locations</span>}</div>
    </div>
    <div className="globe-brand-message"><img src="/jamii-yangu-emblem.png" alt="Jamii Yangu Group Cooperative"/><strong>CONNECTED BY COMMUNITY.<br/>UNITED BY OPPORTUNITY.</strong><span>I grow, we grow, community grows.</span></div>
    {!webgl && <div className="globe-fallback-note">3D is unavailable in this browser. The Kenya map and location search remain available.</div>}
  </div>
}
