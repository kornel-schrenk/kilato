import type { Lang } from '../core/lang'
import type { CategoryId } from '../core/types'

type Label = Record<Lang, string>

const l = (en: string, hu: string): Label => ({ en, hu })

/** A label for every kind value the spec lists. `kindLabel` looks one up only among the values of the place's category. */
export const kindLabels: Record<string, Label> = {
  // tourism
  attraction: l('Attraction', 'Látnivaló'),
  museum: l('Museum', 'Múzeum'),
  gallery: l('Gallery', 'Galéria'),
  viewpoint: l('Viewpoint', 'Kilátópont'),
  artwork: l('Artwork', 'Műalkotás'),
  zoo: l('Zoo', 'Állatkert'),
  aquarium: l('Aquarium', 'Akvárium'),
  theme_park: l('Theme park', 'Vidámpark'),
  // amenity
  place_of_worship: l('Place of worship', 'Imaház'),
  fountain: l('Fountain', 'Szökőkút'),
  cafe: l('Café', 'Kávézó'),
  restaurant: l('Restaurant', 'Étterem'),
  fast_food: l('Fast food', 'Gyorsétterem'),
  bar: l('Bar', 'Bár'),
  pub: l('Pub', 'Kocsma'),
  biergarten: l('Beer garden', 'Sörkert'),
  ice_cream: l('Ice cream', 'Fagylaltozó'),
  food_court: l('Food court', 'Ételudvar'),
  theatre: l('Theatre', 'Színház'),
  cinema: l('Cinema', 'Mozi'),
  arts_centre: l('Arts centre', 'Művelődési központ'),
  library: l('Library', 'Könyvtár'),
  community_centre: l('Community centre', 'Közösségi ház'),
  events_venue: l('Events venue', 'Rendezvényhelyszín'),
  nightclub: l('Nightclub', 'Éjszakai klub'),
  music_venue: l('Music venue', 'Zenei helyszín'),
  planetarium: l('Planetarium', 'Planetárium'),
  pharmacy: l('Pharmacy', 'Gyógyszertár'),
  bank: l('Bank', 'Bank'),
  bureau_de_change: l('Currency exchange', 'Pénzváltó'),
  post_office: l('Post office', 'Posta'),
  clinic: l('Clinic', 'Rendelő'),
  doctors: l('Doctor', 'Orvos'),
  dentist: l('Dentist', 'Fogorvos'),
  veterinary: l('Vet', 'Állatorvos'),
  hospital: l('Hospital', 'Kórház'),
  police: l('Police', 'Rendőrség'),
  townhall: l('Town hall', 'Városháza'),
  fuel: l('Petrol station', 'Benzinkút'),
  car_wash: l('Car wash', 'Autómosó'),
  car_rental: l('Car rental', 'Autókölcsönző'),
  driving_school: l('Driving school', 'Autósiskola'),
  // leisure
  park: l('Park', 'Park'),
  garden: l('Garden', 'Kert'),
  playground: l('Playground', 'Játszótér'),
  sports_centre: l('Sports centre', 'Sportközpont'),
  fitness_centre: l('Gym', 'Edzőterem'),
  swimming_pool: l('Swimming pool', 'Uszoda'),
  water_park: l('Water park', 'Vízipark'),
  escape_game: l('Escape room', 'Szabadulószoba'),
  bowling_alley: l('Bowling alley', 'Bowlingpálya'),
  // historic
  monument: l('Monument', 'Emlékmű'),
  memorial: l('Memorial', 'Emlékhely'),
  castle: l('Castle', 'Kastély'),
  ruins: l('Ruins', 'Romok'),
  building: l('Historic building', 'Történelmi épület'),
  archaeological_site: l('Archaeological site', 'Régészeti lelőhely'),
  city_gate: l('City gate', 'Városkapu'),
  citywalls: l('City walls', 'Városfal'),
  fort: l('Fort', 'Erőd'),
  manor: l('Manor', 'Kúria'),
  tomb: l('Tomb', 'Sírhely'),
  wayside_cross: l('Wayside cross', 'Útszéli kereszt'),
  // shop
  bakery: l('Bakery', 'Pékség'),
  pastry: l('Pastry shop', 'Cukrászda'),
  hairdresser: l('Hairdresser', 'Fodrász'),
  beauty: l('Beauty salon', 'Szépségszalon'),
  massage: l('Massage', 'Masszázs'),
  tattoo: l('Tattoo studio', 'Tetoválószalon'),
  laundry: l('Laundry', 'Mosoda'),
  dry_cleaning: l('Dry cleaner', 'Vegytisztító'),
  travel_agency: l('Travel agency', 'Utazási iroda'),
  copyshop: l('Copy shop', 'Fénymásoló'),
  optician: l('Optician', 'Optika'),
  tailor: l('Tailor', 'Szabó'),
  shoe_repair: l('Shoe repair', 'Cipőjavító'),
  photo: l('Photo shop', 'Fotós'),
  supermarket: l('Supermarket', 'Szupermarket'),
  convenience: l('Convenience store', 'Közértbolt'),
  clothes: l('Clothes shop', 'Ruhabolt'),
  shoes: l('Shoe shop', 'Cipőbolt'),
  books: l('Bookshop', 'Könyvesbolt'),
  florist: l('Florist', 'Virágbolt'),
  butcher: l('Butcher', 'Hentes'),
  greengrocer: l('Greengrocer', 'Zöldséges'),
  kiosk: l('Kiosk', 'Kioszk'),
  tobacco: l('Tobacconist', 'Dohánybolt'),
  alcohol: l('Off-licence', 'Italbolt'),
  wine: l('Wine shop', 'Borozó bolt'),
  chemist: l('Drugstore', 'Drogéria'),
  cosmetics: l('Cosmetics', 'Kozmetikai bolt'),
  mobile_phone: l('Phone shop', 'Mobiltelefon-bolt'),
  electronics: l('Electronics', 'Elektronikai bolt'),
  computer: l('Computer shop', 'Számítástechnikai bolt'),
  jewelry: l('Jeweller', 'Ékszerbolt'),
  gift: l('Gift shop', 'Ajándékbolt'),
  furniture: l('Furniture shop', 'Bútorbolt'),
  hardware: l('Hardware shop', 'Vasbolt'),
  doityourself: l('DIY store', 'Barkácsbolt'),
  pet: l('Pet shop', 'Állateledel-bolt'),
  toys: l('Toy shop', 'Játékbolt'),
  sports: l('Sports shop', 'Sportbolt'),
  bicycle: l('Bike shop', 'Kerékpárbolt'),
  department_store: l('Department store', 'Áruház'),
  mall: l('Shopping centre', 'Bevásárlóközpont'),
  variety_store: l('Variety store', 'Vegyesbolt'),
  second_hand: l('Second-hand shop', 'Használtcikk-bolt'),
  stationery: l('Stationery', 'Papírbolt'),
  newsagent: l('Newsagent', 'Újságárus'),
  // Wikipedia
  article: l('Wikipedia article', 'Wikipédia-szócikk'),
}

const split = (kinds: string) => new Set(kinds.split(' '))

/** The kind values each category can hold, as the spec's category table lists them. A label is found only among these. */
const kindsByCat: Partial<Record<CategoryId, ReadonlySet<string>>> = {
  sights: split(
    'attraction museum gallery viewpoint artwork zoo aquarium theme_park place_of_worship fountain ' +
      'monument memorial castle ruins building archaeological_site city_gate citywalls fort manor tomb wayside_cross',
  ),
  notable: split('article'),
  food: split('cafe restaurant fast_food bar pub biergarten ice_cream food_court bakery pastry'),
  leisure: split(
    'theatre cinema arts_centre library community_centre events_venue nightclub music_venue planetarium ' +
      'park garden playground sports_centre fitness_centre swimming_pool water_park escape_game bowling_alley',
  ),
  services: split(
    'pharmacy bank bureau_de_change post_office clinic doctors dentist veterinary hospital police townhall fuel car_wash car_rental driving_school ' +
      'hairdresser beauty massage tattoo laundry dry_cleaning travel_agency copyshop optician tailor shoe_repair photo',
  ),
  shops: split(
    'supermarket convenience clothes shoes books florist butcher greengrocer kiosk tobacco alcohol wine chemist cosmetics mobile_phone electronics computer jewelry gift furniture hardware doityourself pet toys sports bicycle department_store mall variety_store second_hand stationery newsagent',
  ),
}

const fallbacks: Partial<Record<CategoryId, Label>> = {
  sights: l('Historic site', 'Történelmi hely'),
  shops: l('Shop', 'Üzlet'),
}

/** The label of a place's kind in the UI language. A kind its category does not list gets the category's fallback. */
export function kindLabel(cat: CategoryId, kind: string, lang: Lang): string {
  const label = kindsByCat[cat]?.has(kind) ? kindLabels[kind] : fallbacks[cat]
  return label?.[lang] ?? kind
}
