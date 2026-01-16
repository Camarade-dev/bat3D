import React, { useState } from 'react'
import FloorPlanEditor, { Wall } from './components/FloorPlanEditor'
import SpatialViewBabylon from './components/SpatialViewBabylon'
import { SpatialModel, createDefaultSpatialModel } from './models/SpatialModel'
import { createExampleSpatialModel } from './data/spatialModelExample'
import './App.css'

function App() {
  const [show3D, setShow3D] = useState(false)
  const [walls, setWalls] = useState<Wall[]>([])
  // Initialize spatial model - in production this would come from an API or DB
  const [spatialModel, setSpatialModel] = useState<SpatialModel>(() => {
    // For now, use example data. Later this will be loaded from backend
    return createExampleSpatialModel()
  })
  const [selectedFloorId, setSelectedFloorId] = useState<string>(
    spatialModel.building.floors.length > 0 ? spatialModel.building.floors[0].id : ''
  )

  const handleGenerate3D = (editorWalls: Wall[]) => {
    setWalls(editorWalls)
    setShow3D(true)
  }

  const handleBackToEditor = () => {
    setShow3D(false)
  }

  const handleWallsUpdate = (updatedWalls: Wall[]) => {
    setWalls(updatedWalls)
  }

  return (
    <div className="App" style={{ width: '100vw', height: '100vh', overflow: 'hidden' }}>
      {!show3D ? (
        <div className="home-page">
          <div style={{ padding: '10px', background: '#f5f5f5', borderBottom: '1px solid #ddd', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <h2 style={{ margin: 0 }}>{spatialModel.building.name}</h2>
              <p style={{ margin: '5px 0', color: '#666' }}>
                {spatialModel.building.floors.length} étage(s) | Modèle spatial chargé
              </p>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <label htmlFor="floor-select" style={{ fontWeight: 600, color: '#333' }}>
                Étage :
              </label>
              <select
                id="floor-select"
                value={selectedFloorId}
                onChange={(e) => {
                  setSelectedFloorId(e.target.value)
                  setWalls([]) // Reset walls when changing floor
                  setShow3D(false) // Exit 3D view when changing floor
                }}
                style={{
                  padding: '8px 12px',
                  fontSize: '1rem',
                  border: '2px solid #667eea',
                  borderRadius: '8px',
                  background: 'white',
                  color: '#333',
                  cursor: 'pointer',
                  minWidth: '200px'
                }}
              >
                {spatialModel.building.floors.map(floor => (
                  <option key={floor.id} value={floor.id}>
                    {floor.name} (Élévation: {floor.elevation}m)
                  </option>
                ))}
              </select>
            </div>
          </div>
          <FloorPlanEditor 
            onGenerate3D={handleGenerate3D} 
            initialWalls={walls}
            onWallsChange={handleWallsUpdate}
            spatialModel={spatialModel}
            selectedFloorId={selectedFloorId}
          />
        </div>
              ) : (
                <div className="view-3d">
                  <SpatialViewBabylon
                    walls={walls} 
                    spatialModel={spatialModel}
                    selectedFloorId={selectedFloorId}
                    onBackToEditor={handleBackToEditor}
                  />
        </div>
      )}
    </div>
  )
}

export default App
