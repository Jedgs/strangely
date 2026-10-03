import { Dialog } from './Dialog';

export type LegalDocument = 'privacy' | 'terms' | 'guidelines';

const documents: Record<
  LegalDocument,
  { title: string; sections: { heading: string; text: string }[] }
> = {
  privacy: {
    title: 'Privacy, in plain language.',
    sections: [
      {
        heading: 'Your camera stays yours',
        text: 'Strangely does not record or store your video, audio, camera frames, or face data. Face presence, when supported by your browser, is checked on your own device. It does not identify you or verify your age.',
      },
      {
        heading: 'An anonymous session',
        text: 'You do not need an account. A temporary session identifies your browser for matching and safety controls. Reports and temporary blocks use session identifiers and moderation metadata, not recordings. A technical session is not a guarantee of complete anonymity.',
      },
      {
        heading: 'Safety logs and access checks',
        text: 'The operator dashboard can review active session references, technical security events, reports and temporary restrictions. Network references are keyed digests; logs do not contain raw IP addresses, passwords, tokens or media. Security events expire after 14 days by default; reports after 30 days. Approximate country may appear only when a trusted edge supplies it; precise location is not collected. Configured provider age checks supply an 18+ decision, not ID images, to Strangely. These controls cannot guarantee detection of every minor or abusive person.',
      },
      {
        heading: 'A direct connection',
        text: 'Video and audio are sent using WebRTC. Direct connections can expose your IP address to the other participant. A relay may be used when configured. Another person can record or capture your conversation outside this service, so keep identifying or sensitive information to yourself.',
      },
      {
        heading: 'Before a public launch',
        text: 'This is a draft notice for the development version. The service operator must publish its identity, contact details, lawful processing purposes, data retention periods, providers, and privacy-rights procedures before public use.',
      },
    ],
  },
  terms: {
    title: 'A few things to agree on.',
    sections: [
      {
        heading: 'Adults only',
        text: 'You must be at least 18 years old to use Strangely. Checking a box is a self-declaration, not verified age assurance. Do not use the service if you are under 18.',
      },
      {
        heading: 'You are in control',
        text: 'You may leave any conversation or skip a participant at any time. Your camera and microphone remain on during a conversation; End leaves the room and turns them off. You are responsible for what you share. No conversation, connection quality, or moderation response is guaranteed.',
      },
      {
        heading: 'Respect the people you meet',
        text: 'Follow the Community Guidelines. Do not use the service for illegal activity, harassment, exploitation, sexual content, threats, or spam. Do not record or distribute another person’s content without their permission.',
      },
      {
        heading: 'Development version',
        text: 'These terms are a draft for local development. Operator identity, jurisdiction, enforceable contractual terms, reporting contacts, and dispute procedures require review before a public launch. The current version is not a staffed moderation service.',
      },
    ],
  },
  guidelines: {
    title: 'Make room for respect.',
    sections: [
      {
        heading: 'Be kind. Be present.',
        text: 'Treat the person on the other side like a person. Listen, respect their boundaries, and keep the conversation appropriate. Keep your face in view where face-presence checks are available.',
      },
      {
        heading: 'What is not welcome',
        text: 'No nudity or sexual content, harassment, hate, threats, graphic violence, exploitation, impersonation, illegal activity, spam, or unsolicited advertising. Never involve a minor.',
      },
      {
        heading: 'Protect personal information',
        text: 'Keep addresses, payment details, passwords, and other identifying information to yourself. Do not pressure another person to share private information or move to a different platform.',
      },
      {
        heading: 'Leave, report, or block',
        text: 'If a conversation makes you uncomfortable, stop it. Use Report to submit a reason and Block to avoid the same anonymous session. Blocking cannot identify a person across new sessions. Reports are stored for review; this development version does not have a staffed review team.',
      },
    ],
  },
};

export function LegalDialog({
  document,
  onClose,
}: {
  document: LegalDocument;
  onClose: () => void;
}) {
  const content = documents[document];
  return (
    <Dialog
      title={content.title}
      eyebrow="Strangely · draft policy"
      onClose={onClose}
      className="legal-dialog"
      intro={<p>Please read this before using the development version.</p>}
    >
      <div className="legal-content">
        {content.sections.map((section) => (
          <section key={section.heading}>
            <h3>{section.heading}</h3>
            <p>{section.text}</p>
          </section>
        ))}
      </div>
      <button className="button button-primary" type="button" onClick={onClose}>
        Back to Strangely
      </button>
    </Dialog>
  );
}
