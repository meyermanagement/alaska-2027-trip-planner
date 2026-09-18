/**
 * What to ask about one kind of animal.
 *
 * The pet form used to ask every animal the same questions, and the questions
 * were written by somebody thinking about a dog. A horse was offered "In the
 * cabin" as a way of travelling, told that its 1,100 lb put it "over the
 * combined cabin limit most airlines publish", asked for a carrier the size of
 * "18 x 11 x 11 soft-sided", asked whether it had been spayed, and asked for a
 * rabies certificate -- which a horse may well have, but which is not the
 * document anybody checks at a show gate. The document that stops a horse is a
 * negative Coggins test, and the app never asked for one.
 *
 * So the questions come from here instead. Each species says which ways of
 * travelling are real for it, what its paperwork is called, what the words are
 * for a fixed animal, and what the weight is actually for. Everything else in
 * the app -- the form, the card, the warnings, the line Aly reads -- asks this
 * file rather than assuming.
 *
 * Two rules kept this from becoming a taxonomy:
 *
 *   1. A difference earns a field only if it changes a decision. A horse and a
 *      dog differ in a hundred ways; they differ *here* in how they get there,
 *      what paperwork travels with them, and who looks after them.
 *   2. Anything not listed falls back to the generic profile, so an animal the
 *      app has never heard of still gets a sensible form rather than a broken
 *      one.
 */

// The papers an animal travels on. Not every animal has all of them, and one of
// them is not a renewal at all.
export const PAPERS = {
  rabies: {
    key: "rabies",
    column: "rabies_expiration",
    label: "Rabies certificate expiration",
    short: "Rabies certificate",
    hint: "",
  },
  health: {
    key: "health",
    column: "health_certificate_expiration",
    label: "Health certificate valid through",
    short: "Health certificate",
    hint: "Enter the date confirmed by your veterinarian. Check the timing requirements for each trip.",
  },
  coggins: {
    key: "coggins",
    column: "coggins_expiration",
    label: "Coggins test valid through",
    short: "Coggins test",
    hint: "Confirm the accepted validity period with your veterinarian and destination.",
  },
};

const GENERIC = {
  styles: ["cabin", "cargo", "car_only", "stays_home"],
  cabin: true,
  askWeight: true,
  weightHint: "Enter the animal's current weight without its carrier.",
  carrier: {
    label: "Carrier size and type",
    placeholder: "e.g. 18 x 11 x 11 in, soft-sided",
  },
  papers: ["rabies", "health"],
  askFixed: true,
  fixedLabel: "Spayed or neutered",
  fixedHint: "Useful when discussing boarding and care requirements.",
  serviceAnimal: false,
  careWord: "boarding kennel",
  temperamentPlaceholder: "Fine in a car, nervous in a crowd, sleeps anywhere",
  // A weight verdict for animals no airline cabin applies to. Left null when the
  // cabin question is real, in which case the weight decides it.
  weightVerdict: null,
  styleLabels: null,
};

const PROFILES = {
  dog: {
    ...GENERIC,
    serviceAnimal: true,
    temperamentPlaceholder:
      "Crate trained, nervous around other dogs, fine in a car",
  },

  cat: {
    ...GENERIC,
    carrier: {
      label: "Carrier size and type",
      placeholder: "e.g. 19 x 12 x 12 in, soft-sided",
    },
    temperamentPlaceholder:
      "Fine in a carrier, hides in a new room, hates the car",
  },

  // A bird does not have a rabies certificate. It has a health certificate, and
  // crossing a border it may need a good deal more than that.
  bird: {
    ...GENERIC,
    styles: ["cabin", "car_only", "stays_home"],
    carrier: {
      label: "Travel cage",
      placeholder: "Small travel cage, covered",
    },
    papers: ["health"],
    askFixed: false,
    careWord: "boarder or sitter",
    temperamentPlaceholder: "Quiet under a cover, screams at strangers",
  },

  rabbit: {
    ...GENERIC,
    styles: ["cabin", "car_only", "stays_home"],
    carrier: { label: "Carrier", placeholder: "Hard-sided, lined" },
    papers: ["health"],
    fixedLabel: "Spayed or neutered",
    careWord: "boarder or sitter",
    temperamentPlaceholder: "Handles well, stressed by noise",
  },

  guinea_pig: {
    ...GENERIC,
    styles: ["cabin", "car_only", "stays_home"],
    carrier: { label: "Carrier", placeholder: "Hard-sided, lined" },
    papers: ["health"],
    careWord: "boarder or sitter",
    temperamentPlaceholder: "Handles well, needs company",
  },

  // Ferrets do carry a rabies vaccination, and some states ask for it.
  ferret: {
    ...GENERIC,
    styles: ["cabin", "car_only", "stays_home"],
    carrier: { label: "Carrier", placeholder: "Hard-sided, lined" },
    careWord: "boarder or sitter",
    temperamentPlaceholder: "Sleeps most of a drive, escapes anything",
  },

  reptile: {
    ...GENERIC,
    styles: ["car_only", "stays_home"],
    cabin: false,
    weightVerdict: {
      key: "other",
      text: "Plan suitable transport or care at home, including any temperature and handling needs.",
    },
    carrier: {
      label: "Travel container",
      placeholder: "Insulated tub with a heat pack",
    },
    papers: ["health"],
    askFixed: false,
    careWord: "sitter",
    temperamentPlaceholder: "Needs a heat source, handles poorly when cold",
  },

  fish: {
    ...GENERIC,
    styles: ["car_only", "stays_home"],
    cabin: false,
    askWeight: false,
    weightVerdict: {
      key: "other",
      text: "Record feeding and tank-care instructions for whoever looks after them while you are away.",
    },
    carrier: null,
    papers: [],
    askFixed: false,
    careWord: "sitter",
    temperamentPlaceholder: "Tank needs topping up every few days",
  },

  // The one this whole file exists for.
  horse: {
    ...GENERIC,
    styles: ["trailer", "stays_home"],
    styleLabels: {
      stays_home: {
        label: "Usually stays at the barn",
        hint: "Arrange care at the barn instead: turnout, feed and someone checking",
      },
    },
    cabin: false,
    weightVerdict: {
      key: "other",
      text: "Plan suitable transport and care at the destination. Confirm required paperwork before travel.",
    },
    carrier: {
      label: "Trailer",
      placeholder: "2-horse straight load, ramp",
    },
    // Coggins first, because it is the one that turns a rig around at the gate.
    // Coggins and a health certificate, and not rabies. Horses are commonly
    // vaccinated for rabies, but it is not the paper anyone asks for at a state
    // line or a show gate, and warning that it is missing sends somebody to the
    // vet for the wrong thing while the Coggins quietly lapses.
    papers: ["coggins", "health"],
    weightHint:
      "Helps with transport planning and completing travel or event forms.",
    fixedLabel: "Gelded",
    fixedHint: "Useful when discussing stabling and care requirements.",
    // Miniature horses are service animals under the ADA, alongside dogs, and
    // nothing else is.
    serviceAnimal: true,
    careWord: "boarding barn",
    temperamentPlaceholder:
      "Loads easily, ties, does not like a busy warm-up ring",
  },

  other: { ...GENERIC },
};

/** The questions to ask about this kind of animal. Never returns undefined. */
export function speciesProfile(species) {
  return PROFILES[String(species || "").trim()] || GENERIC;
}

/** Match the question to the animal without changing the saved boolean. */
export function sterilizationLabel(species, sex) {
  if (species === "horse") {
    if (sex === "male") return "Gelded";
    if (sex === "female") return "Spayed";
    return "Spayed or gelded";
  }
  return speciesProfile(species).fixedLabel;
}

/** Whether this species has a document of the given kind at all. */
export function speciesHasPaper(species, key) {
  return speciesProfile(species).papers.includes(key);
}

/**
 * How an animal's sex and whether it has been fixed read together, in that
 * animal's own words.
 *
 * A mare is not spayed and a gelding is not neutered -- or rather, a gelding is
 * exactly a neutered horse, which is why the horse world has its own word and
 * does not use the other one. A gelding is also not a stallion, so a horse we
 * know has been cut is a gelding and one we know has not is a stallion, and one
 * we cannot tell is just male. Getting these words wrong is the small wrongness
 * that tells somebody who keeps horses that the app was written by somebody who
 * does not.
 */
export function sexPhrase(species, sex, fixed) {
  const known = sex === "female" || sex === "male" ? sex : null;
  if (species === "horse") {
    if (known === "male") {
      if (fixed === true) return "gelding";
      if (fixed === false) return "stallion";
      return "male";
    }
    if (known === "female") return fixed === true ? "mare, spayed" : "mare";
    return sex === "unknown" ? "sex unknown" : "";
  }
  const word =
    known === "female"
      ? "spayed"
      : known === "male"
        ? "neutered"
        : "spayed or neutered";
  const bits = [];
  if (sex) bits.push(sex === "unknown" ? "sex unknown" : sex);
  if (fixed === true) bits.push(word);
  else if (fixed === false) bits.push(`not ${word}`);
  return bits.join(", ");
}
