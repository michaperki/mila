/**
 * Hebrew Root Dictionary
 * 
 * This module provides a dictionary of Hebrew roots based on Strong's numbers.
 * Generated from the Open Scriptures Hebrew Bible dataset.
 */

// Type definitions
export interface HebrewLemma {
  strong: string;  // Strong's number (e.g., "1")
  root: string;    // Root form in Hebrew characters
  gloss: string;   // English gloss/definition
}

// Map of Strong's numbers to root information
export const strongRoots: Record<string, HebrewLemma> = {
  "1": {
    "strong": "1",
    "root": "אָב",
    "gloss": "chief, (fore-) father(-less), [idiom] patrimony, principal. Compare names in 'Abi-'"
  },
  "3": {
    "strong": "3",
    "root": "אֵב",
    "gloss": "greenness, fruit"
  },
  "5": {
    "strong": "5",
    "root": "אֲבַגְתָא",
    "gloss": "Abagtha"
  },
  "6": {
    "strong": "6",
    "root": "אָבַד",
    "gloss": "break, destroy(-uction), [phrase] not escape, fail, lose, (cause to, make) perish, spend, [idiom] and surely, take, be undone, [idiom] utterly, be void of, have no way to flee"
  },
  "8": {
    "strong": "8",
    "root": "אֹבֵד",
    "gloss": "perish"
  },
  "9": {
    "strong": "9",
    "root": "אֲבֵדָה",
    "gloss": "lost"
  },
  "10": {
    "strong": "10",
    "root": "אֲבַדֹּה",
    "gloss": "destruction"
  },
  "11": {
    "strong": "11",
    "root": "אֲבַדּוֹן",
    "gloss": "destruction"
  },
  "12": {
    "strong": "12",
    "root": "אַבְדָן",
    "gloss": "destruction"
  },
  "13": {
    "strong": "13",
    "root": "אׇבְדַן",
    "gloss": "destruction"
  },
  "14": {
    "strong": "14",
    "root": "אָבָה",
    "gloss": "consent, rest content will, be willing"
  },
  "15": {
    "strong": "15",
    "root": "אָבֶה",
    "gloss": "desire"
  },
  "16": {
    "strong": "16",
    "root": "אֵבֶה",
    "gloss": "swift"
  },
  "17": {
    "strong": "17",
    "root": "אֲבוֹי",
    "gloss": "sorrow"
  },
  "18": {
    "strong": "18",
    "root": "אֵבוּס",
    "gloss": "crib"
  },
  "19": {
    "strong": "19",
    "root": "אִבְחָה",
    "gloss": "point"
  },
  "20": {
    "strong": "20",
    "root": "אֲבַטִּיחַ",
    "gloss": "melon"
  },
  "21": {
    "strong": "21",
    "root": "אֲבִי",
    "gloss": "Abi"
  },
  "22": {
    "strong": "22",
    "root": "אֲבִיאֵל",
    "gloss": "Abiel"
  },
  "23": {
    "strong": "23",
    "root": "אֲבִיאָסָף",
    "gloss": "Abiasaph"
  },
  "24": {
    "strong": "24",
    "root": "אָבִיב",
    "gloss": "Abib, ear, green ears of corn (not maize)"
  },
  "25": {
    "strong": "25",
    "root": "אֲבִי גִבְעוֹן",
    "gloss": "father of Gibeon"
  },
  "26": {
    "strong": "26",
    "root": "אֲבִיגַיִל",
    "gloss": "Abigal"
  },
  "27": {
    "strong": "27",
    "root": "אֲבִידָן",
    "gloss": "Abidan"
  },
  "28": {
    "strong": "28",
    "root": "אֲבִידָע",
    "gloss": "Abida, Abidah"
  },
  "29": {
    "strong": "29",
    "root": "אֲבִיָּה",
    "gloss": "Abiah, Abijah"
  },
  "30": {
    "strong": "30",
    "root": "אֲבִיהוּא",
    "gloss": "Abihu"
  },
  "31": {
    "strong": "31",
    "root": "אֲבִיהוּד",
    "gloss": "Abihud"
  },
  "32": {
    "strong": "32",
    "root": "אֲבִיהַיִל",
    "gloss": "Abihail"
  },
  "33": {
    "strong": "33",
    "root": "אֲבִי הָעֶזְרִי",
    "gloss": "Abiezrite"
  },
  "34": {
    "strong": "34",
    "root": "אֶבְיוֹן",
    "gloss": "beggar, needy, poor (man)"
  },
  "35": {
    "strong": "35",
    "root": "אֲבִיּוֹנָה",
    "gloss": "desire"
  },
  "36": {
    "strong": "36",
    "root": "אֲבִיטוּב",
    "gloss": "Abitub"
  },
  "37": {
    "strong": "37",
    "root": "אֲבִיטָל",
    "gloss": "Abital"
  },
  "38": {
    "strong": "38",
    "root": "אֲבִיָּם",
    "gloss": "Abijam"
  },
  "39": {
    "strong": "39",
    "root": "אֲבִימָאֵל",
    "gloss": "Abimael"
  },
  "40": {
    "strong": "40",
    "root": "אֲבִימֶלֶךְ",
    "gloss": "Abimelech"
  },
  "41": {
    "strong": "41",
    "root": "אֲבִינָדָב",
    "gloss": "Abinadab"
  },
  "42": {
    "strong": "42",
    "root": "אֲבִינֹעַם",
    "gloss": "Abinoam"
  },
  "43": {
    "strong": "43",
    "root": "אֶבְיָסָף",
    "gloss": "Ebiasaph"
  },
  "44": {
    "strong": "44",
    "root": "אֲבִיעֶזֶר",
    "gloss": "Abiezer"
  },
  "45": {
    "strong": "45",
    "root": "אֲבִי־עַלְבוֹן",
    "gloss": "Abialbon"
  },
  "46": {
    "strong": "46",
    "root": "אָבִיר",
    "gloss": "mighty (one)"
  },
  "48": {
    "strong": "48",
    "root": "אֲבִירָם",
    "gloss": "Abiram"
  },
  "49": {
    "strong": "49",
    "root": "אֲבִישַׁג",
    "gloss": "Abishag"
  },
  "50": {
    "strong": "50",
    "root": "אֲבִישׁוּעַ",
    "gloss": "Abishua"
  },
  "51": {
    "strong": "51",
    "root": "אֲבִישׁוּר",
    "gloss": "Abishur"
  },
  "52": {
    "strong": "52",
    "root": "אֲבִישַׁי",
    "gloss": "Abishai"
  },
  "53": {
    "strong": "53",
    "root": "אֲבִישָׁלוֹם",
    "gloss": "Abishalom, Absalom"
  },
  "54": {
    "strong": "54",
    "root": "אֶבְיָתָר",
    "gloss": "Abiathar"
  },
  "55": {
    "strong": "55",
    "root": "אָבַךְ",
    "gloss": "mount up"
  },
  "56": {
    "strong": "56",
    "root": "אָבַל",
    "gloss": "lament, mourn"
  },
  "57": {
    "strong": "57",
    "root": "אָבֵל",
    "gloss": "mourn(-er, -ing)"
  },
  "58": {
    "strong": "58",
    "root": "אָבֵל",
    "gloss": "plain. Compare also the proper names beginning with Abel-"
  },
  "59": {
    "strong": "59",
    "root": "אָבֵל",
    "gloss": "Abel"
  },
  "60": {
    "strong": "60",
    "root": "אֵבֶל",
    "gloss": "mourning"
  },
  "61": {
    "strong": "61",
    "root": "אֲבָל",
    "gloss": "but, indeed, nevertheless, verily"
  },
  "62": {
    "strong": "62",
    "root": "אָבֵל בֵּית־מֲעַכָה",
    "gloss": "Abel-beth-maachah, Abel of Beth-maachah"
  },
  "63": {
    "strong": "63",
    "root": "אָבֵל הַשִּׁטִּים",
    "gloss": "Abelshittim"
  },
  "64": {
    "strong": "64",
    "root": "אָבֵל כְּרָמִים",
    "gloss": "plain of the vineyards"
  },
  "65": {
    "strong": "65",
    "root": "אָבֵל מְחוֹלָה",
    "gloss": "Abel-meholah"
  },
  "66": {
    "strong": "66",
    "root": "אַבֵל מַיִם",
    "gloss": "Abel-maim"
  },
  "67": {
    "strong": "67",
    "root": "אָבֵל מִצְרַיִם",
    "gloss": "Abel-mizraim"
  },
  "68": {
    "strong": "68",
    "root": "אֶבֶן",
    "gloss": "[phrase] carbuncle, [phrase] mason, [phrase] plummet, (chalk-, hail-, head-, sling-) stone(-ny), (divers) weight(-s)"
  },
  "70": {
    "strong": "70",
    "root": "אֹבֶן",
    "gloss": "wheel, stool"
  },
  "71": {
    "strong": "71",
    "root": "אֲבָנָה",
    "gloss": "Abana"
  },
  "72": {
    "strong": "72",
    "root": "אֶבֶן הָעֵזֶר",
    "gloss": "Ebenezer"
  },
  "73": {
    "strong": "73",
    "root": "אַבְנֵט",
    "gloss": "girdle"
  },
  "74": {
    "strong": "74",
    "root": "אַבְנֵר",
    "gloss": "Abner"
  },
  "75": {
    "strong": "75",
    "root": "אָבַס",
    "gloss": "fatted, stalled"
  },
  "76": {
    "strong": "76",
    "root": "אֲבַעְבֻּעָה",
    "gloss": "blains"
  },
  "77": {
    "strong": "77",
    "root": "אֶבֶץ",
    "gloss": "Abez"
  },
  "78": {
    "strong": "78",
    "root": "אִבְצָן",
    "gloss": "Ibzan"
  },
  "79": {
    "strong": "79",
    "root": "אָבַק",
    "gloss": "wrestle"
  },
  "80": {
    "strong": "80",
    "root": "אָבָק",
    "gloss": "(small) dust, powder"
  },
  "82": {
    "strong": "82",
    "root": "אָבַר",
    "gloss": "fly"
  },
  "83": {
    "strong": "83",
    "root": "אֵבֶר",
    "gloss": "(long-) wing(-ed)"
  },
  "85": {
    "strong": "85",
    "root": "אַבְרָהָם",
    "gloss": "Abraham"
  },
  "86": {
    "strong": "86",
    "root": "אַבְרֵךְ",
    "gloss": "bow the knee"
  },
  "87": {
    "strong": "87",
    "root": "אַבְרָם",
    "gloss": "Abram"
  },
  "88": {
    "strong": "88",
    "root": "אֹבֹת",
    "gloss": "Oboth"
  },
  "89": {
    "strong": "89",
    "root": "אָגֵא",
    "gloss": "Agee"
  },
  "90": {
    "strong": "90",
    "root": "אֲגַג",
    "gloss": "Agag"
  },
  "91": {
    "strong": "91",
    "root": "אֲגָגִי",
    "gloss": "Agagite"
  },
  "92": {
    "strong": "92",
    "root": "אֲגֻדָּה",
    "gloss": "bunch, burden, troop"
  },
  "93": {
    "strong": "93",
    "root": "אֱגוֹז",
    "gloss": "nut"
  },
  "94": {
    "strong": "94",
    "root": "אָגוּר",
    "gloss": "Agur"
  },
  "95": {
    "strong": "95",
    "root": "אֲגוֹרָה",
    "gloss": "piece (of) silver"
  },
  "96": {
    "strong": "96",
    "root": "אֶגֶל",
    "gloss": "drop"
  },
  "97": {
    "strong": "97",
    "root": "אֶגְלַיִם",
    "gloss": "Eglaim"
  },
  "98": {
    "strong": "98",
    "root": "אֲגַם",
    "gloss": "pond, pool, standing (water)"
  },
  "99": {
    "strong": "99",
    "root": "אָגֵם",
    "gloss": "pond"
  },
  "100": {
    "strong": "100",
    "root": "אַגְמוֹן",
    "gloss": "bulrush, caldron, hook, rush"
  },
  "101": {
    "strong": "101",
    "root": "אַגָּן",
    "gloss": "basin, cup, goblet"
  },
  "102": {
    "strong": "102",
    "root": "אַגָּף",
    "gloss": "bands"
  },
  "103": {
    "strong": "103",
    "root": "אָגַר",
    "gloss": "gather"
  },
  "104": {
    "strong": "104",
    "root": "אִגְּרָא",
    "gloss": "letter"
  },
  "105": {
    "strong": "105",
    "root": "אֲגַרְטָל",
    "gloss": "charger"
  },
  "106": {
    "strong": "106",
    "root": "אֶגְרֹף",
    "gloss": "fist"
  },
  "107": {
    "strong": "107",
    "root": "אִגֶּרֶת",
    "gloss": "letter"
  },
  "108": {
    "strong": "108",
    "root": "אֵד",
    "gloss": "mist, vapor"
  },
  "109": {
    "strong": "109",
    "root": "אָדַב",
    "gloss": "grieve"
  },
  "110": {
    "strong": "110",
    "root": "אַדְבְּאֵל",
    "gloss": "Adbeel"
  },
  "111": {
    "strong": "111",
    "root": "אֲדַד",
    "gloss": "Hadad"
  },
  "112": {
    "strong": "112",
    "root": "אִדּוֹ",
    "gloss": "Iddo"
  },
  "113": {
    "strong": "113",
    "root": "אָדוֹן",
    "gloss": "lord, master, owner. Compare also names beginning with 'Adoni-'"
  },
  "114": {
    "strong": "114",
    "root": "אַדּוֹן",
    "gloss": "Addon"
  },
  "115": {
    "strong": "115",
    "root": "אֲדוֹרַיִם",
    "gloss": "Adoraim"
  },
  "116": {
    "strong": "116",
    "root": "אֱדַיִן",
    "gloss": "now, that time, then"
  },
  "117": {
    "strong": "117",
    "root": "אַדִּיר",
    "gloss": "excellent, famous, gallant, glorious, goodly, lordly, mighty(-ier one), noble, principal, worthy"
  },
  "118": {
    "strong": "118",
    "root": "אֲדַלְיָא",
    "gloss": "Adalia"
  },
  "119": {
    "strong": "119",
    "root": "אָדַם",
    "gloss": "be (dyed, made) red (ruddy)"
  },
  "120": {
    "strong": "120",
    "root": "אָדָם",
    "gloss": "[idiom] another, [phrase] hypocrite, [phrase] common sort, [idiom] low, man (mean, of low degree), person"
  },
  "121": {
    "strong": "121",
    "root": "אָדָם",
    "gloss": "Adam"
  },
  "122": {
    "strong": "122",
    "root": "אָדֹם",
    "gloss": "red, ruddy"
  },
  "123": {
    "strong": "123",
    "root": "אֱדֹם",
    "gloss": "Edom, Edomites, Idumea"
  },
  "124": {
    "strong": "124",
    "root": "אֹדֶם",
    "gloss": "sardius"
  },
  "125": {
    "strong": "125",
    "root": "אֲדַמְדָּם",
    "gloss": "(somewhat) reddish"
  },
  "126": {
    "strong": "126",
    "root": "אַדְמָה",
    "gloss": "Admah"
  },
  "127": {
    "strong": "127",
    "root": "אֲדָמָה",
    "gloss": "country, earth, ground, husband(-man) (-ry), land"
  },
  "128": {
    "strong": "128",
    "root": "אֲדָמָה",
    "gloss": "Adamah"
  },
  "129": {
    "strong": "129",
    "root": "אֲדָמִי",
    "gloss": "Adami"
  },
  "130": {
    "strong": "130",
    "root": "אֱדֹמִי",
    "gloss": "Edomite."
  },
  "131": {
    "strong": "131",
    "root": "אֲדֻמִּים",
    "gloss": "Adummim"
  },
  "132": {
    "strong": "132",
    "root": "אַדְמֹנִי",
    "gloss": "red, ruddy"
  },
  "133": {
    "strong": "133",
    "root": "אַדְמָתָא",
    "gloss": "Admatha"
  },
  "134": {
    "strong": "134",
    "root": "אֶדֶן",
    "gloss": "foundation, socket"
  },
  "135": {
    "strong": "135",
    "root": "אַדָּן",
    "gloss": "Addan"
  },
  "136": {
    "strong": "136",
    "root": "אֲדֹנָי",
    "gloss": "(my) Lord"
  },
  "137": {
    "strong": "137",
    "root": "אֲדֹנִי־בֶזֶק",
    "gloss": "Adonibezek"
  },
  "138": {
    "strong": "138",
    "root": "אֲדֹנִיָּה",
    "gloss": "Adonijah"
  },
  "139": {
    "strong": "139",
    "root": "אֲדֹנִי־צֶדֶק",
    "gloss": "Adonizedec"
  },
  "140": {
    "strong": "140",
    "root": "אֲדֹנִיקָם",
    "gloss": "Adonikam"
  },
  "141": {
    "strong": "141",
    "root": "אֲדֹנִירָם",
    "gloss": "Adoniram"
  },
  "142": {
    "strong": "142",
    "root": "אָדַר",
    "gloss": "(become) glorious, honourable"
  },
  "143": {
    "strong": "143",
    "root": "אֲדָר",
    "gloss": "Adar"
  },
  "145": {
    "strong": "145",
    "root": "אֶדֶר",
    "gloss": "goodly, robe"
  },
  "146": {
    "strong": "146",
    "root": "אַדָּר",
    "gloss": "Addar"
  },
  "147": {
    "strong": "147",
    "root": "אִדַּר",
    "gloss": "threshingfloor"
  },
  "148": {
    "strong": "148",
    "root": "אֲדַרְגָּזֵר",
    "gloss": "judge"
  },
  "149": {
    "strong": "149",
    "root": "אַדְרַזְדָּא",
    "gloss": "diligently"
  },
  "150": {
    "strong": "150",
    "root": "אֲדַרְכֹּן",
    "gloss": "dram"
  },
  "151": {
    "strong": "151",
    "root": "אֲדֹרָם",
    "gloss": "Adoram"
  },
  "152": {
    "strong": "152",
    "root": "אֲדְרַמֶּלֶךְ",
    "gloss": "Adrammelech"
  },
  "153": {
    "strong": "153",
    "root": "אֶדְרָע",
    "gloss": "force"
  },
  "154": {
    "strong": "154",
    "root": "אֶדְרֶעִי",
    "gloss": "Edrei"
  },
  "155": {
    "strong": "155",
    "root": "אַדֶּרֶת",
    "gloss": "garment, glory, goodly, mantle, robe"
  },
  "156": {
    "strong": "156",
    "root": "אָדַשׁ",
    "gloss": "thresh"
  },
  "157": {
    "strong": "157",
    "root": "אָהַב",
    "gloss": "(be-) love(-d, -ly, -r), like, friend"
  },
  "158": {
    "strong": "158",
    "root": "אַהַב",
    "gloss": "love(-r)"
  },
  "161": {
    "strong": "161",
    "root": "אֹהַד",
    "gloss": "Ohad"
  },
  "162": {
    "strong": "162",
    "root": "אֲהָהּ",
    "gloss": "ah, alas"
  },
  "163": {
    "strong": "163",
    "root": "אַהֲוָא",
    "gloss": "Ahava"
  },
  "164": {
    "strong": "164",
    "root": "אֵהוּד",
    "gloss": "Ehud"
  },
  "165": {
    "strong": "165",
    "root": "אֱהִי",
    "gloss": "I will be (Hosea 13:10,14) (which is often the rendering of the same Hebrew form from )"
  },
  "166": {
    "strong": "166",
    "root": "אָהַל",
    "gloss": "shine"
  },
  "167": {
    "strong": "167",
    "root": "אָהַל",
    "gloss": "pitch (remove) a tent"
  },
  "168": {
    "strong": "168",
    "root": "אֹהֶל",
    "gloss": "covering, (dwelling) (place), home, tabernacle, tent"
  },
  "169": {
    "strong": "169",
    "root": "אֹהֶל",
    "gloss": "Ohel"
  },
  "170": {
    "strong": "170",
    "root": "אׇהֳלָה",
    "gloss": "Aholah"
  },
  "171": {
    "strong": "171",
    "root": "אׇהֳלִיאָב",
    "gloss": "Aholiab"
  },
  "172": {
    "strong": "172",
    "root": "אׇהֳלִיבָה",
    "gloss": "Aholibah"
  },
  "173": {
    "strong": "173",
    "root": "אׇהֳלִיבָמָה",
    "gloss": "Aholibamah"
  },
  "174": {
    "strong": "174",
    "root": "אֲהָלִים",
    "gloss": "(tree of lign-) aloes"
  },
  "175": {
    "strong": "175",
    "root": "אַהֲרוֹן",
    "gloss": "Aaron"
  },
  "176": {
    "strong": "176",
    "root": "אוֹ",
    "gloss": "also, and, either, if, at the least, [idiom] nor, or, otherwise, then, whether"
  },
  "177": {
    "strong": "177",
    "root": "אוּאֵל",
    "gloss": "Uel"
  },
  "178": {
    "strong": "178",
    "root": "אוֹב",
    "gloss": "bottle, familiar spirit"
  },
  "179": {
    "strong": "179",
    "root": "אוֹבִיל",
    "gloss": "Obil"
  },
  "180": {
    "strong": "180",
    "root": "אוּבָל",
    "gloss": "river"
  },
  "181": {
    "strong": "181",
    "root": "אוּד",
    "gloss": "(fire-) brand"
  },
  "182": {
    "strong": "182",
    "root": "אוֹדוֹת",
    "gloss": "(be-) cause, concerning, sake"
  },
  "183": {
    "strong": "183",
    "root": "אָוָה",
    "gloss": "covet, (greatly) desire, be desirous, long, lust (after)"
  },
  "184": {
    "strong": "184",
    "root": "אָוָה",
    "gloss": "point out"
  },
  "185": {
    "strong": "185",
    "root": "אַוָּה",
    "gloss": "desire, lust after, pleasure"
  },
  "186": {
    "strong": "186",
    "root": "אוּזַי",
    "gloss": "Uzai"
  },
  "187": {
    "strong": "187",
    "root": "אוּזָל",
    "gloss": "Uzal"
  },
  "188": {
    "strong": "188",
    "root": "אוֹי",
    "gloss": "alas, woe"
  },
  "189": {
    "strong": "189",
    "root": "אֱוִי",
    "gloss": "Evi"
  },
  "191": {
    "strong": "191",
    "root": "אֱוִיל",
    "gloss": "fool(-ish) (man)"
  },
  "192": {
    "strong": "192",
    "root": "אֱוִיל מְרֹדַךְ",
    "gloss": "Evil-merodach"
  },
  "193": {
    "strong": "193",
    "root": "אוּל",
    "gloss": "mighty, strength"
  },
  "194": {
    "strong": "194",
    "root": "אוּלַי",
    "gloss": "if so be, may be, peradventure, unless"
  },
  "195": {
    "strong": "195",
    "root": "אוּלַי",
    "gloss": "Ulai"
  },
  "196": {
    "strong": "196",
    "root": "אֱוִלִי",
    "gloss": "foolish"
  },
  "197": {
    "strong": "197",
    "root": "אוּלָם",
    "gloss": "porch"
  },
  "198": {
    "strong": "198",
    "root": "אוּלָם",
    "gloss": "Ulam"
  },
  "199": {
    "strong": "199",
    "root": "אוּלָם",
    "gloss": "as for, but, howbeit, in very deed, surely, truly, wherefore"
  },
  "200": {
    "strong": "200",
    "root": "אִוֶּלֶת",
    "gloss": "folly, foolishly(-ness)"
  },
  "201": {
    "strong": "201",
    "root": "אוֹמָר",
    "gloss": "Omar"
  },
  "202": {
    "strong": "202",
    "root": "אוֹן",
    "gloss": "force, goods, might, strength, substance"
  },
  "203": {
    "strong": "203",
    "root": "אוֹן",
    "gloss": "On"
  },
  "204": {
    "strong": "204",
    "root": "אוֹן",
    "gloss": "On"
  },
  "205": {
    "strong": "205",
    "root": "אָוֶן",
    "gloss": "affliction, evil, false, idol, iniquity, mischief, mourners(-ing), naught, sorrow, unjust, unrighteous, vain, vanity, wicked(-ness). Compare"
  },
  "206": {
    "strong": "206",
    "root": "אָוֶן",
    "gloss": "Aven. See also ,"
  },
  "207": {
    "strong": "207",
    "root": "אוֹנוֹ",
    "gloss": "Ono"
  },
  "208": {
    "strong": "208",
    "root": "אוֹנָם",
    "gloss": "Onam"
  },
  "209": {
    "strong": "209",
    "root": "אוֹנָן",
    "gloss": "Onan"
  },
  "210": {
    "strong": "210",
    "root": "אוּפָז",
    "gloss": "Uphaz"
  },
  "211": {
    "strong": "211",
    "root": "אוֹפִיר",
    "gloss": "Ophir"
  },
  "212": {
    "strong": "212",
    "root": "אוֹפָן",
    "gloss": "wheel"
  },
  "213": {
    "strong": "213",
    "root": "אוּץ",
    "gloss": "(make) haste(-n, -y), labor, be narrow"
  },
  "214": {
    "strong": "214",
    "root": "אוֹצָר",
    "gloss": "armory, cellar, garner, store(-house), treasure(-house) (-y)"
  },
  "215": {
    "strong": "215",
    "root": "אוֹר",
    "gloss": "[idiom] break of day, glorious, kindle, (be, en-, give, show) light (-en, -ened), set on fire, shine"
  },
  "216": {
    "strong": "216",
    "root": "אוֹר",
    "gloss": "bright, clear, [phrase] day, light (-ning), morning, sun"
  },
  "217": {
    "strong": "217",
    "root": "אוּר",
    "gloss": "fire, light. See also"
  },
  "218": {
    "strong": "218",
    "root": "אוּר",
    "gloss": "Ur"
  },
  "219": {
    "strong": "219",
    "root": "אוֹרָה",
    "gloss": "herb, light"
  },
  "220": {
    "strong": "220",
    "root": "אֲוֵרָה",
    "gloss": "cote"
  },
  "221": {
    "strong": "221",
    "root": "אוּרִי",
    "gloss": "Uri"
  },
  "222": {
    "strong": "222",
    "root": "אוּרִיאֵל",
    "gloss": "Uriel"
  },
  "223": {
    "strong": "223",
    "root": "אוּרִיָּה",
    "gloss": "Uriah, Urijah"
  },
  "224": {
    "strong": "224",
    "root": "אוּרִים",
    "gloss": "Urim"
  },
  "225": {
    "strong": "225",
    "root": "אוּת",
    "gloss": "consent"
  },
  "226": {
    "strong": "226",
    "root": "אוֹת",
    "gloss": "mark, miracle, (en-) sign, token"
  },
  "227": {
    "strong": "227",
    "root": "אָז",
    "gloss": "beginning, for, from, hitherto, now, of old, once, since, then, at which time, yet"
  },
  "228": {
    "strong": "228",
    "root": "אֲזָא",
    "gloss": "heat, hot"
  },
  "229": {
    "strong": "229",
    "root": "אֶזְבַּי",
    "gloss": "Ezbai"
  },
  "230": {
    "strong": "230",
    "root": "אֲזָד",
    "gloss": "be gone"
  },
  "231": {
    "strong": "231",
    "root": "אֵזוֹב",
    "gloss": "hyssop"
  },
  "232": {
    "strong": "232",
    "root": "אֵזוֹר",
    "gloss": "girdle"
  },
  "233": {
    "strong": "233",
    "root": "אֲזַי",
    "gloss": "then"
  },
  "234": {
    "strong": "234",
    "root": "אַזְכָּרָה",
    "gloss": "memorial"
  },
  "235": {
    "strong": "235",
    "root": "אָזַל",
    "gloss": "fail, gad about, go to and fro (but in Ezekiel 27:19 the word is rendered by many 'from Uzal,' by others 'yarn'), be gone (spent)"
  },
  "236": {
    "strong": "236",
    "root": "אֲזַל",
    "gloss": "go (up)"
  },
  "237": {
    "strong": "237",
    "root": "אֶזֶל",
    "gloss": "Ezel"
  },
  "238": {
    "strong": "238",
    "root": "אָזַן",
    "gloss": "give (perceive by the) ear, hear(-ken). See"
  },
  "239": {
    "strong": "239",
    "root": "אָזַן",
    "gloss": "give good heed"
  },
  "240": {
    "strong": "240",
    "root": "אָזֵן",
    "gloss": "weapon"
  },
  "241": {
    "strong": "241",
    "root": "אֹזֶן",
    "gloss": "[phrase] advertise, audience, [phrase] displease, ear, hearing, [phrase] show"
  },
  "242": {
    "strong": "242",
    "root": "אֻזֵּן שֶׁאֱרָה",
    "gloss": "Uzzen-sherah"
  },
  "243": {
    "strong": "243",
    "root": "אַזְנוֹת תָּבוֹר",
    "gloss": "Aznoth-tabor"
  },
  "244": {
    "strong": "244",
    "root": "אׇזְנִי",
    "gloss": "Ozni, Oznites"
  },
  "245": {
    "strong": "245",
    "root": "אֲזַנְיָה",
    "gloss": "Azaniah"
  },
  "246": {
    "strong": "246",
    "root": "אֲזִקִּים",
    "gloss": "chains"
  },
  "247": {
    "strong": "247",
    "root": "אָזַר",
    "gloss": "bind (compass) about, gird (up, with)"
  },
  "248": {
    "strong": "248",
    "root": "אֶזְרוֹעַ",
    "gloss": "arm"
  },
  "249": {
    "strong": "249",
    "root": "אֶזְרָח",
    "gloss": "bay tree, (home-) born (in the land), of the (one's own) country (nation)"
  },
  "250": {
    "strong": "250",
    "root": "אֶזְרָחִי",
    "gloss": "Ezrahite"
  },
  "251": {
    "strong": "251",
    "root": "אָח",
    "gloss": "another, brother(-ly); kindred, like, other. Compare also the proper names beginning with 'Ah-' or 'Ahi-'"
  },
  "253": {
    "strong": "253",
    "root": "אָח",
    "gloss": "ah, alas"
  },
  "254": {
    "strong": "254",
    "root": "אָח",
    "gloss": "hearth"
  },
  "255": {
    "strong": "255",
    "root": "אֹחַ",
    "gloss": "doleful creature"
  },
  "256": {
    "strong": "256",
    "root": "אַחְאָב",
    "gloss": "Ahab"
  },
  "257": {
    "strong": "257",
    "root": "אַחְבָן",
    "gloss": "Ahban"
  },
  "258": {
    "strong": "258",
    "root": "אָחַד",
    "gloss": "go one way or other"
  },
  "259": {
    "strong": "259",
    "root": "אֶחָד",
    "gloss": "a, alike, alone, altogether, and, any(-thing), apiece, a certain, (dai-) ly, each (one), [phrase] eleven, every, few, first, [phrase] highway, a man, once, one, only, other, some, together"
  },
  "260": {
    "strong": "260",
    "root": "אָחוּ",
    "gloss": "flag, meadow"
  },
  "261": {
    "strong": "261",
    "root": "אֵחוּד",
    "gloss": "Ehud"
  },
  "262": {
    "strong": "262",
    "root": "אַחְוָה",
    "gloss": "declaration"
  },
  "263": {
    "strong": "263",
    "root": "אַחֲוָה",
    "gloss": "showing"
  },
  "264": {
    "strong": "264",
    "root": "אַחֲוָה",
    "gloss": "brotherhood"
  },
  "265": {
    "strong": "265",
    "root": "אֲחוֹחַ",
    "gloss": "Ahoah"
  },
  "266": {
    "strong": "266",
    "root": "אֲחוֹחִי",
    "gloss": "Ahohite"
  },
  "267": {
    "strong": "267",
    "root": "אֲחוּמַי",
    "gloss": "Ahumai"
  },
  "268": {
    "strong": "268",
    "root": "אָחוֹר",
    "gloss": "after(-ward), back (part, -side, -ward), hereafter, (be-) hind(-er part), time to come, without"
  },
  "269": {
    "strong": "269",
    "root": "אָחוֹת",
    "gloss": "(an-) other, sister, together"
  },
  "270": {
    "strong": "270",
    "root": "אָחַז",
    "gloss": "[phrase] be affrighted, bar, (catch, lay, take) hold (back), come upon, fasten, handle, portion, (get, have or take) possess(-ion)"
  },
  "271": {
    "strong": "271",
    "root": "אָחָז",
    "gloss": "Ahaz"
  },
  "272": {
    "strong": "272",
    "root": "אֲחֻזָּה",
    "gloss": "possession"
  },
  "273": {
    "strong": "273",
    "root": "אַחְזַי",
    "gloss": "Ahasai"
  },
  "274": {
    "strong": "274",
    "root": "אֲחַזְיָה",
    "gloss": "Ahaziah"
  },
  "275": {
    "strong": "275",
    "root": "אֲחֻזָּם",
    "gloss": "Ahuzam"
  },
  "276": {
    "strong": "276",
    "root": "אֲחֻזַּת",
    "gloss": "Ahuzzath"
  },
  "277": {
    "strong": "277",
    "root": "אֲחִי",
    "gloss": "Ahi"
  },
  "278": {
    "strong": "278",
    "root": "אֵחִי",
    "gloss": "Ehi"
  },
  "279": {
    "strong": "279",
    "root": "אֲחִיאָם",
    "gloss": "Ahiam"
  },
  "280": {
    "strong": "280",
    "root": "אֲחִידָה",
    "gloss": "hard sentence"
  },
  "281": {
    "strong": "281",
    "root": "אֲחִיָּה",
    "gloss": "Ahiah, Ahijah"
  },
  "282": {
    "strong": "282",
    "root": "אֲחִיהוּד",
    "gloss": "Ahihud"
  },
  "283": {
    "strong": "283",
    "root": "אַחְיוֹ",
    "gloss": "Ahio"
  },
  "284": {
    "strong": "284",
    "root": "אֲחִיחֻד",
    "gloss": "Ahihud"
  },
  "285": {
    "strong": "285",
    "root": "אֲחִיטוּב",
    "gloss": "Ahitub"
  },
  "286": {
    "strong": "286",
    "root": "אֲחִילוּד",
    "gloss": "Ahilud"
  },
  "287": {
    "strong": "287",
    "root": "אֲחִימוֹת",
    "gloss": "Ahimoth"
  },
  "288": {
    "strong": "288",
    "root": "אֲחִימֶלֶךְ",
    "gloss": "Ahimelech"
  },
  "289": {
    "strong": "289",
    "root": "אֲחִימַן",
    "gloss": "Ahiman"
  },
  "290": {
    "strong": "290",
    "root": "אֲחִימַעַץ",
    "gloss": "Ahimaaz"
  },
  "291": {
    "strong": "291",
    "root": "אַחְיָן",
    "gloss": "Ahian"
  },
  "292": {
    "strong": "292",
    "root": "אֲחִינָדָב",
    "gloss": "Ahinadab"
  },
  "293": {
    "strong": "293",
    "root": "אֲחִינֹעַם",
    "gloss": "Ahinoam"
  },
  "294": {
    "strong": "294",
    "root": "אֲחִיסָמָךְ",
    "gloss": "Ahisamach"
  },
  "295": {
    "strong": "295",
    "root": "אֲחִיעֶזֶר",
    "gloss": "Ahiezer"
  },
  "296": {
    "strong": "296",
    "root": "אֲחִיקָם",
    "gloss": "Ahikam"
  },
  "297": {
    "strong": "297",
    "root": "אֲחִירָם",
    "gloss": "Ahiram"
  },
  "298": {
    "strong": "298",
    "root": "אֲחִירָמִי",
    "gloss": "Ahiramites"
  },
  "299": {
    "strong": "299",
    "root": "אֲחִירַע",
    "gloss": "Ahira"
  },
  "300": {
    "strong": "300",
    "root": "אֲחִישַׁחַר",
    "gloss": "Ahishar"
  },
  "301": {
    "strong": "301",
    "root": "אֲחִישָׁר",
    "gloss": "Ahishar"
  },
  "302": {
    "strong": "302",
    "root": "אֲחִיתֹפֶל",
    "gloss": "Ahithophel"
  },
  "303": {
    "strong": "303",
    "root": "אַחְלָב",
    "gloss": "Ahlab"
  },
  "304": {
    "strong": "304",
    "root": "אַחְלַי",
    "gloss": "Ahlai"
  },
  "305": {
    "strong": "305",
    "root": "אַחֲלַי",
    "gloss": "O that, would God"
  },
  "306": {
    "strong": "306",
    "root": "אַחְלָמָה",
    "gloss": "amethyst"
  },
  "307": {
    "strong": "307",
    "root": "אַחְמְתָא",
    "gloss": "Achmetha"
  },
  "308": {
    "strong": "308",
    "root": "אֲחַסְבַּי",
    "gloss": "Ahasbai"
  },
  "309": {
    "strong": "309",
    "root": "אָחַר",
    "gloss": "continue, defer, delay, hinder, be late (slack), stay (there), tarry (longer)"
  },
  "310": {
    "strong": "310",
    "root": "אַחַר",
    "gloss": "after (that, -ward), again, at, away from, back (from, -side), behind, beside, by, follow (after, -ing), forasmuch, from, hereafter, hinder end, [phrase] out (over) live, [phrase] persecute, posterity, pursuing, remnant, seeing, since, thence(-forth), when, with"
  },
  "311": {
    "strong": "311",
    "root": "אַחַר",
    "gloss": "(here-) after"
  },
  "312": {
    "strong": "312",
    "root": "אַחֵר",
    "gloss": "(an-) other man, following, next, strange"
  },
  "313": {
    "strong": "313",
    "root": "אַחֵר",
    "gloss": "Aher"
  },
  "314": {
    "strong": "314",
    "root": "אַחֲרוֹן",
    "gloss": "after (-ward), to come, following, hind(-er, -ermost, -most), last, latter, rereward, ut(ter) most"
  },
  "315": {
    "strong": "315",
    "root": "אַחְרַח",
    "gloss": "Aharah"
  },
  "316": {
    "strong": "316",
    "root": "אֲחַרְחֵל",
    "gloss": "Aharhel"
  },
  "317": {
    "strong": "317",
    "root": "אׇחֳרִי",
    "gloss": "(an-) other"
  },
  "318": {
    "strong": "318",
    "root": "אׇחֳרֵין",
    "gloss": "at last"
  },
  "319": {
    "strong": "319",
    "root": "אַחֲרִית",
    "gloss": "(last, latter) end (time), hinder (utter) -most, length, posterity, remnant, residue, reward"
  },
  "320": {
    "strong": "320",
    "root": "אַחֲרִית",
    "gloss": "latter"
  },
  "321": {
    "strong": "321",
    "root": "אׇחֳרָן",
    "gloss": "(an-) other"
  },
  "322": {
    "strong": "322",
    "root": "אֲחֹרַנִּית",
    "gloss": "back (-ward, again)"
  },
  "323": {
    "strong": "323",
    "root": "אֲחַשְׁדַּרְפַּן",
    "gloss": "lieutenant"
  },
  "325": {
    "strong": "325",
    "root": "אֲחַשְׁוֵרוֹשׁ",
    "gloss": "Ahasuerus"
  },
  "326": {
    "strong": "326",
    "root": "אֲחַשְׁתָּרִי",
    "gloss": "Haakashtari (includ. the article)"
  },
  "327": {
    "strong": "327",
    "root": "אֲחַשְׁתָּרָן",
    "gloss": "camel"
  },
  "328": {
    "strong": "328",
    "root": "אַט",
    "gloss": "charmer, gently, secret, softly"
  },
  "329": {
    "strong": "329",
    "root": "אָטָד",
    "gloss": "Atad, bramble, thorn"
  },
  "330": {
    "strong": "330",
    "root": "אֵטוּן",
    "gloss": "fine linen"
  },
  "331": {
    "strong": "331",
    "root": "אָטַם",
    "gloss": "narrow, shut, stop"
  },
  "332": {
    "strong": "332",
    "root": "אָטַר",
    "gloss": "shut"
  },
  "333": {
    "strong": "333",
    "root": "אָטֵר",
    "gloss": "Ater"
  },
  "334": {
    "strong": "334",
    "root": "אִטֵּר",
    "gloss": "[phrase] left-handed"
  },
  "335": {
    "strong": "335",
    "root": "אַי",
    "gloss": "how, what, whence, where, whether, which (way)"
  },
  "336": {
    "strong": "336",
    "root": "אִי",
    "gloss": "island (Job 22:30)"
  },
  "337": {
    "strong": "337",
    "root": "אִי",
    "gloss": "woe"
  },
  "338": {
    "strong": "338",
    "root": "אִי",
    "gloss": "wild beast of the islands"
  },
  "339": {
    "strong": "339",
    "root": "אִי",
    "gloss": "country, isle, island"
  },
  "340": {
    "strong": "340",
    "root": "אָיַב",
    "gloss": "be an enemy"
  },
  "341": {
    "strong": "341",
    "root": "אֹיֵב",
    "gloss": "enemy, foe"
  },
  "342": {
    "strong": "342",
    "root": "אֵיבָה",
    "gloss": "emnity, hatred"
  },
  "343": {
    "strong": "343",
    "root": "אֵיד",
    "gloss": "calamity, destruction"
  },
  "344": {
    "strong": "344",
    "root": "אַיָּה",
    "gloss": "kite, vulture"
  },
  "345": {
    "strong": "345",
    "root": "אַיָּה",
    "gloss": "Aiah, Ajah"
  },
  "346": {
    "strong": "346",
    "root": "אַיֵּה",
    "gloss": "where"
  },
  "347": {
    "strong": "347",
    "root": "אִיּוֹב",
    "gloss": "Job"
  },
  "348": {
    "strong": "348",
    "root": "אִיזֶבֶל",
    "gloss": "Jezebel"
  },
  "349": {
    "strong": "349",
    "root": "אֵיךְ",
    "gloss": "how, what"
  },
  "350": {
    "strong": "350",
    "root": "אִי־כָבוֹד",
    "gloss": "I-chabod"
  },
  "351": {
    "strong": "351",
    "root": "אֵיכֹה",
    "gloss": "where"
  },
  "352": {
    "strong": "352",
    "root": "אַיִל",
    "gloss": "mighty (man), lintel, oak, post, ram, tree"
  },
  "353": {
    "strong": "353",
    "root": "אֱיָל",
    "gloss": "strength"
  },
  "354": {
    "strong": "354",
    "root": "אַיָּל",
    "gloss": "hart"
  },
  "355": {
    "strong": "355",
    "root": "אַיָּלָה",
    "gloss": "hind"
  },
  "356": {
    "strong": "356",
    "root": "אֵילוֹן",
    "gloss": "Elon"
  },
  "357": {
    "strong": "357",
    "root": "אַיָּלוֹן",
    "gloss": "Aijalon, Ajalon"
  },
  "358": {
    "strong": "358",
    "root": "אֵילוֹן בֵּית חָנָן",
    "gloss": "Elon-bethhanan"
  },
  "359": {
    "strong": "359",
    "root": "אֵילוֹת",
    "gloss": "Elath, Eloth"
  },
  "360": {
    "strong": "360",
    "root": "אֱיָלוּת",
    "gloss": "strength"
  },
  "361": {
    "strong": "361",
    "root": "אֵילָם",
    "gloss": "arch"
  },
  "362": {
    "strong": "362",
    "root": "אֵילִם",
    "gloss": "Elim"
  },
  "363": {
    "strong": "363",
    "root": "אִילָן",
    "gloss": "tree"
  },
  "364": {
    "strong": "364",
    "root": "אֵיל פָּארָן",
    "gloss": "El-paran"
  },
  "365": {
    "strong": "365",
    "root": "אַיֶּלֶת",
    "gloss": "hind, Aijeleth"
  },
  "366": {
    "strong": "366",
    "root": "אָיֹם",
    "gloss": "terrible"
  },
  "367": {
    "strong": "367",
    "root": "אֵימָה",
    "gloss": "dread, fear, horror, idol, terrible, terror"
  },
  "368": {
    "strong": "368",
    "root": "אֵימִים",
    "gloss": "Emims"
  },
  "369": {
    "strong": "369",
    "root": "אַיִן",
    "gloss": "else, except, fail, (father-) less, be gone, in(-curable), neither, never, no (where), none, nor, (any, thing), not, nothing, to nought, past, un(-searchable), well-nigh, without. Compare"
  },
  "370": {
    "strong": "370",
    "root": "אַיִן",
    "gloss": "whence, where"
  },
  "371": {
    "strong": "371",
    "root": "אִין",
    "gloss": "not"
  },
  "372": {
    "strong": "372",
    "root": "אִיעֶזֵר",
    "gloss": "Jeezer"
  },
  "373": {
    "strong": "373",
    "root": "אִיעֶזְרִי",
    "gloss": "Jezerite"
  },
  "374": {
    "strong": "374",
    "root": "אֵיפָה",
    "gloss": "ephah, (divers) measure(-s)"
  },
  "375": {
    "strong": "375",
    "root": "אֵיפֹה",
    "gloss": "what manner, where"
  },
  "376": {
    "strong": "376",
    "root": "אִישׁ",
    "gloss": "also, another, any (man), a certain, [phrase] champion, consent, each, every (one), fellow, (foot-, husband-) man, (good-, great, mighty) man, he, high (degree), him (that is), husband, man(-kind), [phrase] none, one, people, person, [phrase] steward, what (man) soever, whoso(-ever), worthy. Compare"
  },
  "377": {
    "strong": "377",
    "root": "אִישׁ",
    "gloss": "show (one) self a man"
  },
  "378": {
    "strong": "378",
    "root": "אִישׁ־בֹּשֶׁת",
    "gloss": "Ish-bosheth"
  },
  "379": {
    "strong": "379",
    "root": "אִישְׁהוֹד",
    "gloss": "Ishod"
  },
  "380": {
    "strong": "380",
    "root": "אִישׁוֹן",
    "gloss": "apple (of the eye), black, obscure"
  },
  "381": {
    "strong": "381",
    "root": "אִישׁ־חַיִל",
    "gloss": "a valiant man"
  },
  "382": {
    "strong": "382",
    "root": "אִישׁ־טוֹב",
    "gloss": "Ish-tob"
  },
  "383": {
    "strong": "383",
    "root": "אִיתַי",
    "gloss": "art thou, can, do ye, have, it be, there is (are), [idiom] we will not"
  },
  "384": {
    "strong": "384",
    "root": "אִיתִיאֵל",
    "gloss": "Ithiel"
  },
  "385": {
    "strong": "385",
    "root": "אִיתָמָר",
    "gloss": "Ithamar"
  },
  "386": {
    "strong": "386",
    "root": "אֵיתָן",
    "gloss": "hard, mighty, rough, strength, strong"
  },
  "387": {
    "strong": "387",
    "root": "אֵיתָן",
    "gloss": "Ethan"
  },
  "388": {
    "strong": "388",
    "root": "אֵיתָנִים",
    "gloss": "Ethanim"
  },
  "389": {
    "strong": "389",
    "root": "אַךְ",
    "gloss": "also, in any wise, at least, but, certainly, even, howbeit, nevertheless, notwithstanding, only, save, surely, of a surety, truly, verily, [phrase] wherefore, yet (but)"
  },
  "390": {
    "strong": "390",
    "root": "אַכַּד",
    "gloss": "Accad"
  },
  "391": {
    "strong": "391",
    "root": "אַכְזָב",
    "gloss": "liar, lie"
  },
  "392": {
    "strong": "392",
    "root": "אַכְזִיב",
    "gloss": "Achzib"
  },
  "393": {
    "strong": "393",
    "root": "אַכְזָר",
    "gloss": "cruel, fierce"
  },
  "394": {
    "strong": "394",
    "root": "אַכְזָרִי",
    "gloss": "cruel (one)"
  },
  "395": {
    "strong": "395",
    "root": "אַכְזְרִיּוּת",
    "gloss": "cruel"
  },
  "396": {
    "strong": "396",
    "root": "אֲכִילָה",
    "gloss": "meat"
  },
  "397": {
    "strong": "397",
    "root": "אֲכִישׁ",
    "gloss": "Achish"
  },
  "398": {
    "strong": "398",
    "root": "אָכַל",
    "gloss": "[idiom] at all, burn up, consume, devour(-er, up), dine, eat(-er, up), feed (with), food, [idiom] freely, [idiom] in...wise(-deed, plenty), (lay) meat, [idiom] quite"
  },
  "400": {
    "strong": "400",
    "root": "אֹכֶל",
    "gloss": "eating, food, meal(-time), meat, prey, victuals"
  },
  "401": {
    "strong": "401",
    "root": "אֻכָל",
    "gloss": "Ucal"
  },
  "402": {
    "strong": "402",
    "root": "אׇכְלָה",
    "gloss": "consume, devour, eat, food, meat"
  },
  "403": {
    "strong": "403",
    "root": "אָכֵן",
    "gloss": "but, certainly, nevertheless, surely, truly, verily"
  },
  "404": {
    "strong": "404",
    "root": "אָכַף",
    "gloss": "crave"
  },
  "405": {
    "strong": "405",
    "root": "אֶכֶף",
    "gloss": "hand"
  },
  "406": {
    "strong": "406",
    "root": "אִכָּר",
    "gloss": "husbandman, ploughman"
  },
  "407": {
    "strong": "407",
    "root": "אַכְשָׁף",
    "gloss": "Achshaph"
  },
  "408": {
    "strong": "408",
    "root": "אַל",
    "gloss": "nay, neither, [phrase] never, no, nor, not, nothing (worth), rather than"
  },
  "410": {
    "strong": "410",
    "root": "אֵל",
    "gloss": "God (god), [idiom] goodly, [idiom] great, idol, might(-y one), power, strong. Compare names in '-el.'"
  },
  "411": {
    "strong": "411",
    "root": "אֵל",
    "gloss": "these, those. Compare"
  },
  "413": {
    "strong": "413",
    "root": "אֵל",
    "gloss": "about, according to, after, against, among, as for, at, because(-fore, -side), both...and, by, concerning, for, from, [idiom] hath, in(-to), near, (out) of, over, through, to(-ward), under, unto, upon, whether, with(-in)"
  },
  "414": {
    "strong": "414",
    "root": "אֵלָא",
    "gloss": "Elah"
  },
  "415": {
    "strong": "415",
    "root": "אֵל אֱלֹהֵי יִשְׂרָאֵל",
    "gloss": "Elelohe-israel"
  },
  "416": {
    "strong": "416",
    "root": "אֵל בֵּית־אֵל",
    "gloss": "El-beth-el"
  },
  "417": {
    "strong": "417",
    "root": "אֶלְגָּבִישׁ",
    "gloss": "great hail(-stones)"
  },
  "418": {
    "strong": "418",
    "root": "אַלְגּוּמִּים",
    "gloss": "algum (trees)"
  },
  "419": {
    "strong": "419",
    "root": "אֶלְדָּד",
    "gloss": "Eldad"
  },
  "420": {
    "strong": "420",
    "root": "אֶלְדָּעָה",
    "gloss": "Eldaah"
  },
  "421": {
    "strong": "421",
    "root": "אָלָה",
    "gloss": "lament"
  },
  "422": {
    "strong": "422",
    "root": "אָלָה",
    "gloss": "adjure, curse, swear"
  },
  "423": {
    "strong": "423",
    "root": "אָלָה",
    "gloss": "curse, cursing, execration, oath, swearing"
  },
  "424": {
    "strong": "424",
    "root": "אֵלָה",
    "gloss": "elm, oak, teil-tree"
  },
  "425": {
    "strong": "425",
    "root": "אֵלָה",
    "gloss": "Elah"
  },
  "426": {
    "strong": "426",
    "root": "אֱלָהּ",
    "gloss": "God, god"
  },
  "428": {
    "strong": "428",
    "root": "אֵלֶּה",
    "gloss": "an-(the) other; one sort, so, some, such, them, these (same), they, this, those, thus, which, who(-m)"
  },
  "430": {
    "strong": "430",
    "root": "אֱלֹהִים",
    "gloss": "angels, [idiom] exceeding, God (gods) (-dess, -ly), [idiom] (very) great, judges, [idiom] mighty"
  },
  "431": {
    "strong": "431",
    "root": "אֲלוּ",
    "gloss": "behold"
  },
  "432": {
    "strong": "432",
    "root": "אִלּוּ",
    "gloss": "but if, yea though"
  },
  "433": {
    "strong": "433",
    "root": "אֱלוֹהַּ",
    "gloss": "God, god. See"
  },
  "434": {
    "strong": "434",
    "root": "אֱלוּל",
    "gloss": "thing of nought"
  },
  "435": {
    "strong": "435",
    "root": "אֱלוּל",
    "gloss": "Elul"
  },
  "436": {
    "strong": "436",
    "root": "אֵלוֹן",
    "gloss": "plain. See also"
  },
  "438": {
    "strong": "438",
    "root": "אַלּוֹן",
    "gloss": "Allon"
  },
  "439": {
    "strong": "439",
    "root": "אַלּוֹן בָּכוּת",
    "gloss": "Allon-bachuth"
  },
  "440": {
    "strong": "440",
    "root": "אֵלוֹנִי",
    "gloss": "Elonites"
  },
  "441": {
    "strong": "441",
    "root": "אַלּוּף",
    "gloss": "captain, duke, (chief) friend, governor, guide, ox"
  },
  "442": {
    "strong": "442",
    "root": "אָלוּשׁ",
    "gloss": "Alush"
  },
  "443": {
    "strong": "443",
    "root": "אֶלְזָבָד",
    "gloss": "Elzabad"
  },
  "444": {
    "strong": "444",
    "root": "אָלַח",
    "gloss": "become filthy"
  },
  "445": {
    "strong": "445",
    "root": "אֶלְחָנָן",
    "gloss": "Elkanan"
  },
  "446": {
    "strong": "446",
    "root": "אֱלִיאָב",
    "gloss": "Eliab"
  },
  "447": {
    "strong": "447",
    "root": "אֱלִיאֵל",
    "gloss": "Eliel"
  },
  "448": {
    "strong": "448",
    "root": "אֱלִיאָתָה",
    "gloss": "Eliathah"
  },
  "449": {
    "strong": "449",
    "root": "אֱלִידָד",
    "gloss": "Elidad"
  },
  "450": {
    "strong": "450",
    "root": "אֶלְיָדָע",
    "gloss": "Eliada"
  },
  "451": {
    "strong": "451",
    "root": "אַלְיָה",
    "gloss": "rump"
  },
  "452": {
    "strong": "452",
    "root": "אֵלִיָּה",
    "gloss": "Elijah, Eliah"
  },
  "453": {
    "strong": "453",
    "root": "אֱלִיהוּ",
    "gloss": "Elihu"
  },
  "454": {
    "strong": "454",
    "root": "אֶלְיְהוֹעֵינַי",
    "gloss": "Elihoenai, Elionai"
  },
  "455": {
    "strong": "455",
    "root": "אֶלְיַחְבָּא",
    "gloss": "Eliahbah"
  },
  "456": {
    "strong": "456",
    "root": "אֱלִיחֹרֶף",
    "gloss": "Elihoreph"
  },
  "457": {
    "strong": "457",
    "root": "אֱלִיל",
    "gloss": "idol, no value, thing of nought"
  },
  "458": {
    "strong": "458",
    "root": "אֱלִימֶלֶךְ",
    "gloss": "Elimelech"
  },
  "459": {
    "strong": "459",
    "root": "אִלֵּין",
    "gloss": "the, these"
  },
  "460": {
    "strong": "460",
    "root": "אֶלְיָסָף",
    "gloss": "Eliasaph"
  },
  "461": {
    "strong": "461",
    "root": "אֱלִיעֶזֶר",
    "gloss": "Eliezer"
  },
  "462": {
    "strong": "462",
    "root": "אֱלִיעֵינַי",
    "gloss": "Elienai"
  },
  "463": {
    "strong": "463",
    "root": "אֱלִיעָם",
    "gloss": "Eliam"
  },
  "464": {
    "strong": "464",
    "root": "אֱלִיפַז",
    "gloss": "Eliphaz"
  },
  "465": {
    "strong": "465",
    "root": "אֱלִיפָל",
    "gloss": "Eliphal"
  },
  "466": {
    "strong": "466",
    "root": "אֱלִיפְלֵהוּ",
    "gloss": "Elipheleh"
  },
  "467": {
    "strong": "467",
    "root": "אֱלִיפֶלֶט",
    "gloss": "Eliphalet, Eliphelet, Elpalet"
  },
  "468": {
    "strong": "468",
    "root": "אֱלִיצוּר",
    "gloss": "Elizur"
  },
  "469": {
    "strong": "469",
    "root": "אֱלִיצָפָן",
    "gloss": "Elizaphan, Elzaphan"
  },
  "470": {
    "strong": "470",
    "root": "אֱלִיקָא",
    "gloss": "Elika"
  },
  "471": {
    "strong": "471",
    "root": "אֶלְיָקִים",
    "gloss": "Eliakim"
  },
  "472": {
    "strong": "472",
    "root": "אֱלִישֶׁבַע",
    "gloss": "Elisheba"
  },
  "473": {
    "strong": "473",
    "root": "אֱלִישָׁה",
    "gloss": "Elishah"
  },
  "474": {
    "strong": "474",
    "root": "אֱלִישׁוּעַ",
    "gloss": "Elishua"
  },
  "475": {
    "strong": "475",
    "root": "אֶלְיָשִׁיב",
    "gloss": "Eliashib"
  },
  "476": {
    "strong": "476",
    "root": "אֱלִישָׁמָע",
    "gloss": "Elishama"
  },
  "477": {
    "strong": "477",
    "root": "אֱלִישָׁע",
    "gloss": "Elisha"
  },
  "478": {
    "strong": "478",
    "root": "אֱלִישָׁפָט",
    "gloss": "Elishaphat"
  },
  "479": {
    "strong": "479",
    "root": "אִלֵּךְ",
    "gloss": "these, those"
  },
  "480": {
    "strong": "480",
    "root": "אַלְלַי",
    "gloss": "woe"
  },
  "481": {
    "strong": "481",
    "root": "אָלַם",
    "gloss": "bind, be dumb, put to silence"
  },
  "482": {
    "strong": "482",
    "root": "אֵלֶם",
    "gloss": "congregation. Compare"
  },
  "483": {
    "strong": "483",
    "root": "אִלֵּם",
    "gloss": "dumb (man)"
  },
  "484": {
    "strong": "484",
    "root": "אַלְמֻגִּים",
    "gloss": "almug trees. Compare"
  },
  "485": {
    "strong": "485",
    "root": "אֲלֻמָּה",
    "gloss": "sheaf"
  },
  "486": {
    "strong": "486",
    "root": "אַלְמוֹדָד",
    "gloss": "Almodad"
  },
  "487": {
    "strong": "487",
    "root": "אַלַּמֶּלֶךְ",
    "gloss": "Alammelech"
  },
  "488": {
    "strong": "488",
    "root": "אַלְמָן",
    "gloss": "forsaken"
  },
  "489": {
    "strong": "489",
    "root": "אַלְמֹן",
    "gloss": "widowhood"
  },
  "490": {
    "strong": "490",
    "root": "אַלְמָנָה",
    "gloss": "desolate house (palace), widow"
  },
  "491": {
    "strong": "491",
    "root": "אַלְמָנוּת",
    "gloss": "widow, widowhood"
  },
  "492": {
    "strong": "492",
    "root": "אַלְמֹנִי",
    "gloss": "one, and such"
  },
  "493": {
    "strong": "493",
    "root": "אֶלְנַעַם",
    "gloss": "Elnaam"
  },
  "494": {
    "strong": "494",
    "root": "אֶלְנָתָן",
    "gloss": "Elnathan"
  },
  "495": {
    "strong": "495",
    "root": "אֶלָּסָר",
    "gloss": "Ellasar"
  },
  "496": {
    "strong": "496",
    "root": "אֶלְעָד",
    "gloss": "Elead"
  },
  "497": {
    "strong": "497",
    "root": "אֶלְעָדָה",
    "gloss": "Eladah"
  },
  "498": {
    "strong": "498",
    "root": "אֶלְעוּזַי",
    "gloss": "Eluzai"
  },
  "499": {
    "strong": "499",
    "root": "אֶלְעָזָר",
    "gloss": "Eleazar"
  },
  "500": {
    "strong": "500",
    "root": "אֶלְעָלֵא",
    "gloss": "Elealeh"
  }
};

/**
 * Gets English gloss for a Hebrew root
 * @param root The Hebrew root
 * @returns The English gloss, or null if not found
 */
export function getGlossForRoot(root: string): string | null {
  if (!root) return null;
  
  // Search through strongRoots for a matching root
  for (const strong of Object.values(strongRoots)) {
    if (strong.root === root) {
      return strong.gloss;
    }
  }
  
  return null;
}
