// Example Spatial Model data - corrected for structural integrity
import { SpatialModel, createDefaultSpatialModel, addFloor } from '../models/SpatialModel'

export function createExampleSpatialModel(): SpatialModel {
  let model = createDefaultSpatialModel()
  model.building.name = 'Balanced Office Building'

  // --- ÉTAGE 1 (Rez-de-chaussée) ---
  // Empreinte totale : x(0 à 20), y(0 à 10)
  const floor1: SpatialModel['building']['floors'][0] = {
    id: 'floor-1',
    name: 'Ground Floor',
    elevation: 0,
    defaultHeight: 2.8,
    plan2D: { width: 600, height: 400, scale: 30 },
    zones: [
      {
        id: 'zone-1-1',
        name: 'Reception Area',
        polygon2D: [{ x: 0, y: 0 }, { x: 10, y: 0 }, { x: 10, y: 10 }, { x: 0, y: 10 }],
        timeseries: { /* ... conservé ... */ }
      },
      {
        id: 'zone-1-2',
        name: 'Office A',
        polygon2D: [{ x: 10, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 10 }, { x: 10, y: 10 }],
        timeseries: { /* ... conservé ... */ },
        whyFlagged: 'High CO2 levels detected'
      }
    ],
    sensors: [
      { id: 'sensor-1-1', label: 'Reception Sensor', floorId: 'floor-1', position: { x: 5, y: 5, z: 2.0 }, linkedZoneId: 'zone-1-1' },
      { id: 'sensor-1-2', label: 'Office A Sensor', floorId: 'floor-1', position: { x: 15, y: 5, z: 2.0 }, linkedZoneId: 'zone-1-2' }
    ]
  }
  model = addFloor(model, floor1)

  // --- ÉTAGE 2 (Premier étage) ---
  // Doit être contenu dans x(0-20) et y(0-10). 
  // On le centre légèrement pour créer un effet de retrait (facultatif).
  // Élévation = floor1.elevation(0) + FLOOR_THICKNESS(0.1) + floor1.defaultHeight(2.8) = 2.9
  const floor2: SpatialModel['building']['floors'][0] = {
    id: 'floor-2',
    name: 'First Floor',
    elevation: 2.9, // floor1.elevation(0) + FLOOR_THICKNESS(0.1) + floor1.defaultHeight(2.8)
    defaultHeight: 2.8,
    plan2D: { width: 600, height: 400, scale: 30 },
    zones: [
      {
        id: 'zone-2-1',
        name: 'Meeting Room',
        // Inclus dans l'empreinte du RDC
        polygon2D: [{ x: 2, y: 1 }, { x: 18, y: 1 }, { x: 18, y: 9 }, { x: 2, y: 9 }],
        heightOverride: 3.2,
        timeseries: { /* ... conservé ... */ },
        whyFlagged: 'Very high CO2'
      }
    ],
    sensors: [
      { id: 'sensor-2-1', label: 'Meeting Sensor', floorId: 'floor-2', position: { x: 10, y: 5, z: 2.5 }, linkedZoneId: 'zone-2-1' }
    ]
  }
  model = addFloor(model, floor2)

  // --- ÉTAGE 3 (Second étage) ---
  // Doit être contenu dans l'empreinte du Floor 2 : x(2-18) et y(1-9)
  // Élévation = floor2.elevation(2.9) + FLOOR_THICKNESS(0.1) + floor2.defaultHeight(2.8) = 5.8
  const floor3: SpatialModel['building']['floors'][0] = {
    id: 'floor-3',
    name: 'Second Floor',
    elevation: 6.1, // floor2.elevation(2.9) + FLOOR_THICKNESS(0.1) + floor2.defaultHeight(2.8)
    defaultHeight: 2.8,
    plan2D: { width: 600, height: 400, scale: 30 },
    zones: [
      {
        id: 'zone-3-1',
        name: 'Office Area 1',
        polygon2D: [{ x: 2, y: 1 }, { x: 10, y: 1 }, { x: 10, y: 5 }, { x: 2, y: 5 }],
        timeseries: { /* ... */ }
      },
      {
        id: 'zone-3-2',
        name: 'Office Area 2',
        polygon2D: [{ x: 10, y: 1 }, { x: 18, y: 1 }, { x: 18, y: 5 }, { x: 10, y: 5 }],
        timeseries: { /* ... */ }
      },
      {
        id: 'zone-3-3',
        name: 'Kitchen',
        polygon2D: [{ x: 2, y: 5 }, { x: 8, y: 5 }, { x: 8, y: 9 }, { x: 2, y: 9 }],
        heightOverride: 3.0,
        timeseries: { /* ... */ }
      },
      {
        id: 'zone-3-4',
        name: 'Storage',
        polygon2D: [{ x: 8, y: 5 }, { x: 12, y: 5 }, { x: 12, y: 9 }, { x: 8, y: 9 }],
        heightOverride: 2.4,
        timeseries: { /* ... */ }
      }
    ],
    sensors: [
      { id: 'sensor-3-1', label: 'S3-1', floorId: 'floor-3', position: { x: 6, y: 3, z: 2.0 }, linkedZoneId: 'zone-3-1' },
      { id: 'sensor-3-2', label: 'S3-2', floorId: 'floor-3', position: { x: 14, y: 3, z: 2.0 }, linkedZoneId: 'zone-3-2' },
      { id: 'sensor-3-3', label: 'S3-3', floorId: 'floor-3', position: { x: 5, y: 7, z: 2.0 }, linkedZoneId: 'zone-3-3' }
    ]
  }
  model = addFloor(model, floor3)

  return model
}