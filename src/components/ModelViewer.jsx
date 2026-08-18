import { Suspense } from 'react'
import { Canvas, useLoader } from '@react-three/fiber'
import { OrbitControls, Stage } from '@react-three/drei'
import { FBXLoader } from 'three-stdlib'
import * as THREE from 'three'

const MODEL_URL = encodeURI('/models/whsper mic and earpie.fbx')
const TEXTURE_BASE = '/models/textures/'
// The FBX stores its textures as absolute Windows paths (e.g. "D:\...\mic texture.jpg"),
// which the browser can't fetch. Redirect known texture filenames to our local copies.
const TEXTURE_FILES = new Set(['mic texture.jpg', 'foam.jpg', 'foam bump.jpg'])

function WhisperModel(props) {
  const fbx = useLoader(FBXLoader, MODEL_URL, (loader) => {
    loader.manager.setURLModifier((url) => {
      const fileName = url.split(/[\\/]/).pop()
      if (fileName && TEXTURE_FILES.has(fileName)) {
        return TEXTURE_BASE + encodeURIComponent(fileName)
      }
      return url
    })
  })
  const [micTexture, foamTexture, foamBumpTexture] = useLoader(THREE.TextureLoader, [
    TEXTURE_BASE + 'mic%20texture.jpg',
    TEXTURE_BASE + 'foam.jpg',
    TEXTURE_BASE + 'foam%20bump.jpg',
  ])
  micTexture.colorSpace = THREE.SRGBColorSpace
  foamTexture.colorSpace = THREE.SRGBColorSpace
  micTexture.offset.set(-0.08, 0)

  fbx.traverse((child) => {
    if (!child.isMesh) return

    // FBXLoader assigns MeshPhongMaterial, which ignores the scene's environment
    // lighting (image-based lighting only affects physically-based materials).
    // Swap to MeshStandardMaterial so the model is lit consistently with the rest
    // of the scene, carrying over each material's original color.
    const toStandard = (mat) =>
      new THREE.MeshStandardMaterial({
        name: mat.name,
        color: mat.color,
        roughness: 0.6,
        metalness: 0.15,
      })

    const mats = Array.isArray(child.material)
      ? child.material.map(toStandard)
      : [toStandard(child.material)]

    // Parsed directly from the FBX's binary Connections graph (three.js's FBXLoader
    // doesn't support 3ds Max's vendor-specific texmap connection properties, so it
    // silently drops them). Only two materials anywhere in the file actually have an
    // image texture — everything else is a genuine flat color, not a missing texture:
    //   "07 - Default" -> diffuse: mic texture.jpg          (used by: Object003)
    //   "04 - Default" -> diffuse: foam.jpg, bump: foam bump.jpg
    //                     (used by: Object005, Cylinder001, Cylinder004 — each as one
    //                     of several material slots on those meshes)
    mats.forEach((mat) => {
      if (mat.name === '07 - Default') {
        mat.color.set(0xffffff)
        mat.map = micTexture
        // Object003 is a thin, effectively zero-thickness decal plane. With the
        // default FrontSide, its back face is culled and shows nothing when viewed
        // from the other side — render both faces so the texture is never missing.
        mat.side = THREE.DoubleSide
        mat.needsUpdate = true
      }
      if (mat.name === '04 - Default') {
        mat.color.set(0xffffff)
        mat.map = foamTexture
        mat.bumpMap = foamBumpTexture
        mat.bumpScale = 0.5
        mat.side = THREE.DoubleSide
        mat.needsUpdate = true
      }
    })

    child.material = Array.isArray(child.material) ? mats : mats[0]
  })

  return <primitive object={fbx} {...props} />
}

function Loader() {
  return (
    <mesh>
      <sphereGeometry args={[0.4, 16, 16]} />
      <meshStandardMaterial color="#7c5cff" wireframe />
    </mesh>
  )
}

export default function ModelViewer() {
  return (
    <div className="model-viewer">
      <Canvas camera={{ position: [0, 0, 4], fov: 45 }} dpr={[1, 2]}>
        <Suspense fallback={<Loader />}>
          <Stage
            environment="city"
            intensity={0.6}
            shadows={{ type: 'contact', opacity: 0.5, blur: 2, offset: 0.015 }}
            adjustCamera={1.3}
          >
            <WhisperModel />
          </Stage>
        </Suspense>
        <OrbitControls
          makeDefault
          autoRotate
          autoRotateSpeed={1.2}
          enablePan={false}
        />
      </Canvas>
    </div>
  )
}
