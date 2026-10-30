// Deck module for pneumococcal (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const pneumococcalDeck: Deck = {
  "id": "pneumococcal",
  "title": "Pneumococcal Reality Check",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Reviewed clinical questions on conjugate recommendations, high-risk indications, and serotype coverage.",
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
      "intendedSubject": "A healthcare provider reviewing pneumococcal vaccination options with an adult patient.",
      "focalPointIntent": "Center focus right with negative copy space left.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-care-team.md"
    }
  ],
  "staticSlides": [
    {
      "id": "title",
      "type": "title",
      "title": "Pneumococcal Reality Check",
      "body": "Reviewed clinical questions on conjugate recommendations, high-risk indications, and serotype coverage.",
      "presenterNote": "Open by framing pneumococcal immunization as essential defense against invasive bacterial lung disease."
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
      "body": "Modern conjugate options simplify protection to a single clinical recommendation.",
      "presenterNote": "Close by encouraging assessment of older adults and younger adults with chronic medical conditions.",
      "pearl": "Assess pneumococcal status for every adult turning 50 or managing a chronic cardiopulmonary condition.",
      "summaryPoints": [
        "Provide routine conjugate vaccination for adults 50 and older with no conjugate dose on record.",
        "Identify high-risk adults aged 19 through 49 with asthma, diabetes, or heart disease.",
        "Use single-dose conjugate vaccines to achieve broad serotype coverage in one visit."
      ],
      "references": [
        {
          "label": "CDC / ACIP Pneumococcal Recommendations"
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
      "id": "cdc-pneumo-acip",
      "publisher": "ACIP",
      "shortDisplayLine": "CDC/ACIP · Adult Pneumococcal Guidelines",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/vaccines/vpd/pneumo/hcp/who-when-to-vaccinate.html"
    },
    {
      "id": "cdc-pneumo-basics",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal Disease Pathogenesis",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/pneumococcal/hcp/clinical-overview/index.html"
    },
    {
      "id": "fda-prevnar-20",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Prevnar 20 Prescribing Information",
      "accessedDate": "2026-09-10",
      "url": "https://www.fda.gov/vaccines-blood-biologics/vaccines/prevnar-20"
    },
    {
      "id": "cdc-pneumo-risk",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal risk-based indications",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/risk-indications.html"
    },
    {
      "id": "cdc-pneumo-ipd",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal clinical signs",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pneumococcal/hcp/clinical-signs/index.html"
    },
    {
      "id": "cdc-pneumo-pcv13-transition",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Updated Conjugate Vaccine Guidance",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/71/rr/rr7103a1.htm"
    },
    {
      "id": "acip-pcv15-ppsv23",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult immunization schedule notes",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-schedules/adult-notes.html"
    },
    {
      "id": "cdc-pneumo-vaccine-composition",
      "publisher": "FDA",
      "shortDisplayLine": "FDA · Prevnar 20 prescribing information",
      "accessedDate": "2026-09-28",
      "url": "https://www.fda.gov/media/149987/download"
    },
    {
      "id": "cdc-pneumococcal-recommendations",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pneumococcal vaccine recommendations",
      "accessedDate": "2026-09-28",
      "url": "https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html"
    },
    {
      "id": "mmwr-pcv-adults-50",
      "publisher": "CDC MMWR",
      "shortDisplayLine": "CDC MMWR · ACIP recommendations for pneumococcal vaccination in adults",
      "accessedDate": "2026-09-28",
      "url": "https://www.cdc.gov/mmwr/volumes/74/wr/mm7401a1.htm"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "ACIP recommends routine pneumococcal conjugate vaccination for all adults aged 50 years and older who have not previously received a conjugate vaccine.",
      "answer": true,
      "reveal": "In October 2024, ACIP lowered the routine adult age for pneumococcal conjugate vaccination from 65 to 50. Adults 50 and older with no conjugate dose on record, or no record at all, should receive one.",
      "takeaway": "Routine adult pneumococcal vaccination now starts at 50.",
      "topicCue": "ROUTINE AGE INDICATION",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Which two facts control the routine recommendation: age and conjugate-vaccine history?",
      "patientConversation": "Pneumococcal vaccination is now routine for adults from age 50. Let’s check your record to see whether you need a dose.",
      "presenterNote": "Highlight that ACIP lowered the routine adult pneumococcal threshold to age 50 in October 2024.",
      "sourceIds": [
        "cdc-pneumococcal-recommendations",
        "mmwr-pcv-adults-50"
      ],
      "emphasis": [
        "aged 50"
      ],
      "revealEmphasis": [
        "October 2024"
      ],
      "takeawayEmphasis": [
        "starts at 50"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Pneumococcal vaccination protects individuals against viral respiratory illnesses such as influenza and COVID-19.",
      "answer": false,
      "reveal": "Pneumococcal vaccines specifically target Streptococcus pneumoniae bacteria. They do not prevent viral infections like influenza or SARS-CoV-2.",
      "takeaway": "Pneumococcal vaccines target Streptococcus pneumoniae bacteria, not respiratory viruses.",
      "topicCue": "ETIOLOGY MISCONCEPTION",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you explain the difference between bacterial pneumonia and viral upper respiratory infections to patients?",
      "patientConversation": "The pneumonia vaccine targets bacterial lung infections, while flu and COVID-19 shots handle the viruses.",
      "presenterNote": "Clarify that viral respiratory infections frequently predispose patients to secondary bacterial pneumonia.",
      "sourceIds": [
        "cdc-pneumo-basics"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "Prevnar 20 and Capvaxive are single-dose pneumococcal conjugate vaccines approved for adult protection without a mandatory subsequent PPSV23 dose.",
      "answer": true,
      "reveal": "Current higher-valency conjugate vaccines cover broad invasive serotypes in a single visit without requiring routine subsequent PPSV23 follow-up.",
      "takeaway": "Modern broad-spectrum conjugate vaccines simplify adult pneumonia regimens to a single visit.",
      "topicCue": "SINGLE-DOSE REGIMENS",
      "authoringId": "q3",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does single-dose conjugate availability eliminate the drop-off seen with two-step regimens?",
      "patientConversation": "With current conjugate vaccines, one dose provides comprehensive protection against pneumonia strains.",
      "presenterNote": "Highlight that eliminating the one-year follow-up visit dramatically boosts population completion rates.",
      "sourceIds": [
        "fda-prevnar-20"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "Adults aged 19 through 49 with asthma or diabetes should wait until age 50 for pneumococcal vaccination.",
      "answer": false,
      "reveal": "Adults 19 through 49 with a condition like asthma, COPD or diabetes are recommended for vaccination now. Routine vaccination for all adults starts at 50.",
      "takeaway": "Asthma, COPD, diabetes or heart disease qualify adults under 50 now.",
      "topicCue": "HIGH-RISK ADULTS",
      "authoringId": "q4",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "How can community pharmacy teams identify adults under 50 who qualify for pneumococcal vaccination?",
      "patientConversation": "With your condition, pneumococcal vaccine is recommended now. You don’t need to wait until 50.",
      "presenterNote": "Emphasize cross-referencing maintenance inhalers and diabetes supplies for pneumococcal eligibility.",
      "sourceIds": [
        "cdc-pneumo-risk",
        "cdc-pneumococcal-recommendations"
      ],
      "emphasis": [
        "aged 19"
      ],
      "revealEmphasis": [
        "19 through 49"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "Invasive pneumococcal disease includes bacteremia and meningitis, which carry substantial mortality in older adults.",
      "answer": true,
      "reveal": "About 20% of people with pneumococcal bacteremia die, and among older adults it can reach 60%. Pneumococcal meningitis kills about 22% of adults who get it.",
      "takeaway": "Vaccination defends against severe bloodstream and central nervous system complications.",
      "topicCue": "INVASIVE DISEASE",
      "authoringId": "q5",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "Why is the distinction between non-bacteremic pneumonia and invasive disease clinically important?",
      "patientConversation": "Pneumococcal bacteria can get into the blood and cause a serious infection. This vaccine helps prevent that kind of infection.",
      "presenterNote": "Explain that conjugate vaccines are licensed to prevent invasive disease caused by the serotypes they contain.",
      "sourceIds": [
        "cdc-pneumo-ipd",
        "fda-prevnar-20"
      ],
      "revealEmphasis": [
        "20%"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "An adult whose only pneumococcal vaccine was PCV13 needs no more pneumococcal vaccines.",
      "answer": false,
      "reveal": "Adults 50 and older who have had only PCV13 are recommended a dose of PCV20 or PCV21 at least a year later. Shared decision-making applies when someone 65 or older also had PPSV23 at 65 or older.",
      "takeaway": "At 50 and older, PCV13 alone is not a finished series.",
      "topicCue": "UPDATED COVERAGE",
      "authoringId": "q6",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you counsel patients who recall getting a pneumonia shot a decade ago and believe they are finished?",
      "patientConversation": "If your only pneumococcal shot was the older PCV13, a dose of a newer vaccine is now recommended for you.",
      "presenterNote": "Walk through the PCV13-only rule: one dose of PCV20 or PCV21 at least a year after the last PCV13.",
      "sourceIds": [
        "cdc-pneumococcal-recommendations",
        "acip-pcv15-ppsv23",
        "cdc-pneumo-risk"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "When PCV15 is administered to an indicated adult, it should be followed by a dose of PPSV23 at least one year later in immunocompetent adults.",
      "answer": true,
      "reveal": "PCV15 needs a PPSV23 dose at least one year later to complete the series in immunocompetent adults.",
      "takeaway": "After PCV15, a dose of PPSV23 at least a year later completes the series.",
      "topicCue": "SERIES SEQUENCE",
      "authoringId": "q7",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What clinical follow-up mechanism ensures patients who receive PCV15 return for their PPSV23 dose?",
      "patientConversation": "If we use PCV15, a dose of PPSV23 follows in one year to finish the series.",
      "presenterNote": "Contrast the two-step PCV15/PPSV23 schedule with the single-step PCV20 approach.",
      "sourceIds": [
        "acip-pcv15-ppsv23"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "Pneumococcal conjugate vaccines contain live attenuated bacteria that can cause bacterial pneumonia in frail patients.",
      "answer": false,
      "reveal": "Pneumococcal conjugate vaccines contain purified capsular polysaccharides conjugated to a carrier protein. They contain zero live bacteria and cannot cause infection.",
      "takeaway": "Conjugate vaccines contain non-infectious capsular polysaccharides and cannot cause pneumonia.",
      "topicCue": "VACCINE COMPOSITION",
      "authoringId": "q8",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you effectively address patient anxiety about catching pneumonia from the vaccine itself?",
      "patientConversation": "The vaccine uses purified bacterial sugars linked to a protein, so it can't cause pneumonia.",
      "presenterNote": "Emphasize that the vaccine stimulates antibody generation without living pathogens.",
      "sourceIds": [
        "cdc-pneumo-vaccine-composition"
      ]
    }
  ]
};
