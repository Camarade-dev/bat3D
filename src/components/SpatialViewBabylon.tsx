import React, { useEffect, useRef } from 'react'
import {
  Engine,
  Scene,
  ArcRotateCamera,
  Vector3,
  HemisphericLight,
  DirectionalLight,
  MeshBuilder,
  StandardMaterial,
  Color3,
  Color4,
  Mesh,
  VertexData
} from '@babylonjs/core'
import { Wall } from './FloorPlanEditor'
import { SpatialModel, Floor, Zone } from '../models/SpatialModel'
import './SpatialViewBabylon.css'

interface SpatialViewBabylonProps {
  walls: Wall[]
  spatialModel?: SpatialModel
  selectedFloorId?: string
}

const WALL_HEIGHT = 3
const SCALE = 1 / 30
const FLOOR_THICKNESS = 0.1 // Thickness of floor in meters

const calculateBounds = (walls: Wall[]) => {
  if (walls.length === 0) {
    return { minX: 0, maxX: 0, minY: 0, maxY: 0 }
  }

  let minX = Infinity
  let maxX = -Infinity
  let minY = Infinity
  let maxY = -Infinity

  walls.forEach(wall => {
    minX = Math.min(minX, wall.start.x, wall.end.x)
    maxX = Math.max(maxX, wall.start.x, wall.end.x)
    minY = Math.min(minY, wall.start.y, wall.end.y)
    maxY = Math.max(maxY, wall.start.y, wall.end.y)
  })

  return { minX, maxX, minY, maxY }
}

const createWall = (
  name: string,
  start: Vector3,
  end: Vector3,
  height: number,
  scene: Scene
): Mesh => {
  const dx = end.x - start.x
  const dz = end.z - start.z
  const length = Math.sqrt(dx * dx + dz * dz)
  
  if (length < 0.001) {
    return MeshBuilder.CreateBox(name, { size: 0.1 }, scene)
  }

  const angle = Math.atan2(dz, dx)

  const wall = MeshBuilder.CreateBox(
    name,
    { width: length, height: height, depth: 0.2 },
    scene
  )

  wall.position = new Vector3(
    (start.x + end.x) / 2,
    height / 2,
    (start.z + end.z) / 2
  )
  
  wall.rotation.y = angle

  return wall
}

const createFloorFromZone = (
  name: string,
  zone: Zone,
  floor: Floor,
  scene: Scene
): Mesh => {
  const elevation = floor.elevation
  // Convert zone coordinates (in meters) to pixels first, then to 3D
  // This matches how walls are created from zones
  const planScale = floor.plan2D.scale || 30 // pixels per meter
  
  // Convert 2D polygon to 3D vertices
  const vertices: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  
  // Create vertices for top and bottom surfaces of the floor (with thickness)
  const numPoints = zone.polygon2D.length
  
  zone.polygon2D.forEach((point) => {
    // First convert meters to pixels (like walls), then pixels to 3D
    const xPixels = point.x * planScale
    const yPixels = point.y * planScale
    const x3D = xPixels * SCALE
    const z3D = yPixels * SCALE
    
    // Top surface at elevation + thickness
    vertices.push(x3D, elevation + FLOOR_THICKNESS, z3D)
    // Bottom surface at elevation
    vertices.push(x3D, elevation, z3D)
  })
  
  // Top face triangulation (fan triangulation)
  for (let i = 1; i < numPoints - 1; i++) {
    indices.push(0, i * 2, (i + 1) * 2)
  }
  
  // Bottom face triangulation (reverse order for correct normals)
  for (let i = 1; i < numPoints - 1; i++) {
    indices.push(1, (i + 1) * 2 + 1, i * 2 + 1)
  }
  
  // Side faces (connect top and bottom)
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints
    const topI = i * 2
    const botI = i * 2 + 1
    const topNext = next * 2
    const botNext = next * 2 + 1
    
    // First triangle of side face
    indices.push(topI, botI, botNext)
    // Second triangle of side face
    indices.push(topI, botNext, topNext)
  }
  
  // Calculate UVs for both surfaces
  zone.polygon2D.forEach((point) => {
    uvs.push(point.x / 100, point.y / 100) // Top surface UV
  })
  zone.polygon2D.forEach((point) => {
    uvs.push(point.x / 100, point.y / 100) // Bottom surface UV
  })
  
  const vertexData = new VertexData()
  vertexData.positions = vertices
  vertexData.indices = indices
  vertexData.uvs = uvs
  
  // Compute normals automatically
  VertexData.ComputeNormals(vertices, indices, normals)
  vertexData.normals = normals
  
  const floorMesh = new Mesh(name, scene)
  vertexData.applyToMesh(floorMesh, true) // updatable = true
  
  // Position the floor mesh so its center is at the middle of its thickness
  // No need to adjust position.y as vertices are already at correct elevation
  
  console.log(`Floor mesh ${name} created with thickness ${FLOOR_THICKNESS}m at elevation ${elevation}m`)
  
  return floorMesh
}

const SpatialViewBabylon: React.FC<SpatialViewBabylonProps> = ({ walls, spatialModel, selectedFloorId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const wallMeshesRef = useRef<Mesh[]>([])
  const floorMeshesRef = useRef<Mesh[]>([])

  useEffect(() => {
    if (!canvasRef.current) return
    // Allow rendering even without walls if we have spatial model with floors
    if (walls.length === 0 && (!spatialModel || spatialModel.building.floors.length === 0)) return

    // Clean up previous scene and meshes before creating new ones
    if (sceneRef.current) {
      sceneRef.current.dispose()
    }
    if (engineRef.current) {
      engineRef.current.dispose()
    }
    wallMeshesRef.current.forEach(mesh => mesh.dispose())
    wallMeshesRef.current = []
    floorMeshesRef.current.forEach(mesh => mesh.dispose())
    floorMeshesRef.current = []
    if (cameraRef.current && canvasRef.current) {
      cameraRef.current.detachControl()
    }

    const engine = new Engine(canvasRef.current, true, { preserveDrawingBuffer: true, stencil: true })
    engineRef.current = engine

    const scene = new Scene(engine)
    sceneRef.current = scene

    scene.clearColor = new Color4(0.9, 0.9, 0.95, 1.0)

    // Calculate bounds from walls or all zones in all floors
    let bounds = calculateBounds(walls)
    if (walls.length === 0 && spatialModel && spatialModel.building.floors.length > 0) {
      // Calculate bounds from all zones in all floors
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
      spatialModel.building.floors.forEach(floor => {
        const scale = floor.plan2D.scale || 30
        floor.zones.forEach(zone => {
          zone.polygon2D.forEach(point => {
            minX = Math.min(minX, point.x * scale)
            maxX = Math.max(maxX, point.x * scale)
            minY = Math.min(minY, point.y * scale)
            maxY = Math.max(maxY, point.y * scale)
          })
        })
      })
      if (minX !== Infinity) {
        bounds = { minX, maxX, minY, maxY }
      }
    }
    
    const centerX = (bounds.minX + bounds.maxX) / 2 * SCALE
    const centerZ = (bounds.minY + bounds.maxY) / 2 * SCALE
    const maxDim = Math.max(bounds.maxX - bounds.minX, bounds.maxY - bounds.minY) * SCALE || 20
    
    // Calculate total height for camera positioning (sum of all floor heights with cumulative stacking)
    let totalHeight = 0
    if (spatialModel && spatialModel.building.floors.length > 0) {
      let cumulativeElevation = 0
      spatialModel.building.floors.forEach((floor, index) => {
        if (index === 0) {
          cumulativeElevation = floor.elevation
        } else {
          const previousFloor = spatialModel.building.floors[index - 1]
          cumulativeElevation = cumulativeElevation + FLOOR_THICKNESS + previousFloor.defaultHeight
          cumulativeElevation = Math.max(floor.elevation, cumulativeElevation)
        }
        // Total height is the top of this floor (elevation + floor thickness + wall height)
        totalHeight = cumulativeElevation + FLOOR_THICKNESS + floor.defaultHeight
      })
    } else {
      totalHeight = WALL_HEIGHT
    }

    const camera = new ArcRotateCamera(
      'camera',
      -Math.PI / 2.5,
      Math.PI / 3,
      Math.max(maxDim * 2, totalHeight * 2),
      new Vector3(centerX, totalHeight / 2, centerZ),
      scene
    )
    camera.setTarget(new Vector3(centerX, totalHeight / 2, centerZ))
    camera.lowerRadiusLimit = 5
    camera.upperRadiusLimit = maxDim * 4
    camera.attachControl(canvasRef.current, true)
    cameraRef.current = camera

    const hemiLight = new HemisphericLight('hemiLight', new Vector3(0, 1, 0), scene)
    hemiLight.intensity = 0.7

    const dirLight = new DirectionalLight('dirLight', new Vector3(-1, -1, -1), scene)
    dirLight.intensity = 0.5

    // If we have spatial model, render all floors stacked on top of each other
    if (spatialModel && spatialModel.building.floors.length > 0) {
      // Calculate cumulative elevations to avoid overlap
      // Each floor's actual base is the previous floor's top
      let cumulativeElevation = 0
      
      // Iterate through all floors and create their walls and floors
      spatialModel.building.floors.forEach((floor, floorIndex) => {
        // Use the floor's elevation if specified, otherwise stack on previous floor
        let floorElevation: number
        if (floorIndex === 0) {
          floorElevation = floor.elevation
          cumulativeElevation = floorElevation
        } else {
          // Calculate based on previous floor's total height
          const previousFloor = spatialModel.building.floors[floorIndex - 1]
          cumulativeElevation = cumulativeElevation + previousFloor.defaultHeight + FLOOR_THICKNESS
          floorElevation = Math.max(floor.elevation, cumulativeElevation)
          cumulativeElevation = floorElevation
        }
        
        const floorHeight = floor.defaultHeight
        const planScale = floor.plan2D.scale || 30

        // Create walls from zones for this floor
        floor.zones.forEach((zone) => {
          if (zone.polygon2D && zone.polygon2D.length >= 3) {
            // Create walls from polygon edges
            for (let i = 0; i < zone.polygon2D.length; i++) {
              const startPoint = zone.polygon2D[i]
              const endPoint = zone.polygon2D[(i + 1) % zone.polygon2D.length]
              
              const start = new Vector3(
                startPoint.x * planScale * SCALE,
                floorElevation + FLOOR_THICKNESS,
                startPoint.y * planScale * SCALE
              )
              const end = new Vector3(
                endPoint.x * planScale * SCALE,
                floorElevation + FLOOR_THICKNESS,
                endPoint.y * planScale * SCALE
              )
              
              const wallMesh = createWall(`wall_${floor.id}_zone_${zone.id}_${i}`, start, end, floorHeight, scene)
              
              // Position the wall on top of the floor (floor elevation + floor thickness + half wall height)
              wallMesh.position.y = floorElevation + FLOOR_THICKNESS + floorHeight / 2
              
              const wallMaterial = new StandardMaterial(`wallMat_${floor.id}_${zone.id}_${i}`, scene)
              wallMaterial.diffuseColor = new Color3(0.85, 0.85, 0.85)
              wallMaterial.specularColor = new Color3(0.1, 0.1, 0.1)
              wallMesh.material = wallMaterial

              wallMeshesRef.current.push(wallMesh)
            }

            // Create floor for this zone (use adjusted elevation)
            const floorWithAdjustedElevation = { ...floor, elevation: floorElevation }
            const floorMesh = createFloorFromZone(
              `zone_floor_${floor.id}_${zone.id}`,
              zone,
              floorWithAdjustedElevation,
              scene
            )
            
            const floorMaterial = new StandardMaterial(`zoneFloorMat_${floor.id}_${zone.id}`, scene)
            floorMaterial.diffuseColor = new Color3(0.95, 0.95, 0.9)
            floorMaterial.specularColor = new Color3(0.1, 0.1, 0.1)
            floorMaterial.alpha = 1.0
            floorMesh.material = floorMaterial
            
            floorMeshesRef.current.push(floorMesh)
            console.log(`Created floor and walls for ${zone.name} on ${floor.name} at elevation ${floorElevation}m`)
          }
        })
      })
    } else if (walls.length > 0) {
      // Fallback: use provided walls if no spatial model
      const currentFloor = spatialModel && selectedFloorId 
        ? spatialModel.building.floors.find(f => f.id === selectedFloorId)
        : null
      const floorElevation = currentFloor ? currentFloor.elevation : 0
      const floorHeight = currentFloor ? currentFloor.defaultHeight : WALL_HEIGHT

      walls.forEach((wall, index) => {
        const start = new Vector3(
          wall.start.x * SCALE,
          floorElevation + FLOOR_THICKNESS,
          wall.start.y * SCALE
        )
        const end = new Vector3(
          wall.end.x * SCALE,
          floorElevation + FLOOR_THICKNESS,
          wall.end.y * SCALE
        )

        const wallMesh = createWall(`wall_${index}`, start, end, floorHeight, scene)
        // Position the wall on top of the floor
        wallMesh.position.y = floorElevation + FLOOR_THICKNESS + floorHeight / 2

        const wallMaterial = new StandardMaterial(`wallMat_${index}`, scene)
        wallMaterial.diffuseColor = new Color3(0.85, 0.85, 0.85)
        wallMaterial.specularColor = new Color3(0.1, 0.1, 0.1)
        wallMesh.material = wallMaterial

        wallMeshesRef.current.push(wallMesh)
      })
    }

    // Create a base ground plane if no zones
    if (floorMeshesRef.current.length === 0) {
      const floorPlane = MeshBuilder.CreateGround(
        'floor',
        { width: maxDim * 2, height: maxDim * 2 },
        scene
      )
      floorPlane.position = new Vector3(centerX, 0, centerZ)
      const floorMat = new StandardMaterial('floorMat', scene)
      floorMat.diffuseColor = new Color3(0.9, 0.9, 0.9)
      floorMat.alpha = 0.8
      floorPlane.material = floorMat
      floorMeshesRef.current.push(floorPlane)
    }

    engine.runRenderLoop(() => {
      scene.render()
    })

    const handleResize = () => {
      engine.resize()
    }
    window.addEventListener('resize', handleResize)

    return () => {
      window.removeEventListener('resize', handleResize)
      wallMeshesRef.current.forEach(mesh => mesh.dispose())
      wallMeshesRef.current = []
      floorMeshesRef.current.forEach(mesh => mesh.dispose())
      floorMeshesRef.current = []
      if (cameraRef.current && canvasRef.current) {
        cameraRef.current.detachControl()
      }
      scene.dispose()
      engine.dispose()
    }
  }, [walls, spatialModel, selectedFloorId])

  return (
    <div className="spatial-view-container">
      <canvas ref={canvasRef} className="spatial-view-canvas" />
    </div>
  )
}

export default SpatialViewBabylon
