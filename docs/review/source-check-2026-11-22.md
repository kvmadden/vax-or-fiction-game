# Source check, 2026-11-22

Each bank answer checked against a saved copy of its cited page. A question is marked verified only when two model
families each copied a quote that is found word for word in the page and both say it supports the answer.
Everything below is for pharmacist review. A contradiction is a finding, and no answer or wording was changed.

```
verified       ░░░░░░░░░░░░░░░░░░░░ 0
awaiting-b     ███████████████░░░░░ 106
contradicts    ░░░░░░░░░░░░░░░░░░░░ 1
disagree       ░░░░░░░░░░░░░░░░░░░░ 0
silent         ████░░░░░░░░░░░░░░░░ 28
fetch-failure  █░░░░░░░░░░░░░░░░░░░ 8
rights         ░░░░░░░░░░░░░░░░░░░░ 1
missing        ░░░░░░░░░░░░░░░░░░░░ 0
total                               144
```

Family B has not run yet. 106 questions have a verified family A quote that supports the answer and need family B before they count:

`art-of-the-offer:q1`, `art-of-the-offer:q10`, `art-of-the-offer:q11`, `art-of-the-offer:q12`, `art-of-the-offer:q13`, `art-of-the-offer:q14`, `art-of-the-offer:q15`, `art-of-the-offer:q16`, `art-of-the-offer:q18`, `art-of-the-offer:q19`, `art-of-the-offer:q2`, `art-of-the-offer:q20`, `art-of-the-offer:q4`, `art-of-the-offer:q5`, `art-of-the-offer:q6`, `art-of-the-offer:q7`, `art-of-the-offer:q8`, `co-administration:q2`, `co-administration:q3`, `co-administration:q4`, `co-administration:q7`, `flagship:q1`, `flagship:q10`, `flagship:q13`, `flagship:q14`, `flagship:q19`, `flagship:q8`, `flagship:q9`, `hepatitis-b:q2`, `hepatitis-b:q4`, `hepatitis-b:q5`, `hepatitis-b:q6`, `hepatitis-b:q7`, `hpv:q2`, `hpv:q3`, `hpv:q4`, `hpv:q5`, `hpv:q7`, `hpv:q8`, `influenza:q3`, `influenza:q5`, `influenza:q7`, `pneumococcal:q1`, `pneumococcal:q4`, `pneumococcal:q5`, `pneumococcal:q7`, `rsv:q1`, `rsv:q2`, `rsv:q4`, `rsv:q5`, `rsv:q8`, `season-2:q1`, `season-2:q10`, `season-2:q11`, `season-2:q12`, `season-2:q13`, `season-2:q14`, `season-2:q15`, `season-2:q16`, `season-2:q17`, `season-2:q18`, `season-2:q19`, `season-2:q2`, `season-2:q5`, `season-2:q9`, `shingles:q1`, `shingles:q2`, `shingles:q3`, `shingles:q4`, `shingles:q5`, `tdap:q1`, `tdap:q2`, `tdap:q3`, `tdap:q4`, `tdap:q5`, `tdap:q8`, `vax-or-fiction:q11`, `vax-or-fiction:q13`, `vax-or-fiction:q14`, `vax-or-fiction:q16`, `vax-or-fiction:q17`, `vax-or-fiction:q18`, `vax-or-fiction:q19`, `vax-or-fiction:q2`, `vax-or-fiction:q20`, `vax-or-fiction:q21`, `vax-or-fiction:q22`, `vax-or-fiction:q23`, `vax-or-fiction:q24`, `vax-or-fiction:q25`, `vax-or-fiction:q26`, `vax-or-fiction:q27`, `vax-or-fiction:q28`, `vax-or-fiction:q29`, `vax-or-fiction:q3`, `vax-or-fiction:q30`, `vax-or-fiction:q31`, `vax-or-fiction:q32`, `vax-or-fiction:q33`, `vax-or-fiction:q35`, `vax-or-fiction:q36`, `vax-or-fiction:q4`, `vax-or-fiction:q6`, `vax-or-fiction:q7`, `vax-or-fiction:q8`, `vax-or-fiction:q9`

## Contradicts the answer (1)

### co-administration:q1

Statement: ACIP General Best Practice Guidelines confirm that all indicated routine adult vaccines can be administered during the same clinical visit.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-general-best-practices](https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html)

- **A, Claude:** contradicts
  > In patients recommended to receive both PCV13 and PPSV23, the 2 vaccines should not be administered simultaneously28. PCV13 should be administered first. If PPSV23 has been administered first, PCV13 should be administered no earlier than 8 weeks later in children 6–18 years, and one year later in adults 19 years and older.
  The source lists adult exceptions to simultaneous administration, so the claim that all indicated adult vaccines can be given at one visit is wrong.
- **B, Codex:** no answer

Why it is here: family A read the source as contradicting the answer. Family B has not run.

## Source is silent (28)

### co-administration:q5

Statement: Using presumptive bundled recommendations substantially increases patient acceptance of multiple indicated vaccines.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-general-best-practices](https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html)

- **A, Claude:** silent
  > Simultaneously administering all vaccines for which a person is eligible at the time of a visit increases the probability that a child, adolescent, or adult will be vaccinated fully by the appropriate age13.
  The source covers simultaneous administration and coverage but never mentions presumptive recommendations or how recommendation style affects patient acceptance.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### co-administration:q8

Statement: If a patient expresses hesitation regarding multiple injections, the clinician should insist on all doses or dismiss the patient without care.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-general-best-practices](https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html)

- **A, Claude:** silent
  > Although there is no exact limit on the number of injections, with a little flexibility, a provider can ensure that the primary series doses are given without administering too many injections at each visit.
  The source suggests flexibility about injection numbers but never covers handling a patient's hesitation, addressing concerns, or documenting a refusal.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### flagship-r2:q17

Statement: Shingles involving the eye can cause permanent vision loss and is considered an ophthalmologic emergency.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-shingles-symptoms](https://www.cdc.gov/shingles/signs-symptoms/index.html)

- **A, Claude:** silent
  > Shingles on the face can affect the eye and cause vision loss.
  The source confirms eye involvement can cause vision loss. It does not say the loss is permanent or that it is an ophthalmologic emergency.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### flagship:q20

Statement: Different vaccine recommendations can help prevent infections, some cancers, and cardiac complications.  
**Bank answer:** The statement is TRUE.  
**Sources:** [who-hepatitis-b](https://www.who.int/news-room/fact-sheets/detail/hepatitis-b), [cdc-hpv-cancers](https://www.cdc.gov/hpv/about/cancers-caused-by-hpv.html), [cdc-flu-heart-disease](https://www.cdc.gov/flu/highrisk/heartdisease.html)

- **A, Claude:** silent
  > Flu vaccination has been associated with lower rates of some cardiac events among people with heart disease, especially among those who have had a cardiac event in the past year.
  The quote supports only the cardiac part. The HPV source covers infections and cancers, but no single passage establishes all three parts.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### hepatitis-b:q1

Statement: ACIP recommends universal hepatitis B vaccination for all adults aged 19 through 59 years, regardless of risk factor disclosure.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-hepb-universal](https://www.cdc.gov/mmwr/volumes/71/rr/rr7101a1.htm)

- **A, Claude:** silent
  > These include AS01B (in Shingrix, recombinant zoster subunit vaccine) (119), MF59 (in Fluad Quadrivalent [aIIV4]) (120), and cytosine phosphoguanine oligodeoxynucleotide (in Heplisav-B, a recombinant hepatitis B surface antigen vaccine) (121).
  This source covers influenza vaccines. It names a hepatitis B vaccine only in passing and never covers universal adult hepatitis B vaccination for ages 19 through 59.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### hepatitis-b:q3

Statement: Heplisav-B is an adjuvanted hepatitis B vaccine approved as a two-dose series administered one month apart for adults aged 18 and older.  
**Bank answer:** The statement is TRUE.  
**Sources:** [fda-heplisav-b](https://www.fda.gov/vaccines-blood-biologics/vaccines/heplisav-b)

- **A, Claude:** silent
  > HEPLISAV-B is indicated for prevention of infection caused by all known subtypes of hepatitis B virus. HEPLISAV-B is approved for use in adults 18 years of age and older.
  The source confirms the adult age range and the adjuvanted name, but never states the two-dose, one-month-apart schedule.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### hepatitis-b:q8

Statement: Hepatitis B surface antigen-positive individuals should receive booster doses of hepatitis B vaccine annually.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-hepb-chronic](https://www.cdc.gov/hepatitis-b/hcp/clinical-overview/index.html)

- **A, Claude:** silent
  > Generally, clinicians will treat people with acute hepatitis B with supportive care depending on the symptoms. There are several antiviral medications available for chronic hepatitis B. It is important to link these patients to care with regular monitoring to prevent liver damage and/or hepatocellular carcinoma.
  The source never addresses vaccinating or boosting HBsAg-positive people, so it neither confirms nor refutes annual boosters.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### hpv:q1

Statement: Gardasil 9 protects against seven high-risk oncogenic HPV types and two low-risk types responsible for anogenital warts.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-hpv-recs](https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html)

- **A, Claude:** silent
  > During clinical trials before the licensure, the 9-valent HPV vaccine Gardasil 9 was studied in more than 15,000 males and females and was found to be safe and effective.
  The source calls Gardasil 9 nine-valent but never names its HPV types or splits them into high-risk and wart-causing groups.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### hpv:q6

Statement: Adolescents who receive the HPV vaccine demonstrate higher rates of early sexual debut and decreased contraceptive adherence.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-hpv-recs](https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html)

- **A, Claude:** silent
  > Bednarczyk RA, Davis R, Ault K, et al. Sexual activity-related outcomes after human papillomavirus vaccination of 11- to 12-year-olds. Pediatrics. 2012;130(5):798-805.
  The page only lists study titles on sexual behavior. It never states whether vaccination changes sexual debut or contraceptive use.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### influenza:q1

Statement: Routine annual influenza vaccination is recommended by ACIP for all individuals aged 6 months and older who lack contraindications.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-flu-recs](https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html)

- **A, Claude:** silent
  > Routine annual influenza vaccination as described in the July 2025 immunization schedule. All persons should receive an FDA-licensed age-appropriate influenza vaccine (one that is approved for their age), with the exception that solid organ transplant recipients aged 18 through 64 years who are receiving immunosuppressive medication regimens may receive either HD-IIV3 or aIIV3 as acceptable options (without a preference over other age-appropriate IIV3s or RIV3) (see Immunocompromised Persons, below).
  The page defers to the July 2025 schedule. It never names the 6 months and older universal group or attributes that recommendation to ACIP.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### influenza:q2

Statement: Adults aged 65 years and older are preferentially recommended to receive Fluzone High-Dose, Flublok, or adjuvanted influenza vaccine over standard-dose unadjuvanted vaccines.  
**Bank answer:** The statement is TRUE.  
**Sources:** [acip-older-adults](https://www.cdc.gov/mmwr/volumes/71/wr/mm7129a1.htm)

- **A, Claude:** silent
  > The overall cumulative hospitalization rate was 17.3 per 100,000 population, with the highest rate among adults aged ≥65 years (50.0), followed by children aged 0–4 years (21.9), adults aged 50–64 years (16.0), children and adolescents aged 5–17 years (9.0), and was lowest among adults aged 18–49 years (9.1).
  This surveillance report never mentions preferential vaccines for adults 65 and older, Fluzone High-Dose, Flublok or adjuvanted vaccines.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### influenza:q4

Statement: Flu shots can’t cause flu, because the virus in them is killed or is only a single protein.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-pinkbook-flu](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-12-influenza.html)

- **A, Claude:** silent
  > IIV has been available since the 1940s. Most influenza vaccines distributed in the United States are subvirion (split-virus) or subunit inactivated vaccines.
  The source describes inactivated and recombinant vaccine composition but never states that flu shots cannot cause influenza.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### influenza:q6

Statement: Among people with heart disease, flu vaccination is linked to fewer cardiac events.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-flu-recs](https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html)

- **A, Claude:** silent
  > Adults and children who have chronic pulmonary (including asthma), cardiovascular (excluding isolated hypertension), renal, hepatic, neurologic, hematologic, or metabolic disorders (including diabetes mellitus).
  The source lists heart disease as a risk group but never says vaccination reduces cardiac events in people with heart disease.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### influenza:q8

Statement: Starting antiviral medications after respiratory symptom onset replaces the immunological protection provided by annual influenza vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-flu-recs](https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html)

- **A, Claude:** silent
  > Administration of any IIV3 or RIV3 to persons receiving influenza antiviral medications for treatment or chemoprophylaxis of influenza is acceptable.
  The source never says antivirals are not a substitute for vaccination. It only allows giving vaccine alongside antivirals and mentions chemoprophylaxis for people who cannot be vaccinated.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### pneumococcal:q3

Statement: Prevnar 20 and Capvaxive are single-dose pneumococcal conjugate vaccines approved for adult protection without a mandatory subsequent PPSV23 dose.  
**Bank answer:** The statement is TRUE.  
**Sources:** [fda-prevnar-20](https://www.fda.gov/vaccines-blood-biologics/vaccines/prevnar-20)

- **A, Claude:** silent
  > Active immunization for the prevention of pneumonia caused by S. pneumoniae serotypes 1, 3, 4, 5, 6A, 6B, 7F, 8, 9V, 10A, 11A, 12F, 14, 15B, 18C, 19A, 19F, 22F, 23F, and 33F in individuals 18 years of age and older.
  The source covers only the Prevnar 20 indications. It does not mention Capvaxive, the single-dose schedule, or whether PPSV23 follow-up is needed.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### pneumococcal:q6

Statement: An adult whose only pneumococcal vaccine was PCV13 needs no more pneumococcal vaccines.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pneumo-pcv13-transition](https://www.cdc.gov/mmwr/volumes/71/rr/rr7103a1.htm)

- **A, Claude:** silent
  The source covers opioid prescribing for pain. It never mentions PCV13, PCV20, PCV21, PPSV23 or pneumococcal vaccination, so it is the wrong source.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### rsv:q3

Statement: Adults aged 50 through 74 with chronic heart or lung disease qualify for RSV vaccination under ACIP guidance.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-rsv-chronic-risk](https://www.cdc.gov/mmwr/volumes/73/rr/rr7305a1.htm)

- **A, Claude:** silent
  > Examples include AS01B (in Shingrix, recombinant zoster subunit vaccine [RZV]) (120), AS01E (in Arexvy, respiratory syncytial virus vaccine) (121) MF59 (in Fluad [aIIV3]) (59), and cytosine phosphoguanine oligodeoxynucleotide (in Heplisav-B, recombinant hepatitis B surface antigen vaccine) (122).
  This is an influenza ACIP report. It mentions an RSV vaccine only as an adjuvant example and gives no RSV eligibility by age or condition.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### rsv:q6

Statement: An adult who got an RSV vaccine while sick with a fever needs a second dose later.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-general-deferral](https://www.cdc.gov/vaccines/hcp/imz-best-practices/contraindications-precautions.html)

- **A, Claude:** silent
  > The presence of a moderate or severe acute illness with or without a fever is a precaution to administration of all vaccines (Table 4-1). The decision to administer or delay vaccination because of a current or recent acute illness depends on the severity of symptoms and etiology of the condition. The safety and efficacy of vaccinating persons who have mild illnesses have been documented891011.
  The source never mentions RSV dosing or repeating a dose given during febrile illness, so it cannot establish that no second dose is needed.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### season-2:q20

Statement: Adult vaccines can help prevent throat cancers, flu-related heart attacks and whooping cough in babies.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-reasons-to-vaccinate](https://www.cdc.gov/vaccines-adults/reasons/index.html)

- **A, Claude:** silent
  > Flu vaccine also protects you from flu-related pneumonia and flu-related heart attacks or stroke—complications that can affect anyone but are especially dangerous for persons with diabetes or chronic heart or lung conditions.
  Source backs the flu heart attack part only. It never names throat cancers or mentions whooping cough, Tdap or protecting infants.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### season-2:q3

Statement: In the month after acute shingles, an adult faces higher stroke risk.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-shingles-overview](https://www.cdc.gov/shingles/about/index.html)

- **A, Claude:** silent
  > Shingles can lead to serious complications. The most common shingles complication is long-term nerve pain called postherpetic neuralgia, or PHN.
  The source never mentions stroke, heart attack or vascular risk after shingles, so it cannot establish the statement.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### season-2:q4

Statement: Adults with diabetes face the same pneumococcal disease risk as others.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pneumo-recommendations](https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html)

- **A, Claude:** silent
  > CDC also recommends pneumococcal vaccination for children and adults at increased risk for pneumococcal disease.
  The source never names diabetes or gives rates for it, so it cannot show diabetes raises pneumococcal risk.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### season-2:q6

Statement: Recovering from COVID-19 provides durable immunity replacing vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-covid-vaccines-faq](https://www.cdc.gov/covid/hcp/vaccine-considerations/index.html)

- **A, Claude:** silent
  > A 2026-2027 COVID-19 vaccine is recommended for all adults ages 18 years and older in the United States for the prevention of COVID-19.
  The source never mentions prior infection or how long immunity lasts after infection, so it cannot establish that recovery fails to replace vaccination.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### shingles:q7

Statement: Expected temporary reactogenicity such as injection site soreness, fatigue, and myalgia warrants canceling the second Shingrix dose.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-shingrix-schedule](https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html)

- **A, Claude:** silent
  > Contraindications and precautions to vaccination generally dictate circumstances when vaccines will not be given.
  The source never covers reactogenicity after dose one or whether it affects the second dose. It only points to separate contraindication pages.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### tdap:q6

Statement: Immunizing household contacts (cocooning) provides infants with greater clinical protection against severe pertussis than maternal vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-tdap-pregnancy](https://www.cdc.gov/mmwr/preview/mmwrhtml/mm6207a4.htm)

- **A, Claude:** silent
  > The model showed that Tdap vaccination during pregnancy would prevent more infant cases, hospitalizations, and deaths compared with the postpartum dose (11).
  It compares prenatal vaccination only with a postpartum maternal dose. It does not compare it with vaccinating all household contacts, so it cannot settle cocooning.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### tdap:q7

Statement: Tdap vaccine may be used interchangeably whenever a decennial Td booster or tetanus wound prophylaxis is indicated.  
**Bank answer:** The statement is TRUE.  
**Sources:** [acip-wound-mgmt](https://www.cdc.gov/tetanus/hcp/clinical-guidance/index.html)

- **A, Claude:** silent
  > Tetanus vaccination and/or tetanus immune globulin (TIG) prophylaxis may be indicated depending on the wound type and patient’s vaccination history.
  The page mentions tetanus vaccination in general terms. It never names Tdap or Td or says one can replace the other.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### vax-or-fiction:q1

Statement: Prevnar 20 and Capvaxive protect only against pneumonia.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pneumococcal-disease](https://www.cdc.gov/pneumococcal/about/index.html), [cdc-pneumococcal-recommendations](https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html)

- **A, Claude:** silent
  > S. pneumoniae bacteria can cause many types of infections, including: Pneumonia (lung infection) Meningitis (infection of the lining of the brain and spinal cord) Bacteremia (bloodstream infection)
  The quote shows the disease goes beyond pneumonia. No single passage names Prevnar 20 or Capvaxive or says what these vaccines protect against.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### vax-or-fiction:q12

Statement: Adults should wait for hepatitis B blood-test results before starting vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-hepatitis-b-vaccine-administration](https://www.cdc.gov/hepatitis-b/hcp/vaccine-administration/index.html)

- **A, Claude:** silent
  > For testing recommendations and assistance interpreting B screening results, see hepatitis B testing guidelines.
  The page refers testing questions elsewhere. It never says whether vaccination should wait for blood-test results.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

### vax-or-fiction:q15

Statement: What's the order for a practical vaccine conversation?  
**Bank answer:** The correct order is: (1) Check the record and recommendations (2) Make a clear recommendation and address questions (3) Administer if indicated, or refer (4) Document and follow up  
**Sources:** [cdc-adult-standards-recommend](https://www.cdc.gov/vaccines-adults/hcp/imz-standards/index.html)

- **A, Claude:** silent
  > CDC encourages all health care professionals to implement these standards into their practice 1. Assess the immunization status of all your patients at every clinical encounter.
  The source lists all four steps in the bank's order, but they sit in separate passages. No passage of three sentences or fewer gives the full order.
- **B, Codex:** no answer

Why it is here: family A found the source silent. Family B has not run.

## Source could not be fetched (8)

### flagship:q17

Statement: The first successful vaccine was demonstrated decades before germ theory was firmly established.  
**Bank answer:** The statement is TRUE.  
**Sources:** [who-smallpox-history](https://www.who.int/news-room/spotlight/history-of-vaccination/history-of-smallpox-vaccination), [nlm-germ-theory-history](https://lhncbc.nlm.nih.gov/LHC-publications/PDF/pub2002042.pdf) (not fetched: PDF. This repo has no PDF text extractor, so no text was saved)

Why it is here: a cited source could not be fetched.

### pneumococcal:q8

Statement: Pneumococcal conjugate vaccines contain live attenuated bacteria that can cause bacterial pneumonia in frail patients.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pneumo-vaccine-composition](https://www.fda.gov/media/149987/download) (not fetched: PDF. This repo has no PDF text extractor, so no text was saved)

Why it is here: a cited source could not be fetched.

### rsv:q7

Statement: Arexvy and Abrysvo are recombinant protein subunit vaccines that do not contain live virus.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-rsv-vaccine-composition](https://www.fda.gov/media/167805/download) (not fetched: PDF. This repo has no PDF text extractor, so no text was saved)

Why it is here: a cited source could not be fetched.

### shingles:q6

Statement: Shingrix contains live attenuated varicella-zoster virus that can reactivate and cause secondary shingles rash.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pinkbook-zoster](https://www.fda.gov/media/108597/download) (not fetched: PDF. This repo has no PDF text extractor, so no text was saved)

Why it is here: a cited source could not be fetched.

### shingles:q8

Statement: Shingrix should be administered via subcutaneous injection in the upper outer triceps area rather than intramuscularly.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pinkbook-zoster](https://www.fda.gov/media/108597/download) (not fetched: PDF. This repo has no PDF text extractor, so no text was saved)

Why it is here: a cited source could not be fetched.

### vax-or-fiction:q10

Statement: An adult hepatitis B vaccine series can take one month and help prevent liver cancer.  
**Bank answer:** The statement is TRUE.  
**Sources:** [fda-heplisav-b-label](https://www.fda.gov/media/108745/download) (not fetched: PDF. This repo has no PDF text extractor, so no text was saved), [who-hepatitis-b](https://www.who.int/news-room/fact-sheets/detail/hepatitis-b)

Why it is here: a cited source could not be fetched.

### vax-or-fiction:q34

Statement: In its first season, how well did the RSV vaccine keep adults 60 and older out of the hospital?  
**Bank answer:** The answer is 80%.  
**Sources:** [rsv-vision-2024](https://pubmed.ncbi.nlm.nih.gov/39426837/) (not fetched: HTTP 203)

Why it is here: a cited source could not be fetched.

### vax-or-fiction:q5

Statement: Older adults hospitalized with RSV rarely need intensive care.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-rsv-hospitalized-adults](https://www.cdc.gov/mmwr/volumes/72/wr/pdfs/mm7240a1-H.pdf) (not fetched: PDF. This repo has no PDF text extractor, so no text was saved)

Why it is here: a cited source could not be fetched.

## Source text not committed (not public domain) (1)

### season-2:q7

Statement: In 1980, smallpox was declared eradicated through global vaccination.  
**Bank answer:** The statement is TRUE.  
**Sources:** [who-smallpox-history](https://www.who.int/news-room/spotlight/history-of-vaccination/history-of-smallpox-vaccination)

Why it is here: a cited source is not public domain, so its text is not committed.
