import React, { useEffect, useRef } from 'react'
import { Engine, Scene, ArcRotateCamera, Vector3, HemisphericLight, MeshBuilder, StandardMaterial, Color3 } from '@babylonjs/core'
import './House3D.css'

const House3D = () => {
  const canvasRef = useRef(null)

  useEffect(() => {
    if (!canvasRef.current) return

    // Créer le moteur Babylon.js
    const engine = new Engine(canvasRef.current, true)

    // Créer la scène
    const scene = new Scene(engine)

    // Créer la caméra (rotation autour de la scène)
    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2,
      Math.PI / 2.5,
      15,
      Vector3.Zero(),
      scene
    )
    camera.attachControl(canvasRef.current, true)

    // Créer la lumière
    const light = new HemisphericLight('light', new Vector3(0, 1, 0), scene)
    light.intensity = 0.7

    // Créer les matériaux
    const wallMaterial = new StandardMaterial('wallMaterial', scene)
    wallMaterial.diffuseColor = new Color3(0.9, 0.85, 0.8)

    const roofMaterial = new StandardMaterial('roofMaterial', scene)
    roofMaterial.diffuseColor = new Color3(0.6, 0.3, 0.2)

    const doorMaterial = new StandardMaterial('doorMaterial', scene)
    doorMaterial.diffuseColor = new Color3(0.4, 0.25, 0.15)

    const windowMaterial = new StandardMaterial('windowMaterial', scene)
    windowMaterial.diffuseColor = new Color3(0.7, 0.85, 1.0)

    // Créer les murs de la maison (boîte)
    const walls = MeshBuilder.CreateBox('walls', { width: 6, height: 4, depth: 6 }, scene)
    walls.material = wallMaterial
    walls.position.y = 2

    // Créer le toit (prisme triangulaire)
    // Face avant du toit
    const roofFront = MeshBuilder.CreateBox('roofFront', { width: 6.5, height: 3, depth: 0.3 }, scene)
    roofFront.material = roofMaterial
    roofFront.position.y = 5.5
    roofFront.position.z = 2.85
    roofFront.rotation.x = Math.PI / 4
    
    // Face arrière du toit
    const roofBack = MeshBuilder.CreateBox('roofBack', { width: 6.5, height: 3, depth: 0.3 }, scene)
    roofBack.material = roofMaterial
    roofBack.position.y = 5.5
    roofBack.position.z = -2.85
    roofBack.rotation.x = -Math.PI / 4
    
    // Face gauche du toit
    const roofLeft = MeshBuilder.CreateBox('roofLeft', { width: 0.3, height: 3, depth: 6.5 }, scene)
    roofLeft.material = roofMaterial
    roofLeft.position.y = 5.5
    roofLeft.position.x = -2.85
    roofLeft.rotation.z = Math.PI / 4
    
    // Face droite du toit
    const roofRight = MeshBuilder.CreateBox('roofRight', { width: 0.3, height: 3, depth: 6.5 }, scene)
    roofRight.material = roofMaterial
    roofRight.position.y = 5.5
    roofRight.position.x = 2.85
    roofRight.rotation.z = -Math.PI / 4

    // Créer la porte
    const door = MeshBuilder.CreateBox('door', { width: 1.2, height: 2.5, depth: 0.1 }, scene)
    door.material = doorMaterial
    door.position.z = 3.01
    door.position.y = 1.25

    // Créer les fenêtres
    const window1 = MeshBuilder.CreateBox('window1', { width: 1, height: 1, depth: 0.1 }, scene)
    window1.material = windowMaterial
    window1.position.x = -2
    window1.position.z = 3.01
    window1.position.y = 2.5

    const window2 = MeshBuilder.CreateBox('window2', { width: 1, height: 1, depth: 0.1 }, scene)
    window2.material = windowMaterial
    window2.position.x = 2
    window2.position.z = 3.01
    window2.position.y = 2.5

    // Fenêtre côté gauche
    const window3 = MeshBuilder.CreateBox('window3', { width: 1, height: 1, depth: 0.1 }, scene)
    window3.material = windowMaterial
    window3.position.x = -3.01
    window3.position.z = 0
    window3.position.y = 2.5
    window3.rotation.y = Math.PI / 2

    // Fenêtre côté droit
    const window4 = MeshBuilder.CreateBox('window4', { width: 1, height: 1, depth: 0.1 }, scene)
    window4.material = windowMaterial
    window4.position.x = 3.01
    window4.position.z = 0
    window4.position.y = 2.5
    window4.rotation.y = Math.PI / 2

    // Démarrer la boucle de rendu
    engine.runRenderLoop(() => {
      scene.render()
    })

    // Gérer le redimensionnement de la fenêtre
    const handleResize = () => {
      engine.resize()
    }
    window.addEventListener('resize', handleResize)

    // Nettoyage
    return () => {
      if (camera && canvasRef.current) {
        camera.detachControl(canvasRef.current)
      }
      window.removeEventListener('resize', handleResize)
      engine.dispose()
    }
  }, [])

  return (
    <div className="house3d-container">
      <canvas ref={canvasRef} className="house3d-canvas" />
    </div>
  )
}

export default House3D
