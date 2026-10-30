// Deck module for art-of-the-offer (contentRevision 2026-09-10). Ported once from the earlier static edition's deck JSON;
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

export const artOfTheOfferDeck: Deck = {
  "id": "art-of-the-offer",
  "title": "Vaccine Reality Check · Art of the Offer",
  "version": 1,
  "status": "draft",
  "contentRevision": "2026-09-10",
  "defaultTimerSeconds": 20,
  "description": "Clinical communication, co-administration offers, and objection navigation.",
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
      "id": "plate-q01",
      "questionIds": [
        1
      ],
      "slideIds": [],
      "intendedSubject": "Clinical consultation demonstrating presumptive pneumococcal offer alongside influenza vaccination.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Anatomical deltoid injection sites demonstrating intramuscular spacing.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Simultaneous antigen processing and cellular immune defense visualization.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Recombinant adjuvant shingles vaccine co-administered with tetanus-diphtheria-pertussis.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Respiratory syncytial virus and pneumococcal conjugate clinical discussion for older adults.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Comprehensive multi-vaccine safety profile and adverse reaction monitoring.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Egg allergy screening and safe standard influenza vaccine administration.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Adult physical fitness contrast with shingles risk and cellular immunity decline.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Hybrid immunity comparison against natural infection risks in healthcare settings.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Maternal placental antibody transfer protecting newborns from respiratory illness.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Clinical decision-making addressing vaccine hesitancy with same-day documentation.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Post-vaccination reactogenicity education distinguishing immune response from infection.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Maternal Tdap vaccination window between 27 and 36 weeks of pregnancy.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Maternal RSV bivalent vaccination window between 32 and 36 weeks of gestation.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Adult Shingrix administration after acute shingles infection symptom resolution.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Resuming an interrupted vaccine series without restarting from dose one.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "COVID-19 booster timing optimization considering 90-day post-infection interval.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Two-dose adult hepatitis B schedule completed in one month.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Two-dose Shingrix series completion securing durable shingles defense.",
      "focalPointIntent": "Center focus right with ample copy space left.",
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
      "intendedSubject": "Three-dose HPV vaccination schedule for individuals starting at age 15 or older.",
      "focalPointIntent": "Center focus right with ample copy space left.",
      "decorative": true,
      "alt": "",
      "promptFilename": "plate-q20.md"
    },
    {
      "id": "plate-care-team",
      "questionIds": [],
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
      "title": "Vaccine Reality Check · Art of the Offer",
      "body": "Clinical communication, co-administration offers, and objection navigation.",
      "presenterNote": "Open by emphasizing that this session sharpens what we say to patients every day."
    },
    {
      "id": "instructions",
      "type": "instructions",
      "title": "Talk first. Reveal second.",
      "body": "Vote on the move, discuss the phrasing, and take home words to say.",
      "presenterNote": "Remind the room to focus on effective language and timely recommendations."
    },
    {
      "id": "closing",
      "type": "closing",
      "title": "Make the offer clear",
      "body": "Move from passive availability to confident, presumptive recommendations.",
      "pearl": "Every clinical interaction is an immunization assessment opportunity.",
      "summaryPoints": [
        "Offer indicated co-administrations presumptively in a single visit.",
        "Validate patient concerns without validating clinical misinformation.",
        "Secure multi-dose series completion before the patient leaves."
      ],
      "references": [
        {
          "label": "CDC General Best Practice Guidelines"
        },
        {
          "label": "CDC Talking with Patients about Vaccines"
        }
      ],
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Close with the practical invitation to turn every interaction into an offer of protection."
    }
  ],
  "focuses": [
    {
      "id": "focus-coadmin",
      "groupId": "group-1",
      "headline": "Bundle the offer.",
      "body": "Every visit is a chance to protect against multiple preventable infections.",
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Frame co-administration as standard clinical care, not an optional add-on."
    },
    {
      "id": "focus-objections",
      "groupId": "group-2",
      "headline": "Acknowledge and reframe.",
      "body": "Hear the underlying worry, answer with clarity, and keep the door open.",
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Address hesitancy by connecting evidence to what the patient cares about."
    },
    {
      "id": "focus-timing",
      "groupId": "group-3",
      "headline": "Timing is protection.",
      "body": "Give vaccines when they provide the greatest clinical shield.",
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Highlight critical windows where timing determines clinical outcomes."
    },
    {
      "id": "focus-series",
      "groupId": "group-4",
      "headline": "Finish the series.",
      "body": "Initial doses prime immunity, and completing the full series delivers durable defense.",
      "imageRequirementId": "plate-care-team",
      "presenterNote": "Close the loop on multi-dose schedules before patients leave the clinical counter."
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
        "q1",
        "q3",
        "q6",
        "q7",
        "q10",
        "q13",
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
      "id": "cdc-general-timing",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult immunization standards",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines-adults/hcp/imz-standards/index.html"
    },
    {
      "id": "cdc-pinkbook-admin",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccine administration best practices",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/vaccine-administration.html"
    },
    {
      "id": "cdc-covid-clinical",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · COVID-19 vaccine considerations",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/vaccines/covid-19/clinical-considerations/interim-considerations-us.html"
    },
    {
      "id": "cdc-shingles-clinical",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles vaccine recommendations",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "cdc-rsv-adults",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV adult recommendations",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html"
    },
    {
      "id": "cdc-multiple-vaccinations",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Timing and spacing of immunobiologics",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html"
    },
    {
      "id": "cdc-flu-egg-allergy",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu vaccine and egg allergy",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/flu/vaccines/egg-allergies.html"
    },
    {
      "id": "cdc-shingles-overview",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles clinical overview",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/shingles/hcp/clinical-overview/index.html"
    },
    {
      "id": "cdc-covid-benefits",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Benefits of COVID-19 vaccination",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/covid/vaccines/benefits.html"
    },
    {
      "id": "cdc-maternal-vaccines",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Vaccination guidelines during pregnancy",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines-pregnancy/hcp/vaccination-guidelines/index.html"
    },
    {
      "id": "cdc-vaccine-concerns",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Adult immunization standards",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines-adults/hcp/imz-standards/index.html"
    },
    {
      "id": "cdc-flu-safety",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Flu vaccine safety",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/flu/vaccine-safety/index.html"
    },
    {
      "id": "cdc-pertussis-pregnancy",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Pertussis pregnancy guidance",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/pertussis/hcp/vaccine-recommendations/index.html"
    },
    {
      "id": "cdc-rsv-maternal",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · RSV vaccine guidance for pregnant people",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/pregnant-people.html"
    },
    {
      "id": "cdc-shingles-recurrence",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles recurrence guidance",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "cdc-timing-intervals",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Timing and spacing of immunobiologics",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html"
    },
    {
      "id": "cdc-covid-faq",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Staying up to date with COVID-19 vaccines",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/covid/vaccines/stay-up-to-date.html"
    },
    {
      "id": "cdc-hepb-adults",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Hepatitis B vaccine administration",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/hepatitis-b/hcp/vaccine-administration/index.html"
    },
    {
      "id": "cdc-shingles-efficacy",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles two-dose efficacy",
      "accessedDate": "2026-09-06",
      "url": "https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html"
    },
    {
      "id": "cdc-hpv-schedules",
      "publisher": "CDC Pink Book",
      "shortDisplayLine": "CDC Pink Book · HPV chapter",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-11-human-papillomavirus.html"
    },
    {
      "id": "cdc-shingles-vaccines-overview",
      "publisher": "CDC",
      "shortDisplayLine": "CDC · Shingles vaccines overview",
      "accessedDate": "2026-09-29",
      "url": "https://www.cdc.gov/shingles/vaccines/index.html"
    }
  ],
  "questions": [
    {
      "id": "q1",
      "index": 1,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient is due for two vaccines today. What's the better way to offer both?",
      "reveal": "Research CDC cites shows a strong provider recommendation makes patients four to five times more likely to be vaccinated. Offering the vaccine in the same visit as the recommendation helps too.",
      "takeaway": "A clear, confident recommendation gets more patients vaccinated.",
      "topicCue": "Co-administration",
      "authoringId": "q1",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q01",
      "teachingRole": "applied",
      "discussionPrompt": "Why does open-ended permission often result in deferred vaccination?",
      "patientConversation": "You are due for both vaccines today, so we will give them together and keep you protected.",
      "presenterNote": "Model the contrast between presumptive confidence and passive permission.",
      "sourceIds": [
        "cdc-general-timing"
      ],
      "scenario": "A 66-year-old arrives for an annual flu vaccine. The clinic record indicates pneumococcal conjugate vaccination is also indicated today.",
      "choices": [
        "Did you also want to think about getting a pneumococcal shot today?",
        "You are due for flu and pneumococcal today. We will do both now."
      ],
      "bestIndex": 1
    },
    {
      "id": "q2",
      "index": 2,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient is getting two vaccines in one visit. What's the better way to respond?",
      "reveal": "CDC says adults can get two shots in the same arm at least an inch apart, or in different arms. Spacing keeps any local reaction easy to trace.",
      "takeaway": "Separate same-limb injections by at least one inch.",
      "topicCue": "Co-administration",
      "authoringId": "q2",
      "layoutFamily": "three-site-map",
      "imageRequirementId": "plate-q02",
      "teachingRole": "applied",
      "discussionPrompt": "How do you explain the choice of separate limbs to a patient who asks for one arm?",
      "patientConversation": "We’ll give one vaccine in each arm today, so if an arm gets sore, we’ll know which shot caused it.",
      "presenterNote": "Demonstrate anatomical spacing and deltoid landmarks for co-administration.",
      "sourceIds": [
        "cdc-pinkbook-admin"
      ],
      "takeawayEmphasis": [
        "one inch"
      ],
      "scenario": "A 68-year-old agrees to receive both an RSV vaccine and a high-dose flu vaccine during the same afternoon clinical encounter.",
      "choices": [
        "We will place one shot in each arm to keep soreness separate and trackable.",
        "I will inject both right together in this arm so the other arm stays free."
      ],
      "bestIndex": 0
    },
    {
      "id": "q3",
      "index": 3,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient worries two shots together will overwhelm their immune system. What's the better reply?",
      "reveal": "CDC guidance and clinical trials confirm that co-administering COVID-19 and seasonal influenza vaccines generates protective antibody levels comparable to separate administration, with similar safety profiles.",
      "takeaway": "Simultaneous administration produces robust immune responses without immune overload.",
      "topicCue": "Co-administration",
      "authoringId": "q3",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q03",
      "teachingRole": "misconception",
      "discussionPrompt": "What everyday analogy helps patients understand that two vaccines do not overload the immune system?",
      "patientConversation": "Your immune system processes millions of antigens every day, and these two vaccines work safely together.",
      "presenterNote": "Remind the audience of the immense antigen-processing capacity of the human immune system.",
      "sourceIds": [
        "cdc-covid-clinical"
      ],
      "scenario": "A 52-year-old scheduled for a COVID-19 vaccine asks whether receiving their seasonal influenza shot at the same visit overloads the immune system.",
      "choices": [
        "Getting two shots at once might overwhelm your body, so come back next week.",
        "Your immune system easily handles both vaccines together with full protection."
      ],
      "bestIndex": 1
    },
    {
      "id": "q4",
      "index": 4,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient getting a first Shingrix dose is also due for a Tdap booster. What's the better reply?",
      "reveal": "ACIP guidelines confirm recombinant zoster vaccine (Shingrix) can be co-administered with other adult vaccines, including tetanus toxoid-containing vaccines (Tdap), influenza, and pneumococcal vaccines, administered at separate anatomic sites.",
      "takeaway": "Inactivated and recombinant vaccines can be co-administered without waiting intervals.",
      "topicCue": "Co-administration",
      "authoringId": "q4",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q04",
      "teachingRole": "applied",
      "discussionPrompt": "Why do some clinicians mistakenly believe Shingrix requires a four-week clearance window?",
      "patientConversation": "We can give Shingrix and Tdap together in different arms today so you are protected against both right away.",
      "presenterNote": "Clarify that recombinant and inactivated vaccines do not require spacing intervals.",
      "sourceIds": [
        "cdc-shingles-clinical"
      ],
      "scenario": "A 54-year-old receiving their initial Shingrix dose is also overdue for a Tdap booster following a minor puncture wound.",
      "choices": [
        "Shingrix pairs safely with Tdap today, protecting you without a return trip.",
        "You have to wait four weeks after Shingrix before getting any other shot."
      ],
      "bestIndex": 0
    },
    {
      "id": "q5",
      "index": 5,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient with chronic lung disease asks about RSV protection at today's pneumococcal visit. What's the better reply?",
      "reveal": "CDC and ACIP state that RSV vaccines may be administered simultaneously with other indicated adult vaccines, including pneumococcal conjugate vaccines, during the same visit for eligible high-risk adults.",
      "takeaway": "Co-administer indicated lung protection vaccines to prevent missed opportunities.",
      "topicCue": "Co-administration",
      "authoringId": "q5",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q05",
      "teachingRole": "applied",
      "discussionPrompt": "How do you frame co-administration for high-risk patients who want to defer?",
      "patientConversation": "Because of your lung condition, both RSV and pneumococcal vaccines are recommended, and we can give you both today.",
      "presenterNote": "Emphasize seizing the moment for adults with underlying pulmonary conditions.",
      "sourceIds": [
        "cdc-rsv-adults"
      ],
      "scenario": "A 61-year-old with chronic lung disease asks about seasonal RSV protection while checking in for pneumococcal conjugate vaccination.",
      "choices": [
        "We never give RSV and pneumonia shots together because of side effects.",
        "Both vaccines protect your lungs and can be administered safely together today."
      ],
      "bestIndex": 1
    },
    {
      "id": "q6",
      "index": 6,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient is nervous about getting three vaccines at once. What's the better reply?",
      "reveal": "CDC says that, with some exceptions, giving widely used vaccines together has side-effect rates similar to giving them apart. Some pairings, like RSV with other adult vaccines, can make common side effects such as fever or soreness more frequent.",
      "takeaway": "Same-day vaccines get you protected sooner, even if side effects are a bit more common.",
      "topicCue": "Co-administration",
      "authoringId": "q6",
      "layoutFamily": "numeric-poster",
      "imageRequirementId": "plate-q06",
      "teachingRole": "misconception",
      "discussionPrompt": "What is the clinical cost of letting a patient split three indicated vaccines over several months?",
      "patientConversation": "Getting these together gets you up to date in one visit. A sore arm, fever or aches may be a bit more common.",
      "presenterNote": "Be upfront that some pairings, like RSV with other adult vaccines, can make common side effects more frequent.",
      "sourceIds": [
        "cdc-multiple-vaccinations"
      ],
      "scenario": "A 65-year-old expresses reluctance to receive three recommended vaccines at once, fearing severe systemic reactions from multi-vaccine appointments.",
      "choices": [
        "Giving these together provides timely defense with no increase in severe reactions.",
        "Getting three shots at once is dangerous, so choose your favorite one today."
      ],
      "bestIndex": 0
    },
    {
      "id": "q7",
      "index": 7,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient with an egg allergy says no to a flu shot. What's the better reply?",
      "reveal": "Since the 2023-24 season, egg allergy of any severity needs no special precautions for flu vaccination. Any flu vaccine that fits the person’s age and health can be used.",
      "takeaway": "Egg allergy of any severity does not require special influenza vaccine precautions.",
      "topicCue": "Objection: Egg Allergy",
      "authoringId": "q7",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q07",
      "teachingRole": "surprise",
      "discussionPrompt": "Why do many clinicians and patients still believe egg allergy requires an egg-free vaccine?",
      "patientConversation": "The guidelines have been updated: egg allergy is no longer a barrier, and you can receive routine flu vaccination today.",
      "presenterNote": "Clarify that since the 2023-24 season, egg allergy needs no special monitoring, and any flu vaccine that fits the person’s age and health can be used.",
      "sourceIds": [
        "cdc-flu-egg-allergy"
      ],
      "scenario": "A 34-year-old declines an influenza vaccine, stating they experienced hives and facial swelling after eating scrambled eggs in childhood.",
      "choices": [
        "Since eggs make you swell, you must go to a hospital for an egg-free shot.",
        "Current safety guidelines confirm you can receive any routine flu shot safely."
      ],
      "bestIndex": 1
    },
    {
      "id": "q8",
      "index": 8,
      "kind": "which-patient",
      "reply": true,
      "statement": "A fit, active patient says their fitness protects them from shingles. What's the better reply?",
      "reveal": "After chickenpox, the virus stays dormant in the nerves and can reactivate later as shingles. The risk rises sharply after 50 as immunity to the virus declines with age, and CDC recommends Shingrix for adults 50 and older with healthy immune systems.",
      "takeaway": "Shingles risk rises after 50 as immunity to the virus declines.",
      "topicCue": "Objection: Health Status",
      "authoringId": "q8",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q08",
      "teachingRole": "misconception",
      "discussionPrompt": "How do you validate an athletic patient's healthy habits without validating their vaccine refusal?",
      "patientConversation": "You’re in great shape, but the shingles virus stays dormant in your nerves, and the risk goes up after 50. Shingrix helps your immune system defend against it.",
      "presenterNote": "Validate their fitness while explaining that shingles risk rises sharply after 50 as immunity to the virus declines with age.",
      "sourceIds": [
        "cdc-shingles-overview",
        "cdc-shingles-clinical",
        "cdc-shingles-vaccines-overview"
      ],
      "scenario": "A 51-year-old marathon runner refuses shingles vaccination, explaining that excellent cardiovascular fitness prevents dormant viral reactivation.",
      "choices": [
        "Staying fit is great, but shingles risk rises after 50 as immunity to the virus declines, so Shingrix is still recommended.",
        "If you run marathons and eat clean, you probably do not need the shingles shot."
      ],
      "bestIndex": 0
    },
    {
      "id": "q9",
      "index": 9,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient says a past infection is protection enough. What's the better reply?",
      "reveal": "CDC says the COVID-19 vaccine lowers the risk of severe illness, hospitalization and death. That protection adds to any protection from past infections.",
      "takeaway": "The vaccine adds to what a past infection left behind.",
      "topicCue": "Objection: Prior Infection",
      "authoringId": "q9",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q09",
      "teachingRole": "consequence",
      "discussionPrompt": "How do you explain, at the counter, that the vaccine adds to protection from a past infection?",
      "patientConversation": "Protection from a past infection fades over time, and the updated vaccine is made for the strains going around now.",
      "presenterNote": "Acknowledge prior infection without treating it as permanent complete defense.",
      "sourceIds": [
        "cdc-covid-benefits"
      ],
      "scenario": "A 38-year-old declines updated COVID-19 vaccination, claiming natural immunity acquired from an infection eight months ago provides lasting, robust protection.",
      "choices": [
        "Natural infection gives permanent immunity, so a booster does not add anything.",
        "The vaccine adds protection on top of what a past infection gave you."
      ],
      "bestIndex": 1
    },
    {
      "id": "q10",
      "index": 10,
      "kind": "which-patient",
      "reply": true,
      "statement": "A pregnant patient worries a vaccine could harm their baby. What's the better reply?",
      "reveal": "CDC recommends flu, Tdap and RSV vaccines during pregnancy. The antibodies they make pass to the baby and help protect the baby after birth.",
      "takeaway": "Maternal antibodies cross the placenta to shield infants before their first shots.",
      "topicCue": "Objection: Pregnancy Safety",
      "authoringId": "q10",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q10",
      "teachingRole": "surprise",
      "discussionPrompt": "How does shifting focus to the newborn change maternal vaccination conversations?",
      "patientConversation": "The vaccine prompts your body to make protective antibodies that cross directly to your baby, shielding them after birth.",
      "presenterNote": "Reframe maternal vaccination from maternal risk to infant protection.",
      "sourceIds": [
        "cdc-maternal-vaccines"
      ],
      "scenario": "A patient in their second trimester hesitates to receive maternal vaccines, worrying that maternal immunization harms fetal development.",
      "choices": [
        "Vaccines are safe for you, so do not worry about what reaches the baby.",
        "Getting vaccinated now passes protective antibodies directly to your baby."
      ],
      "bestIndex": 1
    },
    {
      "id": "q11",
      "index": 11,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient wants to put off a recommended vaccine until their next physical. What's the better reply?",
      "reveal": "Delaying vaccination leaves patients vulnerable to invasive pneumococcal disease during interim months. Providing clear answers and reassuring patients that records are shared with their primary care provider helps secure same-day immunization.",
      "takeaway": "Address questions now to prevent vulnerable multi-month coverage gaps.",
      "topicCue": "Objection: Provider Delay",
      "authoringId": "q11",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q11",
      "teachingRole": "applied",
      "discussionPrompt": "What phrases reassure patients that receiving a vaccine in the pharmacy complements their physician's plan?",
      "patientConversation": "What questions can I answer now? We share records with your doctor, so they’ll see you got your vaccine today.",
      "presenterNote": "Emphasize closing the care loop with the primary care provider to ease patient anxiety.",
      "sourceIds": [
        "cdc-vaccine-concerns"
      ],
      "scenario": "A 67-year-old due for pneumococcal conjugate vaccination states they want to postpone until their annual physical exam six months away.",
      "choices": [
        "I will send notes to your doctor today showing we completed your recommended dose.",
        "Your doctor will just tell you the same thing, so you should just do it here."
      ],
      "bestIndex": 0
    },
    {
      "id": "q12",
      "index": 12,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient refuses a flu shot after side effects last time. What's the better reply?",
      "reveal": "Flu shots are made with inactivated virus or a single protein, so they can’t cause flu. Side effects like low-grade fever or aches are usually mild and go away within a few days.",
      "takeaway": "A day of side effects is not the flu.",
      "topicCue": "Objection: Prior Side Effects",
      "authoringId": "q12",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q12",
      "teachingRole": "misconception",
      "discussionPrompt": "How can you talk about mild side effects so patients still come back next year?",
      "patientConversation": "Mild side effects like aches or fever are common and go away within a few days. The shot can’t give you flu.",
      "presenterNote": "Normalize common side effects, which are usually mild and go away within a few days.",
      "sourceIds": [
        "cdc-flu-safety"
      ],
      "scenario": "A 45-year-old refuses an annual influenza shot because they developed low-grade fever and fatigue for 24 hours after a previous vaccination.",
      "choices": [
        "You probably had the flu already in your system before getting the shot.",
        "Side effects like that are common and go away within a few days. The shot can’t give you flu."
      ],
      "bestIndex": 1
    },
    {
      "id": "q13",
      "index": 13,
      "kind": "which-patient",
      "reply": true,
      "statement": "A pregnant patient had a Tdap booster 18 months ago, in an earlier pregnancy, and asks if they need another. What's the better reply?",
      "reveal": "ACIP guidelines recommend a dose of Tdap during each pregnancy between 27 and 36 weeks of gestation, regardless of the patient's prior history of receiving Tdap, because maternal pertussis antibody levels decline rapidly and peak antibody transfer occurs during the third trimester.",
      "takeaway": "Every pregnancy requires a timely Tdap booster for newborn defense.",
      "topicCue": "Timing: Pregnancy Tdap",
      "authoringId": "q13",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q13",
      "teachingRole": "applied",
      "discussionPrompt": "Why does maternal pertussis protection require revaccination during every pregnancy?",
      "patientConversation": "Getting Tdap between weeks 27 and 36 passes peak whooping cough antibodies to your baby before birth.",
      "presenterNote": "Stress that maternal Tdap dosing is scheduled for the baby's protection, not the mother's.",
      "sourceIds": [
        "cdc-pertussis-pregnancy"
      ],
      "emphasis": [
        "18 months"
      ],
      "revealEmphasis": [
        "27 and 36 weeks"
      ],
      "takeawayEmphasis": [
        "Every pregnancy"
      ],
      "scenario": "A pregnant patient who received a Tdap booster 18 months ago during an earlier pregnancy asks if repeat vaccination is indicated now.",
      "choices": [
        "A booster with every pregnancy ensures your newborn receives peak pertussis protection.",
        "Since you had Tdap less than two years ago, you are already covered for this baby."
      ],
      "bestIndex": 0
    },
    {
      "id": "q14",
      "index": 14,
      "kind": "which-patient",
      "reply": true,
      "statement": "A pregnant patient at 24 weeks asks for their RSV vaccine today. What's the better reply?",
      "reveal": "CDC recommends one dose of Abrysvo from 32 weeks through 36 weeks of pregnancy, given September through January in most of the continental United States.",
      "takeaway": "Maternal RSV vaccine has a strict 32-through-36-week gestational window.",
      "topicCue": "Timing: Maternal RSV",
      "authoringId": "q14",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q14",
      "teachingRole": "applied",
      "discussionPrompt": "How do you handle a patient request for Abrysvo that falls outside the 32-36 week window?",
      "patientConversation": "We’ll schedule your RSV vaccine for weeks 32 through 36, when it’s recommended, so your baby is protected at birth.",
      "presenterNote": "Emphasize calculating gestational weeks accurately before administering maternal Abrysvo.",
      "sourceIds": [
        "cdc-rsv-maternal"
      ],
      "emphasis": [
        "24 weeks"
      ],
      "revealEmphasis": [
        "32 weeks"
      ],
      "scenario": "A pregnant patient at 24 weeks gestation in November requests maternal RSV vaccine Abrysvo during a routine prenatal consultation.",
      "choices": [
        "We can give you Abrysvo right now at 24 weeks so you do not have to think about it later.",
        "We will schedule your Abrysvo for weeks 32 through 36, when it is recommended."
      ],
      "bestIndex": 1
    },
    {
      "id": "q15",
      "index": 15,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient who just recovered from shingles asks about the vaccine. What's the better reply?",
      "reveal": "ACIP recommends Shingrix for immunocompetent adults 50 and older regardless of prior herpes zoster infection. Vaccination should occur once the acute stage of illness has passed and symptoms have abated, because natural infection does not prevent recurrences.",
      "takeaway": "Prior shingles infection requires vaccination after acute lesions resolve.",
      "topicCue": "Timing: Shingles Recurrence",
      "authoringId": "q15",
      "layoutFamily": "editorial-split",
      "imageRequirementId": "plate-q15",
      "teachingRole": "consequence",
      "discussionPrompt": "Why do many patients believe having shingles once protects them forever?",
      "patientConversation": "Natural shingles does not confer lasting immunity. Now that your skin is healed, this two-dose series protects against another outbreak.",
      "presenterNote": "Clarify that acute shingles episode resolution is the clinical green light for Shingrix.",
      "sourceIds": [
        "cdc-shingles-recurrence"
      ],
      "revealEmphasis": [
        "50 and older"
      ],
      "scenario": "A 56-year-old completed acute antiviral treatment for herpes zoster three weeks ago. The vesicular rash is fully crusted and resolved.",
      "choices": [
        "Now that your skin has healed, Shingrix protects you against painful future recurrences.",
        "Having shingles gives you lifelong immunity, so you never need the vaccine again."
      ],
      "bestIndex": 0
    },
    {
      "id": "q16",
      "index": 16,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient's second dose is later than the recommended window. What's the better reply?",
      "reveal": "CDC's general best practices say longer-than-recommended intervals typically do not reduce final antibody levels, so an interrupted series does not need to be restarted. Just give the next dose.",
      "takeaway": "Resume the series. A late dose does not mean starting over.",
      "topicCue": "Timing: Series Interruption",
      "authoringId": "q16",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q16",
      "teachingRole": "misconception",
      "discussionPrompt": "Why is the myth of having to restart a series so pervasive in healthcare?",
      "patientConversation": "Your first dose still counts. We’ll give your second shot today, and there’s no need to start over.",
      "presenterNote": "Reassure patients that longer-than-recommended intervals typically do not reduce final antibody levels, so the series continues.",
      "sourceIds": [
        "cdc-timing-intervals"
      ],
      "takeawayEmphasis": [
        "does not mean starting over"
      ],
      "scenario": "A 63-year-old received their first Shingrix dose nine months ago, exceeding the recommended two-to-six-month interval for the second dose.",
      "choices": [
        "Since you missed the six-month cutoff, we must start the entire series over.",
        "Your first dose still counts, so we just give your second shot today to finish."
      ],
      "bestIndex": 1
    },
    {
      "id": "q17",
      "index": 17,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient recovering from COVID-19 asks when to get their next COVID-19 vaccine. What's the better reply?",
      "reveal": "CDC says people who recently had COVID-19 may delay their next vaccine for 3 months after symptoms started or after a positive test. Getting COVID-19 again is less likely in the weeks to months after an infection.",
      "takeaway": "After COVID-19, the next shot can wait up to 3 months.",
      "topicCue": "Timing: Post-Infection",
      "authoringId": "q17",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q17",
      "teachingRole": "surprise",
      "discussionPrompt": "How do you explain that waiting after COVID-19 is an option, not a rule?",
      "patientConversation": "Now that you’ve recovered, you can get your dose now or wait up to 3 months, since getting COVID-19 again is less likely soon after an infection.",
      "presenterNote": "Frame the 3-month wait as an option CDC allows, not a rule.",
      "sourceIds": [
        "cdc-covid-faq"
      ],
      "revealEmphasis": [
        "3 months"
      ],
      "takeawayEmphasis": [
        "3 months"
      ],
      "scenario": "A 48-year-old testing negative after symptomatic SARS-CoV-2 illness two weeks ago asks when they can receive an updated seasonal COVID-19 vaccine.",
      "choices": [
        "You can get it now, or wait up to 3 months, since reinfection is less likely soon after COVID-19.",
        "You are strictly forbidden from receiving any COVID-19 shot for at least a year."
      ],
      "bestIndex": 0
    },
    {
      "id": "q18",
      "index": 18,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient asks how many shots it takes to finish the adult hepatitis B vaccine. What's the better reply?",
      "reveal": "ACIP guidelines recognize Heplisav-B as an approved two-dose hepatitis B vaccine administered at 0 and 1 month for adults 18 and older.",
      "takeaway": "Heplisav-B finishes the adult series in one month.",
      "topicCue": "Series: Hepatitis B",
      "authoringId": "q18",
      "layoutFamily": "comparison",
      "imageRequirementId": "plate-q18",
      "teachingRole": "applied",
      "discussionPrompt": "How might a one-month series help more adults finish?",
      "patientConversation": "With our two-dose option, you return in one month for your second shot, and then your series is complete.",
      "presenterNote": "Point out that a shorter schedule means fewer return visits to finish the series.",
      "sourceIds": [
        "cdc-hepb-adults",
        "cdc-timing-intervals"
      ],
      "revealEmphasis": [
        "18 and older"
      ],
      "takeawayEmphasis": [
        "one month"
      ],
      "scenario": "A 42-year-old starting adult hepatitis B vaccination asks how many shots the series takes.",
      "choices": [
        "Every adult hepatitis B vaccine takes three shots and half a year to finish.",
        "With Heplisav-B, two shots one month apart complete the series."
      ],
      "bestIndex": 1
    },
    {
      "id": "q19",
      "index": 19,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient asks if one dose of Shingrix is enough. What's the better reply?",
      "reveal": "Clinical trials show that while one dose of recombinant zoster vaccine generates initial immunity, two doses administered 2 to 6 months apart are necessary to achieve >90% efficacy against herpes zoster and postherpetic neuralgia, with protection persisting for at least a decade.",
      "takeaway": "Two doses of Shingrix secure durable defense against shingles pain.",
      "topicCue": "Series: Shingrix",
      "authoringId": "q19",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q19",
      "teachingRole": "consequence",
      "discussionPrompt": "What workflow step helps prevent patients from dropping off after Shingrix dose one?",
      "patientConversation": "The first dose primes your immune system, and the second dose locks in high-level defense against shingles pain for years to come.",
      "presenterNote": "Emphasize scheduling the second dose before the patient leaves the counter after dose one.",
      "sourceIds": [
        "cdc-shingles-efficacy"
      ],
      "revealEmphasis": [
        "90%"
      ],
      "scenario": "A 59-year-old received their first Shingrix dose two months ago and inquires whether a single dose confers sufficient long-term protection.",
      "choices": [
        "The second dose locks in long-lasting defense against shingles nerve pain.",
        "One dose gives you all the protection you will ever need, so you can skip dose two."
      ],
      "bestIndex": 0
    },
    {
      "id": "q20",
      "index": 20,
      "kind": "which-patient",
      "reply": true,
      "statement": "A patient starting the HPV vaccine asks if two doses will do, like their younger sibling had. What's the better reply?",
      "reveal": "ACIP guidelines specify that individuals who initiate the HPV vaccination series on or after their 15th birthday require a 3-dose series administered at 0, 1–2, and 6 months. Adolescents who initiate the series before their 15th birthday are eligible for the 2-dose schedule.",
      "takeaway": "Initiating HPV vaccination at age 15 or older requires a three-dose schedule.",
      "topicCue": "Series: HPV Schedule",
      "authoringId": "q20",
      "layoutFamily": "timeline",
      "imageRequirementId": "plate-q20",
      "teachingRole": "applied",
      "discussionPrompt": "How do you explain the biological reason for needing three doses instead of two after age 15?",
      "patientConversation": "Because you’re starting at 15 or older, you’ll need three doses over six months.",
      "presenterNote": "Clarify the age cutoff: 15th birthday determines 2-dose vs 3-dose regimen.",
      "sourceIds": [
        "cdc-hpv-schedules"
      ],
      "revealEmphasis": [
        "6 months"
      ],
      "takeawayEmphasis": [
        "15 or older"
      ],
      "scenario": "A 22-year-old initiating the HPV vaccine series today asks if their schedule requires two doses like their younger adolescent sibling.",
      "choices": [
        "Starting at 15 or older takes three doses across six months.",
        "Since you are under 26, two shots are plenty to wrap up your protection."
      ],
      "bestIndex": 0
    }
  ]
};
