// Source passages actually retrieved via the publishers' GitHub repositories.
// Short evidence excerpts support the answer, not independent human review of
// every distractor or difficulty label. See docs/content-review.md.
const biology =
  "https://github.com/openstax/osbooks-biology-bundle/blob/89c14e6d065606fdbe1e696ce2e8d9612a080147/modules/";
const source = (module: string, evidence: string) => ({
  reference: `${biology}${module}/index.cnxml`,
  evidence,
});
export const answerChecks: Record<
  string,
  { reference: string; evidence: string }
> = {
  "science-03": source("m66650", "the heart pumps blood through vessels"),
  "science-07": source(
    "m66430",
    "each electron has a negative charge equal to the proton's positive charge",
  ),
  "science-16": source("m66434", "makes ice less dense than liquid water"),
  "science-19": source(
    "m66434",
    "evaporation change from liquid to gaseous state at a body of water's surface",
  ),
  "science-20": source("m66430", "the proton's positive charge"),
  "science-22": source(
    "m66442",
    "Amino acids are the monomers that comprise proteins",
  ),
  "science-23": source(
    "m66443",
    "deoxyribonucleic acid (DNA) and ribonucleic acid (RNA)",
  ),
  "science-26": source(
    "m66430",
    "the nucleus, which is in the atom's center and contains protons and neutrons",
  ),
  "animals-02": source(
    "m66399",
    "The name Hexapoda describes the presence of six legs (three pairs)",
  ),
  "animals-22": source(
    "m66399",
    "a sturdy chitinous exoskeleton and jointed appendages",
  ),
  "games-10": {
    reference:
      "https://github.com/id-Software/DOOM/blob/a77dfb96cb91780ca334d0d4cfd86957558007e0/linuxdoom-1.10/doomdef.h",
    evidence: "Copyright (C) 1993-1996 by id Software, Inc.",
  },
};
