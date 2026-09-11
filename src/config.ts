export const siteConfig = {
  name: 'Faro Monumental de La Serena',
  baseUrl: 'https://farodelaserena.com',
  locales: ['es', 'en', 'zh', 'arn'] as const,
};

export const ogLocale: Record<string, string> = {
  es: 'es_CL',
  en: 'en_US',
  zh: 'zh_CN',
  arn: 'arn',
};

/**
 * Single-attraction SEO entity binding configuration.
 * Every value below maps 1:1 to the variable table used by the page templates
 * ({{DOMAIN_NAME}}, {{ATTRACTION_FULL_NAME}}, {{LATITUDE}}, {{MAPS_EMBED_SRC}}, ...).
 */
export const attraction = {
  /** {{DOMAIN_NAME}} */
  domain: 'farodelaserena.com',
  /** absolute site root, no trailing slash */
  baseUrl: 'https://farodelaserena.com',

  /** {{ATTRACTION_FULL_NAME}} — official Google Maps listing name */
  officialName: 'Faro de La Serena',
  /** brand / on-page name used across the site */
  fullName: 'Faro Monumental de La Serena',
  /** {{ATTRACTION_SHORT_NAME}} — the meaning behind the domain name */
  shortName: 'Faro de La Serena',

  /** {{CITY_NAME}} */
  city: 'La Serena',
  /** {{STATE_PROVINCE}} */
  region: 'Coquimbo',
  /** {{COUNTRY_NAME}} */
  country: 'Chile',
  /** {{COUNTRY_CODE_2LETTER}} */
  countryCode: 'CL',
  /** {{POSTAL_CODE}} */
  postalCode: '1700000',
  /** full display address (NAP) */
  streetAddress: 'Avda. Francisco de Aguirre, Avenida del Mar',

  /** {{LATITUDE}} / {{LONGITUDE}} */
  latitude: -29.9055459,
  longitude: -71.2743113,

  /** IANA time zone used for local time rendering and the forecast service */
  timezone: 'America/Santiago',

  /** {{MAPS_SHARE_URL}} */
  mapsShareUrl: 'https://maps.app.goo.gl/woh5YV7bXn25Fi8C7',
  /** {{MAPS_EMBED_SRC}} */
  mapsEmbedSrc:
    'https://www.google.com/maps/embed?pb=!1m18!1m12!1m3!1d6147.064223908533!2d-71.2743113!3d-29.905545900000003!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!3m3!1m2!1s0x9691ca0f6db44cab%3A0x166073d9f5d42f3!2sFaro%20de%20La%20Serena!5e1!3m2!1szh-CN!2sus!4v1789097643495!5m2!1szh-CN!2sus',

  /** {{NEARBY_LANDMARK_1}} / {{NEARBY_LANDMARK_2}} */
  nearbyLandmark1: 'Plaza de Armas de La Serena',
  nearbyLandmark2: 'Jardín del Corazón (Avenida del Mar)',

  /** {{GOVT_TOURISM_URL}} */
  govtTourismUrl: 'https://www.sernatur.cl/',

  /** hero / social sharing image (site-relative) */
  heroImage: '/gallery/faro-monumental-de-la-serena-1.jpg',
  /** dimensions of the rendered hero asset (used for the LCP <img> and preload) */
  heroImageWidth: 1920,
  heroImageHeight: 1080,
  /** gallery images available for structured data (site-relative) */
  galleryImages: [
    '/gallery/faro-monumental-de-la-serena-1.jpg',
    '/gallery/faro-monumental-de-la-serena-2.jpg',
    '/gallery/faro-monumental-de-la-serena-3.jpg',
    '/gallery/faro-monumental-de-la-serena-4.jpg',
    '/gallery/faro-monumental-de-la-serena-5.jpg',
  ],

  /** Google Analytics 4 measurement ID */
  ga4Id: 'G-HXM22WWPKP',
};
