// Deck module for influenza (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const influenzaDeck: Deck = {
  "id": "influenza",
  "title": "Influenza Insights",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Essential refresher on annual influenza vaccination, older adult formulations, egg allergy safety, and seasonal defense.",
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
      "intendedSubject": "A clinician consulting an adult patient regarding seasonal influenza vaccination.",
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
      "title": "Influenza Insights",
      "body": "Essential refresher on annual influenza vaccination, older adult formulations, egg allergy safety, and seasonal defense.",
      "presenterNote": "Welcome the team to this refresher on seasonal influenza prevention and best practices."
    },
    {
      "id": "instructions",
      "type": "instructions",
      "title": "Talk first. Reveal second.",
      "body": "Every question follows one facilitator-controlled rhythm.",
      "presenterNote": "Encourage open discussion before revealing each evidence-based answer."
    },
    {
      "id": "closing",
      "type": "closing",
      "title": "Make the offer clear",
      "body": "Universal annual vaccination and proactive formulation selection ensure robust seasonal protection.",
      "presenterNote": "Conclude by reminding clinicians to offer influenza vaccine at every clinical opportunity.",
      "pearl": "Recommend annual influenza vaccination routinely for all persons 6 months and older, with enhanced formulations for ages 65 and older.",
      "summaryPoints": [
        "Administer annual influenza vaccination to all persons aged 6 months and older.",
        "Preferentially select Fluzone High-Dose, Flublok, or adjuvanted vaccine for adults 65 and older.",
        "Provide any age-appropriate formulation in routine settings regardless of egg allergy severity."
      ],
      "references": [
        {
          "label": "CDC ACIP Influenza Recommendations"
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
      "id": "cdc-flu-recs",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Seasonal influenza vaccine recommendations",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html"
    },
    {
      "id": "acip-older-adults",
      "publisher": "CDC ACIP",
      "shortDisplayLine": "CDC ACIP · Preferential Recommendations for Adults Aged 65 Years and Older",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/71/wr/mm7129a1.htm"
    },
    {
      "id": "cdc-egg-allergy",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu vaccine and egg allergy",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/flu/vaccines/egg-allergies.html"
    },
    {
      "id": "cdc-pinkbook-flu",
      "publisher": "CDC Pink Book",
      "shortDisplayLine": "CDC Pink Book · Influenza chapter",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-12-influenza.html"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "Routine annual influenza vaccination is recommended by ACIP for all individuals aged 6 months and older who lack contraindications.",
      "answer": true,
      "reveal": "CDC recommends a flu vaccine every year for everyone aged 6 months and older.",
      "takeaway": "Everyone aged 6 months and older, every year.",
      "topicCue": "UNIVERSAL RECOMMENDATION",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why does ACIP maintain a universal annual recommendation rather than a risk-targeted approach?",
      "patientConversation": "Annual flu vaccination is recommended for everyone in the family starting at 6 months of age.",
      "presenterNote": "Emphasize that the recommendation covers everyone aged 6 months and older, every year.",
      "sourceIds": [
        "cdc-flu-recs"
      ],
      "emphasis": [
        "aged 6"
      ],
      "revealEmphasis": [
        "aged 6"
      ],
      "takeawayEmphasis": [
        "aged 6"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Adults aged 65 years and older are preferentially recommended to receive Fluzone High-Dose, Flublok, or adjuvanted influenza vaccine over standard-dose unadjuvanted vaccines.",
      "answer": true,
      "reveal": "ACIP preferentially recommends higher-dose or adjuvanted formulations including Fluzone High-Dose and Flublok for adults aged 65 and older.",
      "takeaway": "Higher-dose and adjuvanted formulations provide stronger antibody responses for adults 65 and older.",
      "topicCue": "OLDER ADULT FORMULATIONS",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does immunosenescence justify preferential formulation selection for older adults?",
      "patientConversation": "For adults 65 and older, these specific enhanced vaccines provide stronger protection against flu complications.",
      "presenterNote": "Discuss comparative effectiveness data showing reduced hospitalizations with enhanced vaccines in seniors.",
      "sourceIds": [
        "acip-older-adults"
      ],
      "emphasis": [
        "aged 65"
      ],
      "revealEmphasis": [
        "65 and older"
      ],
      "takeawayEmphasis": [
        "65 and older"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "A severe egg allergy means a longer observation period after a flu shot.",
      "answer": false,
      "reveal": "CDC and ACIP confirm persons with egg allergies can receive any age-appropriate influenza vaccine in standard outpatient settings without special observation.",
      "takeaway": "Persons with egg allergy of any severity can safely receive any age-appropriate influenza vaccine.",
      "topicCue": "EGG ALLERGY SAFETY",
      "authoringId": "q3",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How does current ovalbumin data support removing previous egg allergy precautions?",
      "patientConversation": "Current guidelines confirm you can safely receive your flu shot right here today, regardless of egg allergies.",
      "presenterNote": "Explain that most flu vaccines hold a small amount of egg protein, and studies show severe allergic reactions in people with egg allergy are unlikely.",
      "sourceIds": [
        "cdc-egg-allergy"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "Flu shots can’t cause flu, because the virus in them is killed or is only a single protein.",
      "answer": true,
      "reveal": "Inactivated and recombinant influenza vaccines contain killed virus or engineered protein subunits that cannot replicate or cause flu.",
      "takeaway": "Inactivated and recombinant vaccines cannot cause influenza infection.",
      "topicCue": "VACCINE BIOLOGY",
      "authoringId": "q4",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "What explains the mild transient soreness or fatigue patients occasionally feel after vaccination?",
      "patientConversation": "The flu vaccine cannot give you the flu because the viral parts are completely inactive.",
      "presenterNote": "Address the common confusion between mild immune reactogenicity and active viral infection.",
      "sourceIds": [
        "cdc-pinkbook-flu"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "For most people, September or October is the ideal time for a flu shot.",
      "answer": true,
      "reveal": "CDC says most people who need one dose should ideally get it in September or October.",
      "takeaway": "September or October is the ideal window for most people.",
      "topicCue": "TIMING OF VACCINATION",
      "authoringId": "q5",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why is early summer vaccination discouraged while autumn vaccination remains strongly supported?",
      "patientConversation": "September or October is the best time for most people to get a flu shot.",
      "presenterNote": "Explain that CDC does not recommend July or August vaccination for most people, because protection may wane before the season ends.",
      "sourceIds": [
        "cdc-flu-recs"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "Among people with heart disease, flu vaccination is linked to fewer cardiac events.",
      "answer": true,
      "reveal": "Flu illness is linked to more heart attacks and strokes, and flu vaccination is linked to fewer cardiac events in people with heart disease.",
      "takeaway": "For people with heart disease, a flu shot is heart protection too.",
      "topicCue": "CARDIOVASCULAR PROTECTION",
      "authoringId": "q6",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "What pathophysiological mechanisms link acute respiratory influenza infection to cardiovascular events?",
      "patientConversation": "For people with heart disease, a yearly flu shot is linked to fewer heart problems.",
      "presenterNote": "Highlight that flu illness is linked to more heart attacks and strokes, and flu vaccination to fewer cardiac events in people with heart disease.",
      "sourceIds": [
        "cdc-flu-recs"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "A mild afebrile cold with clear nasal discharge requires clinicians to postpone seasonal influenza vaccination until all symptoms clear.",
      "answer": false,
      "reveal": "Mild afebrile illnesses are not contraindications, and postponing vaccination risks missing opportunities to protect patients.",
      "takeaway": "Mild afebrile illness without fever does not warrant postponing influenza vaccination.",
      "topicCue": "MILD ILLNESS PRECAUTIONS",
      "authoringId": "q7",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How can clinicians prevent missed vaccination opportunities when patients present with minor ailments?",
      "patientConversation": "A mild head cold without fever will not affect your vaccine, so we can give it safely today.",
      "presenterNote": "Reinforce that false contraindications are a frequent cause of missed vaccination opportunities.",
      "sourceIds": [
        "cdc-pinkbook-flu"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "Starting antiviral medications after respiratory symptom onset replaces the immunological protection provided by annual influenza vaccination.",
      "answer": false,
      "reveal": "Antiviral drugs treat flu, but CDC says they are not a substitute for getting a flu vaccine.",
      "takeaway": "Antiviral treatment manages acute infection but does not replace proactive annual immunization.",
      "topicCue": "ANTIVIRALS VS VACCINATION",
      "authoringId": "q8",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why is active immunization essential as a public health defense compared to reactive antiviral therapy?",
      "patientConversation": "Antivirals can help if you get sick, but they don’t replace your flu shot.",
      "presenterNote": "Clarify that antivirals treat flu illness but are not a substitute for a flu vaccine.",
      "sourceIds": [
        "cdc-flu-recs"
      ]
    }
  ]
};
