import { attraction } from '../config';

/**
 * Weather service for the visitor guide.
 *
 * Two upstream sources are resolved on the server while the page is rendered and
 * kept in a short-lived module cache, so a single render hits each service at
 * most once:
 *   - the forecast (air temperature, wind, rain, UV, sunrise/sunset)
 *   - the coastal forecast for this beach-front landmark (wave height, sea
 *     temperature, tide level)
 *
 * The markup they produce is plain HTML, which is what search engines and
 * no-JS visitors see; the page then refreshes the same figures in the browser
 * so the numbers stay current between builds.
 *
 * `advice*` below turns those raw numbers into decisions a visitor can act on
 * ("bring a raincoat", "the boat trips are likely cancelled") instead of
 * repeating meteorological values back at them.
 */

const ENDPOINT = 'https://api.open-meteo.com/v1/forecast';
const MARINE_ENDPOINT = 'https://marine-api.open-meteo.com/v1/marine';
const CACHE_TTL_MS = 15 * 60 * 1000;
const REQUEST_TIMEOUT_MS = 6000;

export type WeatherGroup =
  | 'clear'
  | 'mainlyClear'
  | 'partlyCloudy'
  | 'overcast'
  | 'fog'
  | 'drizzle'
  | 'rain'
  | 'showers'
  | 'snow'
  | 'thunderstorm';

/** WMO 4677 weather codes collapsed into the groups the guide actually displays. */
export const groupForCode = (code: number): WeatherGroup => {
  if (code === 0) return 'clear';
  if (code === 1) return 'mainlyClear';
  if (code === 2) return 'partlyCloudy';
  if (code === 3) return 'overcast';
  if (code === 45 || code === 48) return 'fog';
  if (code >= 51 && code <= 57) return 'drizzle';
  if (code >= 61 && code <= 67) return 'rain';
  if (code >= 80 && code <= 82) return 'showers';
  if (code >= 71 && code <= 77) return 'snow';
  if (code === 85 || code === 86) return 'snow';
  if (code >= 95) return 'thunderstorm';
  return 'partlyCloudy';
};

/** Glyph per group; the sun/moon pair is the only day/night dependent case. */
export const iconForCode = (code: number, isDay = true): string => {
  const group = groupForCode(code);
  switch (group) {
    case 'clear':
      return isDay ? '☀️' : '🌙';
    case 'mainlyClear':
      return isDay ? '🌤️' : '🌙';
    case 'partlyCloudy':
      return '⛅';
    case 'overcast':
      return '☁️';
    case 'fog':
      return '🌫️';
    case 'drizzle':
      return '🌦️';
    case 'rain':
      return '🌧️';
    case 'showers':
      return '🌦️';
    case 'snow':
      return '🌨️';
    case 'thunderstorm':
      return '⛈️';
    default:
      return '🌤️';
  }
};

/**
 * Beaufort wind force from a speed in km/h.
 * 0 calm · 3 gentle breeze · 5 fresh breeze · 6 strong breeze · 7 near gale.
 */
export function beaufort(kmh: number): number {
  const upper = [1, 5, 11, 19, 28, 38, 49, 61, 74, 88, 102, 117];
  for (let i = 0; i < upper.length; i += 1) {
    if (kmh < upper[i]) return i;
  }
  return 12;
}

export interface CurrentConditions {
  temperature: number;
  apparent: number;
  humidity: number;
  precipitation: number;
  wind: number;
  code: number;
  isDay: boolean;
  /** local HH:MM, for display */
  time: string;
  /** full local ISO timestamp, used to anchor the tide curve to today */
  iso: string;
}

export interface DailyForecast {
  /** ISO date, e.g. 2026-09-11 */
  date: string;
  code: number;
  max: number;
  min: number;
  rainChance: number;
  rainSum: number;
  windMax: number;
  uvMax: number;
  sunrise: string;
  sunset: string;
}

export interface WeatherData {
  current: CurrentConditions;
  daily: DailyForecast[];
  /** ISO timestamp of when the figures were retrieved */
  fetchedAt: string;
  timezone: string;
}

export interface TideMark {
  /** 'high' = high water, 'low' = low water */
  type: 'high' | 'low';
  /** local HH:MM */
  time: string;
  /** metres relative to mean sea level */
  level: number;
}

export interface TideInfo {
  /** direction the water is moving right now */
  trend: 'rising' | 'falling' | 'steady';
  /** the next turning point, used for the "when to go" hint */
  next: TideMark | null;
  /** turning points falling on today's date */
  today: TideMark[];
  /** the next few turning points (today and beyond), for the tide panel list */
  upcoming: TideMark[];
  /** today's sea level hour by hour, from midnight local time */
  curve: number[];
  /** today's highest water, in metres */
  high: number | null;
  /** today's lowest water, in metres */
  low: number | null;
  /** difference between today's highest and lowest water, in metres */
  range: number;
}

export interface MarineData {
  /** significant wave height in metres, right now */
  wave: number;
  /** highest wave height forecast for today */
  waveMax: number;
  /** dominant wave period in seconds */
  wavePeriod: number;
  /** sea surface temperature in °C */
  seaTemp: number;
  tide: TideInfo;
  fetchedAt: string;
}

interface CacheEntry<T> {
  at: number;
  data: T;
}

let cache: CacheEntry<WeatherData> | null = null;
let inflight: Promise<WeatherData | null> | null = null;
let marineCache: CacheEntry<MarineData> | null = null;
let marineInflight: Promise<MarineData | null> | null = null;

const round = (value: unknown, digits = 0): number =>
  typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : 0;

const optional = (value: unknown, digits = 1): number | null =>
  typeof value === 'number' && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;

const clock = (iso: string): string => (typeof iso === 'string' && iso.length >= 16 ? iso.slice(11, 16) : '');

function normalise(payload: any): WeatherData {
  const current = payload?.current ?? {};
  const daily = payload?.daily ?? {};

  const days: DailyForecast[] = (daily.time ?? []).map((date: string, i: number) => ({
    date,
    code: round(daily.weather_code?.[i]),
    max: round(daily.temperature_2m_max?.[i], 1),
    min: round(daily.temperature_2m_min?.[i], 1),
    rainChance: round(daily.precipitation_probability_max?.[i]),
    rainSum: round(daily.precipitation_sum?.[i], 1),
    windMax: round(daily.wind_speed_10m_max?.[i]),
    uvMax: round(daily.uv_index_max?.[i], 1),
    sunrise: clock(daily.sunrise?.[i] ?? ''),
    sunset: clock(daily.sunset?.[i] ?? ''),
  }));

  return {
    current: {
      temperature: round(current.temperature_2m, 1),
      apparent: round(current.apparent_temperature, 1),
      humidity: round(current.relative_humidity_2m),
      precipitation: round(current.precipitation, 1),
      wind: round(current.wind_speed_10m, 1),
      code: round(current.weather_code),
      isDay: current.is_day === 1,
      time: clock(current.time ?? ''),
      iso: typeof current.time === 'string' ? current.time : '',
    },
    daily: days,
    fetchedAt: new Date().toISOString(),
    timezone: payload?.timezone ?? attraction.timezone,
  };
}

/**
 * Sea level arrives as an hourly series; tide times are the local turning
 * points of that curve (a point higher than both neighbours is high water).
 */
function tideFrom(hourly: any, now: string): TideInfo {
  const times: string[] = Array.isArray(hourly?.time) ? hourly.time : [];
  const levels: number[] = Array.isArray(hourly?.sea_level_height_msl) ? hourly.sea_level_height_msl : [];

  const hourKey = (iso: string) => iso.slice(0, 13);
  const marks: (TideMark & { iso: string })[] = [];

  for (let i = 1; i < levels.length - 1; i += 1) {
    const prev = levels[i - 1];
    const cur = levels[i];
    const upcoming = levels[i + 1];
    if (![prev, cur, upcoming].every((v) => typeof v === 'number' && Number.isFinite(v))) continue;
    if (cur > prev && cur >= upcoming) {
      marks.push({ type: 'high', time: clock(times[i]), level: cur, iso: times[i] });
    } else if (cur < prev && cur <= upcoming) {
      marks.push({ type: 'low', time: clock(times[i]), level: cur, iso: times[i] });
    }
  }

  const nowKey = hourKey(now || times[0] || '');
  const todayKey = (now || times[0] || '').slice(0, 10);

  const upcoming = marks.filter((m) => hourKey(m.iso) > nowKey);
  const today = marks.filter((m) => m.iso.slice(0, 10) === todayKey);

  // the hourly curve for today, drawn as the small chart in the tide panel
  const curve = times
    .map((t, i) => ({ t, v: levels[i] }))
    .filter((p) => p.t.slice(0, 10) === todayKey && typeof p.v === 'number' && Number.isFinite(p.v))
    .map((p) => round(p.v, 2));

  let trend: TideInfo['trend'] = 'steady';
  const indexNow = times.findIndex((t) => hourKey(t) === nowKey);
  if (indexNow >= 0 && indexNow + 1 < levels.length) {
    const delta = levels[indexNow + 1] - levels[indexNow];
    if (Number.isFinite(delta)) {
      trend = delta > 0.02 ? 'rising' : delta < -0.02 ? 'falling' : 'steady';
    }
  }

  const pool = curve.length ? curve : today.map((m) => m.level);
  const high = pool.length ? round(Math.max(...pool), 2) : null;
  const low = pool.length ? round(Math.min(...pool), 2) : null;
  const range = high != null && low != null ? round(high - low, 2) : 0;

  const asMark = (m: TideMark & { iso: string }): TideMark => ({
    type: m.type,
    time: m.time,
    level: round(m.level, 2),
  });

  return {
    trend,
    next: upcoming.length ? asMark(upcoming[0]) : null,
    today: today.map(asMark),
    upcoming: upcoming.slice(0, 6).map(asMark),
    curve,
    high,
    low,
    range,
  };
}

function normaliseMarine(payload: any, now: string): MarineData {
  const current = payload?.current ?? {};
  const daily = payload?.daily ?? {};
  return {
    wave: round(current.wave_height, 1),
    waveMax: round(daily.wave_height_max?.[0], 1),
    wavePeriod: round(daily.wave_period_max?.[0]),
    seaTemp: round(current.sea_surface_temperature, 1),
    tide: tideFrom(payload?.hourly, now),
    fetchedAt: new Date().toISOString(),
  };
}

const forecastQuery = () =>
  new URLSearchParams({
    latitude: String(attraction.latitude),
    longitude: String(attraction.longitude),
    current:
      'temperature_2m,relative_humidity_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m,is_day',
    daily:
      'weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,precipitation_sum,wind_speed_10m_max,uv_index_max,sunrise,sunset',
    timezone: attraction.timezone,
    forecast_days: '7',
    wind_speed_unit: 'kmh',
  });

const marineQuery = () =>
  new URLSearchParams({
    latitude: String(attraction.latitude),
    longitude: String(attraction.longitude),
    current: 'wave_height,sea_surface_temperature',
    hourly: 'sea_level_height_msl',
    daily: 'wave_height_max,wave_period_max,sea_surface_temperature_max',
    timezone: attraction.timezone,
    forecast_days: '7',
  });

export function forecastUrl(): string {
  return `${ENDPOINT}?${forecastQuery().toString()}`;
}

export function marineUrl(): string {
  return `${MARINE_ENDPOINT}?${marineQuery().toString()}`;
}

async function retrieve(): Promise<WeatherData | null> {
  if (cache && Date.now() - cache.at < CACHE_TTL_MS) return cache.data;
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const response = await fetch(forecastUrl(), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return cache?.data ?? null;
      const data = normalise(await response.json());
      if (data.daily.length === 0) return cache?.data ?? null;
      cache = { at: Date.now(), data };
      return data;
    } catch {
      // never let an upstream hiccup break the build — the browser refresh fills in
      return cache?.data ?? null;
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

async function retrieveMarine(now: string): Promise<MarineData | null> {
  if (marineCache && Date.now() - marineCache.at < CACHE_TTL_MS) return marineCache.data;
  if (marineInflight) return marineInflight;

  marineInflight = (async () => {
    try {
      const response = await fetch(marineUrl(), {
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) return marineCache?.data ?? null;
      const payload = await response.json();
      if (!payload?.current) return marineCache?.data ?? null;
      const data = normaliseMarine(payload, now);
      marineCache = { at: Date.now(), data };
      return data;
    } catch {
      return marineCache?.data ?? null;
    } finally {
      marineInflight = null;
    }
  })();

  return marineInflight;
}

/** Server-side accessor used by the Weather component during rendering. */
export async function getWeather(): Promise<WeatherData | null> {
  const data = await retrieve();
  return data;
}

/**
 * Coastal conditions. Resolved after the forecast because the tide curve is
 * anchored to the current local hour reported by the forecast service. The
 * home page renders fine without it, so failures stay silent.
 */
export async function getMarine(): Promise<MarineData | null> {
  const forecast = await retrieve();
  return retrieveMarine(forecast?.current.iso ?? '');
}

/* ------------------------------------------------------------------ *
 * Advice engine
 *
 * The rules below are plain data so that the browser can re-run the exact
 * same evaluation when it refreshes the figures. `p` is the priority used
 * when more than one rule from the same theme matches, and `g` is the theme
 * ("group"): only the strongest rule per theme survives, which is what keeps
 * the panel short instead of dumping every possible warning.
 * ------------------------------------------------------------------ */

export type AdviceCat = 'risk' | 'travel' | 'play' | 'gear';

export interface AdviceCond {
  /** precipitation probability, % */
  popGte?: number;
  popLt?: number;
  /** accumulated rain for the day, mm */
  rainSumGte?: number;
  /** maximum UV index */
  uvGte?: number;
  uvLt?: number;
  /** daily maximum / minimum air temperature, °C */
  maxGte?: number;
  maxLte?: number;
  minLte?: number;
  /** day/night temperature swing above this value, °C */
  rangeGt?: number;
  /** Beaufort wind force */
  windLvGte?: number;
  windLvLt?: number;
  /** weather groups (see WeatherGroup) */
  groups?: WeatherGroup[];
  /** wave height at or above this value, m */
  waveGte?: number;
  /** sea surface temperature, °C */
  seaGte?: number;
  seaLte?: number;
  /** the next tide turning point */
  tide?: ('high' | 'low')[];
}

export interface AdviceRule {
  /** doubles as the i18n key under `weather.tips` */
  id: string;
  cat: AdviceCat;
  icon: string;
  p: number;
  g?: string;
  when: AdviceCond;
}

export interface AdviceMetrics {
  group: WeatherGroup;
  pop: number;
  rainSum: number;
  uv: number;
  max: number;
  min: number;
  range: number;
  wind: number;
  level: number;
  humidity: number;
  temp: number;
  wave: number | null;
  sea: number | null;
  tide: 'high' | 'low' | '';
}

export type AdviceResult = Record<AdviceCat, AdviceRule[]>;

/** How many lines each panel is allowed to show. */
export const ADVICE_CAPS: Record<AdviceCat, number> = { risk: 3, travel: 2, play: 3, gear: 4 };

export const ADVICE_RULES: AdviceRule[] = [
  /* --- risk: only the things that should change someone's plan --- */
  { id: 'riskStorm', cat: 'risk', icon: '⛈️', p: 100, g: 'storm', when: { groups: ['thunderstorm'] } },
  { id: 'riskHeavyRain', cat: 'risk', icon: '🌧️', p: 94, g: 'rain', when: { popGte: 70, rainSumGte: 4 } },
  {
    id: 'riskStrongWind',
    cat: 'risk',
    icon: '🌪️',
    p: 90,
    g: 'wind',
    when: { windLvGte: 7 },
  },
  { id: 'riskHighWave', cat: 'risk', icon: '🌊', p: 88, g: 'sea', when: { waveGte: 2.5 } },
  { id: 'riskSnow', cat: 'risk', icon: '🌨️', p: 86, g: 'snow', when: { groups: ['snow'] } },
  { id: 'riskFog', cat: 'risk', icon: '🌫️', p: 80, g: 'fog', when: { groups: ['fog'] } },
  { id: 'riskHeat', cat: 'risk', icon: '🥵', p: 78, g: 'heat', when: { maxGte: 35 } },
  { id: 'riskUV', cat: 'risk', icon: '🕶️', p: 70, g: 'uv', when: { uvGte: 11 } },

  /* --- travel: what to wear / how to move --- */
  {
    id: 'travelHeavyRain',
    cat: 'travel',
    icon: '🧥',
    p: 98,
    g: 'rain',
    when: { groups: ['rain', 'showers', 'thunderstorm'] },
  },
  {
    id: 'travelDrizzle',
    cat: 'travel',
    icon: '🌦️',
    p: 70,
    g: 'rain',
    when: { groups: ['drizzle'] },
  },
  { id: 'travelCold', cat: 'travel', icon: '🧣', p: 88, g: 'temp', when: { maxLte: 10 } },
  { id: 'travelHot', cat: 'travel', icon: '🌡️', p: 85, g: 'temp', when: { maxGte: 32 } },
  { id: 'travelSwing', cat: 'travel', icon: '🧥', p: 60, g: 'temp', when: { rangeGt: 8 } },
  { id: 'travelWindy', cat: 'travel', icon: '💨', p: 75, g: 'wind', when: { windLvGte: 5 } },
  {
    id: 'travelSunny',
    cat: 'travel',
    icon: '☀️',
    p: 50,
    g: 'sky',
    when: { groups: ['clear', 'mainlyClear'] },
  },
  { id: 'travelCloudy', cat: 'travel', icon: '☁️', p: 50, g: 'sky', when: { groups: ['overcast'] } },

  /* --- play: what is worth doing today --- */
  { id: 'playStorm', cat: 'play', icon: '🚫', p: 100, g: 'storm', when: { groups: ['thunderstorm'] } },
  { id: 'playHeavyRain', cat: 'play', icon: '🏛️', p: 95, g: 'rain', when: { popGte: 70 } },
  { id: 'playRain', cat: 'play', icon: '☔', p: 90, g: 'rain', when: { popGte: 60 } },
  { id: 'playDrizzle', cat: 'play', icon: '🌦️', p: 70, g: 'rain', when: { groups: ['drizzle'] } },
  { id: 'playStrongWind', cat: 'play', icon: '⛔', p: 92, g: 'wind', when: { windLvGte: 7 } },
  { id: 'playWindy', cat: 'play', icon: '⛵', p: 85, g: 'wind', when: { windLvGte: 5 } },
  { id: 'playFog', cat: 'play', icon: '👁️', p: 80, g: 'fog', when: { groups: ['fog'] } },
  { id: 'playHot', cat: 'play', icon: '🕒', p: 75, g: 'heat', when: { maxGte: 32 } },
  { id: 'playSeaWarm', cat: 'play', icon: '🏊', p: 66, g: 'sea', when: { seaGte: 18 } },
  { id: 'playSeaCold', cat: 'play', icon: '🥶', p: 66, g: 'sea', when: { seaLte: 16 } },
  { id: 'playTideLow', cat: 'play', icon: '🐚', p: 58, g: 'tide', when: { tide: ['low'] } },
  {
    id: 'playSunny',
    cat: 'play',
    icon: '🌅',
    p: 45,
    g: 'sky',
    when: { groups: ['clear', 'mainlyClear'] },
  },
  { id: 'playCloudy', cat: 'play', icon: '🚶', p: 45, g: 'sky', when: { groups: ['overcast'] } },
  { id: 'playCoastal', cat: 'play', icon: '🌊', p: 30, g: 'coast', when: {} },

  /* --- gear: dynamic packing list, nothing that is not needed --- */
  {
    id: 'gearRaincoat',
    cat: 'gear',
    icon: '🧥',
    p: 102,
    g: 'rain',
    when: { popGte: 70, rainSumGte: 3 },
  },
  { id: 'gearUmbrella', cat: 'gear', icon: '🌂', p: 100, g: 'rain', when: { popGte: 60 } },
  {
    id: 'gearFoldUmbrella',
    cat: 'gear',
    icon: '🌂',
    p: 70,
    g: 'rain',
    when: { groups: ['drizzle', 'showers'], popLt: 60 },
  },
  { id: 'gearSunscreen', cat: 'gear', icon: '🧴', p: 92, g: 'uv', when: { uvGte: 5 } },
  { id: 'gearHydration', cat: 'gear', icon: '💧', p: 88, g: 'heat', when: { maxGte: 32 } },
  { id: 'gearWarm', cat: 'gear', icon: '🧣', p: 88, g: 'cold', when: { maxLte: 10 } },
  { id: 'gearWindy', cat: 'gear', icon: '🧢', p: 80, g: 'wind', when: { windLvGte: 5 } },
  { id: 'gearMask', cat: 'gear', icon: '😷', p: 80, g: 'fog', when: { groups: ['fog'] } },
  { id: 'gearLayer', cat: 'gear', icon: '🎒', p: 60, g: 'cold', when: { rangeGt: 8, maxLt: 30 } },
  {
    id: 'gearSunglasses',
    cat: 'gear',
    icon: '😎',
    p: 50,
    g: 'sun',
    when: { groups: ['clear', 'mainlyClear'] },
  },
  { id: 'gearFootwear', cat: 'gear', icon: '👟', p: 30, g: 'coast', when: {} },
];

export function metricsFor(data: WeatherData, marine: MarineData | null): AdviceMetrics {
  const day = data.daily[0];
  const current = data.current;
  const max = day ? day.max : current.temperature;
  const min = day ? day.min : current.temperature;
  const wind = day ? Math.max(day.windMax, current.wind) : current.wind;

  return {
    group: groupForCode(day ? day.code : current.code),
    pop: day ? day.rainChance : 0,
    rainSum: day ? day.rainSum : current.precipitation,
    uv: day ? day.uvMax : 0,
    max,
    min,
    range: Number((max - min).toFixed(1)),
    wind,
    level: beaufort(wind),
    humidity: current.humidity,
    temp: current.temperature,
    wave: marine ? marine.wave : null,
    sea: marine ? marine.seaTemp : null,
    tide: marine?.tide?.next ? marine.tide.next.type : '',
  };
}

export function matchesAdvice(cond: AdviceCond, m: AdviceMetrics): boolean {
  if (cond.popGte != null && !(m.pop >= cond.popGte)) return false;
  if (cond.popLt != null && !(m.pop < cond.popLt)) return false;
  if (cond.rainSumGte != null && !(m.rainSum >= cond.rainSumGte)) return false;
  if (cond.uvGte != null && !(m.uv >= cond.uvGte)) return false;
  if (cond.uvLt != null && !(m.uv < cond.uvLt)) return false;
  if (cond.maxGte != null && !(m.max >= cond.maxGte)) return false;
  if (cond.maxLte != null && !(m.max <= cond.maxLte)) return false;
  if (cond.minLte != null && !(m.min <= cond.minLte)) return false;
  if (cond.rangeGt != null && !(m.range > cond.rangeGt)) return false;
  if (cond.windLvGte != null && !(m.level >= cond.windLvGte)) return false;
  if (cond.windLvLt != null && !(m.level < cond.windLvLt)) return false;
  if (cond.groups && !cond.groups.includes(m.group)) return false;
  if (cond.waveGte != null && !(m.wave != null && m.wave >= cond.waveGte)) return false;
  if (cond.seaGte != null && !(m.sea != null && m.sea >= cond.seaGte)) return false;
  if (cond.seaLte != null && !(m.sea != null && m.sea <= cond.seaLte)) return false;
  if (cond.tide && !cond.tide.includes(m.tide as 'high' | 'low')) return false;
  return true;
}

/**
 * Keeps the strongest rule per theme, then caps the panel length. Rules are
 * returned highest priority first so the most actionable line is on top.
 */
export function evaluateAdvice(m: AdviceMetrics, rules: AdviceRule[] = ADVICE_RULES): AdviceResult {
  const result: AdviceResult = { risk: [], travel: [], play: [], gear: [] };
  const taken: Record<string, boolean> = {};

  // highest priority first, so the first match per theme is the strongest one
  const ordered = [...rules].sort((a, b) => b.p - a.p);

  for (const rule of ordered) {
    if (!matchesAdvice(rule.when, m)) continue;
    if (rule.g) {
      const slot = `${rule.cat}:${rule.g}`;
      if (taken[slot]) continue;
      taken[slot] = true;
    }
    result[rule.cat].push(rule);
  }

  (Object.keys(result) as AdviceCat[]).forEach((cat) => {
    result[cat] = result[cat].slice(0, ADVICE_CAPS[cat]);
  });

  return result;
}
