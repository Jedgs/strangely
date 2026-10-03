# Safety decisions before public launch

This document identifies decisions the software cannot settle. The included Terms, Privacy, Guidelines, Safety copy, consent version, and default retention are development drafts. The operator must replace them with accurate, reviewed notices for the actual service before public launch. No legal/compliance approval or moderation operation has been established by building this repository.

## Age assurance and service scope

- Decide operating entity, countries served, and the requirements applicable to those jurisdictions with qualified advisers. Decide whether self-declaration is sufficient anywhere the service will operate.
- The MVP checkbox confirms a statement; it does **not** verify age or guarantee adult participants. Face presence does not verify age either.
- Use the age-assurance provider boundary for a stronger provider. Keep provider credentials server-only; define verification result expiry, challenge/replay protection, accessibility alternatives, data minimization, and failure handling before integration.
- Decide whether and how suspected minors are removed, escalated, and supported. A public service must have a real procedure, not only a report category.

## Moderation operation

- Define prohibited behavior clearly, moderator staffing/hours, response targets, authorized access to reports, contact channels, and appeals.
- Decide handling and escalation of suspected illegal content, imminent harm, exploitation, and repeat abuse for the actual jurisdictions. Obtain a reviewed operational procedure rather than inventing a technical promise.
- Reports are user allegations without stored video/audio evidence. Review accordingly. One unverified report must not cause a permanent automatic ban.
- Keep moderator/admin access separate from anonymous participant interfaces, with authentication, least privilege, audit trails, and escalation authority before adding a console.
- Describe blocks honestly: they exclude the current anonymous sessions while retained state exists. New cookies, devices, or networks can bypass anonymous enforcement. Network-based bans can affect innocent people behind the same NAT; decide whether that tradeoff is acceptable.

## Privacy and network identity

- Decide whether direct P2P exposure of network addresses is acceptable. `ICE_TRANSPORT_POLICY=all` permits direct routes; `relay` routes all media through TURN, reducing peer IP exposure and increasing relay cost.
- Calls are not recorded by the application. A participant can record externally. Do not promise that recording is impossible.
- Define which infrastructure providers see IP addresses and connection metadata, and include them in the deployed notice. Review proxy, hosting, TURN, PostgreSQL and Redis logs; application data minimization does not automatically configure provider logging.
- Session/network HMACs are pseudonymous references, potentially linkable while the secret and source information remain available. They are not guaranteed anonymous information.
- Define report/ban retention, backup retention, deletion requests, access controls, breach response, log retention, and jurisdictional storage requirements. The development default is a configurable 30-day expiry for newly created reports, with an explicit retention command. It is not a completed retention policy.
- Describe consent scope, version changes, cookie lifetime, and how users reach policy/contact pages from the live chat.

## Face-presence limitations

The browser only checks whether a face appears present. Frames are processed locally and are not persisted or uploaded by this feature. Poor lighting, movement, slower devices, model errors, and false negatives can trigger warnings. Detection can be bypassed by a modified client and does not identify, recognize, verify, or classify a person's age. Decide appropriate timing, device support, accessibility accommodation, and recovery copy through real-device testing.

## Draft notice requirements

The final notices should state the service operator and contact, 18+ restriction and self-declaration limits, prohibited conduct, reporting/blocking limitations, what is collected and why, where it is stored, expiry and backup policies, network-address exposure, external recording risk, local face processing, provider involvement, and meaningful choices available to users. Present understandable wording before camera use; do not put technical implementation details in the main user flow.

## Launch sign-off record

Record each decision with an owner, dated approval, and link to the final policy/procedure. Keep this table unresolved until those decisions actually exist.

| Decision                                               | Owner/approval          | Status           |
| ------------------------------------------------------ | ----------------------- | ---------------- |
| Operating jurisdictions and age-assurance standard     | Operator/legal reviewer | NOT YET VERIFIED |
| Reviewed Terms, Privacy, Guidelines and Safety notices | Operator/legal reviewer | NOT YET VERIFIED |
| Moderator access, staffing, escalation and appeals     | Safety lead             | NOT YET VERIFIED |
| Report/ban/log/backup retention and deletion procedure | Operator/privacy lead   | NOT YET VERIFIED |
| Direct P2P versus relay-only privacy policy            | Product/operator        | NOT YET VERIFIED |
| Infrastructure providers and TURN bandwidth budget     | Operator                | NOT YET VERIFIED |
| Browser/device support and face-check accommodations   | Product/QA              | NOT YET VERIFIED |
| Security review and real two-peer/TURN verification    | Engineering/QA          | NOT YET VERIFIED |

These are launch blockers for a public service. They do not prevent local development, isolated testing, or preparing reviewable deployment artifacts.
