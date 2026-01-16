export interface Point2D {
  x: number
  y: number
}

export interface TimeSeriesDataPoint {
  v: number
  confidence: number
}

export interface Zone {
  id: string
  name: string
  polygon2d: Point2D[]
  heightOverride?: number
  timeseries: {
    CO2: TimeSeriesDataPoint[]
    TVOC: TimeSeriesDataPoint[]
    PM25: TimeSeriesDataPoint[]
  }
  whyFlagged: {
    CO2: string
    TVOC: string
    PM25: string
  }
}

export interface Sensor {
  id: string
  label: string
  floorId: string
  x: number
  y: number
  z: number
  linkedZoneId?: string
}

export interface Floor {
  id: string
  name: string
  elevation: number
  defaultHeight: number
  planScale: number
  zones: Zone[]
  sensors: Sensor[]
}

export interface Building {
  id: string
  name: string
  floors: Floor[]
}

export interface SpatialMockData {
  metrics: string[]
  time: {
    count: number
    label: string
  }
  building: Building
}

export const spatialMock: SpatialMockData = {
  metrics: ["CO2", "TVOC", "PM25"],
  time: { count: 48, label: "last 24h (30min steps)" },
  building: {
    id: "b1",
    name: "ERP Demo Building",
    floors: [
      {
        id: "f0",
        name: "RDC",
        elevation: 0,
        defaultHeight: 2.8,
        planScale: 1.0,
        zones: [
          {
            id: "z0",
            name: "Salle A",
            polygon2d: [
              { x: 0, y: 0 },
              { x: 6, y: 0 },
              { x: 6, y: 4 },
              { x: 0, y: 4 }
            ],
            timeseries: {
              CO2: Array(48).fill(0).map((_, i) => ({
                v: 600 + 200 * Math.sin(i / 6),
                confidence: 0.9
              })),
              TVOC: Array(48).fill(0).map((_, i) => ({
                v: 120 + 50 * Math.cos(i / 7),
                confidence: 0.85
              })),
              PM25: Array(48).fill(0).map((_, i) => ({
                v: 8 + 6 * Math.sin(i / 5),
                confidence: 0.8
              }))
            },
            whyFlagged: {
              CO2: "Persistent slow decay after occupancy compared to neighboring zones.",
              TVOC: "Repeated peaks around lunch hours.",
              PM25: "Elevated baseline during cleaning times."
            }
          },
          {
            id: "z1",
            name: "Salle B",
            polygon2d: [
              { x: 6, y: 0 },
              { x: 12, y: 0 },
              { x: 12, y: 4 },
              { x: 6, y: 4 }
            ],
            timeseries: {
              CO2: Array(48).fill(0).map((_, i) => ({
                v: 500 + 150 * Math.sin((i + 3) / 6),
                confidence: 0.92
              })),
              TVOC: Array(48).fill(0).map((_, i) => ({
                v: 100 + 40 * Math.cos((i + 2) / 7),
                confidence: 0.88
              })),
              PM25: Array(48).fill(0).map((_, i) => ({
                v: 7 + 5 * Math.sin((i + 1) / 5),
                confidence: 0.82
              }))
            },
            whyFlagged: {
              CO2: "Normal ventilation pattern observed.",
              TVOC: "Minor spikes during peak hours.",
              PM25: "Within acceptable limits."
            }
          },
          {
            id: "z2",
            name: "Couloir",
            polygon2d: [
              { x: 0, y: 4 },
              { x: 12, y: 4 },
              { x: 12, y: 6 },
              { x: 0, y: 6 }
            ],
            timeseries: {
              CO2: Array(48).fill(0).map((_, i) => ({
                v: 450 + 100 * Math.sin(i / 8),
                confidence: 0.95
              })),
              TVOC: Array(48).fill(0).map((_, i) => ({
                v: 80 + 30 * Math.cos(i / 9),
                confidence: 0.9
              })),
              PM25: Array(48).fill(0).map((_, i) => ({
                v: 6 + 4 * Math.sin(i / 6),
                confidence: 0.85
              }))
            },
            whyFlagged: {
              CO2: "Good air circulation in transit area.",
              TVOC: "Stable readings throughout the day.",
              PM25: "Minimal particle accumulation."
            }
          }
        ],
        sensors: [
          {
            id: "s0",
            label: "Breezly #01",
            floorId: "f0",
            x: 2.0,
            y: 2.0,
            z: 1.5,
            linkedZoneId: "z0"
          },
          {
            id: "s1",
            label: "Breezly #02",
            floorId: "f0",
            x: 8.0,
            y: 2.0,
            z: 1.5,
            linkedZoneId: "z1"
          }
        ]
      },
      {
        id: "f1",
        name: "Étage 1",
        elevation: 3.2,
        defaultHeight: 2.6,
        planScale: 1.0,
        zones: [
          {
            id: "z3",
            name: "Bureau 1",
            polygon2d: [
              { x: 0, y: 0 },
              { x: 5, y: 0 },
              { x: 5, y: 5 },
              { x: 0, y: 5 }
            ],
            timeseries: {
              CO2: Array(48).fill(0).map((_, i) => ({
                v: 700 + 250 * Math.sin(i / 5),
                confidence: 0.75
              })),
              TVOC: Array(48).fill(0).map((_, i) => ({
                v: 140 + 60 * Math.cos(i / 6),
                confidence: 0.7
              })),
              PM25: Array(48).fill(0).map((_, i) => ({
                v: 10 + 8 * Math.sin(i / 4),
                confidence: 0.65
              }))
            },
            whyFlagged: {
              CO2: "Elevated levels during extended occupancy periods.",
              TVOC: "Intermittent high readings suggesting ventilation issues.",
              PM25: "Particle concentration above recommended thresholds."
            }
          },
          {
            id: "z4",
            name: "Bureau 2",
            polygon2d: [
              { x: 5, y: 0 },
              { x: 10, y: 0 },
              { x: 10, y: 5 },
              { x: 5, y: 5 }
            ],
            timeseries: {
              CO2: Array(48).fill(0).map((_, i) => ({
                v: 550 + 180 * Math.sin((i + 2) / 6),
                confidence: 0.88
              })),
              TVOC: Array(48).fill(0).map((_, i) => ({
                v: 110 + 45 * Math.cos((i + 1) / 7),
                confidence: 0.85
              })),
              PM25: Array(48).fill(0).map((_, i) => ({
                v: 7.5 + 5.5 * Math.sin((i + 1) / 5),
                confidence: 0.8
              }))
            },
            whyFlagged: {
              CO2: "Moderate levels with occasional spikes.",
              TVOC: "Within normal operating range.",
              PM25: "Slight elevation during cleaning cycles."
            }
          }
        ],
        sensors: [
          {
            id: "s2",
            label: "Breezly #03",
            floorId: "f1",
            x: 2.5,
            y: 2.5,
            z: 4.1,
            linkedZoneId: "z3"
          },
          {
            id: "s3",
            label: "Breezly #04",
            floorId: "f1",
            x: 7.5,
            y: 2.5,
            z: 4.1,
            linkedZoneId: "z4"
          }
        ]
      }
    ]
  }
}
