// Deck module for vax-or-fiction (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
// this file is now the source. Edit it directly. Question text changes also need content/bank/metadata updates.
import {
  Deck,
} from "../types";

declare module "../types" {
  interface Deck {
    description?: string;
    heldQuestionIds?: string[];
  }
  interface Question {
    layoutFamily?: LayoutFamily;
    topicCue?: string;
    authoringId?: string;
    mythQuote?: string;
  }
}

export const vaxOrFictionDeck: Deck = {
  "id": "vax-or-fiction",
  "title": "Vax or Fiction?",
  "version": 1,
  "status": "published",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "True or false, the myth among three, the number, the order of the steps, and the better reply. The room commits before the reveal.",
  "defaults": {
    "conviction": true,
    "talkWindowSeconds": 45,
    "leaderboard": false,
    "commitments": true,
    "reactions": true
  },
  "layoutAssignments": {
    "editorial-split": [
      8,
      12,
      16,
      17,
      18,
      21,
      22,
      23,
      24,
      29,
      30,
      31,
      32,
      35,
      36
    ],
    "numeric-poster": [
      2,
      5,
      10,
      14,
      19,
      20,
      33,
      34
    ],
    "three-site-map": [
      1,
      9
    ],
    "comparison": [
      4,
      11,
      13,
      25,
      26
    ],
    "timeline": [
      6,
      15,
      27,
      28
    ],
    "offset-split": [
      3,
      7
    ]
  },
  "imageRequirements": [
    {
      "id": "plate-q01",
      "questionIds": [
        13
      ],
      "slideIds": [],
      "intendedSubject": "A faceless pharmacy screening conversation where a partly covered liver teaching model is revealed beside a blank screening card.",
      "focalPointIntent": "Keep the active consultation field on the right with clear left-side copy space.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q01.md"
    },
    {
      "id": "plate-q02",
      "questionIds": [
        1
      ],
      "slideIds": [],
      "intendedSubject": "A faceless counseling scene using tangible lung, blood-sample, and brain or meninges teaching models.",
      "focalPointIntent": "Weight the three protection symbols right of center without text or labels.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q02.md"
    },
    {
      "id": "plate-q03",
      "questionIds": [
        2
      ],
      "slideIds": [],
      "intendedSubject": "A winter pharmacy conversation with an adult hand at the chest and a physical heart teaching model.",
      "focalPointIntent": "Place the heart rhythm ribbon on the right with clear negative space for copy.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q03.md"
    },
    {
      "id": "plate-q04",
      "questionIds": [
        3
      ],
      "slideIds": [],
      "intendedSubject": "An older adult shingles follow-up where a pharmacist offers a fresh appointment beside a past-illness card and calendar.",
      "focalPointIntent": "Set the adult figure to the right with clear left-side reading space.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q04.md"
    },
    {
      "id": "plate-q05",
      "questionIds": [
        4
      ],
      "slideIds": [],
      "intendedSubject": "A faceless HPV education table with recognizable throat and cervix teaching models.",
      "focalPointIntent": "Hold comparison tiles right of center with clean negative space on left.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q05.md"
    },
    {
      "id": "plate-q06",
      "questionIds": [
        5
      ],
      "slideIds": [],
      "intendedSubject": "An older adult in a monitored hospital recovery room with oxygen support and a clinician checking in.",
      "focalPointIntent": "Frame care team support on the right with clear statement space on left.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q06.md"
    },
    {
      "id": "plate-q07",
      "questionIds": [
        6
      ],
      "slideIds": [],
      "intendedSubject": "A dignified adult managing lingering pain at home while summer and winter objects show time passing.",
      "focalPointIntent": "Anchor the ribbon and adult figure right of center.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q07.md"
    },
    {
      "id": "plate-q08",
      "questionIds": [],
      "slideIds": [],
      "intendedSubject": "A close demonstration measuring two separated injection-site markers on one rolled-up sleeve without showing needles.",
      "focalPointIntent": "Position site markers and sleeve right of center without depicting needles.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q08.md"
    },
    {
      "id": "plate-q09",
      "questionIds": [
        14
      ],
      "slideIds": [],
      "intendedSubject": "Pharmacy staff cleaning a consultation counter lined with exactly seven blank calendar pages.",
      "focalPointIntent": "Keep counter surface details on the right with open copy area.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q09.md"
    },
    {
      "id": "plate-q10",
      "questionIds": [
        7
      ],
      "slideIds": [],
      "intendedSubject": "A milestone birthday card and a fresh vaccine appointment exchanged at a faceless pharmacy consultation.",
      "focalPointIntent": "Weight the milestone threshold right of center.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q10.md"
    },
    {
      "id": "plate-q11",
      "questionIds": [
        8
      ],
      "slideIds": [],
      "intendedSubject": "A faceless pharmacy consultation during pregnancy transitioning into a recognizable newborn bassinet moment.",
      "focalPointIntent": "Keep the concrete pregnancy-to-newborn scene on the right with a quiet navy copy field on the left.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q11.md"
    },
    {
      "id": "plate-q12",
      "questionIds": [
        9
      ],
      "slideIds": [],
      "intendedSubject": "A pharmacist uses a tangible nine-tab teaching flipbook with one tab folded back and eight still present.",
      "focalPointIntent": "Center orbiting shields in the right composition field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q12.md"
    },
    {
      "id": "plate-q13",
      "questionIds": [
        16
      ],
      "slideIds": [],
      "intendedSubject": "A heart-failure follow-up with a dominant heart teaching model, smaller lungs, medication organizer, and weight scale.",
      "focalPointIntent": "Place heart shield and pharmacist figure right of center.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q13.md"
    },
    {
      "id": "plate-q14",
      "questionIds": [],
      "slideIds": [],
      "intendedSubject": "Eggs, a winter scarf, and a blank appointment card within one faceless flu-vaccine consultation.",
      "focalPointIntent": "Position egg motif and pharmacist conversation in the right field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q14.md"
    },
    {
      "id": "plate-q15",
      "questionIds": [
        10
      ],
      "slideIds": [],
      "intendedSubject": "Two appointment cards spanning one monthly calendar beside a physical liver teaching model.",
      "focalPointIntent": "Keep calendar milestones on the right with durable copy space on left.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q15.md"
    },
    {
      "id": "plate-q16",
      "questionIds": [
        11
      ],
      "slideIds": [],
      "intendedSubject": "A worn first-dose card stays preserved while a pharmacist reschedules the second card to a later calendar page.",
      "focalPointIntent": "Set the milestone reconnection path on the right.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q16.md"
    },
    {
      "id": "plate-q17",
      "questionIds": [
        15
      ],
      "slideIds": [],
      "intendedSubject": "A late-1700s worktable with milk pail, cowhide cloth, notebook, and quill positioned before a later brass microscope.",
      "focalPointIntent": "Use historical action on right with clear left-side negative space.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q17.md"
    },
    {
      "id": "plate-q18",
      "questionIds": [
        12
      ],
      "slideIds": [],
      "intendedSubject": "A sealed hepatitis B screening sample and a fresh vaccine appointment offered together on one pharmacy counter.",
      "focalPointIntent": "Align dual pathways right of center.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q18.md"
    },
    {
      "id": "plate-q19",
      "questionIds": [],
      "slideIds": [],
      "intendedSubject": "Three concrete pregnancy moments with a recurring adult, fresh appointment cards, and three distinct newborn cues.",
      "focalPointIntent": "Frame family protection halos in the right illustration field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q19.md"
    },
    {
      "id": "plate-q20",
      "questionIds": [
        17
      ],
      "slideIds": [],
      "intendedSubject": "One coherent community-pharmacy finale connecting infection, cancer, and cardiac prevention conversations on one counter.",
      "focalPointIntent": "Place the grand-finale care team and three orbits right of center.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q20.md"
    },
    {
      "id": "plate-care-team",
      "questionIds": [
        18,
        23,
        31,
        32,
        34,
        35,
        36
      ],
      "slideIds": [
        "focus-disease-label",
        "focus-before-birth",
        "focus-make-offer",
        "closing"
      ],
      "intendedSubject": "A warm faceless pharmacy conversation around practical appointment, medication, and information materials.",
      "focalPointIntent": "Keep the care-team exchange on the right with durable copy space and no implied verdict.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-care-team.md"
    },
    {
      "id": "plate-curated-q13",
      "questionIds": [
        13
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 13: Shingles vaccine myths.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q13.md"
    },
    {
      "id": "plate-curated-q19",
      "questionIds": [
        19
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 19: Adult flu vaccination coverage, 2024–25.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q19.md"
    },
    {
      "id": "plate-curated-q20",
      "questionIds": [
        20
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 20: Lifetime risk of shingles.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q20.md"
    },
    {
      "id": "plate-curated-q21",
      "questionIds": [
        21
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 21: RSV vaccine for adults 50–74 at increased risk.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q21.md"
    },
    {
      "id": "plate-curated-q22",
      "questionIds": [
        22
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 22: pneumococcal vaccination at age 50.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q22.md"
    },
    {
      "id": "plate-curated-q24",
      "questionIds": [
        24
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 24: Tdap in pregnancy timing.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q24.md"
    },
    {
      "id": "plate-curated-q25",
      "questionIds": [
        25
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 25: What a flu shot can explain.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q25.md"
    },
    {
      "id": "plate-curated-q26",
      "questionIds": [
        26
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 26: The maternal RSV product.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q26.md"
    },
    {
      "id": "plate-curated-q27",
      "questionIds": [
        27
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 27: An adult primary series.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q27.md"
    },
    {
      "id": "plate-curated-q28",
      "questionIds": [
        28
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 28: A fridge alarm is not a verdict.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q28.md"
    },
    {
      "id": "plate-curated-q29",
      "questionIds": [
        29
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 29: A birthday between flu doses.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q29.md"
    },
    {
      "id": "plate-curated-q30",
      "questionIds": [
        30
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 30: Preferred does not mean postpone.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q30.md"
    },
    {
      "id": "plate-curated-q33",
      "questionIds": [
        33
      ],
      "slideIds": [],
      "intendedSubject": "Curated question 33: Who carries the flu death burden?.",
      "focalPointIntent": "Keep the live pharmacy action right of center with a calm navy left copy field.",
      "decorative": true,
      "alt": "",
      "promptFilename": "curated/q33.md"
    }
  ],
  "staticSlides": [
    {
      "id": "title",
      "type": "title",
      "title": "Vax or Fiction?",
      "body": "True or false, the myth among three, the number, the order of the steps, and the better reply. The room commits before the reveal.",
      "presenterNote": "Open with the purpose: practical, evidence-led discussion."
    },
    {
      "id": "instructions",
      "type": "instructions",
      "title": "Talk first. Reveal second.",
      "body": "Every question follows one facilitator-controlled rhythm.",
      "presenterNote": "Explain that every reveal is presenter-controlled."
    },
    {
      "id": "closing",
      "type": "closing",
      "title": "Make the offer clear",
      "body": "Connect the evidence to the risks that matter.",
      "pearl": "Every clinical interaction is an immunization assessment opportunity.",
      "summaryPoints": [
        "Assess vaccination status at every visit regardless of chief complaint.",
        "Give a strong, presumptive recommendation anchored in ACIP evidence.",
        "Administer indicated vaccines concurrently during the same clinical encounter."
      ],
      "references": [
        {
          "label": "CDC/ACIP Adult Immunization Schedule",
          "url": "https://www.cdc.gov/vaccines/schedules"
        },
        {
          "label": "CDC General Best Practice Guidelines for Immunization",
          "url": "https://www.cdc.gov/vaccines/hcp/acip-recs/general-recs/index.html"
        }
      ],
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Close with the practical invitation to make the next recommendation clear."
    }
  ],
  "focuses": [
    {
      "id": "focus-disease-label",
      "groupId": "group-1",
      "headline": "Disease is more than a label.",
      "body": "Look beyond the familiar name to the complications prevention can help avoid.",
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Bridge from disease awareness to the next practical questions."
    },
    {
      "id": "focus-before-birth",
      "groupId": "group-2",
      "headline": "Protection can begin before birth.",
      "body": "Timing, coadministration, and recommendations can make prevention more reachable.",
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Connect adult guidance to protection across a family lifecycle."
    },
    {
      "id": "focus-make-offer",
      "groupId": "group-3",
      "headline": "Make the offer.",
      "body": "The strongest next step is a clear, timely recommendation.",
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Set up the final questions and closing synthesis."
    }
  ],
  "groups": [
    {
      "id": "group-1",
      "questionIds": [
        1,
        2,
        3,
        4
      ]
    },
    {
      "id": "group-2",
      "questionIds": [
        5,
        6,
        7,
        8
      ]
    },
    {
      "id": "group-3",
      "questionIds": [
        9,
        10,
        11,
        12
      ]
    },
    {
      "id": "group-4",
      "questionIds": [
        13,
        14,
        15,
        16
      ]
    }
  ],
  "modes": {
    "curated15": {
      "id": "curated15",
      "label": "Curated 15",
      "questionIds": [
        "q4",
        "q19",
        "q5",
        "q33",
        "q21",
        "q22",
        "q30",
        "q16",
        "q10",
        "q8",
        "q2",
        "q25",
        "q18",
        "q31",
        "q15"
      ],
      "timerSeconds": 20,
      "runtimeLabel": "15–22 min",
      "timerEnabledByDefault": false
    },
    "demo": {
      "id": "demo",
      "label": "Quick demo",
      "questionIds": [
        "q4",
        "q19",
        "q5",
        "q33",
        "q21",
        "q22",
        "q30",
        "q16",
        "q25",
        "q18",
        "q29",
        "q15"
      ],
      "timerSeconds": 20,
      "runtimeLabel": "12–18 min",
      "timerEnabledByDefault": false
    },
    "full": {
      "id": "full",
      "label": "Full",
      "questionIds": [
        "q1",
        "q14",
        "q2",
        "q13",
        "q3",
        "q15",
        "q4",
        "q16",
        "q5",
        "q19",
        "q6",
        "q25",
        "q7",
        "q27",
        "q8",
        "q21",
        "q9",
        "q20",
        "q10",
        "q26",
        "q12",
        "q28",
        "q17",
        "q22",
        "q18",
        "q33",
        "q23",
        "q29",
        "q24",
        "q34",
        "q30",
        "q35",
        "q31",
        "q36",
        "q32"
      ],
      "timerSeconds": 20,
      "runtimeLabel": "25–35 min",
      "timerEnabledByDefault": false
    },
    "lightning": {
      "id": "lightning",
      "label": "Lightning",
      "questionIds": [
        "q1",
        "q2",
        "q3",
        "q4",
        "q5",
        "q6",
        "q7",
        "q8"
      ],
      "timerSeconds": 15,
      "runtimeLabel": "8–12 min",
      "timerEnabledByDefault": true
    }
  },
  "modeOrder": [
    "curated15",
    "demo",
    "full",
    "lightning"
  ],
  "citations": [
    {
      "id": "cdc-hepatitis-b-about",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · About hepatitis B",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/hepatitis-b/about/index.html"
    },
    {
      "id": "cdc-pneumococcal-disease",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal disease",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/pneumococcal/about/index.html"
    },
    {
      "id": "cdc-pneumococcal-recommendations",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal recommendations",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html"
    },
    {
      "id": "cdc-flu-heart-disease",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu and heart disease",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/flu/highrisk/heartdisease.html"
    },
    {
      "id": "cdc-shingrix-considerations",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles vaccine guidance",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "cdc-hpv-cancer-cases",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · HPV cancer statistics",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/cancer/hpv/cases.html"
    },
    {
      "id": "cdc-rsv-hospitalized-adults",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV hospitalization outcomes",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/mmwr/volumes/72/wr/pdfs/mm7240a1-H.pdf"
    },
    {
      "id": "cdc-shingles-symptoms",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles symptoms",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/shingles/signs-symptoms/index.html"
    },
    {
      "id": "cdc-flu-vaccine-coadministration",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccine coadministration",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/flu/vaccines/coadministration.html"
    },
    {
      "id": "cdc-hepatitis-b-clinical-overview",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Hepatitis B overview",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/hepatitis-b/hcp/clinical-overview/index.html"
    },
    {
      "id": "cdc-tdap-pregnancy",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Tdap during pregnancy",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/pertussis/hcp/vaccine-recommendations/vaccinating-pregnant-patients.html"
    },
    {
      "id": "cdc-hpv-vaccination-considerations",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · HPV vaccination guidance",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html"
    },
    {
      "id": "cdc-rsv-adult-guidance",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV adult guidance",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html"
    },
    {
      "id": "cdc-flu-egg-allergies",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu vaccine and egg allergy",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/flu/vaccines/egg-allergies.html"
    },
    {
      "id": "fda-heplisav-b-label",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Heplisav-B prescribing information",
      "accessedDate": "2026-08-31",
      "url": "https://www.fda.gov/media/108745/download"
    },
    {
      "id": "who-hepatitis-b",
      "publisher": "WHO",
      "shortDisplayLine": "WHO · Hepatitis B fact sheet",
      "accessedDate": "2026-08-31",
      "url": "https://www.who.int/news-room/fact-sheets/detail/hepatitis-b"
    },
    {
      "id": "who-smallpox-history",
      "publisher": "WHO",
      "shortDisplayLine": "WHO · Smallpox vaccination history",
      "accessedDate": "2026-08-31",
      "url": "https://www.who.int/news-room/spotlight/history-of-vaccination/history-of-smallpox-vaccination"
    },
    {
      "id": "nlm-germ-theory-history",
      "publisher": "U.S. National Library of Medicine",
      "shortDisplayLine": "NLM · Germ theory history",
      "accessedDate": "2026-08-31",
      "url": "https://lhncbc.nlm.nih.gov/LHC-publications/PDF/pub2002042.pdf"
    },
    {
      "id": "cdc-hepatitis-b-vaccine-administration",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Hepatitis B vaccination",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/hepatitis-b/hcp/vaccine-administration/index.html"
    },
    {
      "id": "cdc-hpv-cancers",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Cancers caused by HPV",
      "accessedDate": "2026-08-31",
      "url": "https://www.cdc.gov/hpv/about/cancers-caused-by-hpv.html"
    },
    {
      "id": "cdc-adult-vaccination-coverage",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult vaccination coverage, NHIS 2024",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/adultvaxview/publications-resources/vaccination-coverage-adults-2024.html"
    },
    {
      "id": "cdc-adult-standards-recommend",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult immunization standards",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/vaccines-adults/hcp/imz-standards/index.html"
    },
    {
      "id": "cdc-general-best-practice-timing",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Timing and spacing of vaccines",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html"
    },
    {
      "id": "flu-expectations",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Misconceptions About Seasonal Flu and Flu Vaccines",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/flu/prevention/misconceptions.html"
    },
    {
      "id": "maternal-rsv",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV Vaccine Guidance for Pregnant Women",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/pregnant-people.html"
    },
    {
      "id": "fda-abrysvo",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · ABRYSVO",
      "accessedDate": "2026-09-09",
      "url": "https://www.fda.gov/vaccines-blood-biologics/abrysvo"
    },
    {
      "id": "adult-tdap",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult Immunization Schedule Notes",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-schedules/adult-notes.html"
    },
    {
      "id": "storage-response",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccine storage and handling",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-5-vaccine-storage-and-handling.html"
    },
    {
      "id": "storage-viability",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Storage and Handling of Immunobiologics",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/storage-handling-immunobiologics.html"
    },
    {
      "id": "flu-2026",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Interim Clinical Considerations for the Use of Seasonal Influenza Vaccines in the United States",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html"
    },
    {
      "id": "flu-older",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu and People 65 Years and Older",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/flu/highrisk/65over.htm"
    },
    {
      "id": "tetanus-wound",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Clinical Guidance for Wound Management to Prevent Tetanus",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/tetanus/hcp/clinical-guidance/index.html"
    },
    {
      "id": "rsv-vision-2024",
      "publisher": "Payne et al., The Lancet",
      "shortDisplayLine": "Payne et al., The Lancet · RSV vaccine effectiveness, U.S. adults 60+, 2023–24",
      "accessedDate": "2026-09-09",
      "url": "https://pubmed.ncbi.nlm.nih.gov/39426837/"
    },
    {
      "id": "mild-illness",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Contraindications and Precautions",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/contraindications-precautions.html"
    },
    {
      "id": "diluent",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccine administration",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-6-vaccine-administration.html"
    },
    {
      "id": "diluent-error",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccine Storage and Handling Toolkit",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/vaccines/hcp/admin/storage/toolkit/storage-handling-toolkit.pdf"
    },
    {
      "id": "flu-burden-2024-25",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · 2024–2025 Influenza Season Summary: Severity, Disease Burden, and Burden Prevented",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/flu-burden/php/data-vis-vac/2024-2025-prevented.html"
    },
    {
      "id": "t-live",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Timing and Spacing of Immunobiologics",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html"
    },
    {
      "id": "t-egg",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu Vaccines and People with Egg Allergies",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/flu/vaccines/egg-allergies.html"
    },
    {
      "id": "t-flu-coverage",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu Vaccination Coverage, United States, 2024–25 Influenza Season",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/fluvaxview/coverage-by-season/2024-2025.html"
    },
    {
      "id": "t-shingles-risk",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles Facts and Stats",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/shingles/data-research/index.html"
    },
    {
      "id": "t-shingles-guidance",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles Vaccine Recommendations",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "t-rsv-adult",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV Vaccine Guidance for Adults",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html"
    },
    {
      "id": "t-pneumococcal",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal Vaccine Recommendations",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html"
    },
    {
      "id": "t-hpv",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · HPV Vaccine Recommendations",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html"
    },
    {
      "id": "t-tdap-pregnancy",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccinating Pregnant Patients",
      "accessedDate": "2026-09-09",
      "url": "https://www.cdc.gov/pertussis/hcp/vaccine-recommendations/vaccinating-pregnant-patients.html"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "Prevnar 20 and Capvaxive protect only against pneumonia.",
      "answer": false,
      "reveal": "Pneumococcal disease can also cause bloodstream infection and meningitis.",
      "takeaway": "Lungs. Bloodstream. Brain.",
      "topicCue": "Question 1",
      "authoringId": "q1",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q02",
      "teachingRole": "misconception",
      "discussionPrompt": "What outcome beyond pneumonia is easiest to overlook?",
      "patientConversation": "Give a one-sentence explanation of pneumococcal protection beyond the lungs.",
      "presenterNote": "Ask the room to name non-pneumonia outcomes before revealing bloodstream infection and meningitis.",
      "sourceIds": [
        "cdc-pneumococcal-disease",
        "cdc-pneumococcal-recommendations"
      ],
      "topic": "Pneumococcal shots and pneumonia",
      "emphasis": [
        "only"
      ],
      "reasons": [
        "The name says pneumonia",
        "It also covers invasive disease",
        "Seen the meningitis warning",
        "Never thought about it"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "In the week after a confirmed flu infection, heart-attack risk can be about six times higher.",
      "answer": true,
      "reveal": "A CDC-cited study found heart-attack risk rose sixfold during that week. Another study found sudden, serious heart complications in about 1 in 8 adults hospitalized with flu.",
      "takeaway": "A flu shot is heart protection, too.",
      "topicCue": "Question 2",
      "authoringId": "q2",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q03",
      "teachingRole": "consequence",
      "discussionPrompt": "How does the heart connection change a flu conversation?",
      "patientConversation": "Frame the heart connection without overstating the evidence.",
      "presenterNote": "Hold the one-week window, then compare the sixfold finding with the hospitalized-adult complication estimate.",
      "sourceIds": [
        "cdc-flu-heart-disease"
      ],
      "topic": "Flu and the heart",
      "emphasis": [
        "six times"
      ],
      "revealEmphasis": [
        "1 in 8"
      ],
      "reasons": [
        "Flu strains the heart",
        "That number sounds too high",
        "Seen a cardiac patient after flu",
        "It's a stretch from a cold"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "After someone has had shingles, Shingrix is no longer recommended.",
      "answer": false,
      "reveal": "Shingles can return. Eligible adults should still receive Shingrix after the acute illness resolves.",
      "takeaway": "Having shingles does not close the case.",
      "topicCue": "Question 3",
      "authoringId": "q3",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q04",
      "teachingRole": "misconception",
      "discussionPrompt": "Why might prior shingles create false reassurance?",
      "patientConversation": "Respond to someone who believes one episode settled the question.",
      "presenterNote": "Ask whether previous shingles replaces vaccination, then emphasize recurrence and waiting until the acute illness resolves.",
      "sourceIds": [
        "cdc-shingrix-considerations"
      ],
      "topic": "Shingles vaccine after shingles",
      "emphasis": [
        "no longer recommended"
      ],
      "reasons": [
        "Having it gives immunity",
        "Guidelines say vaccinate after recovery",
        "We tell patients to wait",
        "Not sure, it comes up a lot"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "HPV causes more throat cancers in men than cervical cancers in women.",
      "answer": true,
      "reveal": "CDC estimates about 13,600 HPV throat cancers in men each year, versus about 11,100 cervical cancers in women.",
      "takeaway": "HPV cancer is not only cervical cancer.",
      "topicCue": "Question 4",
      "authoringId": "q4",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q05",
      "teachingRole": "surprise",
      "discussionPrompt": "Which side of this cancer comparison surprises the room?",
      "patientConversation": "Broaden an HPV conversation beyond cervical cancer.",
      "presenterNote": "Have the room predict which annual estimate is larger before showing the CDC comparison.",
      "sourceIds": [
        "cdc-hpv-cancer-cases"
      ],
      "topic": "HPV cancers in men",
      "revealEmphasis": [
        "13,600"
      ],
      "takeawayEmphasis": [
        "only"
      ],
      "reasons": [
        "HPV is a women's issue in my head",
        "Throat cancer numbers have climbed",
        "Screening catches cervical cancer",
        "Seen the CDC figure"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "Older adults hospitalized with RSV rarely need intensive care.",
      "answer": false,
      "reveal": "In one CDC analysis, about 1 in 6 hospitalized adults age 60 and older required intensive care.",
      "takeaway": "RSV can go far beyond a cold.",
      "topicCue": "Question 5",
      "authoringId": "q5",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q06",
      "teachingRole": "consequence",
      "discussionPrompt": "What changes when RSV is framed as an intensive-care risk?",
      "patientConversation": "Explain severe RSV without dismissing it as a cold.",
      "presenterNote": "Ask what 'rarely' implies, then anchor the reveal to hospitalized adults age 60 and older.",
      "sourceIds": [
        "cdc-rsv-hospitalized-adults"
      ],
      "topic": "RSV in older adults",
      "emphasis": [
        "rarely"
      ],
      "revealEmphasis": [
        "1 in 6"
      ],
      "reasons": [
        "RSV is a kids' virus",
        "Older lungs struggle with RSV",
        "Seen an RSV admission",
        "ICU sounds extreme"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "Shingles pain can continue for years after the rash disappears.",
      "answer": true,
      "reveal": "Postherpetic neuralgia can last months or years, and shingles involving the face can threaten vision.",
      "takeaway": "The rash leaves. The pain can stay.",
      "topicCue": "Question 6",
      "authoringId": "q6",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q07",
      "teachingRole": "consequence",
      "discussionPrompt": "Which lasting shingles complication changes the urgency most?",
      "patientConversation": "Describe why the rash is not the whole illness.",
      "presenterNote": "Separate the visible rash from lasting pain before adding the risk to vision.",
      "sourceIds": [
        "cdc-shingles-symptoms"
      ],
      "topic": "Shingles pain",
      "reasons": [
        "The rash ends the story",
        "Postherpetic neuralgia lingers",
        "Know someone still in pain",
        "Sounds like a scare line"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "A healthy adult is due for a pneumococcal vaccine at 50.",
      "answer": true,
      "reveal": "CDC recommends it for every adult 50 and older. Which product depends on what they have already had.",
      "takeaway": "Age opens the door. History guides the product.",
      "topicCue": "Question 7",
      "authoringId": "q7",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q10",
      "teachingRole": "applied",
      "discussionPrompt": "What must be checked after age eligibility is established?",
      "patientConversation": "Explain how age and vaccination history guide the next step.",
      "presenterNote": "Ask for the routine age threshold first, then emphasize that history still guides product choice.",
      "sourceIds": [
        "cdc-pneumococcal-recommendations"
      ],
      "topic": "Pneumococcal at 50",
      "revealEmphasis": [
        "50 and older"
      ],
      "reasons": [
        "It moved from 65 to 50",
        "I still think 65",
        "Risk conditions start earlier",
        "Saw the 2024 change"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "Tdap during pregnancy can protect the baby before the first DTaP dose.",
      "answer": true,
      "reveal": "Tdap during each pregnancy transfers protective antibodies and helps cover the newborn before the childhood series begins.",
      "takeaway": "One vaccination. Two people protected.",
      "topicCue": "Question 8",
      "authoringId": "q8",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q11",
      "teachingRole": "consequence",
      "discussionPrompt": "Why does timing during pregnancy matter for the newborn?",
      "patientConversation": "Describe protection before the childhood series begins.",
      "presenterNote": "Ask who benefits from vaccination during pregnancy, then trace antibody transfer to the newborn.",
      "sourceIds": [
        "cdc-tdap-pregnancy"
      ],
      "topic": "Tdap in pregnancy",
      "reasons": [
        "Antibodies cross the placenta",
        "Babies get their own doses",
        "Timing in pregnancy matters",
        "Heard it at a prenatal visit"
      ]
    },
    {
      "id": "q9",
      "index": 9,
      "kind": "binary",
      "statement": "Exposure to one HPV type means Gardasil 9 cannot protect against the others.",
      "answer": false,
      "reveal": "Gardasil 9 targets nine HPV types. Exposure to one does not mean exposure to every vaccine-targeted type.",
      "takeaway": "One type is not all nine.",
      "topicCue": "Question 9",
      "authoringId": "q9",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q12",
      "teachingRole": "misconception",
      "discussionPrompt": "What does prior exposure change, and what doesn't it change?",
      "patientConversation": "Keep one prior HPV exposure from ending the vaccination conversation.",
      "presenterNote": "Ask whether one exposure represents all nine targeted types, then reveal the one-versus-nine distinction.",
      "sourceIds": [
        "cdc-hpv-vaccination-considerations"
      ],
      "topic": "HPV after exposure",
      "revealEmphasis": [
        "nine HPV types"
      ],
      "reasons": [
        "Nine types, one exposure",
        "Exposure means it's too late",
        "Vaccine still covers the rest",
        "Not sure how types work"
      ]
    },
    {
      "id": "q10",
      "index": 10,
      "kind": "binary",
      "statement": "An adult hepatitis B vaccine series can take one month and help prevent liver cancer.",
      "answer": true,
      "reveal": "Heplisav-B uses two adult doses, one month apart. Preventing hepatitis B also helps prevent liver cancer.",
      "takeaway": "The faster schedule is product-specific.",
      "topicCue": "Question 10",
      "authoringId": "q10",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q15",
      "teachingRole": "surprise",
      "discussionPrompt": "Which product detail makes the one-month schedule possible?",
      "patientConversation": "Explain that the faster schedule belongs to a specific product.",
      "presenterNote": "Ask for the adult series and schedule before connecting hepatitis B prevention to liver cancer.",
      "sourceIds": [
        "fda-heplisav-b-label",
        "who-hepatitis-b"
      ],
      "topic": "Hepatitis B and liver cancer",
      "emphasis": [
        "one month"
      ],
      "revealEmphasis": [
        "one month"
      ],
      "reasons": [
        "Two doses, one month apart",
        "Hep B takes six months",
        "Depends on the product",
        "Seen the two-dose product"
      ]
    },
    {
      "id": "q11",
      "index": 11,
      "kind": "binary",
      "statement": "A late second Shingrix dose means the series must be restarted.",
      "answer": false,
      "reveal": "Dose two usually comes 2 to 6 months after dose one. If more than 6 months have passed, give it as soon as possible and do not restart the series.",
      "takeaway": "Finish. Do not restart.",
      "topicCue": "Question 11",
      "authoringId": "q11",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q16",
      "teachingRole": "applied",
      "discussionPrompt": "What is the next step after a delayed second dose?",
      "patientConversation": "Tell someone why their first valid dose still counts.",
      "presenterNote": "Ask whether delay erases dose one, then land on finish rather than restart.",
      "sourceIds": [
        "cdc-shingrix-considerations"
      ],
      "topic": "A late shingles dose",
      "reasons": [
        "Late doses don't count",
        "Never restart, just finish",
        "Depends how late",
        "We restart to be safe"
      ]
    },
    {
      "id": "q12",
      "index": 12,
      "kind": "binary",
      "statement": "Adults should wait for hepatitis B blood-test results before starting vaccination.",
      "answer": false,
      "reveal": "CDC recommends screening, but testing should not become a barrier to vaccination.",
      "takeaway": "Screen, but do not stall.",
      "topicCue": "Question 12",
      "authoringId": "q12",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q18",
      "teachingRole": "applied",
      "discussionPrompt": "How can screening happen without becoming a vaccination barrier?",
      "patientConversation": "Respond when someone thinks testing must finish first.",
      "presenterNote": "Ask whether screening changes today's vaccination decision, then emphasize screen without stalling.",
      "sourceIds": [
        "cdc-hepatitis-b-vaccine-administration"
      ],
      "topic": "Hepatitis B before testing",
      "reasons": [
        "Testing first is safer",
        "Vaccinate, no test needed",
        "Depends on risk",
        "We always test first"
      ]
    },
    {
      "id": "q13",
      "index": 13,
      "kind": "myth-among-three",
      "statement": "Which of these about the shingles vaccine is the myth?",
      "reveal": "A shingles episode does not give lasting protection. Once the acute illness has resolved, vaccination is recommended.",
      "takeaway": "Having had it is not the same as being covered.",
      "topicCue": "Question 13",
      "authoringId": "q13",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-curated-q13",
      "teachingRole": "misconception",
      "discussionPrompt": "Which of the three do patients say to you most?",
      "patientConversation": "Having had shingles won't protect you next time. The vaccine will, and it's recommended once you've recovered.",
      "presenterNote": "Read all three aloud before the phones open. The myth is the one people hear at the counter.",
      "sourceIds": [
        "cdc-shingrix-considerations"
      ],
      "topic": "Shingles vaccine myths",
      "emphasis": [
        "myth"
      ],
      "reasons": [
        "Two doses is the schedule",
        "Age 50 is the start",
        "Having it protects you",
        "Heard all three at the counter"
      ],
      "mythQuote": "If you've had shingles, you don't need the vaccine.",
      "statements": [
        "Two doses, two to six months apart.",
        "Recommended for adults 50 and older.",
        "Not needed after a shingles episode."
      ],
      "mythIndex": 2
    },
    {
      "id": "q14",
      "index": 14,
      "kind": "estimate",
      "statement": "In the 2024 US survey, about what share of adults 65 and older reported ever receiving a pneumococcal vaccine?",
      "reveal": "The 2024 National Health Interview Survey estimate was 64.7%, about two in three. It counts any past dose, not whether someone is up to date, so check each record against current recommendations.",
      "takeaway": "A prior dose does not establish current status.",
      "topicCue": "Question 14",
      "authoringId": "q14",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q09",
      "teachingRole": "surprise",
      "discussionPrompt": "Where did your gut put the number, and why?",
      "patientConversation": "Let’s check your vaccine record and the current recommendations to see whether you need a pneumococcal vaccine.",
      "presenterNote": "Name the 2024 NHIS survey. Its estimate counts people who report getting any dose, not people who finished the current schedule. Don't read one person's eligibility off a population percentage.",
      "sourceIds": [
        "cdc-adult-vaccination-coverage"
      ],
      "topic": "Pneumococcal coverage, by the numbers",
      "emphasis": [
        "65 and older"
      ],
      "revealEmphasis": [
        "64.7%"
      ],
      "reasons": [
        "Most seniors get it",
        "Coverage always lags",
        "Depends on the pharmacy",
        "Pure gut feel"
      ],
      "estimate": {
        "value": 65,
        "unit": "%",
        "tolerance": 4,
        "ranges": [
          {
            "label": "Under 45%",
            "min": 0,
            "max": 45
          },
          {
            "label": "45–60%",
            "min": 45,
            "max": 60
          },
          {
            "label": "60–75%",
            "min": 60,
            "max": 75
          },
          {
            "label": "75–90%",
            "min": 75,
            "max": 90
          },
          {
            "label": "Over 90%",
            "min": 90,
            "max": 100
          }
        ]
      }
    },
    {
      "id": "q15",
      "index": 15,
      "kind": "order",
      "statement": "What's the order for a practical vaccine conversation?",
      "reveal": "This follows the adult immunization standards CDC encourages: assess, recommend, administer or refer, then document. Answering questions and concerns is part of making the recommendation.",
      "takeaway": "Assess. Recommend and listen. Act. Document.",
      "topicCue": "Question 15",
      "authoringId": "q15",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q17",
      "teachingRole": "applied",
      "discussionPrompt": "Which step gets skipped most on a busy day?",
      "patientConversation": "Let’s review your record and any questions, then decide which vaccines are appropriate for you today.",
      "presenterNote": "The steps follow the four numbered adult immunization standards CDC encourages, and answering questions is part of the recommendation step. Confirm the indication and consent before you vaccinate.",
      "sourceIds": [
        "cdc-adult-standards-recommend"
      ],
      "topic": "The vaccine offer, in order",
      "reasons": [
        "Check the record before you recommend",
        "Answering questions is part of recommending",
        "Vaccinate or refer once it’s recommended",
        "Document is always last"
      ],
      "steps": [
        "Check the record and recommendations",
        "Make a clear recommendation and address questions",
        "Administer if indicated, or refer",
        "Document and follow up"
      ]
    },
    {
      "id": "q16",
      "index": 16,
      "kind": "which-patient",
      "statement": "What's the better reply to a patient who says a past shingles case still covers them?",
      "reveal": "A shingles episode does not confer lasting immunity. Shingrix is recommended for adults 50 and older, including those who have had shingles, once they have recovered.",
      "takeaway": "The answer is what you say next.",
      "topicCue": "Question 16",
      "authoringId": "q16",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q13",
      "teachingRole": "applied",
      "discussionPrompt": "What would you say in the next ten seconds?",
      "patientConversation": "Having had shingles won't protect you next time. The vaccine will, and it's recommended once you've recovered.",
      "presenterNote": "Two spoken replies. The better one is marked at the reveal, and beat three repeats the line.",
      "sourceIds": [
        "cdc-shingrix-considerations"
      ],
      "topic": "The better reply",
      "revealEmphasis": [
        "does not confer lasting immunity"
      ],
      "reasons": [
        "Agreeing keeps it friendly",
        "Correct the myth gently",
        "The vaccine still helps",
        "Don't argue at pickup"
      ],
      "scenario": "A patient picking up a flu shot says: “I had shingles last year, so I'm covered.”",
      "scenarioVoice": "quote",
      "choices": [
        "Great, then you're all set on that one.",
        "Having had it doesn't protect you going forward, but the vaccine still helps."
      ],
      "bestIndex": 1
    },
    {
      "id": "q17",
      "index": 17,
      "kind": "binary",
      "statement": "Two different live injectable or intranasal vaccines can be given the same day. Given 21 days apart, the second dose does not count.",
      "answer": true,
      "reveal": "Give two different live injectable or intranasal vaccines on the same day or at least four weeks apart. If the second came sooner, repeat it at least four weeks after that dose, with no grace period.",
      "takeaway": "For different live injectable or intranasal vaccines: same day or at least four weeks apart.",
      "topicCue": "Live vaccine timing",
      "authoringId": "q17",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q20",
      "teachingRole": "applied",
      "discussionPrompt": "What detail makes the three-week interval invalid?",
      "patientConversation": "If these are two different live vaccines, we can give both today or separate them by at least four weeks.",
      "presenterNote": "This applies to two different live injectable or intranasal vaccines. When you give them together, use different sites and check contraindications for each one.",
      "sourceIds": [
        "t-live"
      ],
      "topic": "Coadministration of adult vaccines at one visit",
      "emphasis": [
        "21 days apart"
      ],
      "revealEmphasis": [
        "no grace period"
      ],
      "reasons": [
        "Same day or four weeks",
        "Three weeks is close enough",
        "Not sure which vaccines are live",
        "Never give two live vaccines"
      ]
    },
    {
      "id": "q18",
      "index": 18,
      "kind": "binary",
      "statement": "Egg allergy alone, even after a severe egg reaction, does not require an extra flu-vaccine safety step.",
      "answer": true,
      "reveal": "Since 2023–24, egg allergy of any severity needs no added flu-vaccine measure. Use any age- and health-appropriate flu vaccine. Prior vaccine or component reactions are separate.",
      "takeaway": "Egg allergy alone does not add a flu-vaccine step.",
      "topicCue": "Egg allergy",
      "authoringId": "q18",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "What is covered by the phrase “egg allergy alone”?",
      "patientConversation": "Egg allergy alone needs no extra flu-shot step, but we still check your history of vaccine reactions.",
      "presenterNote": "Keep “alone” in the statement. A past reaction to a flu vaccine or one of its components needs its own assessment, and every vaccination setting has to be ready to manage allergic reactions.",
      "sourceIds": [
        "t-egg"
      ],
      "topic": "Egg allergy and influenza vaccine",
      "reasons": [
        "Any flu vaccine can be used",
        "A past egg reaction changes it",
        "Prior vaccine reaction is different",
        "I saw the 2023 update"
      ]
    },
    {
      "id": "q19",
      "index": 19,
      "kind": "estimate",
      "statement": "In the 2024–25 flu season, about what share of US adults 18 and older got a flu vaccine?",
      "reveal": "CDC’s final estimate was 41.9% of adults 18 and older, about four in ten, down from 44.9% the season before. Adults 65 and older were 63.8%.",
      "takeaway": "Fewer than half of adults got a flu vaccine.",
      "topicCue": "Flu coverage",
      "authoringId": "q19",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-curated-q19",
      "teachingRole": "surprise",
      "discussionPrompt": "Why might “almost half” still mean a missed opportunity?",
      "patientConversation": "Let’s check your record to see whether you are due for this season’s flu vaccine.",
      "presenterNote": "State that 41.9% is CDC’s final BRFSS estimate. Do not substitute the weekly dashboard figure, which uses a different method.",
      "sourceIds": [
        "t-flu-coverage"
      ],
      "topic": "Adult flu vaccination coverage, 2024–25",
      "emphasis": [
        "18 and older"
      ],
      "revealEmphasis": [
        "41.9%"
      ],
      "takeawayEmphasis": [
        "Fewer than half"
      ],
      "reasons": [
        "Feels like most adults get one",
        "Half the country skips it",
        "Seniors pull the number up",
        "Pure gut feel"
      ],
      "estimate": {
        "value": 41.9,
        "unit": "%",
        "tolerance": 4,
        "ranges": [
          {
            "label": "Under 20%",
            "min": 0,
            "max": 20
          },
          {
            "label": "20–35%",
            "min": 20,
            "max": 35
          },
          {
            "label": "35–50%",
            "min": 35,
            "max": 50
          },
          {
            "label": "50–65%",
            "min": 50,
            "max": 65
          },
          {
            "label": "Over 65%",
            "min": 65,
            "max": 100
          }
        ]
      }
    },
    {
      "id": "q20",
      "index": 20,
      "kind": "estimate",
      "statement": "Of people in the United States, about what share will get shingles at some point in life?",
      "reveal": "About 1 in 3 people in the United States will develop shingles in life. Risk increases with age. CDC recommends shingles vaccination for adults 50 and older.",
      "takeaway": "One in three people will get shingles in life.",
      "topicCue": "Shingles risk",
      "authoringId": "q20",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-curated-q20",
      "teachingRole": "surprise",
      "discussionPrompt": "What does a one-in-three lifetime chance change about the offer?",
      "patientConversation": "With shingles affecting about one in three people in life, let’s check whether you are due for vaccination.",
      "presenterNote": "CDC says risk increases with age. Don't say it rises sharply after age 50 based on this source. The 50+ vaccine recommendation is a separate fact.",
      "sourceIds": [
        "t-shingles-risk",
        "t-shingles-guidance"
      ],
      "topic": "Lifetime risk of shingles",
      "revealEmphasis": [
        "1 in 3"
      ],
      "reasons": [
        "I rarely see it at the counter",
        "Almost everyone had chickenpox",
        "Common, but not most people",
        "Pure gut feel"
      ],
      "estimate": {
        "value": 33,
        "unit": "%",
        "tolerance": 5,
        "ranges": [
          {
            "label": "Under 10%",
            "min": 0,
            "max": 10
          },
          {
            "label": "10–25%",
            "min": 10,
            "max": 25
          },
          {
            "label": "25–40%",
            "min": 25,
            "max": 40
          },
          {
            "label": "40–60%",
            "min": 40,
            "max": 60
          },
          {
            "label": "Over 60%",
            "min": 60,
            "max": 100
          }
        ]
      }
    },
    {
      "id": "q21",
      "index": 21,
      "kind": "which-patient",
      "statement": "Which adult should be offered RSV vaccine today?",
      "reveal": "CDC recommends one RSV dose for all adults 75 and older and for adults 50–74 at increased risk. COPD counts as increased risk, and RSV vaccine isn't given every year right now.",
      "takeaway": "Age 75+, or ages 50–74 with increased risk. One dose for now.",
      "topicCue": "RSV vaccine match",
      "authoringId": "q21",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-curated-q21",
      "teachingRole": "applied",
      "discussionPrompt": "Which three details decide this: age, risk condition, and prior RSV dose?",
      "patientConversation": "With COPD and no prior RSV vaccine, you meet the current recommendation for one dose.",
      "presenterNote": "No contraindications in any of the four. COPD is an increased-risk condition. A prior RSV dose means no additional dose is recommended at this time.",
      "sourceIds": [
        "t-rsv-adult"
      ],
      "topic": "RSV vaccine for adults 50–74 at increased risk",
      "revealEmphasis": [
        "every"
      ],
      "takeawayEmphasis": [
        "Age 75"
      ],
      "reasons": [
        "Age 75 is enough",
        "COPD moves eligibility earlier",
        "Prior RSV dose matters",
        "Risk and age both count"
      ],
      "scenario": "Four adults at the counter, none with a reason to hold off.",
      "choices": [
        "Age 77, got an RSV vaccine last season.",
        "Age 66, has COPD, never had an RSV vaccine.",
        "Age 48, has COPD, never had an RSV vaccine.",
        "Age 66, healthy, never had an RSV vaccine."
      ],
      "bestIndex": 1
    },
    {
      "id": "q22",
      "index": 22,
      "kind": "which-patient",
      "statement": "Who needs pneumococcal conjugate vaccine today?",
      "reveal": "At 50 and older with no conjugate dose on record, or no record at all, give PCV15, PCV20 or PCV21 today. PCV20 or PCV21 finishes it in one shot, with no PPSV23 needed.",
      "takeaway": "No record at 50? Vaccinate today and let their history pick the product.",
      "topicCue": "Pneumococcal vaccine match",
      "authoringId": "q22",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-curated-q22",
      "teachingRole": "applied",
      "discussionPrompt": "Which two facts control the routine recommendation: age and conjugate-vaccine history?",
      "patientConversation": "At 52 with an unknown record, the routine recommendation for your age applies to you. We can choose the product after we look into your history.",
      "presenterNote": "For adults 50+, check prior PCV history. PCV20 or PCV21 completes the series, and PCV15 is followed by PPSV23.",
      "sourceIds": [
        "t-pneumococcal"
      ],
      "topic": "pneumococcal vaccination at age 50",
      "revealEmphasis": [
        "no record"
      ],
      "takeawayEmphasis": [
        "No record"
      ],
      "reasons": [
        "I still use age 65",
        "Unknown history is actionable",
        "PCV20 already completes it",
        "PCV15 plus PPSV23 is complete"
      ],
      "scenario": "A routine visit. You're checking what each adult is due for.",
      "choices": [
        "Age 49, healthy, no pneumococcal doses.",
        "Age 52, pneumococcal history unknown.",
        "Age 66, got PCV20 last year.",
        "Age 57, completed PCV15 plus PPSV23 last year."
      ],
      "bestIndex": 1
    },
    {
      "id": "q23",
      "index": 23,
      "kind": "binary",
      "statement": "A 35-year-old not adequately vaccinated for HPV may decide to get HPV vaccine after clinician discussion.",
      "answer": true,
      "reveal": "HPV vaccine is not routine for everyone after age 26. Some adults 27–45 may benefit after shared decision-making, though prior exposure lowers the expected benefit.",
      "takeaway": "At ages 27–45, HPV vaccination uses shared clinical decision-making.",
      "topicCue": "Hpv shared decision",
      "authoringId": "q23",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What makes this shared decision-making rather than routine catch-up?",
      "patientConversation": "At 35, let’s discuss whether HPV vaccination may benefit you.",
      "presenterNote": "Do not present HPV vaccine as routine for every adult 27–45. Ask whether the person was adequately vaccinated and talk through the likely benefit. A new sex partner is a risk factor for new infection.",
      "sourceIds": [
        "t-hpv"
      ],
      "topic": "HPV vaccination for adults 27 to 45",
      "revealEmphasis": [
        "age 26"
      ],
      "takeawayEmphasis": [
        "ages 27–45"
      ],
      "reasons": [
        "Better late than never",
        "Routine stops at 26",
        "New exposure can matter",
        "Not everyone needs it"
      ]
    },
    {
      "id": "q24",
      "index": 24,
      "kind": "binary",
      "statement": "CDC recommends one Tdap dose in every pregnancy, between 27 and 36 weeks, preferably late in that window.",
      "answer": false,
      "reveal": "Every pregnancy and weeks 27–36 are right. “Late” is wrong: CDC prefers the early part of that window. One dose is recommended in each pregnancy.",
      "takeaway": "Every pregnancy. Early in the 27–36 week window.",
      "topicCue": "Tdap in pregnancy",
      "authoringId": "q24",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-curated-q24",
      "teachingRole": "misconception",
      "discussionPrompt": "Which word flips the timing recommendation?",
      "patientConversation": "Tdap is usually preferred early in weeks 27–36, and it is recommended in every pregnancy.",
      "presenterNote": "Preferred timing is early in weeks 27–36. If Tdap is separately indicated earlier in pregnancy, CDC does not repeat it later that pregnancy.",
      "sourceIds": [
        "t-tdap-pregnancy"
      ],
      "topic": "Tdap in pregnancy timing",
      "emphasis": [
        "preferably late"
      ],
      "revealEmphasis": [
        "Every pregnancy"
      ],
      "takeawayEmphasis": [
        "Every pregnancy"
      ],
      "reasons": [
        "Every pregnancy sounds right",
        "Later is closer to delivery",
        "I learned earlier, not later",
        "OB usually handles timing"
      ]
    },
    {
      "id": "q25",
      "index": 25,
      "kind": "myth-among-three",
      "statement": "Which of these about an inactivated flu shot is the myth?",
      "reveal": "An inactivated flu shot can't give you the flu. Protection takes about two weeks, and other respiratory viruses can still make you sick.",
      "takeaway": "Illness after a shot is not proof the shot caused flu.",
      "topicCue": "What a flu shot can explain",
      "authoringId": "q25",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-curated-q25",
      "teachingRole": "misconception",
      "discussionPrompt": "What would you ask before calling this a vaccine failure?",
      "patientConversation": "An inactivated flu shot cannot give you flu, but protection takes time and other viruses can cause similar symptoms.",
      "presenterNote": "Keep infection, immune-response timing and other respiratory viruses separate.",
      "sourceIds": [
        "flu-expectations"
      ],
      "topic": "What a flu shot can explain",
      "emphasis": [
        "myth"
      ],
      "reasons": [
        "It happened after the shot",
        "Protection takes time",
        "Another virus is possible",
        "Not sure what caused it"
      ],
      "statements": [
        "An inactivated flu shot can give someone influenza.",
        "Flu protection takes about two weeks to develop.",
        "Other viruses can cause flu-like symptoms after vaccination."
      ],
      "mythIndex": 0
    },
    {
      "id": "q26",
      "index": 26,
      "kind": "myth-among-three",
      "statement": "34 weeks pregnant, October in Ohio, first maternal RSV vaccine: which of these is the myth?",
      "reveal": "Abrysvo is the maternal RSV vaccine. Arexvy and mResvia are not approved for pregnancy.",
      "takeaway": "The indication belongs to the product, not the shelf.",
      "topicCue": "The maternal RSV product",
      "authoringId": "q26",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-curated-q26",
      "teachingRole": "consequence",
      "discussionPrompt": "What check prevents a product substitution here?",
      "patientConversation": "For RSV protection during pregnancy, we need the product approved for that use: Abrysvo.",
      "presenterNote": "The pregnancy and seasonal window are already satisfied in this hypothetical case.",
      "sourceIds": [
        "maternal-rsv",
        "fda-abrysvo"
      ],
      "topic": "The maternal RSV product",
      "emphasis": [
        "34 weeks",
        "myth"
      ],
      "reasons": [
        "All RSV products seem alike",
        "Check the pregnancy indication",
        "The age label settles it",
        "Not sure which product"
      ],
      "statements": [
        "Maternal RSV vaccination is one dose.",
        "Any RSV vaccine can be used in pregnancy.",
        "Maternal vaccination protects the baby after birth."
      ],
      "mythIndex": 1
    },
    {
      "id": "q27",
      "index": 27,
      "kind": "order",
      "statement": "Adult, never vaccinated for tetanus, not pregnant, no contraindications: what's the order of the three doses?",
      "reveal": "The adult primary series is three doses. Tdap can be the first. The second comes at least four weeks later, and the third six to twelve months after that.",
      "takeaway": "A first Tdap dose is a start, not a finished primary series.",
      "topicCue": "An adult primary series",
      "authoringId": "q27",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-curated-q27",
      "teachingRole": "applied",
      "discussionPrompt": "Where might a booster habit hide an incomplete primary series?",
      "patientConversation": "We can start today and schedule the two follow-up doses needed to complete your primary series.",
      "presenterNote": "Intervals are measured from the immediately preceding dose. No contraindications are assumed.",
      "sourceIds": [
        "adult-tdap"
      ],
      "topic": "An adult primary series",
      "emphasis": [
        "never vaccinated"
      ],
      "reasons": [
        "Tdap once should finish it",
        "Three doses make the series",
        "The second gap is longer",
        "Unsure which clock applies"
      ],
      "steps": [
        "A dose of Tdap.",
        "Td or Tdap, at least four weeks after the previous dose.",
        "Td or Tdap, six to twelve months after the previous dose."
      ]
    },
    {
      "id": "q28",
      "index": 28,
      "kind": "order",
      "statement": "After an out-of-range vaccine temperature reading, what's the right order of steps?",
      "reveal": "Quarantine affected doses at proper temperatures. Get guidance before deciding whether they can be used, and don't throw them out automatically.",
      "takeaway": "Hold the doses while their viability is assessed.",
      "topicCue": "A fridge alarm is not a verdict",
      "authoringId": "q28",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-curated-q28",
      "teachingRole": "consequence",
      "discussionPrompt": "Which decision needs outside advice before the stock moves?",
      "patientConversation": "We're checking a storage problem before we use these doses. We'll explain the plan once that check is done.",
      "presenterNote": "Notify and document promptly. Follow your local emergency SOPs. These steps are the phases that depend on each other, not every task.",
      "sourceIds": [
        "storage-response",
        "storage-viability"
      ],
      "topic": "A fridge alarm is not a verdict",
      "reasons": [
        "Throw everything away now",
        "Use it if the vial looks normal",
        "Quarantine, then assess",
        "Not sure who decides"
      ],
      "steps": [
        "Quarantine the doses at proper temperatures and notify the vaccine coordinator.",
        "Record temperature history and seek viability advice under the site SOP.",
        "Release or dispose of the doses, and document the outcome."
      ]
    },
    {
      "id": "q29",
      "index": 29,
      "kind": "which-patient",
      "statement": "Which child needs a second flu dose today?",
      "reveal": "Dose count is set by age at the first dose and prior flu-vaccine history. A child who needs two doses still gets dose two after turning nine, at least four weeks later.",
      "takeaway": "The birthday does not cancel dose two after the four-week interval.",
      "topicCue": "Flu dose two match",
      "authoringId": "q29",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-curated-q29",
      "teachingRole": "applied",
      "discussionPrompt": "Which age and timing rule control a second flu dose?",
      "patientConversation": "Because the first flu dose was at age eight and no prior doses were documented, the second dose is still due after four weeks.",
      "presenterNote": "No contraindications in any of the four. For a child who needs two doses, age at first dose and prior dose history set the plan. The minimum interval is four weeks.",
      "sourceIds": [
        "flu-2026"
      ],
      "topic": "A birthday between flu doses",
      "reasons": [
        "Nine means one dose",
        "Use age at the first dose",
        "The four-week interval matters",
        "Prior doses set the plan"
      ],
      "scenario": "Four kids in for flu shots, none with a reason to hold off.",
      "choices": [
        "Age 8. First-ever flu dose two weeks ago.",
        "Age 9. Two or more flu doses in past seasons.",
        "Age 9. First-ever flu dose at age 8, four weeks ago.",
        "Age 10. Here for this season’s flu dose."
      ],
      "bestIndex": 2
    },
    {
      "id": "q30",
      "index": 30,
      "kind": "which-patient",
      "statement": "A 70-year-old wants a flu shot. What now?",
      "reveal": "At 65+, high-dose, recombinant or adjuvanted vaccine is preferred. If unavailable, use another age-appropriate flu vaccine.",
      "takeaway": "Don’t miss the visit waiting for a preferred product.",
      "topicCue": "Preferred does not mean postpone",
      "authoringId": "q30",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-curated-q30",
      "teachingRole": "applied",
      "discussionPrompt": "Which word matters here: preferred, or required?",
      "patientConversation": "The preferred products are unavailable today, but an age-appropriate flu vaccine can still be given after screening.",
      "presenterNote": "For adults 65+, use a preferred product when available. If all three are unavailable, use another age-appropriate vaccine after screening.",
      "sourceIds": [
        "flu-2026",
        "flu-older"
      ],
      "topic": "Preferred does not mean postpone",
      "revealEmphasis": [
        "65+"
      ],
      "reasons": [
        "Wait for a preferred product",
        "An appropriate option is here",
        "Preference sounds mandatory",
        "One standard dose is enough"
      ],
      "scenario": "No high-dose, recombinant or adjuvanted product is available.",
      "choices": [
        "Another age-appropriate flu vaccine after screening.",
        "A preferred vaccine at a later visit.",
        "Two standard-dose vaccines at this visit."
      ],
      "bestIndex": 0
    },
    {
      "id": "q31",
      "index": 31,
      "kind": "which-patient",
      "statement": "Stepped on a rusty nail. Tetanus booster today?",
      "reveal": "With a complete series, a dirty wound calls for a booster once five or more years have passed since the last dose.",
      "takeaway": "For a dirty wound, do not wait for the routine ten-year mark.",
      "topicCue": "The wound changes the clock",
      "authoringId": "q31",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Which part of the wound history changes your decision?",
      "patientConversation": "For this kind of wound, six years is long enough to need a booster, even though routine boosters are ten years apart.",
      "presenterNote": "This adult has no HIV or severe immune deficiency, and with a completed series, TIG isn't indicated.",
      "sourceIds": [
        "tetanus-wound",
        "adult-tdap"
      ],
      "topic": "The wound changes the clock",
      "reasons": [
        "The routine interval is ten years",
        "Dirty wounds use five years",
        "Every puncture needs TIG",
        "I need the vaccine record"
      ],
      "scenario": "Tetanus series complete, last booster six years ago, healthy immune system.",
      "choices": [
        "Wait four more years for the routine booster.",
        "Give a tetanus booster with the wound care.",
        "Give TIG instead of a vaccine because it is a puncture."
      ],
      "bestIndex": 1
    },
    {
      "id": "q32",
      "index": 32,
      "kind": "which-patient",
      "statement": "Which RSV plan should be discussed now?",
      "reveal": "After 36 weeks 6 days, CDC advises infant RSV immunization instead of maternal vaccination.",
      "takeaway": "A missed maternal window still leaves an infant-protection plan.",
      "topicCue": "Past the maternal RSV window",
      "authoringId": "q32",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How would you explain the next option without making this sound like a dead end?",
      "patientConversation": "The maternal vaccine window has passed, so let’s plan RSV antibody protection for your baby.",
      "presenterNote": "Talk through the infant option with the maternity and pediatric teams, and follow the current infant timing guidance.",
      "sourceIds": [
        "maternal-rsv"
      ],
      "topic": "Past the maternal RSV window",
      "revealEmphasis": [
        "36 weeks"
      ],
      "reasons": [
        "One late week seems harmless",
        "Give the maternal shot after birth",
        "Plan protection for the infant",
        "Unsure about the cutoff"
      ],
      "scenario": "First maternal RSV vaccine request at 37 weeks in October in Ohio. No earlier maternal RSV dose.",
      "choices": [
        "Give Abrysvo today. One week late is close enough.",
        "Give a maternal dose after delivery for this baby.",
        "Skip the maternal dose now and arrange infant RSV antibody protection."
      ],
      "bestIndex": 2
    },
    {
      "id": "q33",
      "index": 33,
      "kind": "estimate",
      "statement": "In the 2024–25 U.S. flu season, what share of flu deaths were in adults 65 or older?",
      "reveal": "CDC’s preliminary estimate: 71%, or about seven in ten.",
      "takeaway": "Share of deaths is not a person’s chance of dying.",
      "topicCue": "Who carries the flu death burden?",
      "authoringId": "q33",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-curated-q33",
      "teachingRole": "surprise",
      "discussionPrompt": "What changes if someone mistakes this share of deaths for the risk of death after infection?",
      "patientConversation": "Flu can become serious as we get older, so let’s review your prevention plan.",
      "presenterNote": "Share of deaths is not a person’s chance of dying. Use the March 12, 2026 report for the 2024–25 season. Those modeled burden estimates were preliminary, not a count of every confirmed death.",
      "sourceIds": [
        "flu-burden-2024-25"
      ],
      "topic": "Who carries the flu death burden?",
      "emphasis": [
        "65 or older"
      ],
      "revealEmphasis": [
        "71%"
      ],
      "reasons": [
        "I am picturing the share of infections",
        "Older adults carry severe burden",
        "I want to check the denominator",
        "Unsure which season this means"
      ],
      "estimate": {
        "value": 71,
        "unit": "%",
        "tolerance": 0,
        "ranges": [
          {
            "label": "0–20%",
            "min": 0,
            "max": 20
          },
          {
            "label": "20–40%",
            "min": 20,
            "max": 40
          },
          {
            "label": "40–60%",
            "min": 40,
            "max": 60
          },
          {
            "label": "60–80%",
            "min": 60,
            "max": 80
          },
          {
            "label": "80–100%",
            "min": 80,
            "max": 100
          }
        ]
      }
    },
    {
      "id": "q34",
      "index": 34,
      "kind": "estimate",
      "statement": "In its first season, how well did the RSV vaccine keep adults 60 and older out of the hospital?",
      "reveal": "Vaccinated adults 60 and older without immune compromise were about 80% less likely to land in the hospital with RSV that first season.",
      "takeaway": "Name the population, outcome and season with the number.",
      "topicCue": "RSV protection from hospitalization",
      "authoringId": "q34",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "What would be misleading about saying simply “80% protected”?",
      "patientConversation": "That study found strong protection from RSV hospitalization, but it didn't mean everyone was fully protected.",
      "presenterNote": "Estimated effectiveness 80% (95% CI, 71 to 85) against RSV hospitalization in adults 60+ without immune compromise. This comes from a VISION test-negative observational analysis in eight states, October 2023 to March 2024. It is not a claim about every infection or later seasons. It is not an eligibility rule either. CDC now recommends one dose for all adults 75 and older and for adults 50 to 74 at increased risk.",
      "sourceIds": [
        "rsv-vision-2024"
      ],
      "topic": "RSV protection from hospitalization",
      "emphasis": [
        "first season",
        "60 and older"
      ],
      "revealEmphasis": [
        "without immune compromise"
      ],
      "reasons": [
        "I picture protection from any cold",
        "The endpoint is hospitalization",
        "The study period matters",
        "Unsure how to read effectiveness"
      ],
      "estimate": {
        "value": 80,
        "unit": "%",
        "tolerance": 0,
        "ranges": [
          {
            "label": "0–20%",
            "min": 0,
            "max": 20
          },
          {
            "label": "20–40%",
            "min": 20,
            "max": 40
          },
          {
            "label": "40–60%",
            "min": 40,
            "max": 60
          },
          {
            "label": "60–90%",
            "min": 60,
            "max": 90
          },
          {
            "label": "90–100%",
            "min": 90,
            "max": 100
          }
        ]
      }
    },
    {
      "id": "q35",
      "index": 35,
      "kind": "binary",
      "statement": "A mild cold, even with a low fever, does not by itself require delaying an inactivated flu shot.",
      "answer": true,
      "reveal": "Mild illness alone is not a reason to defer. Moderate or severe acute illness is a precaution and needs a different assessment.",
      "takeaway": "Assess severity rather than treating every symptom as a stop sign.",
      "topicCue": "A mild cold at the appointment",
      "authoringId": "q35",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "What would move this visit from mild illness to a reason to reassess?",
      "patientConversation": "A mild cold alone need not delay the shot, but we will check how you feel and screen for other precautions.",
      "presenterNote": "The statement is about mild illness alone, not a patient with an independent contraindication.",
      "sourceIds": [
        "mild-illness"
      ],
      "topic": "A mild cold at the appointment",
      "takeawayEmphasis": [
        "every"
      ],
      "reasons": [
        "Any fever means stop",
        "Severity changes the decision",
        "Check for other precautions",
        "Not sure where mild ends"
      ]
    },
    {
      "id": "q36",
      "index": 36,
      "kind": "binary",
      "statement": "Stock sterile water can replace a vaccine’s supplied diluent when both liquids look clear.",
      "answer": false,
      "reveal": "Use the diluent specified for that vaccine. Stock sterile water is not a substitute, even when it looks the same.",
      "takeaway": "Looks the same is not the same.",
      "topicCue": "A matching diluent matters",
      "authoringId": "q36",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "What verifies the match before reconstitution?",
      "patientConversation": "We need the correct matching diluent before preparing this vaccine.",
      "presenterNote": "If the wrong diluent was already used, stop and obtain product-specific error and revaccination guidance.",
      "sourceIds": [
        "diluent",
        "diluent-error"
      ],
      "topic": "A matching diluent matters",
      "reasons": [
        "Sterile should be enough",
        "The diluent is product-specific",
        "I would check the insert",
        "They look identical"
      ]
    }
  ]
};
