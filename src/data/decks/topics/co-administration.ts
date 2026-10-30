// Deck module for co-administration (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const coAdministrationDeck: Deck = {
  "id": "co-administration",
  "title": "Co-administration & Practice",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Reviewed clinical questions on simultaneous vaccination, immune capacity, injection site separation, and communication practices.",
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
      "intendedSubject": "A clinician consulting an adult patient regarding multiple vaccine co-administration.",
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
      "title": "Co-administration & Practice",
      "body": "Reviewed clinical questions on simultaneous vaccination, immune capacity, injection site separation, and communication practices.",
      "presenterNote": "Welcome the team to this refresher on vaccine co-administration guidelines and implementation workflows."
    },
    {
      "id": "instructions",
      "type": "instructions",
      "title": "Talk first. Reveal second.",
      "body": "Every question follows one facilitator-controlled rhythm.",
      "presenterNote": "Encourage active team deliberation before revealing each evidence-based answer."
    },
    {
      "id": "closing",
      "type": "closing",
      "title": "Make the offer clear",
      "body": "Proactive simultaneous administration protects patients promptly while reducing missed clinical opportunities.",
      "presenterNote": "Conclude by reminding clinicians to use presumptive bundling to streamline multi-vaccine appointments.",
      "pearl": "Administer all indicated routine vaccines simultaneously at separate anatomical sites spaced at least 1 inch apart.",
      "summaryPoints": [
        "Administer all indicated routine vaccines during the same visit to avoid missed opportunities.",
        "Use separate limbs or space injections at least 1 inch apart in the same muscle.",
        "Recommend all due vaccines together using clear, confident presumptive framing."
      ],
      "references": [
        {
          "label": "CDC ACIP General Best Practice Guidelines"
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
      "id": "cdc-general-best-practices",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Timing and spacing of immunobiologics",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html"
    },
    {
      "id": "cdc-coadmin-guidance",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccine administration best practices",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/vaccine-administration.html"
    },
    {
      "id": "acip-shingrix-flu-coadmin",
      "publisher": "CDC ACIP",
      "shortDisplayLine": "CDC ACIP · Shingrix and Influenza Co-administration Evidence",
      "accessedDate": "2026-09-10",
      "url": "https://www.cdc.gov/mmwr/volumes/67/wr/mm6703a5.htm"
    },
    {
      "id": "cdc-covid-flu-coadmin",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu and COVID-19 vaccine coadministration",
      "accessedDate": "2026-09-28",
      "url": "https://www.cdc.gov/flu/vaccines/coadministration.html"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "binary",
      "statement": "ACIP General Best Practice Guidelines confirm that all indicated routine adult vaccines can be administered during the same clinical visit.",
      "answer": true,
      "reveal": "Simultaneous administration of all indicated routine adult vaccines is safe, effective, and prevents missed vaccination opportunities.",
      "takeaway": "Simultaneous administration of all indicated vaccines during one visit maximizes patient protection and convenience.",
      "topicCue": "SIMULTANEOUS ADMINISTRATION",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why is same-visit co-administration critical for eliminating missed vaccination opportunities in outpatient settings?",
      "patientConversation": "Getting all of your recommended shots today gets you up to date in one visit.",
      "presenterNote": "Emphasize that staggering vaccines increases the likelihood that patients never return for remaining doses.",
      "sourceIds": [
        "cdc-general-best-practices"
      ],
      "takeawayEmphasis": [
        "one visit"
      ]
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "binary",
      "statement": "Administering multiple vaccines simultaneously overloads the human immune system and causes broad immunosuppression.",
      "answer": false,
      "reveal": "CDC notes that giving widely used vaccines together, with some exceptions, produces immune responses similar to giving them separately.",
      "takeaway": "Same-day vaccines work about as well as separate visits.",
      "topicCue": "IMMUNE CAPACITY REALITY",
      "authoringId": "q2",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How can clinicians reassure patients worried that several vaccines at once will overload the immune system?",
      "patientConversation": "For most vaccines, getting them together works about as well as getting them at separate visits.",
      "presenterNote": "Share CDC’s finding that, with some exceptions, vaccines given together produce immune responses and side-effect rates similar to vaccines given apart.",
      "sourceIds": [
        "cdc-general-best-practices"
      ],
      "revealEmphasis": [
        "with some exceptions"
      ]
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "binary",
      "statement": "When giving more than one injection in the same limb, the sites should be at least 1 inch apart.",
      "answer": true,
      "reveal": "CDC guidance says injections in the same limb should be spaced at least 1 inch apart so local reactions can be told apart.",
      "takeaway": "Keep them at least 1 inch apart so local reactions are easy to tell apart.",
      "topicCue": "ANATOMIC SITE SEPARATION",
      "authoringId": "q3",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why is the 1-inch physical separation rule clinically essential when using the same muscle group?",
      "patientConversation": "If both shots go in the same arm, we’ll keep them at least an inch apart so we can tell any reactions apart.",
      "presenterNote": "Review best practice techniques for identifying separate injection zones in large deltoid muscles.",
      "sourceIds": [
        "cdc-coadmin-guidance"
      ],
      "emphasis": [
        "at least 1 inch"
      ],
      "revealEmphasis": [
        "at least 1 inch"
      ],
      "takeawayEmphasis": [
        "at least 1 inch"
      ]
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "binary",
      "statement": "Co-administering Shingrix and seasonal influenza vaccine during the same visit impairs antibody responses to both antigens.",
      "answer": false,
      "reveal": "Clinical trials demonstrate that co-administering Shingrix and influenza vaccine produces antibody responses equal to separate administration.",
      "takeaway": "Shingrix and seasonal influenza vaccine can be co-administered safely with no reduction in immunogenicity.",
      "topicCue": "ZOSTER AND FLU CO-ADMINISTRATION",
      "authoringId": "q4",
      "layoutFamily": "offset-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "surprise",
      "discussionPrompt": "What clinical trial evidence confirms that Shingrix can be given alongside seasonal influenza vaccines?",
      "patientConversation": "You can safely get your flu shot and shingles shot together today, and both will work fully.",
      "presenterNote": "Reassure staff that co-administration does not compromise seroprotection rates for either vaccine.",
      "sourceIds": [
        "acip-shingrix-flu-coadmin"
      ]
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "binary",
      "statement": "Using presumptive bundled recommendations substantially increases patient acceptance of multiple indicated vaccines.",
      "answer": true,
      "reveal": "CDC's Pink Book says a strong provider recommendation makes a patient four to five times more likely to be vaccinated, and presumptive language leads more parents to vaccinate.",
      "takeaway": "A clear, confident recommendation raises the chance a patient says yes.",
      "topicCue": "PRESUMPTIVE BUNDLING",
      "authoringId": "q5",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "How does presumptive recommendation phrasing shift the psychological default for patients?",
      "patientConversation": "Today you're due for your annual flu shot and your shingles shot, so let's get both taken care of.",
      "presenterNote": "Train vaccinators to avoid tentative framing like 'Would you want another shot today?' in favor of clear presumptive guidance.",
      "sourceIds": [
        "cdc-general-best-practices"
      ]
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "binary",
      "statement": "CDC says eligible people can get flu and COVID-19 vaccines at the same visit, at separate injection sites.",
      "answer": true,
      "reveal": "CDC says people can get flu and COVID-19 vaccines at the same visit, and studies support the safety of getting both. Shots at the same visit go in separate places, at least an inch apart.",
      "takeaway": "Flu and COVID-19 shots can share one visit.",
      "topicCue": "COVID-19 AND FLU CO-ADMINISTRATION",
      "authoringId": "q6",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "consequence",
      "discussionPrompt": "What operational workflows facilitate simultaneous COVID-19 and influenza vaccination during peak autumn visits?",
      "patientConversation": "You can get your COVID-19 and flu vaccines at the same visit today, in separate spots.",
      "presenterNote": "Highlight that CDC allows both at one visit, and that giving every due vaccine at one visit raises the chance people get fully vaccinated.",
      "sourceIds": [
        "cdc-covid-flu-coadmin",
        "cdc-general-best-practices"
      ]
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "binary",
      "statement": "The injection site for each vaccine given should be documented in the patient’s medical record.",
      "answer": true,
      "reveal": "CDC says to document the location of each injection with the vaccine given there, so a local reaction can be traced to its vaccine.",
      "takeaway": "Write down which vaccine went where.",
      "topicCue": "EHR SITE DOCUMENTATION",
      "authoringId": "q7",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "applied",
      "discussionPrompt": "Why is anatomical site documentation critical for patient safety surveillance and adverse event attribution?",
      "patientConversation": "We document exactly which shot went in which arm so your permanent health record is completely accurate.",
      "presenterNote": "Remind vaccinators that generic entries like 'deltoid' fail to distinguish sites when two injections are given.",
      "sourceIds": [
        "cdc-coadmin-guidance"
      ]
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "binary",
      "statement": "If a patient expresses hesitation regarding multiple injections, the clinician should insist on all doses or dismiss the patient without care.",
      "answer": false,
      "reveal": "CDC's standards say to address patient questions and concerns. If a patient still declines, CDC advises documenting that refusal.",
      "takeaway": "Listen and answer. Don’t insist or dismiss.",
      "topicCue": "MANAGING VACCINE HESITATION",
      "authoringId": "q8",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-care-team",
      "teachingRole": "misconception",
      "discussionPrompt": "How should clinicians handle patient resistance to multiple injections without damaging therapeutic rapport?",
      "patientConversation": "I understand your concern about getting several shots. What questions can I answer?",
      "presenterNote": "Emphasize answering concerns first. If the patient still declines, document it and offer the next step.",
      "sourceIds": [
        "cdc-general-best-practices"
      ]
    }
  ]
};
