// Deck module for tdap (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const tdapDeck: Deck = {
  "id": "tdap",
  "title": "Tdap & Tetanus Defense",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Reviewed clinical questions on maternal immunization, decennial boosters, wound prophylaxis, and adult pertussis presentation.",
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
      "intendedSubject": "A clinician consulting an adult patient regarding tetanus and pertussis immunization.",
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
      "title": "Tdap & Tetanus Defense",
      "body": "Reviewed clinical questions on maternal immunization, decennial boosters, wound prophylaxis, and adult pertussis presentation.",
      "presenterNote": "Welcome the team to this refresher on tetanus, diphtheria, and pertussis immunization guidance."
    },
    {
      "id": "instructions",
      "type": "instructions",
      "title": "Talk first. Reveal second.",
      "body": "Every question follows one facilitator-controlled rhythm.",
      "presenterNote": "Encourage active team deliberation before revealing each guideline recommendation."
    },
    {
      "id": "closing",
      "type": "closing",
      "title": "Make the offer clear",
      "body": "Maternal vaccination protects vulnerable newborns, while decennial boosters preserve lifelong immunity against fatal toxin disease.",
      "presenterNote": "Conclude by reminding clinicians to evaluate tetanus status at every injury visit and third-trimester prenatal encounter.",
      "pearl": "Administer Tdap during every pregnancy at 27-36 weeks, and maintain adult decennial boosters every 10 years.",
      "summaryPoints": [
        "Provide Tdap between 27 and 36 weeks gestation during every single pregnancy.",
        "Ensure every adult receives a routine tetanus booster every 10 years.",
        "Administer a booster for contaminated wounds if 5 or more years have elapsed."
      ],
      "references": [
        {
          "label": "CDC ACIP Tetanus and Pertussis Recommendations"
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
      "id": "cdc-tdap-pregnancy",
      "publisher": "CDC ACIP",
      "shortDisplayLine": "CDC ACIP · Recommendations for Tdap in Pregnant Women",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/preview/mmwrhtml/mm6207a4.htm"
    },
    {
      "id": "acip-wound-mgmt",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Tetanus clinical guidance",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/tetanus/hcp/clinical-guidance/index.html"
    },
    {
      "id": "cdc-pinkbook-tetanus",
      "publisher": "CDC Pink Book",
      "shortDisplayLine": "CDC Pink Book · Tetanus chapter",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-21-tetanus.html"
    },
    {
      "id": "cdc-pinkbook-pertussis",
      "publisher": "CDC Pink Book",
      "shortDisplayLine": "CDC Pink Book · Pertussis chapter",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-16-pertussis.html"
    },
    {
      "id": "mmwr-tetanus-arthus-wound",
      "publisher": "CDC MMWR",
      "shortDisplayLine": "CDC MMWR · General best practice guidelines for immunization (Arthus reaction, wound management)",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/mmwr/volumes/67/rr/rr6702a1.htm"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "ACIP recommends administering a dose of Tdap during each pregnancy, preferentially between 27 and 36 weeks gestation.",
      "answer": true,
      "reveal": "Administering Tdap during weeks 27 through 36 of every pregnancy optimizes maternal antibody transfer across the placenta to protect the newborn.",
      "takeaway": "Tdap administered in every pregnancy between weeks 27 and 36 transfers essential maternal antibodies to the infant.",
      "topicCue": "MATERNAL IMMUNIZATION TIMING",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why does ACIP recommend Tdap during every pregnancy regardless of prior vaccination history?",
      "patientConversation": "Getting your Tdap shot between 27 and 36 weeks passes whooping cough protection straight to your baby.",
      "presenterNote": "Explain that maternal antibody transfer peaks in late pregnancy, providing essential passive immunity until infant vaccination begins.",
      "sourceIds": [
        "cdc-tdap-pregnancy"
      ],
      "emphasis": [
        "27 and 36 weeks"
      ],
      "revealEmphasis": [
        "every pregnancy"
      ],
      "takeawayEmphasis": [
        "every pregnancy"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Adults need a tetanus and diphtheria booster every 10 years, for life.",
      "answer": true,
      "reveal": "ACIP recommends a booster dose of Tdap or Td every 10 years for all adults.",
      "takeaway": "Every 10 years, every adult: a tetanus and diphtheria booster.",
      "topicCue": "DECENNIAL ADULT BOOSTER",
      "authoringId": "q2",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How can primary care teams build the 10-year tetanus booster into routine preventive care?",
      "patientConversation": "A tetanus booster every 10 years keeps your protection active without waiting for an injury.",
      "presenterNote": "Remind participants that the 10-year booster applies to every adult, not only after an injury.",
      "sourceIds": [
        "cdc-pinkbook-tetanus"
      ],
      "emphasis": [
        "every",
        "10 years"
      ],
      "revealEmphasis": [
        "every"
      ],
      "takeawayEmphasis": [
        "every"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "In the management of contaminated or dirty wounds, a tetanus booster is indicated if 5 or more years have elapsed since the last dose.",
      "answer": true,
      "reveal": "For contaminated wounds, tetanus toxoid-containing vaccine is indicated when 5 or more years have passed since the previous tetanus booster.",
      "takeaway": "Contaminated wounds require a tetanus booster if 5 or more years have elapsed since the prior immunization.",
      "topicCue": "DIRTY WOUND PROPHYLAXIS",
      "authoringId": "q3",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What clinical wound characteristics trigger the 5-year threshold rather than the routine 10-year interval?",
      "patientConversation": "Because this is a deep or dirty wound, guidelines recommend a booster if it has been 5 years or more.",
      "presenterNote": "Highlight that soil, feces, puncture wounds, and devitalized tissue warrant the stricter 5-year booster cutoff.",
      "sourceIds": [
        "acip-wound-mgmt"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "High community vaccination rates generate herd immunity that eliminates the risk of tetanus infection for unvaccinated individuals.",
      "answer": false,
      "reveal": "Clostridium tetani spores exist in soil and the environment. Because tetanus is non-communicable, herd immunity offers zero individual protection.",
      "takeaway": "Tetanus doesn’t spread between people, so each person needs their own vaccination.",
      "topicCue": "HERD IMMUNITY MISCONCEPTION",
      "authoringId": "q4",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "Why is tetanus impossible to eliminate through population herd immunity?",
      "patientConversation": "Tetanus bacteria live everywhere in soil and dust, so community immunity cannot protect you.",
      "presenterNote": "Stress that environmental bacterial spores mean every single person requires active individual vaccination.",
      "sourceIds": [
        "cdc-pinkbook-tetanus"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "Adult pertussis infection characteristically presents with the loud, high-pitched inspiratory whoop.",
      "answer": false,
      "reveal": "Adults may have milder disease without the classic whoop. Instead, they may cough for weeks before seeking care.",
      "takeaway": "In adults, whooping cough may be a long cough with no whoop.",
      "topicCue": "ADULT PERTUSSIS PRESENTATION",
      "authoringId": "q5",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "Why is adult pertussis frequently misdiagnosed as bronchitis, asthma, or post-viral cough?",
      "patientConversation": "In adults, whooping cough sounds like a relentless lingering cough rather than a dramatic whoop.",
      "presenterNote": "Note that adults with milder pertussis can still pass it to infants who are not fully vaccinated.",
      "sourceIds": [
        "cdc-pinkbook-pertussis"
      ],
      "revealEmphasis": [
        "without the classic whoop"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "Immunizing household contacts (cocooning) provides infants with greater clinical protection against severe pertussis than maternal vaccination.",
      "answer": false,
      "reveal": "Maternal immunization directly transfers high concentrations of protective transplacental IgG, proving far more protective than cocooning.",
      "takeaway": "Direct maternal immunization transfers vital antibodies to the newborn, providing unmatched protection.",
      "topicCue": "MATERNAL TRANSFER VS COCOONING",
      "authoringId": "q6",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "What epidemiological findings led ACIP to prioritize third-trimester maternal vaccination over cocooning?",
      "patientConversation": "Maternal vaccination gives your newborn immediate internal antibodies that family shots cannot match.",
      "presenterNote": "Discuss studies demonstrating that maternal immunization reduces infant pertussis hospitalization by over 90%.",
      "sourceIds": [
        "cdc-tdap-pregnancy"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "Tdap vaccine may be used interchangeably whenever a decennial Td booster or tetanus wound prophylaxis is indicated.",
      "answer": true,
      "reveal": "ACIP guidance allows Tdap to be administered for any routine decennial booster or wound management indication where Td is needed.",
      "takeaway": "Tdap can be used interchangeably for any adult tetanus booster or wound prophylaxis indication.",
      "topicCue": "TDAP AND TD INTERCHANGEABILITY",
      "authoringId": "q7",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does interchangeability simplify clinic inventory management and booster compliance?",
      "patientConversation": "Tdap protects against tetanus, diphtheria, and whooping cough in one single booster shot.",
      "presenterNote": "Confirm that stocking Tdap exclusively satisfies both tetanus booster and pertussis booster recommendations.",
      "sourceIds": [
        "acip-wound-mgmt"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "A severe Arthus-type hypersensitivity reaction following a prior tetanus toxoid dose constitutes a permanent contraindication to all future tetanus vaccines.",
      "answer": false,
      "reveal": "A past Arthus-type reaction is a precaution, not a permanent ban. ACIP says to wait at least 10 years after the last tetanus-containing dose before giving another, even for a wound.",
      "takeaway": "After an Arthus-type reaction, wait at least 10 years, even for a wound.",
      "topicCue": "ARTHUS REACTION MANAGEMENT",
      "authoringId": "q8",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "What pathophysiological mechanism explains Arthus reactions, and how does clinical protocol manage future booster needs?",
      "patientConversation": "Because you had a rare, severe reaction called an Arthus reaction to a tetanus shot, we wait at least 10 years before your next one, even if you get a wound.",
      "presenterNote": "Explain that an Arthus-type reaction is a precaution, and the next tetanus-containing dose waits at least 10 years, even for wound management.",
      "sourceIds": [
        "cdc-pinkbook-tetanus",
        "mmwr-tetanus-arthus-wound"
      ]
    }
  ]
};
