# Anomia training: what the research says, and what it means for the glasses

> **Status (ORCH, Sun Oct 18):** reference material from the AI lane (Sam, issue #125). No task, no contract change.
> Steps 2-3 have been letters-first since D18, Step 3 is "Conversation" and **ships off** (D20).
> Before quoting any figure in public (Devpost, video, slides), **check it against the primary paper**: some figures here are second-hand, as marked.

_For: GLASS lane (Sarah). From: AI lane (Sam). Oct 18, 2026._
_Purpose: a short evidence base for the cue ladder and the glasses flows (Steps 1–3). It's reference material, not a task card; nothing here changes the current contract._

## TL;DR for the glasses

1. **Keep least-help-first.** The letters-first ladder (`s _ _ _ _` → `s u n _ _` → `sunny`) matches how clinicians cue, and making the user try to retrieve the word builds more learning than just showing it. The full word at the last rung is fine; it isn't harmful.
2. **Practised words improve; untrained words and conversation mostly don't.** That is the best argument for Nudge: cue the person's *own* words, *inside* real conversations. It's also why the personal word list matters.
3. **Dose and spacing matter.** Studies that work use roughly 20–50 hours in total, much of it home practice, spaced out over time. Practice mode should space repeats of the same word, not drill it back to back.
4. **Written first-letter cues work for some people, not all.** The glasses can't play sounds, so letters are what we can offer, but expect individual differences. A mouth-shape (articulation) cue may help some users later.
5. **Log the ladder.** Which rung a person needed, and how fast, is a natural measure of progress (clinical studies track response time too).

## Evidence summary

| Topic | Finding | Source (strength) |
|---|---|---|
| Therapy works | Speech and language therapy improves functional communication, reading, writing and expressive language versus no therapy. No single approach is proven better than another. | Brady et al., Cochrane 2016; 57 trials, 3,002 people (systematic review) |
| How much | The biggest language gains came with about 20–50 hours in total, frequent sessions and prescribed home practice, above typical clinical service levels. The authors call these findings exploratory. | RELEASE Collaborators, *Stroke* 2022; 959 people, 25 trials (individual participant data network meta-analysis) |
| Intensity in chronic aphasia | 10+ hours a week for 3 weeks improved everyday verbal communication, and the gains held at 6 months. | Breitenstein et al., *Lancet* 2017, FCET2EC; n = 156 (randomised trial) |
| Clinics fall short | The median US outpatient episode was 7.5 hours over 10 sessions; published studies used a median of 20 hours. | Cavanaugh et al., *AJSLP* 2021 (billing data from one provider plus a literature review) |
| Home practice on a device | Self-managed computer word-finding therapy (about 28 hours of practice) improved naming of practised words by 16 percentage points over usual care, and the gain held at 12 months. **Conversation did not improve.** | Palmer et al., *Health Technol Assess* 2020, Big CACTUS; n = 278 (randomised trial) |
| Trained vs untrained words | Large effects on treated words (effect size about 2.7) and small effects on untreated words (about 0.4). | Wisenburn & Mahoney, *Aphasiology* 2009; 44 studies (meta-analysis; figures as reported by Kendall et al. 2015) |
| Semantic vs sound-based treatment | Neither treatment beat the other on untrained words at 3 months. Both improved naming of practised words, and only the semantic treatment made responses faster. | Kendall et al., *JSLHR* 2019; n = 58 (randomised trial) |
| Semantic feature analysis | Improves naming of trained items; generalisation to untrained items is weak. | Quique, Evans & Dickey, *AJSLP* 2019 (meta-analysis of 12 studies, 35 people) |
| Retrieval vs repetition | Trying to retrieve a word (retrieval practice) beat errorless repetition, and spaced practice beat massed practice. | Middleton et al., *JSLHR* 2016; n = 4 (small within-person study; promising) |
| Errorless vs errorful learning | About equal at the group level, with individual differences. Feedback may matter. | Fillingham, Hodgson, Sage & Lambon Ralph 2003–2006 (review plus studies) |
| Letter cues | A written first letter can trigger the spoken word for some people. Others can't turn a letter into a sound, so the cue doesn't help them. | Howard & Harding, *Aphasiology* 1998 (single case); Bruce & Howard 1988 (n = 20) |
| Brain changes | Anomia treatment with sound (phonemic) cueing improved naming accuracy and speed in chronic aphasia (n = 18), with gains kept at 3 months. | Nardo et al., *Brain* 2017 (fMRI treatment study) |
| Dementia | Word-finding trouble in about 50% of people with mild to moderate Alzheimer's, and over 80% at the severe stage. | Badalova, Stott & Leff, *npj Dementia* 2026 (systematic review) |
| Progressive aphasia | Naming of trained items improves and can be kept with ongoing practice. Evidence of carry-over to connected speech is thin. | Cadorio et al. 2017 (systematic review; summarised second-hand) |

## Design implications, by flow

**Step 1 (Practice)**
- Space repeats of the same target across the session, not back to back (Middleton 2016).
- Instant ✓/✗ feedback is consistent with errorful learning with feedback; keep it.
- Practice volume is the lever (RELEASE, Big CACTUS): make it easy to start a short session, and count minutes practised.

**Step 2 (Assist)**
- Least help first: L1 first letter + blanks, a tap reveals more, L3 is the whole word. This matches cueing hierarchies, and the user does the retrieving (Middleton 2016).
- Swipe to the next guess rather than showing all three at once, so the cue stays minimal and quiet.
- Prioritise personal words (names, medications, places): gains are word-specific (Wisenburn & Mahoney, Kendall, Big CACTUS).

**Step 3 (Ambient)**
- Offering help without a tap is the most direct answer to the Big CACTUS gap: practice alone didn't reach conversation. This is a **hypothesis** for our pilot, not an established result.
- Be conservative: too many automatic cues remove the person's chance to retrieve the word themselves.

**Later, not now**
- Some users can't turn a letter into a sound (Bruce & Howard 1988). A mouth-shape cue could be an option per user, and a clinician might set each user's starting rung.
- Logging which rung was needed and how long it took gives a progress measure. Kendall 2019 used response time as an outcome.

## Caveats

- Most anomia studies are small, and some of the figures here are reported second-hand (marked above). Cite the primary papers in anything public.
- None of these studies tested glasses or help in the middle of a conversation. Nudge's benefit is untested until our pilot.
- We position Nudge as communication support, not treatment, until there's clinical data (see `docs/DEVPOST.md` → Honest limitations: not clinically validated, not a medical device).

## References

1. Brady MC, Kelly H, Godwin J, Enderby P, Campbell P. Speech and language therapy for aphasia following stroke. *Cochrane Database Syst Rev* 2016;(6):CD000425. https://www.cochrane.org/CD000425
2. The RELEASE Collaborators. Dosage, intensity, and frequency of language therapy for aphasia: a systematic review–based, individual participant data network meta-analysis. *Stroke* 2022;53(3). doi:10.1161/STROKEAHA.121.035216
3. Breitenstein C, et al. Intensive speech and language therapy in patients with chronic aphasia after stroke (FCET2EC). *Lancet* 2017;389(10078):1528–1538. https://clinicaltrials.gov/study/NCT01540383
4. Cavanaugh R, et al. Is there a research–practice dosage gap in aphasia rehabilitation? *Am J Speech Lang Pathol* 2021;30(5):2115–2129. https://pmc.ncbi.nlm.nih.gov/articles/PMC8702848
5. Palmer R, et al. Computerised speech and language therapy or attention control added to usual care for people with long-term post-stroke aphasia: the Big CACTUS three-arm RCT. *Health Technol Assess* 2020;24(19):1–176. https://pmc.ncbi.nlm.nih.gov/articles/PMC7232133
6. Wisenburn B, Mahoney K. A meta-analysis of word-finding treatments for aphasia. *Aphasiology* 2009. Effect sizes as reported in Kendall et al. 2015: https://aphasialab.cci.fsu.edu/files/2018/08/Kendall-et-al_2015_phonomotor-n-of-26.pdf
7. Kendall DL, Moldestad MO, Allen W, Torrence J, Nadeau SE. Phonomotor versus semantic feature analysis treatment for anomia in 58 persons with aphasia: a randomized controlled trial. *J Speech Lang Hear Res* 2019;62(12):4464–4482. https://pubs.asha.org/doi/10.1044/2019_JSLHR-L-18-0257
8. Quique YM, Evans WS, Dickey MW. Acquisition and generalization responses in aphasia naming treatment: a meta-analysis of semantic feature analysis outcomes. *Am J Speech Lang Pathol* 2019. https://apps.asha.org/EvidenceMaps/Articles/ArticleSummary/68f09949-63e1-4827-af5b-f808453c410c
9. Middleton EL, Schwartz MF, Rawson KA, Traut H, Verkuilen J. Towards a theory of learning for naming rehabilitation: retrieval practice and spacing effects. *J Speech Lang Hear Res* 2016;59(5):1111–1122. https://pmc.ncbi.nlm.nih.gov/articles/PMC5345556
10. Fillingham JK, Hodgson C, Sage K, Lambon Ralph MA. The application of errorless learning to aphasic disorders: a review of theory and practice. *Neuropsychol Rehabil* 2003 (and follow-up studies 2005–2006). https://research.manchester.ac.uk/en/publications/the-application-of-errorless-learning-to-aphasic-disorders-a-revi/
11. Howard D, Harding D. Self-cueing of word retrieval by a woman with aphasia: why a letter board works. *Aphasiology* 1998. https://researchers.mq.edu.au/en/publications/self-cueing-of-word-retrieval-by-a-woman-with-aphasia-why-a-lette/
12. Bruce C, Howard D. Why don't Broca's aphasics cue themselves? An investigation of phonemic cueing and tip-of-the-tongue information. 1988. https://researchers.mq.edu.au/en/publications/why-dont-brocas-aphasics-cue-themselves-an-investigation-of-phone/
13. Nardo D, Holland R, Leff AP, Price CJ, Crinion JT. Less is more: neural mechanisms underlying anomia treatment in chronic aphasic patients. *Brain* 2017. https://discovery.ucl.ac.uk/id/eprint/1568048/
14. Badalova A, Stott J, Leff AP. Proper name anomia in people with Alzheimer's disease: implications for diagnosis and treatment — a systematic review. *npj Dementia* 2026;2:11. https://pmc.ncbi.nlm.nih.gov/articles/PMC12864043/
15. Cadorio I, et al. Generalisation and maintenance of treatment gains in primary progressive aphasia (PPA): a systematic review. 2017. Summarised via https://www.frontiersin.org/10.3389%2fconf.fnhum.2019.01.00034/event_abstract
