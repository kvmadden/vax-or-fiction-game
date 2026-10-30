// Deck module for rsv (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const rsvDeck: Deck = {
  "id": "rsv",
  "title": "RSV Reality Check",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Reviewed clinical questions on adult indications, maternal immunization, and respiratory seasonal defense.",
  "defaults": {
    "conviction": true,
    "talkWindowSeconds": 45,
    "leaderboard": false,
    "commitments": true,
    "reactions": true
  },
  "layoutAssignments": {},
  "imageRequirements": [
    {
      "id": "plate-care-team",
      "questionIds": [
        1,
        2,
        3,
        4,
        5,
        6,
        7,
        8
      ],
      "slideIds": [
        "title",
        "instructions",
        "closing"
      ],
      "intendedSubject": "A clinician consulting an adult patient regarding respiratory syncytial virus vaccination.",
      "focalPointIntent": "Center focus right with left-side typography safe zone.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-care-team.md"
    }
  ],
  "staticSlides": [
    {
      "id": "title",
      "type": "title",
      "title": "RSV Reality Check",
      "body": "Reviewed clinical questions on adult indications, maternal immunization, and respiratory seasonal defense.",
      "presenterNote": "Open by framing RSV as a significant seasonal respiratory pathogen affecting older adults and newborns."
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
      "body": "Targeted RSV recommendations safeguard our most vulnerable community members.",
      "presenterNote": "Close by summarizing age and risk-based indications for older adults and third-trimester pregnancy.",
      "pearl": "Recommend RSV vaccination routinely for all adults 75 and older, and for ages 60-74 with chronic cardiopulmonary risk.",
      "summaryPoints": [
        "Administer a single lifetime dose routinely to all adults aged 75 and older.",
        "Offer vaccination to adults aged 60 through 74 with chronic heart or lung conditions.",
        "Provide maternal vaccination at 32 through 36 weeks to protect infants from birth."
      ],
      "references": [
        {
          "label": "CDC / ACIP RSV Recommendations"
        }
      ],
      "imageRequirementId": "plate-care-team"
    }
  ],
  "focuses": [],
  "groups": [],
  "modes": {
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
      "runtimeLabel": "8–10 min",
      "timerEnabledByDefault": false
    },
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
        "q8"
      ],
      "timerSeconds": 20,
      "runtimeLabel": "10–12 min",
      "timerEnabledByDefault": false
    }
  },
  "modeOrder": [
    "lightning",
    "full"
  ],
  "citations": [
    {
      "id": "cdc-rsv-adults-75",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult RSV Recommendations for Ages 75 and Older",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html"
    },
    {
      "id": "cdc-rsv-dose-timing",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult RSV Vaccine Dosage and Timing",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/rsv/vaccines/adults.html"
    },
    {
      "id": "cdc-rsv-chronic-risk",
      "publisher": "CDC",
      "shortDisplayLine": "CDC/ACIP · RSV Clinical Indications for Ages 60–74",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/73/rr/rr7305a1.htm"
    },
    {
      "id": "cdc-rsv-hospitalization",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV clinical overview",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/rsv/hcp/clinical-overview/index.html"
    },
    {
      "id": "fda-abrysvo-maternal",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Abrysvo product page",
      "accessedDate": "2026-09-29",
      "url": "https://www.fda.gov/vaccines-blood-biologics/abrysvo"
    },
    {
      "id": "cdc-general-deferral",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Contraindications and precautions",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/contraindications-precautions.html"
    },
    {
      "id": "cdc-rsv-vaccine-composition",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Arexvy prescribing information",
      "accessedDate": "2026-09-28",
      "url": "https://www.fda.gov/media/167805/download"
    },
    {
      "id": "acip-rsv-coadmin",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV vaccine clinical guidance for adults",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html"
    },
    {
      "id": "fda-abrysvo-insert",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Abrysvo prescribing information",
      "accessedDate": "2026-09-28",
      "url": "https://www.fda.gov/media/168889/download"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "ACIP recommends a single dose of RSV vaccine for all adults aged 75 years and older.",
      "answer": true,
      "reveal": "CDC recommends RSV vaccination for all adults aged 75 and older due to high rates of severe lower respiratory tract complications.",
      "takeaway": "Universal recommendation at age 75 protects against severe seasonal respiratory hospitalization.",
      "topicCue": "UNIVERSAL SENIOR INDICATION",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why did ACIP adopt a universal recommendation at age 75 while maintaining risk stratification for ages 60 to 74?",
      "patientConversation": "RSV can cause severe lung illness in seniors. A single dose gives you seasonal defense.",
      "presenterNote": "Emphasize that at age 75, risk of severe complications is high enough to warrant universal vaccination.",
      "sourceIds": [
        "cdc-rsv-adults-75"
      ],
      "emphasis": [
        "aged 75"
      ],
      "revealEmphasis": [
        "75 and older"
      ],
      "takeawayEmphasis": [
        "age 75"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "RSV vaccination requires annual revaccination before each respiratory virus season, similar to influenza.",
      "answer": false,
      "reveal": "CDC says the RSV vaccine is not currently an annual vaccine. One dose completes vaccination, and CDC says not to give another at this time.",
      "takeaway": "One RSV dose for now, not one every year.",
      "topicCue": "DOSAGE SCHEDULE",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you clearly communicate the difference between annual flu shots and single-dose RSV protection?",
      "patientConversation": "Unlike your yearly flu shot, the RSV vaccine is currently a one-time dose.",
      "presenterNote": "Note that trials showed protection through at least 23 months for Arexvy and 16 months for Abrysvo, with some waning, and CDC will keep evaluating how long protection lasts.",
      "sourceIds": [
        "cdc-rsv-dose-timing",
        "cdc-rsv-adults-75"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "Adults aged 50 through 74 with chronic heart or lung disease qualify for RSV vaccination under ACIP guidance.",
      "answer": true,
      "reveal": "CDC recommends one RSV vaccine dose for adults aged 50 through 74 at increased risk, such as chronic heart or lung disease or a seriously weakened immune system. Everyone 75 and older is recommended too.",
      "takeaway": "Heart or lung disease at 50 to 74 means one RSV dose now.",
      "topicCue": "CHRONIC COMORBIDITIES",
      "authoringId": "q3",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Which common outpatient chronic conditions most significantly heighten the risk of severe adult RSV disease?",
      "patientConversation": "Because of your heart and lung history, ACIP recommends getting your RSV vaccine now.",
      "presenterNote": "Point out that RSV can sometimes worsen asthma, COPD or heart failure.",
      "sourceIds": [
        "cdc-rsv-adults-75"
      ],
      "emphasis": [
        "aged 50"
      ],
      "revealEmphasis": [
        "aged 50 through 74"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "RSV infection in older adults is limited to mild upper respiratory congestion that never requires inpatient hospitalization.",
      "answer": false,
      "reveal": "RSV can cause severe disease and hospitalization in adults, especially older adults and those with certain risk factors.",
      "takeaway": "RSV can put older adults in the hospital.",
      "topicCue": "DISEASE SEVERITY",
      "authoringId": "q4",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "Why has the true burden of adult RSV been historically underappreciated in community healthcare settings?",
      "patientConversation": "RSV can sometimes make asthma, COPD or heart failure worse, and it can put older adults in the hospital.",
      "presenterNote": "Point out that RSV can cause severe disease and hospitalization in adults, especially older adults and those with certain risk factors.",
      "sourceIds": [
        "cdc-rsv-hospitalization"
      ],
      "emphasis": [
        "never"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "Abrysvo is approved for pregnant individuals between 32 and 36 weeks gestation to protect newborns against severe lower respiratory tract disease.",
      "answer": true,
      "reveal": "Maternal immunization with Abrysvo during weeks 32 through 36 stimulates maternal antibodies that cross the placenta to safeguard newborns.",
      "takeaway": "Maternal immunization transfers protective antibodies across the placenta to safeguard the infant.",
      "topicCue": "MATERNAL IMMUNIZATION",
      "authoringId": "q5",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does third-trimester maternal vaccination protect infants during their most vulnerable first six months?",
      "patientConversation": "Receiving the RSV shot in your third trimester passes protective antibodies directly to your baby.",
      "presenterNote": "Explain that protection from the maternal vaccine passes from mother to baby, so babies are protected at birth.",
      "sourceIds": [
        "fda-abrysvo-maternal"
      ],
      "emphasis": [
        "32 and 36 weeks"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "An adult who got an RSV vaccine while sick with a fever needs a second dose later.",
      "answer": false,
      "reveal": "One RSV dose completes vaccination, and CDC says not to give another at this time. Mild illness, with or without fever, is not a reason to delay a vaccine.",
      "takeaway": "One RSV dose completes vaccination for now.",
      "topicCue": "CLINICAL PRECAUTIONS",
      "authoringId": "q6",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "What is the clinical protocol when a patient presents with an acute febrile illness on vaccination day?",
      "patientConversation": "A mild illness, even with a fever, doesn’t stop you from getting your RSV vaccine, and one dose is all you need for now.",
      "presenterNote": "Remind participants that mild illness, with or without fever, is not a reason to delay. Moderate or severe illness is a precaution, and vaccination is deferred.",
      "sourceIds": [
        "cdc-general-deferral"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "Arexvy and Abrysvo are recombinant protein subunit vaccines that do not contain live virus.",
      "answer": true,
      "reveal": "Both vaccines are built from a lab-made RSV F protein, not live virus, so they cannot replicate or cause infection.",
      "takeaway": "Arexvy and Abrysvo use a lab-made RSV protein, not live virus.",
      "topicCue": "VACCINE PLATFORM",
      "authoringId": "q7",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "How does prefusion F protein conformation engineering represent a major scientific breakthrough?",
      "patientConversation": "These vaccines contain protein subunits that train your immune system without live virus.",
      "presenterNote": "Explain that Arexvy and Abrysvo are built from the RSV F protein in its prefusion form, not from live virus.",
      "sourceIds": [
        "cdc-rsv-vaccine-composition",
        "fda-abrysvo-insert"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "Co-administering an adult RSV vaccine with an influenza vaccine is clinically contraindicated due to immune interference.",
      "answer": false,
      "reveal": "CDC and ACIP confirm that adult RSV vaccines can be co-administered with seasonal influenza vaccines during the same clinical visit.",
      "takeaway": "CDC confirms that indicated adult respiratory vaccines can be administered during the same visit.",
      "topicCue": "CO-ADMINISTRATION",
      "authoringId": "q8",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "What clinical benefits arise from co-administering RSV and influenza vaccines during autumn visits?",
      "patientConversation": "You can receive your RSV vaccine and flu vaccine together today at separate injection sites.",
      "presenterNote": "Reinforce that RSV vaccines can be given at the same visit as other adult vaccines, such as a flu shot.",
      "sourceIds": [
        "acip-rsv-coadmin"
      ]
    }
  ]
};
