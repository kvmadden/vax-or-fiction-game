// Deck module for hpv (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const hpvDeck: Deck = {
  "id": "hpv",
  "title": "HPV Reality Check",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Reviewed clinical questions on oncogenic protection, all-gender indications, dosing intervals, and shared decision-making.",
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
      "intendedSubject": "A clinician consulting an adolescent and parent regarding human papillomavirus vaccination.",
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
      "title": "HPV Reality Check",
      "body": "Reviewed clinical questions on oncogenic protection, all-gender indications, dosing intervals, and shared decision-making.",
      "presenterNote": "Welcome the team to this refresher on human papillomavirus prevention and communication strategies."
    },
    {
      "id": "instructions",
      "type": "instructions",
      "title": "Talk first. Reveal second.",
      "body": "Every question follows one facilitator-controlled rhythm.",
      "presenterNote": "Encourage active deliberation before revealing each guideline recommendation."
    },
    {
      "id": "closing",
      "type": "closing",
      "title": "Make the offer clear",
      "body": "Proactive adolescent vaccination and informed adult shared decision-making eliminate preventable HPV malignancies.",
      "presenterNote": "Conclude by emphasizing presumptive cancer-prevention framing for all adolescent patients.",
      "pearl": "Recommend HPV vaccination routinely for all adolescents at age 11-12, completing a 2-dose series before the 15th birthday.",
      "summaryPoints": [
        "Present Gardasil 9 routinely to all genders at age 11 to 12 as cancer prevention.",
        "Initiate before age 15 to complete protection with two doses separated by 6 to 12 months.",
        "Reinforce that cervical cytology screening continues according to clinical guidelines."
      ],
      "references": [
        {
          "label": "CDC ACIP HPV Recommendations"
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
      "id": "cdc-hpv-recs",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · HPV vaccination considerations",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html"
    },
    {
      "id": "acip-hpv-schedule",
      "publisher": "CDC Pink Book",
      "shortDisplayLine": "CDC Pink Book · HPV chapter",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-11-human-papillomavirus.html"
    },
    {
      "id": "acip-adult-decision",
      "publisher": "CDC ACIP",
      "shortDisplayLine": "ACIP · HPV Shared Clinical Decision-Making for Adults Aged 27 through 45",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/68/wr/mm6832a3.htm"
    },
    {
      "id": "cdc-pinkbook-hpv",
      "publisher": "CDC Pink Book",
      "shortDisplayLine": "CDC Pink Book · HPV chapter",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-11-human-papillomavirus.html"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "Gardasil 9 protects against seven high-risk oncogenic HPV types and two low-risk types responsible for anogenital warts.",
      "answer": true,
      "reveal": "Gardasil 9 covers HPV types 16, 18, 31, 33, 45, 52 and 58, which can cause cancer, and types 6 and 11, which cause genital warts.",
      "takeaway": "Gardasil 9 covers the HPV types behind most cervical cancers.",
      "topicCue": "ONCOGENIC STRAIN COVERAGE",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does 9-valent coverage compare with earlier quadrivalent and bivalent vaccine formulations?",
      "patientConversation": "This vaccine protects against nine HPV types, including seven that can cause cancer.",
      "presenterNote": "Point out that Gardasil 9 covers seven cancer-causing HPV types, but about 15% of cervical cancers come from types it does not prevent.",
      "sourceIds": [
        "cdc-hpv-recs"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Routine HPV vaccination is recommended exclusively for females because males do not develop HPV-related malignancies.",
      "answer": false,
      "reveal": "ACIP recommends routine HPV vaccination for all genders. Throat cancers are the most common HPV-associated cancers among men.",
      "takeaway": "Routine HPV vaccination protects all genders against oropharyngeal, anogenital cancers and reduces transmission.",
      "topicCue": "GENDER-NEUTRAL RECOMMENDATION",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "Why is universal gender-neutral vaccination critical for eliminating HPV-related disease burden?",
      "patientConversation": "HPV causes cancers in both men and women, and this vaccine helps protect boys from throat and other HPV cancers.",
      "presenterNote": "Point out that throat cancers are the most common HPV-associated cancers among men.",
      "sourceIds": [
        "cdc-hpv-recs"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "Adolescents who initiate the HPV vaccine series before their 15th birthday complete the series with two doses separated by 6 to 12 months.",
      "answer": true,
      "reveal": "Starting before the 15th birthday means a 2-dose series, with the second dose 6 to 12 months after the first.",
      "takeaway": "Starting before age 15 means two doses, not three.",
      "topicCue": "ADOLESCENT DOSING SCHEDULE",
      "authoringId": "q3",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What immunological data supported reducing the adolescent schedule from three doses to two doses?",
      "patientConversation": "Because your child is starting before age 15, two doses complete the series.",
      "presenterNote": "Clarify the age cutoff: starting before the 15th birthday means 2 doses, and starting at 15 or older means 3.",
      "sourceIds": [
        "acip-hpv-schedule"
      ],
      "emphasis": [
        "12 months"
      ],
      "revealEmphasis": [
        "6 to 12 months"
      ],
      "takeawayEmphasis": [
        "age 15"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "Adults aged 27 through 45 years who were not adequately vaccinated in youth may receive HPV vaccination based on clinical shared decision-making.",
      "answer": true,
      "reveal": "ACIP recommends clinical shared decision-making for adults aged 27 through 45 to evaluate individual exposure risk and potential benefit.",
      "takeaway": "Shared decision-making allows adults aged 27 through 45 to evaluate personalized vaccination benefits.",
      "topicCue": "ADULT SHARED DECISION-MAKING",
      "authoringId": "q4",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Which clinical scenarios warrant recommending HPV vaccination in adults aged 27 through 45?",
      "patientConversation": "Between ages 27 and 45, we decide together if HPV vaccination makes sense for your personal situation.",
      "presenterNote": "Remind clinicians that adults with new sexual partners or prior incomplete vaccination often benefit.",
      "sourceIds": [
        "acip-adult-decision"
      ],
      "emphasis": [
        "aged 27"
      ],
      "revealEmphasis": [
        "aged 27"
      ],
      "takeawayEmphasis": [
        "aged 27"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "A prior abnormal Pap smear or past HPV exposure eliminates all clinical benefit from receiving the HPV vaccine series.",
      "answer": false,
      "reveal": "Vaccination still protects against remaining vaccine-covered HPV strains that the patient has not yet encountered.",
      "takeaway": "Vaccination still protects against HPV types not yet acquired.",
      "topicCue": "PRIOR EXPOSURE AND EFFICACY",
      "authoringId": "q5",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How should clinicians respond to patients who believe an abnormal Pap smear disqualifies them from HPV vaccination?",
      "patientConversation": "Even if you’ve had one type of HPV, the vaccine can still protect you from the other types it covers.",
      "presenterNote": "Clarify that past exposure does not remove the benefit, because the vaccine still protects against the vaccine types a person has not acquired.",
      "sourceIds": [
        "cdc-pinkbook-hpv"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "Adolescents who receive the HPV vaccine demonstrate higher rates of early sexual debut and decreased contraceptive adherence.",
      "answer": false,
      "reveal": "Multiple large-scale behavioral studies confirm that HPV vaccination does not alter sexual behavior, debut timing, or contraceptive choices.",
      "takeaway": "Rigorous behavioral surveillance confirms HPV vaccination does not impact adolescent sexual behavior.",
      "topicCue": "BEHAVIORAL EVIDENCE",
      "authoringId": "q6",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "How can evidence from large population cohort studies reassure parents concerned about behavioral changes?",
      "patientConversation": "Studies of hundreds of thousands of teens show the vaccine has zero effect on sexual behavior.",
      "presenterNote": "Reassure team members that empirical data consistently disproves risk compensation theories.",
      "sourceIds": [
        "cdc-hpv-recs"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "Individuals who complete the full HPV vaccine series no longer require routine cervical cancer screening tests throughout their lifespan.",
      "answer": false,
      "reveal": "Because the vaccine does not protect against every oncogenic HPV strain, routine cervical screening must continue as guideline-recommended.",
      "takeaway": "Routine cervical cancer screening remains necessary for all vaccinated individuals.",
      "topicCue": "CERVICAL SCREENING CONTINUATION",
      "authoringId": "q7",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "Why must routine cervical cancer screening protocols remain unchanged regardless of HPV vaccination status?",
      "patientConversation": "Even after you’re vaccinated, keep up with routine cervical screening.",
      "presenterNote": "Highlight that about 15% of cervical cancers come from HPV types Gardasil 9 does not prevent, so vaccinated people are screened the same way.",
      "sourceIds": [
        "cdc-pinkbook-hpv"
      ],
      "emphasis": [
        "no longer"
      ],
      "revealEmphasis": [
        "every"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "If an individual is found to be pregnant after initiating the HPV vaccine series, immediate therapeutic pregnancy termination is medically indicated.",
      "answer": false,
      "reveal": "HPV vaccine is paused during pregnancy and resumed postpartum. Pregnancy registries show no teratogenic risk, and termination is never indicated.",
      "takeaway": "Pregnancy warrants pausing the series until postpartum, with no intervention or termination required.",
      "topicCue": "PREGNANCY MANAGEMENT",
      "authoringId": "q8",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "What is the recommended clinical course when pregnancy is diagnosed midway through an HPV series?",
      "patientConversation": "If you're pregnant, we pause the series until after delivery. Safety data shows no harm to the baby.",
      "presenterNote": "Stress that inadvertent administration during pregnancy does not warrant invasive diagnostic testing or termination.",
      "sourceIds": [
        "cdc-hpv-recs"
      ],
      "revealEmphasis": [
        "never"
      ]
    }
  ],
  "heldQuestionIds": [
    "q6"
  ]
};
