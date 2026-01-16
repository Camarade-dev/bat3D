// Example Spatial Model data - can be used as a starting point or loaded from API
import { SpatialModel, createDefaultSpatialModel, addFloor } from '../models/SpatialModel'

export function createExampleSpatialModel(): SpatialModel {
  // Start with default model
  let model = createDefaultSpatialModel()
  
  model.building.name = 'Example Office Building'

  // Add Floor 1 (Ground Floor)
  const floor1: SpatialModel['building']['floors'][0] = {
    id: 'floor-1',
    name: 'Ground Floor',
    elevation: 0,
    defaultHeight: 2.8,
    plan2D: {
      width: 600, // pixels
      height: 400,
      scale: 30 // 30 pixels per meter
    },
    zones: [
      {
        id: 'zone-1-1',
        name: 'Reception Area',
        polygon2D: [
          { x: 0, y: 0 },
          { x: 10, y: 0 },
          { x: 10, y: 8 },
          { x: 0, y: 8 }
        ],
        timeseries: {
          CO2: [
            { value: 450, confidence: 0.9 },
            { value: 480, confidence: 0.85 },
            { value: 520, confidence: 0.8 }
          ],
          TVOC: [
            { value: 200, confidence: 0.95 },
            { value: 220, confidence: 0.9 },
            { value: 250, confidence: 0.85 }
          ]
        }
      },
      {
        id: 'zone-1-2',
        name: 'Office A',
        polygon2D: [
          { x: 10, y: 0 },
          { x: 20, y: 0 },
          { x: 20, y: 10 },
          { x: 10, y: 10 }
        ],
        timeseries: {
          CO2: [
            { value: 600, confidence: 0.95 },
            { value: 650, confidence: 0.9 },
            { value: 700, confidence: 0.85 }
          ],
          PM25: [
            { value: 15, confidence: 0.8 },
            { value: 18, confidence: 0.75 },
            { value: 20, confidence: 0.7 }
          ]
        },
        whyFlagged: 'High CO2 levels detected - ventilation may be insufficient'
      }
    ],
    sensors: [
      {
        id: 'sensor-1-1',
        label: 'Reception Sensor',
        floorId: 'floor-1',
        position: { x: 5, y: 4, z: 2.0 },
        linkedZoneId: 'zone-1-1'
      },
      {
        id: 'sensor-1-2',
        label: 'Office A Sensor',
        floorId: 'floor-1',
        position: { x: 15, y: 5, z: 2.0 },
        linkedZoneId: 'zone-1-2'
      }
    ]
  }

  model = addFloor(model, floor1)

  // Add Floor 2
  const floor2: SpatialModel['building']['floors'][0] = {
    id: 'floor-2',
    name: 'First Floor',
    elevation: 2.8,
    defaultHeight: 2.8,
    plan2D: {
      width: 600,
      height: 400,
      scale: 30
    },
    zones: [
      {
        id: 'zone-2-1',
        name: 'Meeting Room',
        polygon2D: [
          { x: 5, y: 5 },
          { x: 15, y: 5 },
          { x: 15, y: 15 },
          { x: 5, y: 15 }
        ],
        heightOverride: 3.2,
        timeseries: {
          CO2: [
            { value: 800, confidence: 0.9 },
            { value: 850, confidence: 0.85 },
            { value: 900, confidence: 0.8 }
          ]
        },
        whyFlagged: 'Very high CO2 - room occupancy exceeded capacity'
      }
    ],
    sensors: [
      {
        id: 'sensor-2-1',
        label: 'Meeting Room Sensor',
        floorId: 'floor-2',
        position: { x: 10, y: 10, z: 2.5 },
        linkedZoneId: 'zone-2-1'
      }
    ]
  }

  model = addFloor(model, floor2)

  return model
}

// Helper to convert SpatialModel to JSON (for saving/loading)
export function spatialModelToJSON(model: SpatialModel): string {
  return JSON.stringify(model, null, 2)
}

// Helper to load SpatialModel from JSON
export function spatialModelFromJSON(json: string): SpatialModel {
  return JSON.parse(json) as SpatialModel
}
