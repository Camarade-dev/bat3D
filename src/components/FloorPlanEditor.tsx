import React, { useState, useCallback, useRef, useEffect } from 'react'
import { SpatialModel, Floor, Zone } from '../models/SpatialModel'
import './FloorPlanEditor.css'

interface Point {
  x: number
  y: number
}

interface Wall {
  id: string
  start: Point
  end: Point
}

interface Cell {
  row: number
  col: number
}

interface FloorPlanEditorProps {
  onGenerate3D: (walls: Wall[]) => void
  initialWalls?: Wall[]
  onWallsChange?: (walls: Wall[]) => void
  spatialModel?: SpatialModel
  selectedFloorId?: string
}

const GRID_SIZE = 20
const CELL_SIZE = 30

const FloorPlanEditor: React.FC<FloorPlanEditorProps> = ({ 
  onGenerate3D, 
  initialWalls = [], 
  onWallsChange,
  spatialModel,
  selectedFloorId
}) => {
  const [walls, setWalls] = useState<Wall[]>(initialWalls)
  const [hoveredEdge, setHoveredEdge] = useState<string | null>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [currentStart, setCurrentStart] = useState<Point | null>(null)
  const canvasRef = useRef<HTMLCanvasElement>(null)
  
  // Get the selected floor or first floor
  const currentFloor: Floor | undefined = spatialModel 
    ? (selectedFloorId 
        ? spatialModel.building.floors.find(f => f.id === selectedFloorId)
        : spatialModel.building.floors[0])
    : undefined

  const getCellFromMouse = (e: React.MouseEvent<HTMLCanvasElement>): Cell | null => {
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    const col = Math.floor(x / CELL_SIZE)
    const row = Math.floor(y / CELL_SIZE)

    if (col >= 0 && col < GRID_SIZE && row >= 0 && row < GRID_SIZE) {
      return { row, col }
    }
    return null
  }

  const getEdgeKey = (start: Point, end: Point): string => {
    if (start.x === end.x && start.y === end.y) return ''
    const ordered = [start, end].sort((a, b) => {
      if (Math.abs(a.x - b.x) < 0.1) {
        return a.y - b.y
      }
      return a.x - b.x
    })
    return `${Math.round(ordered[0].x)},${Math.round(ordered[0].y)}-${Math.round(ordered[1].x)},${Math.round(ordered[1].y)}`
  }

  const cellToPoint = (cell: Cell): Point => ({
    x: cell.col * CELL_SIZE,
    y: cell.row * CELL_SIZE
  })

  const pointToCell = (point: Point): Cell => ({
    row: Math.round(point.y / CELL_SIZE),
    col: Math.round(point.x / CELL_SIZE)
  })

  const getNeighborEdges = (cell: Cell): { start: Point; end: Point; key: string }[] => {
    const edges: { start: Point; end: Point; key: string }[] = []
    
    const topLeft = cellToPoint(cell)
    const topRight = { x: topLeft.x + CELL_SIZE, y: topLeft.y }
    const bottomLeft = { x: topLeft.x, y: topLeft.y + CELL_SIZE }
    const bottomRight = { x: topLeft.x + CELL_SIZE, y: topLeft.y + CELL_SIZE }

    edges.push(
      { 
        start: topLeft, 
        end: topRight, 
        key: `edge-${cell.row}-${cell.col}-top`
      },
      { 
        start: topRight, 
        end: bottomRight, 
        key: `edge-${cell.row}-${cell.col}-right`
      },
      { 
        start: bottomLeft, 
        end: bottomRight, 
        key: `edge-${cell.row}-${cell.col}-bottom`
      },
      { 
        start: topLeft, 
        end: bottomLeft, 
        key: `edge-${cell.row}-${cell.col}-left`
      }
    )

    return edges
  }

  const findEdgeAtPosition = (e: React.MouseEvent<HTMLCanvasElement>): { start: Point; end: Point; key: string } | null => {
    const cell = getCellFromMouse(e)
    if (!cell) return null

    const edges = getNeighborEdges(cell)
    const canvas = canvasRef.current
    if (!canvas) return null

    const rect = canvas.getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top

    for (const edge of edges) {
      const dx = edge.end.x - edge.start.x
      const dy = edge.end.y - edge.start.y
      const distSq = dx * dx + dy * dy

      const px = x - edge.start.x
      const py = y - edge.start.y
      const proj = (px * dx + py * dy) / distSq

      if (proj >= 0 && proj <= 1) {
        const closestX = edge.start.x + proj * dx
        const closestY = edge.start.y + proj * dy
        const distToEdge = Math.sqrt((x - closestX) ** 2 + (y - closestY) ** 2)

        if (distToEdge < 10) {
          return edge
        }
      }
    }

    return null
  }

  const toggleWall = (edge: { start: Point; end: Point }) => {
    const wallKey = getEdgeKey(edge.start, edge.end)

    setWalls(prev => {
      const exists = prev.some(w => {
        const wKey = getEdgeKey(w.start, w.end)
        return wKey === wallKey
      })

      let newWalls: Wall[]
      if (exists) {
        newWalls = prev.filter(w => {
          const wKey = getEdgeKey(w.start, w.end)
          return wKey !== wallKey
        })
      } else {
        newWalls = [...prev, {
          id: `wall-${Date.now()}-${Math.random()}`,
          start: edge.start,
          end: edge.end
        }]
      }
      
      if (onWallsChange) {
        onWallsChange(newWalls)
      }
      
      return newWalls
    })
  }

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const edge = findEdgeAtPosition(e)
    if (edge) {
      setHoveredEdge(edge.key)
    } else {
      setHoveredEdge(null)
    }
  }

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const edge = findEdgeAtPosition(e)
    if (edge) {
      toggleWall(edge)
    }
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return

    const ctx = canvas.getContext('2d')
    if (!ctx) return

    ctx.clearRect(0, 0, canvas.width, canvas.height)

    const width = GRID_SIZE * CELL_SIZE
    const height = GRID_SIZE * CELL_SIZE

    // Draw zones from spatial model if available
    if (currentFloor) {
      const scale = currentFloor.plan2D.scale || 30 // pixels per meter
      
      currentFloor.zones.forEach((zone: Zone) => {
        if (zone.polygon2D.length < 3) return
        
        // Draw zone fill
        ctx.fillStyle = 'rgba(100, 150, 255, 0.2)'
        ctx.beginPath()
        zone.polygon2D.forEach((point, index) => {
          const x = point.x * scale
          const y = point.y * scale
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.closePath()
        ctx.fill()
        
        // Draw zone outline
        ctx.strokeStyle = '#6495ED'
        ctx.lineWidth = 2
        ctx.beginPath()
        zone.polygon2D.forEach((point, index) => {
          const x = point.x * scale
          const y = point.y * scale
          if (index === 0) {
            ctx.moveTo(x, y)
          } else {
            ctx.lineTo(x, y)
          }
        })
        ctx.closePath()
        ctx.stroke()
        
        // Draw zone label
        if (zone.polygon2D.length > 0) {
          const centerX = zone.polygon2D.reduce((sum, p) => sum + p.x, 0) / zone.polygon2D.length * scale
          const centerY = zone.polygon2D.reduce((sum, p) => sum + p.y, 0) / zone.polygon2D.length * scale
          ctx.fillStyle = '#333'
          ctx.font = '12px Arial'
          ctx.textAlign = 'center'
          ctx.fillText(zone.name, centerX, centerY)
        }
      })
      
      // Draw sensors
      currentFloor.sensors.forEach(sensor => {
        const x = sensor.position.x * scale
        const y = sensor.position.y * scale
        
        ctx.fillStyle = '#FF6B6B'
        ctx.beginPath()
        ctx.arc(x, y, 5, 0, Math.PI * 2)
        ctx.fill()
        
        ctx.fillStyle = '#333'
        ctx.font = '10px Arial'
        ctx.textAlign = 'left'
        ctx.fillText(sensor.label, x + 8, y + 4)
      })
    }

    // Draw grid
    ctx.strokeStyle = '#ddd'
    ctx.lineWidth = 1

    for (let i = 0; i <= GRID_SIZE; i++) {
      ctx.beginPath()
      ctx.moveTo(i * CELL_SIZE, 0)
      ctx.lineTo(i * CELL_SIZE, height)
      ctx.stroke()

      ctx.beginPath()
      ctx.moveTo(0, i * CELL_SIZE)
      ctx.lineTo(width, i * CELL_SIZE)
      ctx.stroke()
    }

    // Draw walls
    for (let row = 0; row < GRID_SIZE; row++) {
      for (let col = 0; col < GRID_SIZE; col++) {
        const cell = { row, col }
        const edges = getNeighborEdges(cell)

        for (const edge of edges) {
          const wallExists = walls.some(w => {
            const wKey = getEdgeKey(w.start, w.end)
            const eKey = getEdgeKey(edge.start, edge.end)
            return wKey === eKey
          })

          const isHovered = hoveredEdge === edge.key

          if (wallExists) {
            ctx.strokeStyle = '#2196F3'
            ctx.lineWidth = 4
          } else if (isHovered) {
            ctx.strokeStyle = '#4CAF50'
            ctx.lineWidth = 3
          } else {
            continue
          }

          ctx.beginPath()
          ctx.moveTo(edge.start.x, edge.start.y)
          ctx.lineTo(edge.end.x, edge.end.y)
          ctx.stroke()
        }
      }
    }
  }, [walls, hoveredEdge, currentFloor])

  useEffect(() => {
    draw()
  }, [draw])

  useEffect(() => {
    if (initialWalls.length > 0 || walls.length === 0) {
      setWalls(initialWalls)
    }
  }, [initialWalls])

  return (
    <div className="floor-plan-editor">
      <div className="editor-header">
        <h2>Éditeur de Plan - Cliquez sur les arrêtes pour créer des murs</h2>
        <p>Cliquez sur une arrête pour l'ajouter/supprimer. Murs sélectionnés: {walls.length}</p>
      </div>
      <div className="canvas-container">
        <canvas
          ref={canvasRef}
          width={GRID_SIZE * CELL_SIZE}
          height={GRID_SIZE * CELL_SIZE}
          onMouseMove={handleMouseMove}
          onClick={handleClick}
          className="floor-plan-canvas"
        />
      </div>
      <div className="editor-actions">
        <button 
          className="generate-button" 
          onClick={() => {
            // If no walls are manually created, generate walls from zones
            if (walls.length === 0 && currentFloor) {
              const wallsFromZones: Wall[] = []
              currentFloor.zones.forEach(zone => {
                // Convert polygon to walls (edges)
                for (let i = 0; i < zone.polygon2D.length; i++) {
                  const start = zone.polygon2D[i]
                  const end = zone.polygon2D[(i + 1) % zone.polygon2D.length]
                  const scale = currentFloor.plan2D.scale || 30
                  wallsFromZones.push({
                    id: `wall-zone-${zone.id}-${i}`,
                    start: { x: start.x * scale, y: start.y * scale },
                    end: { x: end.x * scale, y: end.y * scale }
                  })
                }
              })
              onGenerate3D(wallsFromZones)
            } else {
              onGenerate3D(walls)
            }
          }}
          disabled={walls.length === 0 && (!currentFloor || currentFloor.zones.length === 0)}
        >
          Générer la vue 3D
        </button>
        {currentFloor && (
          <p style={{ marginTop: '10px', color: '#666', fontSize: '0.9rem' }}>
            {currentFloor.zones.length} zone(s) sur {currentFloor.name}
            {walls.length === 0 && currentFloor.zones.length > 0 && (
              <span style={{ display: 'block', marginTop: '5px', fontStyle: 'italic' }}>
                (Les zones seront automatiquement converties en murs)
              </span>
            )}
          </p>
        )}
      </div>
    </div>
  )
}

export default FloorPlanEditor
export type { Wall, Point }
