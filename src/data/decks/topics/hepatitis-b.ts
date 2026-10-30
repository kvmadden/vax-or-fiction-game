// Deck module for hepatitis-b (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const hepatitisBDeck: Deck = {
  "id": "hepatitis-b",
  "title": "Hepatitis B Reality Check",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Reviewed clinical questions on universal adult recommendations, screening, and series completion.",
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
      "intendedSubject": "A pharmacy consultation area where healthcare providers discuss adult immunization.",
      "focalPointIntent": "Center focus right with ample copy space left.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-care-team.md"
    }
  ],
  "staticSlides": [
    {
      "id": "title",
      "type": "title",
      "title": "Hepatitis B Reality Check",
      "body": "Reviewed clinical questions on universal adult recommendations, screening, and series completion.",
      "presenterNote": "Open by framing hepatitis B prevention as a routine, stigma-free universal adult recommendation."
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
      "body": "Universal adult recommendations make liver protection standard practice.",
      "presenterNote": "Close by reinforcing routine assessment and presumptive recommendation at every opportunity.",
      "pearl": "Every adult aged 19 through 59 is a candidate for hepatitis B immunization without risk disclosure.",
      "summaryPoints": [
        "Offer hepatitis B vaccine routinely to all adults aged 19 through 59 years.",
        "Use 2-dose or 3-dose options and resume interrupted series without restarting.",
        "Pair vaccination opportunities with one-time adult triple panel serology screening."
      ],
      "references": [
        {
          "label": "CDC / ACIP Adult Hepatitis B Guidelines"
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
      "id": "cdc-hepb-universal",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Universal Adult Hepatitis B Recommendations",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/71/rr/rr7101a1.htm"
    },
    {
      "id": "cdc-hepb-clinical",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Hepatitis B vaccine administration",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/hepatitis-b/hcp/vaccine-administration/index.html"
    },
    {
      "id": "fda-heplisav-b",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Heplisav-B Prescribing Information",
      "accessedDate": "2026-09-10",
      "url": "https://www.fda.gov/vaccines-blood-biologics/vaccines/heplisav-b"
    },
    {
      "id": "cdc-diabetes-hepb",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Hepatitis B Recommendations for Diabetes",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/preview/mmwrhtml/mm6050a4.htm"
    },
    {
      "id": "cdc-hepb-screening",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult Hepatitis B Screening Recommendations",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/72/rr/rr7201a1.htm"
    },
    {
      "id": "acip-general-spacing",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Timing and spacing of immunobiologics",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html"
    },
    {
      "id": "cdc-hepd-prevention",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · About hepatitis D",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/hepatitis-d/about/index.html"
    },
    {
      "id": "cdc-hepb-chronic",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Chronic Hepatitis B Clinical Management",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/hepatitis-b/hcp/clinical-overview/index.html"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "ACIP recommends universal hepatitis B vaccination for all adults aged 19 through 59 years, regardless of risk factor disclosure.",
      "answer": true,
      "reveal": "CDC and ACIP updated guidance to recommend universal hepatitis B vaccination for all adults aged 19 through 59 to eliminate barriers related to risk disclosure.",
      "takeaway": "Universal adult recommendation removes stigma and closes protection gaps.",
      "topicCue": "UNIVERSAL RECOMMENDATION",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why did shifting from risk-based to universal recommendations accelerate adult coverage?",
      "patientConversation": "Hepatitis B protection is recommended for all adults under 60. We can start your series today.",
      "presenterNote": "Emphasize that clinical staff no longer need to conduct sensitive risk assessments before offering the shot.",
      "sourceIds": [
        "cdc-hepb-universal"
      ],
      "emphasis": [
        "aged 19"
      ],
      "revealEmphasis": [
        "aged 19"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Adults aged 60 and older need a hepatitis B risk factor to get the vaccine.",
      "answer": false,
      "reveal": "Adults aged 60 years and older without documented risk factors may receive hepatitis B vaccination if they desire protection against hepatitis B virus infection.",
      "takeaway": "Any adult aged 60 and older seeking protection may receive the vaccine.",
      "topicCue": "OLDER ADULTS",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you respond to patients over 60 who request hepatitis B vaccination without specific indications?",
      "patientConversation": "Even past age 60, anyone wanting hepatitis B protection can get vaccinated.",
      "presenterNote": "Highlight that clinical discretion supports vaccination for any older adult desiring hepatitis B defense.",
      "sourceIds": [
        "cdc-hepb-clinical"
      ],
      "emphasis": [
        "aged 60"
      ],
      "revealEmphasis": [
        "aged 60"
      ],
      "takeawayEmphasis": [
        "60 and older"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "Heplisav-B is an adjuvanted hepatitis B vaccine approved as a two-dose series administered one month apart for adults aged 18 and older.",
      "answer": true,
      "reveal": "Heplisav-B utilizes a novel CpG adjuvant and achieves high seroprotection in two doses given four weeks apart, improving compliance over three-dose options.",
      "takeaway": "A two-dose schedule completed in one month improves series adherence.",
      "topicCue": "SERIES COMPLETION",
      "authoringId": "q3",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does a one-month completion schedule improve community series compliance compared to six months?",
      "patientConversation": "This modern hepatitis B series takes just two doses one month apart to complete.",
      "presenterNote": "Discuss how shorter completion schedules reduce attrition before protective titers develop.",
      "sourceIds": [
        "fda-heplisav-b"
      ],
      "emphasis": [
        "18 and older"
      ],
      "takeawayEmphasis": [
        "one month"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "Patients with diabetes mellitus have a lower risk of acquiring hepatitis B infection compared to adults without diabetes.",
      "answer": false,
      "reveal": "Adults with diabetes face roughly twice the risk of hepatitis B infection due to blood glucose monitoring devices and clinical exposures, prompting an ACIP recommendation.",
      "takeaway": "Diabetes is an established clinical indication for hepatitis B vaccination.",
      "topicCue": "CLINICAL RISK",
      "authoringId": "q4",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "What shared monitoring devices or care settings account for elevated hepatitis B risk in diabetes?",
      "patientConversation": "Having diabetes is a specific reason to protect your liver with hepatitis B vaccination.",
      "presenterNote": "Emphasize integrating vaccine reviews into standard diabetic meter and medication counseling.",
      "sourceIds": [
        "cdc-diabetes-hepb"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "CDC recommends a one-time hepatitis B screening test using triple panel serology for all adults aged 18 years and older.",
      "answer": true,
      "reveal": "CDC recommends one-time universal screening using HBsAg, anti-HBs, and total anti-HBc to detect chronic infection and identify candidates needing vaccination.",
      "takeaway": "Screening identifies chronic infection and directs unvaccinated adults to protection.",
      "topicCue": "UNIVERSAL SCREENING",
      "authoringId": "q5",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does universal screening guide clinicians between administering vaccine versus referring for medical management?",
      "patientConversation": "A quick screening blood test checks whether you have immunity or need vaccination.",
      "presenterNote": "Review the triple panel serology and how each marker informs clinical decision-making.",
      "sourceIds": [
        "cdc-hepb-screening"
      ],
      "emphasis": [
        "aged 18"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "If the interval between hepatitis B vaccine doses exceeds the recommended schedule, the entire series must be restarted from dose one.",
      "answer": false,
      "reveal": "According to ACIP general best practice guidelines, an interruption in the vaccination schedule does not require restarting the series. You just continue from the next dose.",
      "takeaway": "A lapsed hepatitis B series does not restart. Just give the next dose.",
      "topicCue": "INTERVAL TIMING",
      "authoringId": "q6",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "Why do patients and some clinicians believe that missing a dose window invalidates prior doses?",
      "patientConversation": "You don't need to start over if you missed an appointment. We pick up right where you left off.",
      "presenterNote": "Reassure participants that longer-than-recommended intervals typically do not reduce final antibody levels, so the series continues.",
      "sourceIds": [
        "acip-general-spacing"
      ],
      "takeawayEmphasis": [
        "does not restart"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "The hepatitis B vaccine also protects against hepatitis D.",
      "answer": true,
      "reveal": "Hepatitis D can only infect people who also have hepatitis B. There is no hepatitis D vaccine, so hepatitis B vaccine is how you prevent it.",
      "takeaway": "No hepatitis B, no hepatitis D.",
      "topicCue": "DUAL VIRAL DEFENSE",
      "authoringId": "q7",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "How does understanding viral satellite biology reinforce the value of hepatitis B immunization?",
      "patientConversation": "Protecting your liver against hepatitis B also shields you from hepatitis D.",
      "presenterNote": "Explain that hepatitis D can cause severe liver disease and only infects people who also have hepatitis B.",
      "sourceIds": [
        "cdc-hepd-prevention"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "Hepatitis B surface antigen-positive individuals should receive booster doses of hepatitis B vaccine annually.",
      "answer": false,
      "reveal": "Hepatitis B vaccines provide prophylactic protection for uninfected individuals and offer no therapeutic benefit for established active chronic infection.",
      "takeaway": "Vaccination is preventive and not indicated for individuals with active chronic infection.",
      "topicCue": "CLINICAL MANAGEMENT",
      "authoringId": "q8",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "What is the appropriate clinical pathway when serology demonstrates active surface antigen positivity?",
      "patientConversation": "Vaccination protects people who have not been exposed, while an active infection requires clinical care.",
      "presenterNote": "Highlight that infected patients need hepatology linkage and family contact tracing for immunization.",
      "sourceIds": [
        "cdc-hepb-chronic"
      ]
    }
  ]
};
