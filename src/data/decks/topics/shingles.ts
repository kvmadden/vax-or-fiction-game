// Deck module for shingles (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const shinglesDeck: Deck = {
  "id": "shingles",
  "title": "Shingles Reality Check",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Reviewed clinical questions on recombinant zoster vaccine indications, revaccination, dosing intervals, and reactogenicity.",
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
      "intendedSubject": "A clinician consulting an adult patient regarding herpes zoster vaccination.",
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
      "title": "Shingles Reality Check",
      "body": "Reviewed clinical questions on recombinant zoster vaccine indications, revaccination, dosing intervals, and reactogenicity.",
      "presenterNote": "Welcome the team to this refresher on herpes zoster prevention with Shingrix."
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
      "body": "Two doses of Shingrix protect adults 50 and older and immunocompromised individuals against debilitating herpes zoster pain.",
      "presenterNote": "Conclude by emphasizing the importance of securing the second dose appointment before the patient departs.",
      "pearl": "Recommend 2 doses of Shingrix routinely at age 50 and older, and at age 19 and older for immunocompromised adults.",
      "summaryPoints": [
        "Administer Shingrix routinely to all adults aged 50 and older regardless of prior shingles.",
        "Deliver the second dose 2 to 6 months after the first to ensure durable cellular immunity.",
        "Prepare patients for temporary local and systemic symptoms that resolve within 2 to 3 days."
      ],
      "references": [
        {
          "label": "CDC ACIP Herpes Zoster Recommendations"
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
      "id": "cdc-shingrix-recs",
      "publisher": "CDC ACIP",
      "shortDisplayLine": "CDC ACIP · Recommendations for Use of Herpes Zoster Vaccines",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/67/wr/mm6703a5.htm"
    },
    {
      "id": "acip-shingrix-immuno",
      "publisher": "CDC ACIP",
      "shortDisplayLine": "CDC ACIP · Use of Recombinant Zoster Vaccine in Immunocompromised Adults",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/71/wr/mm7103a2.htm"
    },
    {
      "id": "cdc-shingrix-schedule",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingrix vaccine considerations",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "cdc-pinkbook-zoster",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Shingrix prescribing information",
      "accessedDate": "2026-09-28",
      "url": "https://www.fda.gov/media/108597/download"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "ACIP recommends recombinant zoster vaccine (Shingrix) routinely for all immunocompetent adults aged 50 years and older.",
      "answer": true,
      "reveal": "ACIP recommends two doses of Shingrix for immunocompetent adults aged 50 and older to prevent shingles and postherpetic neuralgia.",
      "takeaway": "Universal recommendation at age 50 provides robust protection against herpes zoster and debilitating nerve pain.",
      "topicCue": "UNIVERSAL ADULT INDICATION",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why did ACIP set the routine recommendation age threshold at 50 rather than 60 or 65?",
      "patientConversation": "Starting at age 50, your risk of shingles increases. Two doses protect you against severe nerve pain.",
      "presenterNote": "Explain that zoster risk and severe postherpetic neuralgia rise sharply as cell-mediated immunity declines after 50.",
      "sourceIds": [
        "cdc-shingrix-recs"
      ],
      "emphasis": [
        "aged 50"
      ],
      "revealEmphasis": [
        "50 and older"
      ],
      "takeawayEmphasis": [
        "age 50"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "An adult with a documented history of prior shingles infection does not need Shingrix because natural infection provides lifelong immunity.",
      "answer": false,
      "reveal": "A past case of shingles doesn’t guarantee immunity, and you can have shingles more than once. Shingrix is still recommended after a past case.",
      "takeaway": "Shingles can come back, so vaccinate even after a past case.",
      "topicCue": "PRIOR ZOSTER HISTORY",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How should clinicians address patients who assume prior shingles protects them from future episodes?",
      "patientConversation": "Even if you had shingles before, you can get it again, so this vaccine is still recommended for you.",
      "presenterNote": "Clarify that a past case does not rule out another, and Shingrix is still recommended after one.",
      "sourceIds": [
        "cdc-shingrix-schedule"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "The standard Shingrix vaccination schedule requires two doses administered 2 to 6 months apart.",
      "answer": true,
      "reveal": "ACIP recommends giving the second dose of Shingrix 2 to 6 months after the first.",
      "takeaway": "Two doses, 2 to 6 months apart, give strong protection.",
      "topicCue": "SERIES DOSING INTERVAL",
      "authoringId": "q3",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What workflow processes most effectively ensure that patients return within the 2 to 6 month window for dose two?",
      "patientConversation": "Getting your second shot 2 to 6 months after the first gives you strong protection.",
      "presenterNote": "Stress that completing the second dose is essential for achieving protection exceeding 90%.",
      "sourceIds": [
        "cdc-shingrix-schedule"
      ],
      "emphasis": [
        "6 months apart"
      ],
      "revealEmphasis": [
        "6 months"
      ],
      "takeawayEmphasis": [
        "6 months apart"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "Adults who previously received the live zoster vaccine (Zostavax) should receive the complete 2-dose Shingrix series.",
      "answer": true,
      "reveal": "Because Zostavax efficacy wanes substantially over time, ACIP recommends revaccination with the 2-dose Shingrix series.",
      "takeaway": "Prior live zoster vaccination does not rule out Shingrix, and revaccination restores high, durable efficacy.",
      "topicCue": "PRIOR ZOSTAVAX REVACCINATION",
      "authoringId": "q4",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why does ACIP recommend revaccination for individuals who previously received the live zoster vaccine?",
      "patientConversation": "If you received the old shingles vaccine years ago, this updated 2-dose series restores strong protection.",
      "presenterNote": "Discuss the waning protection of Zostavax and the sustained high efficacy demonstrated by Shingrix.",
      "sourceIds": [
        "cdc-shingrix-recs"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "Shingrix is recommended for adults aged 19 years and older who are or will be immunodeficient or immunosuppressed.",
      "answer": true,
      "reveal": "ACIP expanded Shingrix recommendations to include adults aged 19 and older with immunocompromising conditions due to elevated zoster risk.",
      "takeaway": "Adults aged 19 and older with immunocompromise qualify for Shingrix to protect against severe zoster.",
      "topicCue": "IMMUNOCOMPROMISED INDICATION",
      "authoringId": "q5",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Which young adult clinical populations benefit most from the expanded immunocompromised recommendation?",
      "patientConversation": "Because your medical condition or medication affects your immune system, this vaccine protects you starting at age 19.",
      "presenterNote": "Highlight oncology, rheumatology, and transplant populations at severe risk for disseminated herpes zoster.",
      "sourceIds": [
        "acip-shingrix-immuno"
      ],
      "emphasis": [
        "aged 19"
      ],
      "revealEmphasis": [
        "19 and older"
      ],
      "takeawayEmphasis": [
        "19 and older"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "Shingrix contains live attenuated varicella-zoster virus that can reactivate and cause secondary shingles rash.",
      "answer": false,
      "reveal": "Shingrix is a non-live recombinant subunit vaccine combining glycoprotein E with AS01B adjuvant, so it cannot replicate or cause shingles.",
      "takeaway": "Shingrix is non-live, so it cannot cause shingles.",
      "topicCue": "RECOMBINANT PLATFORM",
      "authoringId": "q6",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "How does the non-live recombinant design of Shingrix enable safe use in immunosuppressed individuals?",
      "patientConversation": "Shingrix contains isolated protein subunits, not live virus, so it cannot cause chickenpox or shingles.",
      "presenterNote": "Contrast the safety of non-live subunit antigen presentation with contraindicated live viral vaccines.",
      "sourceIds": [
        "cdc-pinkbook-zoster"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "Expected temporary reactogenicity such as injection site soreness, fatigue, and myalgia warrants canceling the second Shingrix dose.",
      "answer": false,
      "reveal": "Mild to moderate systemic and local reactions typically resolve within 2 to 3 days and do not contraindicate completing the essential second dose.",
      "takeaway": "Temporary reactogenicity resolves quickly and should be anticipated rather than treated as a contraindication.",
      "topicCue": "REACTOGENICITY COUNSELING",
      "authoringId": "q7",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How can proactive anticipatory counseling reduce second-dose dropout caused by transient side effects?",
      "patientConversation": "You may feel sore or tired for a couple of days. That's normal, and it shows your immune system is responding.",
      "presenterNote": "Reassure the team that side effects usually last 2 to 3 days, and patients should still get dose two after them.",
      "sourceIds": [
        "cdc-shingrix-schedule"
      ],
      "revealEmphasis": [
        "within 2 to 3 days"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "Shingrix should be administered via subcutaneous injection in the upper outer triceps area rather than intramuscularly.",
      "answer": false,
      "reveal": "Shingrix must be given as an intramuscular injection, preferably in the deltoid muscle. Giving it subcutaneously is an administration error.",
      "takeaway": "Shingrix goes into the muscle, not under the skin.",
      "topicCue": "ADMINISTRATION ROUTE",
      "authoringId": "q8",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "Why is intramuscular administration essential for vaccines formulated with novel adjuvants?",
      "patientConversation": "This shot goes into the muscle of your upper arm.",
      "presenterNote": "Remind vaccinators that Shingrix goes into the muscle, and a subcutaneous dose is an administration error.",
      "sourceIds": [
        "cdc-pinkbook-zoster"
      ]
    }
  ]
};
