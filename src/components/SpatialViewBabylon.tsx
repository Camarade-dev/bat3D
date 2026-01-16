import React, { useEffect, useRef, useState } from 'react'
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
  VertexData,
  TransformNode
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

// Create extruded zone mesh (2.5D extrusion)
const createExtrudedZone = (
  name: string,
  zone: Zone,
  floor: Floor,
  height: number,
  offsetX: number,
  offsetZ: number,
  scene: Scene
): Mesh => {
  const elevation = floor.elevation
  const planScale = floor.plan2D.scale || 30 // pixels per meter
  
  // Convert 2D polygon to 3D vertices with offset to center building
  const vertices: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  
  const numPoints = zone.polygon2D.length
  
  // Create vertices for bottom and top surfaces
  // Vertices are relative to mesh position, which will be at y = elevation + height/2
  const halfHeight = height / 2
  zone.polygon2D.forEach((point) => {
    // Convert plan coordinates to 3D: scale (pixels → world units) + offset (centering)
    const x3D = point.x * planScale * SCALE + offsetX
    const z3D = point.y * planScale * SCALE + offsetZ
    
    // Bottom surface (relative to mesh center, which will be at elevation + height/2)
    vertices.push(x3D, -halfHeight, z3D)
    // Top surface (relative to mesh center)
    vertices.push(x3D, halfHeight, z3D)
  })
  
  // Bottom face triangulation (fan triangulation)
  for (let i = 1; i < numPoints - 1; i++) {
    indices.push(0, i * 2, (i + 1) * 2)
  }
  
  // Top face triangulation (reverse order for correct normals)
  for (let i = 1; i < numPoints - 1; i++) {
    indices.push(1, (i + 1) * 2 + 1, i * 2 + 1)
  }
  
  // Side faces (extrusion walls) - reversed order to face inward (visible from inside)
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints
    const botI = i * 2
    const topI = i * 2 + 1
    const botNext = next * 2
    const topNext = next * 2 + 1
    
    // First triangle of side face (reversed for inward-facing normals)
    indices.push(botI, topI, botNext)
    // Second triangle of side face (reversed for inward-facing normals)
    indices.push(botNext, topI, topNext)
  }
  
  // Calculate UVs
  zone.polygon2D.forEach((_point, i) => {
    uvs.push(i / numPoints, 0) // Bottom surface UV
  })
  zone.polygon2D.forEach((_point, i) => {
    uvs.push(i / numPoints, 1) // Top surface UV
  })
  
  const vertexData = new VertexData()
  vertexData.positions = vertices
  vertexData.indices = indices
  vertexData.uvs = uvs
  
  // Compute normals automatically
  VertexData.ComputeNormals(vertices, indices, normals)
  vertexData.normals = normals
  
  const zoneMesh = new Mesh(name, scene)
  vertexData.applyToMesh(zoneMesh, true)
  
  // 3.2: Position mesh at y = floor.elevation + height/2
  zoneMesh.position.y = elevation + height / 2
  zoneMesh.position.x = 0  // Centered horizontally
  zoneMesh.position.z = 0  // Centered horizontally
  
  return zoneMesh
}

// Create floor mesh (separate from extruded zone, for floor thickness)
const createFloorFromZone = (
  name: string,
  zone: Zone,
  floor: Floor,
  offsetX: number,
  offsetZ: number,
  scene: Scene
): Mesh => {
  const elevation = floor.elevation
  const planScale = floor.plan2D.scale || 30 // pixels per meter
  
  const vertices: number[] = []
  const indices: number[] = []
  const normals: number[] = []
  const uvs: number[] = []
  
  const numPoints = zone.polygon2D.length
  
  zone.polygon2D.forEach((point) => {
    // Apply scale and offset
    const x3D = point.x * planScale * SCALE + offsetX
    const z3D = point.y * planScale * SCALE + offsetZ
    
    // Top surface at elevation + thickness
    vertices.push(x3D, elevation + FLOOR_THICKNESS, z3D)
    // Bottom surface at elevation
    vertices.push(x3D, elevation, z3D)
  })
  
  // Top face triangulation
  for (let i = 1; i < numPoints - 1; i++) {
    indices.push(0, i * 2, (i + 1) * 2)
  }
  
  // Bottom face triangulation
  for (let i = 1; i < numPoints - 1; i++) {
    indices.push(1, (i + 1) * 2 + 1, i * 2 + 1)
  }
  
  // Side faces
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints
    const topI = i * 2
    const botI = i * 2 + 1
    const topNext = next * 2
    const botNext = next * 2 + 1
    
    indices.push(topI, botI, botNext)
    indices.push(topI, botNext, topNext)
  }
  
  // Calculate UVs
  zone.polygon2D.forEach((point) => {
    uvs.push(point.x / 100, point.y / 100)
  })
  zone.polygon2D.forEach((point) => {
    uvs.push(point.x / 100, point.y / 100)
  })
  
  const vertexData = new VertexData()
  vertexData.positions = vertices
  vertexData.indices = indices
  vertexData.uvs = uvs
  
  VertexData.ComputeNormals(vertices, indices, normals)
  vertexData.normals = normals
  
  const floorMesh = new Mesh(name, scene)
  vertexData.applyToMesh(floorMesh, true)
  
  return floorMesh
}

const SpatialViewBabylon: React.FC<SpatialViewBabylonProps> = ({ walls, spatialModel, selectedFloorId }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const engineRef = useRef<Engine | null>(null)
  const sceneRef = useRef<Scene | null>(null)
  const cameraRef = useRef<ArcRotateCamera | null>(null)
  const wallMeshesRef = useRef<Mesh[]>([])
  const floorMeshesRef = useRef<Mesh[]>([])
  const floorRootsRef = useRef<Map<string, TransformNode>>(new Map())
  const zoneMeshesRef = useRef<Map<string, Mesh[]>>(new Map()) // floorId -> zone meshes
  const wallMeshesPerFloorRef = useRef<Map<string, Mesh[]>>(new Map()) // floorId -> wall meshes
  const [selectedViewFloorId, setSelectedViewFloorId] = useState<string>('')

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
    
    // Calculate building center offset (to center the building at origin)
    const centerX = (bounds.minX + bounds.maxX) / 2 * SCALE
    const centerZ = (bounds.minY + bounds.maxY) / 2 * SCALE
    const offsetX = -centerX  // Offset to center building
    const offsetZ = -centerZ  // Offset to center building
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

    // Camera positioned to see inside the building (looking from outside in)
    // Adjust angles to view from inside: alpha (horizontal) and beta (vertical)
    const camera = new ArcRotateCamera(
      'camera',
      Math.PI / 2.5, // Rotated 180° to look from inside
      Math.PI / 2.5, // Higher angle to see down into rooms
      Math.max(maxDim * 1.5, totalHeight * 1.5),
      new Vector3(0, totalHeight / 2, 0),
      scene
    )
    camera.setTarget(new Vector3(0, totalHeight / 2, 0))
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
      let cumulativeElevation = 0
      
      // Iterate through all floors and create their meshes
      spatialModel.building.floors.forEach((floor, floorIndex) => {
        // Calculate floor elevation (cumulative stacking)
        let floorElevation: number
        if (floorIndex === 0) {
          floorElevation = floor.elevation
          cumulativeElevation = floor.elevation
        } else {
          const previousFloor = spatialModel.building.floors[floorIndex - 1]
          cumulativeElevation = cumulativeElevation + FLOOR_THICKNESS + previousFloor.defaultHeight
          floorElevation = Math.max(floor.elevation, cumulativeElevation)
          cumulativeElevation = floorElevation
        }
        
        // 3.2: Create parent node floorRoot for this floor
        const floorRoot = new TransformNode(`floorRoot_${floor.id}`, scene)
        floorRoot.position = new Vector3(0, 0, 0) // Parent is at origin, children will be positioned
        floorRootsRef.current.set(floor.id, floorRoot)
        
        // Store meshes for this floor
        const floorZoneMeshes: Mesh[] = []
        
        // For each zone in this floor
        floor.zones.forEach((zone) => {
          if (zone.polygon2D && zone.polygon2D.length >= 3) {
            // Use zone.heightOverride || floor.defaultHeight
            const zoneHeight = zone.heightOverride || floor.defaultHeight
            
            // 3.2: Create extruded mesh for the zone
            // The mesh is positioned at y = floor.elevation + height/2 inside createExtrudedZone
            const zoneMesh = createExtrudedZone(
              `zone_extruded_${floor.id}_${zone.id}`,
              zone,
              { ...floor, elevation: floorElevation },
              zoneHeight,
              offsetX,
              offsetZ,
              scene
            )
            
            zoneMesh.parent = floorRoot
            
            // Material for extruded zone
            const zoneMaterial = new StandardMaterial(`zoneMat_${floor.id}_${zone.id}`, scene)
            zoneMaterial.diffuseColor = new Color3(0.95, 0.95, 0.9)
            zoneMaterial.specularColor = new Color3(0.1, 0.1, 0.1)
            zoneMaterial.alpha = 0.8
            zoneMesh.material = zoneMaterial
            
            floorMeshesRef.current.push(zoneMesh)
            floorZoneMeshes.push(zoneMesh)
            
            // Also create floor surface for visual clarity
            const floorMesh = createFloorFromZone(
              `zone_floor_${floor.id}_${zone.id}`,
              zone,
              { ...floor, elevation: floorElevation },
              offsetX,
              offsetZ,
              scene
            )
            
            const floorMaterial = new StandardMaterial(`zoneFloorMat_${floor.id}_${zone.id}`, scene)
            floorMaterial.diffuseColor = new Color3(0.9, 0.9, 0.85)
            floorMaterial.specularColor = new Color3(0.1, 0.1, 0.1)
            floorMaterial.alpha = 1.0
            floorMesh.material = floorMaterial
            floorMesh.parent = floorRoot
            
            floorMeshesRef.current.push(floorMesh)
            floorZoneMeshes.push(floorMesh)
            
            console.log(`Created extruded zone ${zone.name} on ${floor.name} at elevation ${floorElevation}m with height ${zoneHeight}m`)
          }
        })
        
        // Store zone meshes for this floor
        zoneMeshesRef.current.set(floor.id, floorZoneMeshes)
      })
      
      // Initialize with first floor selected if available
      if (spatialModel.building.floors.length > 0 && selectedViewFloorId === '') {
        setSelectedViewFloorId(spatialModel.building.floors[0].id)
      }
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
      floorRootsRef.current.clear()
      zoneMeshesRef.current.clear()
      wallMeshesPerFloorRef.current.clear()
      if (cameraRef.current && canvasRef.current) {
        cameraRef.current.detachControl()
      }
      scene.dispose()
      engine.dispose()
    }
  }, [walls, spatialModel, selectedFloorId])
  
  // Effect to update visibility based on selected view floor
  useEffect(() => {
    if (!spatialModel || !sceneRef.current || spatialModel.building.floors.length === 0 || !selectedViewFloorId) return
    
    const floors = spatialModel.building.floors
    const selectedIndex = floors.findIndex(f => f.id === selectedViewFloorId)
    
    if (selectedIndex === -1) return
    
    // Update visibility for each floor
    floors.forEach((floor, index) => {
      const floorRoot = floorRootsRef.current.get(floor.id)
      const zoneMeshes = zoneMeshesRef.current.get(floor.id) || []
      
      if (!floorRoot) return
      
      if (index < selectedIndex) {
        // Étages inférieurs : complètement visibles (avec murs)
        floorRoot.setEnabled(true)
        zoneMeshes.forEach(mesh => {
          mesh.setEnabled(true)
          if (mesh.material) {
            const mat = mesh.material as StandardMaterial
            mat.alpha = mesh.name.startsWith('zone_extruded_') ? 0.8 : 1.0
          }
        })
      } else if (index === selectedIndex) {
        // Étage sélectionné : zones visibles, murs cachés
        // Pour voir l'intérieur, on rend les zones extrudées transparentes mais on garde le sol
        floorRoot.setEnabled(true)
        zoneMeshes.forEach(mesh => {
          mesh.setEnabled(true)
          if (mesh.material) {
            const mat = mesh.material as StandardMaterial
            if (mesh.name.startsWith('zone_extruded_')) {
              // Rendre les murs (faces latérales) transparents pour voir l'intérieur
              mat.alpha = 0.1 // Presque invisible pour voir l'intérieur
            } else if (mesh.name.startsWith('zone_floor_')) {
              // Le sol reste visible
              mat.alpha = 1.0
            }
          }
        })
      } else {
        // Étages supérieurs : invisibles
        floorRoot.setEnabled(false)
      }
    })
  }, [selectedViewFloorId, spatialModel])
  
  // Render function
  return (
    <div className="spatial-view-container">
      <canvas ref={canvasRef} className="spatial-view-canvas" />
      {spatialModel && spatialModel.building.floors.length > 0 && (
        <div className="floor-view-menu">
          <h3>Sélection d'étage</h3>
          <div className="control-group">
            <label htmlFor="floor-view-select">Étage à visualiser :</label>
            <select
              id="floor-view-select"
              value={selectedViewFloorId}
              onChange={(e) => setSelectedViewFloorId(e.target.value)}
            >
              {spatialModel.building.floors.map((floor, index) => (
                <option key={floor.id} value={floor.id}>
                  {floor.name} (Étage {index})
                </option>
              ))}
            </select>
          </div>
          {selectedViewFloorId && (
            <div className="view-info">
              <p>
                <strong>Étage sélectionné :</strong> {spatialModel.building.floors.find(f => f.id === selectedViewFloorId)?.name}
              </p>
              <p className="info-text">
                • Les étages inférieurs sont complètement visibles<br/>
                • Les murs de l'étage sélectionné sont cachés<br/>
                • Les étages supérieurs sont invisibles
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default SpatialViewBabylon
