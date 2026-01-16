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
import { SpatialModel, Floor, Zone, TimeSeriesPoint } from '../models/SpatialModel'
import './SpatialViewBabylon.css'

interface SpatialViewBabylonProps {
  walls: Wall[]
  spatialModel?: SpatialModel
  selectedFloorId?: string
  onBackToEditor?: () => void
}

const WALL_HEIGHT = 3
const SCALE = 1 / 30
const FLOOR_THICKNESS = 0.1 // Thickness of floor in meters

// 4.1: Définir les seuils par métrique
interface MetricThresholds {
  green: number
  yellow: number
  orange: number
  red: number
}

const METRIC_THRESHOLDS: Record<string, MetricThresholds> = {
  CO2: { green: 800, yellow: 1000, orange: 1200, red: 1200 },
  TVOC: { green: 200, yellow: 300, orange: 400, red: 400 },
  PM25: { green: 10, yellow: 20, orange: 30, red: 30 }
}

// 4.2: Obtenir la couleur de l'état selon la valeur et la métrique
const getStateColor = (metric: string, value: number): Color3 => {
  const thresholds = METRIC_THRESHOLDS[metric] || METRIC_THRESHOLDS.CO2
  
  if (value < thresholds.green) {
    return new Color3(0.2, 0.8, 0.3) // Vert
  } else if (value < thresholds.yellow) {
    return new Color3(0.9, 0.9, 0.2) // Jaune
  } else if (value < thresholds.orange) {
    return new Color3(1.0, 0.6, 0.2) // Orange
  } else {
    return new Color3(0.9, 0.2, 0.2) // Rouge
  }
}

// 4.3: Appliquer la confiance → saturation/alpha
const applyConfidenceModifier = (
  baseColor: Color3,
  confidence: number,
  material: StandardMaterial
): void => {
  if (confidence >= 0.8) {
    // Confiance haute → couleur normale, alpha ~0.9
    material.diffuseColor = baseColor
    material.alpha = 0.9
  } else if (confidence >= 0.6) {
    // Confiance moyenne → désaturation légère, alpha ~0.75
    const gray = (baseColor.r + baseColor.g + baseColor.b) / 3
    material.diffuseColor = Color3.Lerp(new Color3(gray, gray, gray), baseColor, 0.7)
    material.alpha = 0.75
  } else {
    // Confiance basse → grisage + alpha ~0.55 + outline "incertain"
    const gray = (baseColor.r + baseColor.g + baseColor.b) / 3
    material.diffuseColor = new Color3(gray * 0.8, gray * 0.8, gray * 0.8)
    material.alpha = 0.55
    material.emissiveColor = new Color3(0.3, 0.3, 0.3) // Outline "incertain" via émission
  }
}

// Obtenir la valeur de métrique d'une zone à un temps donné
const getZoneMetricValueAtTime = (
  zone: Zone,
  metric: string,
  timeIndex: number,
  useRandomValues: boolean = false
): TimeSeriesPoint | undefined => {
  // Si on utilise des valeurs aléatoires (mode play), générer des valeurs
  if (useRandomValues) {
    const thresholds = METRIC_THRESHOLDS[metric] || METRIC_THRESHOLDS.CO2
    
    // Générer une valeur aléatoire entre 0 et 150% du seuil rouge pour avoir des variations
    const maxValue = thresholds.red * 1.5
    const value = Math.random() * maxValue
    
    // Générer une confiance aléatoire entre 0.5 et 1.0
    const confidence = 0.5 + Math.random() * 0.5
    
    return { value, confidence }
  }
  
  // Sinon, utiliser les données existantes
  const series = zone.timeseries[metric]
  if (!series || timeIndex < 0 || timeIndex >= series.length) {
    // Si on est en dehors des données, générer des valeurs aléatoires même en mode stop
    const thresholds = METRIC_THRESHOLDS[metric] || METRIC_THRESHOLDS.CO2
    const maxValue = thresholds.red * 1.5
    const value = Math.random() * maxValue
    const confidence = 0.5 + Math.random() * 0.5
    return { value, confidence }
  }
  return series[timeIndex]
}

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
  
  // Side faces (extrusion walls) - normal order to face outward (visible from outside)
  // This allows murs to be visible from outside for lower floors
  for (let i = 0; i < numPoints; i++) {
    const next = (i + 1) % numPoints
    const botI = i * 2
    const topI = i * 2 + 1
    const botNext = next * 2
    const topNext = next * 2 + 1
    
    // First triangle of side face (normal order for outward-facing normals)
    indices.push(botI, botNext, topI)
    // Second triangle of side face (normal order for outward-facing normals)
    indices.push(botNext, topNext, topI)
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

const SpatialViewBabylon: React.FC<SpatialViewBabylonProps> = ({ walls, spatialModel, selectedFloorId, onBackToEditor }) => {
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
  const [selectedMetric, setSelectedMetric] = useState<string>('CO2') // Métrique sélectionnée
  const [timeIndex, setTimeIndex] = useState<number>(0) // Index de temps (0..N-1)
  const [isPlaying, setIsPlaying] = useState<boolean>(false) // État play/stop
  const playIntervalRef = useRef<number | null>(null) // Référence pour l'interval d'animation

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
            
            // Material for extruded zone (murs inclus) avec colorimétrie basée sur l'état
            const zoneMaterial = new StandardMaterial(`zoneMat_${floor.id}_${zone.id}`, scene)
            zoneMaterial.specularColor = new Color3(0.1, 0.1, 0.1)
            zoneMaterial.backFaceCulling = false // Désactivé pour voir tous les murs (intérieur et extérieur)
            
            // Initialiser avec la colorimétrie selon la métrique et le temps sélectionnés
            const metricData = getZoneMetricValueAtTime(zone, selectedMetric, timeIndex)
            if (metricData) {
              const stateColor = getStateColor(selectedMetric, metricData.value)
              applyConfidenceModifier(stateColor, metricData.confidence, zoneMaterial)
            } else {
              // Pas de données : couleur par défaut
              zoneMaterial.diffuseColor = new Color3(0.85, 0.85, 0.8)
              zoneMaterial.alpha = 0.5
            }
            
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
      // Nettoyer l'interval de play/stop si présent
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
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
  
  // Fonction pour mettre à jour les matériaux des zones selon la métrique et le temps
  const updateZoneMaterials = (metric: string, t: number, useRandomValues: boolean = false) => {
    if (!spatialModel || !sceneRef.current) return

    spatialModel.building.floors.forEach((floor) => {
      const zoneMeshes = zoneMeshesRef.current.get(floor.id) || []
      
      floor.zones.forEach((zone) => {
        // Trouver le mesh extrudé pour cette zone (pas le floor mesh)
        const zoneMesh = zoneMeshes.find(
          (mesh) => mesh.name === `zone_extruded_${floor.id}_${zone.id}`
        )
        
        if (!zoneMesh || !zoneMesh.material) return

        const material = zoneMesh.material as StandardMaterial
        const metricData = getZoneMetricValueAtTime(zone, metric, t, useRandomValues)

        if (metricData) {
          // 4.2: Matériau dépend de (metric, t)
          const stateColor = getStateColor(metric, metricData.value)
          // 4.3: Appliquer la confiance → saturation/alpha
          applyConfidenceModifier(stateColor, metricData.confidence, material)
        } else {
          // Pas de données : couleur par défaut
          material.diffuseColor = new Color3(0.85, 0.85, 0.8)
          material.alpha = 0.5
        }
      })
    })
  }

  // Effet pour réinitialiser timeIndex si nécessaire quand la métrique change
  useEffect(() => {
    if (!spatialModel || spatialModel.building.floors.length === 0) return
    
    // Calculer le max pour la métrique sélectionnée
    const allLengths = spatialModel.building.floors.flatMap(floor => 
      floor.zones.map(z => z.timeseries[selectedMetric]?.length || 0)
    )
    const maxLength = allLengths.length > 0 ? Math.max(...allLengths) : 0
    const maxIndex = Math.max(0, maxLength - 1)
    
    // Réinitialiser si timeIndex dépasse le max
    if (timeIndex > maxIndex) {
      setTimeIndex(Math.max(0, maxIndex))
    }
  }, [selectedMetric, spatialModel])

  // Effet pour gérer le play/stop avec génération de valeurs aléatoires
  useEffect(() => {
    // Nettoyer l'interval précédent s'il existe
    if (playIntervalRef.current !== null) {
      clearInterval(playIntervalRef.current)
      playIntervalRef.current = null
    }

    if (isPlaying) {
      // Créer un interval pour faire avancer le temps toutes les 500ms
      playIntervalRef.current = window.setInterval(() => {
        setTimeIndex((prevIndex) => {
          // En mode play, on génère toujours des valeurs aléatoires (pas de limite max)
          // On incrémente juste l'index pour l'affichage, mais les valeurs sont aléatoires
          return prevIndex + 1
        })
      }, 500) // 500ms = 2 fois par seconde
    }

    return () => {
      if (playIntervalRef.current !== null) {
        clearInterval(playIntervalRef.current)
        playIntervalRef.current = null
      }
    }
  }, [isPlaying])

  // Effet pour mettre à jour les matériaux quand la métrique ou le temps change
  useEffect(() => {
    if (!spatialModel || spatialModel.building.floors.length === 0 || !sceneRef.current) return
    // Attendre que les meshes soient créés
    if (zoneMeshesRef.current.size === 0) return
    // En mode play, utiliser des valeurs aléatoires
    updateZoneMaterials(selectedMetric, timeIndex, isPlaying)
  }, [selectedMetric, timeIndex, spatialModel, isPlaying])

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
        // Étages inférieurs : TOUS LES MURS visibles, aucune modification
        // Les murs sont orientés vers l'extérieur et restent visibles normalement
        floorRoot.setEnabled(true)
        zoneMeshes.forEach(mesh => {
          mesh.setEnabled(true)
          if (mesh.material) {
            const mat = mesh.material as StandardMaterial
            // Pas de modification : alpha = 1.0, backFaceCulling = false pour voir tous les murs
            mat.alpha = 1.0
            mat.backFaceCulling = false // Désactivé pour voir les 4 murs de la pièce
          }
        })
      } else if (index === selectedIndex) {
        // Étage sélectionné : murs rendus transparents ET double-face pour voir l'intérieur
        floorRoot.setEnabled(true)
        zoneMeshes.forEach(mesh => {
          mesh.setEnabled(true)
          if (mesh.material) {
            const mat = mesh.material as StandardMaterial
            if (mesh.name.startsWith('zone_extruded_')) {
              // Rendre les murs transparents pour voir l'intérieur
              mat.alpha = 0.25 // Très transparent
              mat.backFaceCulling = false // Permet de voir l'intérieur
            } else if (mesh.name.startsWith('zone_floor_')) {
              // Le sol reste visible normalement
              mat.alpha = 1.0
              mat.backFaceCulling = true
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
      <div className="spatial-view-canvas-wrapper">
        <canvas ref={canvasRef} className="spatial-view-canvas" />
      </div>
      <div className="spatial-view-sidebar">
        {onBackToEditor && (
          <button className="back-to-editor-button" onClick={onBackToEditor}>
            ← Retour à l'éditeur
          </button>
        )}
        {spatialModel && spatialModel.building.floors.length > 0 && (
          <>
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
            
            <h3>Métrique</h3>
            <div className="control-group">
              <label htmlFor="metric-select">Métrique à visualiser :</label>
              <select
                id="metric-select"
                value={selectedMetric}
                onChange={(e) => setSelectedMetric(e.target.value)}
              >
                <option value="CO2">CO2 (ppm)</option>
                <option value="TVOC">TVOC (ppb)</option>
                <option value="PM25">PM2.5 (µg/m³)</option>
              </select>
            </div>
            
            <h3>Temps</h3>
            <div className="control-group">
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '10px' }}>
                <button
                  onClick={() => setIsPlaying(!isPlaying)}
                  style={{
                    padding: '8px 16px',
                    fontSize: '1rem',
                    fontWeight: '600',
                    border: 'none',
                    borderRadius: '6px',
                    cursor: 'pointer',
                    backgroundColor: isPlaying ? '#e63333' : '#33cc33',
                    color: 'white',
                    transition: 'background-color 0.2s',
                    minWidth: '100px'
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.backgroundColor = isPlaying ? '#cc0000' : '#28a028'
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.backgroundColor = isPlaying ? '#e63333' : '#33cc33'
                  }}
                >
                  {isPlaying ? '⏸ Stop' : '▶ Play'}
                </button>
                <label htmlFor="time-slider" style={{ flex: 1 }}>
                  Index de temps : {timeIndex}
                </label>
              </div>
              {spatialModel.building.floors.length > 0 && (() => {
                // Calculer le max de tous les étages et zones (seulement si pas en mode play)
                if (isPlaying) {
                  // En mode play, afficher un message indiquant la génération aléatoire
                  return (
                    <div style={{ fontSize: '0.85em', color: '#666', marginTop: '5px', padding: '8px', background: '#f0f0f0', borderRadius: '4px' }}>
                      🔄 Mode aléatoire actif - Les valeurs sont générées en continu
                    </div>
                  )
                }
                
                const allLengths = spatialModel.building.floors.flatMap(floor => 
                  floor.zones.map(z => z.timeseries[selectedMetric]?.length || 0)
                )
                const maxLength = allLengths.length > 0 ? Math.max(...allLengths) : 0
                const maxIndex = Math.max(0, maxLength - 1)
                
                if (maxLength === 0) return null
                
                return (
                  <>
                    <input
                      id="time-slider"
                      type="range"
                      min="0"
                      max={maxIndex}
                      value={Math.min(timeIndex, maxIndex)}
                      onChange={(e) => setTimeIndex(parseInt(e.target.value))}
                      style={{ width: '100%' }}
                      disabled={isPlaying}
                    />
                    <div className="time-info" style={{ fontSize: '0.85em', color: '#666', marginTop: '5px' }}>
                      T = {Math.min(timeIndex, maxIndex)} (sur {maxIndex})
                    </div>
                  </>
                )
              })()}
            </div>
            
            {selectedViewFloorId && (
              <div className="view-info">
                <p>
                  <strong>Étage sélectionné :</strong> {spatialModel.building.floors.find(f => f.id === selectedViewFloorId)?.name}
                </p>
                <p className="info-text">
                  • Les étages inférieurs sont complètement visibles<br/>
                  • Les murs de l'étage sélectionné sont transparents<br/>
                  • Les étages supérieurs sont invisibles
                </p>
                <p className="info-text" style={{ marginTop: '10px' }}>
                  <strong>Légende des couleurs ({selectedMetric}):</strong><br/>
                  <span style={{ color: '#33cc33' }}>●</span> Vert : &lt;{METRIC_THRESHOLDS[selectedMetric]?.green}<br/>
                  <span style={{ color: '#e6e600' }}>●</span> Jaune : &lt;{METRIC_THRESHOLDS[selectedMetric]?.yellow}<br/>
                  <span style={{ color: '#ff9900' }}>●</span> Orange : &lt;{METRIC_THRESHOLDS[selectedMetric]?.orange}<br/>
                  <span style={{ color: '#e63333' }}>●</span> Rouge : &gt;={METRIC_THRESHOLDS[selectedMetric]?.red}
                </p>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  )
}

export default SpatialViewBabylon
