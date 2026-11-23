# Source check, 2026-11-22

Each bank answer checked against a saved copy of its cited page. A question is marked verified only when two model
families each copied a quote that is found word for word in the page and both say it supports the answer.
Everything below is for pharmacist review. A contradiction is a finding, and no answer or wording was changed.

```
verified       ██████████████░░░░░░ 99
awaiting-b     ░░░░░░░░░░░░░░░░░░░░ 0
contradicts    ░░░░░░░░░░░░░░░░░░░░ 1
disagree       █░░░░░░░░░░░░░░░░░░░ 7
silent         ████░░░░░░░░░░░░░░░░ 28
fetch-failure  █░░░░░░░░░░░░░░░░░░░ 8
rights         ░░░░░░░░░░░░░░░░░░░░ 1
covid-rule     ░░░░░░░░░░░░░░░░░░░░ 0
missing        ░░░░░░░░░░░░░░░░░░░░ 0
total                               144
```

## Contradicts the answer (1)

### co-administration:q1

Statement: ACIP General Best Practice Guidelines confirm that all indicated routine adult vaccines can be administered during the same clinical visit.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-general-best-practices](https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html)

- **A, Claude:** contradicts
  > In patients recommended to receive both PCV13 and PPSV23, the 2 vaccines should not be administered simultaneously28. PCV13 should be administered first. If PPSV23 has been administered first, PCV13 should be administered no earlier than 8 weeks later in children 6–18 years, and one year later in adults 19 years and older.
  The source lists adult exceptions to simultaneous administration, so the claim that all indicated adult vaccines can be given at one visit is wrong.
- **B, xAI Grok:** contradicts
  > In patients recommended to receive both PCV13 and PPSV23, the 2 vaccines should not be administered simultaneously28. PCV13 should be administered first. If PPSV23 has been administered first, PCV13 should be administered no earlier than 8 weeks later in children 6–18 years, and one year later in adults 19 years and older.
  This spacing rule shows two indicated adult vaccines must not be given together, so the claim that all can is not true.

Why it is here: at least one family read the source as contradicting the answer.

## Families disagree or a quote failed (7)

### art-of-the-offer:q11

Scenario: A 67-year-old due for pneumococcal conjugate vaccination states they want to postpone until their annual physical exam six months away.  
Statement: A patient wants to put off a recommended vaccine until their next physical. What's the better reply?  
Choice 1: I will send notes to your doctor today showing we completed your recommended dose.  
Choice 2: Your doctor will just tell you the same thing, so you should just do it here.  
**Bank answer:** The best choice is: "I will send notes to your doctor today showing we completed your recommended dose."  
**Sources:** [cdc-vaccine-concerns](https://www.cdc.gov/vaccines-adults/hcp/imz-standards/index.html)

- **A, Claude:** supports
  > Participate in your state's immunization registry. Help your office, your patients, and your patients' other providers know which vaccines your patients have had.
  The CDC standard says to share vaccination records with the patient's other providers, which is the reassurance offered in the bank answer.
- **B, xAI Grok:** silent
  > Participate in your state's immunization registry. Help your office, your patients, and your patients' other providers know which vaccines your patients have had.
  The source says to share vaccine records with other providers but does not say which reply is better.

Why it is here: family A says supports, family B says silent.

### rsv:q1

Statement: ACIP recommends a single dose of RSV vaccine for all adults aged 75 years and older.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-rsv-adults-75](https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html)

- **A, Claude:** supports
  > CDC recommends a single dose of respiratory syncytial virus (RSV) vaccine for all adults ages 75 and older and adults ages 50–74 at increased risk of severe RSV illness.
  The source states a single-dose recommendation for all adults 75 and older. CDC says it develops these recommendations with ACIP.
- **B, xAI Grok:** silent
  > CDC recommends a single dose of respiratory syncytial virus (RSV) vaccine for all adults ages 75 and older and adults ages 50–74 at increased risk of severe RSV illness.
  The passage attributes the recommendation to CDC and does not state that ACIP recommends it.

Why it is here: family A says supports, family B says silent.

### season-2:q11

Statement: For heart disease patients, an annual flu shot lowers cardiac event rates.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-flu-cardiovascular](https://www.cdc.gov/flu/highrisk/heartdisease.html)

- **A, Claude:** supports
  > Flu vaccination has been associated with lower rates of some cardiac events among people with heart disease, especially among those who have had a cardiac event in the past year.
  CDC links flu vaccination with fewer cardiac events in heart patients, which backs TRUE. The source never gives the explanation's one-third figure.
- **B, xAI Grok:** silent
  > Flu vaccination has been associated with lower rates of some cardiac events among people with heart disease, especially among those who have had a cardiac event in the past year.
  An association with lower rates of some events does not establish that an annual shot lowers those rates.

Why it is here: family A says supports, family B says silent.

### tdap:q1

Statement: ACIP recommends administering a dose of Tdap during each pregnancy, preferentially between 27 and 36 weeks gestation.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-tdap-pregnancy](https://www.cdc.gov/mmwr/preview/mmwrhtml/mm6207a4.htm)

- **A, Claude:** supports
  > Health-care personnel should administer a dose of Tdap during each pregnancy, irrespective of the patient's prior history of receiving Tdap. Guidance for Use To maximize the maternal antibody response and passive antibody transfer to the infant, optimal timing for Tdap administration is between 27 and 36 weeks gestation although Tdap may be given at any time during pregnancy.
  The quote states both parts of the statement: a Tdap dose in every pregnancy and the preferred 27 to 36 week window.
- **B, xAI Grok:** silent
  > To maximize the maternal antibody response and passive antibody transfer to the infant, optimal timing for Tdap administration is between 27 and 36 weeks gestation although Tdap may be given at any time during pregnancy.
  The sentence gives the preferred weeks but not a dose recommended in every pregnancy.

Why it is here: family A says supports, family B says silent.

### vax-or-fiction:q14

Statement: In the 2024 US survey, about what share of adults 65 and older reported ever receiving a pneumococcal vaccine?  
**Bank answer:** The answer is 65%.  
**Sources:** [cdc-adult-vaccination-coverage](https://www.cdc.gov/adultvaxview/publications-resources/vaccination-coverage-adults-2024.html)

- **A, Claude:** supports
  > Coverage with ≥1 dose of a pneumococcal vaccine among all adults aged ≥65 years was 64.7%, similar to the estimate for 2023.
  The survey estimate of 64.7% rounds to about 65%, which matches the bank answer.
- **B, xAI Grok:** supports (quote discarded: not an exact substring of the snapshot)
  > NHIS data from 2024 indicated that coverage with ≥1 dose of pneumococcal vaccine was 15.8% among adults aged 19–49 years at increased risk, 19.7% among adults aged 50-64 years, and 64.7% among adults aged ≥65 years.
  The published estimate of 64.7% is about 65% and matches the bank answer.

Why it is here: both say supports but the family B quote failed the substring check.

### vax-or-fiction:q21

Scenario: Four adults at the counter, none with a reason to hold off.  
Statement: Which adult should be offered RSV vaccine today?  
Choice 1: Age 77, got an RSV vaccine last season.  
Choice 2: Age 66, has COPD, never had an RSV vaccine.  
Choice 3: Age 48, has COPD, never had an RSV vaccine.  
Choice 4: Age 66, healthy, never had an RSV vaccine.  
**Bank answer:** The best choice is: "Age 66, has COPD, never had an RSV vaccine."  
**Sources:** [t-rsv-adult](https://www.cdc.gov/rsv/hcp/vaccine-clinical-guidance/adults.html)

- **A, Claude:** supports
  > The RSV vaccine is not currently an annual vaccine, meaning eligible adults do not need to get a dose every RSV season. Currently, CDC recommends only a single dose of RSV vaccine for all adults ages 75 and older and for adults ages 50–74 with increased risk of severe RSV illness.
  This rules out the vaccinated 77-year-old, the 48-year-old and the healthy 66-year-old. The same source lists COPD as an increased-risk condition.
- **B, xAI Grok:** silent
  > The RSV vaccine is not currently an annual vaccine, meaning eligible adults do not need to get a dose every RSV season. Currently, CDC recommends only a single dose of RSV vaccine for all adults ages 75 and older and for adults ages 50–74 with increased risk of severe RSV illness.
  The passage does not name COPD, so it does not show this adult qualifies.

Why it is here: family A says supports, family B says silent.

### vax-or-fiction:q9

Statement: Exposure to one HPV type means Gardasil 9 cannot protect against the others.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-hpv-vaccination-considerations](https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html)

- **A, Claude:** supports
  > Most sexually active adults have already been exposed to HPV, although not necessarily all of the HPV types targeted by vaccination.
  CDC says exposure to HPV does not mean exposure to every vaccine-targeted type. So the vaccine can still protect against the remaining types.
- **B, xAI Grok:** silent
  > Most sexually active adults have already been exposed to HPV, although not necessarily all of the HPV types targeted by vaccination.
  It does not say the vaccine can or cannot protect against the remaining types.

Why it is here: family A says supports, family B says silent.

## Source is silent (28)

### co-administration:q5

Statement: Using presumptive bundled recommendations substantially increases patient acceptance of multiple indicated vaccines.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-general-best-practices](https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html)

- **A, Claude:** silent
  > Simultaneously administering all vaccines for which a person is eligible at the time of a visit increases the probability that a child, adolescent, or adult will be vaccinated fully by the appropriate age13.
  The source covers simultaneous administration and coverage but never mentions presumptive recommendations or how recommendation style affects patient acceptance.
- **B, xAI Grok:** silent
  > Use of combination vaccines can reduce the number of injections patients receive and alleviate concern associated with the number of injections293738. Studies have demonstrated that parents and providers might be uncomfortable with multiple injections during single visits394041.
  The page never mentions presumptive or bundled recommendations, so it does not show that they raise acceptance.

Why it is here: both families found the source silent on the answer.

### co-administration:q8

Statement: If a patient expresses hesitation regarding multiple injections, the clinician should insist on all doses or dismiss the patient without care.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-general-best-practices](https://www.cdc.gov/vaccines/hcp/imz-best-practices/timing-spacing-immunobiologics.html)

- **A, Claude:** silent
  > Although there is no exact limit on the number of injections, with a little flexibility, a provider can ensure that the primary series doses are given without administering too many injections at each visit.
  The source suggests flexibility about injection numbers but never covers handling a patient's hesitation, addressing concerns, or documenting a refusal.
- **B, xAI Grok:** silent
  > Use of combination vaccines can reduce the number of injections patients receive and alleviate concern associated with the number of injections293738. Studies have demonstrated that parents and providers might be uncomfortable with multiple injections during single visits394041.
  Nothing in the source says to insist on every dose or to dismiss a patient who hesitates.

Why it is here: both families found the source silent on the answer.

### flagship-r2:q17

Statement: Shingles involving the eye can cause permanent vision loss and is considered an ophthalmologic emergency.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-shingles-symptoms](https://www.cdc.gov/shingles/signs-symptoms/index.html)

- **A, Claude:** silent
  > Shingles on the face can affect the eye and cause vision loss.
  The source confirms eye involvement can cause vision loss. It does not say the loss is permanent or that it is an ophthalmologic emergency.
- **B, xAI Grok:** silent
  > Shingles on the face can affect the eye and cause vision loss.
  The page says face shingles can cause vision loss but not that the loss is permanent or an eye emergency.

Why it is here: both families found the source silent on the answer.

### flagship:q20

Statement: Different vaccine recommendations can help prevent infections, some cancers, and cardiac complications.  
**Bank answer:** The statement is TRUE.  
**Sources:** [who-hepatitis-b](https://www.who.int/news-room/fact-sheets/detail/hepatitis-b), [cdc-hpv-cancers](https://www.cdc.gov/hpv/about/cancers-caused-by-hpv.html), [cdc-flu-heart-disease](https://www.cdc.gov/flu/highrisk/heartdisease.html)

- **A, Claude:** silent
  > Flu vaccination has been associated with lower rates of some cardiac events among people with heart disease, especially among those who have had a cardiac event in the past year.
  The quote supports only the cardiac part. The HPV source covers infections and cancers, but no single passage establishes all three parts.
- **B, xAI Grok:** silent (quote discarded: not an exact substring of the snapshot)
  > HPV infections can cause certain cancers in men and women. HPV vaccination can prevent over 90% of cancers caused by HPV. Talk to your child's doctor about getting HPV vaccine to prevent HPV infections.
  The passage says nothing about vaccine protection against cardiac complications.

Why it is here: both families found the source silent on the answer.

### hepatitis-b:q1

Statement: ACIP recommends universal hepatitis B vaccination for all adults aged 19 through 59 years, regardless of risk factor disclosure.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-hepb-universal](https://www.cdc.gov/mmwr/volumes/71/rr/rr7101a1.htm)

- **A, Claude:** silent
  > These include AS01B (in Shingrix, recombinant zoster subunit vaccine) (119), MF59 (in Fluad Quadrivalent [aIIV4]) (120), and cytosine phosphoguanine oligodeoxynucleotide (in Heplisav-B, a recombinant hepatitis B surface antigen vaccine) (121).
  This source covers influenza vaccines. It names a hepatitis B vaccine only in passing and never covers universal adult hepatitis B vaccination for ages 19 through 59.
- **B, xAI Grok:** silent
  > In recent years, several vaccines containing nonaluminum adjuvants have been licensed for use in the United States for the prevention of various infectious diseases. These include AS01B (in Shingrix, recombinant zoster subunit vaccine) (119), MF59 (in Fluad Quadrivalent [aIIV4]) (120), and cytosine phosphoguanine oligodeoxynucleotide (in Heplisav-B, a recombinant hepatitis B surface antigen vaccine) (121). Data are limited regarding coadministration of these vaccines with other adjuvanted or nonadjuvanted vaccines, including COVID-19 vaccines.
  The passage never states whether ACIP recommends hepatitis B vaccine for all adults aged 19 through 59.

Why it is here: both families found the source silent on the answer.

### hepatitis-b:q3

Statement: Heplisav-B is an adjuvanted hepatitis B vaccine approved as a two-dose series administered one month apart for adults aged 18 and older.  
**Bank answer:** The statement is TRUE.  
**Sources:** [fda-heplisav-b](https://www.fda.gov/vaccines-blood-biologics/vaccines/heplisav-b)

- **A, Claude:** silent
  > HEPLISAV-B is indicated for prevention of infection caused by all known subtypes of hepatitis B virus. HEPLISAV-B is approved for use in adults 18 years of age and older.
  The source confirms the adult age range and the adjuvanted name, but never states the two-dose, one-month-apart schedule.
- **B, xAI Grok:** silent
  > HEPLISAV-B is indicated for prevention of infection caused by all known subtypes of hepatitis B virus. HEPLISAV-B is approved for use in adults 18 years of age and older.
  The page confirms the age approval but does not state a two-dose series or a one-month interval.

Why it is here: both families found the source silent on the answer.

### hepatitis-b:q8

Statement: Hepatitis B surface antigen-positive individuals should receive booster doses of hepatitis B vaccine annually.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-hepb-chronic](https://www.cdc.gov/hepatitis-b/hcp/clinical-overview/index.html)

- **A, Claude:** silent
  > Generally, clinicians will treat people with acute hepatitis B with supportive care depending on the symptoms. There are several antiviral medications available for chronic hepatitis B. It is important to link these patients to care with regular monitoring to prevent liver damage and/or hepatocellular carcinoma.
  The source never addresses vaccinating or boosting HBsAg-positive people, so it neither confirms nor refutes annual boosters.
- **B, xAI Grok:** silent
  > Generally, clinicians will treat people with acute hepatitis B with supportive care depending on the symptoms. There are several antiviral medications available for chronic hepatitis B. It is important to link these patients to care with regular monitoring to prevent liver damage and/or hepatocellular carcinoma.
  The passage does not address annual vaccine boosters for surface antigen-positive people.

Why it is here: both families found the source silent on the answer.

### hpv:q1

Statement: Gardasil 9 protects against seven high-risk oncogenic HPV types and two low-risk types responsible for anogenital warts.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-hpv-recs](https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html)

- **A, Claude:** silent
  > During clinical trials before the licensure, the 9-valent HPV vaccine Gardasil 9 was studied in more than 15,000 males and females and was found to be safe and effective.
  The source calls Gardasil 9 nine-valent but never names its HPV types or splits them into high-risk and wart-causing groups.
- **B, xAI Grok:** silent
  > During clinical trials before the licensure, the 9-valent HPV vaccine Gardasil 9 was studied in more than 15,000 males and females and was found to be safe and effective.
  It never names seven high-risk oncogenic types or two low-risk wart types.

Why it is here: both families found the source silent on the answer.

### hpv:q6

Statement: Adolescents who receive the HPV vaccine demonstrate higher rates of early sexual debut and decreased contraceptive adherence.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-hpv-recs](https://www.cdc.gov/hpv/hcp/vaccination-considerations/index.html)

- **A, Claude:** silent
  > Bednarczyk RA, Davis R, Ault K, et al. Sexual activity-related outcomes after human papillomavirus vaccination of 11- to 12-year-olds. Pediatrics. 2012;130(5):798-805.
  The page only lists study titles on sexual behavior. It never states whether vaccination changes sexual debut or contraceptive use.
- **B, xAI Grok:** silent
  > Bednarczyk RA, Davis R, Ault K, et al. Sexual activity-related outcomes after human papillomavirus vaccination of 11- to 12-year-olds. Pediatrics. 2012;130(5):798-805.
  A citation title states no findings on debut timing or contraceptive use.

Why it is here: both families found the source silent on the answer.

### influenza:q1

Statement: Routine annual influenza vaccination is recommended by ACIP for all individuals aged 6 months and older who lack contraindications.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-flu-recs](https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html)

- **A, Claude:** silent
  > Routine annual influenza vaccination as described in the July 2025 immunization schedule. All persons should receive an FDA-licensed age-appropriate influenza vaccine (one that is approved for their age), with the exception that solid organ transplant recipients aged 18 through 64 years who are receiving immunosuppressive medication regimens may receive either HD-IIV3 or aIIV3 as acceptable options (without a preference over other age-appropriate IIV3s or RIV3) (see Immunocompromised Persons, below).
  The page defers to the July 2025 schedule. It never names the 6 months and older universal group or attributes that recommendation to ACIP.
- **B, xAI Grok:** silent
  > Routine annual influenza vaccination as described in the July 2025 immunization schedule. All persons should receive an FDA-licensed age-appropriate influenza vaccine (one that is approved for their age), with the exception that solid organ transplant recipients aged 18 through 64 years who are receiving immunosuppressive medication regimens may receive either HD-IIV3 or aIIV3 as acceptable options (without a preference over other age-appropriate IIV3s or RIV3) (see Immunocompromised Persons, below).
  Those sentences never state an age of 6 months or older or a lack of contraindications, so they do not settle the claim.

Why it is here: both families found the source silent on the answer.

### influenza:q2

Statement: Adults aged 65 years and older are preferentially recommended to receive Fluzone High-Dose, Flublok, or adjuvanted influenza vaccine over standard-dose unadjuvanted vaccines.  
**Bank answer:** The statement is TRUE.  
**Sources:** [acip-older-adults](https://www.cdc.gov/mmwr/volumes/71/wr/mm7129a1.htm)

- **A, Claude:** silent
  > The overall cumulative hospitalization rate was 17.3 per 100,000 population, with the highest rate among adults aged ≥65 years (50.0), followed by children aged 0–4 years (21.9), adults aged 50–64 years (16.0), children and adolescents aged 5–17 years (9.0), and was lowest among adults aged 18–49 years (9.1).
  This surveillance report never mentions preferential vaccines for adults 65 and older, Fluzone High-Dose, Flublok or adjuvanted vaccines.
- **B, xAI Grok:** silent
  > For persons aged ≥6 months, receiving a seasonal influenza vaccine each year remains the best way to protect against seasonal influenza and its potentially severe consequences.
  The passage recommends a yearly flu vaccine for ages 6 months and older and does not name a preferred product for adults 65 and older.

Why it is here: both families found the source silent on the answer.

### influenza:q4

Statement: Flu shots can’t cause flu, because the virus in them is killed or is only a single protein.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-pinkbook-flu](https://www.cdc.gov/pinkbook/hcp/table-of-contents/chapter-12-influenza.html)

- **A, Claude:** silent
  > IIV has been available since the 1940s. Most influenza vaccines distributed in the United States are subvirion (split-virus) or subunit inactivated vaccines.
  The source describes inactivated and recombinant vaccine composition but never states that flu shots cannot cause influenza.
- **B, xAI Grok:** silent
  > Most influenza vaccines distributed in the United States are subvirion (split-virus) or subunit inactivated vaccines. IIV currently licensed and distributed in the United States is administered by the intramuscular route.
  The passage never says inactivated flu shots cannot cause influenza, so it does not establish the statement.

Why it is here: both families found the source silent on the answer.

### influenza:q6

Statement: Among people with heart disease, flu vaccination is linked to fewer cardiac events.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-flu-recs](https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html)

- **A, Claude:** silent
  > Adults and children who have chronic pulmonary (including asthma), cardiovascular (excluding isolated hypertension), renal, hepatic, neurologic, hematologic, or metabolic disorders (including diabetes mellitus).
  The source lists heart disease as a risk group but never says vaccination reduces cardiac events in people with heart disease.
- **B, xAI Grok:** silent
  > Adults and children who have chronic pulmonary (including asthma), cardiovascular (excluding isolated hypertension), renal, hepatic, neurologic, hematologic, or metabolic disorders (including diabetes mellitus).
  The source names heart disease as a higher risk condition but says nothing about fewer cardiac events after vaccination.

Why it is here: both families found the source silent on the answer.

### influenza:q8

Statement: Starting antiviral medications after respiratory symptom onset replaces the immunological protection provided by annual influenza vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-flu-recs](https://www.cdc.gov/flu/hcp/vax-summary/seasonal-influenza-vaccines.html)

- **A, Claude:** silent
  > Administration of any IIV3 or RIV3 to persons receiving influenza antiviral medications for treatment or chemoprophylaxis of influenza is acceptable.
  The source never says antivirals are not a substitute for vaccination. It only allows giving vaccine alongside antivirals and mentions chemoprophylaxis for people who cannot be vaccinated.
- **B, xAI Grok:** silent
  > Administration of any IIV3 or RIV3 to persons receiving influenza antiviral medications for treatment or chemoprophylaxis of influenza is acceptable.
  The source allows flu vaccine during antiviral use but does not say treatment replaces vaccine protection.

Why it is here: both families found the source silent on the answer.

### pneumococcal:q3

Statement: Prevnar 20 and Capvaxive are single-dose pneumococcal conjugate vaccines approved for adult protection without a mandatory subsequent PPSV23 dose.  
**Bank answer:** The statement is TRUE.  
**Sources:** [fda-prevnar-20](https://www.fda.gov/vaccines-blood-biologics/vaccines/prevnar-20)

- **A, Claude:** silent
  > Active immunization for the prevention of pneumonia caused by S. pneumoniae serotypes 1, 3, 4, 5, 6A, 6B, 7F, 8, 9V, 10A, 11A, 12F, 14, 15B, 18C, 19A, 19F, 22F, 23F, and 33F in individuals 18 years of age and older.
  The source covers only the Prevnar 20 indications. It does not mention Capvaxive, the single-dose schedule, or whether PPSV23 follow-up is needed.
- **B, xAI Grok:** silent
  > Active immunization for the prevention of pneumonia caused by S. pneumoniae serotypes 1, 3, 4, 5, 6A, 6B, 7F, 8, 9V, 10A, 11A, 12F, 14, 15B, 18C, 19A, 19F, 22F, 23F, and 33F in individuals 18 years of age and older.
  The page gives an adult indication but says nothing about dose count, Capvaxive, or a later PPSV23 dose.

Why it is here: both families found the source silent on the answer.

### pneumococcal:q6

Statement: An adult whose only pneumococcal vaccine was PCV13 needs no more pneumococcal vaccines.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pneumo-pcv13-transition](https://www.cdc.gov/mmwr/volumes/71/rr/rr7103a1.htm)

- **A, Claude:** silent
  The source covers opioid prescribing for pain. It never mentions PCV13, PCV20, PCV21, PPSV23 or pneumococcal vaccination, so it is the wrong source.
- **B, xAI Grok:** silent
  The cited text is an opioid prescribing guideline and never states whether adults who received only PCV13 need another pneumococcal dose.

Why it is here: both families found the source silent on the answer.

### rsv:q3

Statement: Adults aged 50 through 74 with chronic heart or lung disease qualify for RSV vaccination under ACIP guidance.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-rsv-chronic-risk](https://www.cdc.gov/mmwr/volumes/73/rr/rr7305a1.htm)

- **A, Claude:** silent
  > Examples include AS01B (in Shingrix, recombinant zoster subunit vaccine [RZV]) (120), AS01E (in Arexvy, respiratory syncytial virus vaccine) (121) MF59 (in Fluad [aIIV3]) (59), and cytosine phosphoguanine oligodeoxynucleotide (in Heplisav-B, recombinant hepatitis B surface antigen vaccine) (122).
  This is an influenza ACIP report. It mentions an RSV vaccine only as an adjuvant example and gives no RSV eligibility by age or condition.
- **B, xAI Grok:** silent
  > Examples include AS01B (in Shingrix, recombinant zoster subunit vaccine [RZV]) (120), AS01E (in Arexvy, respiratory syncytial virus vaccine) (121) MF59 (in Fluad [aIIV3]) (59), and cytosine phosphoguanine oligodeoxynucleotide (in Heplisav-B, recombinant hepatitis B surface antigen vaccine) (122).
  It only names Arexvy while discussing influenza vaccine coadministration and says nothing about who qualifies for RSV vaccination.

Why it is here: both families found the source silent on the answer.

### rsv:q6

Statement: An adult who got an RSV vaccine while sick with a fever needs a second dose later.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-general-deferral](https://www.cdc.gov/vaccines/hcp/imz-best-practices/contraindications-precautions.html)

- **A, Claude:** silent
  > The presence of a moderate or severe acute illness with or without a fever is a precaution to administration of all vaccines (Table 4-1). The decision to administer or delay vaccination because of a current or recent acute illness depends on the severity of symptoms and etiology of the condition. The safety and efficacy of vaccinating persons who have mild illnesses have been documented891011.
  The source never mentions RSV dosing or repeating a dose given during febrile illness, so it cannot establish that no second dose is needed.
- **B, xAI Grok:** silent
  > The presence of a moderate or severe acute illness with or without a fever is a precaution to administration of all vaccines (Table 4-1). The decision to administer or delay vaccination because of a current or recent acute illness depends on the severity of symptoms and etiology of the condition. The safety and efficacy of vaccinating persons who have mild illnesses have been documented891011.
  Nothing here addresses RSV or whether fever at the time of vaccination requires another dose later.

Why it is here: both families found the source silent on the answer.

### season-2:q20

Statement: Adult vaccines can help prevent throat cancers, flu-related heart attacks and whooping cough in babies.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-reasons-to-vaccinate](https://www.cdc.gov/vaccines-adults/reasons/index.html)

- **A, Claude:** silent
  > Flu vaccine also protects you from flu-related pneumonia and flu-related heart attacks or stroke—complications that can affect anyone but are especially dangerous for persons with diabetes or chronic heart or lung conditions.
  Source backs the flu heart attack part only. It never names throat cancers or mentions whooping cough, Tdap or protecting infants.
- **B, xAI Grok:** silent
  > Flu vaccine also protects you from flu-related pneumonia and flu-related heart attacks or stroke—complications that can affect anyone but are especially dangerous for persons with diabetes or chronic heart or lung conditions.
  The passage covers only flu complications and says nothing about throat cancers or whooping cough in babies.

Why it is here: both families found the source silent on the answer.

### season-2:q3

Statement: In the month after acute shingles, an adult faces higher stroke risk.  
**Bank answer:** The statement is TRUE.  
**Sources:** [cdc-shingles-overview](https://www.cdc.gov/shingles/about/index.html)

- **A, Claude:** silent
  > Shingles can lead to serious complications. The most common shingles complication is long-term nerve pain called postherpetic neuralgia, or PHN.
  The source never mentions stroke, heart attack or vascular risk after shingles, so it cannot establish the statement.
- **B, xAI Grok:** silent
  > Shingles can lead to serious complications. The most common shingles complication is long-term nerve pain called postherpetic neuralgia, or PHN.
  The page never mentions stroke or a higher risk in the month after shingles.

Why it is here: both families found the source silent on the answer.

### season-2:q4

Statement: Adults with diabetes face the same pneumococcal disease risk as others.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pneumo-recommendations](https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html)

- **A, Claude:** silent
  > CDC also recommends pneumococcal vaccination for children and adults at increased risk for pneumococcal disease.
  The source never names diabetes or gives rates for it, so it cannot show diabetes raises pneumococcal risk.
- **B, xAI Grok:** silent
  > CDC also recommends pneumococcal vaccination for children and adults at increased risk for pneumococcal disease.
  Nothing here names diabetes or compares disease risk for adults with diabetes and other adults.

Why it is here: both families found the source silent on the answer.

### season-2:q6

Statement: Recovering from COVID-19 provides durable immunity replacing vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-covid-vaccines-faq](https://www.cdc.gov/covid/hcp/vaccine-considerations/index.html)

- **A, Claude:** silent
  > A 2026-2027 COVID-19 vaccine is recommended for all adults ages 18 years and older in the United States for the prevention of COVID-19.
  The source never mentions prior infection or how long immunity lasts after infection, so it cannot establish that recovery fails to replace vaccination.
- **B, xAI Grok:** silent
  > A 2026-2027 COVID-19 vaccine is recommended for all adults ages 18 years and older in the United States for the prevention of COVID-19.
  The page recommends the vaccine for all adults but says nothing about immunity after recovering from COVID-19.

Why it is here: both families found the source silent on the answer.

### shingles:q7

Statement: Expected temporary reactogenicity such as injection site soreness, fatigue, and myalgia warrants canceling the second Shingrix dose.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-shingrix-schedule](https://www.cdc.gov/shingles/hcp/vaccine-considerations/index.html)

- **A, Claude:** silent
  > Contraindications and precautions to vaccination generally dictate circumstances when vaccines will not be given.
  The source never covers reactogenicity after dose one or whether it affects the second dose. It only points to separate contraindication pages.
- **B, xAI Grok:** silent
  No passage addresses whether soreness, fatigue, or myalgia should cancel dose two.

Why it is here: both families found the source silent on the answer.

### tdap:q6

Statement: Immunizing household contacts (cocooning) provides infants with greater clinical protection against severe pertussis than maternal vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-tdap-pregnancy](https://www.cdc.gov/mmwr/preview/mmwrhtml/mm6207a4.htm)

- **A, Claude:** silent
  > The model showed that Tdap vaccination during pregnancy would prevent more infant cases, hospitalizations, and deaths compared with the postpartum dose (11).
  It compares prenatal vaccination only with a postpartum maternal dose. It does not compare it with vaccinating all household contacts, so it cannot settle cocooning.
- **B, xAI Grok:** silent
  > The model showed that Tdap vaccination during pregnancy would prevent more infant cases, hospitalizations, and deaths compared with the postpartum dose (11).
  The comparison is with a postpartum dose, not household cocooning versus maternal vaccination.

Why it is here: both families found the source silent on the answer.

### tdap:q7

Statement: Tdap vaccine may be used interchangeably whenever a decennial Td booster or tetanus wound prophylaxis is indicated.  
**Bank answer:** The statement is TRUE.  
**Sources:** [acip-wound-mgmt](https://www.cdc.gov/tetanus/hcp/clinical-guidance/index.html)

- **A, Claude:** silent
  > Tetanus vaccination and/or tetanus immune globulin (TIG) prophylaxis may be indicated depending on the wound type and patient’s vaccination history.
  The page mentions tetanus vaccination in general terms. It never names Tdap or Td or says one can replace the other.
- **B, xAI Grok:** silent
  > Tetanus vaccination and/or tetanus immune globulin (TIG) prophylaxis may be indicated depending on the wound type and patient’s vaccination history.
  The page does not say Tdap may replace Td for a routine booster or wound prophylaxis.

Why it is here: both families found the source silent on the answer.

### vax-or-fiction:q1

Statement: Prevnar 20 and Capvaxive protect only against pneumonia.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-pneumococcal-disease](https://www.cdc.gov/pneumococcal/about/index.html), [cdc-pneumococcal-recommendations](https://www.cdc.gov/pneumococcal/hcp/vaccine-recommendations/index.html)

- **A, Claude:** silent
  > S. pneumoniae bacteria can cause many types of infections, including: Pneumonia (lung infection) Meningitis (infection of the lining of the brain and spinal cord) Bacteremia (bloodstream infection)
  The quote shows the disease goes beyond pneumonia. No single passage names Prevnar 20 or Capvaxive or says what these vaccines protect against.
- **B, xAI Grok:** silent
  > S. pneumoniae bacteria can cause many types of infections, including: Pneumonia (lung infection) Meningitis (infection of the lining of the brain and spinal cord) Bacteremia (bloodstream infection) Otitis media (middle ear infection) Sinusitis (sinus infection)
  The passage never says what Prevnar 20 or Capvaxive protect against.

Why it is here: both families found the source silent on the answer.

### vax-or-fiction:q12

Statement: Adults should wait for hepatitis B blood-test results before starting vaccination.  
**Bank answer:** The statement is FALSE.  
**Sources:** [cdc-hepatitis-b-vaccine-administration](https://www.cdc.gov/hepatitis-b/hcp/vaccine-administration/index.html)

- **A, Claude:** silent
  > For testing recommendations and assistance interpreting B screening results, see hepatitis B testing guidelines.
  The page refers testing questions elsewhere. It never says whether vaccination should wait for blood-test results.
- **B, xAI Grok:** silent
  > For testing recommendations and assistance interpreting B screening results, see hepatitis B testing guidelines.
  The page points to other testing guidelines and does not say whether vaccination should wait for blood results.

Why it is here: both families found the source silent on the answer.

### vax-or-fiction:q15

Statement: What's the order for a practical vaccine conversation?  
**Bank answer:** The correct order is: (1) Check the record and recommendations (2) Make a clear recommendation and address questions (3) Administer if indicated, or refer (4) Document and follow up  
**Sources:** [cdc-adult-standards-recommend](https://www.cdc.gov/vaccines-adults/hcp/imz-standards/index.html)

- **A, Claude:** silent
  > CDC encourages all health care professionals to implement these standards into their practice 1. Assess the immunization status of all your patients at every clinical encounter.
  The source lists all four steps in the bank's order, but they sit in separate passages. No passage of three sentences or fewer gives the full order.
- **B, xAI Grok:** silent
  > 1. Assess the immunization status of all your patients at every clinical encounter. Your patients' vaccination needs will change over time based on factors such as age, health conditions, lifestyle, travel, and occupation.
  The passage covers only assessment and does not lay out the full four step order.

Why it is here: both families found the source silent on the answer.

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
