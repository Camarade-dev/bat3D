// Spatial Model - Source of Truth for building structure and sensor data

export interface Point2D {
  x: number
  y: number
}

export interface Point3D {
  x: number
  y: number
  z: number
}

export interface Plan2D {
  imageUrl?: string
  width: number
  height: number
  scale?: number // pixels per meter, for example
}

export interface TimeSeriesPoint {
  value: number
  confidence: number // 0-1
}

export interface MetricTimeSeries {
  [metric: string]: TimeSeriesPoint[] // t=0..N-1
}

export interface Zone {
  id: string
  name: string
  polygon2D: Point2D[] // List of points forming the polygon
  heightOverride?: number // Optional override for zone height
  timeseries: MetricTimeSeries // metric → [{value, confidence}] for t=0..N-1
  whyFlagged?: string // Text explaining why the zone is flagged
}

export interface Sensor {
  id: string
  label: string
  floorId: string
  position: Point3D // x, y, z coordinates
  linkedZoneId?: string // Optional link to a zone
}

export interface Floor {
  id: string
  name: string
  elevation: number // Z coordinate of the floor base
  defaultHeight: number // Default height for zones on this floor
  plan2D: Plan2D // Reference image + dimensions / scale
  zones: Zone[] // List of zones (polygons 2D or rectangles)
  sensors: Sensor[] // List of sensors (x, y + height)
}

export interface Building {
  id: string
  name: string
  floors: Floor[] // List of floors
}

export interface SpatialModel {
  building: Building
  // Could extend with other metadata later
}

// Helper function to create a default spatial model
export function createDefaultSpatialModel(): SpatialModel {
  return {
    building: {
      id: 'building-1',
      name: 'Default Building',
      floors: []
    }
  }
}

// Helper function to find a floor by ID
export function findFloorById(model: SpatialModel, floorId: string): Floor | undefined {
  return model.building.floors.find(floor => floor.id === floorId)
}

// Helper function to find a zone by ID
export function findZoneById(model: SpatialModel, zoneId: string): { floor: Floor; zone: Zone } | undefined {
  for (const floor of model.building.floors) {
    const zone = floor.zones.find(z => z.id === zoneId)
    if (zone) {
      return { floor, zone }
    }
  }
  return undefined
}

// Helper function to find a sensor by ID
export function findSensorById(model: SpatialModel, sensorId: string): { floor: Floor; sensor: Sensor } | undefined {
  for (const floor of model.building.floors) {
    const sensor = floor.sensors.find(s => s.id === sensorId)
    if (sensor) {
      return { floor, sensor }
    }
  }
  return undefined
}

// Helper function to get metric value at time index for a zone
export function getZoneMetricValue(
  zone: Zone,
  metric: string,
  timeIndex: number
): TimeSeriesPoint | undefined {
  const series = zone.timeseries[metric]
  if (!series || timeIndex < 0 || timeIndex >= series.length) {
    return undefined
  }
  return series[timeIndex]
}

// Helper function to add a floor to a building
export function addFloor(model: SpatialModel, floor: Floor): SpatialModel {
  return {
    ...model,
    building: {
      ...model.building,
      floors: [...model.building.floors, floor]
    }
  }
}

// Helper function to add a zone to a floor
export function addZoneToFloor(
  model: SpatialModel,
  floorId: string,
  zone: Zone
): SpatialModel {
  const floors = model.building.floors.map(floor => {
    if (floor.id === floorId) {
      return {
        ...floor,
        zones: [...floor.zones, zone]
      }
    }
    return floor
  })

  return {
    ...model,
    building: {
      ...model.building,
      floors
    }
  }
}

// Helper function to add a sensor to a floor
export function addSensorToFloor(
  model: SpatialModel,
  floorId: string,
  sensor: Sensor
): SpatialModel {
  const floors = model.building.floors.map(floor => {
    if (floor.id === floorId) {
      return {
        ...floor,
        sensors: [...floor.sensors, sensor]
      }
    }
    return floor
  })

  return {
    ...model,
    building: {
      ...model.building,
      floors
    }
  }
}
