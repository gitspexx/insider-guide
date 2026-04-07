/**
 * Auto-classifier for businesses in "misc" category.
 * Analyzes name, description, location, and city to suggest a proper category.
 * Inspired by GrowthOps profile_classifier approach: keyword-based scoring.
 */

const RULES = [
  // ─── EAT (restaurants, food) ───
  {
    category: 'eat',
    keywords: [
      /restaurante?/i, /ristorante/i, /trattoria/i, /pizz[ae]ria/i, /parrilla/i,
      /churrascaria/i, /gastropub/i, /gastrobar/i, /grill/i, /bbq/i, /burger/i,
      /sushi/i, /ramen/i, /noodle/i, /cevich/i, /arepa/i, /taco/i, /empanada/i,
      /brunch/i, /bistro/i, /comida/i, /cocina/i, /sabor/i, /cozinha/i,
      /gastronomia/i, /food\s/i, /\bfood$/i, /steak/i, /asado/i, /mesa\b/i,
      /\beat\b/i, /diner/i, /bakery/i, /boulangerie/i, /confeitaria/i,
      /padaria/i, /empório/i, /\bbar\b.*grill/i, /\bgrill\b.*bar/i,
    ],
    nameBoost: [
      /restaurante/i, /pizzeria/i, /parrilla/i, /sushi/i, /ramen/i,
      /burger/i, /churrascaria/i, /brunch/i, /bistro/i, /grill/i,
    ],
  },

  // ─── CAFE (coffee, tea, bakery) ───
  {
    category: 'cafe',
    keywords: [
      /\bcaf[eé]\b/i, /coffee/i, /barista/i, /espresso/i, /latte/i,
      /specialty\s*coffee/i, /roaster/i, /coworking/i, /co-working/i,
      /\btea\b/i, /cafetería/i, /confiter[ií]a/i,
    ],
    nameBoost: [
      /\bcaf[eé]\b/i, /coffee/i, /barista/i, /cafetería/i,
    ],
  },

  // ─── DRINK (bars, nightlife) ───
  {
    category: 'drink',
    keywords: [
      /\bbar\b/i, /\bbars\b/i, /cocktail/i, /mezcal/i, /cerveza/i, /brewery/i,
      /cervejaria/i, /pub\b/i, /lounge/i, /disco/i, /club\b/i, /nightlife/i,
      /rooftop\s*bar/i, /speakeasy/i, /wine\s*bar/i, /taproom/i,
      /resto\s*bar/i, /\bron\b/i, /rum/i, /taboo/i,
    ],
    nameBoost: [
      /\bbar\b/i, /cocktail/i, /lounge/i, /disco/i, /club\b/i,
      /cerveza/i, /brewery/i, /rooftop/i, /pub\b/i,
    ],
  },

  // ─── STAY (hotels, hostels, accommodations) ───
  {
    category: 'stay',
    keywords: [
      /hotel/i, /hostel/i, /hostal/i, /pousada/i, /boutique\s*hotel/i,
      /resort/i, /lodge/i, /guest\s*house/i, /cabañas?/i, /airbnb/i,
      /residencial/i, /eco\s*living/i, /bamboo\s*house/i, /studios?\b/i,
    ],
    nameBoost: [
      /hotel/i, /hostel/i, /pousada/i, /resort/i, /lodge/i, /guest\s*house/i,
      /cabañas?/i,
    ],
  },

  // ─── EXPLORE (nature, parks, landmarks, beaches, destinations) ───
  {
    category: 'explore',
    keywords: [
      /waterfall/i, /cachoeira/i, /salto\b/i, /cascada/i,
      /praia\b/i, /playa\b/i, /beach/i,
      /parque\s*nacional/i, /national\s*park/i, /reserva/i, /\bpark\b/i,
      /volc[aá]n/i, /volcano/i, /nevado/i, /crater/i,
      /mirador/i, /viewpoint/i, /vista/i,
      /iglesia/i, /church/i, /cathedral/i, /catedral/i, /basilica/i,
      /templo/i, /temple/i, /ruinas?/i, /ruins/i, /arqueol[oó]g/i,
      /monumento/i, /monument/i, /memorial/i, /fort(aleza)?/i,
      /museum/i, /museo/i, /museu/i, /galeria/i, /gallery/i,
      /cultural/i, /teatro/i, /theater/i, /teatro/i,
      /ilha\b/i, /island/i, /isla\b/i,
      /laguna/i, /lagoa/i, /lake/i, /lago\b/i,
      /chapada/i, /serra\b/i, /pico\b/i, /trilha/i, /trail/i,
      /cueva/i, /cave/i, /cavern/i, /gruta/i,
      /canyon/i, /cañ[oó]n/i,
      /desert/i, /desierto/i,
      /río\s*dulce/i, /rio\s*dulce/i,
      /tikal/i, /semuc/i, /yaxha/i, /yaxchil/i, /chicamocha/i,
      /cataratas/i, /iguaz[uú]/i,
      /olinda/i, /pantanal/i, /lençóis/i, /jalapão/i,
      /patrimonio/i, /heritage/i,
    ],
    nameBoost: [
      /waterfall/i, /cachoeira/i, /praia\b/i, /playa\b/i, /beach/i,
      /parque/i, /park/i, /volc[aá]n/i, /nevado/i, /mirador/i,
      /iglesia/i, /catedral/i, /museum/i, /museo/i, /island/i,
      /chapada/i, /trilha/i, /trail/i, /cueva/i, /cave/i,
      /tikal/i, /semuc/i,
    ],
  },

  // ─── DO (activities, tours, sports, adventure) ───
  {
    category: 'do',
    keywords: [
      /tour\b/i, /tours\b/i, /passeio/i, /excurs/i,
      /adventure/i, /aventura/i, /extreme/i,
      /diving/i, /dive\b/i, /mergulho/i, /snorkel/i, /surf/i,
      /kayak/i, /rafting/i, /zipline/i, /canopy/i, /paraglid/i,
      /hik[ei]/i, /trek/i, /climb/i, /escalar/i,
      /bike/i, /cycling/i, /rental\s*bike/i, /bici/i,
      /escape\s*room/i, /paintball/i, /go\s*kart/i, /karting/i,
      /golf\b/i, /deport/i, /sport/i, /futbol/i, /football/i, /baseball/i,
      /agência/i, /agency/i, /operador/i,
      /comuna\s*13/i,
    ],
    nameBoost: [
      /tour/i, /adventure/i, /diving/i, /surf/i, /kayak/i,
      /escape\s*room/i, /sport/i, /passeio/i, /mergulho/i,
    ],
  },

  // ─── WELLNESS ───
  {
    category: 'wellness',
    keywords: [
      /spa\b/i, /massage/i, /masaje/i, /yoga/i, /retreat/i,
      /wellness/i, /bienestar/i, /medit/i, /holistic/i,
      /therapy/i, /terapia/i, /healing/i, /ayurveda/i,
      /natural\b.*products?/i, /produtos?\s*naturais/i,
      /nutri/i,
    ],
    nameBoost: [
      /spa\b/i, /massage/i, /yoga/i, /wellness/i, /retreat/i,
    ],
  },

  // ─── PRACTICAL (services, logistics, not a "place to visit") ───
  {
    category: 'essentials',
    keywords: [
      /rent[- ]?a[- ]?car/i, /car\s*rental/i, /alquiler/i,
      /lavanderí?a/i, /lavanderia/i, /laundry/i, /lavô/i,
      /clinic/i, /clínica/i, /dental/i, /hospital/i, /médic/i,
      /pharmacy/i, /farmacia/i, /droguer/i,
      /immigration/i, /migra[ct]/i, /consulado/i, /embajada/i, /embassy/i,
      /police/i, /policía/i, /polícia/i,
      /mall\b/i, /shopping/i, /centro\s*comercial/i,
      /supermarket/i, /supermercado/i, /éxito/i, /bodegona/i,
      /cajero/i, /atm\b/i, /cambio/i, /exchange/i,
      /rapipago/i, /terminal/i, /bus\s*station/i, /rodoviário/i,
      /decathlon/i, /imóveis/i, /real\s*estate/i,
      /barber/i, /barberí?a/i, /barbearia/i, /peluquer/i, /salon/i, /nails/i,
      /costura/i, /tailor/i, /zipper/i, /lavô/i, /lavo\b/i,
    ],
    nameBoost: [
      /rent[- ]?a[- ]?car/i, /lavanderí?a/i, /lavanderia/i,
      /clinic/i, /dental/i, /mall\b/i, /barber/i, /salon/i,
      /immigration/i, /terminal/i, /supermer/i,
    ],
  },
]

// Places that are destination names (no business type in name) → explore
const DESTINATION_PATTERNS = [
  // If the name is just a place name with no business type keyword, it's likely a destination
  /^[A-ZÁÉÍÓÚÑÀÂÃÊÔÇ][a-záéíóúñàâãêôç\s'''-]+$/,
]

/**
 * Manual overrides for names the keyword classifier can't handle.
 * These are known businesses whose names don't contain category keywords.
 */
const MANUAL_OVERRIDES = {
  'Alquimico': 'drink', 'Andrés D.C. Bogotá': 'eat', 'ARCA': 'eat',
  'Barichara': 'explore', 'Biotopo del Quetzal': 'explore',
  'Botanikafé - Jardins': 'cafe', 'Botica Via Natural': 'wellness',
  'Cancha Las Perillas': 'do', 'Caño Cristales': 'explore',
  'Casa SoulMar Floripa': 'stay', 'Celele': 'eat', 'Cine Domo Maloka': 'do',
  'City Hall el Rodeo': 'essentials', 'Cocora Valley': 'explore',
  'Confraternity of Beard Recife | Good trip': 'essentials',
  'Duomo Serata': 'eat', 'El Chato': 'eat', 'Exit Inn': 'drink',
  'Filandia': 'explore', 'Forno Noronha': 'eat', 'Fundição Progresso': 'do',
  'Global Medical Center 116': 'essentials', 'Google Campus São Paulo': 'essentials',
  'Gracias Vida': 'eat', 'Guarde Perto': 'essentials',
  'Gulf of Morrosquillo': 'explore', 'Izakaya Issa': 'eat',
  'Jojo Paraíso': 'drink', 'La Bebeta': 'drink', 'La Careta El Poblado': 'drink',
  'Lamen Hood': 'eat', 'Lavatú Bonito': 'essentials', 'Leo': 'eat',
  'Los Porteños ENVIGADO': 'eat', 'Los Tres Tiempos': 'eat',
  'Luna Zorro Studio': 'do', 'Mar y Fuego- Medellín': 'eat',
  'Masaya Medellin': 'stay', 'Mercado del Río': 'eat',
  'Mergulhão Noronha': 'do', 'Monoloco Antigua': 'drink',
  'Morro de São Paulo': 'explore', 'Naan': 'eat', 'Negrón Medellín': 'drink',
  'Ninja MDE': 'eat', 'O Timoneiro': 'eat', 'OnFly Innova': 'essentials',
  'Oviedo': 'essentials', 'Pizzaiolo': 'eat', 'Producer Fair': 'explore',
  'Ragazzi - Laureles': 'eat', 'Red Koi Guatemala': 'eat',
  'Reis do corte': 'essentials', 'Rincóncito Antigüeño': 'eat',
  'RioMar Recife': 'essentials', 'Rosso': 'eat', 'Salento': 'explore',
  'Samurai': 'eat', 'San Gil': 'explore', 'SNUG Antigua': 'drink',
  'Spettus Premium': 'eat', "Storia D'Amore zona T": 'eat',
  'Tarjeta Roja Santa Marta': 'drink', 'Teva': 'eat', 'THAI-WOW': 'eat',
  'The Altar': 'drink', 'The Londoner': 'drink', 'The Maze Rio': 'do',
  'Villa de Leyva': 'explore', 'Villa Tex': 'eat', 'Yurleidys Tejeda': 'essentials',
  'Monguí': 'explore', 'Norcasia': 'explore', 'OpenSpace': 'essentials',
  'ParkWay': 'explore', 'Punta Gallinas': 'explore', 'Santo André': 'explore',
  'Skyline Ecoliving': 'stay', 'Todos Santos Cuchumatan': 'explore',
  'Chichicastenango': 'explore', 'Jardín': 'explore', 'Jericoacoara': 'explore',
  'Jurerê Internacional': 'explore', 'Itacaré': 'explore', 'Gramado': 'explore',
  'Canela': 'explore', 'Trancoso': 'explore', 'Urubici': 'explore',
  'Bento Gonçalves': 'explore', 'Blumenau': 'explore', 'Caraíva': 'explore',
  'Boipeba': 'explore', 'Aquiraz': 'explore', 'Maracajaú': 'explore',
  'Maragogi': 'explore', 'Maraú': 'explore', 'Prado': 'explore',
  'Porto de Galinhas': 'explore', 'Porto Seguro': 'explore',
  'Barra Grande': 'explore', 'Bohioplaya': 'explore',
  'Ômom': 'eat', "Nim Po't": 'explore', 'Taboo Disco Club': 'drink',
  'Colombitalia Arepas': 'eat', 'Cuzco Cocina Peruana': 'eat',
  'Cicchetti Praia da Pipa': 'eat', 'Confeitaria Colombo': 'eat',
  'Noma Sushi': 'eat', 'Katamaki Sushi': 'eat', 'Why Not Sushi Bar': 'eat',
  'Chef Burger Provenza': 'eat', 'Dom Black Burger': 'eat',
  'Ichiraku Ramen Medellín': 'eat', 'Govardhana Hari - Sabor da Índia': 'eat',
  'La Cevichería': 'eat', 'Matilde Brunch': 'eat', 'La Cabaña 22': 'eat',
  'RITWAL mesa & mística': 'eat', 'Muzenza Gastronomia e Cultura': 'eat',
  'Game Over Resto Bar': 'drink', 'Extreme Blue summer': 'do',
  'Kula Maya: Boutique Hotel & Spa': 'stay', 'Hotel Pousada Casuarinas': 'stay',
  'Pousada Califórnia': 'stay', 'República Hostel Santa Marta': 'stay',
  'Sierra Minca Hostel': 'stay', 'Campeche Rental Bikes': 'do',
  'Campo de Golf Briceño 18': 'do', 'Diamante De Baseball': 'do',
  'MAHAI.WELLNESS Massage Therapy & Spa': 'wellness', 'Espaço Nutrir': 'wellness',
  'NAILS GARDEN': 'essentials', 'Dashka Salon': 'essentials',
  'La Bodegona': 'essentials', 'Hollywood Mall': 'essentials',
  'Mayorca Mall': 'essentials', 'Éxito Matuna - Cartagena': 'essentials',
  'Éxito Wow - Poblado': 'essentials', 'Immigration Department': 'essentials',
  'Abismo Anhumas': 'explore', 'Pedra do Sal': 'explore',
  'Plazoleta Chorro de Quevedo': 'explore', 'Ponta das Caranhas': 'explore',
}

/**
 * Classify a single business. Returns { category, confidence, reasons } or null if unsure.
 */
export function classifyBusiness(business) {
  // Check manual overrides first
  const manual = MANUAL_OVERRIDES[business.name]
  if (manual) {
    return {
      category: manual,
      confidence: 0.95,
      reasons: ['manual_override'],
      alternatives: [],
    }
  }

  const text = [
    business.name || '',
    business.description || '',
    business.location || '',
  ].join(' ').toLowerCase()

  const name = (business.name || '').toLowerCase()

  const scores = {}
  const reasons = {}

  for (const rule of RULES) {
    let score = 0
    const ruleReasons = []

    for (const kw of rule.keywords) {
      if (kw.test(text)) {
        score += 0.3
        ruleReasons.push(`keyword:${kw.source.substring(0, 20)}`)
      }
    }

    for (const kw of rule.nameBoost || []) {
      if (kw.test(name)) {
        score += 0.4
        ruleReasons.push(`name_match:${kw.source.substring(0, 20)}`)
      }
    }

    if (score > 0) {
      scores[rule.category] = (scores[rule.category] || 0) + score
      reasons[rule.category] = [...(reasons[rule.category] || []), ...ruleReasons]
    }
  }

  // If no matches, check if it looks like a destination name
  if (Object.keys(scores).length === 0) {
    const trimmedName = (business.name || '').trim()
    const isShortName = trimmedName.split(/\s+/).length <= 3
    const noCity = !business.city || business.city.trim() === ''
    if (isShortName && noCity) {
      scores.explore = 0.2
      reasons.explore = ['destination_name_heuristic']
    }
  }

  if (Object.keys(scores).length === 0) return null

  // Pick highest scoring category
  const sorted = Object.entries(scores).sort((a, b) => b[1] - a[1])
  const [bestCat, bestScore] = sorted[0]

  // Confidence: normalize to 0-1
  const confidence = Math.min(bestScore / 1.5, 1)

  return {
    category: bestCat,
    confidence: Math.round(confidence * 100) / 100,
    reasons: reasons[bestCat] || [],
    alternatives: sorted.slice(1).map(([cat, score]) => ({
      category: cat,
      confidence: Math.round(Math.min(score / 1.5, 1) * 100) / 100,
    })),
  }
}

/**
 * Classify all misc businesses. Returns array of { business, suggestion }.
 */
export function classifyMiscBusinesses(businesses) {
  return businesses
    .filter((b) => b.category === 'misc' || !b.category)
    .map((business) => ({
      business,
      suggestion: classifyBusiness(business),
    }))
    .sort((a, b) => {
      if (!a.suggestion && !b.suggestion) return 0
      if (!a.suggestion) return 1
      if (!b.suggestion) return -1
      return b.suggestion.confidence - a.suggestion.confidence
    })
}
