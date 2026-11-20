import { Composition, Still } from "remotion";
import { AttestDemo, TOTAL } from "./AttestDemo";
import { SocialCard } from "./SocialCard";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition id="AttestDemo" component={AttestDemo} durationInFrames={TOTAL} fps={30} width={1920} height={1080} />
      <Still id="SocialCard" component={SocialCard} width={1200} height={630} />
    </>
  );
};
