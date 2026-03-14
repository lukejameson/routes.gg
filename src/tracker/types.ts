// API response types

export interface ApiRoute {
  routeID: string;
  lineName: string;
  routeDescription: string;
  lineColor?: string;
  centrePointLat?: { parsedValue?: number };
  centrePointLng?: { parsedValue?: number };
}

export interface ApiStop {
  stopId: string;
  name: string;
  location?: { latitude?: number; longitude?: number };
}

export interface ApiStopCall {
  stopId: string;
  arrivalTime: string;
  departureTime: string;
}

export interface ApiTrip {
  headsign?: string;
  stopCalls: ApiStopCall[];
}

export interface ApiCalendar {
  applicableFrom: string;
  applicableTo: string;
  runsMonday: boolean;
  runsTuesday: boolean;
  runsWednesday: boolean;
  runsThursday: boolean;
  runsFriday: boolean;
  runsSaturday: boolean;
  runsSunday: boolean;
  additionalRunningDates: string[];
  excludedRunningDates: string[];
  stops: ApiStop[];
  trips: ApiTrip[];
}

export interface ApiVehiclePosition {
  vehicleRef: string;
  routeName?: string;
  routeId?: string;
  tripId?: string;
  direction?: string;
  scheduledTripStartTime?: string;
  agencyId: string;
  position: {
    latitude: number;
    longitude: number;
    bearing?: number;
  };
  nextStopId?: string;
  currentStopId?: string;
  occupancy?: { currentOccupancy?: number };
  destination?: string;
  vehicleId?: string;
  reported: string;
}

export interface ApiVehiclePositionsResponse {
  items: ApiVehiclePosition[];
}

// Timetables JSON types (output of scraper)

export interface TimetableStopTime {
  stopId: string;
  stopName: string;
  arrival: string;   // "HH:MM"
  departure: string; // "HH:MM"
}

export interface TimetableTrip {
  headsign?: string;
  stopTimes: TimetableStopTime[];
}

export interface TimetableStop {
  id: string;
  name: string;
  lat?: number;
  lng?: number;
}

export interface TimetableCalendar {
  direction: string;
  validFrom: string;  // "YYYY-MM-DD"
  validTo: string;    // "YYYY-MM-DD"
  serviceDays: {
    monday: boolean;
    tuesday: boolean;
    wednesday: boolean;
    thursday: boolean;
    friday: boolean;
    saturday: boolean;
    sunday: boolean;
  };
  additionalDates: string[];
  excludedDates: string[];
  stops: TimetableStop[];
  trips: TimetableTrip[];
}

export interface TimetableRoute {
  routeId: string;
  lineName: string;
  description?: string;
  color?: string;
  scrapedAt?: string;
  error?: string;
  calendars: TimetableCalendar[];
}

export interface TimetablesFile {
  scrapedAt: string;
  agency: string;
  totalRoutes: number;
  routes: TimetableRoute[];
}

// DB model types

export interface DbRoute {
  id: number;
  route_ref: string;
  line_name: string;
  line_name_norm: string;
}

export interface DbStop {
  id: number;
  stop_ref: string;
}

export interface DbTrip {
  id: number;
  first_departure: string;
}
