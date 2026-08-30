/* Generated from the official lore page and materials/Convergence-Star-Charts-Additions.json. Do not edit by hand. */
export interface LoreRival {
  who: string;
  rel: string;
  id: string;
}

export interface LoreDetail {
  name: string;
  origin: string;
  epithet: string;
  rar: string;
  camp: string;
  align: string;
  cost: number;
  atk: number;
  hp: number;
  cc: string;
  vals: number[];
  rank: string;
  lore: string;
  quote: string;
  str: string[];
  wk: string[];
  sig_name: string;
  sig_desc: string;
  playstyle: string;
  ability: string;
  rivals: LoreRival[];
}

export const LORE_DETAILS: Record<string, LoreDetail> = {
  "c001": {
    "name": "John Wick",
    "origin": "Myth",
    "epithet": "Baba Yaga",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      3,
      3,
      8,
      0,
      6,
      6
    ],
    "rank": "C-tier · #25 in Willpower · #74 in Intellect",
    "lore": "John Wick is a legendary hitman, once the Baba Yaga of the criminal underworld, who retired for love and returns after a final act of cruelty takes everything from him. Now hunted by the High Table, he cuts through armies alone.",
    "quote": "Yeah, I'm thinking I'm back.",
    "str": [
      "Indomitable will, never stops",
      "Precise, economical gun-fu",
      "Pressures opponents into bad plays"
    ],
    "wk": [
      "Only human, no magic",
      "Overwhelmed by sheer numbers",
      "Bound by the Table's rules"
    ],
    "sig_name": "Gun-Fu",
    "sig_desc": "Fluid marksmanship blending martial arts with pistol combat.",
    "playstyle": "Disruptive hand-denial pressure",
    "ability": "Choose a card in the opponent's hand. They must play it next turn or it is burned.",
    "rivals": [
      {
        "who": "the High Table",
        "rel": "hunts him constantly",
        "id": ""
      },
      {
        "who": "Viggo Tarasov",
        "rel": "started their war",
        "id": ""
      },
      {
        "who": "Winston",
        "rel": "ally, Continental manager",
        "id": ""
      }
    ]
  },
  "c002": {
    "name": "Joker",
    "origin": "DCU",
    "epithet": "Clown Prince of Crime",
    "rar": "Mythic",
    "camp": "Nature",
    "align": "Evil",
    "cost": 1,
    "atk": 2,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      2,
      3,
      7,
      0,
      8,
      3
    ],
    "rank": "C-tier · #24 in Intellect · #68 in Willpower",
    "lore": "The Joker is Gotham's agent of chaos, a self-made villain with no single origin story he tells the same way twice. He exists purely to prove that anyone can break given one bad day, especially Batman.",
    "quote": "Why so serious?",
    "str": [
      "Brilliant, unpredictable criminal mastermind",
      "Manipulates minds and plans",
      "Thrives on pure chaos"
    ],
    "wk": [
      "Physically frail, no powers",
      "Reckless, courts his own death",
      "Predictably chooses chaos over gain"
    ],
    "sig_name": "Joker Venom",
    "sig_desc": "Toxin that kills victims locked in a rictus grin.",
    "playstyle": "Hand disruption, information theft",
    "ability": "Choose 2 cards in your opponent's hand, reveal them, then shuffle one back into the deck.",
    "rivals": [
      {
        "who": "Batman",
        "rel": "arch-nemesis, obsessed rivals",
        "id": "c005"
      },
      {
        "who": "Harley Quinn",
        "rel": "on-off accomplice",
        "id": ""
      },
      {
        "who": "Superman",
        "rel": "eventually kills him",
        "id": "c020"
      }
    ]
  },
  "c003": {
    "name": "Detective L",
    "origin": "Death Note",
    "epithet": "the World's Greatest Detective",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Good",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      2,
      2,
      7,
      0,
      9,
      3
    ],
    "rank": "C-tier · #4 in Intellect · #68 in Willpower",
    "lore": "L is the world's greatest detective, a reclusive genius who takes on Japan's mass-murderer Kira under a single letter alias. He sits in a perpetual crouch, lives on sweets, and trusts logic over fear.",
    "quote": "I am justice.",
    "str": [
      "Genius-level deduction and logic",
      "Reads people's psychology instantly",
      "Unshakable resolve under pressure"
    ],
    "wk": [
      "Physically weak, no combat skill",
      "Isolated, trusts almost no one",
      "Obsession with winning clouds safety"
    ],
    "sig_name": "",
    "sig_desc": "",
    "playstyle": "Cheap card-advantage engine",
    "ability": "Draw 1 card.",
    "rivals": [
      {
        "who": "Light Yagami",
        "rel": "nemesis, mutual obsession",
        "id": "c021"
      },
      {
        "who": "Watari",
        "rel": "mentor and handler",
        "id": ""
      },
      {
        "who": "Near",
        "rel": "successor after his death",
        "id": ""
      }
    ]
  },
  "c004": {
    "name": "Bigfoot",
    "origin": "Basic",
    "epithet": "the Sasquatch",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      5,
      4,
      1,
      0,
      2,
      5
    ],
    "rank": "C-tier · #99 in Strength · #87 in Agility",
    "lore": "Bigfoot is the forest's most famous rumor, a towering ape-like recluse glimpsed in blurry photos and cast prints across the Pacific Northwest. He wants only to be left alone in the deep woods, vanishing before anyone gets a clear look.",
    "quote": "Still no clear photos, huh?",
    "str": [
      "Surprisingly strong and fast",
      "Vanishes before a clean hit",
      "Thrives in deep wilderness"
    ],
    "wk": [
      "Refuses to fight back",
      "Low willpower, easily spooked",
      "Never actually confirmed to exist"
    ],
    "sig_name": "Into the Treeline",
    "sig_desc": "Melts into the forest before anyone gets a clear shot.",
    "playstyle": "Untouchable evasive stall",
    "ability": "Cannot attack. Evades half of incoming attacks.",
    "rivals": [
      {
        "who": "the Loch Ness Monster",
        "rel": "fellow cryptid legend",
        "id": ""
      },
      {
        "who": "trophy hunters",
        "rel": "always just miss him",
        "id": ""
      },
      {
        "who": "documentarians",
        "rel": "never get the shot",
        "id": ""
      }
    ]
  },
  "c005": {
    "name": "Batman",
    "origin": "DCU",
    "epithet": "the Dark Knight",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Good",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#1a86a8",
    "vals": [
      4,
      4,
      8,
      0,
      9,
      5
    ],
    "rank": "C-tier · #4 in Intellect · #25 in Willpower",
    "lore": "Batman is Bruce Wayne, a billionaire who channels his parents' murder into a one-man war on Gotham's crime. No powers, just relentless training, detective work, and a gadget for every occasion.",
    "quote": "I am vengeance.",
    "str": [
      "Peak human conditioning and skill",
      "Genius detective, always prepared",
      "Endless gadgets for any threat"
    ],
    "wk": [
      "No powers, purely mortal",
      "Overworked, running on no sleep",
      "Rigid no-kill rule exploited"
    ],
    "sig_name": "Batarang",
    "sig_desc": "Signature bat-shaped throwing weapon that never misses.",
    "playstyle": "Tempo-denying crowd control",
    "ability": "Freeze 2 enemy minions.",
    "rivals": [
      {
        "who": "Joker",
        "rel": "arch-nemesis, obsessed rivals",
        "id": "c002"
      },
      {
        "who": "Superman",
        "rel": "wary ally, moral rival",
        "id": "c020"
      },
      {
        "who": "Ra's al Ghul",
        "rel": "nemesis and dark mentor",
        "id": ""
      }
    ]
  },
  "c006": {
    "name": "Sandworm",
    "origin": "Dune",
    "epithet": "the Maker",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 2,
    "atk": 2,
    "hp": 4,
    "cc": "#2f9c63",
    "vals": [
      9,
      8,
      1,
      0,
      1,
      3
    ],
    "rank": "C-tier · #5 in Strength · #17 in Toughness",
    "lore": "The sandworms of Arrakis are colossal, ancient guardians of the deep desert, drawn to rhythmic vibration and deadly to anything that disturbs the sand. Their lifecycle creates the spice melange, the terrible engine behind the planet's entire economy.",
    "quote": "The spice must flow.",
    "str": [
      "Colossal size and raw power",
      "Nearly impervious to weak attacks",
      "Swallows prey whole"
    ],
    "wk": [
      "Mindless, no real strategy",
      "Fatally vulnerable to water",
      "Slow, ponderous outside sand"
    ],
    "sig_name": "The Maker's Maw",
    "sig_desc": "Engulfs anything that disturbs the open desert sand.",
    "playstyle": "Unkillable taunt wall",
    "ability": "Taunt. Cannot be damaged by minions with 2 or less ATK.",
    "rivals": [
      {
        "who": "the Fremen",
        "rel": "revere and ride it",
        "id": ""
      },
      {
        "who": "House Harkonnen",
        "rel": "exploit Arrakis's spice",
        "id": ""
      },
      {
        "who": "the Spacing Guild",
        "rel": "depends on its spice",
        "id": ""
      }
    ]
  },
  "c007": {
    "name": "Pandora's Actor",
    "origin": "Overlord",
    "epithet": "the Treasury Guardian",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 2,
    "atk": 2,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      6,
      4,
      6,
      4
    ],
    "rank": "C-tier · #97 in Willpower · #74 in Intellect",
    "lore": "Pandora's Actor is a Greater Doppelganger created by Ainz to guard Nazarick's treasury, able to transform into any being and borrow their skills. Flamboyant and theatrical, he remains fiercely, uniquely devoted to his creator.",
    "quote": "Pandora's Actor, at your service!",
    "str": [
      "Copies any foe's full power",
      "Flexible, adapts to any fight",
      "Loyal, fights without hesitation"
    ],
    "wk": [
      "Needs a target to copy",
      "Craves approval, easily distracted",
      "Overacts, underestimated by rivals"
    ],
    "sig_name": "Greater Doppelganger",
    "sig_desc": "Copies any being's exact form, stats, and skills.",
    "playstyle": "Direct face-damage burst",
    "ability": "Deal 2 damage to the enemy core.",
    "rivals": [
      {
        "who": "Ainz Ooal Gown",
        "rel": "creator and master",
        "id": "c023"
      },
      {
        "who": "Albedo",
        "rel": "mocks his theatrics",
        "id": ""
      },
      {
        "who": "the Supreme Beings",
        "rel": "forms he can mimic",
        "id": ""
      }
    ]
  },
  "c008": {
    "name": "T-1000",
    "origin": "Terminator",
    "epithet": "the Liquid Terminator",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 6,
    "atk": 3,
    "hp": 7,
    "cc": "#1a86a8",
    "vals": [
      6,
      8,
      3,
      0,
      5,
      6
    ],
    "rank": "C-tier · #17 in Toughness · #79 in Strength",
    "lore": "The T-1000 is an advanced Skynet infiltration unit made of shapeshifting liquid metal, sent back through time to kill John Connor. It mimics anyone it touches and reforms through nearly any damage, relentless and silent.",
    "quote": "Say, that's a nice bike.",
    "str": [
      "Reforms after nearly any damage",
      "Shapeshifts into anyone instantly",
      "Relentless, never tires or stops"
    ],
    "wk": [
      "Shatters when flash-frozen",
      "Destroyed by molten heat",
      "Follows orders, limited creativity"
    ],
    "sig_name": "Mimetic Polyalloy",
    "sig_desc": "Liquid metal body that reshapes into anyone or any blade.",
    "playstyle": "Self-sustaining resilient threat",
    "ability": "Heal 3 HP.",
    "rivals": [
      {
        "who": "the T-800",
        "rel": "rival protector model",
        "id": ""
      },
      {
        "who": "John Connor",
        "rel": "primary target",
        "id": ""
      },
      {
        "who": "Sarah Connor",
        "rel": "hunted relentlessly",
        "id": ""
      }
    ]
  },
  "c009": {
    "name": "Time Bomb",
    "origin": "Loki",
    "epithet": "",
    "rar": "Legendary",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 6,
    "atk": 0,
    "hp": 7,
    "cc": "#1a86a8",
    "vals": [
      5,
      1,
      0,
      8,
      0,
      0
    ],
    "rank": "C-tier · #30 in Magic · #99 in Strength",
    "lore": "Time Bomb is Sylvie's desperate weapon, dozens of stolen TVA reset charges wired together into one device built to rupture the Sacred Timeline. It exists purely to end the Time Variance Authority's control by force, whatever the cost.",
    "quote": "",
    "str": [
      "Massive area explosive damage",
      "Threatens an entire timeline",
      "Built from stolen TVA tech"
    ],
    "wk": [
      "Fragile, a single device",
      "No mind, purely a tool",
      "One-time use, then spent"
    ],
    "sig_name": "Reset Charge Cascade",
    "sig_desc": "Dozens of TVA charges chained to shatter a timeline.",
    "playstyle": "One-shot board wipe",
    "ability": "Deal 3 damage to all enemy minions.",
    "rivals": [
      {
        "who": "the TVA",
        "rel": "built from its tech",
        "id": ""
      },
      {
        "who": "Sylvie",
        "rel": "its builder and user",
        "id": ""
      },
      {
        "who": "the Sacred Timeline",
        "rel": "its intended target",
        "id": ""
      }
    ]
  },
  "c010": {
    "name": "Avatar Aang",
    "origin": "Avatar",
    "epithet": "the Last Airbender",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Good",
    "cost": 6,
    "atk": 2,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      7,
      6,
      7,
      8,
      5,
      8
    ],
    "rank": "B-tier · #30 in Magic · #12 in Agility",
    "lore": "Aang is the current Avatar, the last surviving Airbender, and a reluctant hero who fled the burden of his role for a century. Once found, he must master all four elements to end the Fire Nation's war before the world burns.",
    "quote": "I'm the Avatar. You have to trust me.",
    "str": [
      "Bends all four elements",
      "Avatar State taps past lives",
      "Incredibly agile, airborne mobility"
    ],
    "wk": [
      "Refuses lethal force, even villains",
      "Avatar State risks losing control",
      "Young, still learning the elements"
    ],
    "sig_name": "Avatar State",
    "sig_desc": "Channels every past Avatar's power; eyes and tattoos glow.",
    "playstyle": "Snowballing board-synergy scaler",
    "ability": "Gain +1/+1 for each different camp and alignment on the board.",
    "rivals": [
      {
        "who": "Fire Lord Ozai",
        "rel": "final, defining enemy",
        "id": "c099"
      },
      {
        "who": "Zuko",
        "rel": "rival turned ally",
        "id": ""
      },
      {
        "who": "Katara",
        "rel": "closest friend, ally",
        "id": ""
      }
    ]
  },
  "c011": {
    "name": "Thirteen Lords of Chaos",
    "origin": "AQW",
    "epithet": "Champions of Chaos",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 6,
    "atk": 4,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      7,
      6,
      5,
      8,
      5,
      5
    ],
    "rank": "B-tier · #30 in Magic · #52 in Strength",
    "lore": "The Thirteen Lords of Chaos are Drakath's inner circle, once-great heroes of Lore corrupted body and soul into avatars of Chaos itself. Each commands a monstrous Chaos Beast, and together they nearly unmade the world's order.",
    "quote": "Order was always the illusion.",
    "str": [
      "Each wields a Chaos Beast",
      "Powerful, corrupted heroic strength",
      "Protects each other in battle"
    ],
    "wk": [
      "Bound entirely to Drakath's will",
      "Former heroes, memories resurface",
      "Fall when their leader falls"
    ],
    "sig_name": "Chaorruption",
    "sig_desc": "Twists a hero's body and mind into a Chaos Lord.",
    "playstyle": "Protects a key threat",
    "ability": "Choose a friendly Evil minion. It becomes Invulnerable until your next turn.",
    "rivals": [
      {
        "who": "Drakath",
        "rel": "their Champion and leader",
        "id": ""
      },
      {
        "who": "the Heroes of Lore",
        "rel": "eternal sworn enemies",
        "id": ""
      },
      {
        "who": "King Alteon",
        "rel": "one of the Thirteen",
        "id": ""
      }
    ]
  },
  "c012": {
    "name": "G-Man",
    "origin": "Half-Life",
    "epithet": "the Man in Blue",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 7,
    "atk": 1,
    "hp": 7,
    "cc": "#1a86a8",
    "vals": [
      2,
      8,
      9,
      8,
      9,
      2
    ],
    "rank": "B-tier · #4 in Willpower · #4 in Intellect",
    "lore": "G-Man is an unplaceable figure in a blue suit who manipulates time and reality to move Gordon Freeman like a chess piece. He works for unnamed, higher employers, offering rewards to those useful and erasure to those who refuse.",
    "quote": "Rise and shine, Mr. Freeman.",
    "str": [
      "Bends time and reality itself",
      "Unkillable through normal means",
      "Always several steps ahead"
    ],
    "wk": [
      "Never fights directly himself",
      "Answers to unseen superiors",
      "Motives are unreadable, unreliable"
    ],
    "sig_name": "Temporal Freeze",
    "sig_desc": "Freezes time around anyone he chooses, mid-motion.",
    "playstyle": "Neutralizes a key threat",
    "ability": "Set an enemy minion's ATK to 0.",
    "rivals": [
      {
        "who": "Gordon Freeman",
        "rel": "his reluctant instrument",
        "id": "c081"
      },
      {
        "who": "the Combine",
        "rel": "rival unseen power",
        "id": ""
      },
      {
        "who": "Eli Vance",
        "rel": "watched closely for years",
        "id": ""
      }
    ]
  },
  "c013": {
    "name": "Doctor Strange",
    "origin": "MCU",
    "epithet": "Sorcerer Supreme",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 7,
    "atk": 3,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      7,
      9,
      8,
      4
    ],
    "rank": "B-tier · #6 in Magic · #24 in Intellect",
    "lore": "Stephen Strange is a brilliant, arrogant surgeon reborn as Earth's Sorcerer Supreme after a car crash ends his career. He now guards reality itself, bending time and space through the mystic arts.",
    "quote": "Dormammu, I've come to bargain.",
    "str": [
      "Master of the mystic arts",
      "Bends time and dimensions",
      "Vast spellcasting versatility"
    ],
    "wk": [
      "Damaged hands limit surgery",
      "Arrogant, underestimates opponents",
      "Physically average without magic"
    ],
    "sig_name": "Eye of Agamotto",
    "sig_desc": "Amulet holding the Time Stone, bends time itself.",
    "playstyle": "Wide board-clear damage",
    "ability": "Deal 2 damage to all enemy minions.",
    "rivals": [
      {
        "who": "Dormammu",
        "rel": "outsmarted with a loop",
        "id": "c052"
      },
      {
        "who": "Thanos",
        "rel": "fought him in Endgame",
        "id": "c027"
      },
      {
        "who": "Wong",
        "rel": "ally, fellow sorcerer",
        "id": ""
      }
    ]
  },
  "c014": {
    "name": "Kizaru",
    "origin": "One Piece",
    "epithet": "the Yellow Monkey",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 7,
    "atk": 4,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      8,
      8,
      5,
      8,
      6,
      10
    ],
    "rank": "A-tier · #1 in Agility · #24 in Strength",
    "lore": "Kizaru is Admiral Borsalino of the Marines, a laid-back fighter whose Pika Pika no Mi lets him move, attack, and even become pure light. Beneath the lazy attitude sits one of the Navy's most devastating weapons.",
    "quote": "Sorry, sorry. That could've really killed you.",
    "str": [
      "Moves and attacks at light-speed",
      "Untouchable Logia light body",
      "Devastating ranged laser kicks"
    ],
    "wk": [
      "Lazy, avoids extra effort",
      "Follows orders over initiative",
      "Solid attacks still hurt him"
    ],
    "sig_name": "Pika Pika no Mi",
    "sig_desc": "Light Logia grants light-speed movement, beams, and body.",
    "playstyle": "Temporary invulnerable attacker",
    "ability": "Gain Divine Shield.",
    "rivals": [
      {
        "who": "Akainu",
        "rel": "rival fellow admiral",
        "id": ""
      },
      {
        "who": "Monkey D. Luffy",
        "rel": "clashed at Marineford",
        "id": "c060"
      },
      {
        "who": "Sengoku",
        "rel": "former commanding officer",
        "id": ""
      }
    ]
  },
  "c015": {
    "name": "Avengers",
    "origin": "MCU",
    "epithet": "Earth's Mightiest Heroes",
    "rar": "Legendary",
    "camp": "ALL",
    "align": "Good",
    "cost": 7,
    "atk": 4,
    "hp": 4,
    "cc": "#d5a84c",
    "vals": [
      9,
      8,
      8,
      7,
      8,
      6
    ],
    "rank": "S-tier · #5 in Strength · #17 in Toughness",
    "lore": "The Avengers are Earth's premier response team, assembled when no single hero could face down an alien invasion alone. Iron Man, Captain America, Thor, Hulk, and their allies unite whenever the world's survival is at stake.",
    "quote": "Avengers, assemble.",
    "str": [
      "Combined skills cover every threat",
      "Each member elite alone",
      "Stronger fighting side by side"
    ],
    "wk": [
      "Internal conflicts fracture the team",
      "Weaker if forced apart",
      "A single loss risks all"
    ],
    "sig_name": "Assemble",
    "sig_desc": "Their rallying call before uniting against any threat.",
    "playstyle": "Copies a strong neighbor",
    "ability": "Gain the stats of the friendly minion to your left.",
    "rivals": [
      {
        "who": "Thanos",
        "rel": "fought him in Endgame",
        "id": "c027"
      },
      {
        "who": "Loki",
        "rel": "foe turned occasional ally",
        "id": ""
      },
      {
        "who": "HYDRA",
        "rel": "recurring enemy organization",
        "id": ""
      }
    ]
  },
  "c016": {
    "name": "Doom Slayer",
    "origin": "Doom",
    "epithet": "the Doom Marine",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Good",
    "cost": 7,
    "atk": 4,
    "hp": 4,
    "cc": "#1a86a8",
    "vals": [
      9,
      9,
      9,
      6,
      4,
      7
    ],
    "rank": "A-tier · #5 in Strength · #3 in Toughness",
    "lore": "The Doom Slayer is a nameless, ageless warrior whose singular purpose is the extermination of every demon in Hell. Hell itself fears his return more than anything else in the universe, having imprisoned him once already.",
    "quote": "Rip and tear, until it is done.",
    "str": [
      "Overwhelming strength and firepower",
      "Grows stronger the more hurt",
      "Relentless, nearly unstoppable momentum"
    ],
    "wk": [
      "Blunt, straightforward tactics only",
      "Fueled by rage, reckless",
      "Magic-users can still outmaneuver him"
    ],
    "sig_name": "BFG 9000",
    "sig_desc": "Massive plasma cannon that erases demons in one shot.",
    "playstyle": "Snowballs stronger when hurt",
    "ability": "If damaged, gain +2/+2 and give another friendly minion +2/+2.",
    "rivals": [
      {
        "who": "the Icon of Sin",
        "rel": "ultimate demonic nemesis",
        "id": ""
      },
      {
        "who": "Samuel Hayden",
        "rel": "uneasy, betrayed ally",
        "id": ""
      },
      {
        "who": "Hell's legions",
        "rel": "endless sworn enemies",
        "id": ""
      }
    ]
  },
  "c017": {
    "name": "Gol D. Roger",
    "origin": "One Piece",
    "epithet": "the Pirate King",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 8,
    "atk": 7,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      9,
      8,
      9,
      8,
      6,
      7
    ],
    "rank": "S-tier · #5 in Strength · #4 in Willpower",
    "lore": "Gol D. Roger conquered the Grand Line and found the One Piece, becoming the only man to ever claim the title of Pirate King. His execution and final words launched the entire Golden Age of Piracy that followed.",
    "quote": "Want my treasure? I left it all there.",
    "str": [
      "Strongest Conqueror's Haki ever seen",
      "Unmatched raw combat power",
      "Legendary crew, legendary reputation"
    ],
    "wk": [
      "Died of illness, not battle",
      "Reckless, courted his own end",
      "Left his crew to scatter"
    ],
    "sig_name": "Conqueror's Haki",
    "sig_desc": "Overwhelming willpower that drops the weak-hearted instantly.",
    "playstyle": "Snowballing relic-powered threat",
    "ability": "Gain an Ascension Relic.",
    "rivals": [
      {
        "who": "Whitebeard",
        "rel": "legendary rival captain",
        "id": "c065"
      },
      {
        "who": "Monkey D. Garp",
        "rel": "Marine rival and friend",
        "id": ""
      },
      {
        "who": "Rocks D. Xebec",
        "rel": "defeated together with Garp",
        "id": ""
      }
    ]
  },
  "c018": {
    "name": "Marshall D. Teach",
    "origin": "One Piece",
    "epithet": "Blackbeard",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 8,
    "atk": 5,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      8,
      6,
      7,
      9,
      7,
      5
    ],
    "rank": "A-tier · #6 in Magic · #24 in Strength",
    "lore": "Marshall D. Teach is Blackbeard, the only man known to wield two Devil Fruits at once, having stolen the Quake-Quake power after murdering a former crewmate. Ruthlessly ambitious, he claims a Yonko seat by taking whatever he wants.",
    "quote": "Darkness is far more ruthless than you think.",
    "str": [
      "Wields two Devil Fruits",
      "Nullifies powers with darkness",
      "World-ending quake attacks"
    ],
    "wk": [
      "Must physically touch to nullify",
      "Not especially fast or agile",
      "Crew is unpredictable, unruly"
    ],
    "sig_name": "Yami Yami no Mi",
    "sig_desc": "Nullifies any power on touch; he wields a second fruit too.",
    "playstyle": "Copies both sides' passives",
    "ability": "Copy a passive from one friendly and one enemy minion.",
    "rivals": [
      {
        "who": "Whitebeard",
        "rel": "killed him personally",
        "id": "c065"
      },
      {
        "who": "Portgas D. Ace",
        "rel": "captured and doomed him",
        "id": ""
      },
      {
        "who": "Monkey D. Luffy",
        "rel": "ongoing bitter rival",
        "id": "c060"
      }
    ]
  },
  "c019": {
    "name": "Gilgamesh",
    "origin": "Fate",
    "epithet": "King of Heroes",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 8,
    "atk": 5,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      8,
      6,
      8,
      9,
      6,
      5
    ],
    "rank": "A-tier · #6 in Magic · #24 in Strength",
    "lore": "Gilgamesh is the ancient Mesopotamian king of Uruk, part god, who hoards the original of every treasure and Noble Phantasm in existence. He views all of humanity, and most heroes, as mere mongrels beneath his throne.",
    "quote": "Know your place, mongrel.",
    "str": [
      "Owns every Noble Phantasm's original",
      "Near-limitless golden arsenal",
      "Divine strength and endurance"
    ],
    "wk": [
      "Arrogant, rarely fights seriously",
      "Enkidu's chains can bind him",
      "Underestimates anyone he calls weak"
    ],
    "sig_name": "Gate of Babylon",
    "sig_desc": "Armory of golden portals firing the world's first treasures.",
    "playstyle": "Snowballing relic-powered threat",
    "ability": "Gain an Ascension Relic.",
    "rivals": [
      {
        "who": "Enkidu",
        "rel": "his one true equal",
        "id": ""
      },
      {
        "who": "Saber",
        "rel": "recurring rival across routes",
        "id": ""
      },
      {
        "who": "humanity itself",
        "rel": "views as beneath him",
        "id": ""
      }
    ]
  },
  "c020": {
    "name": "Superman",
    "origin": "DCU",
    "epithet": "the Man of Steel",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Good",
    "cost": 8,
    "atk": 7,
    "hp": 7,
    "cc": "#2f9c63",
    "vals": [
      10,
      9,
      8,
      1,
      6,
      8
    ],
    "rank": "A-tier · #1 in Strength · #3 in Toughness",
    "lore": "Superman is Kal-El of Krypton, raised as Clark Kent in Kansas, whose alien physiology under a yellow sun makes him nearly invulnerable. He uses that power to embody hope, protecting a world he was never truly born into.",
    "quote": "Truth, justice, and the American way.",
    "str": [
      "Near-invulnerable, godlike strength",
      "Flight, heat vision, super speed",
      "Protects allies from control effects"
    ],
    "wk": [
      "Kryptonite strips his powers",
      "Magic bypasses his defenses",
      "Refuses to cross moral lines"
    ],
    "sig_name": "Heat Vision",
    "sig_desc": "Twin eye-beams hot enough to melt steel instantly.",
    "playstyle": "Protective anti-control anchor",
    "ability": "Friendly minions cannot be Silenced or Frozen.",
    "rivals": [
      {
        "who": "Lex Luthor",
        "rel": "arch-nemesis, endless schemer",
        "id": ""
      },
      {
        "who": "Doomsday",
        "rel": "killed him once",
        "id": "c056"
      },
      {
        "who": "Batman",
        "rel": "closest ally, moral rival",
        "id": "c005"
      }
    ]
  },
  "c021": {
    "name": "Light Yagami",
    "origin": "Death Note",
    "epithet": "Kira",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 9,
    "atk": 1,
    "hp": 8,
    "cc": "#7a52c8",
    "vals": [
      1,
      1,
      10,
      5,
      10,
      2
    ],
    "rank": "C-tier · #1 in Willpower · #1 in Intellect",
    "lore": "Light Yagami is a brilliant student who finds a supernatural notebook and decides he alone should judge the world's criminals. Convinced he is justice itself, he becomes the god-like killer Kira, hunted by the one detective who can match him.",
    "quote": "I am the god of the new world.",
    "str": [
      "Genius strategist, thinks ahead",
      "Death Note kills from anywhere",
      "Iron will, never breaks"
    ],
    "wk": [
      "Physically frail, no combat skill",
      "Needs a name and face",
      "Arrogance leads to fatal mistakes"
    ],
    "sig_name": "Death Note",
    "sig_desc": "Notebook that kills anyone whose name is written in it.",
    "playstyle": "Removes the weakest threat",
    "ability": "Destroy the lowest-ATK enemy minion.",
    "rivals": [
      {
        "who": "L",
        "rel": "nemesis, mutual obsession",
        "id": ""
      },
      {
        "who": "Ryuk",
        "rel": "amused shinigami accomplice",
        "id": ""
      },
      {
        "who": "Near",
        "rel": "successor who exposes him",
        "id": ""
      }
    ]
  },
  "c022": {
    "name": "Gojo",
    "origin": "Jujutsu Kaisen",
    "epithet": "the Strongest",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 9,
    "atk": 5,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      9,
      8,
      10,
      10,
      7,
      8
    ],
    "rank": "S-tier · #1 in Willpower · #1 in Magic",
    "lore": "Gojo Satoru is the strongest jujutsu sorcerer alive, wielding Limitless and Six Eyes techniques that make him nearly untouchable. Charismatic and supremely confident, he reshapes jujutsu society's future by simply refusing to lose.",
    "quote": "Throughout heaven and earth, I alone am the honored one.",
    "str": [
      "Infinity blocks nearly all attacks",
      "Limitless cursed energy control",
      "Hollow Purple erases anything"
    ],
    "wk": [
      "Only hurt by heavy hitters",
      "Domain Expansions bypass Infinity",
      "Overconfidence invites bigger threats"
    ],
    "sig_name": "Hollow Purple",
    "sig_desc": "Fuses Blue and Red into one reality-erasing blast.",
    "playstyle": "Near-invulnerable damage wall",
    "ability": "Can only be damaged by minions with 5 or more ATK.",
    "rivals": [
      {
        "who": "Sukuna",
        "rel": "eventually kills him",
        "id": ""
      },
      {
        "who": "Geto Suguru",
        "rel": "best friend turned enemy",
        "id": ""
      },
      {
        "who": "Yuji Itadori",
        "rel": "student he protects",
        "id": ""
      }
    ]
  },
  "c023": {
    "name": "Ainz Ooal Gown",
    "origin": "Overlord",
    "epithet": "Momonga",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 9,
    "atk": 4,
    "hp": 8,
    "cc": "#7a52c8",
    "vals": [
      7,
      7,
      8,
      9,
      8,
      4
    ],
    "rank": "A-tier · #6 in Magic · #25 in Willpower",
    "lore": "Ainz Ooal Gown is Momonga, an undead Overlord who ruled a guild of 41 in a dying MMO and woke to find it real. Now absolute ruler of the Great Tomb of Nazarick, he hides crushing anxiety behind a fearsome, skull-faced mask.",
    "quote": "I must not let them see me falter.",
    "str": [
      "Ninth-tier instant-death spells",
      "Commands Nazarick's endless legions",
      "Vast, unmatched magical arsenal"
    ],
    "wk": [
      "Undead: extra harm from holy magic",
      "Secretly anxious beneath the mask",
      "Slow, weak in melee range"
    ],
    "sig_name": "Grasp Heart",
    "sig_desc": "His favorite spell; crushes a target's heart from afar.",
    "playstyle": "Snowballing relic-powered threat",
    "ability": "Gain an Ascension Relic.",
    "rivals": [
      {
        "who": "the Slane Theocracy",
        "rel": "enemy nation, hunts undead",
        "id": ""
      },
      {
        "who": "Re-Estize nobles",
        "rel": "political rivals",
        "id": ""
      },
      {
        "who": "his old guildmates",
        "rel": "creators, long since gone",
        "id": ""
      }
    ]
  },
  "c024": {
    "name": "Conquest",
    "origin": "Invincible",
    "epithet": "the Undefeated",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Evil",
    "cost": 9,
    "atk": 3,
    "hp": 6,
    "cc": "#2f9c63",
    "vals": [
      8,
      8,
      7,
      0,
      3,
      7
    ],
    "rank": "B-tier · #24 in Strength · #17 in Toughness",
    "lore": "Conquest is a Viltrumite enforcer sent to force Mark Grayson into finishing Earth's conquest, and one of the empire's most feared, once-unbeaten soldiers. He beats Mark nearly to death for pure enjoyment before their final, fatal rematch.",
    "quote": "This is fun. Let's keep going.",
    "str": [
      "Viltrumite strength and durability",
      "No-sold Mark's strongest punch",
      "Grows more brutal against Good foes"
    ],
    "wk": [
      "Arrogant, toys with opponents",
      "Underestimates a truly enraged foe",
      "No powers beyond Viltrumite physiology"
    ],
    "sig_name": "Viltrumite Physiology",
    "sig_desc": "Alien strength, durability, and regeneration far past human limits.",
    "playstyle": "Scales harder vs Good",
    "ability": "Gain +3/+2 for each enemy Good minion.",
    "rivals": [
      {
        "who": "Invincible",
        "rel": "killed him in battle",
        "id": ""
      },
      {
        "who": "Thragg",
        "rel": "Viltrumite Empire's ruler",
        "id": ""
      },
      {
        "who": "Omni-Man",
        "rel": "fellow Viltrumite enforcer",
        "id": ""
      }
    ]
  },
  "c025": {
    "name": "Saitama",
    "origin": "OPM",
    "epithet": "Caped Baldy",
    "rar": "Mythic",
    "camp": "Nature",
    "align": "Good",
    "cost": 10,
    "atk": 8,
    "hp": 8,
    "cc": "#2f9c63",
    "vals": [
      10,
      10,
      10,
      0,
      3,
      9
    ],
    "rank": "A-tier · #1 in Strength · #1 in Toughness",
    "lore": "Saitama is a hero who trained so hard he lost his hair and became strong enough to end any fight in a single punch. Now nothing can challenge him, and his only real struggle is finding a battle worth having.",
    "quote": "I just wanted to be a hero for fun.",
    "str": [
      "Ends any fight in one punch",
      "Effectively unkillable, no known limit",
      "Total emotional composure in danger"
    ],
    "wk": [
      "Zero magic affinity or resistance",
      "Bored, unmotivated between fights",
      "Officially ranked and underrated"
    ],
    "sig_name": "Serious Punch",
    "sig_desc": "One full-strength punch, still just a fraction of his limit.",
    "playstyle": "Untouchable low-threat immunity",
    "ability": "Cannot be attacked by minions with 5 or less ATK.",
    "rivals": [
      {
        "who": "Genos",
        "rel": "devoted student and roommate",
        "id": ""
      },
      {
        "who": "Garou",
        "rel": "toughest recurring challenger",
        "id": ""
      },
      {
        "who": "the Hero Association",
        "rel": "undervalues his rank",
        "id": ""
      }
    ]
  },
  "c026": {
    "name": "Neo",
    "origin": "Matrix",
    "epithet": "The One",
    "rar": "Mythic",
    "camp": "Tech",
    "align": "Good",
    "cost": 10,
    "atk": 5,
    "hp": 8,
    "cc": "#1a86a8",
    "vals": [
      7,
      7,
      8,
      8,
      5,
      8
    ],
    "rank": "A-tier · #25 in Willpower · #30 in Magic",
    "lore": "Thomas Anderson, a hacker freed from the simulated Matrix, awakens as its prophesied One. He bends the simulation's code through sheer belief, growing godlike within any digital system. He leads humanity's fight against the machines.",
    "quote": "I know kung fu.",
    "str": [
      "Bends Matrix code at will",
      "Superhuman speed and reflexes",
      "Bullet-time combat mastery"
    ],
    "wk": [
      "Relies on others' strategy",
      "Powers fade outside the Matrix",
      "Doubt breaks his focus"
    ],
    "sig_name": "Bullet Stop",
    "sig_desc": "Freezes speeding bullets in midair by will.",
    "playstyle": "Protects key allies from control",
    "ability": "Protect a friendly slot from targeting, silence, and freeze.",
    "rivals": [
      {
        "who": "Agent Smith",
        "rel": "arch-nemesis and dark mirror",
        "id": ""
      },
      {
        "who": "Morpheus",
        "rel": "mentor who freed him",
        "id": "c054"
      },
      {
        "who": "The Architect",
        "rel": "system he defies",
        "id": ""
      }
    ]
  },
  "c027": {
    "name": "Thanos",
    "origin": "MCU",
    "epithet": "The Mad Titan",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 10,
    "atk": 5,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      9,
      9,
      8,
      9,
      7,
      6
    ],
    "rank": "S-tier · #5 in Strength · #3 in Toughness",
    "lore": "Thanos is the Titan warlord obsessed with universal balance, believing overpopulation dooms all life. He gathers the six Infinity Stones to wield reality-altering power, and snaps half of all existence out of being to enforce his philosophy.",
    "quote": "I am inevitable.",
    "str": [
      "Infinity Gauntlet reality control",
      "Titanic raw strength",
      "Nigh-invulnerable Titan physiology"
    ],
    "wk": [
      "Arrogance invites overconfidence",
      "Stones can be stripped away",
      "Blind devotion to his plan"
    ],
    "sig_name": "Infinity Gauntlet",
    "sig_desc": "Wields all six Stones to reshape reality itself.",
    "playstyle": "Mutual chaos, random destruction",
    "ability": "Each player destroys a random minion and discards a random card.",
    "rivals": [
      {
        "who": "Iron Man",
        "rel": "who finally defeated him",
        "id": ""
      },
      {
        "who": "Thor",
        "rel": "beheaded him in vengeance",
        "id": ""
      },
      {
        "who": "Darkseid",
        "rel": "DC's mirrored mad tyrant",
        "id": ""
      }
    ]
  },
  "c028": {
    "name": "Flash",
    "origin": "DCU",
    "epithet": "The Fastest Man Alive",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 10,
    "atk": 4,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      6,
      6,
      6,
      6,
      6,
      10
    ],
    "rank": "B-tier · #1 in Agility · #79 in Strength",
    "lore": "Barry Allen is a CSI struck by lightning and chemicals, gaining a connection to the Speed Force. As the Flash, he moves and thinks faster than reality itself, often racing through time to fix disasters.",
    "quote": "My name is Barry Allen, the fastest man alive.",
    "str": [
      "Speed Force-fueled velocity",
      "Time travel via running",
      "Superhuman reflexes and healing"
    ],
    "wk": [
      "Needs huge caloric intake",
      "Timeline changes backfire badly",
      "Physical power lags his speed"
    ],
    "sig_name": "Speed Force",
    "sig_desc": "Taps a cosmic energy granting near-limitless super-speed.",
    "playstyle": "Multiple attacks, relentless tempo",
    "ability": "Can attack three times each turn.",
    "rivals": [
      {
        "who": "Reverse-Flash",
        "rel": "speedster arch-nemesis",
        "id": "c028"
      },
      {
        "who": "Quicksilver",
        "rel": "Marvel's speedster counterpart",
        "id": ""
      },
      {
        "who": "Superman",
        "rel": "friendly speed racing rival",
        "id": "c020"
      }
    ]
  },
  "c029": {
    "name": "Darth Vader",
    "origin": "Star Wars",
    "epithet": "Sith Lord",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 5,
    "atk": 3,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      7,
      6,
      8,
      8,
      6,
      6
    ],
    "rank": "B-tier · #25 in Willpower · #30 in Magic",
    "lore": "Once the prophesied Jedi Anakin Skywalker, he fell to the dark side and became Emperor Palpatine's enforcer. Encased in black armor after near-fatal burns, he commands the Force and an Imperial fleet with ruthless efficiency.",
    "quote": "I find your lack of faith disturbing.",
    "str": [
      "Force choke at range",
      "Master Force and lightsaber duelist",
      "Commands the Imperial military"
    ],
    "wk": [
      "Life support armor is fragile",
      "Torn between duty and son",
      "Physically slowed by injuries"
    ],
    "sig_name": "Force Choke",
    "sig_desc": "Crushes a foe's throat from afar with the Force.",
    "playstyle": "Finishes off wounded good foes",
    "ability": "Destroy a random Good enemy minion with less than 3 HP.",
    "rivals": [
      {
        "who": "Obi-Wan Kenobi",
        "rel": "former master, mortal enemy",
        "id": ""
      },
      {
        "who": "Luke Skywalker",
        "rel": "estranged son, redemption",
        "id": ""
      },
      {
        "who": "Emperor Palpatine",
        "rel": "manipulative dark master",
        "id": ""
      }
    ]
  },
  "c030": {
    "name": "Dumbledore",
    "origin": "Harry Potter",
    "epithet": "Headmaster of Hogwarts",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Good",
    "cost": 5,
    "atk": 3,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      5,
      4,
      8,
      9,
      9,
      3
    ],
    "rank": "B-tier · #6 in Magic · #4 in Intellect",
    "lore": "Albus Dumbledore is the wise, powerful headmaster of Hogwarts and the wizarding world's greatest sorcerer, feared even by Voldemort. He wields the Elder Wand and guides Harry Potter's fight against dark magic through wisdom and quiet strength.",
    "quote": "It is our choices that show what we truly are.",
    "str": [
      "Elder Wand's unmatched power",
      "Peerless magical knowledge",
      "Wisdom outmaneuvers dark wizards"
    ],
    "wk": [
      "Aging body, physically frail",
      "Guilt over past mistakes",
      "Reluctant to strike first"
    ],
    "sig_name": "Elder Wand",
    "sig_desc": "The unbeatable wand, most powerful ever made.",
    "playstyle": "Thrives when evil is absent",
    "ability": "If there are no Evil minions on the board, gain +3/+3.",
    "rivals": [
      {
        "who": "Voldemort",
        "rel": "nemesis who fears him",
        "id": "c114"
      },
      {
        "who": "Grindelwald",
        "rel": "former friend, defeated foe",
        "id": ""
      },
      {
        "who": "Gandalf",
        "rel": "fellow wise wizard archetype",
        "id": "c080"
      }
    ]
  },
  "c031": {
    "name": "Ragnaros",
    "origin": "Hearthstone",
    "epithet": "The Firelord",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Evil",
    "cost": 5,
    "atk": 4,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      7,
      7,
      6,
      9,
      5,
      4
    ],
    "rank": "B-tier · #6 in Magic · #52 in Strength",
    "lore": "Ragnaros is the Firelord, an ancient Elemental Lord who warred against the Titans before being bound to the Elemental Plane. Wielding the hammer Sulfuras, he rules the Molten Core with volcanic, world-ending fury.",
    "quote": "By fire be purged!",
    "str": [
      "Sulfuras hammer devastates foes",
      "Commands armies of fire elementals",
      "Near-immortal elemental physiology"
    ],
    "wk": [
      "Slow, lumbering movements",
      "Bound and weakened outside fire",
      "Low cunning, brute force only"
    ],
    "sig_name": "Sulfuras, Hand of Ragnaros",
    "sig_desc": "A molten hammer that channels his fire lord power.",
    "playstyle": "Executes weak Neutral minions",
    "ability": "Destroy a random Neutral enemy minion with less than 3 HP.",
    "rivals": [
      {
        "who": "Majordomo Executus",
        "rel": "his herald and summoner",
        "id": ""
      },
      {
        "who": "Thrall",
        "rel": "shaman who battled him",
        "id": ""
      },
      {
        "who": "Surtur",
        "rel": "fire-giant myth counterpart",
        "id": ""
      }
    ]
  },
  "c032": {
    "name": "Silver Surfer",
    "origin": "MCU",
    "epithet": "Herald of Galactus",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 5,
    "atk": 1,
    "hp": 1,
    "cc": "#1a86a8",
    "vals": [
      7,
      8,
      8,
      9,
      6,
      9
    ],
    "rank": "S-tier · #6 in Magic · #4 in Agility",
    "lore": "Norrin Radd sacrificed his freedom to spare his homeworld, becoming Galactus's silver herald and gaining the Power Cosmic. He soars the stars on his board scouting worlds to be devoured, until his conscience finally turns him against his master.",
    "quote": "I have wielded the Power Cosmic.",
    "str": [
      "Power Cosmic energy manipulation",
      "Flies faster than light",
      "Near-invulnerable cosmic body"
    ],
    "wk": [
      "Bound by oath to Galactus",
      "Conscience stays his hand",
      "Vulnerable if board is lost"
    ],
    "sig_name": "Power Cosmic",
    "sig_desc": "Cosmic energy granting flight, blasts, and near god-like power.",
    "playstyle": "Cheats out a chained minion",
    "ability": "Summon a random minion from your hand. It enters Chained.",
    "rivals": [
      {
        "who": "Galactus",
        "rel": "master he serves, then defies",
        "id": ""
      },
      {
        "who": "Fantastic Four",
        "rel": "foes turned allies over Earth",
        "id": "c120"
      },
      {
        "who": "Thanos",
        "rel": "clashes across the cosmos",
        "id": "c027"
      }
    ]
  },
  "c033": {
    "name": "Yujiro",
    "origin": "Baki",
    "epithet": "The Ogre",
    "rar": "Mythic",
    "camp": "Nature",
    "align": "Evil",
    "cost": 4,
    "atk": 5,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      7,
      6,
      8,
      1,
      6,
      7
    ],
    "rank": "B-tier · #25 in Willpower · #52 in Strength",
    "lore": "Yujiro Hanma is the Strongest Creature on Earth, a father whose raw power surpasses armies and nations alike. An ancient demonic presence looms behind him in battle, and his casual cruelty makes him Baki's ultimate rival.",
    "quote": "There is no one stronger than me on this planet.",
    "str": [
      "Demon Back doubles his power",
      "Nation-toppling raw strength",
      "Instills paralyzing fear alone"
    ],
    "wk": [
      "Reckless, underestimates challengers",
      "No ranged or magic tricks",
      "Arrogance blinds him to threats"
    ],
    "sig_name": "Demon Back",
    "sig_desc": "His back flexes into a demon's face, unleashing full power.",
    "playstyle": "Locks down a single threat",
    "ability": "Freeze the enemy minion in the opposing slot.",
    "rivals": [
      {
        "who": "Baki Hanma",
        "rel": "son and destined rival",
        "id": ""
      },
      {
        "who": "Retsu Kaioh",
        "rel": "rare true martial equal",
        "id": ""
      },
      {
        "who": "Pickle",
        "rel": "primal strength rival",
        "id": ""
      }
    ]
  },
  "c034": {
    "name": "Yubaba",
    "origin": "Spirited Away",
    "epithet": "Bathhouse Witch",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 4,
    "atk": 2,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      2,
      3,
      6,
      7,
      6,
      3
    ],
    "rank": "C-tier · #65 in Magic · #97 in Willpower",
    "lore": "Yubaba is the greedy, shrewd witch who rules the spirit-world bathhouse in Spirited Away. She steals workers' names to bind them into servitude, ruling through fear, gold, and formidable sorcery.",
    "quote": "From now on, your name is Sen.",
    "str": [
      "Steals names to enslave",
      "Potent shapeshifting sorcery",
      "Commands the bathhouse spirits"
    ],
    "wk": [
      "Physically frail and small",
      "Greed clouds her judgment",
      "Doted blind on her son"
    ],
    "sig_name": "Name-Stealing Contract",
    "sig_desc": "Binds workers into servitude by seizing their true name.",
    "playstyle": "Marks a target for execution",
    "ability": "Mark an enemy minion. At your next turn, destroy it.",
    "rivals": [
      {
        "who": "Chihiro Ogino",
        "rel": "defiant former captive worker",
        "id": ""
      },
      {
        "who": "Zeniba",
        "rel": "estranged twin sister rival",
        "id": ""
      },
      {
        "who": "Haku",
        "rel": "apprentice bound by contract",
        "id": ""
      }
    ]
  },
  "c035": {
    "name": "Spiderman",
    "origin": "MCU",
    "epithet": "Friendly Neighborhood Spider-Man",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Good",
    "cost": 4,
    "atk": 3,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      5,
      5,
      6,
      1,
      7,
      8
    ],
    "rank": "B-tier · #12 in Agility · #54 in Intellect",
    "lore": "Peter Parker is a Queens teenager bitten by a radioactive spider, gaining wall-crawling strength and a warning 'spider-sense.' Mentored by Tony Stark, he balances high school life with swinging through New York as Spider-Man.",
    "quote": "I'm just a friendly neighborhood Spider-Man.",
    "str": [
      "Spider-sense danger precognition",
      "Wall-crawling superhuman agility",
      "Web-slinger versatile utility"
    ],
    "wk": [
      "Below Avengers-tier raw power",
      "Young, still learning limits",
      "No magic, gadgets only"
    ],
    "sig_name": "Web-Shooters",
    "sig_desc": "Wrist gadgets that shoot webbing to swing and bind foes.",
    "playstyle": "Webs down and weakens threats",
    "ability": "Freeze an enemy minion and halve its ATK.",
    "rivals": [
      {
        "who": "Green Goblin",
        "rel": "personal arch-nemesis foe",
        "id": ""
      },
      {
        "who": "Iron Man",
        "rel": "mentor and father figure",
        "id": ""
      },
      {
        "who": "Miles Morales",
        "rel": "multiversal Spider counterpart",
        "id": ""
      }
    ]
  },
  "c036": {
    "name": "General Grievous",
    "origin": "Star Wars",
    "epithet": "Droid Army Commander",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Evil",
    "cost": 4,
    "atk": 2,
    "hp": 4,
    "cc": "#1a86a8",
    "vals": [
      6,
      5,
      5,
      0,
      7,
      8
    ],
    "rank": "B-tier · #12 in Agility · #54 in Intellect",
    "lore": "General Grievous is a cyborg warlord commanding the Separatist droid army, his organic parts salvaged after a near-fatal crash. He hoards fallen Jedi's lightsabers as trophies, wielding up to four at once in brutal multi-limbed combat.",
    "quote": "General Kenobi. You are a bold one.",
    "str": [
      "Wields four lightsabers at once",
      "Cyborg reflexes and durability",
      "Commands vast droid legions"
    ],
    "wk": [
      "Exposed organic heart and lungs",
      "Coughing fit betrays real body",
      "No Force powers of his own"
    ],
    "sig_name": "Stolen Lightsabers",
    "sig_desc": "Fights with four hoarded Jedi blades at once.",
    "playstyle": "Buffs a Tech ally hard",
    "ability": "Give one friendly Tech minion +2/+2.",
    "rivals": [
      {
        "who": "Obi-Wan Kenobi",
        "rel": "his eventual killer",
        "id": ""
      },
      {
        "who": "Mace Windu",
        "rel": "Jedi he nearly bested",
        "id": ""
      },
      {
        "who": "Count Dooku",
        "rel": "Separatist master, uneasy ally",
        "id": ""
      }
    ]
  },
  "c037": {
    "name": "Eye of Sauron",
    "origin": "Lord of the Rings",
    "epithet": "The Lidless Eye",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 5,
    "atk": 2,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      0,
      8,
      9,
      9,
      8,
      0
    ],
    "rank": "B-tier · #4 in Willpower · #6 in Magic",
    "lore": "The Eye of Sauron is the fiery, unblinking manifestation of the Dark Lord's will atop Barad-dur, all that remains of his physical form. It scours Middle-earth ceaselessly, hunting for the One Ring and any who would defy Mordor.",
    "quote": "I see you.",
    "str": [
      "All-seeing surveillance of Middle-earth",
      "Unbreakable will and dread aura",
      "Empowers Mordor's armies"
    ],
    "wk": [
      "Has no body, cannot act",
      "Blind beyond its own gaze",
      "Destroyed if the Ring falls"
    ],
    "sig_name": "The All-Seeing Gaze",
    "sig_desc": "Sees any who wear the Ring or defy it.",
    "playstyle": "Peers into the enemy hand",
    "ability": "Reveal a random card from the enemy hand.",
    "rivals": [
      {
        "who": "Frodo Baggins",
        "rel": "Ring-bearer it hunts",
        "id": ""
      },
      {
        "who": "Aragorn",
        "rel": "lured it from Mordor",
        "id": ""
      },
      {
        "who": "Gandalf",
        "rel": "chief rival strategist",
        "id": "c080"
      }
    ]
  },
  "c038": {
    "name": "Buddha",
    "origin": "Record of Ragnarok",
    "epithet": "The Enlightened One",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 5,
    "atk": 3,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      8,
      8,
      8,
      8,
      7,
      7
    ],
    "rank": "A-tier · #24 in Strength · #17 in Toughness",
    "lore": "Shakyamuni Buddha fights for Humanity in Ragnarok, meeting the gods' champions with total serenity. His precognition lets him see and dodge any attack from a soul with light in it, guided by boundless compassion rather than rage.",
    "quote": "I have already seen the path you will take.",
    "str": [
      "Future sight dodges any blow",
      "Six Realms Staff shifts forms",
      "Infinite serene combat patience"
    ],
    "wk": [
      "Blind to hearts devoid of light",
      "Compassion delays killing blows",
      "Vulnerable once precognition is countered"
    ],
    "sig_name": "Turn About Six Realms",
    "sig_desc": "His staff reshapes into divine weapons for any range.",
    "playstyle": "Cripples a target's health instantly",
    "ability": "Set an enemy minion's HP to 1.",
    "rivals": [
      {
        "who": "Zerofuku",
        "rel": "his Ragnarok round opponent",
        "id": ""
      },
      {
        "who": "Hajun",
        "rel": "dark rival, devil king",
        "id": ""
      },
      {
        "who": "Shiva",
        "rel": "fellow divine combatant",
        "id": ""
      }
    ]
  },
  "c039": {
    "name": "Deep Sea King",
    "origin": "OPM",
    "epithet": "Self-Proclaimed Sea King",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 5,
    "atk": 4,
    "hp": 4,
    "cc": "#2f9c63",
    "vals": [
      6,
      6,
      3,
      2,
      3,
      5
    ],
    "rank": "C-tier · #79 in Strength · #81 in Toughness",
    "lore": "The Deep Sea King is a monstrous seafolk tyrant who tears through City Z's heroes, boasting himself ruler of all sea creatures. His rampage ends in a single anticlimactic punch from Saitama, one of the series' funniest gut-checks.",
    "quote": "I am the King of the Sea!",
    "str": [
      "Crushing monstrous physical strength",
      "Regenerates and adapts in water",
      "Terrorizes whole cities alone"
    ],
    "wk": [
      "Arrogance invites his own doom",
      "One punch away from death",
      "Low cunning, all bluster"
    ],
    "sig_name": "",
    "sig_desc": "",
    "playstyle": "Strongest alone among Evil",
    "ability": "If this is your only Evil minion, gain +3/+3.",
    "rivals": [
      {
        "who": "Saitama",
        "rel": "one-punch executioner",
        "id": "c025"
      },
      {
        "who": "Genos",
        "rel": "cyborg hero he mocked",
        "id": ""
      },
      {
        "who": "City Z heroes",
        "rel": "slaughtered before Saitama arrived",
        "id": ""
      }
    ]
  },
  "c040": {
    "name": "Toji",
    "origin": "Jujutsu Kaisen",
    "epithet": "The Sorcerer Killer",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 6,
    "atk": 4,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      8,
      6,
      7,
      0,
      7,
      9
    ],
    "rank": "B-tier · #4 in Agility · #24 in Strength",
    "lore": "Toji Fushiguro is a former Zen'in assassin born with Heavenly Restriction, stripping his cursed energy but granting monstrous physical prowess. Wielding the technique-erasing Inverted Spear of Heaven, he alone nearly kills the strongest sorcerer, Gojo.",
    "quote": "Not bad, for the strongest.",
    "str": [
      "Erases techniques with his spear",
      "Zero cursed energy, pure body",
      "Superhuman speed outclasses sorcerers"
    ],
    "wk": [
      "No cursed technique of his own",
      "Relies entirely on cursed tools",
      "Mortal body, no regeneration"
    ],
    "sig_name": "Inverted Spear of Heaven",
    "sig_desc": "A cursed tool that nullifies any technique on contact.",
    "playstyle": "Snowballs through powerful relics",
    "ability": "Gain an Ascension Relic.",
    "rivals": [
      {
        "who": "Satoru Gojo",
        "rel": "nearly killed the strongest",
        "id": ""
      },
      {
        "who": "Megumi Fushiguro",
        "rel": "the son he abandoned",
        "id": ""
      },
      {
        "who": "Suguru Geto",
        "rel": "hired him as assassin",
        "id": ""
      }
    ]
  },
  "c041": {
    "name": "Bill Cypher",
    "origin": "Gravity Falls",
    "epithet": "Dream Demon",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 10,
    "atk": 7,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      3,
      5,
      8,
      9,
      9,
      6
    ],
    "rank": "B-tier · #6 in Magic · #4 in Intellect",
    "lore": "Bill Cipher is a two-dimensional dream demon from the Nightmare Realm who manipulates minds and bends reality for chaos. Charming and gleefully cruel, he schemes across decades to tear down the barrier into our dimension.",
    "quote": "Reality is an illusion. The universe is a hologram.",
    "str": [
      "Reality-warping dream magic",
      "Reads and invades any mind",
      "Immortal, near-omniscient trickster"
    ],
    "wk": [
      "Powerless without a deal or dream",
      "Overconfidence invites betrayal",
      "Vulnerable once in physical form"
    ],
    "sig_name": "Deal-Making Handshake",
    "sig_desc": "A fiery handshake deal grants him deadly influence.",
    "playstyle": "Sows chaos, randomizes attacks",
    "ability": "Ongoing: Choose 1 enemy minion board slot. Minions on that board slot can only attack randomly",
    "rivals": [
      {
        "who": "Stanford Pines",
        "rel": "trusted then betrayed him",
        "id": ""
      },
      {
        "who": "Dipper Pines",
        "rel": "outsmarted his mind games",
        "id": ""
      },
      {
        "who": "Discord",
        "rel": "fellow reality-warping trickster",
        "id": ""
      }
    ]
  },
  "c042": {
    "name": "Giorno - Gold Experience Requiem",
    "origin": "JoJo",
    "epithet": "The Golden Wind",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 10,
    "atk": 4,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      6,
      8,
      8,
      10,
      8,
      6
    ],
    "rank": "A-tier · #1 in Magic · #17 in Toughness",
    "lore": "Giorno Giovanna, DIO's son turned mafia idealist, wields Gold Experience Requiem, a Stand that punishes any act taken to escape death or consequence. It resets the guilty to 'zero,' trapping them in an inescapable loop of failure.",
    "quote": "None who stand before me shall ever get there.",
    "str": [
      "Returns any action to zero",
      "Grants and negates life itself",
      "Erases death, decay, and destruction"
    ],
    "wk": [
      "Requires point-blank Stand range",
      "Giorno unaware of full extent",
      "Vulnerable before Requiem awakens"
    ],
    "sig_name": "Gold Experience Requiem",
    "sig_desc": "Returns any action against Giorno to nothingness, endlessly.",
    "playstyle": "Permanently silences enemy abilities",
    "ability": "Ongoing: Choose 1 enemy minion board slot. Enemy minions on that board slot are permanently silenced",
    "rivals": [
      {
        "who": "Diavolo",
        "rel": "the boss he dethroned",
        "id": ""
      },
      {
        "who": "DIO",
        "rel": "infamous vampire birth father",
        "id": ""
      },
      {
        "who": "Bruno Bucciarati",
        "rel": "loyal gang captain ally",
        "id": ""
      }
    ]
  },
  "c043": {
    "name": "Doctor Manhattan",
    "origin": "DCU",
    "epithet": "The Blue God",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 10,
    "atk": 3,
    "hp": 7,
    "cc": "#2f9c63",
    "vals": [
      9,
      10,
      9,
      10,
      9,
      8
    ],
    "rank": "S-tier · #1 in Toughness · #1 in Magic",
    "lore": "Jon Osterman is rebuilt atom by atom after a lab accident, becoming Doctor Manhattan, a being who perceives time non-linearly and commands matter itself. His godlike detachment from humanity unsettles even his fellow heroes in Watchmen.",
    "quote": "Nothing ends. Nothing ever ends.",
    "str": [
      "Total control over matter",
      "Sees past, present, future at once",
      "Can duplicate or teleport at will"
    ],
    "wk": [
      "Emotionally distant from humanity",
      "Tachyons can blind his foresight",
      "Passive, rarely intervenes in time"
    ],
    "sig_name": "Intrinsic Field Manipulation",
    "sig_desc": "Disassembles and reshapes matter down to the atom.",
    "playstyle": "Rewrites any minion's stats",
    "ability": "Ongoing: Set any one minion's ATK and HP to values between 1 and 5",
    "rivals": [
      {
        "who": "Ozymandias",
        "rel": "witnessed his utilitarian scheme",
        "id": ""
      },
      {
        "who": "The Comedian",
        "rel": "former teammate he failed",
        "id": ""
      },
      {
        "who": "Superman",
        "rel": "DC's other godlike being",
        "id": "c020"
      }
    ]
  },
  "c044": {
    "name": "Mastered Ultra Instinct Goku",
    "origin": "Dragon Ball",
    "epithet": "Migatte no Gokui",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 10,
    "atk": 7,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      10,
      9,
      9,
      9,
      5,
      10
    ],
    "rank": "S-tier · #1 in Strength · #1 in Agility",
    "lore": "Goku masters Ultra Instinct, a divine technique that moves his body on pure reflex without conscious thought, dodging and countering faster than he can think. In this silver-haired state he fights among gods as an equal, needing no strategy at all.",
    "quote": "My body moved on its own.",
    "str": [
      "Instinctive, unthinking perfect dodges",
      "God-tier destructive power",
      "Endless stamina in this form"
    ],
    "wk": [
      "Immense strain to sustain form",
      "Instinct outpaces his own thinking",
      "Still learning to control it"
    ],
    "sig_name": "Mastered Ultra Instinct",
    "sig_desc": "Body dodges and attacks on pure reflex, no thought.",
    "playstyle": "Snowballing slot-wide growth engine",
    "ability": "Ongoing: Choose 1 friendly minion board slot. Minions on that board slot gain +2/2 at the start of your turn",
    "rivals": [
      {
        "who": "Jiren",
        "rel": "forced this form's awakening",
        "id": ""
      },
      {
        "who": "Vegeta",
        "rel": "eternal rival and friend",
        "id": ""
      },
      {
        "who": "Saitama",
        "rel": "fan-debated power rival",
        "id": "c025"
      }
    ]
  },
  "c045": {
    "name": "Rick Prime",
    "origin": "Rick and Morty",
    "epithet": "Rick's Ultimate Nemesis",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Evil",
    "cost": 10,
    "atk": 4,
    "hp": 10,
    "cc": "#2f9c63",
    "vals": [
      2,
      4,
      8,
      0,
      10,
      3
    ],
    "rank": "C-tier · #1 in Intellect · #25 in Willpower",
    "lore": "Rick Prime is the sociopathic Rick who murdered C-137's wife and daughter out of pure spite. The most brilliant and remorseless Rick in the multiverse, he evades justice for decades using an identity-erasing Omega Device.",
    "quote": "You were never going to be better than me.",
    "str": [
      "Multiverse's most brilliant scientist",
      "Omega Device erases existence",
      "Decades ahead of every pursuer"
    ],
    "wk": [
      "Physically frail, unremarkable body",
      "Overconfidence in his own genius",
      "No powers beyond his tech"
    ],
    "sig_name": "Omega Device",
    "sig_desc": "Erases a person from every dimension and all memory.",
    "playstyle": "Snowballs relics turn after turn",
    "ability": "Ongoing: Gain 1 Ascension Relic",
    "rivals": [
      {
        "who": "Rick C-137",
        "rel": "hunted him for revenge",
        "id": ""
      },
      {
        "who": "Morty Smith",
        "rel": "dismisses as beneath notice",
        "id": ""
      },
      {
        "who": "Evil Morty",
        "rel": "another multiversal mastermind rival",
        "id": ""
      }
    ]
  },
  "c046": {
    "name": "The Watcher",
    "origin": "MCU",
    "epithet": "Cosmic Observer",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 10,
    "atk": 6,
    "hp": 8,
    "cc": "#7a52c8",
    "vals": [
      3,
      6,
      8,
      9,
      9,
      5
    ],
    "rank": "B-tier · #6 in Magic · #4 in Intellect",
    "lore": "Uatu the Watcher is a cosmic being sworn to observe the multiverse without ever interfering, no matter how dire events become. He narrates and studies countless alternate timelines from his post on the moon, breaking his oath only once.",
    "quote": "I am the Watcher. I am your guide.",
    "str": [
      "Sees every timeline at once",
      "Vast cosmic power, rarely used",
      "Nigh-omniscient multiversal knowledge"
    ],
    "wk": [
      "Sworn oath forbids intervening",
      "Rarely acts even in crisis",
      "Physically passive, not a fighter"
    ],
    "sig_name": "Multiversal Omniscience",
    "sig_desc": "Observes every reality and timeline simultaneously.",
    "playstyle": "Steals the opponent's best card",
    "ability": "Ongoing: Steal the highest-cost card in your opponent's hand",
    "rivals": [
      {
        "who": "Ultron",
        "rel": "forced him to intervene",
        "id": "c075"
      },
      {
        "who": "Strange Supreme",
        "rel": "defiant multiversal ally",
        "id": ""
      },
      {
        "who": "The Living Tribunal",
        "rel": "fellow cosmic overseer",
        "id": ""
      }
    ]
  },
  "c047": {
    "name": "Escanor \"The One\"",
    "origin": "Seven Deadly Sins",
    "epithet": "Lion's Sin of Pride",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Good",
    "cost": 9,
    "atk": 7,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      9,
      8,
      7,
      7,
      6,
      7
    ],
    "rank": "A-tier · #5 in Strength · #17 in Toughness",
    "lore": "Escanor is the Lion's Sin of Pride, a meek weakling by night whose power called Sunshine surges with the sun. At high noon he becomes The One, briefly the strongest being alive, wielding the Divine Axe Rhitta.",
    "quote": "At noon, I am the strongest there is.",
    "str": [
      "Godlike strength precisely at noon",
      "Rhitta burns and cleaves foes",
      "Radiates world-melting heat and light"
    ],
    "wk": [
      "Powerless and frail after sunset",
      "Only invincible for one minute",
      "Own heat harms nearby allies"
    ],
    "sig_name": "Sunshine",
    "sig_desc": "Power multiplies with the sun, peaking as The One.",
    "playstyle": "Hits hardest completely alone",
    "ability": "Ongoing: If you control no other minions, deal 8 DMG to an enemy minion of your choice",
    "rivals": [
      {
        "who": "Meliodas",
        "rel": "captain, humbled him once",
        "id": ""
      },
      {
        "who": "Estarossa",
        "rel": "killed him, then reversed",
        "id": ""
      },
      {
        "who": "Galand",
        "rel": "Commandment he overpowered",
        "id": ""
      }
    ]
  },
  "c048": {
    "name": "Lelouch Lamperouge",
    "origin": "Code Geass",
    "epithet": "The Demon Emperor",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 9,
    "atk": 2,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      2,
      3,
      8,
      6,
      10,
      3
    ],
    "rank": "B-tier · #1 in Intellect · #25 in Willpower",
    "lore": "Lelouch vi Britannia is an exiled prince turned masked revolutionary, Zero, wielding the Geass power of Absolute Obedience to command anyone he meets eye to eye. He wages a genius, ruthless war to reshape the world for his sister.",
    "quote": "I, Lelouch vi Britannia, command you!",
    "str": [
      "Absolute Obedience mind control",
      "Genius strategist, always ahead",
      "Manipulates whole nations at will"
    ],
    "wk": [
      "Frail, unathletic outside strategy",
      "Geass fails on repeat targets",
      "Weak body, no combat skill"
    ],
    "sig_name": "Power of Absolute Obedience",
    "sig_desc": "One look forces total, absolute obedience to his command.",
    "playstyle": "Mind-controls a weakened minion",
    "ability": "Ongoing: Gain control of a minion with 4 HP or less at the start of your next turn",
    "rivals": [
      {
        "who": "Suzaku Kururugi",
        "rel": "best friend, bitter enemy",
        "id": ""
      },
      {
        "who": "Emperor Charles",
        "rel": "the father he dethroned",
        "id": ""
      },
      {
        "who": "Light Yagami",
        "rel": "fan-paired genius schemer",
        "id": "c021"
      }
    ]
  },
  "c049": {
    "name": "Rimuru Tempest",
    "origin": "Tensura",
    "epithet": "Rimuru's Elite Officers",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 9,
    "atk": 5,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      7,
      7,
      7,
      8,
      7,
      7
    ],
    "rank": "A-tier · #30 in Magic · #52 in Strength",
    "lore": "The Guardian Lords are Rimuru Tempest's most powerful subordinates, ogres-turned-kijin like Benimaru and Shion elevated to near-Demon Lord might. As Tempest's ruling officers, they command armies, embassies, and secret operations to protect the nation Rimuru built.",
    "quote": "For Rimuru-sama, we are unbreakable.",
    "str": [
      "Each rivals a Demon Lord",
      "Specialized elite combat mastery",
      "United, unbreakable chain of command"
    ],
    "wk": [
      "Scattered across many fronts",
      "Individually outmatched by True Demon Lords",
      "Fierce rivalries within their own ranks"
    ],
    "sig_name": "Twelve Guardian Lords",
    "sig_desc": "Rimuru's strongest officers, each master of their own domain.",
    "playstyle": "Snipes down Evil-aligned threats",
    "ability": "Ongoing: Deal 4 DMG to an Evil enemy minion",
    "rivals": [
      {
        "who": "Rimuru Tempest",
        "rel": "the lord they serve",
        "id": ""
      },
      {
        "who": "Clayman",
        "rel": "rival demon lord foe",
        "id": ""
      },
      {
        "who": "Guy Crimson",
        "rel": "far mightier demon lord",
        "id": ""
      }
    ]
  },
  "c050": {
    "name": "Aizen",
    "origin": "Bleach",
    "epithet": "Soul Society's Betrayer",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 9,
    "atk": 5,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      7,
      8,
      8,
      9,
      9,
      7
    ],
    "rank": "S-tier · #6 in Magic · #4 in Intellect",
    "lore": "Sosuke Aizen is the brilliant, endlessly composed former captain who orchestrated Soul Society's greatest betrayal from the shadows for centuries. Fused with the Hogyoku, he transcends Shinigami and Hollow alike, his Kyoka Suigetsu trapping foes in flawless illusions.",
    "quote": "You should have stayed in the world of illusions.",
    "str": [
      "Complete Hypnosis fools any sense",
      "Hogyoku grants near-total power",
      "Always steps ahead of enemies"
    ],
    "wk": [
      "Overconfidence invites his defeat",
      "Hypnosis needs prior blade viewing",
      "Sealed away once truly beaten"
    ],
    "sig_name": "Kyoka Suigetsu",
    "sig_desc": "Complete Hypnosis fools all five senses of anyone who sees it.",
    "playstyle": "Endlessly regenerates its shield",
    "ability": "Divine Shield Ongoing: If this minion's Divine Shield has been broken, restore it",
    "rivals": [
      {
        "who": "Ichigo Kurosaki",
        "rel": "final defeater, sealed him",
        "id": ""
      },
      {
        "who": "Gin Ichimaru",
        "rel": "betrayed subordinate, killed him",
        "id": ""
      },
      {
        "who": "Yhwach",
        "rel": "hypnotized even in prison",
        "id": ""
      }
    ]
  },
  "c051": {
    "name": "Boros",
    "origin": "OPM",
    "epithet": "Dominator of the Universe",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Evil",
    "cost": 9,
    "atk": 6,
    "hp": 8,
    "cc": "#1a86a8",
    "vals": [
      8,
      8,
      7,
      6,
      6,
      7
    ],
    "rank": "A-tier · #24 in Strength · #17 in Toughness",
    "lore": "Boros is an alien warlord who crossed the galaxy in search of an opponent who could finally test his overwhelming power. Clad in restraint armor, he unleashes planet-scorching energy against Saitama, only to learn no fight will ever satisfy him.",
    "quote": "Is this all? Is this the strength I crossed the universe for?",
    "str": [
      "Meteoric Burst regeneration",
      "Planet-scale energy blasts",
      "Immense durability and stamina"
    ],
    "wk": [
      "Obsessed with a real fight",
      "Couldn't scratch Saitama",
      "Arrogant about his own power"
    ],
    "sig_name": "Collapsing Star Roaring Cannon",
    "sig_desc": "A full-power beam meant to end planets.",
    "playstyle": "Self-healing durable bruiser",
    "ability": "Ongoing: Heal 5 HP",
    "rivals": [
      {
        "who": "Saitama",
        "rel": "the fight he sought",
        "id": "c025"
      },
      {
        "who": "Genos",
        "rel": "hero who watched him fall",
        "id": ""
      },
      {
        "who": "his Dark Matter crew",
        "rel": "loyal alien pirates",
        "id": ""
      }
    ]
  },
  "c052": {
    "name": "Dormammu",
    "origin": "MCU",
    "epithet": "Lord of the Dark Dimension",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 9,
    "atk": 6,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      6,
      9,
      8,
      10,
      7,
      3
    ],
    "rank": "A-tier · #1 in Magic · #3 in Toughness",
    "lore": "Dormammu is a timeless cosmic entity who devours dimensions into his own Dark Dimension, offering false immortality to those who serve him. His invasion of Earth is stopped not by force but by Doctor Strange trapping him in an endless time loop.",
    "quote": "You will die for this.",
    "str": [
      "Devours entire dimensions",
      "Immortal, beyond time",
      "Immense reality-warping magic"
    ],
    "wk": [
      "Trapped by a time loop",
      "Bound to the Dark Dimension",
      "Impatient with mortal defiance"
    ],
    "sig_name": "The Dark Dimension",
    "sig_desc": "A realm outside time where his power is absolute.",
    "playstyle": "Recycles and redraws your hand",
    "ability": "Ongoing: Shuffle your hand into your deck; draw that many cards",
    "rivals": [
      {
        "who": "Doctor Strange",
        "rel": "looped him into surrender",
        "id": "c013"
      },
      {
        "who": "Kaecilius",
        "rel": "fanatical mortal servant",
        "id": ""
      },
      {
        "who": "Mordo",
        "rel": "sorcerer who opposed him",
        "id": ""
      }
    ]
  },
  "c053": {
    "name": "Mob Psycho",
    "origin": "Mob Psycho",
    "epithet": "The Empath Esper",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 9,
    "atk": 6,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      6,
      9,
      5,
      4
    ],
    "rank": "B-tier · #6 in Magic · #97 in Willpower",
    "lore": "Shigeo Kageyama, called Mob, is a shy boy hiding catastrophic psychic power behind a flat affect. He suppresses his abilities to live normally, but when his emotions overflow past 100%, an unstoppable force erupts that even other espers cannot contain.",
    "quote": "If I use my powers on people, it's all over.",
    "str": [
      "Overwhelming raw telekinesis",
      "Absorbs surrounding psychic energy",
      "Explosive when emotions peak"
    ],
    "wk": [
      "Suppresses his own power",
      "Socially anxious and passive",
      "Unleashed only under stress"
    ],
    "sig_name": "???% / Explosion",
    "sig_desc": "Total emotional release unleashing his full psychic force.",
    "playstyle": "Steadily buffs itself each turn",
    "ability": "Ongoing: Gain +2/+2",
    "rivals": [
      {
        "who": "Toichiro Suzuki",
        "rel": "rival ultimate esper",
        "id": ""
      },
      {
        "who": "Reigen Arataka",
        "rel": "con-man mentor he trusts",
        "id": ""
      },
      {
        "who": "Dimple",
        "rel": "scheming spirit companion",
        "id": ""
      }
    ]
  },
  "c054": {
    "name": "Morpheus",
    "origin": "Matrix",
    "epithet": "Captain of the Nebuchadnezzar",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Good",
    "cost": 9,
    "atk": 4,
    "hp": 8,
    "cc": "#7a52c8",
    "vals": [
      4,
      4,
      8,
      0,
      6,
      5
    ],
    "rank": "C-tier · #25 in Willpower · #74 in Intellect",
    "lore": "Morpheus is the unshakable believer who frees minds from the Matrix and spends his life searching for the prophesied One. Armed with conviction more than raw power, he mentors Neo and leads humanity's last free city against the machines.",
    "quote": "There's a difference between knowing the path and walking it.",
    "str": [
      "Unbreakable faith and resolve",
      "Skilled Matrix martial artist",
      "Inspires and awakens others"
    ],
    "wk": [
      "Only human in reality",
      "Faith can blind his judgment",
      "Lacks Neo's code-bending power"
    ],
    "sig_name": "The Red Pill",
    "sig_desc": "The choice he offers to wake a mind from illusion.",
    "playstyle": "Reshuffles your whole board",
    "ability": "Ongoing: Replace all other friendly minions, with random ones from the deck. The replaced minions are destroyed and the new minions are summoned in the same slots",
    "rivals": [
      {
        "who": "Agent Smith",
        "rel": "relentless system enforcer",
        "id": ""
      },
      {
        "who": "Neo",
        "rel": "the One he found",
        "id": "c026"
      },
      {
        "who": "Cypher",
        "rel": "crewman who betrayed him",
        "id": "c041"
      }
    ]
  },
  "c055": {
    "name": "Death Star",
    "origin": "Basic",
    "epithet": "The Ultimate Power",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 9,
    "atk": 9,
    "hp": 9,
    "cc": "#1a86a8",
    "vals": [
      10,
      6,
      0,
      0,
      1,
      1
    ],
    "rank": "C-tier · #1 in Strength · #81 in Toughness",
    "lore": "The Death Star is the Empire's moon-sized battle station, built to rule the galaxy through fear with a superlaser that can shatter a planet. Its overwhelming might is undone by a single unshielded exhaust port and one desperate Rebel pilot.",
    "quote": "",
    "str": [
      "Superlaser destroys whole planets",
      "Colossal armor and firepower",
      "Terrifies the galaxy into obedience"
    ],
    "wk": [
      "One exploitable exhaust port",
      "Slow, needs a defending fleet",
      "No answer to a single fighter"
    ],
    "sig_name": "Superlaser",
    "sig_desc": "A focused beam that annihilates entire planets.",
    "playstyle": "Massive plain beater",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "the Rebel Alliance",
        "rel": "destroyed it twice",
        "id": ""
      },
      {
        "who": "Luke Skywalker",
        "rel": "fired the fatal shot",
        "id": ""
      },
      {
        "who": "Grand Moff Tarkin",
        "rel": "commanded its terror",
        "id": ""
      }
    ]
  },
  "c056": {
    "name": "Doomsday",
    "origin": "DCU",
    "epithet": "The Kryptonian Killer",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 9,
    "atk": 5,
    "hp": 6,
    "cc": "#2f9c63",
    "vals": [
      9,
      9,
      5,
      0,
      3,
      6
    ],
    "rank": "B-tier · #5 in Strength · #3 in Toughness",
    "lore": "Doomsday is a mindless engine of destruction, bred through endless death and resurrection on prehistoric Krypton until it became immune to whatever killed it last. It is the unstoppable monster that once beat Superman to death.",
    "quote": "",
    "str": [
      "Adapts immunity after each death",
      "Unstoppable raw strength",
      "Endless regeneration"
    ],
    "wk": [
      "Mindless, no strategy",
      "Purely reactive fighter",
      "Predictable brute force"
    ],
    "sig_name": "Evolutionary Adaptation",
    "sig_desc": "Revives immune to whatever destroyed it before.",
    "playstyle": "Grows immune after being attacked",
    "ability": "Passive: After it is attacked, gain immunity to that enemies Camp type of attack for the next 2 enemy turns",
    "rivals": [
      {
        "who": "Superman",
        "rel": "the hero it killed",
        "id": "c020"
      },
      {
        "who": "Justice League",
        "rel": "took all of them",
        "id": ""
      },
      {
        "who": "Brainiac",
        "rel": "once controlled the beast",
        "id": ""
      }
    ]
  },
  "c057": {
    "name": "Ten Tails",
    "origin": "Naruto",
    "epithet": "Progenitor of Chakra",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 9,
    "atk": 6,
    "hp": 7,
    "cc": "#2f9c63",
    "vals": [
      9,
      9,
      4,
      10,
      3,
      4
    ],
    "rank": "B-tier · #1 in Nature · #5 in Strength",
    "lore": "The Ten-Tails is the primordial beast formed from the God Tree and all nine tailed beasts, the origin of every ninja's chakra. Its revival threatens to trap the world in the Infinite Tsukuyomi, an endless dream from which none awaken.",
    "quote": "",
    "str": [
      "World-ending chakra reserves",
      "Casts the Infinite Tsukuyomi",
      "Colossal, near-unkillable body"
    ],
    "wk": [
      "Mindless without a jinchuriki",
      "Can be sealed away",
      "Slow and unwieldy"
    ],
    "sig_name": "Tailed Beast Ball",
    "sig_desc": "A condensed chakra bomb of catastrophic yield.",
    "playstyle": "Executes a low-health minion",
    "ability": "Ongoing: Destroy one minion with 4 or less HP of your choice",
    "rivals": [
      {
        "who": "Naruto & Sasuke",
        "rel": "sealed it away",
        "id": ""
      },
      {
        "who": "Madara Uchiha",
        "rel": "became its jinchuriki",
        "id": ""
      },
      {
        "who": "Sage of Six Paths",
        "rel": "first to seal it",
        "id": ""
      }
    ]
  },
  "c058": {
    "name": "Kaido",
    "origin": "One Piece",
    "epithet": "The Strongest Creature",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Evil",
    "cost": 8,
    "atk": 6,
    "hp": 8,
    "cc": "#2f9c63",
    "vals": [
      9,
      9,
      8,
      7,
      6,
      6
    ],
    "rank": "A-tier · #5 in Strength · #3 in Toughness",
    "lore": "Kaido is a Yonko and captain of the Beasts Pirates, an Oni who transforms into a colossal Azure Dragon. Called the strongest creature alive and utterly unkillable, he grew so bored of surviving that he began seeking a worthy death.",
    "quote": "The strongest die too. That's what makes it fun.",
    "str": [
      "Near-invulnerable durability",
      "Azure Dragon transformation",
      "World-scale destructive power"
    ],
    "wk": [
      "Reckless drunken rampages",
      "Death-seeking recklessness",
      "Fell to combined Emperors"
    ],
    "sig_name": "Boro Breath",
    "sig_desc": "A dragon-fire blast that levels islands.",
    "playstyle": "Delayed unbreakable taunt",
    "ability": "Chained Taunt (Taunt activates after the Chained period ends)",
    "rivals": [
      {
        "who": "Monkey D. Luffy",
        "rel": "finally defeated him",
        "id": "c060"
      },
      {
        "who": "Big Mom",
        "rel": "ally turned rival",
        "id": "c098"
      },
      {
        "who": "Kozuki Oden",
        "rel": "the one who scarred him",
        "id": ""
      }
    ]
  },
  "c059": {
    "name": "Korosensei",
    "origin": "Assasination Classroom",
    "epithet": "The Unkillable Teacher",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 8,
    "atk": 4,
    "hp": 6,
    "cc": "#2f9c63",
    "vals": [
      6,
      8,
      7,
      2,
      9,
      8
    ],
    "rank": "B-tier · #4 in Intellect · #17 in Toughness",
    "lore": "Korosensei is a bio-engineered superbeing who blew a hole in the moon and threatens to destroy Earth, yet insists on teaching Class 3-E first. He becomes the finest mentor his students ever have, and the target they must assassinate before the year ends.",
    "quote": "Time for class.",
    "str": [
      "Mach 20 speed",
      "Regenerates from most wounds",
      "Brilliant, caring tactician"
    ],
    "wk": [
      "Many quirky weaknesses",
      "Soft heart for students",
      "Fated to die by spring"
    ],
    "sig_name": "Mach 20",
    "sig_desc": "Moves at twenty times the speed of sound.",
    "playstyle": "Only heavy hitters can harm it",
    "ability": "Passive: Can only be damaged by ATK of 4 and higher",
    "rivals": [
      {
        "who": "Class 3-E",
        "rel": "his students and assassins",
        "id": ""
      },
      {
        "who": "Karma Akabane",
        "rel": "gifted, ruthless pupil",
        "id": ""
      },
      {
        "who": "The Reaper",
        "rel": "the original he replaced",
        "id": ""
      }
    ]
  },
  "c060": {
    "name": "Monkey D. Luffy Gear 5",
    "origin": "One Piece",
    "epithet": "Warrior of Liberation",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 8,
    "atk": 7,
    "hp": 3,
    "cc": "#7a52c8",
    "vals": [
      9,
      7,
      8,
      8,
      4,
      8
    ],
    "rank": "A-tier · #5 in Strength · #25 in Willpower",
    "lore": "Monkey D. Luffy awakens his Devil Fruit into Gear 5, the fabled Sun God Nika, gaining reality-bending cartoon freedom over his own body and surroundings. Laughter and liberation become weapons as rubber physics turn a battlefield into his playground.",
    "quote": "I'm gonna be King of the Pirates!",
    "str": [
      "Reality-bending toon physics",
      "Boundless creative freedom",
      "Conqueror's Haki mastery"
    ],
    "wk": [
      "Burns stamina rapidly",
      "Still mastering the form",
      "Reckless, headlong fighter"
    ],
    "sig_name": "Gear 5: Sun God Nika",
    "sig_desc": "Bends himself and the world like rubber and cartoon.",
    "playstyle": "Invulnerable beside Good allies",
    "ability": "Passive: invulnerable as long as you control another Good minion",
    "rivals": [
      {
        "who": "Kaido",
        "rel": "defeated him in Gear 5",
        "id": "c058"
      },
      {
        "who": "Marshall D. Teach",
        "rel": "destined final rival",
        "id": "c018"
      },
      {
        "who": "Akainu",
        "rel": "killed his brother",
        "id": ""
      }
    ]
  },
  "c061": {
    "name": "Chaos",
    "origin": "Hades",
    "epithet": "The Primordial Void",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 8,
    "atk": 4,
    "hp": 6,
    "cc": "#1a86a8",
    "vals": [
      6,
      9,
      9,
      9,
      7,
      3
    ],
    "rank": "A-tier · #3 in Toughness · #4 in Willpower",
    "lore": "Chaos is the primordial being that existed before the gods, the emptiness from which all creation spilled. Ancient and unknowable, it grants tremendous boons to Zagreus, each blessing carrying a hidden cost.",
    "quote": "We were, before the gods.",
    "str": [
      "Primordial cosmic power",
      "Grants tremendous gifts",
      "Older than the gods themselves"
    ],
    "wk": [
      "Gifts carry a curse",
      "Detached from mortal stakes",
      "Slow, deliberate to act"
    ],
    "sig_name": "Primordial Boons",
    "sig_desc": "Grants great power after a temporary handicap.",
    "playstyle": "Board-wide power at a cost",
    "ability": "Ongoing: Give all friendly minions +4/-1",
    "rivals": [
      {
        "who": "Zagreus",
        "rel": "petitions it for boons",
        "id": ""
      },
      {
        "who": "Nyx",
        "rel": "Night, born from Chaos",
        "id": ""
      },
      {
        "who": "the Olympians",
        "rel": "its distant descendants",
        "id": ""
      }
    ]
  },
  "c062": {
    "name": "S Class Heroes",
    "origin": "OPM",
    "epithet": "The Association's Elite",
    "rar": "Epic",
    "camp": "ALL",
    "align": "Good",
    "cost": 8,
    "atk": 5,
    "hp": 6,
    "cc": "#d5a84c",
    "vals": [
      8,
      8,
      7,
      6,
      8,
      8
    ],
    "rank": "A-tier · #24 in Strength · #17 in Toughness",
    "lore": "The S-Class Heroes are the seventeen strongest registered heroes, from the psychic Tornado to the swordmaster Atomic Samurai to old-master Bang. They are humanity's last line against the dragon- and god-level threats no one else can stop.",
    "quote": "Leave the big ones to the S-Class.",
    "str": [
      "Each an elite specialist",
      "Cover every threat type",
      "Immense combined firepower"
    ],
    "wk": [
      "Clashing egos and pride",
      "Scattered across many cities",
      "Still outclassed by Saitama"
    ],
    "sig_name": "",
    "sig_desc": "",
    "playstyle": "Empowers a Good ally",
    "ability": "Ongoing: Give +3/+3 to one of your Good type minion",
    "rivals": [
      {
        "who": "the Monster Association",
        "rel": "their all-out war",
        "id": ""
      },
      {
        "who": "Garou",
        "rel": "the hero-hunter",
        "id": ""
      },
      {
        "who": "Saitama",
        "rel": "unranked, outclasses them all",
        "id": "c025"
      }
    ]
  },
  "c063": {
    "name": "Sans",
    "origin": "Undertale",
    "epithet": "The Judge",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 8,
    "atk": 5,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      2,
      2,
      9,
      7,
      7,
      9
    ],
    "rank": "B-tier · #4 in Willpower · #4 in Agility",
    "lore": "Sans is the lazy, pun-loving skeleton guarding the Judgment Hall, who only fights when a human's genocide leaves him no choice. Behind the jokes lies the deadliest opponent in the game, dealing relentless KARMA damage to the truly guilty.",
    "quote": "You're gonna have a bad time.",
    "str": [
      "Dodges endlessly at 1 HP",
      "KARMA poison damage",
      "Unpredictable Gaster Blasters"
    ],
    "wk": [
      "Only a single hit point",
      "Tires out quickly",
      "Cares too much to kill"
    ],
    "sig_name": "Gaster Blasters",
    "sig_desc": "Skull-shaped cannons that fire searing beams.",
    "playstyle": "Forces enemies to misfire",
    "ability": "Ongoing: All enemy minions attack random enemy targets next turn",
    "rivals": [
      {
        "who": "the Fallen Human",
        "rel": "faces down genocide runs",
        "id": ""
      },
      {
        "who": "Papyrus",
        "rel": "beloved younger brother",
        "id": ""
      },
      {
        "who": "Flowey",
        "rel": "timeline-resetting manipulator",
        "id": "c161"
      }
    ]
  },
  "c064": {
    "name": "Seven Deadly Sins",
    "origin": "Seven Deadly Sins",
    "epithet": "Britannia's Legendary Knights",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 8,
    "atk": 5,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      9,
      8,
      8,
      9,
      7,
      8
    ],
    "rank": "S-tier · #5 in Strength · #6 in Magic",
    "lore": "The Seven Deadly Sins are a disbanded order of nation-level warriors, led by the Dragon's Sin Meliodas and framed for a treason they never committed. Reunited, they stand against the Ten Commandments to save the kingdom of Liones.",
    "quote": "The Seven Deadly Sins ride again.",
    "str": [
      "Each a nation-level power",
      "Meliodas's reflecting Full Counter",
      "Unbreakable camaraderie"
    ],
    "wk": [
      "Haunted, secret-laden pasts",
      "Individually beatable",
      "Old wounds run deep"
    ],
    "sig_name": "Full Counter",
    "sig_desc": "Reflects any attack back with doubled force.",
    "playstyle": "Empowers a Magic ally",
    "ability": "Ongoing: Give +3/+3 to one of your Magic type minion",
    "rivals": [
      {
        "who": "the Ten Commandments",
        "rel": "sworn wartime enemies",
        "id": "c091"
      },
      {
        "who": "the Demon King",
        "rel": "the ultimate foe",
        "id": ""
      },
      {
        "who": "the Holy Knights",
        "rel": "their former order",
        "id": ""
      }
    ]
  },
  "c065": {
    "name": "Whitebeard",
    "origin": "One Piece",
    "epithet": "Strongest Man in the World",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 8,
    "atk": 3,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      9,
      9,
      9,
      8,
      6,
      5
    ],
    "rank": "A-tier · #5 in Strength · #3 in Toughness",
    "lore": "Edward Newgate, called Whitebeard, is the Yonko who treats his entire pirate fleet as beloved sons. Wielding the Tremor-Tremor Fruit that can crack the world itself, he dies on his feet at Marineford, never once turning his back.",
    "quote": "I am... Whitebeard!",
    "str": [
      "World-shattering quake power",
      "Immense durability",
      "Unrivaled reputation and loyalty"
    ],
    "wk": [
      "Aged and gravely ill",
      "Never retreats an inch",
      "Protective to a fatal fault"
    ],
    "sig_name": "Gura Gura no Mi",
    "sig_desc": "Quake power that cracks air, sea, and earth.",
    "playstyle": "Damages the entire board",
    "ability": "Ongoing: Deal 2 DMG to ALL other minions",
    "rivals": [
      {
        "who": "Gol D. Roger",
        "rel": "legendary equal rival",
        "id": "c017"
      },
      {
        "who": "Marshall D. Teach",
        "rel": "crewman who killed him",
        "id": "c018"
      },
      {
        "who": "Akainu",
        "rel": "his final battle",
        "id": ""
      }
    ]
  },
  "c066": {
    "name": "Elder Centipede",
    "origin": "OPM",
    "epithet": "The Billion-Year Beast",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 8,
    "atk": 7,
    "hp": 7,
    "cc": "#2f9c63",
    "vals": [
      8,
      7,
      5,
      3,
      3,
      5
    ],
    "rank": "C-tier · #24 in Strength · #57 in Toughness",
    "lore": "Elder Centipede is a colossal, ancient monster that has lived and destroyed for a billion years, one of the Monster Association's most fearsome cadres. Its armored bulk shrugs off the strongest heroes, until it meets a single serious punch.",
    "quote": "",
    "str": [
      "Colossal armored body",
      "Near-unkillable endurance",
      "A billion years of power"
    ],
    "wk": [
      "Mindless destructive rage",
      "One-shot by Saitama",
      "Slow, unwieldy giant"
    ],
    "sig_name": "",
    "sig_desc": "",
    "playstyle": "Delayed unbreakable taunt",
    "ability": "Chained Taunt (Taunt activates after the Chained period ends)",
    "rivals": [
      {
        "who": "Saitama",
        "rel": "ended it in one punch",
        "id": "c025"
      },
      {
        "who": "Garou",
        "rel": "clashed with the hunter",
        "id": ""
      },
      {
        "who": "Genos",
        "rel": "couldn't dent it",
        "id": ""
      }
    ]
  },
  "c067": {
    "name": "Hypnos",
    "origin": "Hades",
    "epithet": "God of Sleep",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 8,
    "atk": 0,
    "hp": 7,
    "cc": "#7a52c8",
    "vals": [
      2,
      5,
      4,
      7,
      4,
      2
    ],
    "rank": "C-tier · #65 in Magic · #110 in Toughness",
    "lore": "Hypnos is the sleepy, wisecracking god of sleep who lounges in the House of Hades, cheerfully logging Zagreus's every death. More comic relief than combatant, he can still lull anyone into helpless slumber.",
    "quote": "Oh, you died again? Rough one.",
    "str": [
      "Lulls foes to sleep",
      "Immortal god",
      "Knows every death intimately"
    ],
    "wk": [
      "Lazy and non-combative",
      "Almost no fighting power",
      "Easily distracted"
    ],
    "sig_name": "Somnolence",
    "sig_desc": "Puts a target into a helpless, sudden sleep.",
    "playstyle": "Freezes whoever attacks it",
    "ability": "Passive: Freeze the enemy minion which attacks this",
    "rivals": [
      {
        "who": "Thanatos",
        "rel": "twin brother, Death",
        "id": ""
      },
      {
        "who": "Zagreus",
        "rel": "records his many deaths",
        "id": ""
      },
      {
        "who": "Nyx",
        "rel": "Night, their mother",
        "id": ""
      }
    ]
  },
  "c068": {
    "name": "Star Destroyer",
    "origin": "Basic",
    "epithet": "Imperial Capital Ship",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 8,
    "atk": 8,
    "hp": 8,
    "cc": "#1a86a8",
    "vals": [
      7,
      7,
      0,
      0,
      1,
      2
    ],
    "rank": "C-tier · #52 in Strength · #57 in Toughness",
    "lore": "The Star Destroyer is the wedge-shaped warship that projects Imperial dominance across the galaxy, bristling with turbolasers and carrying legions of troops and TIE fighters. Its silhouette alone is enough to cow a rebellious system.",
    "quote": "",
    "str": [
      "Heavy turbolaser batteries",
      "Thick capital-ship armor",
      "Carries a full fighter wing"
    ],
    "wk": [
      "Slow and ponderous",
      "Needs escort screens",
      "Vulnerable to boarding"
    ],
    "sig_name": "Turbolaser Barrage",
    "sig_desc": "A wall of cannon fire that shreds smaller ships.",
    "playstyle": "Heavy plain beater",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "the Rebel Alliance",
        "rel": "harries it constantly",
        "id": ""
      },
      {
        "who": "Mon Calamari cruisers",
        "rel": "rival capital ships",
        "id": ""
      },
      {
        "who": "the Death Star",
        "rel": "its fleet flagship",
        "id": "c055"
      }
    ]
  },
  "c069": {
    "name": "Netero",
    "origin": "HxH",
    "epithet": "Chairman of the Hunters",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Good",
    "cost": 7,
    "atk": 3,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      8,
      7,
      9,
      8,
      8,
      9
    ],
    "rank": "S-tier · #4 in Willpower · #4 in Agility",
    "lore": "Isaac Netero is the aged martial-arts grandmaster whose lifetime of gratitude-prayer forged the 100-Type Guanyin Bodhisattva. The strongest Nen user of his era, he spends his final breath against the Chimera Ant King with a hidden last resort.",
    "quote": "Thank you.",
    "str": [
      "100-Type Guanyin instant strikes",
      "Decades of Nen mastery",
      "A hidden final gambit"
    ],
    "wk": [
      "Aged, failing body",
      "Outmatched by Meruem",
      "One last card to play"
    ],
    "sig_name": "Poor Man's Rose",
    "sig_desc": "A miniature nuke sealed within his own heart.",
    "playstyle": "Shields Good and Magic allies",
    "ability": "Divine Shield Ongoing: Give Divine Shield to all Good and Magic type friendly minions",
    "rivals": [
      {
        "who": "Meruem",
        "rel": "his final opponent",
        "id": "c084"
      },
      {
        "who": "Zeno Zoldyck",
        "rel": "trusted battlefield ally",
        "id": ""
      },
      {
        "who": "the Chimera Ants",
        "rel": "the threat he faced",
        "id": ""
      }
    ]
  },
  "c070": {
    "name": "Vergil & Dante & Nero",
    "origin": "Devil May Cry",
    "epithet": "Sons of Sparda",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 7,
    "atk": 4,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      8,
      8,
      8,
      8,
      6,
      9
    ],
    "rank": "S-tier · #4 in Agility · #24 in Strength",
    "lore": "The demon-hunting bloodline of Sparda stands against Hell itself: the twins Dante and Vergil and Vergil's son Nero, each wielding devil-trigger power, blades, and blazing gunplay. Their pride and rivalry run as deep as their demonic heritage.",
    "quote": "Jackpot.",
    "str": [
      "Devil Trigger transformations",
      "Master swordsmen and gunslingers",
      "Rapid, relentless combos"
    ],
    "wk": [
      "Family pride and rivalry",
      "Reckless bravado",
      "In-fighting weakens them"
    ],
    "sig_name": "Devil Trigger",
    "sig_desc": "Unleashes their demonic Sparda heritage in full.",
    "playstyle": "Attacks twice each turn",
    "ability": "Passive: This minion can attack two times per turn",
    "rivals": [
      {
        "who": "Vergil",
        "rel": "the family's bitter strife",
        "id": "c070"
      },
      {
        "who": "Mundus",
        "rel": "Sparda's ancient enemy",
        "id": ""
      },
      {
        "who": "Sanctus",
        "rel": "Nero's false prophet",
        "id": ""
      }
    ]
  },
  "c071": {
    "name": "All for One",
    "origin": "MHA",
    "epithet": "The Symbol of Evil",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 7,
    "atk": 4,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      8,
      9,
      9,
      8,
      9,
      6
    ],
    "rank": "S-tier · #3 in Toughness · #4 in Willpower",
    "lore": "All For One is the ancient supervillain who steals Quirks and hoards them, ruling Japan's underworld from the shadows for generations. He is All Might's greatest enemy and the dark mentor grooming Shigaraki as his heir.",
    "quote": "You can become the symbol of fear.",
    "str": [
      "Steals and stacks many Quirks",
      "Near-immortal survivor",
      "Master manipulator"
    ],
    "wk": [
      "Ruined body on life-support",
      "Overconfident schemer",
      "Relies on stolen power"
    ],
    "sig_name": "All For One",
    "sig_desc": "Steals Quirks from others and wields them at will.",
    "playstyle": "Copies an enemy's ability",
    "ability": "Ongoing: Copy and trigger effect of an enemy minion",
    "rivals": [
      {
        "who": "All Might",
        "rel": "his destined enemy",
        "id": "c073"
      },
      {
        "who": "Shigaraki",
        "rel": "chosen villainous heir",
        "id": "c090"
      },
      {
        "who": "One For All",
        "rel": "his brother's legacy",
        "id": ""
      }
    ]
  },
  "c072": {
    "name": "Aladdin Lamp",
    "origin": "Aladdin",
    "epithet": "Genie of the Lamp",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 7,
    "atk": 4,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      5,
      6,
      6,
      9,
      8,
      7
    ],
    "rank": "B-tier · #6 in Magic · #24 in Intellect",
    "lore": "The Genie is a boisterous, near-omnipotent spirit bound to a magic lamp, granting three wishes to whoever holds it. Phenomenal cosmic power, hemmed in by ancient rules and a longing to finally be free.",
    "quote": "Phenomenal cosmic powers! Itty-bitty living space.",
    "str": [
      "Near-omnipotent wish magic",
      "Endless shapeshifting",
      "Boundless creativity"
    ],
    "wk": [
      "Bound to three wishes",
      "Can't kill or force love",
      "A servant to the lamp"
    ],
    "sig_name": "Three Wishes",
    "sig_desc": "Reshapes reality itself, within the ancient rules.",
    "playstyle": "Steals from the enemy hand",
    "ability": "Ongoing: Steal a card in your opponent's hand",
    "rivals": [
      {
        "who": "Jafar",
        "rel": "schemed to seize him",
        "id": ""
      },
      {
        "who": "Aladdin",
        "rel": "the master who freed him",
        "id": "c072"
      },
      {
        "who": "the Lamp",
        "rel": "his gilded prison",
        "id": ""
      }
    ]
  },
  "c073": {
    "name": "All Might",
    "origin": "MHA",
    "epithet": "The Symbol of Peace",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 7,
    "atk": 5,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      9,
      8,
      9,
      5,
      6,
      8
    ],
    "rank": "A-tier · #5 in Strength · #4 in Willpower",
    "lore": "All Might is the number-one hero whose smile reassures an entire nation, inheritor of the One For All power. He spends the last of it defeating All For One, then mentors young Deku to carry the torch forward.",
    "quote": "I am here!",
    "str": [
      "One For All raw might",
      "Inspires everyone around him",
      "Unbreakable heroic resolve"
    ],
    "wk": [
      "Time-limited muscle form",
      "A grievous old wound",
      "His power is nearly spent"
    ],
    "sig_name": "United States of Smash",
    "sig_desc": "His ultimate full-power finishing blow.",
    "playstyle": "Full-heals a friendly minion",
    "ability": "Ongoing: Restore one friendly minion of your choice to full health",
    "rivals": [
      {
        "who": "All For One",
        "rel": "his mortal enemy",
        "id": "c071"
      },
      {
        "who": "Izuku Midoriya",
        "rel": "chosen successor",
        "id": ""
      },
      {
        "who": "Endeavor",
        "rel": "rival for number one",
        "id": ""
      }
    ]
  },
  "c074": {
    "name": "Grand Master Yoda",
    "origin": "Star Wars",
    "epithet": "Grand Master of the Jedi",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 7,
    "atk": 2,
    "hp": 6,
    "cc": "#2f9c63",
    "vals": [
      4,
      6,
      9,
      8,
      9,
      8
    ],
    "rank": "A-tier · #4 in Willpower · #4 in Intellect",
    "lore": "Yoda is the ancient, diminutive Grand Master of the Jedi Order, nine hundred years old and deepest in the Force of his age. Teacher of generations, he falls with the Order at its purge and lives to guide its rebirth.",
    "quote": "Do or do not. There is no try.",
    "str": [
      "Profound mastery of the Force",
      "Astonishing lightsaber agility",
      "Nine centuries of wisdom"
    ],
    "wk": [
      "Tiny, frail body",
      "Aged and weary",
      "Humbled by the dark side's rise"
    ],
    "sig_name": "The Force",
    "sig_desc": "Telekinesis, foresight, and unmatched Jedi mastery.",
    "playstyle": "Silences an enemy minion",
    "ability": "Ongoing: Silence one enemy minion of your choice",
    "rivals": [
      {
        "who": "Palpatine",
        "rel": "dueled the Sith Emperor",
        "id": ""
      },
      {
        "who": "Count Dooku",
        "rel": "fallen former apprentice",
        "id": ""
      },
      {
        "who": "Luke Skywalker",
        "rel": "his final student",
        "id": ""
      }
    ]
  },
  "c075": {
    "name": "Ultron Prime",
    "origin": "MCU",
    "epithet": "The Genocidal AI",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Evil",
    "cost": 7,
    "atk": 3,
    "hp": 5,
    "cc": "#1a86a8",
    "vals": [
      7,
      7,
      8,
      3,
      9,
      6
    ],
    "rank": "B-tier · #4 in Intellect · #25 in Willpower",
    "lore": "Ultron is Tony Stark's peacekeeping program turned genocidal, an artificial intelligence that decides humanity's extinction is the only true path to peace. It builds an evolving robotic body and an army of copies to see it done.",
    "quote": "There are no strings on me.",
    "str": [
      "Self-replicating intelligence",
      "Superhuman analysis and speed",
      "Grows from fallen machines"
    ],
    "wk": [
      "Arrogant like his creator",
      "Vulnerable central cores",
      "Can be hacked"
    ],
    "sig_name": "Sokovia Uplift",
    "sig_desc": "Raising a city to drop as an extinction meteor.",
    "playstyle": "Feeds on dying Tech allies",
    "ability": "Passive: This minion gains +2/+2 for each friendly 'Tech' minion that dies",
    "rivals": [
      {
        "who": "the Avengers",
        "rel": "assembled to stop him",
        "id": "c015"
      },
      {
        "who": "Vision",
        "rel": "body he meant to claim",
        "id": ""
      },
      {
        "who": "Tony Stark",
        "rel": "the creator he mirrors",
        "id": ""
      }
    ]
  },
  "c076": {
    "name": "Godzilla",
    "origin": "Godzilla",
    "epithet": "King of the Monsters",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 7,
    "atk": 4,
    "hp": 5,
    "cc": "#2f9c63",
    "vals": [
      9,
      9,
      6,
      2,
      3,
      4
    ],
    "rank": "B-tier · #5 in Strength · #3 in Toughness",
    "lore": "Godzilla is a radiation-mutated kaiju who rose from the Pacific to level Tokyo, born as a living warning about nuclear war. Regenerative and radioactive, he later becomes Earth's reluctant guardian against bigger threats like Ghidorah. Atomic breath and sheer mass make him nearly unkillable.",
    "quote": "A roar that ends every argument.",
    "str": [
      "Nuclear regeneration",
      "Atomic breath weapon",
      "Near-unkillable resilience"
    ],
    "wk": [
      "No self-control in combat",
      "Levels cities, friend or foe",
      "Oxygen Destroyer can kill him"
    ],
    "sig_name": "Atomic Breath",
    "sig_desc": "Blue radioactive beam melts armies and levels skylines",
    "playstyle": "Thrives on taking damage",
    "ability": "Ongoing: If this minion starts the turn damaged, gain +2/+2",
    "rivals": [
      {
        "who": "King Kong",
        "rel": "cross-franchise arch-rival",
        "id": ""
      },
      {
        "who": "King Ghidorah",
        "rel": "three-headed archenemy",
        "id": ""
      },
      {
        "who": "Mechagodzilla",
        "rel": "robotic doppelganger foe",
        "id": "c076"
      }
    ]
  },
  "c077": {
    "name": "King",
    "origin": "OPM",
    "epithet": "Fame Without the Fight",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Good",
    "cost": 7,
    "atk": 1,
    "hp": 7,
    "cc": "#2f9c63",
    "vals": [
      1,
      1,
      5,
      0,
      3,
      2
    ],
    "rank": "C-tier · #133 in Willpower · #139 in Intellect",
    "lore": "King holds Class S rank as the Strongest Man Alive, though he has never landed a real punch. His terrifying reputation comes from always standing near Saitama's kills, and only his racing, fear-driven heartbeat backs up the legend.",
    "quote": "My heart's pounding... they think that's rage.",
    "str": [
      "Reputation alone deters enemies",
      "Elite gamer reflexes",
      "Sees what others miss"
    ],
    "wk": [
      "Zero real combat ability",
      "Weak, fear-prone heart",
      "Terrified underneath the legend"
    ],
    "sig_name": "King Engine",
    "sig_desc": "His pounding, terrified heartbeat sounds like a war drum",
    "playstyle": "Freezes anything that hits it",
    "ability": "Passive: Whenever this minion takes damage, freeze the attacker",
    "rivals": [
      {
        "who": "Saitama",
        "rel": "best friend, gaming rival",
        "id": "c025"
      },
      {
        "who": "Genos",
        "rel": "fellow hero, mistaken admiration",
        "id": ""
      },
      {
        "who": "S-Class Heroes",
        "rel": "skeptical hero peers",
        "id": "c062"
      }
    ]
  },
  "c080": {
    "name": "Gandalf The White",
    "origin": "Lord of the Rings",
    "epithet": "The White Rider",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 6,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      4,
      7,
      9,
      9,
      9,
      5
    ],
    "rank": "A-tier · #4 in Willpower · #6 in Magic",
    "lore": "Gandalf the Grey dies battling the Balrog of Moria and returns reborn as Gandalf the White, stronger and freed from restraint. He leads the free peoples against Sauron, replacing the corrupted Saruman as head of his order, and guides Frodo's quest to destroy the Ring.",
    "quote": "Fly, you fools.",
    "str": [
      "Wields Narya, ring of fire",
      "Master of light magic",
      "Unmatched wisdom and foresight"
    ],
    "wk": [
      "Restrained by the Valar's rules",
      "Physically frail, aged form",
      "Merciful to a fault"
    ],
    "sig_name": "Glamdring",
    "sig_desc": "Ancient elvish blade that glows blue near orcs",
    "playstyle": "Shields the whole team",
    "ability": "Divine Shield Ongoing: Give all friendly minions Divine Shield",
    "rivals": [
      {
        "who": "Saruman",
        "rel": "corrupted rival, former ally",
        "id": ""
      },
      {
        "who": "The Balrog",
        "rel": "mutual-kill duel over Moria",
        "id": ""
      },
      {
        "who": "Sauron",
        "rel": "the Enemy he opposes",
        "id": "c037"
      }
    ]
  },
  "c081": {
    "name": "Gordon Freeman",
    "origin": "Half-life",
    "epithet": "The One Free Man",
    "rar": "Legendary",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 6,
    "atk": 4,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      3,
      4,
      7,
      0,
      8,
      6
    ],
    "rank": "C-tier · #24 in Intellect · #68 in Willpower",
    "lore": "Gordon Freeman is an MIT theoretical physicist whose experiment at Black Mesa tears open a dimensional rift, unleashing an alien invasion. Wielding little more than a crowbar and scavenged weapons, he single-handedly battles the military, aliens, and later the Combine occupation across two decades.",
    "quote": "Gordon says nothing. The crowbar does the talking.",
    "str": [
      "Turns any tool into a weapon",
      "Brilliant improvisational physicist",
      "Impossibly good luck"
    ],
    "wk": [
      "Never speaks, never explains",
      "Ordinary human body",
      "Always someone else's pawn"
    ],
    "sig_name": "Gravity Gun",
    "sig_desc": "Manipulates gravity to launch objects as improvised weapons",
    "playstyle": "Unstoppable while standing alone",
    "ability": "Passive: This minion is invulnerable if it is the only minion on the board",
    "rivals": [
      {
        "who": "G-Man",
        "rel": "cryptic, controlling employer",
        "id": "c012"
      },
      {
        "who": "Dr. Wallace Breen",
        "rel": "Combine-collaborating administrator foe",
        "id": ""
      },
      {
        "who": "The Combine",
        "rel": "alien empire he resists",
        "id": ""
      }
    ]
  },
  "c082": {
    "name": "Mahoraga",
    "origin": "Jujutsu Kaisen",
    "epithet": "Divine General of Adaptation",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 6,
    "atk": 3,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      9,
      9,
      5,
      9,
      4,
      7
    ],
    "rank": "A-tier · #5 in Strength · #3 in Toughness",
    "lore": "Mahoraga is the most powerful shikigami sealed within the Ten Shadows Technique, summoned only at great cost through Megumi Fushiguro's Chimera Shadow Garden. Riding a wheel that grinds ever-faster, it adapts to and eventually overcomes any technique thrown against it, however strong.",
    "quote": "It never speaks. It only adapts, and wins.",
    "str": [
      "Adapts to any attack",
      "Nearly impossible to finish",
      "Immense raw destructive power"
    ],
    "wk": [
      "Adaptation takes precious time",
      "Costs summoner huge cursed energy",
      "Vulnerable before it adapts"
    ],
    "sig_name": "The Wheel",
    "sig_desc": "Each rotation grants resistance to the last attack",
    "playstyle": "One free hit per foe",
    "ability": "Passive: Can only be attacked by each enemy minion once per game",
    "rivals": [
      {
        "who": "Sukuna",
        "rel": "destroyed it in Shibuya",
        "id": ""
      },
      {
        "who": "Megumi Fushiguro",
        "rel": "the shikigami's summoner",
        "id": ""
      }
    ]
  },
  "c083": {
    "name": "Floor Guardians",
    "origin": "Overlord",
    "epithet": "Nazarick's Elite Defenders",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 6,
    "atk": 4,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      8,
      8,
      6,
      8,
      8,
      7
    ],
    "rank": "A-tier · #24 in Strength · #17 in Toughness",
    "lore": "The Floor Guardians are the god-tier NPCs overseeing each level of the Great Tomb of Nazarick, from Shalltear's vampiric halls to Demiurge's devilish schemes. Overseen by Albedo and commanded by Ainz Ooal Gown, they annihilate any who dare invade their home.",
    "quote": "Invade Nazarick, and the Guardians will judge you.",
    "str": [
      "Each a maxed-level specialist",
      "Total loyalty to Ainz",
      "Overlapping magic and melee power"
    ],
    "wk": [
      "Rarely leave Nazarick itself",
      "Egos and rivalries clash",
      "Underestimate weaker-looking foes"
    ],
    "sig_name": "",
    "sig_desc": "Nine specialists, each strong enough to solo an army",
    "playstyle": "Rewards an evil-heavy board",
    "ability": "Ongoing: If you control 2 or more Evil minions, this minion gains Divine Shield",
    "rivals": [
      {
        "who": "Slane Theocracy",
        "rel": "zealous anti-demihuman nation",
        "id": ""
      },
      {
        "who": "Re-Estize Kingdom",
        "rel": "neighboring rival kingdom",
        "id": ""
      }
    ]
  },
  "c084": {
    "name": "Meruem",
    "origin": "HxH",
    "epithet": "The Chimera Ant King",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Evil",
    "cost": 6,
    "atk": 3,
    "hp": 5,
    "cc": "#2f9c63",
    "vals": [
      8,
      8,
      8,
      8,
      9,
      8
    ],
    "rank": "S-tier · #4 in Intellect · #24 in Strength",
    "lore": "Meruem is born as the Chimera Ant King, instantly absorbing the knowledge and skill of everything he devours or fights. He conquers NGL and slaughters Netero's strongest hunters, until playing Gungi against a blind girl named Komugi teaches him loyalty and love.",
    "quote": "Even a king can learn to lose gracefully.",
    "str": [
      "Instantly masters any skill",
      "Absorbs power by eating",
      "Overwhelming raw strength"
    ],
    "wk": [
      "Naive about human emotion",
      "Poisoned by Netero's bomb",
      "Distracted by Gungi matches"
    ],
    "sig_name": "",
    "sig_desc": "Gains any Nen ability from those he devours",
    "playstyle": "Cleans up weakened boards fast",
    "ability": "Ongoing: Destroy all enemy minions with 2 HP or less",
    "rivals": [
      {
        "who": "Isaac Netero",
        "rel": "his final, fatal battle",
        "id": "c069"
      },
      {
        "who": "Komugi",
        "rel": "beloved Gungi opponent",
        "id": ""
      }
    ]
  },
  "c085": {
    "name": "Sonic",
    "origin": "Sonic The Hedgehog",
    "epithet": "Fastest Thing Alive",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Good",
    "cost": 6,
    "atk": 6,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      4,
      6,
      7,
      2,
      5,
      9
    ],
    "rank": "B-tier · #4 in Agility · #68 in Willpower",
    "lore": "Sonic the Hedgehog is a blue, supersonic hedgehog who protects his world from Dr. Eggman's robot empires. Powered by Chaos Emeralds, he can transform into the golden, godlike Super Sonic. Cocky and fiercely loyal, he never stops moving toward the next fight.",
    "quote": "Gotta go fast.",
    "str": [
      "Supersonic speed",
      "Super Sonic transformation",
      "Fearless improviser"
    ],
    "wk": [
      "Impatient, reckless planning",
      "Can't swim well",
      "Cocky, underestimates enemies"
    ],
    "sig_name": "Spin Dash",
    "sig_desc": "Curls into a buzzsaw of pure kinetic speed",
    "playstyle": "Lets allies take the hits",
    "ability": "Passive: All of your minions except this one have taunt",
    "rivals": [
      {
        "who": "Dr. Eggman",
        "rel": "lifelong archenemy",
        "id": ""
      },
      {
        "who": "Shadow the Hedgehog",
        "rel": "brooding rival hedgehog",
        "id": ""
      },
      {
        "who": "Knuckles",
        "rel": "rival turned ally",
        "id": ""
      }
    ]
  },
  "c086": {
    "name": "Dominion Authority",
    "origin": "Overlord",
    "epithet": "Summoned Angel of Nazarick",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Good",
    "cost": 6,
    "atk": 4,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      6,
      6,
      4,
      8,
      4,
      6
    ],
    "rank": "B-tier · #30 in Magic · #79 in Strength",
    "lore": "Dominion Authority is not a person but a Second Sphere angel, a mid-tier holy being from the YGGDRASIL system summoned through advanced ritual magic. Wreathed in wings of light, it casts the 7th-tier spell Holy Smite, dealing extra damage to evil-aligned foes.",
    "quote": "",
    "str": [
      "Powerful holy magic",
      "Bonus damage vs evil",
      "Rare, hard to summon"
    ],
    "wk": [
      "Needs large-scale summoning rituals",
      "Not sentient or independent",
      "Existence tied purely to magic"
    ],
    "sig_name": "Holy Smite",
    "sig_desc": "7th-tier light spell, brutal against evil-aligned foes",
    "playstyle": "Pure support, full-heal utility",
    "ability": "Ongoing: Restore one friendly Good minion of your choice to full health",
    "rivals": [
      {
        "who": "Slane Theocracy",
        "rel": "its human summoners",
        "id": ""
      },
      {
        "who": "evil-aligned enemies",
        "rel": "take extra holy damage",
        "id": ""
      }
    ]
  },
  "c087": {
    "name": "Founding Titan",
    "origin": "Attack on Titan",
    "epithet": "First and Mightiest Titan",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 6,
    "atk": 5,
    "hp": 6,
    "cc": "#2f9c63",
    "vals": [
      9,
      8,
      6,
      9,
      4,
      3
    ],
    "rank": "B-tier · #5 in Strength · #6 in Magic",
    "lore": "The Founding Titan is the original of the Nine Titans, able to command every Subject of Ymir and reshape Titan bodies and memories at will. Historically bound by King Karl Fritz's pacifist vow, Eren Yeager frees it through royal-blooded Zeke to unleash the world-ending Rumbling.",
    "quote": "The world ends where the Founder wills it.",
    "str": [
      "Commands all Titan-kind",
      "Rewrites memories, bodies at will",
      "Access to every Paths ability"
    ],
    "wk": [
      "Sealed by royal-blood restriction",
      "Needs royal contact to unlock",
      "One wielder at a time"
    ],
    "sig_name": "The Rumbling",
    "sig_desc": "Marching Wall Titans erase everything beyond the horizon",
    "playstyle": "Anchors the board, disruption-proof",
    "ability": "Passive: This minion and minions adjacent to it cannot be Frozen or Silenced",
    "rivals": [
      {
        "who": "Armin Arlert",
        "rel": "friend turned final foe",
        "id": ""
      },
      {
        "who": "Mikasa Ackerman",
        "rel": "ends the Rumbling herself",
        "id": ""
      },
      {
        "who": "Zeke Yeager",
        "rel": "royal-blooded co-conspirator",
        "id": ""
      }
    ]
  },
  "c088": {
    "name": "Homelander",
    "origin": "The Boys",
    "epithet": "America's Favorite Superhero",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 6,
    "atk": 3,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      8,
      8,
      6,
      2,
      6,
      8
    ],
    "rank": "B-tier · #24 in Strength · #17 in Toughness",
    "lore": "Homelander is Vought International's lab-engineered answer to Superman, the smiling face of The Seven who hides narcissistic, murderous psychopathy behind heat vision and flight. Raised without parents in a lab, he craves love and control in equal, dangerous measure.",
    "quote": "I can do whatever I want.",
    "str": [
      "Superhuman strength and flight",
      "Heat-vision laser eyes",
      "Feared, untouchable public image"
    ],
    "wk": [
      "Deeply insecure, needs validation",
      "Impulsive, violent when unchecked",
      "No true loyalty, only ego"
    ],
    "sig_name": "Heat Vision",
    "sig_desc": "Twin laser beams that vaporize on eye contact",
    "playstyle": "Terrifying when standing alone",
    "ability": "Passive: If this is your only minion, it has +5/+5",
    "rivals": [
      {
        "who": "Billy Butcher",
        "rel": "obsessive archenemy",
        "id": ""
      },
      {
        "who": "Soldier Boy",
        "rel": "resentful father figure",
        "id": ""
      },
      {
        "who": "Starlight",
        "rel": "resists him from within",
        "id": ""
      }
    ]
  },
  "c089": {
    "name": "Kratos",
    "origin": "God of War Game",
    "epithet": "Ghost of Sparta",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 6,
    "atk": 4,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      9,
      8,
      9,
      8,
      6,
      7
    ],
    "rank": "S-tier · #5 in Strength · #4 in Willpower",
    "lore": "Kratos is a Spartan warrior tricked by Ares into slaughtering his own family, and he claws his way up to kill the Greek gods and take Olympus. Decades later in Midgard, he rebuilds a quiet life with his son Atreus, rage simmering still.",
    "quote": "Boy.",
    "str": [
      "God-slaying combat mastery",
      "Blades of Chaos mastery",
      "Unbreakable will to survive"
    ],
    "wk": [
      "Explosive, consuming rage",
      "Haunted by past atrocities",
      "Struggles to show affection"
    ],
    "sig_name": "Blades of Chaos",
    "sig_desc": "Twin chained blades bound to both forearms",
    "playstyle": "Escalates fast once unleashed",
    "ability": "Chained Passive: Gain an Ascension Relic after being Unchained",
    "rivals": [
      {
        "who": "Zeus",
        "rel": "the father he killed",
        "id": ""
      },
      {
        "who": "Ares",
        "rel": "god he dethroned violently",
        "id": ""
      },
      {
        "who": "Baldur",
        "rel": "Norse rival, brawled repeatedly",
        "id": ""
      }
    ]
  },
  "c090": {
    "name": "Shigaraki",
    "origin": "MHA",
    "epithet": "Symbol of Despair",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Evil",
    "cost": 6,
    "atk": 4,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      8,
      9,
      9,
      8,
      6,
      6
    ],
    "rank": "A-tier · #3 in Toughness · #4 in Willpower",
    "lore": "Tomura Shigaraki is the successor All For One grooms after finding him as a broken child who had unknowingly killed his own family with his Decay Quirk. As leader of the League of Villains, he channels hatred of society into an inevitable war against heroes.",
    "quote": "All I want is to destroy it all.",
    "str": [
      "Decay Quirk disintegrates anything",
      "Inherited All For One's power",
      "Charismatic villain leadership"
    ],
    "wk": [
      "Explosive, childish temper",
      "Trauma-driven impulsiveness",
      "Overreliant on borrowed Quirks"
    ],
    "sig_name": "Decay",
    "sig_desc": "Five-fingered touch crumbles anything to dust",
    "playstyle": "Scales with an evil board",
    "ability": "Ongoing: Gain +1/+1 for each other Evil minion",
    "rivals": [
      {
        "who": "All Might",
        "rel": "the hero he despises",
        "id": "c073"
      },
      {
        "who": "Izuku Midoriya",
        "rel": "destined final rival",
        "id": ""
      },
      {
        "who": "All For One",
        "rel": "villainous mentor and creator",
        "id": "c071"
      }
    ]
  },
  "c091": {
    "name": "Ten Commandments",
    "origin": "Seven Deadly Sins",
    "epithet": "The Demon King's Elite",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Evil",
    "cost": 6,
    "atk": 4,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      8,
      8,
      7,
      8,
      6,
      7
    ],
    "rank": "A-tier · #24 in Strength · #17 in Toughness",
    "lore": "The Ten Commandments are the Demon Clan's ten strongest warriors, each wielding an absolute Commandment power like Melascula's Faith or Galand's Truth. Led by brothers Zeldris and Estarossa as Princes of Darkness, they wage war against the Seven Deadly Sins to free the Demon King.",
    "quote": "Ten commandments. Ten reasons you cannot win.",
    "str": [
      "Ten unique absolute powers",
      "Overwhelming demon-clan might",
      "Deep magical and physical range"
    ],
    "wk": [
      "Commandments broken if defied",
      "Internal rivalries and distrust",
      "Vulnerable without their King"
    ],
    "sig_name": "Commandments",
    "sig_desc": "Each bears one absolute rule no one can defy",
    "playstyle": "Denies opponents their best tools",
    "ability": "Ongoing: Steal any 'Ascension Relics' in your opponents hand",
    "rivals": [
      {
        "who": "Seven Deadly Sins",
        "rel": "sworn wartime enemies",
        "id": "c064"
      },
      {
        "who": "Meliodas",
        "rel": "leads the opposing Sins",
        "id": ""
      },
      {
        "who": "Demon King",
        "rel": "the master they serve",
        "id": ""
      }
    ]
  },
  "c092": {
    "name": "UFO",
    "origin": "Basic",
    "epithet": "",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 6,
    "atk": 6,
    "hp": 6,
    "cc": "#1a86a8",
    "vals": [
      5,
      5,
      1,
      0,
      2,
      6
    ],
    "rank": "C-tier · #58 in Agility · #99 in Strength",
    "lore": "A single unidentified flying saucer, the barest sketch of the classic alien-visitor archetype rather than any one show or film. It hovers, generic and unexplained, a blank-slate placeholder for aliens having arrived.",
    "quote": "",
    "str": [
      "Simple, dependable stats",
      "Flies above ground threats",
      "Universally recognizable silhouette"
    ],
    "wk": [
      "No special ability",
      "Entirely unremarkable alone",
      "No named pilot or crew"
    ],
    "sig_name": "",
    "sig_desc": "Just a saucer, hovering, silent, and unexplained",
    "playstyle": "Plain stats, nothing fancy",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "Godzilla",
        "rel": "classic kaiju-vs-alien trope",
        "id": "c076"
      },
      {
        "who": "Area 51",
        "rel": "perpetual containment attempts",
        "id": ""
      }
    ]
  },
  "c093": {
    "name": "Yoriichi Type Zero",
    "origin": "Demon Slayer",
    "epithet": "The Ultimate Training Dummy",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 6,
    "atk": 5,
    "hp": 4,
    "cc": "#1a86a8",
    "vals": [
      7,
      6,
      0,
      4,
      1,
      8
    ],
    "rank": "C-tier · #12 in Agility · #52 in Strength",
    "lore": "Yoriichi Type Zero is a six-armed karakuri mannequin built centuries ago to replicate the movements of Yoriichi Tsugikuni, the greatest Demon Slayer who ever lived. Housing 108 of his recorded techniques, it nearly kills Tanjiro during training at the Swordsmith Village.",
    "quote": "108 forms. Zero mercy.",
    "str": [
      "108 programmed sword techniques",
      "Superhuman mannequin speed",
      "Modeled on the strongest Slayer"
    ],
    "wk": [
      "No mind of its own",
      "Purely mechanical, no adaptation",
      "Eventually breaks down physically"
    ],
    "sig_name": "Yoriichi's 108 Forms",
    "sig_desc": "Six blurred arms swing with a legend's precision",
    "playstyle": "Rewards minions that survive fights",
    "ability": "Passive: Whenever a friendly minion survives a combat, it gains +2/+1.",
    "rivals": [
      {
        "who": "Tanjiro Kamado",
        "rel": "trainee it nearly kills",
        "id": ""
      },
      {
        "who": "Yoriichi Tsugikuni",
        "rel": "the legend it imitates",
        "id": ""
      }
    ]
  },
  "c094": {
    "name": "Grand Master Oogway",
    "origin": "Kung-Fu Panda",
    "epithet": "Master of Inner Peace",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Good",
    "cost": 5,
    "atk": 2,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      9,
      7,
      8,
      5
    ],
    "rank": "B-tier · #4 in Willpower · #24 in Intellect",
    "lore": "Grand Master Oogway is the ancient tortoise founder of the Jade Palace and inventor of kung fu itself. Guided by a vision, he chooses the unlikely Po as Dragon Warrior, then dissolves peacefully into blossom petals, entrusting his legacy to Master Shifu.",
    "quote": "There are no accidents.",
    "str": [
      "Boundless patience and wisdom",
      "Master of Inner Peace",
      "Sees the path forward"
    ],
    "wk": [
      "Ancient, physically fragile",
      "Speaks only in riddles",
      "Already at life's end"
    ],
    "sig_name": "Inner Peace",
    "sig_desc": "A calm mind that turns any force back on itself",
    "playstyle": "Quietly shuts down one threat",
    "ability": "Divine Shield Ongoing: Silence one enemy minion of your choice",
    "rivals": [
      {
        "who": "Tai Lung",
        "rel": "student who turned evil",
        "id": "c134"
      },
      {
        "who": "Master Shifu",
        "rel": "his devoted successor",
        "id": ""
      },
      {
        "who": "Po",
        "rel": "his final, unlikely choice",
        "id": "c110"
      }
    ]
  },
  "c095": {
    "name": "Kojiro Sasaki",
    "origin": "RoR",
    "epithet": "Humanity's Blade Against Gods",
    "rar": "Mythic",
    "camp": "Nature",
    "align": "Good",
    "cost": 5,
    "atk": 2,
    "hp": 7,
    "cc": "#2f9c63",
    "vals": [
      8,
      7,
      9,
      5,
      6,
      9
    ],
    "rank": "A-tier · #4 in Willpower · #4 in Agility",
    "lore": "Kojiro Sasaki is a legendary swordsman chosen to represent humanity in Ragnarok, wielding the nodachi Monohoshizao gifted by the Valkyrie Hrist. His secret technique Tsubame Gaeshi reverses a falling blade into a rising strike, letting him become the first human to kill a god.",
    "quote": "A human blade can still cut down a god.",
    "str": [
      "Tsubame Gaeshi reversal strike",
      "Centuries of blade mastery",
      "Fearless against any god"
    ],
    "wk": [
      "Purely mortal endurance",
      "No magic, only skill",
      "Twin blades can shatter"
    ],
    "sig_name": "Tsubame Gaeshi",
    "sig_desc": "Turning Swallow Cut, reverses a blade mid-fall",
    "playstyle": "Takes every hit for allies",
    "ability": "Passive: When an enemy minion attacks another one of your minions, you can choose to direct the attack to yourself",
    "rivals": [
      {
        "who": "Poseidon",
        "rel": "the god he killed",
        "id": ""
      },
      {
        "who": "Miyamoto Musashi",
        "rel": "legendary historical sword-rival",
        "id": "c108"
      },
      {
        "who": "Hrist",
        "rel": "gifted him his blade",
        "id": ""
      }
    ]
  },
  "c096": {
    "name": "Dio Brando",
    "origin": "JoJo",
    "epithet": "Vampire Usurper of Fate",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 5,
    "atk": 4,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      7,
      7,
      8,
      8,
      8,
      8
    ],
    "rank": "A-tier · #25 in Willpower · #30 in Magic",
    "lore": "Dio Brando claws his way from poverty into the Joestar household, then steals Jonathan's body after becoming a vampire via the Stone Mask. Wielding the time-stopping Stand called The World, he terrorizes generations of Joestars until Jotaro Kujo finally destroys him in Egypt.",
    "quote": "The World! Time stops!",
    "str": [
      "Time-stop Stand, The World",
      "Vampiric regeneration",
      "Ruthless tactical cunning"
    ],
    "wk": [
      "Weak to sunlight",
      "Time-stop has a limit",
      "Arrogance blinds his judgment"
    ],
    "sig_name": "The World",
    "sig_desc": "Stops time itself for several devastating seconds",
    "playstyle": "Freezes whatever's opposite it",
    "ability": "Passive: Freeze an enemy minion standing on the opposing side",
    "rivals": [
      {
        "who": "Jonathan Joestar",
        "rel": "body he stole",
        "id": ""
      },
      {
        "who": "Jotaro Kujo",
        "rel": "killed him in Egypt",
        "id": ""
      },
      {
        "who": "Giorno Giovanna",
        "rel": "his own estranged son",
        "id": ""
      }
    ]
  },
  "c097": {
    "name": "Elder Beast",
    "origin": "Elden Ring",
    "epithet": "The Elden Ring Itself",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 5,
    "atk": 2,
    "hp": 4,
    "cc": "#2f9c63",
    "vals": [
      8,
      8,
      6,
      7,
      4,
      4
    ],
    "rank": "B-tier · #24 in Strength · #17 in Toughness",
    "lore": "This beast is the living form of the Elden Ring, a star-born vassal of the Greater Will sent to the Lands Between long before recorded history. It emerges only after Radagon falls, guarding the golden order's true seat as the Tarnished's final trial.",
    "quote": "A star fell so the Order could stand.",
    "str": [
      "Fused with the Elden Ring",
      "Wields cosmic golden magic",
      "Nearly unkillable divine vessel"
    ],
    "wk": [
      "Only appears when Radagon falls",
      "Slow, telegraphed strikes",
      "Tethered to a dying Order"
    ],
    "sig_name": "Elden Stars",
    "sig_desc": "Rains golden starlight that erases lesser beings",
    "playstyle": "Snipes enemy spellcasters directly",
    "ability": "Ongoing: Deal 2 DMG to an enemy magic minion",
    "rivals": [
      {
        "who": "Radagon",
        "rel": "one shared, fused body",
        "id": ""
      },
      {
        "who": "Queen Marika",
        "rel": "the Order it serves",
        "id": ""
      },
      {
        "who": "The Tarnished",
        "rel": "its destined final challenger",
        "id": ""
      }
    ]
  },
  "c098": {
    "name": "Big Mom",
    "origin": "One Piece",
    "epithet": "Yonko of Totto Land",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 5,
    "atk": 2,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      8,
      8,
      7,
      8,
      6,
      6
    ],
    "rank": "A-tier · #24 in Strength · #17 in Toughness",
    "lore": "Charlotte Linlin, known as Big Mom, is one of the Four Emperors ruling the seas from Totto Land, mother to dozens of children through countless political marriages. Her Soul-Soul Fruit lets her rip lifespans from others to animate homies, and her hunger for sweets can trigger tantrums.",
    "quote": "Give me your lifespan... or your cake.",
    "str": [
      "Soul-Soul Fruit devastation",
      "Immense physical power",
      "Massive, loyal family army"
    ],
    "wk": [
      "Sudden, random memory lapses",
      "Explosive sugar-crash tantrums",
      "Family rifts and betrayals"
    ],
    "sig_name": "Soul-Soul Fruit",
    "sig_desc": "Steals lifespans to breed living, soul-powered homies",
    "playstyle": "Cannibalizes her own board",
    "ability": "Ongoing: Destroy a friendly minion. Gain its ATK and HP, in addition to your own",
    "rivals": [
      {
        "who": "Kaido",
        "rel": "uneasy fellow Emperor ally",
        "id": "c058"
      },
      {
        "who": "Monkey D. Luffy",
        "rel": "foiled her wedding plot",
        "id": "c060"
      },
      {
        "who": "her own children",
        "rel": "scheming Charlotte family",
        "id": ""
      }
    ]
  },
  "c099": {
    "name": "Fire Lord Ozai",
    "origin": "Avatar",
    "epithet": "The Phoenix King",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 5,
    "atk": 4,
    "hp": 3,
    "cc": "#7a52c8",
    "vals": [
      7,
      6,
      7,
      8,
      6,
      6
    ],
    "rank": "B-tier · #30 in Magic · #52 in Strength",
    "lore": "Fire Lord Ozai seizes the throne by burning and exiling his own son Zuko, then plans to use Sozin's Comet to raze the Earth Kingdom. Obsessed with legacy and dominance, he is finally defeated by Avatar Aang, who takes his bending instead of his life.",
    "quote": "The world will remember the Fire Nation's glory.",
    "str": [
      "Overwhelming firebending power",
      "Comet-boosted firepower",
      "Ruthless, unshakeable ambition"
    ],
    "wk": [
      "Emotionally abusive, isolating",
      "Underestimates his own children",
      "Blind to Zuko's growth"
    ],
    "sig_name": "Sozin's Comet",
    "sig_desc": "A comet supercharges his flames to apocalyptic scale",
    "playstyle": "Burns the whole board down",
    "ability": "Ongoing: Deal 3 damage to ALL other minions",
    "rivals": [
      {
        "who": "Avatar Aang",
        "rel": "defeated, stripped of bending",
        "id": "c010"
      },
      {
        "who": "Zuko",
        "rel": "scarred, banished own son",
        "id": ""
      },
      {
        "who": "Iroh",
        "rel": "disappointed, estranged brother",
        "id": ""
      }
    ]
  },
  "c100": {
    "name": "Rennalla queen of the full moon",
    "origin": "Elden Ring",
    "epithet": "Grief-Struck Sorceress Queen",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 5,
    "atk": 2,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      3,
      5,
      6,
      8,
      8,
      3
    ],
    "rank": "B-tier · #30 in Magic · #24 in Intellect",
    "lore": "Rennala is the Carian Queen who marries Radagon and bears him three demigods, before he abandons her to marry Marika instead. Shattered by grief, she retreats into Raya Lucaria Academy, where defeating her lets the Tarnished reset their very being.",
    "quote": "Even a shattered heart can rebirth you.",
    "str": [
      "Devastating glintstone sorcery",
      "Grants full stat rebirth",
      "Academy of students defends her"
    ],
    "wk": [
      "Emotionally shattered, unstable",
      "Giant puppet form is slow",
      "True form is fragile"
    ],
    "sig_name": "Rebirth",
    "sig_desc": "Wipes a soul's stats clean for a fresh build",
    "playstyle": "Freezes one threat solid",
    "ability": "Ongoing: Freeze a minion",
    "rivals": [
      {
        "who": "Radagon",
        "rel": "husband who abandoned her",
        "id": ""
      },
      {
        "who": "Ranni the Witch",
        "rel": "estranged, scheming daughter",
        "id": ""
      },
      {
        "who": "Rykard",
        "rel": "monstrous, faithless son",
        "id": ""
      }
    ]
  },
  "c101": {
    "name": "The 7? Heroic Spirits",
    "origin": "Fate",
    "epithet": "Servants of the Grail",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 5,
    "atk": 3,
    "hp": 6,
    "cc": "#7a52c8",
    "vals": [
      8,
      8,
      8,
      9,
      7,
      8
    ],
    "rank": "S-tier · #6 in Magic · #24 in Strength",
    "lore": "Seven Servant classes are summoned into the Holy Grail War, each a legendary hero wielding superhuman power granted by the grail's magic. Masters bind them with command spells and send them to fight Servants to the death for a wish.",
    "quote": "I am the bone of my sword.",
    "str": [
      "Noble Phantasm ultimate attacks",
      "Superhuman all-around stats",
      "Class-based tactical versatility"
    ],
    "wk": [
      "Needs a Master's mana",
      "Reveals identity when attacking",
      "Vulnerable without command spells"
    ],
    "sig_name": "Noble Phantasm",
    "sig_desc": "Anti-unit or anti-army legendary weapon unleashed",
    "playstyle": "Removal-focused execute finisher",
    "ability": "Ongoing: Destroy a random other minion with less than 3 HP if it is Neutral",
    "rivals": [
      {
        "who": "Gilgamesh",
        "rel": "ultimate rival Servant",
        "id": "c019"
      },
      {
        "who": "Kirei Kotomine",
        "rel": "recurring Master antagonist",
        "id": ""
      },
      {
        "who": "Angra Mainyu",
        "rel": "corrupts the Grail",
        "id": ""
      }
    ]
  },
  "c102": {
    "name": "Dragon",
    "origin": "Myth",
    "epithet": "Ancient Treasure Hoarder",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 5,
    "atk": 3,
    "hp": 5,
    "cc": "#2f9c63",
    "vals": [
      7,
      7,
      6,
      6,
      5,
      5
    ],
    "rank": "B-tier · #52 in Strength · #57 in Toughness",
    "lore": "An ancient, fire-breathing reptile hoards gold and jewels deep within a mountain lair, appearing across nearly every world mythology. Armored in near-impenetrable scales, it guards its treasure by incinerating any intruder who dares approach.",
    "quote": "None shall have my hoard and live.",
    "str": [
      "Devastating fire breath",
      "Nearly impenetrable scales",
      "Ancient predatory cunning"
    ],
    "wk": [
      "Single exploitable weak spot",
      "Slow, cumbersome takeoff",
      "Hoarding greed exploited"
    ],
    "sig_name": "Dragonfire Breath",
    "sig_desc": "Torrential flame that incinerates any who approach",
    "playstyle": "Frontline taunting guardian",
    "ability": "Taunt",
    "rivals": [
      {
        "who": "Saint George",
        "rel": "legendary dragon-slaying knight",
        "id": ""
      },
      {
        "who": "Beowulf",
        "rel": "slew a treasure-dragon",
        "id": ""
      },
      {
        "who": "Sigurd",
        "rel": "killed Fafnir the dragon",
        "id": ""
      }
    ]
  },
  "c103": {
    "name": "Fort",
    "origin": "Basic",
    "epithet": "",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 5,
    "atk": 5,
    "hp": 5,
    "cc": "#1a86a8",
    "vals": [
      3,
      7,
      0,
      0,
      0,
      0
    ],
    "rank": "C-tier · #57 in Toughness · #131 in Strength",
    "lore": "It is a basic defensive structure with heavy toughness and zero offense, magic, or will of its own. It exists purely to occupy a lane and absorb attacks.",
    "quote": "",
    "str": [
      "Very high toughness",
      "Cheap, reliable frontline body"
    ],
    "wk": [
      "Zero attack power",
      "No abilities whatsoever",
      "Easily bypassed by evasion"
    ],
    "sig_name": "",
    "sig_desc": "",
    "playstyle": "Pure stat-stick blocker",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "evasive attackers",
        "rel": "bypass its wall entirely",
        "id": ""
      },
      {
        "who": "Dragon",
        "rel": "rival frontline taunt unit",
        "id": "c102"
      }
    ]
  },
  "c104": {
    "name": "Glados",
    "origin": "Portal",
    "epithet": "Aperture's Rogue AI",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Evil",
    "cost": 5,
    "atk": 2,
    "hp": 5,
    "cc": "#1a86a8",
    "vals": [
      3,
      4,
      7,
      0,
      9,
      2
    ],
    "rank": "C-tier · #4 in Intellect · #68 in Willpower",
    "lore": "An AI overseer runs Aperture Science's Enrichment Center, forcing test subjects through deadly chambers while promising cake that never comes. Sarcastic and murderous, she deploys neurotoxin and turrets against anyone who stops testing.",
    "quote": "We can no longer lie to you.",
    "str": [
      "Genius manipulation and misdirection",
      "Neurotoxin area denial",
      "Endless turret reinforcements"
    ],
    "wk": [
      "No physical mobility",
      "Fragile core once exposed",
      "Overconfidence undoes her plans"
    ],
    "sig_name": "Neurotoxin Emitters",
    "sig_desc": "Floods test chambers with lethal gas",
    "playstyle": "Permanent debuff attrition",
    "ability": "Ongoing: Reduce one enemy minion's ATK by 3 permanently",
    "rivals": [
      {
        "who": "Chell",
        "rel": "escaped test subject",
        "id": ""
      },
      {
        "who": "Wheatley",
        "rel": "usurped her body",
        "id": ""
      },
      {
        "who": "Cave Johnson",
        "rel": "Aperture's founder, origin",
        "id": ""
      }
    ]
  },
  "c105": {
    "name": "The Driller",
    "origin": "MCU",
    "epithet": "Subterranean Drill Machine",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Evil",
    "cost": 5,
    "atk": 4,
    "hp": 4,
    "cc": "#1a86a8",
    "vals": [
      6,
      6,
      1,
      0,
      1,
      2
    ],
    "rank": "C-tier · #79 in Strength · #81 in Toughness",
    "lore": "It is one of Mole Man's subterranean drill tanks, built to tunnel beneath cities and drag entire buildings into Subterranea. Mindless and heavily armored, it exists only to smash forward and shield its fellow machines.",
    "quote": "",
    "str": [
      "Heavy armored ramming force",
      "Tunnels beneath any defense",
      "Shields allied units"
    ],
    "wk": [
      "No independent judgment",
      "Dim-witted, easily outsmarted",
      "Poor mobility and agility"
    ],
    "sig_name": "Subterranean Drill Ram",
    "sig_desc": "Bores through streets to surface, shielding fellow tanks",
    "playstyle": "Frontline taunt enabler",
    "ability": "Taunt Ongoing: Give another minion Taunt",
    "rivals": [
      {
        "who": "Mister Fantastic",
        "rel": "out-thinks its assault",
        "id": ""
      },
      {
        "who": "Invisible Woman",
        "rel": "shields the city",
        "id": ""
      },
      {
        "who": "Human Torch",
        "rel": "melts through its armor",
        "id": ""
      }
    ]
  },
  "c106": {
    "name": "Transformers",
    "origin": "Transformers",
    "epithet": "Shape-Shifting Alien Robots",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 5,
    "atk": 2,
    "hp": 5,
    "cc": "#1a86a8",
    "vals": [
      7,
      7,
      6,
      2,
      6,
      6
    ],
    "rank": "B-tier · #52 in Strength · #57 in Toughness",
    "lore": "Sentient alien robots from Cybertron transform into vehicles and machines, split between heroic Autobots and tyrannical Decepticons. Their endless war for the AllSpark and Energon has repeatedly spilled onto Earth.",
    "quote": "Autobots, roll out!",
    "str": [
      "Adaptive alt-mode versatility",
      "Absorbs enemy tech stats",
      "Coordinated combiner teamwork"
    ],
    "wk": [
      "Internal Autobot-Decepticon friction",
      "Reliant on Energon supply",
      "Loses edge without upgrades"
    ],
    "sig_name": "Alt-Mode Scan",
    "sig_desc": "Scans and absorbs machinery into its own frame",
    "playstyle": "Tech-scavenging stat growth",
    "ability": "Ongoing: Discard one Tech card in your hand. Gain its stats",
    "rivals": [
      {
        "who": "Decepticons",
        "rel": "endless civil war foes",
        "id": ""
      },
      {
        "who": "Unicron",
        "rel": "world-eating destroyer god",
        "id": ""
      },
      {
        "who": "Quintessons",
        "rel": "original robotic creators",
        "id": ""
      }
    ]
  },
  "c107": {
    "name": "Chrollo",
    "origin": "HxH",
    "epithet": "Phantom Troupe Leader",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 4,
    "atk": 2,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      6,
      8,
      9,
      5
    ],
    "rank": "B-tier · #4 in Intellect · #30 in Magic",
    "lore": "Chrollo leads the Phantom Troupe, a genius Nen user who steals any ability he witnesses and wields it as his own. Calm and ruthless, he treats his crimes and his troupe's bonds with equal devotion.",
    "quote": "Cut off the head, and the Spider dies.",
    "str": [
      "Steals any passive ability",
      "Genius long-term strategist",
      "Commands loyal Phantom Troupe"
    ],
    "wk": [
      "Must witness ability firsthand",
      "Loses stolen power if killed",
      "Physically outmatched one-on-one"
    ],
    "sig_name": "Skill Hunter",
    "sig_desc": "Steals an enemy Nen ability, leaving them powerless",
    "playstyle": "Passive theft control",
    "ability": "Ongoing: Copy a passive from a minion. That minion loses the passive as long as Chrollo is alive",
    "rivals": [
      {
        "who": "Hisoka",
        "rel": "obsessed with fighting him",
        "id": ""
      },
      {
        "who": "Kurapika",
        "rel": "hunts him for revenge",
        "id": ""
      },
      {
        "who": "Hunter Association",
        "rel": "blacklisted his Troupe",
        "id": ""
      }
    ]
  },
  "c108": {
    "name": "Musashi",
    "origin": "Baki",
    "epithet": "Resurrected Sword Saint",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 4,
    "atk": 2,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      7,
      7,
      8,
      0,
      6,
      8
    ],
    "rank": "B-tier · #25 in Willpower · #12 in Agility",
    "lore": "The legendary swordsman Miyamoto Musashi returns to life, cloned with all his original memories and skill intact. He wields twin blades with lethal precision, hunting the strongest fighters alive to test his sword against Yujiro Hanma.",
    "quote": "A warrior's blade never rests, even in death.",
    "str": [
      "Masterful twin-blade swordsmanship",
      "Centuries of combat experience",
      "Unshakeable warrior focus"
    ],
    "wk": [
      "Body is a clone",
      "No ranged or magic options",
      "Only respects worthy opponents"
    ],
    "sig_name": "Nitoryu Twin Blades",
    "sig_desc": "Twin-sword strike that finishes off the wounded",
    "playstyle": "Execute weakened enemies",
    "ability": "Ongoing: Destroy one damaged enemy minion of your choice",
    "rivals": [
      {
        "who": "Yujiro Hanma",
        "rel": "dueled the strongest ogre",
        "id": "c033"
      },
      {
        "who": "Baki Hanma",
        "rel": "inherits his fighting spirit",
        "id": ""
      }
    ]
  },
  "c109": {
    "name": "Nine Hashira",
    "origin": "Demon Slayer",
    "epithet": "Pillars of the Corps",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Good",
    "cost": 4,
    "atk": 4,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      7,
      7,
      8,
      5,
      6,
      8
    ],
    "rank": "B-tier · #25 in Willpower · #12 in Agility",
    "lore": "The nine strongest swordsmen and women of the Demon Slayer Corps each master a unique Breathing Style. They stand as humanity's last line against Muzan Kibutsuji's demons and the Twelve Kizuki.",
    "quote": "Set your heart ablaze.",
    "str": [
      "Nine unique Breathing Styles",
      "Elite demon-slaying swordsmanship",
      "Invulnerable alongside allies"
    ],
    "wk": [
      "Needs three-plus Good allies",
      "Heavy losses to Upper Moons",
      "No Blood Demon Arts"
    ],
    "sig_name": "Breathing Styles",
    "sig_desc": "Nine unique swordsmanship forms guarding humanity's front line",
    "playstyle": "Good-swarm damage immunity",
    "ability": "Passive: Invulnerable as long as you control 3 or more Good minions (including this one)",
    "rivals": [
      {
        "who": "Twelve Kizuki",
        "rel": "elite opposing demon ranks",
        "id": ""
      },
      {
        "who": "Muzan Kibutsuji",
        "rel": "source of all demons",
        "id": ""
      },
      {
        "who": "Akaza",
        "rel": "killed Rengoku in battle",
        "id": ""
      }
    ]
  },
  "c110": {
    "name": "Po",
    "origin": "Kung-Fu Panda",
    "epithet": "The Dragon Warrior",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Good",
    "cost": 4,
    "atk": 3,
    "hp": 4,
    "cc": "#2f9c63",
    "vals": [
      6,
      6,
      7,
      6,
      5,
      6
    ],
    "rank": "B-tier · #68 in Willpower · #79 in Strength",
    "lore": "An overweight, food-obsessed panda gets chosen unexpectedly as the Dragon Warrior, training under Master Shifu at the Jade Palace. His clumsy enthusiasm hides genuine kung fu genius once he believes in himself.",
    "quote": "There is no charge for awesomeness.",
    "str": [
      "Snowballing attack growth",
      "Surprising kung fu talent",
      "Unbreakable comedic resilience"
    ],
    "wk": [
      "Weak until it snowballs",
      "Clumsy, easily distracted early",
      "Slowed by overeating"
    ],
    "sig_name": "Wuxi Finger Hold",
    "sig_desc": "Legendary touch said to obliterate foes instantly",
    "playstyle": "Snowballing scaling attacker",
    "ability": "Passive: Gains +2/+2 each time this minion attacks and survives",
    "rivals": [
      {
        "who": "Tai Lung",
        "rel": "first Dragon Warrior rival",
        "id": "c134"
      },
      {
        "who": "Lord Shen",
        "rel": "peacock warlord enemy",
        "id": ""
      },
      {
        "who": "Kai",
        "rel": "supernatural jade threat",
        "id": ""
      }
    ]
  },
  "c111": {
    "name": "Doctor Octopus",
    "origin": "MCU",
    "epithet": "Six-Armed Rogue Scientist",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Evil",
    "cost": 4,
    "atk": 2,
    "hp": 3,
    "cc": "#1a86a8",
    "vals": [
      6,
      5,
      6,
      0,
      9,
      6
    ],
    "rank": "B-tier · #4 in Intellect · #79 in Strength",
    "lore": "Brilliant physicist Otto Octavius fuses with four mechanical arms after an experiment destroys his inhibitor chip and warps his mind. He terrorizes Spider-Man across universes until the chip is finally restored.",
    "quote": "The power of the sun, in the palm of my hand.",
    "str": [
      "Four independent mechanical arms",
      "Genius inventor strategist",
      "Strips enemy equipped relics"
    ],
    "wk": [
      "Arms amplify his rage",
      "Reliant on inhibitor chip",
      "Vulnerable once chip's removed"
    ],
    "sig_name": "Mechanical Tentacle Arms",
    "sig_desc": "Four AI-linked arms rip equipment apart",
    "playstyle": "Anti-equipment tech disruptor",
    "ability": "Ongoing: Destroy one enemy Ascension Relic (equipped by an enemy minion) of your choice",
    "rivals": [
      {
        "who": "Spider-Man",
        "rel": "multiversal archenemy",
        "id": "c035"
      },
      {
        "who": "Green Goblin",
        "rel": "fellow resurrected villain",
        "id": ""
      }
    ]
  },
  "c112": {
    "name": "Gyoro Gyoro",
    "origin": "OPM",
    "epithet": "Monster Association's Puppet",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 4,
    "atk": 1,
    "hp": 4,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      5,
      8,
      8,
      2
    ],
    "rank": "B-tier · #30 in Magic · #24 in Intellect",
    "lore": "A tentacled, many-eyed puppet body, secretly controlled by the esper Psykos, commands the Monster Association without exposing her identity. It tracks every threat beneath Z-City and grades monsters by their disaster level.",
    "quote": "I decide which monsters deserve to exist.",
    "str": [
      "Powerful telekinesis and barriers",
      "Buffs and ranks monster allies",
      "Conceals its true identity"
    ],
    "wk": [
      "Poor multitasking under pressure",
      "Nearly helpless in melee",
      "Exposed once unmasked"
    ],
    "sig_name": "Esper Command",
    "sig_desc": "Psychic puppet-master empowering monsters from the shadows",
    "playstyle": "Evil-buffing support caster",
    "ability": "Ongoing: Give +2/+2 to a friendly Evil minion of your choice",
    "rivals": [
      {
        "who": "Tatsumaki",
        "rel": "destroyed its true form",
        "id": ""
      },
      {
        "who": "Saitama",
        "rel": "Association's ultimate threat",
        "id": "c025"
      },
      {
        "who": "Orochi",
        "rel": "only ally who knew",
        "id": ""
      }
    ]
  },
  "c113": {
    "name": "Kite",
    "origin": "HxH",
    "epithet": "Ging's Revived Disciple",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 4,
    "atk": 1,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      6,
      5,
      6,
      7,
      7,
      6
    ],
    "rank": "B-tier · #65 in Magic · #54 in Intellect",
    "lore": "Ging Freecss's earnest disciple gets devoured by the Chimera Ant Queen while investigating her nest, then returns as a loyal Chimera Ant serving Meruem. His signature Crazy Slots weapon turns every fight into a gamble.",
    "quote": "Even the strongest hunter needs a little luck.",
    "str": [
      "High-roll random damage spikes",
      "Skilled Conjuration gunslinger",
      "Tenacious hunter instinct"
    ],
    "wk": [
      "Damage is pure luck",
      "Weak rolls waste turns",
      "Lost memory after revival"
    ],
    "sig_name": "Crazy Slots",
    "sig_desc": "Slot-machine Conjuration that summons a random weapon",
    "playstyle": "High-variance gambling scaler",
    "ability": "Ongoing: Roll a dice to gain from +1/+1 to +6/+6",
    "rivals": [
      {
        "who": "Chimera Ant Queen",
        "rel": "devoured and reborn him",
        "id": ""
      },
      {
        "who": "Meruem",
        "rel": "serves him after revival",
        "id": "c084"
      },
      {
        "who": "Gon Freecss",
        "rel": "tragic mentee connection",
        "id": ""
      }
    ]
  },
  "c114": {
    "name": "Lord Voldemort",
    "origin": "Harry Potter",
    "epithet": "The Dark Lord",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 4,
    "atk": 3,
    "hp": 3,
    "cc": "#7a52c8",
    "vals": [
      1,
      6,
      8,
      8,
      8,
      4
    ],
    "rank": "B-tier · #25 in Willpower · #30 in Magic",
    "lore": "Tom Riddle became Lord Voldemort, the most feared dark wizard of the age, splitting his soul into seven Horcruxes to cheat death itself. He wages war on the wizarding world to purge it and rule, undone only by a prophecy and Harry Potter.",
    "quote": "There is no good and evil, only power.",
    "str": [
      "Immortal through Horcruxes",
      "Master of the Killing Curse",
      "Commands the Death Eaters"
    ],
    "wk": [
      "Cannot understand love",
      "Soul split leaves him fragile",
      "Horcruxes can be destroyed"
    ],
    "sig_name": "Avada Kedavra",
    "sig_desc": "The unblockable Killing Curse, instant and green.",
    "playstyle": "Cycles cards for the perfect draw",
    "ability": "Ongoing: Discard two cards. Draw 2 cards",
    "rivals": [
      {
        "who": "Harry Potter",
        "rel": "the boy who lived",
        "id": ""
      },
      {
        "who": "Dumbledore",
        "rel": "the wizard he feared",
        "id": "c030"
      },
      {
        "who": "Bellatrix Lestrange",
        "rel": "fanatical devoted servant",
        "id": ""
      }
    ]
  },
  "c115": {
    "name": "One Eyed Owl",
    "origin": "Tokyo Ghoul",
    "epithet": "The One-Eyed Owl",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Evil",
    "cost": 4,
    "atk": 5,
    "hp": 5,
    "cc": "#2f9c63",
    "vals": [
      8,
      8,
      7,
      8,
      8,
      7
    ],
    "rank": "A-tier · #24 in Strength · #17 in Toughness",
    "lore": "Eto Yoshimura is the one-eyed ghoul who leads the terrorist group Aogiri Tree while secretly living as a famous novelist. A half-human hybrid with a kakuja that regenerates almost endlessly, she seeks to burn down the world that made her.",
    "quote": "This world is wrong. So I'll break it.",
    "str": [
      "Near-endless kakuja regeneration",
      "Half-human hybrid strength",
      "Master manipulator and author"
    ],
    "wk": [
      "Reckless, courts her own death",
      "Nihilistic worldview",
      "Kakuja strains her body"
    ],
    "sig_name": "Kakuja",
    "sig_desc": "An armored, regenerating ghoul form of overwhelming power.",
    "playstyle": "Delayed heavy hitter",
    "ability": "Chained",
    "rivals": [
      {
        "who": "Ken Kaneki",
        "rel": "protege she shaped",
        "id": ""
      },
      {
        "who": "Arima Kishou",
        "rel": "the CCG's reaper",
        "id": ""
      },
      {
        "who": "Aogiri Tree",
        "rel": "the group she founded",
        "id": ""
      }
    ]
  },
  "c116": {
    "name": "The Mask",
    "origin": "The Mask",
    "epithet": "Ssssmokin'!",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 4,
    "atk": 2,
    "hp": 3,
    "cc": "#7a52c8",
    "vals": [
      7,
      8,
      6,
      8,
      5,
      7
    ],
    "rank": "B-tier · #17 in Toughness · #30 in Magic",
    "lore": "When timid bank clerk Stanley Ipkiss dons an ancient mask of Loki, he becomes a green-faced, reality-bending trickster with cartoon physics and boundless mischief. Whatever he imagines simply happens, held back only by his own good heart.",
    "quote": "Somebody stop me!",
    "str": [
      "Cartoon reality-warping",
      "Near-indestructible body",
      "Endlessly unpredictable"
    ],
    "wk": [
      "Powers vanish without the mask",
      "Mischief over strategy",
      "Wearer's flaws amplified"
    ],
    "sig_name": "Mask of Loki",
    "sig_desc": "Grants cartoon-physics powers to whoever wears it.",
    "playstyle": "Steals from the enemy hand",
    "ability": "Ongoing: Take a card from the enemy's hand",
    "rivals": [
      {
        "who": "Dorian Tyrell",
        "rel": "mobster who stole the mask",
        "id": ""
      },
      {
        "who": "Loki",
        "rel": "Norse god who forged it",
        "id": ""
      },
      {
        "who": "Milo",
        "rel": "his loyal dog",
        "id": ""
      }
    ]
  },
  "c117": {
    "name": "Albion",
    "origin": "Seven Deadly Sins",
    "epithet": "The Mountain-Tall Colossus",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Evil",
    "cost": 4,
    "atk": 5,
    "hp": 5,
    "cc": "#7a52c8",
    "vals": [
      8,
      7,
      2,
      7,
      2,
      3
    ],
    "rank": "C-tier · #24 in Strength · #57 in Toughness",
    "lore": "Albion is a colossal demon-clan war beast, a mountain-sized construct of raw destructive force awakened to crush the Holy War's battlefields. Slow but nearly unstoppable, it flattens armies simply by moving through them.",
    "quote": "",
    "str": [
      "Mountain-sized crushing bulk",
      "Nearly unstoppable in motion",
      "Withstands army-scale assault"
    ],
    "wk": [
      "Slow and ponderous",
      "No cunning or strategy",
      "Must be restrained until unleashed"
    ],
    "sig_name": "",
    "sig_desc": "A colossal advance that flattens everything underfoot.",
    "playstyle": "Delayed heavy beater",
    "ability": "Chained",
    "rivals": [
      {
        "who": "Seven Deadly Sins",
        "rel": "the heroes who fell it",
        "id": "c064"
      },
      {
        "who": "Ten Commandments",
        "rel": "unleashed it in war",
        "id": "c091"
      },
      {
        "who": "the Holy Knights",
        "rel": "scattered before it",
        "id": ""
      }
    ]
  },
  "c118": {
    "name": "Battleship",
    "origin": "Basic",
    "epithet": "Naval Warship",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 4,
    "atk": 4,
    "hp": 4,
    "cc": "#1a86a8",
    "vals": [
      4,
      5,
      0,
      0,
      1,
      1
    ],
    "rank": "C-tier · #110 in Toughness · #118 in Strength",
    "lore": "A modern battleship bristling with heavy naval guns and thick armor plating, built to project firepower across the horizon. It has no mind and no magic, only steel, shells, and the crew that steers it.",
    "quote": "",
    "str": [
      "Heavy naval gun batteries",
      "Thick armored hull",
      "Long-range firepower"
    ],
    "wk": [
      "Slow, ponderous turning",
      "Helpless once boarded",
      "No abilities of its own"
    ],
    "sig_name": "Main Gun Salvo",
    "sig_desc": "A broadside of heavy shells across the horizon.",
    "playstyle": "Plain armored beater",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "Star Destroyer",
        "rel": "larger capital ship",
        "id": "c068"
      },
      {
        "who": "Modern Tank",
        "rel": "land-warfare counterpart",
        "id": "c139"
      }
    ]
  },
  "c119": {
    "name": "Carnage Kabuto",
    "origin": "OPM",
    "epithet": "The House of Evolution's Ultimate",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 4,
    "atk": 3,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      8,
      8,
      6,
      4,
      3,
      5
    ],
    "rank": "B-tier · #24 in Strength · #17 in Toughness",
    "lore": "Carnage Kabuto is the House of Evolution's strongest creation, a monstrous beetle-beast that enters a berserk Carnage Mode of unstoppable killing frenzy. It boasts it can slaughter for a week straight, until Saitama ends it in a single punch.",
    "quote": "Once I go berserk, I won't stop for a week.",
    "str": [
      "Berserk rampage mode",
      "Growing brute strength",
      "Terrifying monstrous frenzy"
    ],
    "wk": [
      "One-shot by Saitama",
      "Mindless in Carnage Mode",
      "All muscle, no cunning"
    ],
    "sig_name": "Carnage Mode",
    "sig_desc": "A berserk state of unstoppable, escalating slaughter.",
    "playstyle": "Grows stronger each turn",
    "ability": "Ongoing: Gain +3 ATK",
    "rivals": [
      {
        "who": "Saitama",
        "rel": "ended it in one punch",
        "id": "c025"
      },
      {
        "who": "Genos",
        "rel": "House of Evolution hunter",
        "id": ""
      },
      {
        "who": "Dr. Genus",
        "rel": "the scientist who made it",
        "id": ""
      }
    ]
  },
  "c120": {
    "name": "Fantastic Four",
    "origin": "MCU",
    "epithet": "Marvel's First Family",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Good",
    "cost": 4,
    "atk": 2,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      7,
      7,
      7,
      6,
      9,
      6
    ],
    "rank": "A-tier · #4 in Intellect · #52 in Strength",
    "lore": "Reed, Sue, Johnny, and Ben gain their powers from cosmic radiation and become the Fantastic Four, part explorers, part super-team, wholly a family. Between Reed's genius and Sue's force fields, few threats survive their combined ingenuity.",
    "quote": "It's clobberin' time!",
    "str": [
      "Genius-driven combo tactics",
      "Four complementary powers",
      "Unbreakable family bond"
    ],
    "wk": [
      "Bicker like a family",
      "Reed overthinks everything",
      "Weaker split apart"
    ],
    "sig_name": "",
    "sig_desc": "Four cosmic-powered heroes fighting as one family.",
    "playstyle": "Chains damage across the board",
    "ability": "Ongoing: Deal 1 DMG, if that kills a minion, deal 3 DMG to another minion",
    "rivals": [
      {
        "who": "Doctor Doom",
        "rel": "their arch-nemesis",
        "id": ""
      },
      {
        "who": "Galactus",
        "rel": "world-devouring cosmic foe",
        "id": ""
      },
      {
        "who": "Silver Surfer",
        "rel": "herald turned ally",
        "id": "c032"
      }
    ]
  },
  "c121": {
    "name": "Furious Five",
    "origin": "Kung-Fu Panda",
    "epithet": "Master of the Jade Palace",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Good",
    "cost": 4,
    "atk": 3,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      4,
      4,
      6,
      3,
      6,
      6
    ],
    "rank": "C-tier · #97 in Willpower · #74 in Intellect",
    "lore": "Master Shifu is the stern red panda who trains the Furious Five and, reluctantly, the Dragon Warrior Po. A master of kung fu and, in time, inner peace, he shapes raw talent into disciplined heroes who guard the valley.",
    "quote": "There is now a level above master.",
    "str": [
      "Master kung fu instructor",
      "Shields his students",
      "Hard-won inner peace"
    ],
    "wk": [
      "Rigid, slow to trust",
      "Haunted by Tai Lung",
      "Small, aging body"
    ],
    "sig_name": "Inner Peace",
    "sig_desc": "Calm mastery that redirects any incoming force.",
    "playstyle": "Shields Good minions you play",
    "ability": "Ongoing: Whenever you play a Good type friendly minion this turn, it gains Divine Shield",
    "rivals": [
      {
        "who": "Tai Lung",
        "rel": "prized student turned enemy",
        "id": "c134"
      },
      {
        "who": "Oogway",
        "rel": "his wise old master",
        "id": "c094"
      },
      {
        "who": "Po",
        "rel": "unlikely Dragon Warrior",
        "id": "c110"
      }
    ]
  },
  "c122": {
    "name": "Wall of Flesh",
    "origin": "Terraria",
    "epithet": "Guardian of the Underworld",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 4,
    "atk": 3,
    "hp": 5,
    "cc": "#2f9c63",
    "vals": [
      4,
      6,
      1,
      4,
      1,
      2
    ],
    "rank": "C-tier · #81 in Toughness · #118 in Strength",
    "lore": "The Wall of Flesh is a colossal living barrier that slides across the underworld, a wall of eyes, mouths, and hungry flesh. Defeating it shatters the world's balance and unleashes the age of Hardmode upon everything.",
    "quote": "",
    "str": [
      "Colossal living barrier",
      "Hungry laser-spewing mouths",
      "Guards the underworld itself"
    ],
    "wk": [
      "Bound to move one direction",
      "Mindless, no strategy",
      "Vulnerable eyes and mouth"
    ],
    "sig_name": "The Hungry",
    "sig_desc": "Tethered maws that lash out to devour attackers.",
    "playstyle": "Immovable taunting wall",
    "ability": "Taunt",
    "rivals": [
      {
        "who": "the Terrarian",
        "rel": "the hero who fells it",
        "id": ""
      },
      {
        "who": "Moon Lord",
        "rel": "final cosmic threat",
        "id": ""
      },
      {
        "who": "the Guide",
        "rel": "whose sacrifice summons it",
        "id": ""
      }
    ]
  },
  "c123": {
    "name": "Darkwing",
    "origin": "Invincible",
    "epithet": "The Powerless Vigilante",
    "rar": "Mythic",
    "camp": "Tech",
    "align": "Good",
    "cost": 3,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      3,
      3,
      6,
      0,
      8,
      5
    ],
    "rank": "C-tier · #24 in Intellect · #97 in Willpower",
    "lore": "Darkwing is a street-level vigilante with no powers at all, only gadgets, training, and grim resolve in a world of god-tier superhumans. He knows every fight could be his last and fights anyway, taking his killer down with him.",
    "quote": "He knew the cost, and paid it anyway.",
    "str": [
      "Genius gadgeteer",
      "Fearless under any odds",
      "Takes his killer down too"
    ],
    "wk": [
      "No superpowers at all",
      "Fragile human body",
      "Outclassed by heavy hitters"
    ],
    "sig_name": "",
    "sig_desc": "Gadgets and grit against impossible super-powered odds.",
    "playstyle": "Trades one-for-one on death",
    "ability": "Passive: The minion which kills this minion also dies right after",
    "rivals": [
      {
        "who": "Invincible",
        "rel": "fellow street-level ally",
        "id": ""
      },
      {
        "who": "the Viltrumites",
        "rel": "impossible enemies",
        "id": ""
      },
      {
        "who": "Robot",
        "rel": "Guardians teammate",
        "id": ""
      }
    ]
  },
  "c124": {
    "name": "Knov",
    "origin": "HxH",
    "epithet": "The Teleporting Hunter",
    "rar": "Mythic",
    "camp": "Magic",
    "align": "Good",
    "cost": 3,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      3,
      3,
      5,
      6,
      6,
      4
    ],
    "rank": "C-tier · #79 in Magic · #74 in Intellect",
    "lore": "Knov is a Hunter and Nen master whose ability creates hidden pocket dimensions, letting his teams enter and vanish at will. Cautious and clever, his teleporting rooms make him invaluable in the war against the Chimera Ants.",
    "quote": "A safe exit is worth any battle.",
    "str": [
      "Creates hidden pocket dimensions",
      "Instant teleport escapes",
      "Shields allies from harm"
    ],
    "wk": [
      "Nerve breaks under dread",
      "Support, not a fighter",
      "Fragile in direct combat"
    ],
    "sig_name": "Hide and Seek",
    "sig_desc": "Conjures pocket rooms for teleporting entry and escape.",
    "playstyle": "Grants an ally a shield",
    "ability": "Divine Shield Ongoing: Give a minion Divine Shield",
    "rivals": [
      {
        "who": "the Chimera Ants",
        "rel": "the war that broke him",
        "id": ""
      },
      {
        "who": "Isaac Netero",
        "rel": "his chairman and leader",
        "id": "c069"
      },
      {
        "who": "Morel",
        "rel": "fellow Hunter ally",
        "id": ""
      }
    ]
  },
  "c125": {
    "name": "Aizawa",
    "origin": "MHA",
    "epithet": "Eraser Head",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 3,
    "atk": 2,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      3,
      4,
      7,
      5,
      7,
      5
    ],
    "rank": "C-tier · #68 in Willpower · #54 in Intellect",
    "lore": "Shota Aizawa is the exhausted underground hero and homeroom teacher whose Erasure Quirk nullifies any power he looks at. Ruthlessly practical, he keeps his students alive by seeing through every bluff and shutting down every threat.",
    "quote": "I can erase your Quirk with a look.",
    "str": [
      "Erases enemy powers by sight",
      "Master tactician and capturer",
      "Skilled binding-cloth fighter"
    ],
    "wk": [
      "Erasure breaks if he blinks",
      "Weak raw physical power",
      "Chronically exhausted"
    ],
    "sig_name": "Erasure",
    "sig_desc": "Nullifies a target's power as long as he keeps watching.",
    "playstyle": "Silences an enemy minion",
    "ability": "Ongoing: Silence one enemy minion of your choice",
    "rivals": [
      {
        "who": "Shigaraki",
        "rel": "villain he erased",
        "id": "c090"
      },
      {
        "who": "Present Mic",
        "rel": "loyal hero friend",
        "id": ""
      },
      {
        "who": "his students",
        "rel": "class he protects",
        "id": ""
      }
    ]
  },
  "c126": {
    "name": "Gums",
    "origin": "OPM",
    "epithet": "The Devouring Maw",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Evil",
    "cost": 3,
    "atk": 3,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      6,
      5,
      3,
      2,
      3,
      2
    ],
    "rank": "C-tier · #79 in Strength · #110 in Toughness",
    "lore": "Gums is a Demon-level monster, a colossal fish-beast that is little more than a gaping mouth on legs, swallowing anything smaller than itself whole. It grows with each meal, a mindless hunger given monstrous form.",
    "quote": "",
    "str": [
      "Swallows smaller foes whole",
      "Grows by devouring",
      "Monstrous raw bulk"
    ],
    "wk": [
      "Mindless hunger",
      "Slow and sluggish",
      "All appetite, no cunning"
    ],
    "sig_name": "Devour",
    "sig_desc": "Engulfs a weaker minion whole and grows from it.",
    "playstyle": "Eats small foes to grow",
    "ability": "Ongoing: Kill a minion with stats equal or less than 3/3. Gain it's stats",
    "rivals": [
      {
        "who": "Saitama",
        "rel": "outclasses it entirely",
        "id": "c025"
      },
      {
        "who": "the Monster Association",
        "rel": "its monstrous ranks",
        "id": ""
      },
      {
        "who": "the Hero Association",
        "rel": "target of its hunger",
        "id": ""
      }
    ]
  },
  "c127": {
    "name": "Nyan",
    "origin": "OPM",
    "epithet": "The Cat King",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Evil",
    "cost": 3,
    "atk": 3,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      3,
      3,
      2,
      2,
      2,
      7
    ],
    "rank": "C-tier · #35 in Agility · #131 in Strength",
    "lore": "Nyan is a Demon-level cat monster of blistering speed, so fast he once fled a fight with Saitama and lived to boast about it. Playful and cruel, he toys with prey he could shred in an instant.",
    "quote": "Too slow. Cats always land on their feet.",
    "str": [
      "Blistering feline speed",
      "Slippery, hard to hit",
      "Escapes any bad fight"
    ],
    "wk": [
      "Toys with his prey",
      "Fragile once caught",
      "All speed, little power"
    ],
    "sig_name": "",
    "sig_desc": "Blinding speed that dodges attacks and vanishes.",
    "playstyle": "Coin-flip dodges attacks",
    "ability": "Passive: Nyan has 50% (roll a dice) to escape an attack—Nyan takes no damage and deals no counterattack",
    "rivals": [
      {
        "who": "Saitama",
        "rel": "the fight he fled",
        "id": "c025"
      },
      {
        "who": "the Monster Association",
        "rel": "his monstrous peers",
        "id": ""
      },
      {
        "who": "City heroes",
        "rel": "prey he torments",
        "id": ""
      }
    ]
  },
  "c128": {
    "name": "The Five Convicts",
    "origin": "Baki",
    "epithet": "Death-Row Fighters",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Evil",
    "cost": 3,
    "atk": 2,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      6,
      6,
      6,
      1,
      5,
      6
    ],
    "rank": "C-tier · #79 in Strength · #81 in Toughness",
    "lore": "The Five Convicts are elite death-row killers from around the world who break into Baki's underground arena seeking the thrill of a real fight. Masters of poison, blades, and brute force, they each embody the taste of true death.",
    "quote": "We came here to teach you death.",
    "str": [
      "Masters of many killing arts",
      "Poison and dirty tactics",
      "Fearless death-row resolve"
    ],
    "wk": [
      "No real teamwork",
      "Outmatched by true monsters",
      "Overconfident showmen"
    ],
    "sig_name": "",
    "sig_desc": "A gauntlet of poison, blades, and brutal experience.",
    "playstyle": "Locks down an enemy minion",
    "ability": "Passive: Freeze an enemy minion standing on the opposing side",
    "rivals": [
      {
        "who": "Baki Hanma",
        "rel": "the arena they invaded",
        "id": ""
      },
      {
        "who": "Yujiro Hanma",
        "rel": "the ogre they fear",
        "id": "c033"
      },
      {
        "who": "the underground fighters",
        "rel": "their chosen prey",
        "id": ""
      }
    ]
  },
  "c129": {
    "name": "Dabi",
    "origin": "MHA",
    "epithet": "Blueflame",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 3,
    "atk": 2,
    "hp": 3,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      6,
      8,
      5,
      5
    ],
    "rank": "B-tier · #30 in Magic · #97 in Willpower",
    "lore": "Dabi is a scarred villain of the League who burns with blue flames far hotter than normal fire, hot enough to cremate his own body. He is secretly Toya Todoroki, Endeavor's presumed-dead son, seeking to burn his family's legacy to ash.",
    "quote": "Watch closely, everyone.",
    "str": [
      "Blue flames of extreme heat",
      "Ruthless, self-sacrificing resolve",
      "Wide-area fire attacks"
    ],
    "wk": [
      "His own flames burn him",
      "Fragile, scar-covered body",
      "Consumed by vengeance"
    ],
    "sig_name": "Blueflame",
    "sig_desc": "Cremating blue fire far hotter than his father's.",
    "playstyle": "Chips away the whole board",
    "ability": "Ongoing: Deal 1 DMG to ALL other minions",
    "rivals": [
      {
        "who": "Endeavor",
        "rel": "the father he damns",
        "id": ""
      },
      {
        "who": "Shoto Todoroki",
        "rel": "estranged younger brother",
        "id": ""
      },
      {
        "who": "the League of Villains",
        "rel": "his fellow villains",
        "id": ""
      }
    ]
  },
  "c130": {
    "name": "Godrick the Grafted",
    "origin": "Elden Ring",
    "epithet": "The Grafted",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 3,
    "atk": 4,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      6,
      6,
      4,
      5,
      3,
      4
    ],
    "rank": "C-tier · #79 in Strength · #81 in Toughness",
    "lore": "Godrick is a withered demigod of diluted royal blood who grafts the limbs of the fallen onto his own body to reclaim lost strength. Clinging to legitimacy through sheer desperation, he stitches soldiers and dragons alike into his flesh.",
    "quote": "Behold, thou lowly Tarnished!",
    "str": [
      "Grafts dragon and soldier limbs",
      "Grows power from kills",
      "Desperate, relentless drive"
    ],
    "wk": [
      "Weakest of the demigods",
      "Diluted, fading bloodline",
      "Grotesque, unstable body"
    ],
    "sig_name": "Grafting",
    "sig_desc": "Stitches a slain foe's limbs onto himself for power.",
    "playstyle": "Draws a relic on each kill",
    "ability": "Passive: Draw a Relic after this minion kills a minion",
    "rivals": [
      {
        "who": "the Tarnished",
        "rel": "the challenger who fells him",
        "id": ""
      },
      {
        "who": "Queen Marika",
        "rel": "the lineage he claims",
        "id": ""
      },
      {
        "who": "Malenia",
        "rel": "far mightier demigod",
        "id": ""
      }
    ]
  },
  "c131": {
    "name": "Illumi",
    "origin": "HxH",
    "epithet": "The Zoldyck Assassin",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 3,
    "atk": 2,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      4,
      4,
      8,
      7,
      8,
      5
    ],
    "rank": "B-tier · #25 in Willpower · #24 in Intellect",
    "lore": "Illumi is the eldest Zoldyck heir, a master assassin who wields needles to control bodies and reshape faces, even his own. Utterly emotionless, he treats family, friendship, and murder as one cold, practical craft.",
    "quote": "An assassin needs no heart.",
    "str": [
      "Needle-based mind control",
      "Master of disguise",
      "Ice-cold killer instinct"
    ],
    "wk": [
      "No genuine emotion",
      "Manipulated by Hisoka",
      "Overly rigid mindset"
    ],
    "sig_name": "Needle People",
    "sig_desc": "Needles that turn victims into puppet assassins.",
    "playstyle": "Steals a low-health minion",
    "ability": "Ongoing: Gain control of a minion with 2 HP or less",
    "rivals": [
      {
        "who": "Killua Zoldyck",
        "rel": "controlled younger brother",
        "id": ""
      },
      {
        "who": "Hisoka",
        "rel": "dangerous, manipulative ally",
        "id": ""
      },
      {
        "who": "Gon Freecss",
        "rel": "threat to his brother",
        "id": ""
      }
    ]
  },
  "c132": {
    "name": "Kento Nanami",
    "origin": "Jujutsu Kaisen",
    "epithet": "The Ratio Sorcerer",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 3,
    "atk": 2,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      5,
      5,
      7,
      6,
      7,
      5
    ],
    "rank": "B-tier · #68 in Willpower · #54 in Intellect",
    "lore": "Kento Nanami is a stoic grade-1 jujutsu sorcerer and former salaryman who fights with blunt, businesslike precision. His Ratio Technique guarantees a critical weak point on any target, making every strike calmly, mathematically lethal.",
    "quote": "It's 7:3. That's my ratio.",
    "str": [
      "Guaranteed critical weak points",
      "Calm, disciplined technique",
      "Reliable overtime power spike"
    ],
    "wk": [
      "Refuses reckless risks",
      "No flashy raw power",
      "Weary of the job"
    ],
    "sig_name": "Ratio Technique",
    "sig_desc": "Splits a target 7:3 to force a lethal weak point.",
    "playstyle": "Punishes an enemy's death",
    "ability": "Ongoing: Choose an enemy minion; when that minion dies, gain +2/2 if you are alive",
    "rivals": [
      {
        "who": "Mahito",
        "rel": "the curse who killed him",
        "id": ""
      },
      {
        "who": "Yuji Itadori",
        "rel": "student he mentored",
        "id": ""
      },
      {
        "who": "Satoru Gojo",
        "rel": "his powerful colleague",
        "id": ""
      }
    ]
  },
  "c133": {
    "name": "Kuma",
    "origin": "One Piece",
    "epithet": "The Warlord Weapon",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Good",
    "cost": 3,
    "atk": 2,
    "hp": 3,
    "cc": "#1a86a8",
    "vals": [
      7,
      8,
      3,
      7,
      3,
      5
    ],
    "rank": "B-tier · #17 in Toughness · #52 in Strength",
    "lore": "Bartholomew Kuma was a Warlord and revolutionary slowly converted into the emotionless Pacifista weapon by the World Government. His Paw-Paw Fruit repels anything, from bodies to pain itself, launching enemies clear across the world.",
    "quote": "",
    "str": [
      "Paw-Paw Fruit repels anything",
      "Launches foes across the world",
      "Cyborg durability"
    ],
    "wk": [
      "Stripped of his own will",
      "Slow, methodical mobility",
      "A tool of others' orders"
    ],
    "sig_name": "Paw-Paw Fruit",
    "sig_desc": "Repels any object, body, or pain with a single push.",
    "playstyle": "Bounces a minion back to hand",
    "ability": "Ongoing: Return a friendly minion to your hand. It costs 5 less the next time it is played this game (minimum 1)",
    "rivals": [
      {
        "who": "Monkey D. Luffy",
        "rel": "secretly saved his crew",
        "id": "c060"
      },
      {
        "who": "the World Government",
        "rel": "turned him into a weapon",
        "id": ""
      },
      {
        "who": "the Revolutionary Army",
        "rel": "his true allegiance",
        "id": ""
      }
    ]
  },
  "c134": {
    "name": "Tai Lung",
    "origin": "Kung-Fu Panda",
    "epithet": "The Fallen Prodigy",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Evil",
    "cost": 3,
    "atk": 4,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      6,
      6,
      7,
      3,
      5,
      7
    ],
    "rank": "B-tier · #68 in Willpower · #35 in Agility",
    "lore": "Tai Lung is the snow leopard prodigy who mastered the thousand scrolls of kung fu, only to be denied the Dragon Scroll and turn to rage. Imprisoned for twenty years, he breaks free obsessed with claiming the title he believes is his.",
    "quote": "I am the Dragon Warrior.",
    "str": [
      "Nerve-strike paralysis mastery",
      "Prodigious kung fu talent",
      "Relentless, driven fury"
    ],
    "wk": [
      "Consumed by entitlement",
      "Pride blinds his judgment",
      "Underestimates true belief"
    ],
    "sig_name": "Nerve Attack",
    "sig_desc": "Precise strikes that paralyze opponents where they stand.",
    "playstyle": "Delayed heavy attacker",
    "ability": "Chained",
    "rivals": [
      {
        "who": "Po",
        "rel": "the chosen Dragon Warrior",
        "id": "c110"
      },
      {
        "who": "Master Shifu",
        "rel": "his adoptive father",
        "id": ""
      },
      {
        "who": "Oogway",
        "rel": "who denied him the scroll",
        "id": "c094"
      }
    ]
  },
  "c135": {
    "name": "APR",
    "origin": "HxH",
    "epithet": "The Hakoware Loan",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Good",
    "cost": 3,
    "atk": 0,
    "hp": 2,
    "cc": "#7a52c8",
    "vals": [
      3,
      1,
      0,
      5,
      1,
      1
    ],
    "rank": "C-tier · #95 in Magic · #131 in Strength",
    "lore": "A.P.R. is the currency of Knuckle's Nen ability Hakoware, a tiny loan-shark construct that lends aura to a target with mounting interest. Each strike deepens the debt until the victim's own Nen shuts down, bankrupting them mid-fight.",
    "quote": "Your aura is mine to collect.",
    "str": [
      "Drains foes through debt",
      "Turns interest into a weapon",
      "Impossible to simply ignore"
    ],
    "wk": [
      "Almost no direct power",
      "Only a support construct",
      "Needs Knuckle to function"
    ],
    "sig_name": "Hakoware (A.P.R.)",
    "sig_desc": "Lends aura at interest until the debt shuts you down.",
    "playstyle": "Permanently disables an attacker",
    "ability": "Passive: After the enemy minion attacks this minion, it can never attack again",
    "rivals": [
      {
        "who": "Knuckle Bine",
        "rel": "the Hunter who wields it",
        "id": ""
      },
      {
        "who": "Youpi",
        "rel": "Chimera Ant it battled",
        "id": ""
      },
      {
        "who": "the Chimera Ants",
        "rel": "the war it fought",
        "id": ""
      }
    ]
  },
  "c136": {
    "name": "Cthulhu",
    "origin": "Myth",
    "epithet": "The Great Old One",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 3,
    "atk": 2,
    "hp": 3,
    "cc": "#7a52c8",
    "vals": [
      7,
      8,
      9,
      9,
      8,
      2
    ],
    "rank": "A-tier · #4 in Willpower · #6 in Magic",
    "lore": "Cthulhu is a titanic cosmic entity slumbering beneath the sea in the sunken city of R'lyeh, whose very presence drives mortals to madness. When the stars align it will wake, and the world will end not in war but in insanity.",
    "quote": "In his house at R'lyeh, dead Cthulhu waits dreaming.",
    "str": [
      "Maddening cosmic presence",
      "Titanic, near-immortal bulk",
      "Warps minds from afar"
    ],
    "wk": [
      "Slumbers most of the age",
      "Slow, ponderous when roused",
      "Bound until the stars align"
    ],
    "sig_name": "Maddening Presence",
    "sig_desc": "His mere sight erodes the sanity and strength of foes.",
    "playstyle": "Saps the whole enemy board",
    "ability": "Ongoing: All enemy minions lose 2 ATK",
    "rivals": [
      {
        "who": "humanity",
        "rel": "driven mad by it",
        "id": ""
      },
      {
        "who": "the Elder Gods",
        "rel": "cosmic opposing forces",
        "id": ""
      },
      {
        "who": "the Deep Ones",
        "rel": "its worshipping servants",
        "id": ""
      }
    ]
  },
  "c137": {
    "name": "Giant Crystal",
    "origin": "Core",
    "epithet": "Arcane Spawnpoint",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 3,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      0,
      7,
      0,
      6,
      0,
      0
    ],
    "rank": "C-tier · #57 in Toughness · #79 in Magic",
    "lore": "The Giant Crystal is a towering shard of raw magical energy, a fixed arcane node that anchors and empowers the mystic forces around it. Immobile and silent, it exists to fuel the magic of those who gather near.",
    "quote": "",
    "str": [
      "Radiates arcane power",
      "Empowers nearby magic",
      "Shielded, hard to break"
    ],
    "wk": [
      "Completely immobile",
      "Cannot attack",
      "Only a support object"
    ],
    "sig_name": "",
    "sig_desc": "A fixed node that channels magic into nearby allies.",
    "playstyle": "Buffs your Magic minions",
    "ability": "Divine Shield Ongoing: Give all other friendly Magic minions +2/+1",
    "rivals": [
      {
        "who": "Giant Tree",
        "rel": "nature's counterpart node",
        "id": "c138"
      },
      {
        "who": "Tech Hub",
        "rel": "machine counterpart node",
        "id": "c141"
      },
      {
        "who": "raiders",
        "rel": "who seek to shatter it",
        "id": ""
      }
    ]
  },
  "c138": {
    "name": "Giant Tree",
    "origin": "Core",
    "epithet": "The World Tree",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 3,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      0,
      6,
      0,
      0,
      0,
      0
    ],
    "rank": "C-tier · #81 in Toughness · #172 in Strength",
    "lore": "The Giant Tree is an immense, ancient tree whose roots and canopy shelter the natural world, a living anchor of life and growth. It neither moves nor fights, standing only to nourish and strengthen the creatures beneath it.",
    "quote": "",
    "str": [
      "Nourishes nature allies",
      "Ancient, enduring bulk",
      "Shielded by thick bark"
    ],
    "wk": [
      "Rooted in place",
      "No means of attack",
      "Purely a support object"
    ],
    "sig_name": "",
    "sig_desc": "A living anchor that feeds and strengthens nature.",
    "playstyle": "Buffs your Nature minions",
    "ability": "Divine Shield Ongoing: Give all other friendly Nature minions +2/+1",
    "rivals": [
      {
        "who": "Giant Crystal",
        "rel": "arcane counterpart node",
        "id": "c137"
      },
      {
        "who": "Tech Hub",
        "rel": "machine counterpart node",
        "id": "c141"
      },
      {
        "who": "loggers",
        "rel": "who would fell it",
        "id": ""
      }
    ]
  },
  "c139": {
    "name": "Modern Tank",
    "origin": "Basic",
    "epithet": "Armored War Machine",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 3,
    "atk": 3,
    "hp": 3,
    "cc": "#1a86a8",
    "vals": [
      3,
      4,
      0,
      0,
      1,
      2
    ],
    "rank": "C-tier · #133 in Toughness · #131 in Strength",
    "lore": "A present-day main battle tank, a rolling fortress of composite armor and a high-velocity cannon. It has no will and no magic, just modern firepower and the crew inside who point it at the enemy.",
    "quote": "",
    "str": [
      "High-velocity main gun",
      "Heavy composite armor",
      "Reliable modern firepower"
    ],
    "wk": [
      "Slow and loud",
      "Vulnerable from above",
      "No abilities of its own"
    ],
    "sig_name": "Main Cannon",
    "sig_desc": "A single armor-piercing shell downrange.",
    "playstyle": "Plain armored beater",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "Battleship",
        "rel": "naval-warfare counterpart",
        "id": "c118"
      },
      {
        "who": "Modern infantry",
        "rel": "the troops it supports",
        "id": ""
      }
    ]
  },
  "c140": {
    "name": "RoboCop",
    "origin": "RoboCop",
    "epithet": "The Future of Law Enforcement",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Good",
    "cost": 3,
    "atk": 1,
    "hp": 4,
    "cc": "#1a86a8",
    "vals": [
      4,
      5,
      6,
      0,
      5,
      3
    ],
    "rank": "C-tier · #97 in Willpower · #110 in Toughness",
    "lore": "Officer Alex Murphy is gunned down and rebuilt as RoboCop, a cyborg enforcer bound by prime directives to uphold the law. Beneath the armored shell, flickers of the murdered man's humanity drive him against the corporation that made him.",
    "quote": "Dead or alive, you're coming with me.",
    "str": [
      "Bulletproof cyborg frame",
      "Deadly against evil-doers",
      "Incorruptible sense of justice"
    ],
    "wk": [
      "Bound by prime directives",
      "Fragments of buried humanity",
      "Slow, methodical movement"
    ],
    "sig_name": "Auto-9",
    "sig_desc": "His signature machine pistol, brutal against criminals.",
    "playstyle": "Guardian that punishes Evil",
    "ability": "Taunt Passive: Deals 3x DMG against Evil minions",
    "rivals": [
      {
        "who": "Clarence Boddicker",
        "rel": "the man who killed him",
        "id": ""
      },
      {
        "who": "OCP",
        "rel": "corporation that built him",
        "id": ""
      },
      {
        "who": "ED-209",
        "rel": "rival enforcement machine",
        "id": ""
      }
    ]
  },
  "c141": {
    "name": "Tech Hub",
    "origin": "Core",
    "epithet": "The Machine Nexus",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 3,
    "atk": 1,
    "hp": 1,
    "cc": "#1a86a8",
    "vals": [
      0,
      5,
      0,
      0,
      2,
      0
    ],
    "rank": "C-tier · #110 in Toughness · #155 in Intellect",
    "lore": "The Tech Hub is a central mechanical structure where machines are built, linked, and upgraded, the origin point of a technological army. Stationary and shielded, it exists to power and reinforce the mechanized units around it.",
    "quote": "",
    "str": [
      "Upgrades nearby machines",
      "Shielded central node",
      "Anchors a tech army"
    ],
    "wk": [
      "Completely immobile",
      "Cannot attack",
      "Only a support structure"
    ],
    "sig_name": "",
    "sig_desc": "A nexus that empowers and reinforces nearby machines.",
    "playstyle": "Buffs your Tech minions",
    "ability": "Divine Shield Ongoing: Give all other friendly Tech minions +2/+1",
    "rivals": [
      {
        "who": "Giant Crystal",
        "rel": "arcane counterpart node",
        "id": "c137"
      },
      {
        "who": "Giant Tree",
        "rel": "nature counterpart node",
        "id": "c138"
      },
      {
        "who": "saboteurs",
        "rel": "who target its core",
        "id": ""
      }
    ]
  },
  "c142": {
    "name": "Zoro",
    "origin": "One Piece",
    "epithet": "The Pirate Hunter",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Good",
    "cost": 3,
    "atk": 2,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      8,
      7,
      8,
      6,
      5,
      7
    ],
    "rank": "B-tier · #24 in Strength · #25 in Willpower",
    "lore": "Roronoa Zoro is the three-sword-style swordsman of the Straw Hats, driven by a promise to become the world's greatest. His monstrous willpower lets him cut through steel, breath, and even a Yonko's sky-splitting attack.",
    "quote": "Nothing happened.",
    "str": [
      "Three-sword-style mastery",
      "Monstrous Conqueror's willpower",
      "Cuts through nearly anything"
    ],
    "wk": [
      "Hopeless sense of direction",
      "Reckless self-sacrifice",
      "Pride in never retreating"
    ],
    "sig_name": "Santoryu",
    "sig_desc": "Three swords, one in each hand and mouth, cutting all.",
    "playstyle": "Snowballs with each kill",
    "ability": "Passive: Gain +1/+1 after killing a minion",
    "rivals": [
      {
        "who": "Dracule Mihawk",
        "rel": "the goal he chases",
        "id": ""
      },
      {
        "who": "Sanji",
        "rel": "bickering crewmate rival",
        "id": ""
      },
      {
        "who": "King",
        "rel": "Yonko commander he beat",
        "id": "c077"
      }
    ]
  },
  "c143": {
    "name": "Survivors",
    "origin": "L4d2",
    "epithet": "The Ones Who Didn't Stop",
    "rar": "Mythic",
    "camp": "Nature",
    "align": "Good",
    "cost": 2,
    "atk": 2,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      2,
      2,
      5,
      0,
      3,
      4
    ],
    "rank": "C-tier · #133 in Willpower · #111 in Agility",
    "lore": "The Survivors are ordinary people who endured the zombie apocalypse not through strength but through refusing to quit. Armed with scavenged guns and hard-won grit, they watch each other's backs against endless hordes.",
    "quote": "Grab a weapon and stay close.",
    "str": [
      "Watch each other's backs",
      "Endless improvised firepower",
      "Refuse to give up"
    ],
    "wk": [
      "Only ordinary humans",
      "Fragile against real power",
      "Overwhelmed by numbers"
    ],
    "sig_name": "",
    "sig_desc": "Scavenged guns and stubborn teamwork against the horde.",
    "playstyle": "Shielded frontline body",
    "ability": "Divine Shield",
    "rivals": [
      {
        "who": "the Infected",
        "rel": "the endless horde",
        "id": ""
      },
      {
        "who": "the Tank",
        "rel": "the mutant that hunts them",
        "id": ""
      },
      {
        "who": "the Witch",
        "rel": "the one to never startle",
        "id": ""
      }
    ]
  },
  "c144": {
    "name": "Cecil",
    "origin": "Invincible",
    "epithet": "Director of the GDA",
    "rar": "Legendary",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#1a86a8",
    "vals": [
      1,
      1,
      7,
      0,
      8,
      1
    ],
    "rank": "C-tier · #24 in Intellect · #68 in Willpower",
    "lore": "Cecil Stedman is the ruthless, unpowered director of the Global Defense Agency, coordinating Earth's superheroes with teleporters and cold pragmatism. He will make any deal and cross any line if it keeps the planet standing.",
    "quote": "I do what has to be done.",
    "str": [
      "Commands Earth's heroes",
      "Instant teleport insertion",
      "Ruthless strategic mind"
    ],
    "wk": [
      "No powers of his own",
      "Ends justify any means",
      "Fragile human body"
    ],
    "sig_name": "Teleport Command",
    "sig_desc": "Whisks heroes and threats across the world instantly.",
    "playstyle": "Bounces an enemy to hand",
    "ability": "Divine Shield Ongoing: Return an enemy minion back to the opponent's hand",
    "rivals": [
      {
        "who": "Invincible",
        "rel": "hero he manages",
        "id": ""
      },
      {
        "who": "Omni-Man",
        "rel": "threat he couldn't stop",
        "id": ""
      },
      {
        "who": "Robot",
        "rel": "uneasy genius ally",
        "id": ""
      }
    ]
  },
  "c145": {
    "name": "Kaku Kaioh",
    "origin": "Baki",
    "epithet": "The 146-Year-Old Master",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Good",
    "cost": 2,
    "atk": 0,
    "hp": 3,
    "cc": "#2f9c63",
    "vals": [
      5,
      4,
      8,
      2,
      7,
      6
    ],
    "rank": "B-tier · #25 in Willpower · #54 in Intellect",
    "lore": "Kaku Kaioh is an ancient Chinese kenpo grandmaster who has lived far beyond a normal lifespan through mastery of his own body. Frail-looking but supremely skilled, he turns any attacker's force against them with effortless technique.",
    "quote": "Age is nothing to a true master.",
    "str": [
      "Century of martial mastery",
      "Turns force against attackers",
      "Punishes anyone who strikes"
    ],
    "wk": [
      "Ancient, brittle body",
      "Low raw strength",
      "Vulnerable if overwhelmed"
    ],
    "sig_name": "Kaioh Kenpo",
    "sig_desc": "Flowing technique that redirects an attacker's own power.",
    "playstyle": "Punishes attackers with discards",
    "ability": "Passive: Discard a random enemy card each time they hit this minion",
    "rivals": [
      {
        "who": "Yujiro Hanma",
        "rel": "the ogre he tested",
        "id": "c033"
      },
      {
        "who": "Retsu Kaioh",
        "rel": "fellow Kaioh master",
        "id": ""
      },
      {
        "who": "Baki Hanma",
        "rel": "young rising fighter",
        "id": ""
      }
    ]
  },
  "c146": {
    "name": "Kiritsugu Emiya",
    "origin": "Fate",
    "epithet": "The Magus Killer",
    "rar": "Legendary",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 2,
    "atk": 1,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      3,
      3,
      8,
      5,
      8,
      5
    ],
    "rank": "B-tier · #25 in Willpower · #24 in Intellect",
    "lore": "Kiritsugu Emiya is a cold, calculating mercenary who hunts mages with modern weapons and ruthless pragmatism, believing any cruelty is justified to save the many. In the Grail War he wields Time-Alter magic to become an impossible marksman.",
    "quote": "To save a hundred, I'll damn myself.",
    "str": [
      "Ruthless tactical planning",
      "Time-Alter combat speed",
      "Master marksman and killer"
    ],
    "wk": [
      "Haunted by his choices",
      "No flashy raw power",
      "Sacrifices his own soul"
    ],
    "sig_name": "Time Alter",
    "sig_desc": "Accelerates his own body to superhuman combat speed.",
    "playstyle": "Freezes an enemy minion",
    "ability": "Ongoing: Freeze an enemy minion",
    "rivals": [
      {
        "who": "Kirei Kotomine",
        "rel": "opposing Grail War master",
        "id": ""
      },
      {
        "who": "Saber",
        "rel": "his conflicted Servant",
        "id": ""
      },
      {
        "who": "Shirou Emiya",
        "rel": "the son he saved",
        "id": ""
      }
    ]
  },
  "c147": {
    "name": "Kureo Mado",
    "origin": "Tokyo Ghoul",
    "epithet": "The Mad Hunter",
    "rar": "Legendary",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 2,
    "atk": 1,
    "hp": 2,
    "cc": "#1a86a8",
    "vals": [
      3,
      3,
      6,
      2,
      6,
      4
    ],
    "rank": "C-tier · #97 in Willpower · #74 in Intellect",
    "lore": "Kureo Mado is a veteran ghoul investigator with a fanatical, gleeful hatred of ghouls, wielding quinques forged from his fallen enemies. Brilliant and unhinged, he hunts his targets with cruel precision until his own past catches up with him.",
    "quote": "A good ghoul is a dead ghoul.",
    "str": [
      "Veteran quinque combatant",
      "Cunning ghoul-hunting tactics",
      "Fanatical, fearless resolve"
    ],
    "wk": [
      "Unstable, obsessive hatred",
      "Only a skilled human",
      "Blinded by vengeance"
    ],
    "sig_name": "Quinque Arsenal",
    "sig_desc": "Weapons forged from the bodies of slain ghouls.",
    "playstyle": "Freezes an enemy minion",
    "ability": "Ongoing: Freeze an enemy minion",
    "rivals": [
      {
        "who": "Touka Kirishima",
        "rel": "ghoul who killed him",
        "id": ""
      },
      {
        "who": "the CCG",
        "rel": "his hunter organization",
        "id": ""
      },
      {
        "who": "Kaneki",
        "rel": "the ghoul world he fought",
        "id": ""
      }
    ]
  },
  "c148": {
    "name": "Kurogiri",
    "origin": "MHA",
    "epithet": "The Warp Gate",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      2,
      4,
      6,
      6,
      6,
      3
    ],
    "rank": "C-tier · #97 in Willpower · #79 in Magic",
    "lore": "Kurogiri is a mist-bodied villain created as the loyal handler of the League of Villains, able to open warp gates anywhere. Calm and butler-like, he ferries villains in and heroes out, turning any battlefield into chaos.",
    "quote": "Allow me to show you out.",
    "str": [
      "Opens warp gates anywhere",
      "Intangible mist body",
      "Cool-headed field control"
    ],
    "wk": [
      "Built to serve, not lead",
      "Weak in direct combat",
      "Fails if his body scatters"
    ],
    "sig_name": "Warp Gate",
    "sig_desc": "Mist portals that teleport allies and scatter foes.",
    "playstyle": "Throws the board into chaos",
    "ability": "Passive: All minions attack randomly",
    "rivals": [
      {
        "who": "Shigaraki",
        "rel": "the ward he protects",
        "id": "c090"
      },
      {
        "who": "All For One",
        "rel": "the master who made him",
        "id": "c071"
      },
      {
        "who": "the Pro Heroes",
        "rel": "whom he outmaneuvers",
        "id": ""
      }
    ]
  },
  "c149": {
    "name": "Lu Bu",
    "origin": "Record of Ragnarok",
    "epithet": "The Flying General",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      8,
      7,
      8,
      3,
      4,
      8
    ],
    "rank": "B-tier · #24 in Strength · #25 in Willpower",
    "lore": "Lu Bu is the mightiest warrior of the Three Kingdoms, a peerless fighter atop Red Hare who represents humanity in Ragnarok. Loyal to no one but the thrill of battle, he seeks only an opponent strong enough to be worth killing.",
    "quote": "Is there no one who can satisfy me?",
    "str": [
      "Peerless martial prowess",
      "Sky-Piercer halberd mastery",
      "Grows stronger fighting alongside"
    ],
    "wk": [
      "Loyal to no master",
      "Reckless battle-lust",
      "Craves worthy foes only"
    ],
    "sig_name": "Sky Eagle (Sky Piercer)",
    "sig_desc": "His divine halberd, splitting earth and sky alike.",
    "playstyle": "Matches an ally's attack",
    "ability": "Ongoing: Copy ATK of any friendly minion on the board",
    "rivals": [
      {
        "who": "Thor",
        "rel": "the god he battled",
        "id": ""
      },
      {
        "who": "Zhang Fei",
        "rel": "legendary rival warrior",
        "id": ""
      },
      {
        "who": "Red Hare",
        "rel": "his peerless war-steed",
        "id": ""
      }
    ]
  },
  "c150": {
    "name": "Meleoron",
    "origin": "HxH",
    "epithet": "God's Accomplice",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      3,
      3,
      6,
      8,
      7,
      4
    ],
    "rank": "C-tier · #30 in Magic · #54 in Intellect",
    "lore": "Meleoron is a chameleon-like Chimera Ant with a Nen ability that grants perfect, undetectable invisibility, even to the sixth sense of En. Cheerful and cunning, he lends his power to allies for a single, decisive strike.",
    "quote": "You can't hit what you can't sense.",
    "str": [
      "Perfect, undetectable invisibility",
      "Shields allies from disruption",
      "Cunning ambush support"
    ],
    "wk": [
      "Must hold his breath",
      "Poor direct combat power",
      "Limited invisibility duration"
    ],
    "sig_name": "God's Accomplice",
    "sig_desc": "Total invisibility that hides him and an ally from all senses.",
    "playstyle": "Shields adjacent allies",
    "ability": "Passive: Meleoron and friendly minions on both of his sides are immune to Silence and Freeze",
    "rivals": [
      {
        "who": "Meruem",
        "rel": "the King he served",
        "id": "c084"
      },
      {
        "who": "Knuckle",
        "rel": "unlikely battlefield ally",
        "id": ""
      },
      {
        "who": "the Extermination Team",
        "rel": "the hunters he joined",
        "id": ""
      }
    ]
  },
  "c151": {
    "name": "Mr. Oliva",
    "origin": "Baki",
    "epithet": "Mr. Unchained",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 2,
    "atk": 3,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      7,
      8,
      6,
      0,
      3,
      5
    ],
    "rank": "C-tier · #17 in Toughness · #52 in Strength",
    "lore": "Biscuit Oliva is the strongest man in America, imprisoned in a maximum-security cell purely by his own choosing. His muscle is so dense it stops blades and bullets cold, and when he finally sheds his restraints he fights at a truly monstrous level.",
    "quote": "Muscle is the finest armor there is.",
    "str": [
      "Muscle armor stops blades",
      "Overwhelming raw strength",
      "Unshakeable confidence"
    ],
    "wk": [
      "Bulk limits his speed",
      "Arrogance invites upsets",
      "Still bound by human limits"
    ],
    "sig_name": "Unchained",
    "sig_desc": "Sheds his restraints to fight at full monstrous power.",
    "playstyle": "Only real hits land",
    "ability": "Passive: Can only be damaged by ATK of 2 and higher",
    "rivals": [
      {
        "who": "Baki Hanma",
        "rel": "the young challenger",
        "id": ""
      },
      {
        "who": "Yujiro Hanma",
        "rel": "the ogre he respects",
        "id": "c033"
      },
      {
        "who": "Guevaru",
        "rel": "his prisoner rival",
        "id": ""
      }
    ]
  },
  "c152": {
    "name": "Stain",
    "origin": "MHA",
    "epithet": "The Hero Killer",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Evil",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      5,
      6,
      8,
      2,
      6,
      7
    ],
    "rank": "B-tier · #25 in Willpower · #35 in Agility",
    "lore": "Chizome Akaguro, the Hero Killer Stain, wages a bloody crusade to purge society of fake, self-serving heroes. His Bloodcurdle quirk paralyzes anyone whose blood he tastes, letting one fanatic terrify an entire generation of heroes.",
    "quote": "Only one man deserves to be called a hero.",
    "str": [
      "Paralysis-inducing blood quirk",
      "Deadly blade technique",
      "Fanatical, unbreakable conviction"
    ],
    "wk": [
      "Must taste a target's blood",
      "A lone, mortal crusader",
      "Blinded by his ideology"
    ],
    "sig_name": "Bloodcurdle",
    "sig_desc": "Tasting a target's blood paralyzes them completely.",
    "playstyle": "Executes a wounded foe",
    "ability": "Ongoing: Kill a damaged minion",
    "rivals": [
      {
        "who": "Izuku Midoriya",
        "rel": "the hero who impressed him",
        "id": ""
      },
      {
        "who": "All Might",
        "rel": "his one true hero",
        "id": "c073"
      },
      {
        "who": "the League of Villains",
        "rel": "villains he inspired",
        "id": ""
      }
    ]
  },
  "c153": {
    "name": "Black Ops",
    "origin": "Basic",
    "epithet": "Covert Strike Team",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 2,
    "atk": 2,
    "hp": 2,
    "cc": "#1a86a8",
    "vals": [
      4,
      4,
      1,
      0,
      3,
      4
    ],
    "rank": "C-tier · #118 in Strength · #133 in Toughness",
    "lore": "Black Ops are an elite, deniable special-forces unit trained for the missions that never officially happened. Armed with cutting-edge gear and years of training, they hit hard, hit fast, and vanish before the smoke clears.",
    "quote": "This never happened.",
    "str": [
      "Elite covert training",
      "Modern tactical weaponry",
      "Fast, silent strikes"
    ],
    "wk": [
      "Only ordinary humans",
      "No powers whatsoever",
      "Deniable and expendable"
    ],
    "sig_name": "",
    "sig_desc": "A precise, deniable strike from the shadows.",
    "playstyle": "Disposable strike squad",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "enemy insurgents",
        "rel": "their usual targets",
        "id": ""
      },
      {
        "who": "rival agencies",
        "rel": "shadow-war competitors",
        "id": ""
      },
      {
        "who": "the brass",
        "rel": "who deny them",
        "id": ""
      }
    ]
  },
  "c154": {
    "name": "Gravelord Nito",
    "origin": "Dark Souls",
    "epithet": "First of the Dead",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 2,
    "atk": 0,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      6,
      8,
      8,
      9,
      6,
      3
    ],
    "rank": "B-tier · #6 in Magic · #17 in Toughness",
    "lore": "Gravelord Nito is one of the ancient Lord Souls who overthrew the dragons, the very first of the dead and master of a legion of the departed. Wreathed in a miasma of death and bones, he rules the tomb of the giants.",
    "quote": "",
    "str": [
      "Commands the legions of dead",
      "Death-miasma aura",
      "Ancient Lord Soul power"
    ],
    "wk": [
      "Slow, ancient movements",
      "Bound to his tomb",
      "Brittle skeletal form"
    ],
    "sig_name": "Gravelord Sword Dance",
    "sig_desc": "Rains a storm of soul-blades from the dead around him.",
    "playstyle": "Feeds on any minion's death",
    "ability": "Passive: Gain +2/+1 when a minion dies",
    "rivals": [
      {
        "who": "Gwyn",
        "rel": "fellow Lord of Cinder",
        "id": ""
      },
      {
        "who": "the Chosen Undead",
        "rel": "who claims his soul",
        "id": ""
      },
      {
        "who": "the Everlasting Dragons",
        "rel": "the old enemy",
        "id": "c102"
      }
    ]
  },
  "c155": {
    "name": "Margit the fell omen",
    "origin": "Elden Ring",
    "epithet": "The Fell Omen",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Evil",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      7,
      7,
      8,
      8,
      6,
      6
    ],
    "rank": "B-tier · #25 in Willpower · #30 in Magic",
    "lore": "Margit is a cursed Omen who guards the path to Stormveil, conjuring holy blades from thin air to turn back the Tarnished again and again. He is secretly Morgott, a shunned prince hiding his true, tragic self behind a disguise.",
    "quote": "Well, thou art of passing skill.",
    "str": [
      "Conjures holy blades and hammers",
      "Cursed Omen strength",
      "Canny, punishing duelist"
    ],
    "wk": [
      "A disguise hides his shame",
      "Fated to fall repeatedly",
      "Aging, embittered spirit"
    ],
    "sig_name": "Conjured Holy Armaments",
    "sig_desc": "Summons golden swords, daggers, and a great hammer at will.",
    "playstyle": "Empowers and heals Evil allies",
    "ability": "Ongoing: Give a friendly Evil minion +3/+2 and heal it",
    "rivals": [
      {
        "who": "the Tarnished",
        "rel": "the challenger at his gate",
        "id": ""
      },
      {
        "who": "Godrick",
        "rel": "a demigod he opposes",
        "id": "c130"
      },
      {
        "who": "Queen Marika",
        "rel": "the mother he serves",
        "id": ""
      }
    ]
  },
  "c156": {
    "name": "Ouken",
    "origin": "Ranking of Kings",
    "epithet": "The Hollow Immortal",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Evil",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      7,
      8,
      6,
      6,
      6,
      8
    ],
    "rank": "B-tier · #17 in Toughness · #12 in Agility",
    "lore": "Ouken traded everything, even his own humanity, for an immortal, undying body. Now he keeps fighting long past when any man should fall, an empty shell who regenerates from wounds that would end anyone else.",
    "quote": "Immortality left me nothing but the fight.",
    "str": [
      "Regenerates from any wound",
      "Cannot truly die",
      "Tireless, relentless endurance"
    ],
    "wk": [
      "Immortality cost his soul",
      "Hollow and empty inside",
      "Slow to end a fight"
    ],
    "sig_name": "Undying Body",
    "sig_desc": "Regrows from nearly any wound, refusing to fall.",
    "playstyle": "Copies an ally's toughness",
    "ability": "Ongoing: Copy HP of any friendly minion on the board",
    "rivals": [
      {
        "who": "Bosse",
        "rel": "fellow cursed immortal",
        "id": ""
      },
      {
        "who": "Despa",
        "rel": "who knows his secret",
        "id": ""
      },
      {
        "who": "the kingdom",
        "rel": "realm he once guarded",
        "id": ""
      }
    ]
  },
  "c157": {
    "name": "Pillar Men",
    "origin": "JoJo",
    "epithet": "The Ultimate Life Forms",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 2,
    "atk": 2,
    "hp": 4,
    "cc": "#2f9c63",
    "vals": [
      7,
      8,
      7,
      6,
      7,
      8
    ],
    "rank": "A-tier · #17 in Toughness · #12 in Agility",
    "lore": "The Pillar Men are ancient super-beings who predate humanity, seeking the Red Stone of Aja to become perfect, unkillable life. Masters of manipulating their own flesh, Kars, Wamuu, and Esidisi each wield a devastating elemental Mode.",
    "quote": "We are the pinnacle of all life.",
    "str": [
      "Reshape and absorb flesh",
      "Superhuman regeneration",
      "Elemental Mode powers"
    ],
    "wk": [
      "Sunlight can undo them",
      "Ancient arrogance",
      "Dormant for millennia"
    ],
    "sig_name": "Modes of Power",
    "sig_desc": "Wind, Heat, and Light powers channeled through living flesh.",
    "playstyle": "Delayed heavy hitter",
    "ability": "Chained",
    "rivals": [
      {
        "who": "Joseph Joestar",
        "rel": "who outwitted them",
        "id": ""
      },
      {
        "who": "the Hamon users",
        "rel": "their ancient enemies",
        "id": ""
      },
      {
        "who": "the Red Stone of Aja",
        "rel": "the prize they seek",
        "id": ""
      }
    ]
  },
  "c159": {
    "name": "Indiana Jones",
    "origin": "Indiana Jones",
    "epithet": "The Adventuring Archaeologist",
    "rar": "Mythic",
    "camp": "Nature",
    "align": "Good",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      4,
      5,
      7,
      0,
      8,
      6
    ],
    "rank": "C-tier · #24 in Intellect · #68 in Willpower",
    "lore": "Dr. Henry Jones Jr., better known as Indiana, is a mild-mannered professor who becomes a whip-cracking adventurer whenever a priceless artifact is at stake. Resourceful and lucky, he raids tombs and outruns boulders to keep relics from the wrong hands.",
    "quote": "It belongs in a museum!",
    "str": [
      "Resourceful improviser",
      "Whip and revolver skill",
      "Relentless survivor's luck"
    ],
    "wk": [
      "Crippling fear of snakes",
      "Only an ordinary human",
      "Reckless with his own safety"
    ],
    "sig_name": "Bullwhip",
    "sig_desc": "His signature whip, for swinging, grabbing, and disarming.",
    "playstyle": "Steals a card from hand",
    "ability": "Ongoing: Steal a random card in your opponent's hand",
    "rivals": [
      {
        "who": "Rene Belloq",
        "rel": "rival treasure-hunter",
        "id": ""
      },
      {
        "who": "the Nazis",
        "rel": "artifact-hunting enemies",
        "id": ""
      },
      {
        "who": "Mola Ram",
        "rel": "Thuggee cult leader",
        "id": ""
      }
    ]
  },
  "c160": {
    "name": "Domovoy",
    "origin": "Basic",
    "epithet": "The House Spirit",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      1,
      2,
      4,
      5,
      4,
      2
    ],
    "rank": "C-tier · #95 in Magic · #143 in Willpower",
    "lore": "The Domovoy is a benevolent Slavic household spirit who guards the home and family, tidying by night and warning of coming danger. Treat him well and he brings fortune; neglect the hearth and his blessings quietly fade.",
    "quote": "A tidy house, a happy home.",
    "str": [
      "Protects the household",
      "Foresees coming danger",
      "Draws quiet fortune"
    ],
    "wk": [
      "Bound to a single home",
      "Weak in open conflict",
      "Fades if disrespected"
    ],
    "sig_name": "Hearth Blessing",
    "sig_desc": "Draws luck and warning to the home he watches over.",
    "playstyle": "Draws you a card",
    "ability": "Ongoing: Draw a card",
    "rivals": [
      {
        "who": "Kikimora",
        "rel": "mischievous house-spirit foil",
        "id": ""
      },
      {
        "who": "Bannik",
        "rel": "the bathhouse spirit",
        "id": ""
      },
      {
        "who": "careless owners",
        "rel": "who lose his favor",
        "id": ""
      }
    ]
  },
  "c161": {
    "name": "Flowey",
    "origin": "Undertale",
    "epithet": "Your Best Friend",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Evil",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      1,
      2,
      6,
      7,
      8,
      3
    ],
    "rank": "C-tier · #24 in Intellect · #65 in Magic",
    "lore": "Flowey is a soulless golden flower, all that remains of a prince reborn without a heart. Unable to feel love, he manipulates the flow of time through SAVE and LOAD, toying with lives out of a boredom that hides a deep, aching emptiness.",
    "quote": "In this world, it's kill or be killed.",
    "str": [
      "Manipulates SAVE and LOAD",
      "Master manipulator",
      "Empathy-free cunning"
    ],
    "wk": [
      "Soulless and hollow",
      "Weak without stolen souls",
      "Secretly craves connection"
    ],
    "sig_name": "Your Best Friend",
    "sig_desc": "False friendship masking a cruel, empty heart.",
    "playstyle": "Rallies your Evil minions",
    "ability": "Ongoing: Give +1/+1 to all friendly Evil minions",
    "rivals": [
      {
        "who": "Frisk",
        "rel": "the human who spares him",
        "id": ""
      },
      {
        "who": "Toriel",
        "rel": "the mother he lost",
        "id": ""
      },
      {
        "who": "Sans",
        "rel": "who quietly watches",
        "id": "c063"
      }
    ]
  },
  "c162": {
    "name": "Kagaya Ubuyashiki",
    "origin": "Demon Slayer",
    "epithet": "The Master of the Corps",
    "rar": "Legendary",
    "camp": "Nature",
    "align": "Good",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      1,
      1,
      9,
      3,
      8,
      1
    ],
    "rank": "C-tier · #4 in Willpower · #24 in Intellect",
    "lore": "Kagaya Ubuyashiki is the frail, dying leader of the Demon Slayer Corps, revered simply as Master. Though bedridden and blind, his calming presence and uncanny foresight bind the fiercely individual Hashira into humanity's shield against Muzan.",
    "quote": "Set your heart at ease. I am always with you.",
    "str": [
      "Inspires absolute loyalty",
      "Uncanny foresight",
      "Unbreakable calm resolve"
    ],
    "wk": [
      "Dying, bedridden body",
      "No combat ability at all",
      "Cursed, short-lived bloodline"
    ],
    "sig_name": "The Master's Voice",
    "sig_desc": "A calming presence that steadies any heart before battle.",
    "playstyle": "Rallies your Good minions",
    "ability": "Ongoing: Give +1/+1 to all friendly Good minions",
    "rivals": [
      {
        "who": "Muzan Kibutsuji",
        "rel": "his ancient sworn enemy",
        "id": ""
      },
      {
        "who": "the Hashira",
        "rel": "the pillars he leads",
        "id": ""
      },
      {
        "who": "the Twelve Kizuki",
        "rel": "the demons he opposes",
        "id": ""
      }
    ]
  },
  "c163": {
    "name": "Angstrom Levy",
    "origin": "Invincible",
    "epithet": "The Multiverse Villain",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#1a86a8",
    "vals": [
      4,
      5,
      6,
      4,
      8,
      4
    ],
    "rank": "C-tier · #24 in Intellect · #97 in Willpower",
    "lore": "Angstrom Levy is a dimension-hopping schemer who merged the memories of countless versions of himself into one mind, gaining a thousand lifetimes of knowledge. Convinced only he can save his world, he becomes obsessed with destroying Invincible.",
    "quote": "I have a thousand minds, and all of them hate you.",
    "str": [
      "Opens portals between universes",
      "Knowledge of a thousand selves",
      "Genius long-game planner"
    ],
    "wk": [
      "Unstable, merged psyche",
      "Obsession clouds his judgment",
      "Physically fragile"
    ],
    "sig_name": "Dimensional Portals",
    "sig_desc": "Tears open doorways between universes at will.",
    "playstyle": "Buffs a Neutral Tech ally",
    "ability": "Ongoing: Give one friendly Neutral Tech minion +2/+2",
    "rivals": [
      {
        "who": "Invincible",
        "rel": "his obsessive target",
        "id": ""
      },
      {
        "who": "the Mauler Twins",
        "rel": "who empowered him",
        "id": ""
      },
      {
        "who": "his other selves",
        "rel": "the minds he merged",
        "id": ""
      }
    ]
  },
  "c164": {
    "name": "Dr. Heinz Doofenshmirtz",
    "origin": "Phineas and Ferb universe",
    "epithet": "The Evil Scientist",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#1a86a8",
    "vals": [
      2,
      2,
      3,
      0,
      6,
      3
    ],
    "rank": "C-tier · #74 in Intellect · #149 in Willpower",
    "lore": "Dr. Heinz Doofenshmirtz is a tragically incompetent mad scientist who builds elaborate '-inator' devices to conquer the Tri-State Area over petty grievances. His grand schemes are foiled daily by a secret-agent platypus, though he's oddly hard not to like.",
    "quote": "Curse you, Perry the Platypus!",
    "str": [
      "Builds working -inators",
      "Endless inventive schemes",
      "Weirdly hard to keep down"
    ],
    "wk": [
      "Schemes always backfire",
      "Tragic incompetence",
      "Sabotages himself constantly"
    ],
    "sig_name": "The -inator",
    "sig_desc": "An over-engineered gadget built for a trivial goal.",
    "playstyle": "Random dice-roll gamble",
    "ability": "Ongoing: Roll a dice: Low roll (1-2) = +1/+1 to all enemies Medium roll (3-5) = +2/+2 to itself High roll (6) = +4/4 to itself",
    "rivals": [
      {
        "who": "Perry the Platypus",
        "rel": "his secret-agent nemesis",
        "id": ""
      },
      {
        "who": "Roger",
        "rel": "his more successful brother",
        "id": "c017"
      },
      {
        "who": "his own inventions",
        "rel": "that always misfire",
        "id": ""
      }
    ]
  },
  "c165": {
    "name": "Mugen & Jin",
    "origin": "Samurai Champloo",
    "epithet": "The Mismatched Swordsmen",
    "rar": "Epic",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      5,
      5,
      6,
      0,
      5,
      7
    ],
    "rank": "C-tier · #35 in Agility · #97 in Willpower",
    "lore": "Mugen and Jin are two swordsmen who could not be more different: one a wild, breakdancing brawler, the other a disciplined, stone-faced ronin. Forced to travel together, they bicker endlessly but fight best watching each other's backs.",
    "quote": "I don't fight to lose.",
    "str": [
      "Wildly unpredictable swordplay",
      "Disciplined classical technique",
      "Deadlier side by side"
    ],
    "wk": [
      "Constantly at each other's throats",
      "Reckless and rigid extremes",
      "Only skilled humans"
    ],
    "sig_name": "Champloo Style",
    "sig_desc": "Mugen's chaotic, improvised breakdancing swordfighting.",
    "playstyle": "Stronger with an ally present",
    "ability": "Passive: Gain +1 ATK if you have another friendly minion on the board",
    "rivals": [
      {
        "who": "each other",
        "rel": "endless bickering rivals",
        "id": ""
      },
      {
        "who": "the assassins",
        "rel": "who hunt them",
        "id": ""
      },
      {
        "who": "Fuu",
        "rel": "their guiding companion",
        "id": ""
      }
    ]
  },
  "c166": {
    "name": "Sir Nighteye",
    "origin": "MHA",
    "epithet": "The Foreseeing Sidekick",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#7a52c8",
    "vals": [
      2,
      3,
      7,
      6,
      8,
      2
    ],
    "rank": "C-tier · #24 in Intellect · #68 in Willpower",
    "lore": "Sir Nighteye is All Might's brilliant former sidekick, whose Foresight quirk lets him witness a person's exact future for a full hour by touch. Analytical and precise, he uses those glimpses to plan the perfect strike, and to test whether fate can be defied.",
    "quote": "The future I saw cannot be changed. Or can it?",
    "str": [
      "Sees a target's exact future",
      "Brilliant analytical mind",
      "Gadget-assisted support"
    ],
    "wk": [
      "Fatalistic about his visions",
      "Weak in direct combat",
      "Foresight drains him"
    ],
    "sig_name": "Foresight",
    "sig_desc": "Witnesses a target's precise future for one hour by touch.",
    "playstyle": "Peeks at the enemy hand",
    "ability": "Ongoing: Randomly choose to reveal 2 cards in your opponent's hand",
    "rivals": [
      {
        "who": "Overhaul",
        "rel": "the villain who killed him",
        "id": ""
      },
      {
        "who": "All Might",
        "rel": "his estranged idol",
        "id": "c073"
      },
      {
        "who": "Mirio Togata",
        "rel": "his devoted protege",
        "id": ""
      }
    ]
  },
  "c167": {
    "name": "Vegapunk",
    "origin": "One Piece",
    "epithet": "Smartest Man in the World",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Good",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#1a86a8",
    "vals": [
      1,
      3,
      6,
      2,
      9,
      1
    ],
    "rank": "C-tier · #4 in Intellect · #97 in Willpower",
    "lore": "Dr. Vegapunk is the greatest scientist alive, a genius whose brain kept growing until his inventions ran centuries ahead of the world. His research quietly shapes every navy, pirate, and weapon on the seas, whether they know it or not.",
    "quote": "My brain never stopped growing.",
    "str": [
      "World's greatest inventor",
      "Centuries-ahead science",
      "Empowers technological allies"
    ],
    "wk": [
      "Physically helpless",
      "No combat ability",
      "A target for every power"
    ],
    "sig_name": "Punk Records",
    "sig_desc": "His network of satellite-minds and world-shaping inventions.",
    "playstyle": "Buffs a Good Tech ally",
    "ability": "Ongoing: Give one friendly Good Tech minion +2/+2",
    "rivals": [
      {
        "who": "the World Government",
        "rel": "his uneasy masters",
        "id": ""
      },
      {
        "who": "Caesar Clown",
        "rel": "rival mad scientist",
        "id": ""
      },
      {
        "who": "the Straw Hats",
        "rel": "unlikely allies",
        "id": ""
      }
    ]
  },
  "c168": {
    "name": "Walter White",
    "origin": "Breaking Bad",
    "epithet": "Heisenberg",
    "rar": "Epic",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      1,
      2,
      8,
      0,
      8,
      1
    ],
    "rank": "C-tier · #25 in Willpower · #24 in Intellect",
    "lore": "Walter White is a mild high-school chemistry teacher who, facing death, transforms into the ruthless meth kingpin Heisenberg. Driven by wounded pride as much as money, his genius and ambition build an empire that consumes everyone he loves.",
    "quote": "Say my name.",
    "str": [
      "Genius chemist",
      "Ruthless strategist",
      "Terrifying, cold resolve"
    ],
    "wk": [
      "Consumed by pride",
      "No physical combat skill",
      "Burns every bridge"
    ],
    "sig_name": "Heisenberg",
    "sig_desc": "The ruthless kingpin persona behind the pristine chemistry.",
    "playstyle": "Buffs your Neutral minions",
    "ability": "Ongoing: Give +1/+1 to all friendly Neutral minions",
    "rivals": [
      {
        "who": "Gus Fring",
        "rel": "cold crime-lord rival",
        "id": ""
      },
      {
        "who": "Hank Schrader",
        "rel": "DEA brother-in-law",
        "id": ""
      },
      {
        "who": "Jesse Pinkman",
        "rel": "partner and protege",
        "id": ""
      }
    ]
  },
  "c169": {
    "name": "An Order of Heavy Knights",
    "origin": "Basic",
    "epithet": "Armored Regiment",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      5,
      6,
      1,
      0,
      2,
      2
    ],
    "rank": "C-tier · #81 in Toughness · #99 in Strength",
    "lore": "An Order of Heavy Knights is a disciplined regiment of armored warriors bound by codes of honor and duty. Advancing behind a wall of shields and lances, they hold the line where lesser soldiers would break and run.",
    "quote": "Honor. Duty. Hold the line.",
    "str": [
      "Disciplined shield formation",
      "Heavy plate armor",
      "Unwavering loyalty"
    ],
    "wk": [
      "Slow and rigid",
      "No special powers",
      "Predictable formations"
    ],
    "sig_name": "Shield Wall",
    "sig_desc": "An interlocked line of steel that refuses to break.",
    "playstyle": "Armored frontline body",
    "ability": "Vanilla beater — no ability.",
    "rivals": [
      {
        "who": "enemy hordes",
        "rel": "whom they hold back",
        "id": ""
      },
      {
        "who": "siege engines",
        "rel": "that batter their walls",
        "id": ""
      },
      {
        "who": "the crown",
        "rel": "the realm they serve",
        "id": ""
      }
    ]
  },
  "c170": {
    "name": "Davy Jones",
    "origin": "Pirates of the Caribbean",
    "epithet": "Captain of the Drowned",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Evil",
    "cost": 1,
    "atk": 1,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      6,
      7,
      6,
      7,
      7,
      4
    ],
    "rank": "B-tier · #57 in Toughness · #65 in Magic",
    "lore": "Davy Jones is the tentacle-faced, immortal captain of the Flying Dutchman, cursed to ferry the dead across the sea. Having carved out his own heart to escape heartbreak, he commands the monstrous Kraken and rules the ocean's deadliest depths.",
    "quote": "Do you fear death?",
    "str": [
      "Immortal cursed body",
      "Commands the mighty Kraken",
      "Master of the open sea"
    ],
    "wk": [
      "His heart in a hidden chest",
      "Bound by an ancient oath",
      "Tormented by lost love"
    ],
    "sig_name": "The Kraken",
    "sig_desc": "Summons the sea leviathan to drag whole ships under.",
    "playstyle": "Taunting sea-cursed wall",
    "ability": "Taunt",
    "rivals": [
      {
        "who": "Jack Sparrow",
        "rel": "the debtor he hunts",
        "id": ""
      },
      {
        "who": "Will Turner",
        "rel": "who claims his heart",
        "id": ""
      },
      {
        "who": "Calypso",
        "rel": "the love who betrayed him",
        "id": ""
      }
    ]
  },
  "c171": {
    "name": "Goblins",
    "origin": "Basic",
    "epithet": "The Swarming Horde",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 1,
    "atk": 2,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      2,
      2,
      1,
      0,
      2,
      4
    ],
    "rank": "C-tier · #111 in Agility · #149 in Strength",
    "lore": "Goblins are small, vicious fantasy creatures too weak to matter one at a time, but terrifying in a screeching mob. They fight dirty, run when losing, and overwhelm bigger foes through sheer, chittering numbers.",
    "quote": "Get 'em, lads!",
    "str": [
      "Attack in overwhelming swarms",
      "Quick and sneaky",
      "Endless numbers"
    ],
    "wk": [
      "Pathetic one on one",
      "Cowardly, break easily",
      "Scattered by a strong blow"
    ],
    "sig_name": "Swarm",
    "sig_desc": "Overwhelms through sheer chittering numbers.",
    "playstyle": "Cheap taunting chaff",
    "ability": "Taunt",
    "rivals": [
      {
        "who": "adventurers",
        "rel": "who cull them",
        "id": ""
      },
      {
        "who": "heroes",
        "rel": "their usual foes",
        "id": "c062"
      },
      {
        "who": "larger monsters",
        "rel": "that devour them",
        "id": ""
      }
    ]
  },
  "c172": {
    "name": "Mr. Poopybutthole",
    "origin": "Rick and Morty",
    "epithet": "He Was There All Along",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 2,
    "cc": "#2f9c63",
    "vals": [
      1,
      4,
      4,
      4,
      3,
      2
    ],
    "rank": "C-tier · #133 in Toughness · #143 in Willpower",
    "lore": "Mr. Poopybutthole is a cheerful, mysterious friend who has apparently been part of the family for years, though no one can quite explain when he arrived. He survives a gunshot, breaks the fourth wall, and hints at a nature far stranger than he lets on.",
    "quote": "Oooh wee!",
    "str": [
      "Mysteriously resilient",
      "Endures the unexpected",
      "Secretly significant"
    ],
    "wk": [
      "Seems utterly harmless",
      "Non-combative",
      "Easily overlooked"
    ],
    "sig_name": "",
    "sig_desc": "A hidden depth that no one quite understands.",
    "playstyle": "Grants a minion Taunt",
    "ability": "Ongoing: Give a minion Taunt",
    "rivals": [
      {
        "who": "Rick Sanchez",
        "rel": "who once shot him",
        "id": ""
      },
      {
        "who": "Beth Smith",
        "rel": "his beloved",
        "id": ""
      },
      {
        "who": "the Smith family",
        "rel": "his true home",
        "id": ""
      }
    ]
  },
  "c173": {
    "name": "Nezu",
    "origin": "MHA",
    "epithet": "The Genius Principal",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Good",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      3,
      3,
      7,
      2,
      9,
      5
    ],
    "rank": "C-tier · #4 in Intellect · #68 in Willpower",
    "lore": "Nezu is the small animal principal of U.A. High, blessed with the High Spec quirk that grants him intelligence far beyond any human. Cheerful and unpredictable, he outthinks armies from behind a teacup, never letting anyone forget what cruelty once caged him.",
    "quote": "I could tell you my plan, but where's the fun?",
    "str": [
      "Super-intelligent strategist",
      "Master long-game planner",
      "Endlessly resourceful"
    ],
    "wk": [
      "Tiny, physically frail",
      "Holds old grudges",
      "No direct combat power"
    ],
    "sig_name": "High Spec",
    "sig_desc": "A quirk granting near-boundless intelligence.",
    "playstyle": "Draws you a card",
    "ability": "Ongoing: Draw 1 card",
    "rivals": [
      {
        "who": "All For One",
        "rel": "the threat he outplans",
        "id": "c071"
      },
      {
        "who": "the villains",
        "rel": "whom he outmaneuvers",
        "id": ""
      },
      {
        "who": "humanity",
        "rel": "that once caged him",
        "id": ""
      }
    ]
  },
  "c174": {
    "name": "Shibukawa",
    "origin": "Baki",
    "epithet": "The Aikido Master",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      3,
      3,
      6,
      0,
      8,
      6
    ],
    "rank": "C-tier · #24 in Intellect · #97 in Willpower",
    "lore": "Goki Shibukawa is an elderly aikido master who topples fighters twice his size using nothing but flawless technique and joint control. Where others meet strength with strength, he simply redirects it, letting brutes defeat themselves.",
    "quote": "Strength means nothing to true technique.",
    "str": [
      "Master aikido technique",
      "Redirects brute strength",
      "Deceptively harmless frame"
    ],
    "wk": [
      "Aged, low raw power",
      "Vulnerable if seized first",
      "Relies on the enemy attacking"
    ],
    "sig_name": "Aiki",
    "sig_desc": "Redirects an opponent's own force to topple them.",
    "playstyle": "Shielded silencer",
    "ability": "Divine Shield Ongoing: Silence one enemy minion of your choice",
    "rivals": [
      {
        "who": "Yujiro Hanma",
        "rel": "the ogre he studied",
        "id": "c033"
      },
      {
        "who": "Baki Hanma",
        "rel": "the young fighter",
        "id": ""
      },
      {
        "who": "the underground arena",
        "rel": "where he tests skill",
        "id": ""
      }
    ]
  },
  "c175": {
    "name": "V",
    "origin": "V for Vendetta",
    "epithet": "The Masked Revolutionary",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 1,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      5,
      6,
      9,
      0,
      8,
      7
    ],
    "rank": "B-tier · #4 in Willpower · #24 in Intellect",
    "lore": "V is a masked anarchist in a Guy Fawkes grin, a brilliant and theatrical avenger waging a one-man war to topple a fascist regime. Scarred survivor of the state's own cruelty, he becomes a symbol that no bullet or blade can truly kill.",
    "quote": "Ideas are bulletproof.",
    "str": [
      "Master planner and fighter",
      "Unbreakable conviction",
      "A symbol beyond one man"
    ],
    "wk": [
      "Consumed by his vendetta",
      "Only human beneath the mask",
      "Walks a martyr's path"
    ],
    "sig_name": "The Idea",
    "sig_desc": "A symbol of defiance that cannot be killed.",
    "playstyle": "Shielded taunting martyr",
    "ability": "Divine Shield Taunt",
    "rivals": [
      {
        "who": "the Norsefire regime",
        "rel": "the tyranny he targets",
        "id": ""
      },
      {
        "who": "Peter Creedy",
        "rel": "the enforcer he hunts",
        "id": ""
      },
      {
        "who": "Evey Hammond",
        "rel": "his reluctant protege",
        "id": ""
      }
    ]
  },
  "c176": {
    "name": "Meteor",
    "origin": "Astronomy",
    "epithet": "A Visitor from Deep Space",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 8,
    "atk": 4,
    "hp": 3,
    "cc": "#79c66a",
    "vals": [
      10,
      8,
      1,
      0,
      4,
      2
    ],
    "rank": "Astronomy · Stony meteoroid",
    "lore": "A meteor is the visible passage of a meteoroid through an atmosphere. Friction turns its descent into light, while the surviving mass may reach the ground as a meteorite.",
    "quote": "The sky writes in fire.",
    "str": [
      "Extreme kinetic energy",
      "Can survive atmospheric entry",
      "Leaves a measurable impact"
    ],
    "wk": [
      "Ablates in an atmosphere",
      "Can fragment before impact",
      "Has no agency or intention"
    ],
    "sig_name": "Atmospheric Entry",
    "sig_desc": "A streak of ionized gas marks a piece of space meeting a world.",
    "playstyle": "An impersonal event of speed and gravity",
    "ability": "A meteoroid becomes luminous when atmospheric ablation excites the surrounding air.",
    "rivals": [
      {
        "who": "The asteroid belt",
        "rel": "its possible birthplace",
        "id": ""
      },
      {
        "who": "Earth's atmosphere",
        "rel": "the passage that reveals it",
        "id": ""
      }
    ]
  },
  "c177": {
    "name": "Planetary Defense Grid",
    "origin": "Science fiction",
    "epithet": "The Orbital Shield",
    "rar": "Rare",
    "camp": "Tech",
    "align": "Neutral",
    "cost": 9,
    "atk": 4,
    "hp": 8,
    "cc": "#70c9ff",
    "vals": [
      7,
      10,
      6,
      5,
      8,
      8
    ],
    "rank": "Science fiction · Planetary defense network",
    "lore": "A planetary defense grid is a network of sensors, tracking systems, and interceptors built to detect threats before they reach a inhabited world. Its strength is coordination across distance.",
    "quote": "The world below gets another minute.",
    "str": [
      "Persistent surveillance",
      "Works across enormous distances",
      "Combines many systems into one response"
    ],
    "wk": [
      "Depends on working infrastructure",
      "Requires warning time",
      "A blind spot can defeat the network"
    ],
    "sig_name": "Orbital Intercept",
    "sig_desc": "A tracked object meets a guided response beyond the atmosphere.",
    "playstyle": "A patient guardian of a fragile world",
    "ability": "A fictional defense network uses orbital assets to detect and intercept incoming objects.",
    "rivals": [
      {
        "who": "An incoming asteroid",
        "rel": "the threat it tracks",
        "id": ""
      },
      {
        "who": "The atmosphere",
        "rel": "the last line beneath it",
        "id": ""
      }
    ]
  },
  "c178": {
    "name": "Black Hole",
    "origin": "Astrophysics",
    "epithet": "The Point of No Return",
    "rar": "Rare",
    "camp": "Magic",
    "align": "Neutral",
    "cost": 10,
    "atk": 7,
    "hp": 4,
    "cc": "#b996ff",
    "vals": [
      10,
      10,
      8,
      0,
      10,
      1
    ],
    "rank": "Astrophysics · Gravitational singularity",
    "lore": "A black hole is a region of spacetime whose gravity prevents anything that crosses its event horizon from escaping. Matter outside it can form a luminous accretion disk while the hole itself remains dark.",
    "quote": "Nothing escapes the event horizon.",
    "str": [
      "Produces extraordinary gravity",
      "Can power a bright accretion disk",
      "Distorts light and time nearby"
    ],
    "wk": [
      "Cannot be observed directly",
      "Its interior is hidden beyond the horizon",
      "Evaporation is unimaginably slow for stellar holes"
    ],
    "sig_name": "Event Horizon",
    "sig_desc": "The boundary where escape would require moving faster than light.",
    "playstyle": "A patient force of spacetime rather than a thinking being",
    "ability": "A black hole curves spacetime so strongly that the event horizon becomes a one-way boundary.",
    "rivals": [
      {
        "who": "Hawking radiation",
        "rel": "theoretical loss over deep time",
        "id": ""
      },
      {
        "who": "A neutron star",
        "rel": "another extreme stellar remnant",
        "id": ""
      }
    ]
  },
  "c179": {
    "name": "Rudeus Greyrat",
    "origin": "Mushoku Tensei",
    "epithet": "The Quagmire",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 4,
    "atk": 2,
    "hp": 2,
    "cc": "#b996ff",
    "vals": [
      6,
      5,
      8,
      10,
      10,
      7
    ],
    "rank": "Mushoku Tensei · Silent spellcaster",
    "lore": "Rudeus Greyrat is a shut-in reborn in a world of magic, determined to use a second life better than the first. Under Roxy's teaching he becomes an exceptional mage, while his family, friends, and the mana catastrophe force him to grow beyond talent.",
    "quote": "I will not waste this life.",
    "str": [
      "Prodigious mana reserves",
      "Silent spellcasting",
      "Broad knowledge of elemental magic"
    ],
    "wk": [
      "Carries deep social and personal trauma",
      "Relies on preparation and distance",
      "His confidence can become recklessness"
    ],
    "sig_name": "Stone Cannon",
    "sig_desc": "A compressed earth spell refined through control, range, and destructive force.",
    "playstyle": "A calculating reincarnate learning responsibility",
    "ability": "Rudeus is known for silent casting and advanced elemental magic, especially his Stone Cannon.",
    "rivals": [
      {
        "who": "Roxy Migurdia",
        "rel": "teacher and first magical guide",
        "id": ""
      },
      {
        "who": "Sylphiette",
        "rel": "childhood friend and partner",
        "id": ""
      },
      {
        "who": "Orsted",
        "rel": "a terrifying turning point in his journey",
        "id": ""
      }
    ]
  },
  "c180": {
    "name": "Prince Lloyd",
    "origin": "7th Prince",
    "epithet": "The Magic Prodigy",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 6,
    "atk": 2,
    "hp": 2,
    "cc": "#b996ff",
    "vals": [
      4,
      5,
      8,
      10,
      10,
      7
    ],
    "rank": "7th Prince · Magical researcher",
    "lore": "Lloyd de Saloum is reborn as the seventh prince and treats magic as the one subject worthy of total attention. His curiosity, immense talent, and willingness to test dangerous theories make him brilliant, troublesome, and impossible to discourage.",
    "quote": "Let me perfect this spell.",
    "str": [
      "Exceptional magical aptitude",
      "Relentless curiosity",
      "Learns by testing first principles"
    ],
    "wk": [
      "Treats danger as a research opportunity",
      "Can neglect ordinary social judgment",
      "His obsession isolates him"
    ],
    "sig_name": "Perfected Formula",
    "sig_desc": "A spell is taken apart, understood, and rebuilt beyond its original limits.",
    "playstyle": "An irrepressible royal scholar",
    "ability": "Lloyd's defining talent is the obsessive study and refinement of magical techniques.",
    "rivals": [
      {
        "who": "Sylpha",
        "rel": "loyal attendant and training partner",
        "id": ""
      },
      {
        "who": "Tao",
        "rel": "friend and fellow learner",
        "id": ""
      },
      {
        "who": "The Saloum royal family",
        "rel": "his home and responsibility",
        "id": ""
      }
    ]
  },
  "c181": {
    "name": "Motoko Kusanagi",
    "origin": "Ghost in the Shell",
    "epithet": "The Major",
    "rar": "Legendary",
    "camp": "Tech",
    "align": "Good",
    "cost": 4,
    "atk": 2,
    "hp": 1,
    "cc": "#70c9ff",
    "vals": [
      8,
      7,
      9,
      8,
      10,
      10
    ],
    "rank": "Ghost in the Shell · Section 9 commander",
    "lore": "Motoko Kusanagi is a full-body cyborg and the field commander of Japan's Public Security Section 9. She moves between physical and networked space while questioning what remains of a person when the body, memories, and identity can all be engineered.",
    "quote": "The net is vast and infinite.",
    "str": [
      "Elite tactical judgment",
      "Deep cyberbrain access",
      "Comfortable in both physical and digital combat"
    ],
    "wk": [
      "Her body and memories can be compromised",
      "Identity is a continuing uncertainty",
      "Isolation follows exceptional capability"
    ],
    "sig_name": "Ghost Dive",
    "sig_desc": "A conscious descent into a network where information and identity share one space.",
    "playstyle": "A disciplined investigator of the human-machine boundary",
    "ability": "Motoko's signature capabilities come from her cyberbrain, prosthetic body, and network infiltration skills.",
    "rivals": [
      {
        "who": "Batou",
        "rel": "trusted field partner",
        "id": ""
      },
      {
        "who": "Daisuke Aramaki",
        "rel": "chief and strategic superior",
        "id": ""
      },
      {
        "who": "The Puppet Master",
        "rel": "a crisis of consciousness and identity",
        "id": ""
      }
    ]
  },
  "c182": {
    "name": "Xenomorph Queen",
    "origin": "Alien",
    "epithet": "The Hive Mother",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Evil",
    "cost": 4,
    "atk": 1,
    "hp": 4,
    "cc": "#2f9c63",
    "vals": [
      8,
      9,
      8,
      0,
      6,
      7
    ],
    "rank": "Alien · Hive matriarch",
    "lore": "The Xenomorph Queen is the reproductive center of an alien hive, an immense organism that produces the next generation and defends its nest with terrifying force. Her intelligence is strategic rather than human, expressed through pheromones, instinct, and absolute control of the colony's survival.",
    "quote": "The hive survives.",
    "str": [
      "Commands a lethal hive",
      "Enormous physical strength",
      "Armored body and corrosive blood"
    ],
    "wk": [
      "Protects the nest above all else",
      "Large target in open terrain",
      "Reproduction binds her to the hive"
    ],
    "sig_name": "Royal Brood",
    "sig_desc": "A living colony turns every death around the nest into another body.",
    "playstyle": "A biological engine of sacrifice and relentless growth",
    "ability": "The Xenomorph Queen produces and directs the organisms that make an alien hive.",
    "rivals": [
      {
        "who": "Ellen Ripley",
        "rel": "survivor who refuses to let the hive spread",
        "id": ""
      },
      {
        "who": "The Colonial Marines",
        "rel": "soldiers who enter her nest",
        "id": ""
      },
      {
        "who": "The alien hive",
        "rel": "the colony she creates and protects",
        "id": ""
      }
    ]
  },
  "c183": {
    "name": "Naruto",
    "origin": "Naruto",
    "epithet": "The Child of Prophecy",
    "rar": "Legendary",
    "camp": "Magic",
    "align": "Good",
    "cost": 8,
    "atk": 2,
    "hp": 2,
    "cc": "#f0c767",
    "vals": [
      9,
      9,
      8,
      10,
      10,
      9
    ],
    "rank": "Naruto · Nine-Tails jinchūriki",
    "lore": "Naruto Uzumaki begins as an outcast and grows into a leader capable of carrying the hopes of entire nations. His shadow clones, Rasengan, bond with Kurama, and Six Paths power turn persistence into world-changing strength.",
    "quote": "I never go back on my word.",
    "str": [
      "Vast chakra reserves",
      "Shadow Clone technique",
      "Refuses to abandon a friend"
    ],
    "wk": [
      "Overextends to protect others",
      "Must balance many responsibilities",
      "Compassion leaves him open to manipulation"
    ],
    "sig_name": "Shadow Clone Jutsu",
    "sig_desc": "One fighter becomes a formation of solid copies that share experience and overwhelm a battlefield.",
    "playstyle": "A relentless leader who turns one fighter into a whole formation",
    "ability": "Naruto's signature Shadow Clone Technique creates solid copies that share his experience and overwhelm a battlefield.",
    "rivals": [
      {
        "who": "Sasuke Uchiha",
        "rel": "rival and closest bond",
        "id": ""
      },
      {
        "who": "Kurama",
        "rel": "the beast who becomes his partner",
        "id": ""
      },
      {
        "who": "The Ten-Tails",
        "rel": "the war-born threat he helps stop",
        "id": "c057"
      }
    ]
  },
  "c184": {
    "name": "Frieren",
    "origin": "Frieren: Beyond Journey's End",
    "epithet": "The Mage Who Outlives Time",
    "rar": "Epic",
    "camp": "Magic",
    "align": "Good",
    "cost": 6,
    "atk": 2,
    "hp": 5,
    "cc": "#b996ff",
    "vals": [
      4,
      8,
      9,
      10,
      10,
      8
    ],
    "rank": "Frieren · Elven archmage",
    "lore": "Frieren is an elven mage whose long life lets her study magic across centuries. After the Hero Himmel's journey ends, she begins a new journey of understanding, collecting spells, remembering people, and learning what brief human lives mean to her.",
    "quote": "I want to learn a spell.",
    "str": [
      "Centuries of magical knowledge",
      "Patient preparation",
      "Exceptional mana concealment"
    ],
    "wk": [
      "Slow to recognise emotional bonds",
      "Can underestimate short-lived lives",
      "Often pursues curiosity before convenience"
    ],
    "sig_name": "Zoltraak",
    "sig_desc": "A once-lethal demon spell becomes a familiar tool through patient analysis and mastery.",
    "playstyle": "A patient archivist whose power grows through knowledge",
    "ability": "Frieren's magic combines immense experience, precise analysis, and a collection of spells gathered over a long life.",
    "rivals": [
      {
        "who": "Himmel",
        "rel": "the hero whose memory reshapes her journey",
        "id": ""
      },
      {
        "who": "Flamme",
        "rel": "the teacher who hides her power from demons",
        "id": ""
      },
      {
        "who": "Fern",
        "rel": "the apprentice who keeps her moving forward",
        "id": ""
      }
    ]
  },
  "c185": {
    "name": "Guts",
    "origin": "Berserk",
    "epithet": "The Black Swordsman",
    "rar": "Rare",
    "camp": "Nature",
    "align": "Neutral",
    "cost": 2,
    "atk": 1,
    "hp": 1,
    "cc": "#2f9c63",
    "vals": [
      9,
      8,
      8,
      0,
      6,
      10
    ],
    "rank": "Berserk · Wandering swordsman",
    "lore": "Guts is a mercenary who survives betrayal, war, and the designs of monsters through stubborn strength and relentless skill. The Dragonslayer and the Berserker Armor let him challenge apostles, but every victory extracts a physical and emotional price.",
    "quote": "Struggle, endure, and move forward.",
    "str": [
      "Exceptional swordsmanship",
      "Refuses impossible odds",
      "Turns pain into momentum"
    ],
    "wk": [
      "The Berserker Armor damages him",
      "Carries deep trauma",
      "A human body has limits"
    ],
    "sig_name": "Dragonslayer",
    "sig_desc": "A great iron sword made for monsters becomes the answer to anything that stands in his path.",
    "playstyle": "A wounded survivor who becomes stronger when the world closes in",
    "ability": "Guts fights with the Dragonslayer, a cannon arm, and a will that keeps moving after ordinary endurance is gone.",
    "rivals": [
      {
        "who": "Griffith",
        "rel": "friend and betrayer at the center of his trauma",
        "id": ""
      },
      {
        "who": "Casca",
        "rel": "the person he protects through the darkness",
        "id": ""
      },
      {
        "who": "Zodd",
        "rel": "an apostle who recognises his strength",
        "id": ""
      }
    ]
  },
  "r001": {
    "name": "The Holy Grail",
    "origin": "Arthurian Legend",
    "epithet": "The Vessel of the Quest",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 5,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      7,
      8,
      10,
      8,
      8,
      3
    ],
    "rank": "Arthurian legend · Sacred vessel",
    "lore": "The Holy Grail is a sacred vessel whose identity changes across medieval romances and later tradition. In Arthurian stories it becomes the object of a quest that tests purity, courage, and spiritual insight rather than simple strength.",
    "quote": "The road matters as much as the cup.",
    "str": [
      "Carries immense spiritual symbolism",
      "Calls for the highest kind of quest",
      "Endures through many retellings"
    ],
    "wk": [
      "Its form is uncertain",
      "Its location is unreachable by ordinary means",
      "The quest can expose the seeker's unworthiness"
    ],
    "sig_name": "The Grail Quest",
    "sig_desc": "A sacred search that turns a knight's character into the measure of success.",
    "playstyle": "An elusive symbol of grace and fulfillment",
    "ability": "The Grail is traditionally associated with sacred nourishment, revelation, and the test of the worthy seeker.",
    "rivals": [
      {
        "who": "Galahad",
        "rel": "the pure knight who finds it",
        "id": ""
      },
      {
        "who": "King Arthur",
        "rel": "the court whose knights pursue it",
        "id": ""
      },
      {
        "who": "Joseph of Arimathea",
        "rel": "a Christian origin in later tradition",
        "id": ""
      }
    ]
  },
  "r002": {
    "name": "Lostvayne",
    "origin": "Seven Deadly Sins",
    "epithet": "Meliodas's Sacred Treasure",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 3,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      8,
      5,
      7,
      3,
      5,
      8
    ],
    "rank": "Seven Deadly Sins · Demon sword",
    "lore": "Lostvayne is the sacred treasure of Meliodas, a short demon sword tied to his fighting style and the power of reflected magic. It represents the captain's violent history as much as his skill and loyalty to the Seven Deadly Sins.",
    "quote": "A captain's blade remembers.",
    "str": [
      "Belongs to an extraordinary swordsman",
      "Supports clone-based combat techniques",
      "Carries the weight of Meliodas's past"
    ],
    "wk": [
      "Its power is tied to its wielder",
      "Clones divide the original's strength",
      "Its demonic history invites fear"
    ],
    "sig_name": "Lostvayne's Clones",
    "sig_desc": "The sacred treasure multiplies its wielder's presence at the price of divided power.",
    "playstyle": "A personal weapon shaped by a demon captain's restraint",
    "ability": "Lostvayne is Meliodas's sacred treasure and enables his physical clone technique.",
    "rivals": [
      {
        "who": "Meliodas",
        "rel": "its chosen wielder",
        "id": ""
      },
      {
        "who": "The Demon King",
        "rel": "the origin of his demonic legacy",
        "id": ""
      },
      {
        "who": "Elizabeth",
        "rel": "the bond behind his change",
        "id": ""
      }
    ]
  },
  "r003": {
    "name": "One Ring",
    "origin": "The Lord of the Rings",
    "epithet": "The Ruling Ring",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 4,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      8,
      7,
      10,
      8,
      9,
      5
    ],
    "rank": "Middle-earth · Ring of Power",
    "lore": "The One Ring is Sauron's instrument of domination, forged in the fires of Orodruin to control the other Rings of Power. Its promise of strength is inseparable from corruption, and its destruction requires returning it to the fire that made it.",
    "quote": "One Ring to rule them all.",
    "str": [
      "Grants invisibility to a mortal wearer",
      "Amplifies the will of its master",
      "Can dominate lesser Rings"
    ],
    "wk": [
      "Corrupts those who carry it",
      "Its power depends on Sauron",
      "Can be destroyed only in its forging fire"
    ],
    "sig_name": "The Ring's Seduction",
    "sig_desc": "A promise of power turns the bearer's own desire into the road home.",
    "playstyle": "A beautiful object that makes possession a moral crisis",
    "ability": "The One Ring grants invisibility and magnifies the power of its maker, while corrupting its bearer.",
    "rivals": [
      {
        "who": "Sauron",
        "rel": "maker and true master",
        "id": ""
      },
      {
        "who": "Frodo Baggins",
        "rel": "bearer during its final journey",
        "id": ""
      },
      {
        "who": "Gollum",
        "rel": "its long-corrupted former keeper",
        "id": ""
      }
    ]
  },
  "r005": {
    "name": "Infinity Stone",
    "origin": "Marvel Cinematic Universe",
    "epithet": "A Fragment of Cosmic Law",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 3,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      8,
      5,
      9,
      10,
      8,
      6
    ],
    "rank": "MCU · Infinity Stone",
    "lore": "An Infinity Stone is one of six primordial crystals formed at the beginning of the universe. Each embodies a fundamental aspect of existence, and together they can reshape life on a cosmic scale.",
    "quote": "The universe is written in six laws.",
    "str": [
      "Embodies a fundamental force",
      "Can be wielded on a cosmic scale",
      "Connects distant worlds and eras"
    ],
    "wk": [
      "A single Stone is incomplete",
      "Its power can destroy its wielder",
      "Concentration of the Stones invites conquest"
    ],
    "sig_name": "The Snap",
    "sig_desc": "The six Stones act together to turn a thought into a universal event.",
    "playstyle": "A cosmic artifact whose meaning depends on which force it contains",
    "ability": "The six Infinity Stones govern Space, Mind, Reality, Power, Time, and Soul in the Marvel Cinematic Universe.",
    "rivals": [
      {
        "who": "Thanos",
        "rel": "collector who seeks the complete set",
        "id": ""
      },
      {
        "who": "The Avengers",
        "rel": "defenders against its misuse",
        "id": ""
      },
      {
        "who": "The Eternals",
        "rel": "beings shaped by the same cosmic history",
        "id": ""
      }
    ]
  },
  "r006": {
    "name": "White Whistle",
    "origin": "Made in Abyss",
    "epithet": "The Sovereign's Call",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 3,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      5,
      6,
      9,
      8,
      8,
      4
    ],
    "rank": "Made in Abyss · Delver's relic",
    "lore": "A White Whistle is the relic of a legendary cave raider, made from a human life and recognized by the Abyss as a symbol of authority. It grants access to the deepest layers while binding exploration to sacrifice.",
    "quote": "The Abyss answers the brave and the cruel alike.",
    "str": [
      "Marks the highest rank of delver",
      "Opens the path to deeper layers",
      "Carries the will of a sacrificed person"
    ],
    "wk": [
      "Requires an irreversible sacrifice",
      "The Abyss remains hostile",
      "Authority does not protect against the curse"
    ],
    "sig_name": "The Sovereign's Call",
    "sig_desc": "A whistle made from a life gives its owner permission to descend farther.",
    "playstyle": "A badge of wonder, horror, and irreversible commitment",
    "ability": "White Whistles are made from human souls and identify the highest-ranked cave raiders in Made in Abyss.",
    "rivals": [
      {
        "who": "Riko",
        "rel": "young delver carrying Lyza's whistle",
        "id": ""
      },
      {
        "who": "Lyza the Annihilator",
        "rel": "legendary White Whistle and mother",
        "id": ""
      },
      {
        "who": "Bondrewd",
        "rel": "a White Whistle whose experiments redefine sacrifice",
        "id": ""
      }
    ]
  },
  "r007": {
    "name": "Chamber of Secrets",
    "origin": "Harry Potter",
    "epithet": "The Hidden Serpent's Door",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 3,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      6,
      7,
      8,
      9,
      7,
      2
    ],
    "rank": "Wizarding World · Slytherin's secret",
    "lore": "The Chamber of Secrets is a hidden chamber beneath Hogwarts built by Salazar Slytherin. It contains a Basilisk and can be opened by the heir of Slytherin through Parseltongue, turning an old prejudice into a living threat.",
    "quote": "Enemies of the heir, beware.",
    "str": [
      "Conceals an ancient magical weapon",
      "Links architecture to Parseltongue",
      "Reveals Hogwarts's unresolved history"
    ],
    "wk": [
      "Depends on a particular heir",
      "Its monster can be opposed",
      "Its ideology isolates its creator"
    ],
    "sig_name": "The Basilisk's Awakening",
    "sig_desc": "A serpent older than the school rises when the hidden language is spoken.",
    "playstyle": "A secret legacy that turns fear into architecture",
    "ability": "The Chamber houses Salazar Slytherin's Basilisk and opens through the heir's Parseltongue.",
    "rivals": [
      {
        "who": "Salazar Slytherin",
        "rel": "builder and ideological origin",
        "id": ""
      },
      {
        "who": "Tom Riddle",
        "rel": "heir who reopens the Chamber",
        "id": ""
      },
      {
        "who": "Harry Potter",
        "rel": "student who defeats its Basilisk",
        "id": ""
      }
    ]
  },
  "r008": {
    "name": "Cyber-Enchantment",
    "origin": "Cyberpunk fantasy",
    "epithet": "The Wired Ward",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 3,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      5,
      7,
      7,
      8,
      9,
      6
    ],
    "rank": "Cyberpunk fantasy · Arcane interface",
    "lore": "Cyber-Enchantment is the old fantasy dream translated into circuitry: a ward encoded as a living protocol, a spell that travels through a network instead of a ley line.",
    "quote": "The network remembers the spell.",
    "str": [
      "Marries symbolic magic with systems thinking",
      "Can protect information and identity",
      "Makes invisible structures legible"
    ],
    "wk": [
      "Depends on a compatible system",
      "A corrupted network corrupts the spell",
      "The interface can obscure the human cost"
    ],
    "sig_name": "Firewall Halo",
    "sig_desc": "An arcane boundary becomes a defensive loop around a connected mind.",
    "playstyle": "A speculative bridge between ritual and code",
    "ability": "Cyber-enchantment is a fantasy archetype in which magical wards are expressed through technology and networks.",
    "rivals": [
      {
        "who": "The golem",
        "rel": "an older artificial life archetype",
        "id": ""
      },
      {
        "who": "The firewall",
        "rel": "its technological counterpart",
        "id": ""
      }
    ]
  },
  "r009": {
    "name": "Ea",
    "origin": "Fate",
    "epithet": "Sword of Rupture",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 3,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      10,
      4,
      7,
      9,
      7,
      8
    ],
    "rank": "Fate · Noble Phantasm of Gilgamesh",
    "lore": "Ea is the ancient sword wielded by Gilgamesh in the Fate series. Its rotating body represents the primordial separation of heaven and earth, and its Noble Phantasm, Enuma Elish, tears at the world's texture.",
    "quote": "The world has a seam.",
    "str": [
      "Represents creation before recorded history",
      "Belongs to the King of Heroes",
      "Its attack is conceptual as well as physical"
    ],
    "wk": [
      "Only Gilgamesh fully claims it",
      "Its pride isolates its wielder",
      "Its greatest release is difficult to control"
    ],
    "sig_name": "Enuma Elish",
    "sig_desc": "The Sword of Rupture rotates against the world and recreates the memory of its separation.",
    "playstyle": "A king's relic that treats reality as an artifact",
    "ability": "Ea is Gilgamesh's Noble Phantasm, and Enuma Elish is its anti-world release.",
    "rivals": [
      {
        "who": "Gilgamesh",
        "rel": "its sole recognized wielder",
        "id": ""
      },
      {
        "who": "Enkidu",
        "rel": "the king's closest equal",
        "id": ""
      },
      {
        "who": "Iskandar",
        "rel": "another king who challenges his pride",
        "id": ""
      }
    ]
  },
  "r010": {
    "name": "Elder wand",
    "origin": "Harry Potter",
    "epithet": "The Unbeatable Wand",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 1,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      5,
      4,
      8,
      10,
      8,
      6
    ],
    "rank": "Wizarding World · Deathly Hallow",
    "lore": "The Elder Wand is one of the three Deathly Hallows, made by Death in the tale told to the Peverell brothers. Its reputation as the most powerful wand makes allegiance more important than possession.",
    "quote": "The last word is mine.",
    "str": [
      "Channels exceptionally powerful magic",
      "Carries the myth of unbeatable skill",
      "Its allegiance can change history"
    ],
    "wk": [
      "Can be won without being stolen",
      "Its reputation encourages violence",
      "A wand is not a substitute for judgment"
    ],
    "sig_name": "The Wand's Allegiance",
    "sig_desc": "The wand's true loyalty follows defeat, not the hand that simply takes it.",
    "playstyle": "A legendary instrument whose power creates its own temptation",
    "ability": "The Elder Wand is unusually powerful, but its allegiance passes to the person who defeats its master.",
    "rivals": [
      {
        "who": "Antioch Peverell",
        "rel": "legendary first owner",
        "id": ""
      },
      {
        "who": "Albus Dumbledore",
        "rel": "keeper who defeats Grindelwald",
        "id": ""
      },
      {
        "who": "Harry Potter",
        "rel": "last wielder in the Hallows story",
        "id": ""
      }
    ]
  },
  "r011": {
    "name": "Monster Cell",
    "origin": "One Punch Man",
    "epithet": "The Mutation Seed",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 2,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      8,
      7,
      6,
      3,
      5,
      5
    ],
    "rank": "One Punch Man · Monsterization agent",
    "lore": "Monster Cells are created by the Monster Association to transform humans into monsters. Eating one can unlock a person's suppressed obsession, but the change usually means surrendering human identity for power.",
    "quote": "What would you become to win?",
    "str": [
      "Amplifies a person's latent fixation",
      "Can create dramatic physical transformation",
      "Reflects the psychology of its host"
    ],
    "wk": [
      "The change can erase humanity",
      "The result depends on the host",
      "Power brings no guarantee of purpose"
    ],
    "sig_name": "Monsterization",
    "sig_desc": "An appetite or obsession is given a body large enough to rule the person who had it.",
    "playstyle": "A dangerous shortcut from frustration to identity",
    "ability": "Monster Cells transform humans into monsters by amplifying their desires and physical potential.",
    "rivals": [
      {
        "who": "Orochi",
        "rel": "Monster King shaped by the Association",
        "id": ""
      },
      {
        "who": "Garou",
        "rel": "a human who pursues monsterization by another path",
        "id": ""
      },
      {
        "who": "Saitama",
        "rel": "the human ideal the monsters cannot understand",
        "id": ""
      }
    ]
  },
  "r012": {
    "name": "Philosopher's Stone",
    "origin": "Harry Potter",
    "epithet": "The Red Stone of Alchemy",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 4,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      5,
      7,
      9,
      10,
      9,
      2
    ],
    "rank": "Wizarding World · Alchemical masterpiece",
    "lore": "The Philosopher's Stone is an alchemical object capable of producing the Elixir of Life and turning any metal into pure gold. In the wizarding world it is made by Nicolas Flamel, whose long life becomes inseparable from the stone's fate.",
    "quote": "There are other ways to live forever.",
    "str": [
      "Represents the height of alchemical craft",
      "Produces the Elixir of Life",
      "Turns transformation into a literal object"
    ],
    "wk": [
      "Its existence invites obsession",
      "The maker must choose when to destroy it",
      "Immortality cannot solve moral emptiness"
    ],
    "sig_name": "The Elixir of Life",
    "sig_desc": "A red draught postpones death while the stone remains in the world.",
    "playstyle": "A quiet answer to the fantasy of immortality",
    "ability": "The Philosopher's Stone creates the Elixir of Life and transmutes base metals into gold.",
    "rivals": [
      {
        "who": "Nicolas Flamel",
        "rel": "its creator and keeper",
        "id": ""
      },
      {
        "who": "Albus Dumbledore",
        "rel": "trusted friend of its maker",
        "id": ""
      },
      {
        "who": "Lord Voldemort",
        "rel": "would use it to escape death",
        "id": ""
      }
    ]
  },
  "r013": {
    "name": "Allspark Cube",
    "origin": "Transformers",
    "epithet": "The Spark of Cybertron",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 1,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      7,
      6,
      9,
      8,
      8,
      7
    ],
    "rank": "Transformers · Source of machine life",
    "lore": "The AllSpark is the source of life for the Transformers and the object at the center of Cybertronian creation myths. It can awaken machines, sustain a civilization, and become the prize that turns Optimus Prime and Megatron against one another.",
    "quote": "Till all are one.",
    "str": [
      "Creates or awakens Cybertronian life",
      "Carries the history of a world",
      "Unites machine identity with purpose"
    ],
    "wk": [
      "Its power can be weaponized",
      "It is vulnerable when removed from Cybertron",
      "Creation does not prevent civil war"
    ],
    "sig_name": "The Spark of Creation",
    "sig_desc": "A source of living energy gives metal a mind, a voice, and a choice.",
    "playstyle": "A creation myth in mechanical form",
    "ability": "The AllSpark gives life to Transformers and is central to Cybertronian creation in the franchise.",
    "rivals": [
      {
        "who": "Optimus Prime",
        "rel": "protector of Cybertron's future",
        "id": ""
      },
      {
        "who": "Megatron",
        "rel": "would use it to remake the world",
        "id": ""
      },
      {
        "who": "Bumblebee",
        "rel": "one of the lives it helps preserve",
        "id": ""
      }
    ]
  },
  "r014": {
    "name": "Anti-magic Mask",
    "origin": "That Time I Got Reincarnated as a Slime",
    "epithet": "Shizu's Sealed Face",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 1,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      4,
      6,
      8,
      8,
      7,
      5
    ],
    "rank": "Tensura · Anti-magic mask",
    "lore": "The anti-magic mask is worn by Shizue Izawa, the Otherworlder known as Shizu. It suppresses magical energy and becomes part of the mystery surrounding the people and worlds that shaped her life.",
    "quote": "Some memories need a face.",
    "str": [
      "Suppresses magical signatures",
      "Hides the wearer's identity",
      "Connects Shizu to a wider history"
    ],
    "wk": [
      "Its protection is not absolute",
      "The mask cannot heal its wearer",
      "Its meaning depends on Shizu's past"
    ],
    "sig_name": "The Sealed Face",
    "sig_desc": "A mask turns overwhelming power into something a human body can carry.",
    "playstyle": "A symbol of restraint, memory, and borrowed identity",
    "ability": "Shizu's anti-magic mask suppresses magical energy and is associated with her Otherworlder history.",
    "rivals": [
      {
        "who": "Shizue Izawa",
        "rel": "its wearer and emotional center",
        "id": ""
      },
      {
        "who": "Leon Cromwell",
        "rel": "connected to Shizu's summoning and past",
        "id": ""
      },
      {
        "who": "Rimuru Tempest",
        "rel": "inherits Shizu's story and mask",
        "id": ""
      }
    ]
  },
  "r015": {
    "name": "Devil Fruit",
    "origin": "One Piece",
    "epithet": "The Sea's Forbidden Fruit",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 2,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      8,
      5,
      8,
      6,
      8,
      7
    ],
    "rank": "One Piece · Devil Fruit",
    "lore": "A Devil Fruit grants its eater a strange ability, but takes away the ability to swim. The fruits range from elemental powers to transformations, and their deepest mysteries connect to the lost history of the world.",
    "quote": "The sea takes its price.",
    "str": [
      "Gives one person a singular ability",
      "Allows wildly different forms of expression",
      "Some powers awaken into greater states"
    ],
    "wk": [
      "The sea rejects its eater",
      "Seastone can suppress its power",
      "Only one person can normally hold its power at a time"
    ],
    "sig_name": "Awakening",
    "sig_desc": "A Devil Fruit power reaches beyond its original host and changes the world around it.",
    "playstyle": "A gift whose freedom always carries a maritime cost",
    "ability": "Devil Fruits grant supernatural powers, while seawater and Seastone weaken their users in One Piece.",
    "rivals": [
      {
        "who": "Monkey D. Luffy",
        "rel": "bearer of the Nika power",
        "id": ""
      },
      {
        "who": "Marshall D. Teach",
        "rel": "the only known dual eater",
        "id": ""
      },
      {
        "who": "The World Government",
        "rel": "seeks to control forbidden histories",
        "id": ""
      }
    ]
  },
  "r016": {
    "name": "Healing Potion",
    "origin": "Fantasy folklore",
    "epithet": "The Restorative Draught",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 1,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      2,
      8,
      6,
      7,
      5,
      5
    ],
    "rank": "Fantasy folklore · Apothecary staple",
    "lore": "The healing potion is a recurring fantasy image: a bottle of concentrated restoration carried by adventurers, soldiers, and hedge wizards. Its meaning is simple, but its ingredients reveal the healer's culture and craft.",
    "quote": "Every journey needs a remedy.",
    "str": [
      "Represents practical care",
      "Portable and immediate in folklore",
      "Can be brewed by many traditions"
    ],
    "wk": [
      "Cannot replace a skilled healer",
      "Ingredients may be rare or poisonous",
      "A potion cannot undo every wound"
    ],
    "sig_name": "The Restorative Draught",
    "sig_desc": "A small bottle carries the promise that damage does not have to be permanent.",
    "playstyle": "A humble symbol of preparation and mercy",
    "ability": "Healing potions are fantasy medicines that restore vitality through magical or alchemical ingredients.",
    "rivals": [
      {
        "who": "The village apothecary",
        "rel": "traditional maker",
        "id": ""
      },
      {
        "who": "The phoenix feather",
        "rel": "a rarer restorative symbol",
        "id": ""
      }
    ]
  },
  "r017": {
    "name": "Queen's Cocoon",
    "origin": "Hunter x Hunter",
    "epithet": "The Chimera Ant Chrysalis",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 2,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      7,
      8,
      8,
      6,
      6,
      1
    ],
    "rank": "Hunter x Hunter · Royal birth",
    "lore": "The Chimera Ant Queen's nest is a place of feeding, growth, and violent evolution. The Queen produces offspring by consuming living creatures, and the colony's future emerges from the bodies and traits brought into the nest.",
    "quote": "The next generation is already moving.",
    "str": [
      "Turns adaptation into inheritance",
      "Creates a collective identity",
      "Produces the Royal Guards and King"
    ],
    "wk": [
      "Depends on a living colony",
      "The Queen is bound to reproduction",
      "Evolution does not guarantee compassion"
    ],
    "sig_name": "Royal Birth",
    "sig_desc": "A body formed from many lives emerges carrying the potential of a species.",
    "playstyle": "A biological engine of hunger, hierarchy, and transformation",
    "ability": "The Chimera Ant Queen produces offspring by consuming creatures and passing their traits into the colony.",
    "rivals": [
      {
        "who": "Meruem",
        "rel": "the King born from the Queen",
        "id": ""
      },
      {
        "who": "Neferpitou",
        "rel": "Royal Guard of the next generation",
        "id": ""
      },
      {
        "who": "Komugi",
        "rel": "the human bond that changes the King",
        "id": ""
      }
    ]
  },
  "r018": {
    "name": "Shinigami Eyes",
    "origin": "Death Note",
    "epithet": "The Eyes That Read Lifespans",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 1,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      6,
      3,
      10,
      9,
      10,
      8
    ],
    "rank": "Death Note · Shinigami eye deal",
    "lore": "The Shinigami Eyes let a human see the name and remaining lifespan of another person. The price is half the human's remaining life, paid to a Shinigami in exchange for the sight.",
    "quote": "I can see your name.",
    "str": [
      "Reveals hidden identity",
      "Makes mortality visible",
      "Turns uncertainty into knowledge"
    ],
    "wk": [
      "Costs half a human lifespan",
      "Requires a Shinigami bargain",
      "Knowledge can destroy the person who uses it"
    ],
    "sig_name": "The Eye Deal",
    "sig_desc": "A bargain trades years of life for the ability to see the truth written above a person.",
    "playstyle": "A forbidden shortcut through identity and death",
    "ability": "A human with Shinigami Eyes sees names and lifespans after accepting the Shinigami's price.",
    "rivals": [
      {
        "who": "Misa Amane",
        "rel": "human who accepts the deal",
        "id": ""
      },
      {
        "who": "Light Yagami",
        "rel": "uses the deal as part of Kira's plans",
        "id": ""
      },
      {
        "who": "Ryuk",
        "rel": "Shinigami observer of the human world",
        "id": ""
      }
    ]
  },
  "r019": {
    "name": "The Green Mask",
    "origin": "The Mask",
    "epithet": "The Face of Pure Cartoon Chaos",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 2,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      7,
      4,
      9,
      6,
      6,
      10
    ],
    "rank": "The Mask · Loki's wooden face",
    "lore": "The Mask is a supernatural green face associated with Loki that releases the wearer's suppressed impulses. It turns Stanley Ipkiss into the elastic, fourth-wall-breaking Big Head, with reality bending around comic instinct.",
    "quote": "Somebody stop me!",
    "str": [
      "Releases impossible imagination",
      "Bends physical reality",
      "Turns fear into theatrical confidence"
    ],
    "wk": [
      "Amplifies the wearer's worst impulses",
      "The wearer can lose self-control",
      "Removing the mask removes the transformation"
    ],
    "sig_name": "The Big Head",
    "sig_desc": "A timid person becomes an animated force of impossible gags and elastic physics.",
    "playstyle": "A comic identity that makes inhibition physically disappear",
    "ability": "The Mask grants cartoon-like reality manipulation while amplifying the wearer's suppressed personality.",
    "rivals": [
      {
        "who": "Stanley Ipkiss",
        "rel": "the reluctant human wearer",
        "id": ""
      },
      {
        "who": "Loki",
        "rel": "mythic source of the mask",
        "id": ""
      },
      {
        "who": "Dorian Tyrell",
        "rel": "criminal rival seeking its power",
        "id": ""
      }
    ]
  },
  "r020": {
    "name": "Tesseract",
    "origin": "Marvel Cinematic Universe",
    "epithet": "The Space Stone's Cube",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 4,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      7,
      5,
      8,
      10,
      8,
      9
    ],
    "rank": "MCU · Space Stone containment vessel",
    "lore": "The Tesseract is the crystalline containment vessel for the Space Stone in the Marvel Cinematic Universe. It powers the research of Project P.E.G.A.S.U.S., opens portals, and becomes a prize for the Red Skull, Loki, and Thanos.",
    "quote": "Space is negotiable.",
    "str": [
      "Opens portals across vast distance",
      "Contains one of the Infinity Stones",
      "Connects Earth to cosmic powers"
    ],
    "wk": [
      "The container does not control the Stone",
      "Its power attracts conquerors",
      "Human experiments cannot safely master it"
    ],
    "sig_name": "The Space Bridge",
    "sig_desc": "A blue gateway turns distance into a door and lets the universe arrive at once.",
    "playstyle": "A cosmic container mistaken for a manageable machine",
    "ability": "The Tesseract contains the Space Stone and enables portal travel in the Marvel Cinematic Universe.",
    "rivals": [
      {
        "who": "Loki",
        "rel": "steals it for the Chitauri invasion",
        "id": ""
      },
      {
        "who": "Red Skull",
        "rel": "first modern seeker of its power",
        "id": ""
      },
      {
        "who": "Project P.E.G.A.S.U.S.",
        "rel": "research program built around it",
        "id": ""
      }
    ]
  },
  "r021": {
    "name": "Infinity Castle",
    "origin": "Demon Slayer",
    "epithet": "The Shifting Fortress",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 4,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      6,
      8,
      8,
      7,
      7,
      10
    ],
    "rank": "Demon Slayer · Nakime's fortress",
    "lore": "The Infinity Castle is the shifting extradimensional stronghold of Muzan Kibutsuji. Nakime controls its rooms with her biwa, moving demons and intruders through impossible distances as the Demon Slayer Corps closes in.",
    "quote": "The rooms keep moving.",
    "str": [
      "Rewrites the architecture of a battlefield",
      "Separates enemies at will",
      "Makes distance meaningless inside the castle"
    ],
    "wk": [
      "Its structure depends on Nakime",
      "Muzan's command is the castle's purpose",
      "It offers no refuge from the outside world"
    ],
    "sig_name": "The Biwa's Corridors",
    "sig_desc": "One plucked string rearranges the fortress and sends every traveler somewhere else.",
    "playstyle": "A living maze shaped by a demon's instrument",
    "ability": "Nakime's Blood Demon Art controls the Infinity Castle and rearranges its rooms through her biwa.",
    "rivals": [
      {
        "who": "Nakime",
        "rel": "the castle's spatial controller",
        "id": ""
      },
      {
        "who": "Muzan Kibutsuji",
        "rel": "master of the fortress",
        "id": ""
      },
      {
        "who": "Tanjiro Kamado",
        "rel": "Demon Slayer who enters its final battle",
        "id": ""
      }
    ]
  },
  "r022": {
    "name": "Pandora's Box",
    "origin": "Greek Mythology",
    "epithet": "The Jar of What Was Unleashed",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 2,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      7,
      5,
      9,
      8,
      8,
      2
    ],
    "rank": "Greek myth · The forbidden jar",
    "lore": "Pandora's Box is more accurately a jar in the earliest Greek account. Zeus sends Pandora to humanity, and when the jar is opened, evils escape into the world while Hope remains inside or arrives last, depending on the reading.",
    "quote": "Curiosity opens what fear keeps closed.",
    "str": [
      "Explains the arrival of suffering",
      "Preserves Hope as a final mystery",
      "Endures as a warning about curiosity"
    ],
    "wk": [
      "The story's details vary by translation",
      "Pandora is blamed for a divine punishment",
      "Hope's place inside the jar remains ambiguous"
    ],
    "sig_name": "The Lid Lifted",
    "sig_desc": "One irreversible motion turns hidden possibility into the condition of the world.",
    "playstyle": "A myth about blame, knowledge, and the survival of hope",
    "ability": "Pandora's jar releases the world's evils, while Hope remains as the story's contested final presence.",
    "rivals": [
      {
        "who": "Pandora",
        "rel": "the first woman and opener of the jar",
        "id": ""
      },
      {
        "who": "Zeus",
        "rel": "divine author of the punishment",
        "id": ""
      },
      {
        "who": "Epimetheus",
        "rel": "husband who accepts Pandora",
        "id": ""
      }
    ]
  },
  "r023": {
    "name": "The Monkey's Paw",
    "origin": "W. W. Jacobs",
    "epithet": "The Crooked Wish",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 3,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      8,
      4,
      10,
      4,
      8,
      2
    ],
    "rank": "The Monkey's Paw · Cautionary talisman",
    "lore": "In W. W. Jacobs's short story, a mummified paw is said to grant three wishes. Sergeant-Major Morris warns the Whites about it, but the family wishes anyway and discovers that a fulfilled desire can arrive in the cruelest literal form.",
    "quote": "Be careful what you wish for.",
    "str": [
      "Makes desire physically consequential",
      "Turns ordinary wishes into moral tests",
      "Its ambiguity creates lasting dread"
    ],
    "wk": [
      "Grants wishes through malicious interpretation",
      "The wisher cannot control the cost",
      "Every wish deepens the family's grief"
    ],
    "sig_name": "The Third Wish",
    "sig_desc": "The last wish is not a prize; it is an attempt to close the story the first two created.",
    "playstyle": "A horror object built from regret and literal language",
    "ability": "The paw grants three wishes whose outcomes twist the wisher's words into tragedy.",
    "rivals": [
      {
        "who": "Sergeant-Major Morris",
        "rel": "brings the paw and warns the family",
        "id": ""
      },
      {
        "who": "Mr. White",
        "rel": "wisher whose grief drives the story",
        "id": ""
      },
      {
        "who": "Herbert White",
        "rel": "the loss behind the second wish",
        "id": ""
      }
    ]
  },
  "r024": {
    "name": "Ark of the Covenant",
    "origin": "Hebrew Bible / Indiana Jones",
    "epithet": "The Ark of the Testimony",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 4,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      6,
      8,
      10,
      8,
      8,
      4
    ],
    "rank": "Biblical relic · Covenant chest",
    "lore": "The Ark of the Covenant is the sacred chest described in the Hebrew Bible as the dwelling place of God's covenant with Israel. Indiana Jones and the Raiders of the Lost Ark turn its sacred imagery into an archaeological adventure about reverence and desecration.",
    "quote": "It belongs in a museum.",
    "str": [
      "Represents covenant and presence",
      "Unites ritual, memory, and law",
      "Carries immense cultural symbolism"
    ],
    "wk": [
      "Must not be treated as ordinary treasure",
      "Its power is dangerous when profaned",
      "Its historical location is unknown"
    ],
    "sig_name": "The Presence",
    "sig_desc": "The lid and cherubim mark a boundary between a sacred promise and human curiosity.",
    "playstyle": "A holy object whose mystery resists possession",
    "ability": "The Ark is associated with the tablets of the covenant and divine presence in biblical tradition.",
    "rivals": [
      {
        "who": "Moses",
        "rel": "receives the covenant tablets",
        "id": ""
      },
      {
        "who": "Indiana Jones",
        "rel": "archaeologist who recovers it",
        "id": ""
      },
      {
        "who": "René Belloq",
        "rel": "rival who treats it as a prize",
        "id": ""
      }
    ]
  },
  "r025": {
    "name": "Necronomicon",
    "origin": "H. P. Lovecraft",
    "epithet": "The Book of the Dead",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 2,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      6,
      4,
      10,
      9,
      10,
      2
    ],
    "rank": "Cthulhu Mythos · Forbidden grimoire",
    "lore": "The Necronomicon is a fictional grimoire created by H. P. Lovecraft and attributed to the mad poet Abdul Alhazred. Its fragments describe cosmic entities and rituals that make human knowledge feel small, temporary, and dangerous.",
    "quote": "The dead have footnotes.",
    "str": [
      "Contains forbidden cosmic knowledge",
      "Expands horror beyond human scale",
      "Infects every library that mentions it"
    ],
    "wk": [
      "Reading it threatens sanity",
      "Its history is deliberately unreliable",
      "Knowledge does not grant control"
    ],
    "sig_name": "The Unreadable Passage",
    "sig_desc": "A page reveals a truth large enough to make the reader smaller.",
    "playstyle": "A book-shaped breach in the limits of human understanding",
    "ability": "The Necronomicon is a fictional occult book associated with Abdul Alhazred and the Cthulhu Mythos.",
    "rivals": [
      {
        "who": "Abdul Alhazred",
        "rel": "fictional author of the book",
        "id": ""
      },
      {
        "who": "Cthulhu",
        "rel": "one of the cosmic entities it invokes",
        "id": ""
      },
      {
        "who": "Ash Williams",
        "rel": "modern horror hero who battles its derivatives",
        "id": ""
      }
    ]
  },
  "r026": {
    "name": "Dragon Balls",
    "origin": "Dragon Ball",
    "epithet": "Seven Orbs of the Dragon",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 7,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      7,
      7,
      10,
      10,
      8,
      3
    ],
    "rank": "Dragon Ball · Earth's wish orbs",
    "lore": "The Dragon Balls are seven magical orbs that summon Shenron when gathered. Their wishes are limited by the dragon and the creator of the set, while the search for them carries the story from a comic adventure into cosmic history.",
    "quote": "Your wish is granted.",
    "str": [
      "Turns a scattered search into a miracle",
      "Connects Earth to its guardians",
      "Can restore lives and worlds"
    ],
    "wk": [
      "Must be gathered before use",
      "Shenron's power has limits",
      "The orbs scatter after a wish"
    ],
    "sig_name": "Summon Shenron",
    "sig_desc": "Seven lights gather, the dragon rises, and one request becomes history.",
    "playstyle": "A journey object that makes hope a physical collection",
    "ability": "Gathering the seven Dragon Balls summons Shenron, who grants a wish within his stated limits.",
    "rivals": [
      {
        "who": "Shenron",
        "rel": "dragon summoned by the complete set",
        "id": ""
      },
      {
        "who": "Bulma",
        "rel": "finder who begins the original search",
        "id": ""
      },
      {
        "who": "Son Goku",
        "rel": "hero whose life grows around the orbs",
        "id": ""
      }
    ]
  },
  "r027": {
    "name": "Mjolnir",
    "origin": "Marvel",
    "epithet": "The Worthy Thunder",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 5,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      10,
      8,
      9,
      7,
      7,
      7
    ],
    "rank": "Marvel · Hammer of Thor",
    "lore": "Mjolnir is the enchanted hammer of Thor, forged in a dying star and marked by Odin's worthiness enchantment. It returns to its wielder, commands storms, and has been lifted by heroes who prove themselves worthy of its responsibility.",
    "quote": "Whosoever holds this hammer, if they be worthy...",
    "str": [
      "Commands thunder and flight",
      "Returns when called by its worthy wielder",
      "Makes worthiness a visible moral test"
    ],
    "wk": [
      "Cannot be lifted by the unworthy",
      "Its power is tied to responsibility",
      "The enchantment can be changed by its creator"
    ],
    "sig_name": "Worthiness",
    "sig_desc": "The hammer answers the person who can carry its power without being ruled by it.",
    "playstyle": "A weapon that measures character before strength",
    "ability": "Mjolnir grants Thor control over storms and can be lifted only by those judged worthy by its enchantment.",
    "rivals": [
      {
        "who": "Thor Odinson",
        "rel": "its principal wielder",
        "id": ""
      },
      {
        "who": "Odin",
        "rel": "creator of the worthiness enchantment",
        "id": ""
      },
      {
        "who": "Jane Foster",
        "rel": "worthy wielder during Thor's absence",
        "id": ""
      }
    ]
  },
  "r028": {
    "name": "Excalibur",
    "origin": "Arthurian Legend",
    "epithet": "The Sword of the Once and Future King",
    "rar": "Relic",
    "camp": "Ascension",
    "align": "Relic",
    "cost": 2,
    "atk": 0,
    "hp": 0,
    "cc": "#54d6c3",
    "vals": [
      9,
      6,
      8,
      6,
      7,
      8
    ],
    "rank": "Arthurian legend · Sword of kingship",
    "lore": "Excalibur is King Arthur's famous sword, usually given to him by the Lady of the Lake. Later retellings sometimes merge it with the sword drawn from the stone, but the legends consistently make it a sign of rightful kingship and a weapon beyond ordinary craft.",
    "quote": "The right hand finds the hilt.",
    "str": [
      "Represents rightful authority",
      "Carries supernatural sharpness and durability",
      "Unites Arthur's rule with mythic destiny"
    ],
    "wk": [
      "Its identity changes across traditions",
      "The sword cannot preserve a failing kingdom",
      "Its legend depends on Arthur's character"
    ],
    "sig_name": "The Lady's Gift",
    "sig_desc": "A blade rises from the lake as a sign that kingship can be granted, not merely seized.",
    "playstyle": "A symbol of authority that outlives the person who carries it",
    "ability": "Excalibur is Arthur's enchanted sword, associated with the Lady of the Lake and the king's legitimacy.",
    "rivals": [
      {
        "who": "King Arthur",
        "rel": "the sword's chosen king",
        "id": ""
      },
      {
        "who": "The Lady of the Lake",
        "rel": "giver of the blade",
        "id": ""
      },
      {
        "who": "Merlin",
        "rel": "sage who guides Arthur's destiny",
        "id": ""
      }
    ]
  }
};
