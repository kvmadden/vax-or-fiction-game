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
  "contentRevision": "2026-11-01",
  "defaultTimerSeconds": 20,
  "description": "Eight questions. Read, discuss, check the source. Draft, pending pharmacist review.",
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
      "body": "Eight questions. Read, discuss, check the source. Draft, pending pharmacist review.",
      "presenterNote": "Invite questions and check the linked guidance together. Draft, pending pharmacist review."
    },
    {
      "id": "instructions",
      "type": "instructions",
      "title": "Talk first. Reveal second.",
      "body": "Every question follows one facilitator-controlled rhythm.",
      "presenterNote": "Invite questions and check the linked guidance together. Draft, pending pharmacist review."
    },
    {
      "id": "closing",
      "type": "closing",
      "title": "Make the offer clear",
      "body": "Keep the source in the conversation.",
      "presenterNote": "Invite questions and check the linked guidance together. Draft, pending pharmacist review.",
      "pearl": "Annual flu vaccination is recommended for people aged 6 months and older who do not have contraindications.",
      "summaryPoints": [
        "Annual flu vaccination is recommended for people aged 6 months and older who do not have contraindications.",
        "For adults aged 65 and older, CDC preferentially recommends high-dose inactivated, recombinant, or adjuvanted influenza vaccine.",
        "Egg allergy alone requires no extra vaccine safety measures. Use a flu vaccine appropriate for the person’s age and health status, where allergic reactions can be recognized and treated."
      ],
      "references": [
        {
          "label": "CDC guidance · Draft review · Public domain prose · retrieved 2026-11-01",
          "url": "https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html"
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
      "publisherLabel": "CDC · Draft review",
      "shortDisplayLine": "CDC · recommendations · Draft review · Public domain prose · retrieved 2026-11-01",
      "accessedDate": "2026-11-01",
      "url": "https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html"
    },
    {
      "id": "cdc-egg-allergy",
      "publisher": "CDC",
      "publisherLabel": "CDC · Draft review",
      "shortDisplayLine": "CDC · egg · Draft review · Public domain prose · retrieved 2026-11-01",
      "accessedDate": "2026-11-01",
      "url": "https://www.cdc.gov/flu/vaccines/egg-allergies.html"
    },
    {
      "id": "cdc-pinkbook-flu",
      "publisher": "CDC",
      "publisherLabel": "CDC · Draft review",
      "shortDisplayLine": "CDC · pinkbook · Draft review · Public domain prose · retrieved 2026-11-01",
      "accessedDate": "2026-11-01",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-12-influenza.html"
    },
    {
      "id": "cdc-keyfacts",
      "publisher": "CDC",
      "publisherLabel": "CDC · Draft review",
      "shortDisplayLine": "CDC · keyfacts · Draft review · Public domain prose · retrieved 2026-11-01",
      "accessedDate": "2026-11-01",
      "url": "https://www.cdc.gov/flu/vaccines/keyfacts.html"
    },
    {
      "id": "cdc-heart",
      "publisher": "CDC",
      "publisherLabel": "CDC · Draft review",
      "shortDisplayLine": "CDC · heart · Draft review · Public domain prose · retrieved 2026-11-01",
      "accessedDate": "2026-11-01",
      "url": "https://www.cdc.gov/flu/highrisk/heartdisease.html"
    },
    {
      "id": "cdc-antivirals",
      "publisher": "CDC",
      "publisherLabel": "CDC · Draft review",
      "shortDisplayLine": "CDC · antivirals · Draft review · Public domain prose · retrieved 2026-11-01",
      "accessedDate": "2026-11-01",
      "url": "https://www.cdc.gov/flu/treatment/antiviral-drugs.html"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "Routine annual influenza vaccination is recommended by ACIP for all individuals aged 6 months and older who lack contraindications.",
      "answer": true,
      "reveal": "Annual flu vaccination is recommended for people aged 6 months and older who do not have contraindications.",
      "takeaway": "Annual flu vaccination is recommended for people aged 6 months and older who do not have contraindications.",
      "topicCue": "UNIVERSAL RECOMMENDATION",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "Annual flu vaccination is recommended for people aged 6 months and older who do not have contraindications.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
      "sourceIds": [
        "cdc-keyfacts"
      ],
      "emphasis": [
        "aged 6"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Adults aged 65 years and older are preferentially recommended to receive Fluzone High-Dose, Flublok, or adjuvanted influenza vaccine over standard-dose unadjuvanted vaccines.",
      "answer": true,
      "reveal": "For adults aged 65 and older, CDC preferentially recommends high-dose inactivated, recombinant, or adjuvanted influenza vaccine.",
      "takeaway": "For adults aged 65 and older, CDC preferentially recommends high-dose inactivated, recombinant, or adjuvanted influenza vaccine.",
      "topicCue": "OLDER ADULT FORMULATIONS",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "For adults aged 65 and older, CDC preferentially recommends high-dose inactivated, recombinant, or adjuvanted influenza vaccine.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
      "sourceIds": [
        "cdc-flu-recs"
      ],
      "emphasis": [
        "aged 65"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "A severe egg allergy means a longer observation period after a flu shot.",
      "answer": false,
      "reveal": "Egg allergy alone requires no extra vaccine safety measures. Use a flu vaccine appropriate for the person’s age and health status, where allergic reactions can be recognized and treated.",
      "takeaway": "Egg allergy alone requires no extra vaccine safety measures. Use a flu vaccine appropriate for the person’s age and health status, where allergic reactions can be recognized and treated.",
      "topicCue": "EGG ALLERGY SAFETY",
      "authoringId": "q3",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "Egg allergy alone requires no extra vaccine safety measures. Use a flu vaccine appropriate for the person’s age and health status, where allergic reactions can be recognized and treated.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
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
      "reveal": "Flu shots contain inactivated virus or influenza proteins and cannot cause flu.",
      "takeaway": "Flu shots contain inactivated virus or influenza proteins and cannot cause flu.",
      "topicCue": "VACCINE BIOLOGY",
      "authoringId": "q4",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "Flu shots contain inactivated virus or influenza proteins and cannot cause flu.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
      "sourceIds": [
        "cdc-keyfacts"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "For most people, September or October is the ideal time for a flu shot.",
      "answer": true,
      "reveal": "For most people who need one dose, flu vaccination should ideally be offered in September or October.",
      "takeaway": "For most people who need one dose, flu vaccination should ideally be offered in September or October.",
      "topicCue": "TIMING OF VACCINATION",
      "authoringId": "q5",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "For most people who need one dose, flu vaccination should ideally be offered in September or October.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
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
      "reveal": "Flu vaccination is associated with lower rates of some cardiac events among people with heart disease.",
      "takeaway": "Flu vaccination is associated with lower rates of some cardiac events among people with heart disease.",
      "topicCue": "CARDIOVASCULAR PROTECTION",
      "authoringId": "q6",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "Flu vaccination is associated with lower rates of some cardiac events among people with heart disease.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
      "sourceIds": [
        "cdc-heart"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "A mild afebrile cold with clear nasal discharge requires clinicians to postpone seasonal influenza vaccination until all symptoms clear.",
      "answer": false,
      "reveal": "People with minor illness may be vaccinated. Moderate or severe acute illness is a precaution.",
      "takeaway": "People with minor illness may be vaccinated. Moderate or severe acute illness is a precaution.",
      "topicCue": "MILD ILLNESS PRECAUTIONS",
      "authoringId": "q7",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "People with minor illness may be vaccinated. Moderate or severe acute illness is a precaution.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
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
      "reveal": "Antiviral drugs can treat flu but are not a substitute for a flu vaccine.",
      "takeaway": "Antiviral drugs can treat flu but are not a substitute for a flu vaccine.",
      "topicCue": "ANTIVIRALS VS VACCINATION",
      "authoringId": "q8",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "What would you check in the cited guidance before discussing this with a patient?",
      "patientConversation": "Antiviral drugs can treat flu but are not a substitute for a flu vaccine.",
      "presenterNote": "Read the explanation and invite the room to check the source. This round is draft, pending pharmacist review.",
      "sourceIds": [
        "cdc-antivirals"
      ]
    }
  ]
}
