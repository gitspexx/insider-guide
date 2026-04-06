"""
Keyword Generator for Botsol Google Business Profile Scraper.
Generates keywords.txt with all category+city combinations for a country.

Usage:
    python keyword_generator.py colombia
    python keyword_generator.py --country brazil --output keywords.txt
    python keyword_generator.py --list  (show all available countries)
"""

import argparse
import json
import os

# ─── Category Keywords ───
# Each category has deep keyword expansion for maximum coverage

CATEGORIES = {
    "eat": [
        "restaurant", "italian restaurant", "sushi restaurant", "seafood restaurant",
        "steakhouse", "pizzeria", "fine dining", "street food", "brunch restaurant",
        "breakfast restaurant", "lunch restaurant", "dinner restaurant",
        "vegan restaurant", "vegetarian restaurant", "local food",
        "traditional restaurant", "food court", "buffet restaurant", "grill restaurant",
        "BBQ restaurant", "bakery", "patisserie", "food market", "food hall",
        "taco restaurant", "ramen restaurant", "burger restaurant",
        "mexican restaurant", "indian restaurant", "thai restaurant",
        "chinese restaurant", "japanese restaurant", "french restaurant",
        "mediterranean restaurant", "asian restaurant", "fusion restaurant",
        "farm to table restaurant", "rooftop restaurant",
    ],
    "cafe": [
        "coffee shop", "cafe", "specialty coffee", "espresso bar", "tea house",
        "brunch cafe", "coworking cafe", "coffee roaster", "roastery",
        "bakery cafe", "dessert cafe", "juice bar", "smoothie bar",
        "matcha cafe", "pastry shop", "artisan coffee", "third wave coffee",
        "breakfast cafe", "organic cafe",
    ],
    "drink": [
        "bar", "cocktail bar", "rooftop bar", "wine bar", "craft beer bar",
        "brewery", "pub", "nightclub", "speakeasy", "mezcal bar",
        "rum bar", "sports bar", "lounge", "disco", "beer garden",
        "jazz bar", "live music bar", "karaoke bar", "taproom",
        "wine tasting", "distillery",
    ],
    "stay": [
        "hotel", "luxury hotel", "boutique hotel", "hostel", "resort",
        "guest house", "bed and breakfast", "eco lodge", "beach resort",
        "mountain lodge", "villa rental", "apartment rental", "pension",
        "glamping", "capsule hotel", "all inclusive resort", "motel",
        "budget hotel", "5 star hotel", "spa hotel", "business hotel",
        "family hotel", "design hotel", "heritage hotel",
    ],
    "explore": [
        "tourist attraction", "museum", "art gallery", "park", "national park",
        "beach", "waterfall", "viewpoint", "temple", "church", "cathedral",
        "mosque", "historic site", "monument", "castle", "palace", "ruins",
        "botanical garden", "cultural center", "landmark", "plaza",
        "observation deck", "lighthouse", "bridge", "heritage site",
        "archaeological site", "nature reserve", "zoo", "aquarium",
    ],
    "do": [
        "tour", "adventure tour", "hiking trail", "scuba diving",
        "snorkeling", "surfing", "kayaking", "zip line", "cooking class",
        "yoga class", "city tour", "bike tour", "walking tour",
        "boat tour", "safari", "rock climbing", "paragliding",
        "rafting", "fishing tour", "photography tour", "food tour",
        "wine tour", "cultural tour", "day trip", "excursion",
    ],
    "wellness": [
        "spa", "massage", "yoga retreat", "wellness center", "hot spring",
        "hammam", "sauna", "meditation center", "health retreat",
        "thermal bath", "beauty salon", "nail salon", "hair salon",
        "ayurveda center", "float tank", "cryotherapy",
    ],
    "essentials": [
        "car rental", "laundry service", "clinic", "pharmacy",
        "supermarket", "shopping mall", "currency exchange",
        "coworking space", "gym", "airport transfer",
        "laundromat", "barbershop", "dentist",
    ],
}

# ─── Country → Top Cities ───
# Top 10 cities per country for keyword combinations

COUNTRY_CITIES = {
    "colombia": ["Bogota", "Medellin", "Cartagena", "Cali", "Barranquilla", "Santa Marta", "San Andres", "Bucaramanga", "Pereira", "Manizales"],
    "brazil": ["Sao Paulo", "Rio de Janeiro", "Salvador", "Florianopolis", "Fortaleza", "Recife", "Curitiba", "Brasilia", "Belo Horizonte", "Manaus"],
    "guatemala": ["Guatemala City", "Antigua Guatemala", "Lake Atitlan", "Flores", "Semuc Champey", "Quetzaltenango", "Livingston", "Chichicastenango", "Panajachel", "Tikal"],
    "argentina": ["Buenos Aires", "Mendoza", "Bariloche", "Cordoba", "Salta", "Ushuaia", "El Calafate", "Iguazu", "Rosario", "Mar del Plata"],
    "chile": ["Santiago", "Valparaiso", "San Pedro de Atacama", "Puerto Natales", "Vina del Mar", "La Serena", "Pucón", "Temuco", "Concepcion", "Iquique"],
    "peru": ["Lima", "Cusco", "Arequipa", "Puno", "Iquitos", "Huaraz", "Trujillo", "Nazca", "Mancora", "Ayacucho"],
    "bolivia": ["La Paz", "Sucre", "Cochabamba", "Santa Cruz", "Uyuni", "Potosi", "Oruro", "Tarija", "Trinidad", "Copacabana"],
    "mexico": ["Mexico City", "Cancun", "Playa del Carmen", "Tulum", "Oaxaca", "Guadalajara", "Puerto Vallarta", "San Miguel de Allende", "Merida", "Cabo San Lucas"],
    "costa rica": ["San Jose", "La Fortuna", "Manuel Antonio", "Tamarindo", "Monteverde", "Puerto Viejo", "Jaco", "Santa Teresa", "Liberia", "Dominical"],
    "panama": ["Panama City", "Bocas del Toro", "Boquete", "San Blas", "Pedasi", "Santa Catalina", "El Valle", "David", "Colon", "Portobelo"],
    "nicaragua": ["Granada", "Leon", "San Juan del Sur", "Managua", "Ometepe", "Corn Islands", "Matagalpa", "Esteli", "Bluefields", "Masaya"],
    "el salvador": ["San Salvador", "El Tunco", "Santa Ana", "Suchitoto", "Ruta de las Flores", "La Libertad", "Juayua", "Apaneca", "San Miguel", "Ataco"],
    "belize": ["San Ignacio", "Caye Caulker", "Ambergris Caye", "Placencia", "Hopkins", "Belize City", "Orange Walk", "Dangriga", "Corozal", "Punta Gorda"],
    "dominican republic": ["Santo Domingo", "Punta Cana", "Las Terrenas", "Samana", "Cabarete", "Puerto Plata", "La Romana", "Santiago", "Sosua", "Jarabacoa"],
    "italy": ["Rome", "Milan", "Florence", "Venice", "Naples", "Bologna", "Turin", "Palermo", "Amalfi", "Cinque Terre"],
    "spain": ["Barcelona", "Madrid", "Seville", "Valencia", "Granada", "Malaga", "San Sebastian", "Bilbao", "Ibiza", "Palma de Mallorca"],
    "portugal": ["Lisbon", "Porto", "Faro", "Lagos", "Sintra", "Cascais", "Coimbra", "Braga", "Funchal", "Aveiro"],
    "germany": ["Berlin", "Munich", "Hamburg", "Frankfurt", "Cologne", "Stuttgart", "Dresden", "Dusseldorf", "Leipzig", "Nuremberg"],
    "estonia": ["Tallinn", "Tartu", "Parnu", "Narva", "Haapsalu", "Kuressaare", "Viljandi", "Rakvere", "Otepaa", "Saaremaa"],
    "romania": ["Bucharest", "Brasov", "Cluj-Napoca", "Sibiu", "Timisoara", "Sighisoara", "Constanta", "Iasi", "Bran", "Sinaia"],
    "serbia": ["Belgrade", "Novi Sad", "Nis", "Subotica", "Kragujevac", "Zlatibor", "Kopaonik", "Vrnjacka Banja", "Mokra Gora", "Tara"],
    "north macedonia": ["Skopje", "Ohrid", "Bitola", "Prilep", "Tetovo", "Mavrovo", "Strumica", "Veles", "Kumanovo", "Dojran"],
    "russia": ["Moscow", "Saint Petersburg", "Kazan", "Sochi", "Kaliningrad", "Vladivostok", "Novosibirsk", "Yekaterinburg", "Nizhny Novgorod", "Irkutsk"],
    "turkey": ["Istanbul", "Cappadocia", "Antalya", "Izmir", "Bodrum", "Fethiye", "Ankara", "Trabzon", "Pamukkale", "Ephesus"],
    "albania": ["Tirana", "Saranda", "Berat", "Gjirokaster", "Vlore", "Durres", "Korca", "Shkoder", "Pogradec", "Himara"],
    "japan": ["Tokyo", "Kyoto", "Osaka", "Hiroshima", "Nara", "Hakone", "Kamakura", "Nikko", "Fukuoka", "Sapporo"],
    "south korea": ["Seoul", "Busan", "Jeju", "Gyeongju", "Incheon", "Daegu", "Jeonju", "Sokcho", "Gangneung", "Suwon"],
    "thailand": ["Bangkok", "Chiang Mai", "Phuket", "Krabi", "Koh Samui", "Pai", "Koh Phangan", "Koh Lanta", "Ayutthaya", "Chiang Rai"],
    "vietnam": ["Hanoi", "Ho Chi Minh City", "Da Nang", "Hoi An", "Nha Trang", "Phu Quoc", "Ha Long Bay", "Sapa", "Hue", "Dalat"],
    "india": ["Delhi", "Mumbai", "Goa", "Jaipur", "Varanasi", "Agra", "Kerala", "Udaipur", "Rishikesh", "Darjeeling"],
    "nepal": ["Kathmandu", "Pokhara", "Chitwan", "Lumbini", "Bhaktapur", "Nagarkot", "Bandipur", "Patan", "Thamel", "Lukla"],
    "bangladesh": ["Dhaka", "Chittagong", "Sylhet", "Cox's Bazar", "Rajshahi", "Khulna", "Rangpur", "Srimangal", "Sundarbans", "Comilla"],
    "philippines": ["Manila", "Cebu", "Palawan", "Boracay", "Siargao", "Bohol", "El Nido", "Coron", "Baguio", "Davao"],
    "indonesia": ["Bali", "Jakarta", "Yogyakarta", "Lombok", "Komodo", "Ubud", "Seminyak", "Flores", "Raja Ampat", "Bandung"],
    "taiwan": ["Taipei", "Kaohsiung", "Taichung", "Tainan", "Hualien", "Jiufen", "Sun Moon Lake", "Kenting", "Taroko Gorge", "Alishan"],
    "china": ["Beijing", "Shanghai", "Chengdu", "Xi'an", "Guilin", "Hong Kong", "Hangzhou", "Suzhou", "Kunming", "Lijiang"],
    "brunei": ["Bandar Seri Begawan", "Temburong", "Tutong", "Seria", "Kuala Belait", "Jerudong", "Muara", "Labi", "Bangar", "Lumut"],
    "bhutan": ["Thimphu", "Paro", "Punakha", "Bumthang", "Wangdue Phodrang", "Trongsa", "Haa", "Mongar", "Trashigang", "Phobjikha"],
    "egypt": ["Cairo", "Luxor", "Aswan", "Hurghada", "Sharm El Sheikh", "Alexandria", "Dahab", "Giza", "Marsa Alam", "Siwa Oasis"],
    "morocco": ["Marrakech", "Fes", "Chefchaouen", "Casablanca", "Essaouira", "Tangier", "Merzouga", "Rabat", "Ouarzazate", "Agadir"],
    "jordan": ["Amman", "Petra", "Wadi Rum", "Aqaba", "Dead Sea", "Jerash", "Madaba", "Ajloun", "Kerak", "Dana"],
    "qatar": ["Doha", "The Pearl", "Katara", "Lusail", "Al Wakrah", "Al Khor", "Souq Waqif", "Dukhan", "Mesaieed", "Zubarah"],
    "oman": ["Muscat", "Nizwa", "Salalah", "Sur", "Jebel Akhdar", "Wahiba Sands", "Ras Al Jinz", "Bahla", "Jabreen", "Muttrah"],
    "paraguay": ["Asuncion", "Ciudad del Este", "Encarnacion", "San Bernardino", "Areguá", "Luque", "Villarrica", "Caacupe", "Concepcion", "Pedro Juan Caballero"],
}


def generate_keywords(country_slug, output_path=None):
    """Generate keywords.txt for a given country."""
    slug = country_slug.lower().replace(" ", "-")

    # Find matching country
    match = None
    for key in COUNTRY_CITIES:
        if key == slug or key.replace(" ", "-") == slug or key.replace("-", " ") == slug.replace("-", " "):
            match = key
            break

    if not match:
        print(f"Country '{country_slug}' not found. Use --list to see available countries.")
        return None

    cities = COUNTRY_CITIES[match]
    country_name = match.replace("-", " ").title()

    keywords = []

    # For each category, generate keyword + city combinations
    for category, terms in CATEGORIES.items():
        for term in terms:
            # Top cities
            for city in cities:
                keywords.append(f"{term} near {city} {country_name}")

            # Also add country-wide search
            keywords.append(f"{term} in {country_name}")

    # Deduplicate while preserving order
    seen = set()
    unique = []
    for kw in keywords:
        if kw.lower() not in seen:
            seen.add(kw.lower())
            unique.append(kw)

    # Stats
    print(f"Country: {country_name}")
    print(f"Cities: {len(cities)}")
    print(f"Categories: {len(CATEGORIES)}")
    print(f"Total keywords: {len(terms)} across categories")
    print(f"Generated: {len(unique)} unique search queries")

    # Write to file
    if not output_path:
        output_path = os.path.join(os.path.dirname(__file__), f"keywords_{match.replace(' ', '_')}.txt")

    with open(output_path, "w", encoding="utf-8") as f:
        f.write("\n".join(unique))

    print(f"Written to: {output_path}")
    return unique


def list_countries():
    """Print all available countries."""
    print("Available countries:")
    for key in sorted(COUNTRY_CITIES.keys()):
        print(f"  {key} ({len(COUNTRY_CITIES[key])} cities)")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="Generate Botsol keywords for a country")
    parser.add_argument("country", nargs="?", help="Country slug (e.g. colombia, brazil)")
    parser.add_argument("--output", "-o", help="Output file path")
    parser.add_argument("--list", "-l", action="store_true", help="List available countries")
    args = parser.parse_args()

    if args.list:
        list_countries()
    elif args.country:
        generate_keywords(args.country, args.output)
    else:
        parser.print_help()
