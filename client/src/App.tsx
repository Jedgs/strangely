import { useState } from 'react';
import { ConsentDialog } from './components/ConsentDialog';
import { LegalDialog, type LegalDocument } from './components/LegalDialog';
import { LandingPage } from './pages/LandingPage';
import { useConversation } from './features/video-chat/useConversation';
import { ChatRoom } from './pages/ChatRoom';

export default function App() {
  const [legal, setLegal] = useState<LegalDocument | null>(null);
  const [starting, setStarting] = useState(
    () => new URLSearchParams(window.location.search).get('ageReturn') === '1',
  );
  const [inRoom, setInRoom] = useState(false);
  const conversation = useConversation();
  async function acceptConsent() {
    await conversation.acceptConsent();
    setStarting(false);
    setInRoom(true);
  }
  async function leaveRoom() {
    await conversation.leave();
    setInRoom(false);
  }
  return (
    <>
      {inRoom ? (
        <ChatRoom
          conversation={conversation}
          onLeave={leaveRoom}
          onLegal={setLegal}
          legalOpen={Boolean(legal)}
        />
      ) : (
        <LandingPage onStart={() => setStarting(true)} onLegal={setLegal} />
      )}
      {starting && (
        <ConsentDialog
          onAccept={acceptConsent}
          onClose={() => setStarting(false)}
          onLegal={setLegal}
        />
      )}
      {legal && <LegalDialog document={legal} onClose={() => setLegal(null)} />}
    </>
  );
}
