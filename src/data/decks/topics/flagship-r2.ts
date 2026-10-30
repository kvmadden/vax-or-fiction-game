// Deck module for flagship-r2 (contentRevision 2026-09-06). Ported once from the earlier static edition's deck JSON;
// this file is now the source. Edit it directly. Question text changes also need content/bank/metadata updates.
import {
  Deck,
} from "../../types";

declare module "../../types" {
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

export const flagshipPolishDeck: Deck = {
  "id": "flagship-r2",
  "title": "Vax or Fiction? (2026-09 Polish)",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-06",
  "defaultTimerSeconds": 20,
  "description": "Reviewed true-or-false questions built to start practical conversations.",
  "defaults": {
    "conviction": true,
    "talkWindowSeconds": 45,
    "leaderboard": false,
    "commitments": true,
    "reactions": true
  },
  "layoutAssignments": {
    "editorial-split": [
      1,
      11,
      18
    ],
    "numeric-poster": [
      3,
      6,
      9,
      15
    ],
    "three-site-map": [
      2,
      12,
      20
    ],
    "comparison": [
      5,
      8,
      14,
      16,
      19
    ],
    "timeline": [
      7,
      17
    ],
    "offset-split": [
      4,
      10,
      13
    ]
  },
  "imageRequirements": [
    {
      "id": "plate-q01",
      "questionIds": [
        1
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
        2
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
        3
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
        4
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
        5
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
        6
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
        7
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
      "questionIds": [
        8
      ],
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
        9
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
        10
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
        11
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
        12
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
        13
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
      "questionIds": [
        14
      ],
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
        15
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
        16
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
        17
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
        18
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
      "questionIds": [
        19
      ],
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
        20
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
      "questionIds": [],
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
    }
  ],
  "staticSlides": [
    {
      "id": "title",
      "type": "title",
      "title": "Vax or Fiction?",
      "body": "Reviewed true-or-false questions built to start practical conversations.",
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
        4,
        5
      ]
    },
    {
      "id": "group-2",
      "questionIds": [
        6,
        7,
        8,
        9,
        10
      ]
    },
    {
      "id": "group-3",
      "questionIds": [
        11,
        12,
        13,
        14,
        15
      ]
    },
    {
      "id": "group-4",
      "questionIds": [
        16,
        17,
        18,
        19,
        20
      ]
    }
  ],
  "modes": {
    "full": {
      "id": "full",
      "label": "Full",
      "questionIds": [
        "q1",
        "q2",
        "q3",
        "q4",
        "q5",
        "q6",
        "q7",
        "q8",
        "q9",
        "q10",
        "q11",
        "q12",
        "q13",
        "q14",
        "q15",
        "q16",
        "q17",
        "q18",
        "q19",
        "q20"
      ],
      "timerSeconds": 20,
      "runtimeLabel": "25–35 min",
      "timerEnabledByDefault": false
    },
    "lightning": {
      "id": "lightning",
      "label": "Lightning",
      "questionIds": [
        "q3",
        "q4",
        "q5",
        "q6",
        "q11",
        "q15",
        "q16",
        "q18"
      ],
      "timerSeconds": 15,
      "runtimeLabel": "8–12 min",
      "timerEnabledByDefault": true
    }
  },
  "modeOrder": [
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
      "accessedDate": "2026-09-06",
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
      "accessedDate": "2026-09-06",
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
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "About half of people living with hepatitis B do not know they have it.",
      "answer": true,
      "reveal": "Many people have no symptoms until much later. Chronic infection can cause cirrhosis, liver cancer, and death.",
      "takeaway": "Invisible is not harmless.",
      "topicCue": "Question 1",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q01",
      "teachingRole": "surprise",
      "discussionPrompt": "What makes hepatitis B easy to miss?",
      "patientConversation": "What plain-language sentence explains why feeling well does not remove the concern?",
      "presenterNote": "Invite the room to name what symptom-free infection can hide before revealing the long-term liver consequences.",
      "sourceIds": [
        "cdc-hepatitis-b-about"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Prevnar 20 and Capvaxive protect only against pneumonia.",
      "answer": false,
      "reveal": "Pneumococcal disease can also cause bloodstream infection and meningitis.",
      "takeaway": "Lungs. Bloodstream. Brain.",
      "topicCue": "Question 2",
      "authoringId": "q2",
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
      "emphasis": [
        "only"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "In the week after a confirmed flu infection, heart-attack risk can be about six times higher.",
      "answer": true,
      "reveal": "A CDC-cited study found heart-attack risk rose sixfold during that week. Another study found sudden, serious heart complications in about 1 in 8 adults hospitalized with flu.",
      "takeaway": "A flu shot is heart protection, too.",
      "topicCue": "Question 3",
      "authoringId": "q3",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q03",
      "teachingRole": "consequence",
      "discussionPrompt": "How does the heart connection change a flu conversation?",
      "patientConversation": "Frame the heart connection without overstating the evidence.",
      "presenterNote": "Hold the one-week window, then compare the sixfold finding with the hospitalized-adult complication estimate.",
      "sourceIds": [
        "cdc-flu-heart-disease"
      ],
      "emphasis": [
        "six times"
      ],
      "revealEmphasis": [
        "1 in 8"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "After someone has had shingles, Shingrix is no longer recommended.",
      "answer": false,
      "reveal": "Shingles can return. Eligible adults should still receive Shingrix after the acute illness resolves.",
      "takeaway": "Having shingles does not close the case.",
      "topicCue": "Question 4",
      "authoringId": "q4",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q04",
      "teachingRole": "misconception",
      "discussionPrompt": "Why might prior shingles create false reassurance?",
      "patientConversation": "Respond to someone who believes one episode settled the question.",
      "presenterNote": "Ask whether previous shingles replaces vaccination, then emphasize recurrence and waiting until the acute illness resolves.",
      "sourceIds": [
        "cdc-shingrix-considerations"
      ],
      "emphasis": [
        "no longer recommended"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "HPV causes more throat cancers in men than cervical cancers in women.",
      "answer": true,
      "reveal": "Current CDC estimates show about 13,600 HPV-attributable oropharyngeal cancers in men versus about 11,100 cervical cancers each year.",
      "takeaway": "HPV cancer is not only cervical cancer.",
      "topicCue": "Question 5",
      "authoringId": "q5",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q05",
      "teachingRole": "surprise",
      "discussionPrompt": "Which side of this cancer comparison surprises the room?",
      "patientConversation": "Broaden an HPV conversation beyond cervical cancer.",
      "presenterNote": "Have the room predict which annual estimate is larger before showing the CDC comparison.",
      "sourceIds": [
        "cdc-hpv-cancer-cases"
      ],
      "revealEmphasis": [
        "13,600"
      ],
      "takeawayEmphasis": [
        "only"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "Older adults hospitalized with RSV rarely need intensive care.",
      "answer": false,
      "reveal": "In one CDC analysis, about 1 in 6 hospitalized adults age 60 and older required intensive care.",
      "takeaway": "RSV can go far beyond a cold.",
      "topicCue": "Question 6",
      "authoringId": "q6",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q06",
      "teachingRole": "consequence",
      "discussionPrompt": "What changes when RSV is framed as an intensive-care risk?",
      "patientConversation": "Explain severe RSV without dismissing it as a cold.",
      "presenterNote": "Ask what 'rarely' implies, then anchor the reveal to hospitalized adults age 60 and older.",
      "sourceIds": [
        "cdc-rsv-hospitalized-adults"
      ],
      "emphasis": [
        "rarely"
      ],
      "revealEmphasis": [
        "1 in 6"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "Shingles pain can continue for years after the rash disappears.",
      "answer": true,
      "reveal": "Postherpetic neuralgia can last months or years, and shingles involving the face can threaten vision.",
      "takeaway": "The rash leaves. The pain can stay.",
      "topicCue": "Question 7",
      "authoringId": "q7",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q07",
      "teachingRole": "consequence",
      "discussionPrompt": "Which lasting shingles complication changes the urgency most?",
      "patientConversation": "Describe why the rash is not the whole illness.",
      "presenterNote": "Separate the visible rash from lasting pain before adding the risk to vision.",
      "sourceIds": [
        "cdc-shingles-symptoms"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "Two injectable vaccines given at one visit must go in different arms.",
      "answer": false,
      "reveal": "They can go in the same arm when injection sites are separated by at least one inch.",
      "takeaway": "Separate sites. Same visit.",
      "topicCue": "Question 8",
      "authoringId": "q8",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q08",
      "teachingRole": "applied",
      "discussionPrompt": "What practical detail makes same-arm coadministration workable?",
      "patientConversation": "Explain two vaccines in one arm while keeping the sites distinct.",
      "presenterNote": "Ask the room to picture site placement, then reveal the one-inch separation rule.",
      "sourceIds": [
        "cdc-flu-vaccine-coadministration"
      ],
      "emphasis": [
        "one visit"
      ],
      "revealEmphasis": [
        "one inch"
      ]
    },
    {
      "id": "q9",
      "index": 9,
      "kind": "binary",
      "statement": "Hepatitis B can stay infectious on a surface for at least seven days.",
      "answer": true,
      "reveal": "HBV can remain infectious on surfaces for at least a week.",
      "takeaway": "Surface safety still matters.",
      "topicCue": "Question 9",
      "authoringId": "q9",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q09",
      "teachingRole": "applied",
      "discussionPrompt": "How should surface persistence shape the safety conversation?",
      "patientConversation": "Connect the one-week finding to why surface safety still matters.",
      "presenterNote": "Have the room estimate how long HBV remains infectious on surfaces before revealing the one-week duration.",
      "sourceIds": [
        "cdc-hepatitis-b-clinical-overview"
      ],
      "emphasis": [
        "seven days"
      ]
    },
    {
      "id": "q10",
      "index": 10,
      "kind": "binary",
      "statement": "A healthy adult can become routinely eligible for pneumococcal vaccination at age 50.",
      "answer": true,
      "reveal": "In October 2024, ACIP lowered the routine age threshold for pneumococcal conjugate vaccination from 65 to 50 for all adults.",
      "takeaway": "Routine pneumococcal protection now starts at 50.",
      "topicCue": "Question 10",
      "authoringId": "q10",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q10",
      "teachingRole": "applied",
      "discussionPrompt": "How does lowering the routine age threshold to 50 change clinical practice?",
      "patientConversation": "Guidelines now recommend pneumococcal vaccination starting at age 50, protecting your lungs and bloodstream fifteen years earlier.",
      "presenterNote": "Highlight that ACIP lowered the routine pneumococcal threshold to age 50 in October 2024.",
      "sourceIds": [
        "cdc-pneumococcal-recommendations"
      ],
      "emphasis": [
        "age 50"
      ]
    },
    {
      "id": "q11",
      "index": 11,
      "kind": "binary",
      "statement": "Tdap during pregnancy can protect the baby before the first DTaP dose.",
      "answer": true,
      "reveal": "Tdap during each pregnancy transfers protective antibodies and helps cover the newborn before the childhood series begins.",
      "takeaway": "One vaccination. Two people protected.",
      "topicCue": "Question 11",
      "authoringId": "q11",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q11",
      "teachingRole": "consequence",
      "discussionPrompt": "Why does timing during pregnancy matter for the newborn?",
      "patientConversation": "Describe protection before the childhood series begins.",
      "presenterNote": "Ask who benefits from vaccination during pregnancy, then trace antibody transfer to the newborn.",
      "sourceIds": [
        "cdc-tdap-pregnancy"
      ]
    },
    {
      "id": "q12",
      "index": 12,
      "kind": "binary",
      "statement": "Exposure to one HPV type means Gardasil 9 cannot protect against the others.",
      "answer": false,
      "reveal": "Gardasil 9 targets nine HPV types. Exposure to one does not mean exposure to every vaccine-targeted type.",
      "takeaway": "One type is not all nine.",
      "topicCue": "Question 12",
      "authoringId": "q12",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q12",
      "teachingRole": "misconception",
      "discussionPrompt": "What does prior exposure change, and what doesn't it change?",
      "patientConversation": "Keep one prior HPV exposure from ending the vaccination conversation.",
      "presenterNote": "Ask whether one exposure represents all nine targeted types, then reveal the one-versus-nine distinction.",
      "sourceIds": [
        "cdc-hpv-vaccination-considerations"
      ],
      "revealEmphasis": [
        "nine HPV types"
      ]
    },
    {
      "id": "q13",
      "index": 13,
      "kind": "binary",
      "statement": "Heart failure can raise an adult's risk for severe RSV even without lung disease.",
      "answer": true,
      "reveal": "CDC includes chronic cardiovascular disease among the risk factors for severe RSV.",
      "takeaway": "Look beyond the lungs.",
      "topicCue": "Question 13",
      "authoringId": "q13",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q13",
      "teachingRole": "surprise",
      "discussionPrompt": "Why might heart failure be missed in an RSV risk check?",
      "patientConversation": "Connect heart failure to severe RSV risk without centering lung disease.",
      "presenterNote": "Ask for a non-lung risk factor, then foreground chronic cardiovascular disease.",
      "sourceIds": [
        "cdc-rsv-adult-guidance"
      ]
    },
    {
      "id": "q14",
      "index": 14,
      "kind": "binary",
      "statement": "An egg allergy rules out an egg-based flu vaccine.",
      "answer": false,
      "reveal": "People with egg allergy may receive any age-appropriate flu vaccine.",
      "takeaway": "Old rule. New guidance.",
      "topicCue": "Question 14",
      "authoringId": "q14",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q14",
      "teachingRole": "misconception",
      "discussionPrompt": "Which old assumption can still block a flu-vaccine conversation?",
      "patientConversation": "Reassure someone with egg allergy using the current guidance.",
      "presenterNote": "Surface the old egg-allergy rule, then reveal that any age-appropriate flu vaccine may be used.",
      "sourceIds": [
        "cdc-flu-egg-allergies"
      ]
    },
    {
      "id": "q15",
      "index": 15,
      "kind": "binary",
      "statement": "An adult hepatitis B vaccine series can take one month and help prevent liver cancer.",
      "answer": true,
      "reveal": "Heplisav-B uses two adult doses, one month apart. Preventing hepatitis B also helps prevent liver cancer.",
      "takeaway": "The faster schedule is product-specific.",
      "topicCue": "Question 15",
      "authoringId": "q15",
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
      "emphasis": [
        "one month"
      ],
      "revealEmphasis": [
        "one month"
      ]
    },
    {
      "id": "q16",
      "index": 16,
      "kind": "binary",
      "statement": "A late second Shingrix dose means the series must be restarted.",
      "answer": false,
      "reveal": "Dose two usually comes 2 to 6 months after dose one. If more than 6 months have passed, give it as soon as possible and do not restart the series.",
      "takeaway": "Finish. Do not restart.",
      "topicCue": "Question 16",
      "authoringId": "q16",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q16",
      "teachingRole": "applied",
      "discussionPrompt": "What is the next step after a delayed second dose?",
      "patientConversation": "Tell someone why their first valid dose still counts.",
      "presenterNote": "Ask whether delay erases dose one, then land on finish rather than restart.",
      "sourceIds": [
        "cdc-shingrix-considerations"
      ]
    },
    {
      "id": "q17",
      "index": 17,
      "kind": "binary",
      "statement": "Shingles involving the eye can cause permanent vision loss and is considered an ophthalmologic emergency.",
      "answer": true,
      "reveal": "Herpes zoster ophthalmicus occurs in 10% to 25% of shingles cases and can cause corneal ulceration, secondary glaucoma, and permanent blindness.",
      "takeaway": "Shingles near the eye is a vision-threatening emergency.",
      "topicCue": "Question 17",
      "authoringId": "q17",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q17",
      "teachingRole": "surprise",
      "discussionPrompt": "Why is eye involvement with shingles considered an immediate emergency?",
      "patientConversation": "Shingles isn't just a skin rash. When it reaches the eye, it can permanently impair your vision unless it's evaluated and treated immediately.",
      "presenterNote": "Emphasize that herpes zoster ophthalmicus threatens sight and requires urgent evaluation.",
      "sourceIds": [
        "cdc-shingles-symptoms"
      ],
      "revealEmphasis": [
        "10%"
      ]
    },
    {
      "id": "q18",
      "index": 18,
      "kind": "binary",
      "statement": "Adults should wait for hepatitis B blood-test results before starting vaccination.",
      "answer": false,
      "reveal": "CDC recommends screening, but testing should not become a barrier to vaccination.",
      "takeaway": "Screen, but do not stall.",
      "topicCue": "Question 18",
      "authoringId": "q18",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q18",
      "teachingRole": "applied",
      "discussionPrompt": "How can screening happen without becoming a vaccination barrier?",
      "patientConversation": "Respond when someone thinks testing must finish first.",
      "presenterNote": "Ask whether screening changes today's vaccination decision, then emphasize screen without stalling.",
      "sourceIds": [
        "cdc-hepatitis-b-vaccine-administration"
      ]
    },
    {
      "id": "q19",
      "index": 19,
      "kind": "binary",
      "statement": "Tdap is recommended during every pregnancy, even when pregnancies are close together.",
      "answer": true,
      "reveal": "Antibody levels decline, so vaccination during each pregnancy transfers protection to each infant.",
      "takeaway": "Every pregnancy. Every baby.",
      "topicCue": "Question 19",
      "authoringId": "q19",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q19",
      "teachingRole": "applied",
      "discussionPrompt": "Why does a prior pregnancy dose not settle the next pregnancy?",
      "patientConversation": "Explain the recommendation when pregnancies are close together.",
      "presenterNote": "Ask whether spacing between pregnancies changes the recommendation, then connect each pregnancy to each infant.",
      "sourceIds": [
        "cdc-tdap-pregnancy"
      ],
      "emphasis": [
        "every pregnancy"
      ],
      "takeawayEmphasis": [
        "Every pregnancy"
      ]
    },
    {
      "id": "q20",
      "index": 20,
      "kind": "binary",
      "statement": "Different vaccine recommendations can help prevent infections, some cancers, and cardiac complications.",
      "answer": true,
      "reveal": "Hepatitis B and HPV vaccines prevent infections that can cause cancer. Flu vaccination is linked to fewer cardiac events in people with heart disease.",
      "takeaway": "Seconds to offer. A lifetime of impact.",
      "topicCue": "Question 20",
      "authoringId": "q20",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q20",
      "teachingRole": "applied",
      "discussionPrompt": "Which prevention outcome is easiest to miss in a routine offer?",
      "patientConversation": "Connect infection, cancer, and cardiac risk in one clear recommendation.",
      "presenterNote": "Use the final reveal to connect the three reviewed outcomes without collapsing them into one claim.",
      "sourceIds": [
        "who-hepatitis-b",
        "cdc-hpv-cancers",
        "cdc-flu-heart-disease"
      ]
    }
  ]
};
