// Deck module for season-2 (contentRevision 2026-09-06). Ported once from the earlier static edition's deck JSON;
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

export const seasonTwoDeck: Deck = {
  "id": "season-2",
  "title": "Vax or Fiction? · Season 2",
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
      "intendedSubject": "A post-viral cardiovascular checkup examining arterial and heart health with diagnostic charts.",
      "focalPointIntent": "Position heart and vascular diagnostics on the right with open negative space on the left.",
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
      "intendedSubject": "A demonstration showing an inactive antigen vial and normal cellular immune signaling.",
      "focalPointIntent": "Center inactive antigen visual on the right.",
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
      "intendedSubject": "A clinical examination highlighting neurological cranial pathways and cerebral blood vessel protection.",
      "focalPointIntent": "Keep cranial and vascular detail in the right field.",
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
      "intendedSubject": "A consultation discussing metabolic risk factors and mucosal defense against bacterial pathogens.",
      "focalPointIntent": "Place clinician conversation on the right with clean copy space.",
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
      "intendedSubject": "Maternal antibody placental transfer during the third trimester protecting a newborn bassinet.",
      "focalPointIntent": "Set maternal and infant protection motifs on the right.",
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
      "intendedSubject": "A timeline comparison showing declining natural antibody levels across evolving seasonal variants.",
      "focalPointIntent": "Align variant timeline on the right.",
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
      "intendedSubject": "The 1980 historic public health declaration marking the global eradication of smallpox.",
      "focalPointIntent": "Historical archive motifs on the right with dark navy field on the left.",
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
      "intendedSubject": "Concurrent immunization demonstration using separate anatomical sites on opposite arms.",
      "focalPointIntent": "Dual injection site markers on the right without depicting needles.",
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
      "intendedSubject": "An oncology education display illustrating 9-valent viral strain coverage and cellular defense.",
      "focalPointIntent": "Nine-strain coverage shield centered right.",
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
      "intendedSubject": "Gestational calendar highlighting peak transplacental pertussis transfer weeks 27 through 36.",
      "focalPointIntent": "Calendar milestone on the right.",
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
      "intendedSubject": "A cardiac prevention consultation connecting seasonal flu vaccination to plaque stability.",
      "focalPointIntent": "Heart protection ribbon on the right.",
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
      "intendedSubject": "Adjuvant recombinant vaccine packaging replacing a historical live-vaccine chart.",
      "focalPointIntent": "Recombinant two-dose schedule right of center.",
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
      "intendedSubject": "A respiratory clinical checkup discussing bronchial airway protection in chronic lung conditions.",
      "focalPointIntent": "Airway teaching model on the right.",
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
      "intendedSubject": "A single-dose modern conjugate vaccine milestone card beside a durable protection shield.",
      "focalPointIntent": "Single-dose milestone right of center.",
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
      "intendedSubject": "An oncology and immunology consultation reviewing flexible interval dosing schedules.",
      "focalPointIntent": "Flexible interval schedule right of center.",
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
      "intendedSubject": "A wound care assessment comparing 10-year clean minor cut criteria with contaminated wound guidelines.",
      "focalPointIntent": "Criteria comparison tiles on the right.",
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
      "intendedSubject": "A milestone birthday threshold at age 75 with a clear, universal routine immunization recommendation.",
      "focalPointIntent": "Age 75 threshold marker on the right.",
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
      "intendedSubject": "A clinical shared decision-making discussion for an adult aged 27 through 45 exploring cancer defense.",
      "focalPointIntent": "Clinician and adult consultation right of center.",
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
      "intendedSubject": "A bundled seasonal immunization visit providing influenza and RSV vaccines simultaneously.",
      "focalPointIntent": "Bundled seasonal care demonstration on the right.",
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
      "intendedSubject": "Comprehensive multi-disease prevention connecting cardiac, cancer, and infant protection across the lifespan.",
      "focalPointIntent": "Systemic multi-antigen defense finale right of center.",
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
      "title": "Vax or Fiction? · Season 2",
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
      "id": "cdc-covid-long-term-effects",
      "publisher": "CDC EID",
      "shortDisplayLine": "CDC EID · Long-term effects of COVID-19",
      "accessedDate": "2026-09-29",
      "url": "https://wwwnc.cdc.gov/eid/article/31/14/25-0630_article"
    },
    {
      "id": "cdc-flu-misconceptions",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu vaccine misconceptions",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/flu/prevention/misconceptions.html"
    },
    {
      "id": "cdc-shingles-overview",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles overview",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/shingles/about/index.html"
    },
    {
      "id": "cdc-pneumo-recommendations",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal recommendations",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html"
    },
    {
      "id": "cdc-rsv-pregnant-clinical",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV in pregnancy",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/pregnant-people.html"
    },
    {
      "id": "cdc-covid-vaccines-faq",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · COVID-19 vaccine considerations",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/covid/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "who-smallpox-history",
      "publisher": "WHO",
      "shortDisplayLine": "WHO · Smallpox history",
      "accessedDate": "2026-09-06",
      "url": "https://www.who.int/news-room/spotlight/history-of-vaccination/history-of-smallpox-vaccination"
    },
    {
      "id": "cdc-hpv-acip-recommendations",
      "publisher": "CDC Pink Book",
      "shortDisplayLine": "CDC Pink Book · HPV chapter",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-11-human-papillomavirus.html"
    },
    {
      "id": "cdc-tdap-pregnancy-hcp",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Tdap during pregnancy",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/pertussis/hcp/vaccine-recommendations/vaccinating-pregnant-patients.html"
    },
    {
      "id": "cdc-flu-cardiovascular",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu and heart disease",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/flu/highrisk/heartdisease.html"
    },
    {
      "id": "cdc-shingles-clinical-guidance",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles vaccine guidance",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "cdc-rsv-adult-risk",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV clinical overview",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/rsv/hcp/clinical-overview/index.html"
    },
    {
      "id": "cdc-pneumo-conjugate-guidance",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal conjugate guidance",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html"
    },
    {
      "id": "cdc-covid-immunocompromised",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · COVID-19 vaccination for immunocompromised adults",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/covid/hcp/vaccine-considerations/immunocompromised.html"
    },
    {
      "id": "cdc-tetanus-wound-management",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Tetanus wound management",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/tetanus/hcp/clinical-guidance/index.html"
    },
    {
      "id": "cdc-rsv-adult-guidelines",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV older adults",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html"
    },
    {
      "id": "fda-gardasil9-label",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Gardasil 9 label",
      "accessedDate": "2026-09-06",
      "url": "https://www.fda.gov/vaccines-blood-biologics/vaccines/gardasil-9"
    },
    {
      "id": "cdc-rsv-coadministration",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV coadministration",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html"
    },
    {
      "id": "cdc-reasons-to-vaccinate",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Reasons adults get vaccinated",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines-adults/reasons/index.html"
    },
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "COVID-19 can raise stroke risk in the months after infection.",
      "answer": true,
      "reveal": "A study in CDC's journal found a higher risk of stroke and blood clots in the year after COVID-19.",
      "takeaway": "COVID-19 risk can outlast the illness.",
      "topicCue": "COVID-19",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q01",
      "teachingRole": "surprise",
      "discussionPrompt": "How does a lasting stroke risk change the COVID-19 talk?",
      "patientConversation": "COVID-19 can raise your risk of stroke and blood clots in the year after you’re sick.",
      "presenterNote": "Highlight a study in CDC’s journal that found a higher risk of stroke and blood clots in the year after COVID-19.",
      "sourceIds": [
        "cdc-covid-long-term-effects"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Fever or mild body aches after a flu shot mean a person caught a mild case of the flu.",
      "answer": false,
      "reveal": "Injected flu vaccines contain inactivated or recombinant proteins that cannot replicate or cause flu.",
      "takeaway": "An immune response is not an infection.",
      "topicCue": "Influenza",
      "authoringId": "q2",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q02",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you explain normal vaccine aches to a patient?",
      "patientConversation": "Flu shots can’t cause flu. Mild side effects like aches or fever are common and go away within a few days.",
      "presenterNote": "Clarify the distinction between expected immune response and viral illness.",
      "sourceIds": [
        "cdc-flu-misconceptions"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "In the month after acute shingles, an adult faces higher stroke risk.",
      "answer": true,
      "reveal": "CDC data show zoster reactivation increases ischemic stroke and heart-attack risk via arterial inflammation.",
      "takeaway": "Zoster inflammation reaches blood vessels.",
      "topicCue": "Shingles",
      "authoringId": "q3",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q03",
      "teachingRole": "consequence",
      "discussionPrompt": "Why do patients view shingles as a skin-limited rash?",
      "patientConversation": "Shingles inflames blood vessels, significantly increasing stroke risk.",
      "presenterNote": "Emphasize viral vasculopathy and vascular inflammation in the post-shingles period.",
      "sourceIds": [
        "cdc-shingles-overview"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "Adults with diabetes face the same pneumococcal disease risk as others.",
      "answer": false,
      "reveal": "CDC data show adults with diabetes face nearly three times the rate of invasive pneumococcal disease.",
      "takeaway": "Diabetes triples invasive disease risk.",
      "topicCue": "Pneumococcal",
      "authoringId": "q4",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q04",
      "teachingRole": "misconception",
      "discussionPrompt": "Which chronic conditions are easiest to miss for vaccines?",
      "patientConversation": "Diabetes weakens immunity, making pneumococcal vaccination vital.",
      "presenterNote": "Point out that chronic metabolic conditions weaken mucosal and humoral defenses.",
      "sourceIds": [
        "cdc-pneumo-recommendations"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "Maternal RSV vaccination at 32 through 36 weeks protects newborns.",
      "answer": true,
      "reveal": "CDC recommends Abrysvo at 32 through 36 weeks of pregnancy to pass antibodies that cut severe infant RSV by 80%.",
      "takeaway": "Maternal antibodies protect infants.",
      "topicCue": "RSV",
      "authoringId": "q5",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q05",
      "teachingRole": "consequence",
      "discussionPrompt": "How do you discuss maternal RSV vs infant shots?",
      "patientConversation": "Abrysvo given in pregnancy passes antibodies that shield your newborn.",
      "presenterNote": "Explain the exact gestational timing window and transplacental antibody kinetics.",
      "sourceIds": [
        "cdc-rsv-pregnant-clinical"
      ],
      "emphasis": [
        "36 weeks"
      ],
      "revealEmphasis": [
        "80%"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "Recovering from COVID-19 provides durable immunity replacing vaccination.",
      "answer": false,
      "reveal": "Protection after an infection fades, and CDC recommends this season's vaccine for all adults 18 and older.",
      "takeaway": "A past infection does not replace this season's vaccine.",
      "topicCue": "COVID-19",
      "authoringId": "q6",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q06",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you address assumptions about prior infection?",
      "patientConversation": "Protection from a past infection fades, and this season’s vaccine is updated for the strains going around now.",
      "presenterNote": "Explain that immunity after infection decreases with time and that vaccines are updated for the strains currently circulating.",
      "sourceIds": [
        "cdc-covid-vaccines-faq"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "In 1980, smallpox was declared eradicated through global vaccination.",
      "answer": true,
      "reveal": "On May 8, 1980, the World Health Assembly confirmed wild smallpox was eliminated by worldwide vaccination.",
      "takeaway": "Vaccines eliminated smallpox worldwide.",
      "topicCue": "History of Immunization",
      "authoringId": "q7",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q07",
      "teachingRole": "applied",
      "discussionPrompt": "What lessons from smallpox eradication remain relevant today?",
      "patientConversation": "Worldwide immunization eliminated smallpox, showing its power.",
      "presenterNote": "Celebrate historical eradication as proof of what sustained population vaccination achieves.",
      "sourceIds": [
        "who-smallpox-history"
      ]
    },
    {
      "id": "q9",
      "index": 9,
      "kind": "binary",
      "statement": "Gardasil 9 covers the HPV types behind most cervical cancers.",
      "answer": true,
      "reveal": "Gardasil 9 covers nine HPV types, seven that can cause cancer and two that cause genital warts. About 15% of cervical cancers come from types it does not cover.",
      "takeaway": "Most, not all: cervical screening still matters.",
      "topicCue": "HPV",
      "authoringId": "q9",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q09",
      "teachingRole": "consequence",
      "discussionPrompt": "How do you frame HPV immunization as cancer prevention?",
      "patientConversation": "Gardasil 9 targets nine viral types to prevent HPV-linked cancers.",
      "presenterNote": "Review the jump in oncogenic serotype coverage from 4-valent to 9-valent vaccine.",
      "sourceIds": [
        "cdc-hpv-acip-recommendations"
      ],
      "emphasis": [
        "most cervical cancers"
      ],
      "revealEmphasis": [
        "15%"
      ]
    },
    {
      "id": "q10",
      "index": 10,
      "kind": "binary",
      "statement": "Giving Tdap at 27 to 36 weeks of pregnancy gives infants peak protection.",
      "answer": true,
      "reveal": "Maternal antibodies cross the placenta, making Tdap at 27 to 36 weeks up to 90% effective for young infants.",
      "takeaway": "Third-trimester Tdap protects infants.",
      "topicCue": "Tdap",
      "authoringId": "q10",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q10",
      "teachingRole": "consequence",
      "discussionPrompt": "Why is maternal Tdap preferred over cocooning alone?",
      "patientConversation": "Tdap in weeks 27 to 36 passes antibodies that shield your newborn.",
      "presenterNote": "Explain why waiting until postpartum is too late for neonatal protection.",
      "sourceIds": [
        "cdc-tdap-pregnancy-hcp"
      ],
      "emphasis": [
        "27 to 36 weeks"
      ],
      "revealEmphasis": [
        "90%"
      ]
    },
    {
      "id": "q11",
      "index": 11,
      "kind": "binary",
      "statement": "For heart disease patients, an annual flu shot lowers cardiac event rates.",
      "answer": true,
      "reveal": "CDC and AHA data show flu shots in heart patients reduce cardiovascular death and major ischemic events by a third.",
      "takeaway": "Flu vaccination acts as cardiac defense.",
      "topicCue": "Influenza",
      "authoringId": "q11",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q11",
      "teachingRole": "consequence",
      "discussionPrompt": "How do you connect flu vaccination to heart health in visits?",
      "patientConversation": "For heart patients, annual flu shots shield against cardiac events.",
      "presenterNote": "Discuss plaque instability provoked by systemic viral inflammatory cascades.",
      "sourceIds": [
        "cdc-flu-cardiovascular"
      ]
    },
    {
      "id": "q12",
      "index": 12,
      "kind": "binary",
      "statement": "An adult aged 50 or older who received Zostavax does not need Shingrix.",
      "answer": false,
      "reveal": "Zostavax protection waned over five years. CDC recommends two doses of Shingrix for all adults 50 and older.",
      "takeaway": "Shingrix is recommended after Zostavax.",
      "topicCue": "Shingles",
      "authoringId": "q12",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q12",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you identify patients who need Shingrix after Zostavax?",
      "patientConversation": "Older shingles shots lost their protection, but Shingrix restores it.",
      "presenterNote": "Clarify that previous Zostavax receipt does not remove the need for Shingrix.",
      "sourceIds": [
        "cdc-shingles-clinical-guidance"
      ],
      "emphasis": [
        "50 or older"
      ],
      "revealEmphasis": [
        "50 and older"
      ]
    },
    {
      "id": "q13",
      "index": 13,
      "kind": "binary",
      "statement": "Asthma and COPD raise an adult’s risk of severe RSV illness.",
      "answer": true,
      "reveal": "CDC lists chronic lung disease, including COPD and asthma, among the conditions that raise the risk of severe RSV illness. Adults 50 through 74 with one of these conditions are recommended a dose of RSV vaccine.",
      "takeaway": "Chronic lung disease raises the risk of severe RSV.",
      "topicCue": "RSV",
      "authoringId": "q13",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-q13",
      "teachingRole": "surprise",
      "discussionPrompt": "Why is RSV often overlooked during COPD flare-ups?",
      "patientConversation": "RSV can sometimes make asthma or COPD worse, and a vaccine helps protect you.",
      "presenterNote": "Emphasize that chronic lung disease is among the conditions that raise the risk of severe RSV illness, so adults 50 through 74 with it are recommended a dose.",
      "sourceIds": [
        "cdc-rsv-adult-risk"
      ],
      "revealEmphasis": [
        "chronic lung disease"
      ]
    },
    {
      "id": "q14",
      "index": 14,
      "kind": "binary",
      "statement": "Healthy adults receiving Prevnar 20 at age 50 need five-year boosters.",
      "answer": false,
      "reveal": "Under ACIP guidance, adults given Prevnar 20 or Capvaxive at age 50+ do not need routine five-year boosters.",
      "takeaway": "One conjugate dose gives lasting defense.",
      "topicCue": "Pneumococcal",
      "authoringId": "q14",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q14",
      "teachingRole": "misconception",
      "discussionPrompt": "How have conjugate vaccines simplified schedules?",
      "patientConversation": "Conjugate pneumococcal shots are one dose, and no booster is needed.",
      "presenterNote": "Contrast old polysaccharide booster requirements with modern conjugate duration.",
      "sourceIds": [
        "cdc-pneumo-conjugate-guidance"
      ],
      "emphasis": [
        "age 50"
      ],
      "revealEmphasis": [
        "age 50"
      ]
    },
    {
      "id": "q15",
      "index": 15,
      "kind": "binary",
      "statement": "Immunocompromised adults can receive added COVID-19 vaccine doses.",
      "answer": true,
      "reveal": "CDC recommends COVID-19 vaccination for people who are moderately or severely immunocompromised, on a modified schedule that can include extra doses.",
      "takeaway": "Weakened immunity qualifies for doses.",
      "topicCue": "COVID-19",
      "authoringId": "q15",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q15",
      "teachingRole": "applied",
      "discussionPrompt": "How do you coordinate added doses for immune-suppressed patients?",
      "patientConversation": "With a weakened immune system, CDC recommends a modified COVID-19 schedule that can include extra doses.",
      "presenterNote": "Explain that the number of doses for moderately or severely immunocompromised people depends on age and vaccination history.",
      "sourceIds": [
        "cdc-covid-immunocompromised"
      ],
      "revealEmphasis": [
        "extra doses"
      ]
    },
    {
      "id": "q16",
      "index": 16,
      "kind": "binary",
      "statement": "A clean minor cut always requires a tetanus booster after two years.",
      "answer": false,
      "reveal": "CDC guidance advises a booster after 10 years for clean cuts, or five years for dirty wounds. Two years is covered.",
      "takeaway": "Clean cuts are covered for ten years.",
      "topicCue": "Tdap",
      "authoringId": "q16",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q16",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you assess wound contamination for tetanus timing?",
      "patientConversation": "Tetanus shots protect clean cuts for 10 years, dirty cuts for five.",
      "presenterNote": "Review the 5-year versus 10-year wound management clean-versus-contaminated threshold.",
      "sourceIds": [
        "cdc-tetanus-wound-management"
      ],
      "emphasis": [
        "always"
      ],
      "revealEmphasis": [
        "10 years"
      ]
    },
    {
      "id": "q17",
      "index": 17,
      "kind": "binary",
      "statement": "All adults aged 75 and older are recommended to receive an RSV vaccine.",
      "answer": true,
      "reveal": "CDC recommends a single RSV vaccine dose for all adults 75 and older, and for adults 50 through 74 at increased risk of severe RSV illness.",
      "takeaway": "Age 75 alone qualifies for RSV vaccine.",
      "topicCue": "RSV",
      "authoringId": "q17",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q17",
      "teachingRole": "surprise",
      "discussionPrompt": "Why did ACIP adopt a universal RSV guidance at age 75?",
      "patientConversation": "CDC recommends an RSV vaccine for everyone 75+, even in good health.",
      "presenterNote": "Contrast the universal recommendation at 75 and older with the risk-based one for ages 50 through 74.",
      "sourceIds": [
        "cdc-rsv-adult-guidelines"
      ],
      "emphasis": [
        "75 and older"
      ],
      "revealEmphasis": [
        "75 and older"
      ],
      "takeawayEmphasis": [
        "Age 75"
      ]
    },
    {
      "id": "q18",
      "index": 18,
      "kind": "binary",
      "statement": "Adults aged 27 through 45 cannot receive Gardasil 9 under guidelines.",
      "answer": false,
      "reveal": "Gardasil 9 is approved through age 45. ACIP advises clinical shared decision-making for unvaccinated adults.",
      "takeaway": "HPV vaccination is an option through 45.",
      "topicCue": "HPV",
      "authoringId": "q18",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q18",
      "teachingRole": "misconception",
      "discussionPrompt": "Which adults aged 27 through 45 benefit from Gardasil 9?",
      "patientConversation": "Adults aged 27 through 45 can get Gardasil 9 based on risk factors.",
      "presenterNote": "Explain the concept of clinical shared decision-making for adults 27 through 45.",
      "sourceIds": [
        "fda-gardasil9-label"
      ],
      "emphasis": [
        "aged 27"
      ],
      "revealEmphasis": [
        "age 45"
      ]
    },
    {
      "id": "q19",
      "index": 19,
      "kind": "binary",
      "statement": "Adults eligible for flu and RSV vaccines can safely get both at one visit.",
      "answer": true,
      "reveal": "CDC guidance confirms flu and RSV vaccines can be given together in separate sites without reducing safety.",
      "takeaway": "Flu and RSV vaccines can be co-given.",
      "topicCue": "Co-administration",
      "authoringId": "q19",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q19",
      "teachingRole": "applied",
      "discussionPrompt": "How do you coordinate giving multiple vaccines at one visit?",
      "patientConversation": "You can receive flu and RSV shots together in different arms safely.",
      "presenterNote": "Discuss administrative efficiency and eliminating missed vaccination opportunities.",
      "sourceIds": [
        "cdc-rsv-coadministration"
      ],
      "emphasis": [
        "one visit"
      ]
    },
    {
      "id": "q20",
      "index": 20,
      "kind": "binary",
      "statement": "Adult vaccines can help prevent throat cancers, flu-related heart attacks and whooping cough in babies.",
      "answer": true,
      "reveal": "Vaccines protect beyond the lungs: HPV vaccine protects against cancers HPV can cause, including throat cancers, flu vaccine protects against flu-related heart attacks, and Tdap in pregnancy helps protect infants.",
      "takeaway": "Vaccines protect far beyond the lungs.",
      "topicCue": "Comprehensive Prevention",
      "authoringId": "q20",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q20",
      "teachingRole": "applied",
      "discussionPrompt": "Which non-respiratory vaccine benefit surprises patients most?",
      "patientConversation": "Vaccines can help prevent some cancers and flu-related heart attacks, and Tdap in pregnancy helps protect babies.",
      "presenterNote": "Close the deck by reviewing how vaccines protect organ systems across the lifespan.",
      "sourceIds": [
        "cdc-reasons-to-vaccinate"
      ]
    }
  ]
};
